const PERPLEXITY_HOST = "www.perplexity.ai";
const NEW_TAB_TTL_MS = 10000;
const newTabIds = new Set();
const newTabCreatedAt = new Map();
const previousUrls = new Map();

function isPerplexityUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === PERPLEXITY_HOST;
  } catch {
    return false;
  }
}

function isNewTabUrl(url = "") {
  return url.startsWith("chrome://newtab") ||
    url.startsWith("chrome://new-tab-page") ||
    url.startsWith(chrome.runtime.getURL("newtab.html"));
}

function rememberNewTab(tabId) {
  newTabIds.add(tabId);
  newTabCreatedAt.set(tabId, Date.now());
}

function forgetTab(tabId) {
  newTabIds.delete(tabId);
  newTabCreatedAt.delete(tabId);
  previousUrls.delete(tabId);
}

function isRecentlyCreatedTab(tabId) {
  const createdAt = newTabCreatedAt.get(tabId);
  if (!createdAt) return false;

  if (Date.now() - createdAt > NEW_TAB_TTL_MS) {
    forgetTab(tabId);
    return false;
  }

  return true;
}

async function getConfiguredDestination() {
  const settings = await chrome.storage.sync.get({
    mode: "dashboard",
    customUrl: ""
  });

  if (settings.mode === "custom") {
    try {
      const parsed = new URL(settings.customUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch {
      // Fall through to the built-in dashboard.
    }
  }

  return chrome.runtime.getURL("newtab.html");
}

async function redirectTab(tabId) {
  const destination = await getConfiguredDestination();
  forgetTab(tabId);

  try {
    await chrome.tabs.update(tabId, { url: destination });
  } catch (error) {
    console.warn("comet-ntp could not redirect tab", tabId, error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    ["userName", "defaultEngine", "quickLinks", "mode", "background"],
    (stored) => {
      const defaults = {};

      if (!stored.userName) defaults.userName = "friend";
      if (!stored.defaultEngine) defaults.defaultEngine = "google";
      if (!stored.mode) defaults.mode = "dashboard";
      if (!stored.background) defaults.background = { type: "default" };
      if (!stored.quickLinks) {
        defaults.quickLinks = [
          { label: "GitHub", url: "https://github.com/" },
          { label: "Google", url: "https://www.google.com/" },
          { label: "YouTube", url: "https://www.youtube.com/" },
          { label: "Perplexity", url: "https://www.perplexity.ai/search" },
          { label: "X / Twitter", url: "https://x.com/" }
        ];
      }

      if (Object.keys(defaults).length > 0) {
        chrome.storage.sync.set(defaults);
      }
    }
  );
});

chrome.tabs.onCreated.addListener((tab) => {
  rememberNewTab(tab.id);
  previousUrls.set(tab.id, tab.pendingUrl || tab.url || "");
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const nextUrl = changeInfo.pendingUrl || changeInfo.url;
  if (!nextUrl) return;

  const priorUrl = previousUrls.get(tabId) || tab.url || "";
  if (isNewTabUrl(nextUrl) || isNewTabUrl(priorUrl)) {
    rememberNewTab(tabId);
  }

  previousUrls.set(tabId, nextUrl);
});

chrome.tabs.onRemoved.addListener(forgetTab);

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const priorUrl = previousUrls.get(details.tabId) || "";
  const trackedNewTab = newTabIds.has(details.tabId) &&
    isRecentlyCreatedTab(details.tabId);
  const cameFromNewTab = isNewTabUrl(priorUrl);
  const expectedTransition =
    details.transitionType === "auto_toplevel" ||
    details.transitionType === "typed";

  previousUrls.set(details.tabId, details.url);

  if (isPerplexityUrl(details.url) &&
      ((trackedNewTab && expectedTransition) || cameFromNewTab)) {
    await redirectTab(details.tabId);
    return;
  }

  if (details.url.startsWith(chrome.runtime.getURL("newtab.html"))) {
    forgetTab(details.tabId);
  } else if (!isNewTabUrl(details.url) && !isPerplexityUrl(details.url)) {
    forgetTab(details.tabId);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await redirectTab(tab.id);
});
