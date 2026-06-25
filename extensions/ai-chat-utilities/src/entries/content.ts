import { resolveAdapter } from "../adapters/registry";
import { genericAdapter } from "../adapters/generic";
import { createProfileAdapter } from "../adapters/profile-adapter";
import { normalizeSnapshot, toJupyter } from "../core/transform";
import { downloadText, safeFilename } from "../core/download";
import { markProfileForRepair, saveLocalProfile } from "../core/site-profiles";
import type { ConversationSnapshot } from "../core/types";
import { mountLauncher, type LauncherPosition } from "../ui/launcher";
import { showOverlay, type OverlayAction } from "../ui/overlay";
import { startCalibration } from "../ui/calibration";
import { showToast } from "../ui/toast";

declare global {
  interface Window {
    __aiChatUtilitiesLoaded?: boolean;
  }
}

if (!window.__aiChatUtilitiesLoaded) {
  window.__aiChatUtilitiesLoaded = true;
  let adapter = genericAdapter;
  let currentSnapshot: ConversationSnapshot | null = null;

  const capture = async () => {
    adapter = await resolveAdapter(location.href);
    let draft = await adapter.extract(document);
    if (adapter.id.startsWith("profile:") && draft.messages.length < 2) {
      await markProfileForRepair(adapter.id.slice("profile:".length));
      adapter = genericAdapter;
      draft = await genericAdapter.extract(document);
      draft.warnings = [
        "The saved site profile no longer matches this page. Universal detection was used; recalibrate the site to repair it.",
        ...(draft.warnings || [])
      ];
    }
    document.querySelectorAll("[data-ai-chat-selected]").forEach((element) => {
      element.removeAttribute("data-ai-chat-selected");
      element.removeAttribute("data-ai-chat-role");
    });
    currentSnapshot = draft.messages.length
      ? normalizeSnapshot(adapter, draft, location.href)
      : null;
    return currentSnapshot;
  };

  const filenameFor = async (snapshot: ConversationSnapshot, extension: string) => {
    const { filenameTemplate = "{platform}-{title}" } = await chrome.storage.sync.get({
      filenameTemplate: "{platform}-{title}"
    });
    const value = String(filenameTemplate)
      .replaceAll("{platform}", snapshot.platformName)
      .replaceAll("{title}", snapshot.title)
      .replaceAll("{date}", snapshot.capturedAt.slice(0, 10));
    return safeFilename(value, extension);
  };

  const act = async (action: OverlayAction) => {
    try {
      if (action === "picker") {
        const profile = await startCalibration();
        if (profile) {
          await saveLocalProfile(profile);
          adapter = createProfileAdapter(profile);
          showToast(`Saved a local profile for ${profile.name}.`);
          await open(false);
        }
        return;
      }
      const snapshot = currentSnapshot || await capture();
      if (!snapshot) {
        showToast("No conversation messages were detected.", "error");
        return;
      }
      if (action === "markdown") {
        downloadText(await filenameFor(snapshot, "md"), snapshot.renderedMarkdown, "text/markdown");
        showToast("Markdown download started.");
      } else if (action === "copy") {
        await navigator.clipboard.writeText(snapshot.renderedMarkdown);
        showToast("Markdown copied.");
      } else if (action === "jupyter") {
        downloadText(await filenameFor(snapshot, "ipynb"), toJupyter(snapshot), "application/x-ipynb+json");
        showToast("Jupyter download started.");
      } else if (action === "archive") {
        const response = await chrome.runtime.sendMessage({ type: "ARCHIVE_SAVE", snapshot });
        if (!response?.ok) throw new Error(response?.error || "Archive save failed.");
        showToast("Conversation saved to the local archive.");
      } else if (action === "new-chat") {
        const target = adapter.getNewChatTarget?.(document);
        if (target) location.href = target;
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The requested action failed.", "error");
    }
  };

  const open = async (allowCalibration = true) => {
    await capture();
    const detection = adapter.detect(document);
    if (allowCalibration && adapter.id === "generic" && detection.confidence < 0.55) {
      const profile = await startCalibration();
      if (profile) {
        await saveLocalProfile(profile);
        adapter = createProfileAdapter(profile);
        showToast(`Saved a local profile for ${profile.name}.`);
        await open(false);
      }
      return;
    }
    showOverlay(adapter, currentSnapshot, act, detection);
  };

  const mountConfiguredLauncher = async () => {
    const { launcherEnabled = true, launcherPosition = "bottom-right" } =
      await chrome.storage.sync.get({
        launcherEnabled: true,
        launcherPosition: "bottom-right"
      });
    document.querySelector("[data-ai-chat-launcher]")?.remove();
    if (launcherEnabled) mountLauncher(open, launcherPosition as LauncherPosition);
  };
  void resolveAdapter(location.href).then((resolved) => {
    adapter = resolved;
    return mountConfiguredLauncher();
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "SHOW_OVERLAY") {
      open().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message.type === "PING") sendResponse({ ok: true });
  });

  let lastUrl = location.href;
  const observer = new MutationObserver(async () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      adapter = await resolveAdapter(lastUrl);
      currentSnapshot = null;
      mountConfiguredLauncher();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
