/**
 * Sync-storage preferences, shared by the content script, popup, and options page.
 */

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface FrameMeterPrefs {
  enabled: boolean;
  corner: Corner;
  showFrameTime: boolean;
  colorCoding: boolean;
  disabledSites: string[];
}

export const DEFAULT_PREFERENCES: FrameMeterPrefs = {
  enabled: true,
  corner: "top-right",
  showFrameTime: false,
  colorCoding: true,
  disabledSites: []
};

export async function loadPreferences(): Promise<FrameMeterPrefs> {
  return chrome.storage.sync.get(DEFAULT_PREFERENCES) as Promise<FrameMeterPrefs>;
}

/** True when a URL matches any entry in the disabled-sites list. */
export function isSiteDisabled(url: string, disabledSites: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  return disabledSites.some((entry) => {
    const trimmed = entry.trim().toLowerCase();
    if (!trimmed) return false;
    return host === trimmed || host.endsWith(`.${trimmed}`);
  });
}
