/**
 * Sync-storage preferences, with the same defaults applied by the options page
 * and read by the content script and popup.
 */

export type ExportFormat = "markdown" | "plain" | "srt" | "vtt";
export type LauncherPosition = "bottom-right" | "bottom-left";

export interface TubePreferences {
  launcherEnabled: boolean;
  launcherPosition: LauncherPosition;
  filenameTemplate: string;
  includeTimestamps: boolean;
  defaultFormat: ExportFormat;
  preferredLanguage: string;
}

export const DEFAULT_PREFERENCES: TubePreferences = {
  launcherEnabled: true,
  launcherPosition: "bottom-right",
  filenameTemplate: "{title}-{date}",
  includeTimestamps: true,
  defaultFormat: "markdown",
  preferredLanguage: ""
};

export async function loadPreferences(): Promise<TubePreferences> {
  return chrome.storage.sync.get(DEFAULT_PREFERENCES) as Promise<TubePreferences>;
}

/** Applies a filename template, substituting {title}, {author}, {date}, and {videoId}. */
export function renderFilenameTemplate(template: string, values: { title: string; author: string; date: string; videoId: string }): string {
  return template
    .replaceAll("{title}", values.title)
    .replaceAll("{author}", values.author)
    .replaceAll("{date}", values.date)
    .replaceAll("{videoId}", values.videoId)
    .trim();
}
