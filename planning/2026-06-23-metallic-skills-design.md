# metallic Chrome-extension skill set — design

**Date:** 2026-06-23
**Status:** approved
**Scope:** A focused set of user-level ZCode skills that encode the patterns used by metallic's mature TypeScript Chrome extensions (ai-chat-utilities, tube-utilities), so new extensions inherit a proven architecture instead of re-deriving it.

## Context

metallic is a Chrome extension forge (GitHub: 051-lab/metallic). It currently holds five extensions of varying sophistication:

| Extension | Stack | Pattern |
|-----------|-------|--------|
| comet-ntp | vanilla JS | MV3 NTP override + declarativeNetRequest (legacy) |
| freedium | dual MV2/MV3 | Chrome + Firefox build (legacy) |
| localhost-dashboard | vanilla JS | modular `src/` (legacy) |
| ai-chat-utilities (v2.1) | TS + esbuild + vitest | **mature canonical pattern** |
| tube-utilities (v1.0) | TS + esbuild + vitest | **mature canonical pattern** |

`shared/` and `templates/` exist but are empty. The two mature extensions already encode a reusable architecture; the skills below codify it.

## Decisions

- **Organization:** focused skill set — several small, single-purpose skills that each fire at the right moment, rather than one comprehensive skill.
- **Location:** user-level ZCode skills dir `C:\Users\soloa\.zcode\skills\` (available across projects). This design doc is also committed to the repo's `planning/` dir as a record.
- **Stack standardized:** TypeScript + esbuild + vitest + `@types/chrome`, MV3, matching ai-chat-utilities / tube-utilities. Vanilla-JS extensions are treated as legacy.
- **Anatomy:** each skill is a folder with `SKILL.md` (frontmatter + body) plus optional `references/`, `assets/`, `scripts/` per the skill-creator anatomy. `agents/openai.yaml` generated via the skill-creator's `init_skill.py` / `generate_openai_yaml.py`.
- **Leanness:** SKILL.md bodies kept under ~500 lines; detail moved to `references/`. Descriptions written for precise triggering and to avoid over-firing on general web dev.

## Skill set (6 skills)

### 1. `metallic-scaffold-extension`
- **Triggers:** scaffolding a *new* Chrome extension under the metallic `extensions/` tree (or a TS MV3 extension generally).
- **Body:** the canonical layout to produce — `extensions/<name>/{src/{core,ui,adapters,entries},scripts/{build.mjs,package.mjs},tests,tsconfig.json,package.json,manifest.json}`; the `package.json` script set (`build` / `watch` / `typecheck` / `test` / `check` / `package`); esbuild config (`format:"iife"`, `target:"chrome120"`, entrypoints `background` / `content` / `popup` / `options` / `archive`); `.gitignore` for `dist/` + `node_modules/`.
- **Assets:** `assets/template/` — a copyable starter tree (manifest, build.mjs, tsconfig, package.json, stub entries, .gitignore) derived from tube-utilities with `{{name}}` / `{{version}}` placeholders.
- **References:** `references/layout-map.md` — role of each directory.

### 2. `metallic-mv3-manifest`
- **Triggers:** authoring or editing a `manifest.json`, bumping a version, or adding a permission.
- **Body:** MV3 fields with metallic conventions — `background.service_worker` (→ `dist/background.js`), `action.default_popup`, `options_ui.open_in_tab`, `web_accessible_resources` with `matches`, `declarativeNetRequest.rule_resources`, icons 16/48/128.
- **References:** `references/permissions.md` — least-privilege philosophy, `optional_host_permissions` (`https://*/*` + `http://*/*`) vs required `host_permissions`, what each common permission (`scripting`, `storage`, `unlimitedStorage`, `downloads`, `clipboardWrite`, `activeTab`, `declarativeNetRequest`) buys, and CWS review gotchas (no broad `<all_urls>` without justification; host-permission justification text).

### 3. `metallic-capture-ux`
- **Triggers:** building on-page capture / export flows (transcript grabber, conversation exporter, scraper-overlay, "guided capture").
- **Body:** the launcher → overlay → picker → calibration flow; the **background message-router pattern** with `{ok, error}` envelopes and `return true` for async `sendResponse`; the **lazy injection idiom** — ping the tab, on failure `chrome.scripting.executeScript({files:["dist/content.js"]})`, then `sendMessage SHOW_OVERLAY`; overlay lifecycle and toast UI.
- **References:** `references/scripting-registration.md` — the `reconcileContentScripts` idempotent `chrome.scripting.registerContentScripts` pattern (register on `onInstalled` / `onStartup` / permission changes, `persistAcrossSessions`, `document_idle`) vs one-time fallback injection; the real `permissions.ts` as an exemplar.

### 4. `metallic-archive-db`
- **Triggers:** adding local persistence / archive / history / snapshot store to an extension.
- **Body:** the IndexedDB pattern — `DB_NAME` / `STORE` / `DB_VERSION` constants; `openDatabase` with `onupgradeneeded` creating the store + indexes; the `storeRequest(mode, operation)` helper wrapping tx + `onsuccess` / `onerror` + `database.close()` on `oncomplete`; `saveSnapshot` (`crypto.randomUUID` + `put`), `getSnapshot`, `deleteSnapshot`, `listSnapshots` (filter + sort by `capturedAt` desc + map to list items); `schemaVersion: 1` on records for future migrations.
- **References:** `references/background-archive-router.md` — the `ARCHIVE_SAVE` / `ARCHIVE_LIST` / `ARCHIVE_GET` / `ARCHIVE_DELETE` message types wired in `background.ts`, with the `{ok, ...}` response shape.

### 5. `metallic-extension-test`
- **Triggers:** writing tests for an extension or running the `check` pipeline.
- **Body:** vitest + `jsdom` + `fake-indexeddb` environment setup; `tsconfig` `types:["chrome","vitest/globals"]`; mocking `chrome.*` via a minimal `globalThis.chrome` stub, mocking IndexedDB via `fake-indexeddb`, DOM assertions via `jsdom`; the `check` script as the single quality gate (`typecheck && test && build`).
- **References:** `references/chrome-stub.md` — a reusable minimal `chrome` mock object (`runtime.onMessage`, `tabs.query`, `scripting.executeScript`, `storage`) suitable for tests.

### 6. `metallic-load-in-chrome`
- **Triggers:** loading / iterating / publishing an unpacked extension.
- **Body:** `chrome://extensions` → Developer mode → Load unpacked → select `extensions/<name>` (or `dist/` if packaged) → reload-on-change; debugging — service-worker logs via the `Inspect` link, content-script logs via page DevTools, the `chrome.scripting` re-injection quirk after a content-script change (reload the tab, not just the extension); `npm run package` producing a CWS-ready zip from `dist/`; CWS upload checklist.
- **References:** `references/reload-quirks.md` — gotchas (manifest permission changes need full reload + re-grant; `declarativeNetRequest` rules need ruleset toggle; `web_accessible_resources` changes need tab refresh).

## Cross-cutting notes

- All `description` fields are written for **precise triggering** and to **avoid over-firing** on general web dev (e.g. "Use when scaffolding a new Chrome extension *under the metallic extensions/ tree*…").
- Skills reference each other where natural (scaffold → manifest → capture-ux → archive-db → test → load), but each is independently usable.
- Each SKILL.md kept lean; detail moved to `references/`.
- `agents/openai.yaml` generated for each via the skill-creator's `init_skill.py` / `generate_openai_yaml.py`.

## Out of scope

- Vanilla-JS extension authoring (legacy stack).
- Firefox / MV2 builds (freedium pattern).
- A "comprehensive single skill" alternative — explicitly rejected in favor of the focused set.
- Reference material for rarely-used Chrome capabilities (side-panel, context menus, alarms) — folded into the relevant skill's `references/` only where it fits naturally; not its own skills.
