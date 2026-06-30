import { PLATFORMS, platformForUrl } from "../core/platforms";
import type { ArchiveListItem } from "../core/types";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function canCaptureUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function loadStatus(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const platform = tab?.url ? platformForUrl(tab.url) : undefined;
  const canCapture = canCaptureUrl(tab?.url);
  const button = $("#alwaysEnableButton") as HTMLButtonElement;
  const captureButton = $("#captureButton") as HTMLButtonElement;
  let origin: string | undefined;
  try {
    origin = tab?.url ? new URL(tab.url).origin : undefined;
  } catch {
    origin = undefined;
  }
  const canPersist = origin?.startsWith("http");
  const hasAccess = canPersist
    ? await chrome.permissions.contains({ origins: [`${origin}/*`] })
    : false;
  $("#siteName").textContent = platform?.name || (origin ? new URL(origin).hostname : "Unsupported site");
  $("#siteStatus").textContent = !canCapture
    ? "Chrome blocks extensions from reading this kind of page. Open the chat in a normal https:// tab."
    : platform
    ? "Ready when this platform is enabled."
    : hasAccess
      ? "Persistent launcher access is enabled for this origin."
      : "Use one-time capture or enable the launcher for this origin.";
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

async function loadArchive(): Promise<void> {
  const response = await chrome.runtime.sendMessage({
    type: "ARCHIVE_LIST",
    query: ($("#searchInput") as HTMLInputElement).value,
    platformId: ($("#platformFilter") as HTMLSelectElement).value
  });
  const list = $("#archiveList");
  list.replaceChildren();
  for (const item of response.items as ArchiveListItem[]) {
    const button = document.createElement("button");
    button.className = "archive-item";
    button.innerHTML = `<span><strong></strong><small></small></span><em></em>`;
    button.querySelector("strong")!.textContent = item.title;
    button.querySelector("small")!.textContent =
      new Date(item.capturedAt).toLocaleString();
    button.querySelector("em")!.textContent = item.platformName;
    button.addEventListener("click", () =>
      chrome.tabs.create({ url: chrome.runtime.getURL(`archive.html?id=${item.id}`) })
    );
    list.append(button);
  }
  if (!list.childElementCount) list.textContent = "No archived conversations.";
}

document.addEventListener("DOMContentLoaded", async () => {
  const filter = $("#platformFilter") as HTMLSelectElement;
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
