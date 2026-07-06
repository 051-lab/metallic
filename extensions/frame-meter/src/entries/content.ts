import { FrameMeter } from "../core/fps";
import { isSiteDisabled, loadPreferences, type FrameMeterPrefs } from "../core/preferences";
import { MessageType } from "../core/messaging";
import { mountBadge, repositionBadge, type BadgeController } from "../ui/badge";

declare global {
  interface Window {
    __frameMeterLoaded?: boolean;
  }
}

if (!window.__frameMeterLoaded) {
  window.__frameMeterLoaded = true;

  let meter: FrameMeter | null = null;
  let badge: BadgeController | null = null;
  let rafId: number | null = null;
  let lastTimestamp = 0;
  let lastRender = 0;
  let currentPrefs: FrameMeterPrefs | null = null;

  const start = async () => {
    const prefs = await loadPreferences();
    currentPrefs = prefs;
    if (!prefs.enabled || isSiteDisabled(location.href, prefs.disabledSites)) {
      stop();
      return;
    }
    if (meter && badge) return;
    meter = new FrameMeter();
    badge = mountBadge(prefs, () => {
      // toggle is purely visual; no action needed
    });
    lastTimestamp = performance.now();
    lastRender = lastTimestamp;
    rafId = requestAnimationFrame(loop);
  };

  const stop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    badge?.remove();
    badge = null;
    meter = null;
  };

  const loop = (timestamp: number) => {
    if (!meter || !badge) return;
    const delta = lastTimestamp ? timestamp - lastTimestamp : 0;
    lastTimestamp = timestamp;
    if (delta > 0) meter.pushFrame(delta);
    // Update DOM ~2x/sec to avoid layout thrash.
    if (timestamp - lastRender >= 500) {
      lastRender = timestamp;
      badge.update(meter.getStats());
    }
    rafId = requestAnimationFrame(loop);
  };

  void start();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === MessageType.TOGGLE) {
      if (badge) stop();
      else void start();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === MessageType.UPDATE_PREFS) {
      void (async () => {
        const prefs = await loadPreferences();
        currentPrefs = prefs;
        if (!prefs.enabled || isSiteDisabled(location.href, prefs.disabledSites)) {
          stop();
        } else if (badge) {
          repositionBadge(prefs);
        } else {
          void start();
        }
        sendResponse({ ok: true });
      })();
      return true;
    }
    if (message.type === MessageType.PING) {
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  // SPA navigation: re-check site-disable rules if the URL changes.
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      void start();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
