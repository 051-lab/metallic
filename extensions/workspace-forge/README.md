# Metallic Workspace Forge

Workspace Forge turns browser windows into named, reusable project workspaces and can optionally synchronize the workspace library through Chrome Sync.

## v0.3.0 Chrome Sync

- Sync is opt-in and local storage remains the primary workspace database.
- Snapshots are gzip-compressed, integrity checked, and split into quota-safe `chrome.storage.sync` items.
- Local changes are written locally first, then pushed to Chrome Sync.
- Remote changes are pulled automatically when the local library is clean.
- Divergent libraries produce a conflict instead of silently overwriting data.
- Conflict choices: **Use This Browser**, **Use Synced Copy**, or **Merge Workspaces**.
- Merge resolves matching workspace IDs by the newest `updatedAt` value and preserves workspaces unique to either browser.
- A fixed development key keeps the unpacked extension ID stable across installations.

Chrome Sync works between Chrome browsers signed into the same Google account with browser sync enabled. Chrome, Edge, Brave, and other browser vendors do not share one sync backend. JSON import/export remains the portable cross-browser path.

## One-time upgrade from v0.2.1

v0.2.1 did not contain a fixed extension key, so v0.3.0 receives a new stable extension ID. Before removing the old unpacked build:

1. Open Workspace Forge v0.2.1 and export its JSON library.
2. Remove the old unpacked extension.
3. Load Workspace Forge v0.3.0.
4. Import the exported JSON once.
5. Enable Chrome Sync from the side panel.

Future unpacked v0.3.x installations using this manifest will share the same extension ID.

## Existing features

- Save the current Chrome window as a workspace.
- Create blank workspaces or use workflow templates.
- Store notes, a next action, saved tabs, pinned intent, and tasks.
- Add or replace saved tabs.
- Restore saved tabs into a new Chrome window and group unpinned tabs.
- Close currently open tabs matching a workspace.
- Import and export workspace JSON.

## Sync limits and conflict behavior

Chrome provides approximately 100 KB total sync storage with an 8 KB limit per item. Workspace Forge compresses and chunks its snapshot, reports current usage, and stops with a clear error when the library is too large. Large libraries should continue using JSON export.

When two browsers change independently, Workspace Forge does not silently overwrite either copy. The side panel offers:

- **Use This Browser**: replace the cloud snapshot with the current local library.
- **Use Synced Copy**: replace this browser's local library with the cloud snapshot.
- **Merge Workspaces**: preserve unique workspace IDs and keep the newest `updatedAt` version for matching IDs.

## Development

```bash
npm install
npm run check
npm run package
```

Load unpacked from `extensions/workspace-forge`.
