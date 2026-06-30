import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  type ExportFormat,
  type LauncherPosition,
  type TubePreferences
} from "../core/preferences";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function readForm(): TubePreferences {
  return {
    launcherEnabled: ($("#launcherEnabled") as HTMLInputElement).checked,
    launcherPosition: ($("#launcherPosition") as HTMLSelectElement).value as LauncherPosition,
    filenameTemplate: ($("#filenameTemplate") as HTMLInputElement).value.trim() || DEFAULT_PREFERENCES.filenameTemplate,
    includeTimestamps: ($("#includeTimestamps") as HTMLInputElement).checked,
    defaultFormat: ($("#defaultFormat") as HTMLSelectElement).value as ExportFormat,
    preferredLanguage: ($("#preferredLanguage") as HTMLInputElement).value.trim()
  };
}

function writeForm(preferences: TubePreferences): void {
  ($("#launcherEnabled") as HTMLInputElement).checked = preferences.launcherEnabled;
  ($("#launcherPosition") as HTMLSelectElement).value = preferences.launcherPosition;
  ($("#filenameTemplate") as HTMLInputElement).value = preferences.filenameTemplate;
  ($("#includeTimestamps") as HTMLInputElement).checked = preferences.includeTimestamps;
  ($("#defaultFormat") as HTMLSelectElement).value = preferences.defaultFormat;
  ($("#preferredLanguage") as HTMLInputElement).value = preferences.preferredLanguage;
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
    await chrome.runtime.sendMessage({ type: "RECONCILE_SCRIPTS" });
    setStatus("Saved.");
  });

  $("#resetButton").addEventListener("click", async () => {
    writeForm(DEFAULT_PREFERENCES);
    await chrome.storage.sync.set(DEFAULT_PREFERENCES);
    setStatus("Defaults restored.");
  });
});
