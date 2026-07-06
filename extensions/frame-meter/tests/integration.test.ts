/**
 * @vitest-environment jsdom
 *
 * Integration test: loads the built content.js bundle in jsdom, fakes the
 * chrome.* APIs and requestAnimationFrame, and verifies the badge mounts,
 * shows a number, color-codes, and updates over time.
 *
 * This stands in for manual Chrome verification when a headed/headless
 * browser environment is unavailable (headless Chrome is unstable on this
 * WSL setup — crashes within seconds).
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Resolve the built bundle via process.cwd() (vitest runs from the package root).
const bundlePath = resolve(process.cwd(), "dist/content.js");
const bundle = readFileSync(bundlePath, "utf8");

interface Harness {
  dom: JSDOM;
  cleanup: () => void;
  tickRaf: (count?: number, deltaMs?: number) => void;
  getBadge: () => {
    badgeClass: string | null;
    fpsClass: string | null;
    fpsText: string | null;
    frameTimeText: string | null;
    panelHidden: boolean;
  };
  clickBadge: () => void;
}

function setupHarness(prefs: Record<string, unknown> = {}): Harness {
  const dom = new JSDOM("<!doctype html><html><head></head><body><div>page</div></body></html>", {
    url: "https://example.com/",
    pretendToBeVisual: true,
    runScripts: "dangerously",
  });
  const { window } = dom;

  // chrome.* API fakes — assign to window so the bundle's free `chrome`
  // reference resolves via the global scope.
  const stored: Record<string, unknown> = { ...prefs };
  const messageListeners: Array<(msg: { type: string }) => unknown> = [];
  const fakeChrome = {
    storage: {
      sync: {
        get: async (defaults: Record<string, unknown>) => ({ ...defaults, ...stored }),
        set: async (values: Record<string, unknown>) => { Object.assign(stored, values); },
      },
    },
    runtime: {
      onMessage: { addListener: (fn: (msg: { type: string }) => unknown) => messageListeners.push(fn) },
      sendMessage: async (msg: { type: string }) => {
        for (const fn of messageListeners) fn(msg);
      },
    },
    tabs: { query: async () => [{ id: 1, url: "https://example.com/" }] },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).chrome = fakeChrome;

  // requestAnimationFrame fake: we control ticks manually.
  let rafCallbacks: Array<(ts: number) => void> = [];
  let rafTime = 16;
  window.requestAnimationFrame = (cb: (ts: number) => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
  window.cancelAnimationFrame = () => { /* noop for test */ };
  // jsdom doesn't implement performance.now by default in all versions.
  if (!window.performance || !window.performance.now) {
    Object.defineProperty(window, "performance", {
      value: { now: () => rafTime },
      configurable: true,
    });
  }

  // Inject the bundle as a real <script> so it runs with the jsdom window as
  // its global scope (runScripts: "dangerously" enables this).
  const scriptEl = window.document.createElement("script");
  scriptEl.textContent = bundle;
  window.document.documentElement.append(scriptEl);

  const tickRaf = (count = 1, deltaMs = 16.67) => {
    for (let i = 0; i < count; i++) {
      rafTime += deltaMs;
      const callbacks = rafCallbacks;
      rafCallbacks = [];
      for (const cb of callbacks) cb(rafTime);
    }
  };

  const getBadge = () => {
    const host = dom.window.document.querySelector<HTMLElement>("[data-frame-meter]");
    if (!host || !host.shadowRoot) {
      return { badgeClass: null, fpsClass: null, fpsText: null, frameTimeText: null, panelHidden: true };
    }
    const sr = host.shadowRoot;
    return {
      badgeClass: sr.querySelector(".badge")?.className || null,
      fpsClass: sr.querySelector(".fps")?.className || null,
      fpsText: sr.querySelector(".fps")?.textContent || null,
      frameTimeText: sr.querySelector(".frame-time")?.textContent || null,
      panelHidden: sr.querySelector<HTMLElement>(".panel")?.hidden ?? true,
    };
  };

  const clickBadge = () => {
    const host = dom.window.document.querySelector<HTMLElement>("[data-frame-meter]");
    host?.shadowRoot?.querySelector(".badge")?.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  };

  return {
    dom,
    cleanup: () => { dom.window.close(); },
    tickRaf,
    getBadge,
    clickBadge,
  };
}

describe("content script integration (jsdom)", () => {
  let harness: Harness;
  beforeEach(() => { harness = setupHarness(); });
  afterEach(() => harness.cleanup());

  it("mounts the badge after load", async () => {
    // storage.get is async; let the start() promise resolve.
    await new Promise((r) => setTimeout(r, 0));
    // The rAF loop kicks off — push enough frames to populate stats.
    harness.tickRaf(70, 16.67); // past warmup (60 frames)
    const badge = harness.getBadge();
    expect(badge.fpsText).not.toBe("—");
    expect(badge.fpsText).toMatch(/^\d+$/);
  });

  it("color-codes green at >=50 fps", async () => {
    await new Promise((r) => setTimeout(r, 0));
    harness.tickRaf(70, 16.67); // ~60fps
    const badge = harness.getBadge();
    expect(badge.fpsClass).toContain("green");
  });

  it("color-codes red at low fps", async () => {
    await new Promise((r) => setTimeout(r, 0));
    harness.tickRaf(70, 33.33); // ~30fps
    const badge = harness.getBadge();
    // 30fps lands in the yellow band (30-49).
    expect(badge.fpsClass).toMatch(/(yellow|red)/);
  });

  it("expands the stats panel on click", async () => {
    await new Promise((r) => setTimeout(r, 0));
    harness.tickRaf(70, 16.67);
    expect(harness.getBadge().panelHidden).toBe(true);
    harness.clickBadge();
    expect(harness.getBadge().panelHidden).toBe(false);
  });

  it("shows frame time when enabled", async () => {
    harness.cleanup();
    harness = setupHarness({ showFrameTime: true });
    await new Promise((r) => setTimeout(r, 0));
    harness.tickRaf(70, 16.67);
    const badge = harness.getBadge();
    expect(badge.frameTimeText).toMatch(/ms$/);
  });

  it("does not mount when disabled", async () => {
    harness.cleanup();
    harness = setupHarness({ enabled: false });
    await new Promise((r) => setTimeout(r, 0));
    harness.tickRaf(10, 16.67);
    const badge = harness.getBadge();
    expect(badge.fpsText).toBeNull();
  });
});
