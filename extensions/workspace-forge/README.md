# Metallic Workspace Forge

Metallic Workspace Forge is a Manifest V3 Chrome extension for turning messy browser windows into named, reusable project workspaces.

It is designed for workflows where research, AI tools, GitHub, local dev servers, YouTube references, email, and docs pile up across many tabs. A workspace keeps those tabs, notes, tasks, and next actions together so the browser can be used like a project command center instead of a scattered pile of sessions.

## MVP Features

- Create named project workspaces.
- Save the current Chrome window as a workspace.
- Add the active tab to the selected workspace.
- Restore a workspace in a fresh Chrome window.
- Group restored tabs with Chrome tab groups.
- Mark saved tabs as pinned for restore.
- Store notes and a next action per workspace.
- Add, complete, and delete workspace tasks.
- Close open tabs that match a saved workspace.
- Use a popup for quick capture and a side panel for full workspace management.

## Load Unpacked

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

```text
extensions/workspace-forge
```

## Usage

### Save the current window

Open a window with tabs related to a project, click the Workspace Forge icon, then choose **Save Current Window**.

### Manage the workspace

Open the side panel to rename the workspace, change its color, add notes, define a next action, manage saved tabs, and add tasks.

### Restore focus

Click **Open Workspace** from the side panel. Workspace Forge opens the saved tabs in a new Chrome window and applies a named tab group to unpinned tabs.

## Permissions

This MVP uses the following permissions:

- `tabs`: read tab metadata, save URLs, open/close tabs, and restore workspaces.
- `tabGroups`: group restored workspace tabs.
- `storage`: persist workspaces locally.
- `sidePanel`: provide the persistent workspace management UI.

No host permissions are requested in this MVP.

## Implementation Notes

Workspace Forge stores data in `chrome.storage.local` under `workspaceForgeState`.

The extension intentionally provides workspace/session organization, not full Chrome profile isolation. It can isolate project context visually and operationally, but it does not create separate browser identities, cookies, or login containers.

## Next Roadmap

- Workspace templates for coding, research, AI workflows, job search, and media learning.
- Workspace snapshots and restore history.
- Command palette for fast workspace switching.
- Tab inbox for unsorted tabs.
- Import/export workspace JSON.
- Optional bookmark sync integration.
- Optional AI-assisted workspace summaries once an approved local/browser AI integration exists.
