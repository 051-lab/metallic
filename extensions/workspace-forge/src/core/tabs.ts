import type { SavedTab } from "./models";
import { createId, normalizeComparableUrl, type IdFactory } from "./state";

export function savedTabFromChrome(
  tab: chrome.tabs.Tab,
  now = Date.now(),
  idFactory: IdFactory = createId
): SavedTab | null {
  const url = tab.url?.trim();
  if (!url) return null;
  return {
    id: idFactory("tab"),
    url,
    title: tab.title?.trim() || url,
    favIconUrl: tab.favIconUrl || "",
    pinned: Boolean(tab.pinned),
    group: "General",
    savedAt: now
  };
}

export function savedTabsFromChrome(
  tabs: chrome.tabs.Tab[],
  now = Date.now(),
  idFactory: IdFactory = createId
): SavedTab[] {
  return tabs
    .map((tab) => savedTabFromChrome(tab, now, idFactory))
    .filter((tab): tab is SavedTab => Boolean(tab));
}

export function matchingOpenTabIds(
  savedTabs: SavedTab[],
  openTabs: chrome.tabs.Tab[]
): number[] {
  const savedUrls = new Set(savedTabs.map((tab) => normalizeComparableUrl(tab.url)));
  return openTabs
    .filter((tab) => typeof tab.id === "number" && tab.url && savedUrls.has(normalizeComparableUrl(tab.url)))
    .map((tab) => tab.id as number);
}
