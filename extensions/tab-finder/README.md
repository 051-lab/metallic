# Metallic Tab Finder

Metallic Tab Finder is a keyboard-first Manifest V3 extension for finding and switching to any open tab across every normal Chrome window.

It is intentionally smaller than a session manager or workspace dashboard. The extension solves one focused problem: when many tabs are spread across several windows, locate the right tab immediately without clicking through each window.

## v0.2.1 Fix

- Fixed keyboard and click activation across browser windows. Tab Finder activates the selected tab before focusing its window, preventing Chrome from closing the popup before the activation request is sent.

## Features

- Search open tab titles, domains, and URLs.
- Fuzzy multi-token matching with domain-aware ranking.
- Rank idle results using Chrome's recent tab activity while keeping active and pinned tabs prominent.
- View tabs grouped by Chrome window or website domain.
- Filter the list to tabs whose URLs are open more than once.
- Keep the popup current when tabs or windows are created, closed, moved, updated, or activated.
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
- `Page Up` / `Page Down`: move eight results at a time.
- `Home` / `End`: jump to the first or last result.
- `Enter`: activate the selected tab, then focus its browser window.
- `Alt+D`: toggle the duplicate-only filter.
- `Escape`: clear the query, then clear the duplicate filter, then close the popup.
- `/`: return focus to the search box.

## Permissions

- `tabs`: read tab titles, URLs, state, recent-access timestamps, and window membership, then activate the selected tab.
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
- `npm test`: run search, recency, duplicate-detection, and activation-order unit tests.
- `npm run package`: validate and stage a runtime package under `release/tab-finder`.

## Test Plan

1. Open tabs across at least two Chrome windows.
2. Load the extension and open its popup.
3. Verify every normal-window tab appears with its title and domain.
4. Search by exact title, partial title, domain, and fuzzy multi-token query.
5. Switch grouping between Windows and Domains, close and reopen the popup, and verify the preference persists.
6. Use arrows, Page Up/Down, Home/End, and Enter to navigate and switch tabs, including a tab in another browser window.
7. Click a result in another browser window and verify the correct tab becomes active.
8. Open the same URL more than once and verify indicators, counts, and the duplicate-only filter.
9. Create, close, move, or activate tabs while the popup is open and verify the list refreshes without losing the selected tab when possible.
10. Verify pinned, audible, and discarded tabs receive the expected state chips.
11. With an empty query, verify recently accessed tabs appear ahead of older inactive tabs.

## Next Roadmap

- Add opt-in tab actions such as mute, pin, close, and move.
- Add a confirmation-based action for closing redundant duplicate copies.
- Support user-defined aliases for frequently used domains.
- Explore integration points with Metallic Workspace Forge without merging the two extensions' responsibilities.
