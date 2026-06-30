"use strict";
(() => {
  // src/core/platforms.ts
  var PLATFORMS = [
    {
      id: "gemini",
      name: "Gemini",
      origins: ["https://gemini.google.com/*"],
      matches: ["https://gemini.google.com/*"]
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      origins: ["https://chatgpt.com/*"],
      matches: ["https://chatgpt.com/*"]
    },
    {
      id: "claude",
      name: "Claude",
      origins: ["https://claude.ai/*"],
      matches: ["https://claude.ai/*"]
    },
    {
      id: "qwen",
      name: "Qwen",
      origins: ["https://chat.qwen.ai/*"],
      matches: ["https://chat.qwen.ai/*"]
    },
    {
      id: "google-ai-mode",
      name: "Google AI Mode",
      origins: ["https://www.google.com/*", "https://google.com/*"],
      matches: ["https://www.google.com/*", "https://google.com/*"]
    }
  ];
  function platformForUrl(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return void 0;
    }
    return PLATFORMS.find(
      (platform) => platform.origins.some((origin) => url.href.startsWith(origin.replace("*", "")))
    );
  }

  // src/entries/popup.ts
  var $ = (selector) => document.querySelector(selector);
  function canCaptureUrl(value) {
    if (!value) return false;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }
  async function loadStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const platform = tab?.url ? platformForUrl(tab.url) : void 0;
    const canCapture = canCaptureUrl(tab?.url);
    const button = $("#alwaysEnableButton");
    const captureButton = $("#captureButton");
    let origin;
    try {
      origin = tab?.url ? new URL(tab.url).origin : void 0;
    } catch {
      origin = void 0;
    }
    const canPersist = origin?.startsWith("http");
    const hasAccess = canPersist ? await chrome.permissions.contains({ origins: [`${origin}/*`] }) : false;
    $("#siteName").textContent = platform?.name || (origin ? new URL(origin).hostname : "Unsupported site");
    $("#siteStatus").textContent = !canCapture ? "Chrome blocks extensions from reading this kind of page. Open the chat in a normal https:// tab." : platform ? "Ready when this platform is enabled." : hasAccess ? "Persistent launcher access is enabled for this origin." : "Use one-time capture or enable the launcher for this origin.";
    captureButton.disabled = !canCapture;
    captureButton.textContent = platform ? "Open utilities" : "Capture this page once";
    button.hidden = !canPersist || hasAccess;
    button.onclick = async () => {
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!granted) {
        $("#siteStatus").textContent = "Site access was not granted.";
        return;
      }
      const result = await chrome.runtime.sendMessage({ type: "ENABLE_SITE", origin });
      if (result.ok) await loadStatus();
      else $("#siteStatus").textContent = result.error;
    };
  }
  async function loadArchive() {
    const response = await chrome.runtime.sendMessage({
      type: "ARCHIVE_LIST",
      query: $("#searchInput").value,
      platformId: $("#platformFilter").value
    });
    const list = $("#archiveList");
    list.replaceChildren();
    for (const item of response.items) {
      const button = document.createElement("button");
      button.className = "archive-item";
      button.innerHTML = `<span><strong></strong><small></small></span><em></em>`;
      button.querySelector("strong").textContent = item.title;
      button.querySelector("small").textContent = new Date(item.capturedAt).toLocaleString();
      button.querySelector("em").textContent = item.platformName;
      button.addEventListener(
        "click",
        () => chrome.tabs.create({ url: chrome.runtime.getURL(`archive.html?id=${item.id}`) })
      );
      list.append(button);
    }
    if (!list.childElementCount) list.textContent = "No archived conversations.";
  }
  document.addEventListener("DOMContentLoaded", async () => {
    const filter = $("#platformFilter");
    for (const platform of PLATFORMS) {
      filter.add(new Option(platform.name, platform.id));
    }
    $("#captureButton").addEventListener("click", async () => {
      const result = await chrome.runtime.sendMessage({ type: "START_CAPTURE" });
      if (result.ok) window.close();
      else $("#siteStatus").textContent = result.error;
    });
    $("#settingsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());
    $("#searchInput").addEventListener("input", loadArchive);
    filter.addEventListener("change", loadArchive);
    await Promise.all([loadStatus(), loadArchive()]);
  });
})();
//# sourceMappingURL=popup.js.map
