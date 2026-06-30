import {
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  saveSnapshot
} from "../core/archive-db";
import { isWatchUrl, reconcileContentScripts } from "../core/permissions";
import type { TranscriptSnapshot } from "../core/types";

async function syncContentScripts(): Promise<void> {
  await reconcileContentScripts(chrome.scripting);
}

chrome.runtime.onInstalled.addListener(syncContentScripts);
chrome.runtime.onStartup.addListener(syncContentScripts);
chrome.permissions.onAdded.addListener(syncContentScripts);
chrome.permissions.onRemoved.addListener(syncContentScripts);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handle = async () => {
    switch (message.type) {
      case "RECONCILE_SCRIPTS":
        await syncContentScripts();
        return { ok: true };
      case "ARCHIVE_SAVE":
        return { ok: true, id: await saveSnapshot(message.snapshot as TranscriptSnapshot) };
      case "ARCHIVE_LIST":
        return { ok: true, items: await listSnapshots(message.query || "") };
      case "ARCHIVE_GET":
        return { ok: true, snapshot: await getSnapshot(message.id) };
      case "ARCHIVE_DELETE":
        await deleteSnapshot(message.id);
        return { ok: true };
      case "START_CAPTURE": {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url) return { ok: false, error: "No active web page." };
        const watch = isWatchUrl(tab.url);
        try {
          await chrome.tabs.sendMessage(tab.id, { type: "PING" });
        } catch {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dist/content.js"] });
        }
        await chrome.tabs.sendMessage(tab.id, { type: "SHOW_OVERLAY" });
        return { ok: true, watch };
      }
      default:
        return { ok: false, error: "Unknown request." };
    }
  };
  handle().then(sendResponse).catch((error) =>
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
  );
  return true;
});
