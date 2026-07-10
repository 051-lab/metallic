# Metallic Tab Finder

Metallic Tab Finder is a keyboard-first Manifest V3 extension for finding and switching to any open tab across every normal Chrome window.

It is intentionally smaller than a session manager or workspace dashboard. The MVP solves one focused problem: when many tabs are spread across several windows, locate the right tab immediately without clicking through each window.

## MVP Features

- Search open tab titles, domains, and URLs.
- Fuzzy multi-token matching with domain-aware ranking.
- View tabs grouped by Chrome window or website domain.
- Switch to a result with one click or the keyboard.
- Show favicons and active, pinned, audible, sleeping, and duplicate states.
- Count open windows, matching tabs, and duplicate copies.
- Remember the selected grouping mode with `chrome.storage.sync`.
- Open the popup with the extension action or the suggested `Alt+Shift+K` shortcut.

## Load Unpacked

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select:

```text
extensions/tab-finder
```

The committed `dist/popup.js` bundle makes the branch directly loadable without a local build.

## Keyboard Controls

- Type to search.
- `Arrow Up` / `Arrow Down`: move through visible results.
- `Enter`: focus the selected tab and its browser window.
- `Escape`: clear the query; press again to close the popup.
- `/`: return focus to the search box.

## Permissions

- `tabs`: read tab titles, URLs, state, and window membership, then activate the selected tab.
- `storage`: remember the window/domain grouping preference.

No host permissions or page content scripts are requested.

## Development

```bash
npm install
npm run check
```

Available scripts:

- `npm run build`: bundle TypeScript sources into `dist/`.
- `npm run watch`: rebuild during development.
- `npm run typecheck`: run strict TypeScript validation.
- `npm test`: run the search and duplicate-detection unit tests.
- `npm run package`: validate and stage a runtime package under `release/tab-finder`.

## MVP Test Plan

1. Open tabs across at least two Chrome windows.
2. Load the extension and open its popup.
3. Verify every normal-window tab appears with its title and domain.
4. Search by exact title, partial title, domain, and fuzzy multi-token query.
5. Switch grouping between Windows and Domains, close and reopen the popup, and verify the preference persists.
6. Use arrow keys and Enter to switch to a tab in another window.
7. Open the same URL more than once and verify duplicate indicators and counts appear.
8. Verify pinned, audible, and discarded tabs receive the expected state chips.

## Next Roadmap

- Close or merge duplicate tabs from the results list.
- Add optional recent-tab ranking.
- Add a command palette mode for mute, pin, close, and move operations.
- Support user-defined aliases for frequently used domains.
- Explore integration points with Metallic Workspace Forge without merging the two extensions' responsibilities.
