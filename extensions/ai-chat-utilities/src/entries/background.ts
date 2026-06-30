import {
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  migrateLegacyArchive,
  saveSnapshot
} from "../core/archive-db";
import { platformForUrl } from "../core/platforms";
import { reconcilePlatformScripts } from "../core/permissions";
import {
  deleteLocalProfile,
  exportProfiles,
  importLocalProfiles,
  listLocalProfiles
} from "../core/site-profiles";
import type { ConversationSnapshot } from "../core/types";

const DEFAULT_ENABLED = ["gemini"];

function injectableUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function unsupportedUrlMessage(value: string): string {
  let protocol = "this";
  try {
    protocol = new URL(value).protocol;
  } catch {
    // Keep the generic protocol label.
  }
  if (protocol === "chrome:") {
    return "Chrome blocks extensions from reading chrome:// pages. Open Google AI Mode in a normal web tab, such as https://www.google.com/ai, then try again.";
  }
  return "This page cannot be captured because Chrome does not allow extension scripts on this URL.";
}

async function enabledPlatforms(): Promise<string[]> {
  const { enabledPlatforms = DEFAULT_ENABLED } = await chrome.storage.sync.get({
    enabledPlatforms: DEFAULT_ENABLED
  });
  return enabledPlatforms;
}

async function reconcileContentScripts(): Promise<void> {
  const enabled = await enabledPlatforms();
  const { persistentOrigins = [] } = await chrome.storage.local.get({ persistentOrigins: [] });
  const granted = await chrome.permissions.getAll();
  await reconcilePlatformScripts(
    chrome.scripting,
    enabled,
    granted.origins || [],
    persistentOrigins
  );
}

chrome.runtime.onInstalled.addListener(async () => {
  const { enabledPlatforms } = await chrome.storage.sync.get("enabledPlatforms");
  if (!enabledPlatforms) await chrome.storage.sync.set({ enabledPlatforms: DEFAULT_ENABLED });
  await migrateLegacyArchive();
  await reconcileContentScripts();
});
chrome.runtime.onStartup.addListener(async () => {
  await migrateLegacyArchive();
  await reconcileContentScripts();
});
chrome.permissions.onAdded.addListener(reconcileContentScripts);
chrome.permissions.onRemoved.addListener(reconcileContentScripts);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    switch (message.type) {
      case "RECONCILE_SCRIPTS":
        await reconcileContentScripts();
        return { ok: true };
      case "ENABLE_SITE": {
        const origin = new URL(message.origin).origin;
        const pattern = `${origin}/*`;
        const granted = await chrome.permissions.contains({ origins: [pattern] });
        if (!granted) return { ok: false, error: "Site access was not granted." };
        const state = await chrome.storage.local.get({ persistentOrigins: [] });
        const persistentOrigins = [...new Set([...state.persistentOrigins, origin])];
        await chrome.storage.local.set({ persistentOrigins });
        await reconcileContentScripts();
        return { ok: true };
      }
      case "DISABLE_SITE": {
        const origin = new URL(message.origin).origin;
        await chrome.permissions.remove({ origins: [`${origin}/*`] });
        const state = await chrome.storage.local.get({ persistentOrigins: [] });
        await chrome.storage.local.set({
          persistentOrigins: state.persistentOrigins.filter((item: string) => item !== origin)
        });
        await reconcileContentScripts();
        return { ok: true };
      }
      case "PROFILE_LIST":
        return { ok: true, profiles: await listLocalProfiles() };
      case "PROFILE_DELETE":
        await deleteLocalProfile(message.id);
        return { ok: true };
      case "PROFILE_IMPORT":
        return { ok: true, count: await importLocalProfiles(message.json) };
      case "PROFILE_EXPORT":
        return { ok: true, json: exportProfiles(await listLocalProfiles()) };
      case "ARCHIVE_SAVE":
        return { ok: true, id: await saveSnapshot(message.snapshot as ConversationSnapshot) };
      case "ARCHIVE_LIST":
        return { ok: true, items: await listSnapshots(message.query, message.platformId) };
      case "ARCHIVE_GET":
        return { ok: true, snapshot: await getSnapshot(message.id) };
      case "ARCHIVE_DELETE":
        await deleteSnapshot(message.id);
        return { ok: true };
      case "START_CAPTURE": {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url) return { ok: false, error: "No active web page." };
        if (!injectableUrl(tab.url)) return { ok: false, error: unsupportedUrlMessage(tab.url) };
        const platform = platformForUrl(tab.url);
        try {
          await chrome.tabs.sendMessage(tab.id, { type: "PING" });
        } catch {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dist/content.js"] });
        }
        await chrome.tabs.sendMessage(tab.id, { type: "SHOW_OVERLAY" });
        return { ok: true, platform: platform?.name || "Generic chatbot" };
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
