import { DEFAULT_PREFERENCES, loadPreferences, type Corner, type FrameMeterPrefs } from "../core/preferences";
import { MessageType } from "../core/messaging";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function readForm(): FrameMeterPrefs {
  const raw = ($("#disabledSites") as HTMLTextAreaElement).value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    enabled: ($("#enabled") as HTMLInputElement).checked,
    corner: ($("#corner") as HTMLSelectElement).value as Corner,
    showFrameTime: ($("#showFrameTime") as HTMLInputElement).checked,
    colorCoding: ($("#colorCoding") as HTMLInputElement).checked,
    disabledSites: raw
  };
}

function writeForm(prefs: FrameMeterPrefs): void {
  ($("#enabled") as HTMLInputElement).checked = prefs.enabled;
  ($("#corner") as HTMLSelectElement).value = prefs.corner;
  ($("#showFrameTime") as HTMLInputElement).checked = prefs.showFrameTime;
  ($("#colorCoding") as HTMLInputElement).checked = prefs.colorCoding;
  ($("#disabledSites") as HTMLTextAreaElement).value = prefs.disabledSites.join("\n");
}

function setStatus(message: string): void {
  $("#saveStatus").textContent = message;
  window.setTimeout(() => {
    if ($("#saveStatus").textContent === message) $("#saveStatus").textContent = "";
  }, 2200);
}

document.addEventListener("DOMContentLoaded", async () => {
  writeForm(await loadPreferences());

  $("#optionsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await chrome.storage.sync.set(readForm());
    await chrome.runtime.sendMessage({ type: MessageType.RECONCILE_SCRIPTS });
    setStatus("Saved.");
  });

  $("#resetButton").addEventListener("click", async () => {
    writeForm(DEFAULT_PREFERENCES);
    await chrome.storage.sync.set(DEFAULT_PREFERENCES);
    await chrome.runtime.sendMessage({ type: MessageType.RECONCILE_SCRIPTS });
    setStatus("Defaults restored.");
  });
});
