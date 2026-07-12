# Metallic Tab Finder

Metallic Tab Finder is a keyboard-first Manifest V3 Chrome extension for locating, aliasing, and switching to tabs across every normal Chrome window.

## v0.3.0 — Tab Aliases

Tab Aliases let you give an open tab a name that is easier to recognize and search.

- Select a tab and press `F2`, or use the **Rename** button.
- Aliases rank above native page titles in search.
- The original page title remains visible as secondary metadata.
- `Shift+F2` removes the selected tab's alias.
- Aliases are stored in `chrome.storage.session`, so they clear when Chrome restarts or the extension reloads.
- When the selected tab is the tab that invoked Tab Finder, the extension also updates and locks `document.title` for the current page session.
- Background tabs and protected Chrome pages can still receive a searchable **alias-only** label inside Tab Finder without requesting access to every website.

This first alias release intentionally does not include persistent URL rules or all-sites host permissions.

## Existing features

- Fuzzy multi-token search across aliases, titles, domains, and URLs.
- Recent-tab-aware ranking.
- Window and domain grouping.
- Duplicate-only filtering.
- Live tab and window refresh.
- Cross-window activation that activates the tab before focusing its window.
- Keyboard navigation with arrows, Page Up/Down, Home/End, Enter, Escape, `/`, `F2`, `Shift+F2`, and `Alt+D`.
- Favicons and active, pinned, audible, sleeping, duplicate, and alias indicators.

## Permissions

- `tabs`: enumerate open tabs and read tab metadata.
- `storage`: store grouping preference and session aliases.
- `activeTab`: temporarily access the tab that invoked Tab Finder.
- `scripting`: update `document.title` only when temporary tab access is available.

No persistent host permissions or content scripts are requested.

## Development

```bash
npm install
npm run check
```

Load unpacked from:

```text
extensions/tab-finder
```

## Manual alias test

1. Open Tab Finder from a normal `https://` page.
2. Keep the active tab selected and press `F2`.
3. Save an alias and confirm the Chrome tab title changes.
4. Change the page title through navigation or a dynamic app and confirm the alias remains locked.
5. Search for the alias.
6. Press `Shift+F2` and confirm the latest native page title is restored.
7. Alias a background tab and confirm it is marked **Alias only**.
8. Switch to that tab, reopen Tab Finder, and confirm the alias is applied visibly.
9. Confirm protected pages such as `chrome://extensions` fall back to alias-only behavior without crashing.
