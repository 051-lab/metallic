import { DEFAULT_PREFERENCES, loadPreferences, type Corner, type FrameMeterPrefs } from "../core/preferences";
import { MessageType } from "../core/messaging";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function readForm(disabledSites: string[]): FrameMeterPrefs {
  return {
    enabled: ($("#enabled") as HTMLInputElement).checked,
    corner: ($("#corner") as HTMLSelectElement).value as Corner,
    showFrameTime: ($("#showFrameTime") as HTMLInputElement).checked,
    colorCoding: ($("#colorCoding") as HTMLInputElement).checked,
    disabledSites
  };
}

function writeForm(prefs: FrameMeterPrefs): void {
  ($("#enabled") as HTMLInputElement).checked = prefs.enabled;
  ($("#corner") as HTMLSelectElement).value = prefs.corner;
  ($("#showFrameTime") as HTMLInputElement).checked = prefs.showFrameTime;
  ($("#colorCoding") as HTMLInputElement).checked = prefs.colorCoding;
}

async function notifyActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab.id !== "number") return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: MessageType.UPDATE_PREFS });
  } catch {
    // Tab may not have the content script yet; ignore.
  }
}

function setStatus(message: string): void {
  $("#status").textContent = message;
  window.setTimeout(() => {
    if ($("#status").textContent === message) $("#status").textContent = "";
  }, 2200);
}

document.addEventListener("DOMContentLoaded", async () => {
  writeForm(await loadPreferences());

  for (const selector of ["#enabled", "#corner", "#showFrameTime", "#colorCoding"]) {
    $(selector).addEventListener("change", async () => {
      // Preserve disabledSites from storage (popup doesn't edit it).
      const stored = await chrome.storage.sync.get(DEFAULT_PREFERENCES);
      const prefs = readForm(stored.disabledSites ?? []);
      await chrome.storage.sync.set(prefs);
      await notifyActiveTab();
      setStatus("Saved.");
    });
  }

  $("#settingsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());
});
