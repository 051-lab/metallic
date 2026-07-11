# Metallic Workspace Forge

Metallic Workspace Forge is a Manifest V3 Chrome extension for turning scattered browser windows into named, reusable project workspaces.

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
- Manage everything from a persistent Chrome side panel.

## Architecture

The modernization pass separates pure state and tab-normalization logic from Chrome API orchestration:

```text
src/
├── core/
│   ├── models.ts
│   ├── state.ts
│   ├── tabs.ts
│   └── templates.ts
└── entries/
    ├── background.ts
    ├── popup.ts
    └── sidepanel.ts
```

State is stored in `chrome.storage.local` under `workspaceForgeState` and normalized to schema version 3 whenever it is read or written.

## Permissions

- `tabs`: capture, open, pin, group, and close workspace tabs.
- `tabGroups`: label restored tabs as a workspace.
- `storage`: persist workspace data locally.
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
