# frame-meter — Design

**Date:** 2026-07-05
**Status:** Approved
**Location:** `extensions/frame-meter/`

## Purpose

A Chrome extension that displays a live FPS (frames-per-second) counter overlay on every web page, measured via `requestAnimationFrame`. Helps diagnose page jank and rendering performance. Follows the metallic repo's modern house style (TypeScript + esbuild + MV3 + Shadow DOM).

## Requirements

### Must-have
- Live FPS counter rendered as an overlay on every page.
- `requestAnimationFrame`-based measurement of real frame timing.
- Configurable corner placement (top-left, top-right, bottom-left, bottom-right).
- Shadow-DOM-isolated badge so page CSS cannot break it.

### Nice-to-have (included)
- Color-coded FPS (green ≥50, yellow 30–49, red <30).
- Frame-time (ms/frame) display toggle.
- Click badge to expand session stats (avg/min/max).
- Per-site disable list.

### Out of scope (YAGNI)
- Graphs, memory/CPU/network stats, exportable reports, history persistence, per-site config profiles.

## Architecture

```
extensions/frame-meter/
  manifest.json
  package.json, tsconfig.json
  ui.css                       # popup/options styling
  popup.html, options.html
  images/                      # icon16.svg, icon48.svg, icon128.svg
  src/
    entries/
      background.ts            # service worker: reconcile scripts on install/pref change
      content.ts               # injected on pages: runs rAF loop, renders badge
      popup.ts                 # popup UI wiring
      options.ts               # options page wiring
    core/
      fps.ts                   # FPS measurement math (testable, no DOM)
      preferences.ts            # load/save chrome.storage.sync prefs
      messaging.ts             # message type constants
    ui/
      badge.ts                 # Shadow DOM overlay rendering
  scripts/
    build.mjs                  # esbuild IIFE bundles
    package.mjs                # stages release/
  tests/
    fps.test.ts                # unit tests for FPS math
  README.md
```

## Components

### `core/fps.ts` — FrameMeter

Pure, testable class consuming frame timestamps and producing stats. No DOM dependencies.

```ts
export interface FpsStats {
  current: number;       // smoothed current FPS
  average: number;       // rolling 60-frame mean
  min: number;           // session min (excludes first 1s warmup)
  max: number;           // session max
  frameTimeMs: number;   // last delta in ms
}

export class FrameMeter {
  private frames: number[] = [];      // rolling window of delta ms
  private readonly windowSize = 60;
  private minFps = Infinity;
  private maxFps = 0;
  private sessionStart = performance.now();
  private warmupUntil: number;        // sessionStart + 1000ms

  pushFrame(deltaMs: number): void;
  getStats(): FpsStats;
  reset(): void;
}
```

- **Current FPS**: `1000 / lastDeltaMs`, smoothed over last ~5 frames.
- **Average**: mean of rolling 60-frame window.
- **Min/Max**: session extremes, excludes first 1s warmup.
- **Frame time**: `lastDeltaMs` in ms.

### `core/preferences.ts`

```ts
export interface FrameMeterPrefs {
  enabled: boolean;           // default true
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";  // default "top-right"
  showFrameTime: boolean;     // default false
  colorCoding: boolean;       // default true
  disabledSites: string[];    // default []
}

export const DEFAULT_PREFERENCES: FrameMeterPrefs;
export async function loadPreferences(): Promise<FrameMeterPrefs>;
export async function savePreferences(prefs: FrameMeterPrefs): Promise<void>;
```

### `core/messaging.ts`

```ts
export const MessageType = {
  TOGGLE: "TOGGLE",
  UPDATE_PREFS: "UPDATE_PREFS",
  PING: "PING",
  RECONCILE_SCRIPTS: "RECONCILE_SCRIPTS",
} as const;
```

### `entries/content.ts` — Content script

- `window.__frameMeterLoaded` idempotency guard (house pattern).
- `requestAnimationFrame` loop measures `performance.now()` deltas → `FrameMeter.pushFrame`.
- Updates badge DOM ~2x/sec (not every frame — avoids layout thrash).
- Listens for messages: `TOGGLE`, `UPDATE_PREFS`, `PING`.
- Checks current URL against `disabledSites` on load; if match, does not render.
- SPA navigation handled via `MutationObserver` on `document.documentElement` watching `location.href` (house pattern; FPS survives SPAs since rAF persists, but badge may need re-mount if removed by page).

### `ui/badge.ts` — Badge overlay

- `:host { all: initial; }` isolation (house convention).
- Host appended to `document.documentElement`, `z-index: 2147483647`.
- Fixed position in chosen corner; ~60×28px semi-transparent dark pill.
- **Color coding:** green ≥50 FPS, yellow 30–49, red <30.
- **Click** → expand panel showing avg/min/max/frame-time; click again to collapse.
- **Hover** → slight opacity boost.
- `data-frame-meter` attribute on host for cleanup queries.
- Position adjusted via CSS class based on `corner` preference.

### `entries/background.ts` — Service worker

- On `chrome.runtime.onInstalled`: call `RECONCILE_SCRIPTS`.
- On `RECONCILE_SCRIPTS` message: re-register/re-inject content scripts on all tabs (house pattern; needed so pref changes apply without reload).
- Responds to `PING` for health check.

### `entries/popup.ts` + `popup.html`

Compact popup: on/off toggle, corner selector (4 buttons), link to options. Reads/writes `chrome.storage.sync`, sends `UPDATE_PREFS` to active tab.

### `entries/options.ts` + `options.html`

Full form: enabled, corner, showFrameTime, colorCoding, disabledSites list. House pattern: `readForm()`/`writeForm()`, sends `RECONCILE_SCRIPTS` message to background on save.

## Manifest

```json
{
  "manifest_version": 3,
  "name": "Frame Meter",
  "version": "1.0.0",
  "description": "Live FPS counter overlay for any web page.",
  "action": {
    "default_popup": "popup.html",
    "default_title": "Frame Meter",
    "default_icon": { "16": "images/icon16.svg", "48": "images/icon48.svg", "128": "images/icon128.svg" }
  },
  "icons": { "16": "images/icon16.svg", "48": "images/icon48.svg", "128": "images/icon128.svg" },
  "background": { "service_worker": "dist/background.js" },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "permissions": ["storage", "scripting", "activeTab"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [
    { "matches": ["<all_urls>"], "js": ["dist/content.js"], "run_at": "document_idle" }
  ]
}
```

**Note on content script injection:** Unlike `clipboard-forge` (which uses dynamic `chrome.scripting` injection gated on `optional_host_permissions`), FPS measurement must run from page load to catch early frames. Therefore `content_scripts` is declared statically with `<all_urls>` host permission. This is simpler and catches page-load frame timing. The trade-off is the extension requests broad host access upfront rather than on-demand — acceptable for an always-on perf tool.

## Build

`scripts/build.mjs` — esbuild, 4 entry points (background, content, popup, options), IIFE format, `chrome120` target, sourcemaps on, minify off (matches house style).

`scripts/package.mjs` — wipes `release/`, copies `manifest.json` + HTML + `ui.css` + `README.md` + `dist/` + `images/` into `release/frame-meter/`.

`package.json` scripts (house pattern):
```json
"build": "node scripts/build.mjs",
"watch": "node scripts/build.mjs --watch",
"typecheck": "tsc --noEmit",
"test": "vitest run",
"check": "npm run typecheck && npm test && npm run build",
"package": "npm run check && node scripts/package.mjs"
```

Dev deps: `@types/chrome`, `esbuild`, `fake-indexeddb`, `jsdom`, `typescript`, `vitest`. No runtime deps.

## Testing

`tests/fps.test.ts` — unit tests for `FrameMeter`:
- Steady 60fps deltas → average ≈60.
- Spike then recovery → min/max tracking.
- Window overflow → old frames drop, average stays bounded.
- `reset()` clears all state.
- First-frame warmup (first 1s) excluded from min.

No DOM tests needed — badge is thin presentation; FPS math is the risky, testable part.

## Code style

Follow house conventions:
- 2-space indent, semicolons always, double quotes for strings.
- Strict TS: `"strict": true, "noUncheckedIndexedAccess": true`.
- `import type` for type-only imports.
- Functional style; no classes in content/UI code (exception: `FrameMeter` is a class because it encapsulates state — matches the small-stateful-module pattern).
- Inline `//` comments for non-obvious behavior only; sparse JSDoc.

## Open questions

None. Design is approved.
