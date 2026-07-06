import { MessageType } from "../core/messaging";

// Re-inject the content script into all open tabs after install or pref changes,
// so users don't need to reload every tab to see the badge.
async function reinjectAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (typeof tab.id !== "number" || !tab.url) continue;
    if (!/^https?:/.test(tab.url)) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: MessageType.PING });
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["dist/content.js"]
        });
      } catch {
        // Tab may be in a state that rejects injection (chrome://, devtools, etc.).
      }
    }
  }
}

chrome.runtime.onInstalled.addListener(reinjectAllTabs);
chrome.runtime.onStartup.addListener(reinjectAllTabs);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MessageType.RECONCILE_SCRIPTS) {
    reinjectAllTabs()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message.type === MessageType.PING) {
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
