/**
 * Dynamic content-script registration for Tube Utilities.
 *
 * Tube Utilities targets a single known host (youtube.com) declared as a
 * required permission in the manifest, so there is no per-platform enable
 * matrix like AI Chat Utilities. We still register the content script through
 * `chrome.scripting` (rather than a static `content_scripts` block) so the
 * service worker can reconcile it on install, startup, and permission changes,
 * and so the same `dist/content.js` is reused for both persistent injection
 * and one-time fallback injection.
 */

export interface ScriptingRegistrationApi {
  getRegisteredContentScripts(): Promise<chrome.scripting.RegisteredContentScript[]>;
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
  registerContentScripts(scripts: chrome.scripting.RegisteredContentScript[]): Promise<void>;
}

export const TUBE_CONTENT_SCRIPT_ID = "tube-content";
export const YOUTUBE_MATCHES = [
  "https://www.youtube.com/*",
  "https://youtube.com/*",
  "https://m.youtube.com/*"
];

export function desiredScripts(): chrome.scripting.RegisteredContentScript[] {
  return [{
    id: TUBE_CONTENT_SCRIPT_ID,
    matches: YOUTUBE_MATCHES,
    js: ["dist/content.js"],
    runAt: "document_idle" as const,
    persistAcrossSessions: true
  }];
}

/** Idempotently registers the Tube Utilities content script for YouTube. */
export async function reconcileContentScripts(api: ScriptingRegistrationApi): Promise<void> {
  const existing = await api.getRegisteredContentScripts();
  const managedIds = existing
    .filter((script) => script.id.startsWith("tube-"))
    .map((script) => script.id);
  if (managedIds.length) {
    await api.unregisterContentScripts({ ids: managedIds });
  }
  await api.registerContentScripts(desiredScripts());
}

/** True when a URL targets a YouTube watch page. */
export function isWatchUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^www\./, "");
  return (host === "youtube.com" || host === "m.youtube.com")
    && (url.pathname === "/watch" || url.pathname.startsWith("/watch/"));
}
