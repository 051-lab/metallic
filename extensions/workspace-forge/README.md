# Metallic Workspace Forge

Metallic Workspace Forge is a Manifest V3 Chrome extension for turning scattered browser windows into named, reusable project workspaces.

## v0.2.2 Workspace Sync

Workspace Sync is opt-in. Local storage remains the primary database. When enabled, Workspace Forge:

- Pulls and merges an existing synced library before publishing local data.
- Merges matching workspace IDs using the newest `updatedAt` timestamp.
- Preserves independent workspaces created in different browsers.
- Syncs deletion tombstones so removed workspaces do not immediately reappear.
- Publishes later local edits automatically.
- Provides manual **Pull** and **Push** controls.
- Checks Chrome Sync's per-item and total quotas before writing.

Chrome Sync works only when Chrome sync is enabled and the extension has the same extension ID in both installations. Different Chromium browsers, different sync ecosystems, or differently identified unpacked installs may not share data. JSON import/export remains the universal transfer and backup path.

## Features

- Save the current Chrome window as a workspace.
- Create blank workspaces or use workflow templates.
- Store notes, a next action, saved tabs, and tasks.
- Replace a workspace's tabs from the current window without losing notes or tasks.
- Add the active tab to a workspace.
- Restore saved tabs into a new Chrome window.
- Group restored unpinned tabs under the workspace name.
- Preserve pinned-tab intent.
- Close currently open tabs that match a workspace.
- Import and export workspace JSON.
- Optionally sync workspace data through Chrome Sync.
- Manage everything from a persistent Chrome side panel.

## Architecture

```text
src/
├── core/
│   ├── background-lifecycle.ts
│   ├── models.ts
│   ├── state.ts
│   ├── sync.ts
│   ├── tabs.ts
│   └── templates.ts
└── entries/
    ├── background.ts
    ├── popup.ts
    └── sidepanel.ts
```

The full workspace database is stored in `chrome.storage.local`. Opt-in portable snapshots are chunked across `chrome.storage.sync` so each workspace can be validated against Chrome's per-item quota.

## Permissions

- `tabs`: capture, open, pin, group, and close workspace tabs.
- `tabGroups`: label restored tabs as a workspace.
- `storage`: persist local workspace data and optional Chrome Sync records.
- `sidePanel`: provide persistent workspace management.

No host permissions or content scripts are requested.

## Development

```bash
npm install
npm run check
```

Load unpacked from:

```text
extensions/workspace-forge
```

The committed `dist/` bundles make the branch directly loadable after a build.

## Keyboard shortcut

- Windows/Linux: `Ctrl+Shift+Y`
- macOS: `Command+Shift+Y`

Chrome may require confirmation at `chrome://extensions/shortcuts`.
