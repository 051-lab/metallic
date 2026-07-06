# frame-meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `frame-meter`, a Manifest V3 Chrome extension that displays a live FPS counter overlay on every web page, measured via `requestAnimationFrame`, with configurable corner placement, color coding, frame-time toggle, expandable session stats, and a per-site disable list.

**Architecture:** TypeScript + esbuild + MV3, matching the metallic repo's modern house style (`clipboard-forge`, `tube-utilities`). The content script is declared statically in `content_scripts` (rather than dynamically injected) so it can measure from page load. All overlay UI is rendered into a Shadow-DOM-isolated host with `:host { all: initial; }`. FPS math lives in a pure, testable module with no DOM dependencies.

**Tech Stack:** TypeScript 5, esbuild, Vitest, `@types/chrome`, Chrome MV3 APIs (`chrome.storage.sync`, `chrome.runtime`, `chrome.scripting`).

**Spec:** `docs/superpowers/specs/2026-07-05-frame-meter-design.md`

---

### Task 1: Scaffold project directory and config

**Files:**
- Create: `extensions/frame-meter/package.json`
- Create: `extensions/frame-meter/tsconfig.json`
- Create: `extensions/frame-meter/.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "frame-meter",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "watch": "node scripts/build.mjs --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "check": "npm run typecheck && npm test && npm run build",
    "package": "npm run check && node scripts/package.mjs"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/chrome": "^0.0.322",
    "esbuild": "^0.25.5",
    "fake-indexeddb": "^6.2.5",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["chrome", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
dist/
release/
node_modules/
```

- [ ] **Step 4: Commit**

```bash
git add extensions/frame-meter/package.json extensions/frame-meter/tsconfig.json extensions/frame-meter/.gitignore
git commit -m "feat(frame-meter): scaffold package config"
```

---

### Task 2: FrameMeter FPS math (TDD)

**Files:**
- Create: `extensions/frame-meter/tests/fps.test.ts`
- Create: `extensions/frame-meter/src/core/fps.ts`

- [ ] **Step 1: Write the failing test**

`extensions/frame-meter/tests/fps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FrameMeter } from "../src/core/fps";

describe("FrameMeter", () => {
  it("reports steady 60fps as ~60 average", () => {
    const meter = new FrameMeter({ now: () => 0 });
    // 60fps deltas = ~16.67ms each; push 120 frames
    for (let i = 0; i < 120; i++) meter.pushFrame(16.67);
    const stats = meter.getStats();
    expect(stats.average).toBeGreaterThan(59);
    expect(stats.average).toBeLessThan(61);
    expect(stats.current).toBeGreaterThan(59);
    expect(stats.current).toBeLessThan(61);
  });

  it("tracks min and max across a session", () => {
    const meter = new FrameMeter({ now: () => 0 });
    // warmup: 60fps for 1.2s (72 frames)
    for (let i = 0; i < 72; i++) meter.pushFrame(16.67);
    // dip to 30fps
    for (let i = 0; i < 30; i++) meter.pushFrame(33.33);
    // spike to 120fps
    for (let i = 0; i < 30; i++) meter.pushFrame(8.33);
    const stats = meter.getStats();
    expect(stats.max).toBeGreaterThan(100);
    expect(stats.min).toBeLessThan(35);
  });

  it("drops old frames from the rolling window", () => {
    const meter = new FrameMeter({ now: () => 0 });
    // push 200 frames at 60fps, then 10 frames at 30fps
    for (let i = 0; i < 200; i++) meter.pushFrame(16.67);
    for (let i = 0; i < 10; i++) meter.pushFrame(33.33);
    const stats = meter.getStats();
    // average should now be dominated by the 30fps tail (window=60)
    expect(stats.average).toBeLessThan(45);
  });

  it("excludes warmup (first 1s) from min", () => {
    const meter = new FrameMeter({ now: () => 0 });
    // first frame is a huge stall (1000ms) — should be excluded from min
    meter.pushFrame(1000);
    // steady 60fps for 2s
    for (let i = 0; i < 120; i++) meter.pushFrame(16.67);
    const stats = meter.getStats();
    expect(stats.min).toBeGreaterThan(50);
  });

  it("reset() clears all state", () => {
    const meter = new FrameMeter({ now: () => 0 });
    for (let i = 0; i < 100; i++) meter.pushFrame(16.67);
    meter.reset();
    const stats = meter.getStats();
    expect(stats.current).toBe(0);
    expect(stats.average).toBe(0);
    expect(stats.min).toBe(Infinity);
    expect(stats.max).toBe(0);
  });

  it("reports frameTimeMs as the last delta", () => {
    const meter = new FrameMeter({ now: () => 0 });
    for (let i = 0; i < 10; i++) meter.pushFrame(16.67);
    meter.pushFrame(25.5);
    expect(meter.getStats().frameTimeMs).toBeCloseTo(25.5, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extensions/frame-meter && npm install && npx vitest run tests/fps.test.ts`
Expected: FAIL — `FrameMeter` is not defined / module not found.

- [ ] **Step 3: Write the implementation**

`extensions/frame-meter/src/core/fps.ts`:

```ts
/**
 * Pure FPS measurement: consumes frame deltas and produces rolling stats.
 * No DOM dependencies — testable in isolation.
 */

export interface FpsStats {
  /** Smoothed current FPS (last ~5 frames). */
  current: number;
  /** Rolling mean FPS over the window. */
  average: number;
  /** Session minimum FPS, excluding the first 1s warmup. */
  min: number;
  /** Session maximum FPS. */
  max: number;
  /** Last frame delta in milliseconds. */
  frameTimeMs: number;
}

export interface FrameMeterOptions {
  /** Override clock for testing; defaults to performance.now. */
  now?: () => number;
  /** Rolling window size in frames; defaults to 60. */
  windowSize?: number;
  /** Warmup duration in ms excluded from min; defaults to 1000. */
  warmupMs?: number;
  /** Smoothing sample count for current FPS; defaults to 5. */
  smoothing?: number;
}

const defaults = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  windowSize: 60,
  warmupMs: 1000,
  smoothing: 5
};

export class FrameMeter {
  private readonly now: () => number;
  private readonly windowSize: number;
  private readonly warmupMs: number;
  private readonly smoothing: number;
  private frames: number[] = [];
  private recent: number[] = [];
  private minFps = Infinity;
  private maxFps = 0;
  private sessionStart: number;
  private lastDelta = 0;

  constructor(options: FrameMeterOptions = {}) {
    this.now = options.now ?? defaults.now;
    this.windowSize = options.windowSize ?? defaults.windowSize;
    this.warmupMs = options.warmupMs ?? defaults.warmupMs;
    this.smoothing = options.smoothing ?? defaults.smoothing;
    this.sessionStart = this.now();
  }

  pushFrame(deltaMs: number): void {
    this.lastDelta = deltaMs;
    this.frames.push(deltaMs);
    if (this.frames.length > this.windowSize) this.frames.shift();
    this.recent.push(deltaMs);
    if (this.recent.length > this.smoothing) this.recent.shift();

    // Skip min/max during warmup so the first long delta doesn't poison stats.
    if (this.now() - this.sessionStart < this.warmupMs) return;
    if (deltaMs <= 0) return;
    const fps = 1000 / deltaMs;
    if (fps < this.minFps) this.minFps = fps;
    if (fps > this.maxFps) this.maxFps = fps;
  }

  getStats(): FpsStats {
    const current = this.recent.length
      ? 1000 / (this.recent.reduce((sum, d) => sum + d, 0) / this.recent.length)
      : 0;
    const average = this.frames.length
      ? 1000 / (this.frames.reduce((sum, d) => sum + d, 0) / this.frames.length)
      : 0;
    return {
      current: this.recent.length ? current : 0,
      average: this.frames.length ? average : 0,
      min: this.minFps,
      max: this.maxFps,
      frameTimeMs: this.lastDelta
    };
  }

  reset(): void {
    this.frames = [];
    this.recent = [];
    this.minFps = Infinity;
    this.maxFps = 0;
    this.sessionStart = this.now();
    this.lastDelta = 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extensions/frame-meter && npx vitest run tests/fps.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add extensions/frame-meter/tests/fps.test.ts extensions/frame-meter/src/core/fps.ts
git commit -m "feat(frame-meter): add FrameMeter FPS math with tests"
```

---

### Task 3: Preferences module

**Files:**
- Create: `extensions/frame-meter/src/core/preferences.ts`

- [ ] **Step 1: Write the module**

`extensions/frame-meter/src/core/preferences.ts`:

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add extensions/frame-meter/src/core/preferences.ts
git commit -m "feat(frame-meter): add preferences module"
```

---

### Task 4: Messaging module

**Files:**
- Create: `extensions/frame-meter/src/core/messaging.ts`

- [ ] **Step 1: Write the module**

`extensions/frame-meter/src/core/messaging.ts`:

```ts
/** Shared message-type constants for content <-> background <-> popup communication. */
export const MessageType = {
  TOGGLE: "TOGGLE",
  UPDATE_PREFS: "UPDATE_PREFS",
  PING: "PING",
  RECONCILE_SCRIPTS: "RECONCILE_SCRIPTS"
} as const;

export type MessageTypeName = (typeof MessageType)[keyof typeof MessageType];
```

- [ ] **Step 2: Commit**

```bash
git add extensions/frame-meter/src/core/messaging.ts
git commit -m "feat(frame-meter): add messaging constants"
```

---

### Task 5: Badge overlay (Shadow DOM UI)

**Files:**
- Create: `extensions/frame-meter/src/ui/badge.ts`

- [ ] **Step 1: Write the module**

`extensions/frame-meter/src/ui/badge.ts`:

```ts
import type { Corner, FrameMeterPrefs } from "../core/preferences";
import type { FpsStats } from "../core/fps";

const STYLE = `
  :host { all: initial; }
  .badge {
    position: fixed;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 10px;
    background: #07090db8;
    color: #edf2f8;
    font: 600 13px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    backdrop-filter: blur(6px);
    cursor: pointer;
    user-select: none;
    box-shadow: 0 4px 14px #0006;
    transition: opacity .15s ease;
  }
  .badge:hover { opacity: .9; }
  .badge.top-left { top: 10px; left: 10px; }
  .badge.top-right { top: 10px; right: 10px; }
  .badge.bottom-left { bottom: 10px; left: 10px; }
  .badge.bottom-right { bottom: 10px; right: 10px; }
  .fps { min-width: 38px; text-align: right; }
  .frame-time { color: #98a4b5; font-size: 11px; }
  .panel {
    margin-top: 6px;
    padding: 8px 10px;
    border-radius: 10px;
    background: #111318;
    color: #c8d2df;
    font-size: 11px;
    line-height: 1.5;
    box-shadow: 0 6px 18px #000a;
  }
  .panel dl { display: grid; grid-template-columns: auto auto; gap: 2px 12px; margin: 0; }
  .panel dt { color: #98a4b5; }
  .panel dd { margin: 0; text-align: right; }
  .green { color: #5fd17a; }
  .yellow { color: #f4c57a; }
  .red { color: #ff8d8d; }
`;

function colorClass(fps: number): string {
  if (fps >= 50) return "green";
  if (fps >= 30) return "yellow";
  return "red";
}

function formatFps(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return Math.round(value).toString();
}

export interface BadgeController {
  update(stats: FpsStats): void;
  remove(): void;
}

export function mountBadge(
  prefs: FrameMeterPrefs,
  onToggle: () => void
): BadgeController {
  document.querySelector("[data-frame-meter]")?.remove();

  const host = document.createElement("div");
  host.dataset.frameMeter = "";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${STYLE}</style>
    <div class="badge ${prefs.corner}" role="status" aria-label="Frame rate">
      <span class="fps">—</span>
      ${prefs.showFrameTime ? '<span class="frame-time">0.0ms</span>' : ""}
    </div>
    <div class="panel" hidden>
      <dl>
        <dt>Average</dt><dd class="avg">—</dd>
        <dt>Min</dt><dd class="min">—</dd>
        <dt>Max</dt><dd class="max">—</dd>
        <dt>Frame</dt><dd class="ft">0.0ms</dd>
      </dl>
    </div>
  `;

  const badge = shadow.querySelector<HTMLDivElement>(".badge")!;
  const fpsEl = shadow.querySelector<HTMLSpanElement>(".fps")!;
  const ftEl = shadow.querySelector<HTMLSpanElement>(".frame-time");
  const panel = shadow.querySelector<HTMLDivElement>(".panel")!;

  badge.addEventListener("click", () => {
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    onToggle();
  });

  document.documentElement.append(host);

  return {
    update(stats: FpsStats) {
      fpsEl.textContent = formatFps(stats.current);
      if (prefs.colorCoding) {
        fpsEl.className = `fps ${colorClass(stats.current)}`;
      } else {
        fpsEl.className = "fps";
      }
      if (ftEl) ftEl.textContent = `${stats.frameTimeMs.toFixed(1)}ms`;
      shadow.querySelector<HTMLDdElement>(".avg")!.textContent = formatFps(stats.average);
      shadow.querySelector<HTMLDdElement>(".min")!.textContent = formatFps(stats.min);
      shadow.querySelector<HTMLDdElement>(".max")!.textContent = formatFps(stats.max);
      shadow.querySelector<HTMLDdElement>(".ft")!.textContent = `${stats.frameTimeMs.toFixed(1)}ms`;
    },
    remove() {
      host.remove();
    }
  };
}

/** Re-mounts the badge when corner/showFrameTime preferences change. */
export function repositionBadge(prefs: FrameMeterPrefs): void {
  const host = document.querySelector<HTMLElement>("[data-frame-meter]");
  if (!host) return;
  const badge = host.shadowRoot?.querySelector<HTMLDivElement>(".badge");
  if (!badge) return;
  badge.className = `badge ${prefs.corner}`;
  // Toggle the frame-time element visibility.
  let ft = badge.querySelector<HTMLSpanElement>(".frame-time");
  if (prefs.showFrameTime && !ft) {
    ft = document.createElement("span");
    ft.className = "frame-time";
    ft.textContent = "0.0ms";
    badge.append(ft);
  } else if (!prefs.showFrameTime && ft) {
    ft.remove();
  }
}

export type { Corner };
```

- [ ] **Step 2: Commit**

```bash
git add extensions/frame-meter/src/ui/badge.ts
git commit -m "feat(frame-meter): add Shadow DOM badge overlay"
```

---

### Task 6: Content script entry

**Files:**
- Create: `extensions/frame-meter/src/entries/content.ts`

- [ ] **Step 1: Write the entry**

`extensions/frame-meter/src/entries/content.ts`:

```ts
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
        } else if (badge && currentPrefs) {
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
```

- [ ] **Step 2: Commit**

```bash
git add extensions/frame-meter/src/entries/content.ts
git commit -m "feat(frame-meter): add content script with rAF loop"
```

---

### Task 7: Background service worker

**Files:**
- Create: `extensions/frame-meter/src/entries/background.ts`

- [ ] **Step 1: Write the entry**

`extensions/frame-meter/src/entries/background.ts`:

```ts
import { MessageType } from "../core/messaging";

// Re-inject the content script into all open tabs after install or pref changes,
// so users don't need to reload every tab to see the badge.
async function reinjectAllTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (typeof tab.id !== "number" || !tab.url) continue;
    if (!/^https?:/.test(tab.url)) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: MessageType.PING });
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["dist/content.js"]
        });
      } catch {
        // Tab may be in a state that rejects injection (chrome://, devtools, etc.).
      }
    }
  }
}

chrome.runtime.onInstalled.addListener(reinjectAllTabs);
chrome.runtime.onStartup.addListener(reinjectAllTabs);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MessageType.RECONCILE_SCRIPTS) {
    reinjectAllTabs()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message.type === MessageType.PING) {
    sendResponse({ ok: true });
    return true;
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add extensions/frame-meter/src/entries/background.ts
git commit -m "feat(frame-meter): add background service worker"
```

---

### Task 8: Popup page

**Files:**
- Create: `extensions/frame-meter/popup.html`
- Create: `extensions/frame-meter/src/entries/popup.ts`

- [ ] **Step 1: Write `popup.html`**

`extensions/frame-meter/popup.html`:

```html
<!doctype html>
<html lang="en" class="popup-document">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Frame Meter</title>
  <link rel="stylesheet" href="ui.css">
</head>
<body class="popup-page">
  <main class="popup-shell">
    <header class="compact-header">
      <div>
        <p class="eyebrow">Frame Meter</p>
        <h1>Live FPS overlay</h1>
      </div>
      <button id="settingsButton" class="icon-button" type="button" title="Settings" aria-label="Open settings">⚙</button>
    </header>

    <label class="check-row">
      <input id="enabled" type="checkbox">
      <span>Show FPS overlay</span>
    </label>

    <section class="panel">
      <label class="field-label" for="corner">Corner</label>
      <select id="corner" class="input">
        <option value="top-left">Top left</option>
        <option value="top-right">Top right</option>
        <option value="bottom-left">Bottom left</option>
        <option value="bottom-right">Bottom right</option>
      </select>

      <label class="check-row">
        <input id="showFrameTime" type="checkbox">
        <span>Show frame time (ms)</span>
      </label>

      <label class="check-row">
        <input id="colorCoding" type="checkbox">
        <span>Color-code FPS (green/yellow/red)</span>
      </label>
    </section>

    <p id="status" class="muted" role="status"></p>
  </main>
  <script src="dist/popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `src/entries/popup.ts`**

`extensions/frame-meter/src/entries/popup.ts`:

```ts
import { DEFAULT_PREFERENCES, loadPreferences, type Corner, type FrameMeterPrefs } from "../core/preferences";
import { MessageType } from "../core/messaging";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function readForm(): FrameMeterPrefs {
  return {
    enabled: ($("#enabled") as HTMLInputElement).checked,
    corner: ($("#corner") as HTMLSelectElement).value as Corner,
    showFrameTime: ($("#showFrameTime") as HTMLInputElement).checked,
    colorCoding: ($("#colorCoding") as HTMLInputElement).checked,
    disabledSites: DEFAULT_PREFERENCES.disabledSites
  };
}

function writeForm(prefs: FrameMeterPrefs): void {
  ($("#enabled") as HTMLInputElement).checked = prefs.enabled;
  ($("#corner") as HTMLSelectElement).value = prefs.corner;
  ($("#showFrameTime") as HTMLInputElement).checked = prefs.showFrameTime;
  ($("#colorCoding") as HTMLInputElement).checked = prefs.colorCoding;
}

async function notifyActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (typeof tab.id !== "number") return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: MessageType.UPDATE_PREFS });
  } catch {
    // Tab may not have the content script yet; ignore.
  }
}

function setStatus(message: string): void {
  $("#status").textContent = message;
  window.setTimeout(() => {
    if ($("#status").textContent === message) $("#status").textContent = "";
  }, 2200);
}

document.addEventListener("DOMContentLoaded", async () => {
  writeForm(await loadPreferences());

  for (const selector of ["#enabled", "#corner", "#showFrameTime", "#colorCoding"]) {
    $(selector).addEventListener("change", async () => {
      // Preserve disabledSites from storage (popup doesn't edit it).
      const stored = await chrome.storage.sync.get(DEFAULT_PREFERENCES);
      const prefs = { ...readForm(), disabledSites: stored.disabledSites ?? [] };
      await chrome.storage.sync.set(prefs);
      await notifyActiveTab();
      setStatus("Saved.");
    });
  }

  $("#settingsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());
});
```

- [ ] **Step 3: Commit**

```bash
git add extensions/frame-meter/popup.html extensions/frame-meter/src/entries/popup.ts
git commit -m "feat(frame-meter): add popup UI"
```

---

### Task 9: Options page

**Files:**
- Create: `extensions/frame-meter/options.html`
- Create: `extensions/frame-meter/src/entries/options.ts`

- [ ] **Step 1: Write `options.html`**

`extensions/frame-meter/options.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Frame Meter Settings</title>
  <link rel="stylesheet" href="ui.css">
</head>
<body>
  <main class="page-shell">
    <header class="page-header">
      <p class="eyebrow">Settings</p>
      <h1>Frame Meter</h1>
      <p class="muted">Configure the FPS overlay behavior and per-site disable list.</p>
    </header>

    <form id="optionsForm" class="settings-grid">
      <section class="panel">
        <h2>Overlay</h2>
        <label class="check-row">
          <input id="enabled" type="checkbox">
          <span>Show FPS overlay by default</span>
        </label>
        <label class="field-label" for="corner">Corner</label>
        <select id="corner" class="input">
          <option value="top-left">Top left</option>
          <option value="top-right">Top right</option>
          <option value="bottom-left">Bottom left</option>
          <option value="bottom-right">Bottom right</option>
        </select>
        <label class="check-row">
          <input id="showFrameTime" type="checkbox">
          <span>Show frame time (ms)</span>
        </label>
        <label class="check-row">
          <input id="colorCoding" type="checkbox">
          <span>Color-code FPS (green/yellow/red)</span>
        </label>
      </section>

      <section class="panel">
        <h2>Disabled sites</h2>
        <label class="field-label" for="disabledSites">One hostname per line</label>
        <textarea id="disabledSites" class="input" rows="6" placeholder="example.com" spellcheck="false"></textarea>
        <p class="hint">A site and its subdomains will not show the overlay.</p>
      </section>

      <footer class="form-actions">
        <button id="saveButton" class="primary-button" type="submit">Save settings</button>
        <button id="resetButton" class="secondary-button" type="button">Reset defaults</button>
        <span id="saveStatus" class="muted" role="status"></span>
      </footer>
    </form>
  </main>
  <script src="dist/options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `src/entries/options.ts`**

`extensions/frame-meter/src/entries/options.ts`:

```ts
import { DEFAULT_PREFERENCES, loadPreferences, type Corner, type FrameMeterPrefs } from "../core/preferences";
import { MessageType } from "../core/messaging";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function readForm(): FrameMeterPrefs {
  const raw = ($("#disabledSites") as HTMLTextAreaElement).value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    enabled: ($("#enabled") as HTMLInputElement).checked,
    corner: ($("#corner") as HTMLSelectElement).value as Corner,
    showFrameTime: ($("#showFrameTime") as HTMLInputElement).checked,
    colorCoding: ($("#colorCoding") as HTMLInputElement).checked,
    disabledSites: raw
  };
}

function writeForm(prefs: FrameMeterPrefs): void {
  ($("#enabled") as HTMLInputElement).checked = prefs.enabled;
  ($("#corner") as HTMLSelectElement).value = prefs.corner;
  ($("#showFrameTime") as HTMLInputElement).checked = prefs.showFrameTime;
  ($("#colorCoding") as HTMLInputElement).checked = prefs.colorCoding;
  ($("#disabledSites") as HTMLTextAreaElement).value = prefs.disabledSites.join("\n");
}

function setStatus(message: string): void {
  $("#saveStatus").textContent = message;
  window.setTimeout(() => {
    if ($("#saveStatus").textContent === message) $("#saveStatus").textContent = "";
  }, 2200);
}

document.addEventListener("DOMContentLoaded", async () => {
  writeForm(await loadPreferences());

  $("#optionsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await chrome.storage.sync.set(readForm());
    await chrome.runtime.sendMessage({ type: MessageType.RECONCILE_SCRIPTS });
    setStatus("Saved.");
  });

  $("#resetButton").addEventListener("click", async () => {
    writeForm(DEFAULT_PREFERENCES);
    await chrome.storage.sync.set(DEFAULT_PREFERENCES);
    await chrome.runtime.sendMessage({ type: MessageType.RECONCILE_SCRIPTS });
    setStatus("Defaults restored.");
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add extensions/frame-meter/options.html extensions/frame-meter/src/entries/options.ts
git commit -m "feat(frame-meter): add options page with per-site disable list"
```

---

### Task 10: Shared UI stylesheet

**Files:**
- Create: `extensions/frame-meter/ui.css`

- [ ] **Step 1: Write `ui.css`**

Reuse the house design tokens from `tube-utilities` (same dark palette, radius, button styles). This is a copy trimmed to the popup/options surfaces frame-meter needs.

`extensions/frame-meter/ui.css`:

```css
:root {
  color-scheme: dark;
  --bg: #0d0f14;
  --panel: #151922;
  --panel-strong: #1b2130;
  --line: #2a3342;
  --line-bright: #4b668c;
  --text: #edf3fa;
  --muted: #98a4b5;
  --accent: #8ab4f8;
  --accent-soft: rgba(138, 180, 248, .14);
  --radius: 16px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
html, body { min-height: 100%; }
html.popup-document { width: 380px; min-width: 380px; max-width: 380px; }
body {
  margin: 0;
  color: var(--text);
  background:
    radial-gradient(circle at 15% -10%, rgba(138, 180, 248, .2), transparent 30rem),
    linear-gradient(135deg, #0d0f14, #090b10);
}
button, input, select, textarea { font: inherit; }
button, a { -webkit-tap-highlight-color: transparent; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.popup-page {
  width: 380px;
  min-width: 380px;
  max-width: 380px;
  min-height: 360px;
  overflow-x: hidden;
}
.popup-shell { display: grid; gap: 16px; width: 380px; min-width: 380px; padding: 18px; }
.page-shell { width: min(980px, calc(100% - 32px)); margin: 0 auto; padding: 36px 0; }
.compact-header, .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.compact-header > div { min-width: 0; }
.page-header { display: block; margin-bottom: 22px; }
.eyebrow {
  margin: 0 0 6px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .16em;
  text-transform: uppercase;
}
h1, h2 { margin: 0; line-height: 1.1; }
h1 { font-size: 26px; overflow-wrap: anywhere; }
h2 { margin-bottom: 14px; font-size: 16px; }
.muted, .hint { color: var(--muted); }
.hint { margin: 8px 0 0; font-size: 13px; }

.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(21, 25, 34, .86);
  box-shadow: 0 18px 48px rgba(0, 0, 0, .22);
  padding: 16px;
}
.settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.form-actions { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }

.field-label { display: block; margin: 12px 0 7px; color: #c8d2df; font-size: 13px; font-weight: 700; }
.input {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--text);
  background: #0f131b;
  padding: 9px 12px;
}
textarea.input { resize: vertical; min-height: 96px; }
.check-row { display: flex; align-items: center; gap: 10px; margin: 10px 0; color: #d7deea; }
.check-row input { width: 18px; height: 18px; accent-color: var(--accent); }

.primary-button, .secondary-button, .icon-button {
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
}
.primary-button { width: 100%; color: #07101d; background: var(--accent); font-weight: 800; }
.primary-button:disabled { cursor: not-allowed; opacity: .55; }
.secondary-button { display: inline-grid; place-items: center; padding: 0 14px; border-color: var(--line); background: var(--panel-strong); }
.icon-button { width: 40px; background: var(--panel-strong); border-color: var(--line); }

@media (max-width: 720px) {
  .settings-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Commit**

```bash
git add extensions/frame-meter/ui.css
git commit -m "feat(frame-meter): add shared popup/options stylesheet"
```

---

### Task 11: SVG icons

**Files:**
- Create: `extensions/frame-meter/images/icon16.svg`
- Create: `extensions/frame-meter/images/icon48.svg`
- Create: `extensions/frame-meter/images/icon128.svg`

- [ ] **Step 1: Write `icon16.svg`**

A compact "60" badge in the house palette (`#8ab4f8` accent on `#111827`).

`extensions/frame-meter/images/icon16.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" role="img" aria-label="Frame Meter">
  <rect width="16" height="16" rx="4" fill="#111827"/>
  <text x="8" y="11" font-family="ui-monospace, monospace" font-size="8" font-weight="700" text-anchor="middle" fill="#8ab4f8">60</text>
</svg>
```

- [ ] **Step 2: Write `icon48.svg`**

`extensions/frame-meter/images/icon48.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="Frame Meter">
  <rect width="48" height="48" rx="10" fill="#111827"/>
  <text x="24" y="31" font-family="ui-monospace, monospace" font-size="22" font-weight="700" text-anchor="middle" fill="#8ab4f8">60</text>
</svg>
```

- [ ] **Step 3: Write `icon128.svg`**

`extensions/frame-meter/images/icon128.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Frame Meter">
  <rect width="128" height="128" rx="26" fill="#111827"/>
  <text x="64" y="84" font-family="ui-monospace, monospace" font-size="58" font-weight="700" text-anchor="middle" fill="#8ab4f8">60</text>
</svg>
```

- [ ] **Step 4: Commit**

```bash
git add extensions/frame-meter/images/icon16.svg extensions/frame-meter/images/icon48.svg extensions/frame-meter/images/icon128.svg
git commit -m "feat(frame-meter): add SVG icons"
```

---

### Task 12: Manifest

**Files:**
- Create: `extensions/frame-meter/manifest.json`

- [ ] **Step 1: Write the manifest**

`extensions/frame-meter/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Frame Meter",
  "version": "1.0.0",
  "description": "Live FPS counter overlay for any web page.",
  "action": {
    "default_popup": "popup.html",
    "default_title": "Frame Meter",
    "default_icon": {
      "16": "images/icon16.svg",
      "48": "images/icon48.svg",
      "128": "images/icon128.svg"
    }
  },
  "icons": {
    "16": "images/icon16.svg",
    "48": "images/icon48.svg",
    "128": "images/icon128.svg"
  },
  "background": {
    "service_worker": "dist/background.js"
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "permissions": [
    "storage",
    "scripting",
    "activeTab"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add extensions/frame-meter/manifest.json
git commit -m "feat(frame-meter): add MV3 manifest"
```

---

### Task 13: Build and package scripts

**Files:**
- Create: `extensions/frame-meter/scripts/build.mjs`
- Create: `extensions/frame-meter/scripts/package.mjs`

- [ ] **Step 1: Write `build.mjs`**

`extensions/frame-meter/scripts/build.mjs`:

```js
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");
await mkdir("dist", { recursive: true });

const context = {
  entryPoints: {
    background: "src/entries/background.ts",
    content: "src/entries/content.ts",
    popup: "src/entries/popup.ts",
    options: "src/entries/options.ts"
  },
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  minify: false,
  logLevel: "info"
};

if (watch) {
  const result = await build({ ...context, watch: true });
  console.log("Watching Frame Meter sources…", result);
} else {
  await build(context);
}
```

- [ ] **Step 2: Write `package.mjs`**

`extensions/frame-meter/scripts/package.mjs`:

```js
import { cp, mkdir, rm } from "node:fs/promises";

const output = "release/frame-meter";
await rm("release", { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of [
  "manifest.json",
  "popup.html",
  "options.html",
  "ui.css",
  "README.md"
]) {
  await cp(file, `${output}/${file}`);
}
await cp("dist", `${output}/dist`, { recursive: true });
await cp("images", `${output}/images`, { recursive: true });
console.log(`Runtime package staged at ${output}`);
```

- [ ] **Step 3: Commit**

```bash
git add extensions/frame-meter/scripts/build.mjs extensions/frame-meter/scripts/package.mjs
git commit -m "feat(frame-meter): add esbuild build and package scripts"
```

---

### Task 14: README

**Files:**
- Create: `extensions/frame-meter/README.md`

- [ ] **Step 1: Write the README**

`extensions/frame-meter/README.md`:

```markdown
# Frame Meter

Frame Meter is a Manifest V3 Chrome extension that displays a live FPS counter overlay on every web page, measured via `requestAnimationFrame`.

## Features

- Live FPS counter in any screen corner (top/bottom, left/right).
- Color-coded FPS: green ≥50, yellow 30–49, red <30.
- Optional frame-time (ms/frame) display.
- Click the badge to expand session stats (average/min/max/frame time).
- Per-site disable list.
- Shadow-DOM-isolated overlay so page CSS cannot break it.

## Development

```bash
npm install
npm run check
```

Load the extension unpacked from this directory after running:

```bash
npm run build
```

The runtime entry files are emitted to `dist/`.

## How it works

The content script runs a `requestAnimationFrame` loop, measuring the delta between frames and feeding it to a pure `FrameMeter` class that maintains a rolling 60-frame window and session min/max. The overlay updates ~2x/sec to avoid layout thrash. All UI is rendered into a Shadow DOM host appended to `document.documentElement` with `:host { all: initial; }` isolation.
```

- [ ] **Step 2: Commit**

```bash
git add extensions/frame-meter/README.md
git commit -m "feat(frame-meter): add README"
```

---

### Task 15: Update root README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Frame Meter section**

In `README.md`, after the `### Localhost Dashboard` section (around line 70), insert a new section before the `---` divider:

```markdown
### Frame Meter

Displays a live FPS counter overlay on any web page, measured via `requestAnimationFrame`. Configurable corner placement, color coding, frame-time toggle, expandable session stats, and a per-site disable list.

Load unpacked from:

```text
extensions/frame-meter
```
```

Also update the Structure tree (around lines 26–33) to add `frame-meter/` to the `extensions/` list.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Frame Meter to root README"
```

---

### Task 16: Install, build, typecheck, and test

**Files:** (none — verification task)

- [ ] **Step 1: Install dependencies**

Run: `cd extensions/frame-meter && npm install`
Expected: dependencies install cleanly.

- [ ] **Step 2: Run the full check**

Run: `cd extensions/frame-meter && npm run check`
Expected: typecheck passes, all 6 fps tests pass, build emits `dist/background.js`, `dist/content.js`, `dist/popup.js`, `dist/options.js`.

If anything fails, fix the error and re-run before proceeding.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A extensions/frame-meter
git commit -m "fix(frame-meter): build/typecheck corrections"
```

(Skip this step if nothing needed fixing.)

---

### Task 17: Manual verification in Chrome

**Files:** (none — manual verification)

- [ ] **Step 1: Load the extension unpacked**

Open `chrome://extensions`, enable Developer mode, click "Load unpacked", select `extensions/frame-meter/`.

Expected: the extension loads with the "60" icon, no manifest errors shown.

- [ ] **Step 2: Verify the badge appears**

Open any normal web page (e.g. `https://example.com`).

Expected: a small dark pill appears in the top-right corner showing a number that updates ~2x/sec, color-coded (green on a static page since rAF runs at display refresh).

- [ ] **Step 3: Verify the popup**

Click the extension icon in the toolbar.

Expected: popup shows "Show FPS overlay" checkbox (checked), Corner dropdown (Top right), and the two toggle checkboxes. Changing any control makes the badge update or move immediately on the active tab.

- [ ] **Step 4: Verify the expand panel**

Click the badge on the page.

Expected: a small panel drops down showing Average/Min/Max/Frame values.

- [ ] **Step 5: Verify options page**

Open the options page (gear icon in popup, or chrome://extensions → Details → Extension options).

Expected: full form with the disabled-sites textarea. Add a hostname (e.g. `example.com`), save, reload the example.com tab — the badge should not appear there.

- [ ] **Step 6: Verify toggle off**

In the popup, uncheck "Show FPS overlay". Expected: badge disappears from active tab. Re-check it — badge reappears.

If any step fails, return to the relevant task and fix before merging.

---

### Task 18: Merge to main

**Files:** (none — git operations)

- [ ] **Step 1: Verify clean working tree**

Run: `git status`
Expected: clean, all changes committed.

- [ ] **Step 2: Confirm on main branch**

Run: `git branch --show-current`
Expected: `main`

(If not on main, switch: `git checkout main` — all work has been committed directly to main per the user's instruction.)

- [ ] **Step 3: Push**

Run: `git push origin main`
Expected: push succeeds, all frame-meter commits land on remote main.

---

## Self-Review

**Spec coverage:**
- ✅ Live FPS counter via rAF — Task 2 (math), Task 6 (loop)
- ✅ Configurable corner — Task 3 (prefs), Task 5 (badge CSS), Task 8 (popup)
- ✅ Shadow DOM isolation — Task 5
- ✅ Color coding — Task 5
- ✅ Frame-time toggle — Task 5, Task 8
- ✅ Click-to-expand stats — Task 5
- ✅ Per-site disable — Task 3, Task 9
- ✅ Popup — Task 8
- ✅ Options page — Task 9
- ✅ Build/test pipeline — Tasks 13, 16
- ✅ README — Tasks 14, 15
- ✅ Manifest — Task 12
- ✅ Icons — Task 11

**Placeholder scan:** none — every step contains real code or commands.

**Type consistency:** verified — `FrameMeter`, `FpsStats`, `FrameMeterPrefs`, `Corner`, `MessageType`, `BadgeController` are used consistently across tasks. Method names (`mountBadge`, `repositionBadge`, `pushFrame`, `getStats`, `reset`, `loadPreferences`) match between definitions and call sites.

No gaps found.
