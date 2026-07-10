import type {
  Workspace,
  WorkspaceColor,
  WorkspaceForgeState,
  WorkspaceRequest,
  WorkspaceResponse
} from "../core/models";
import {
  addTabToWorkspace,
  createWorkspaceInState,
  deleteWorkspaceFromState,
  emptyState,
  importWorkspaceState,
  normalizeState,
  replaceWorkspaceTabs,
  setActiveWorkspace,
  updateWorkspaceInState,
  workspaceById
} from "../core/state";
import { matchingOpenTabIds, savedTabFromChrome, savedTabsFromChrome } from "../core/tabs";

const STORAGE_KEY = "workspaceForgeState";

const GROUP_COLOR_MAP: Record<WorkspaceColor, NonNullable<chrome.tabGroups.UpdateProperties["color"]>> = {
  grey: "grey",
  blue: "blue",
  cyan: "cyan",
  green: "green",
  yellow: "yellow",
  orange: "orange",
  red: "red",
  pink: "pink",
  purple: "purple"
};

async function readState(): Promise<WorkspaceForgeState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const normalized = normalizeState(stored[STORAGE_KEY] ?? emptyState());
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

async function writeState(state: WorkspaceForgeState): Promise<WorkspaceForgeState> {
  const normalized = normalizeState(state);
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

async function lastFocusedWindow(): Promise<chrome.windows.Window> {
  const browserWindow = await chrome.windows.getLastFocused({
    populate: true,
    windowTypes: ["normal"]
  });
  if (typeof browserWindow.id !== "number") throw new Error("No normal Chrome window is available.");
  return browserWindow;
}

async function openSidePanel(windowId?: number): Promise<{ windowId: number }> {
  const targetId = windowId ?? (await lastFocusedWindow()).id;
  if (typeof targetId !== "number") throw new Error("No Chrome window is available.");
  await chrome.sidePanel.open({ windowId: targetId });
  return { windowId: targetId };
}

async function saveCurrentWindow(payload: { name?: string; color?: WorkspaceColor } = {}): Promise<WorkspaceForgeState> {
  const browserWindow = await lastFocusedWindow();
  const tabs = savedTabsFromChrome(browserWindow.tabs || []);
  const current = await readState();
  const created = createWorkspaceInState(current, {
    name: payload.name?.trim() || `Workspace ${current.workspaces.length + 1}`,
    color: payload.color || "blue",
    tabs
  });
  return writeState(created.state);
}

async function replaceFromCurrentWindow(workspaceId: string): Promise<WorkspaceForgeState> {
  const browserWindow = await lastFocusedWindow();
  const tabs = savedTabsFromChrome(browserWindow.tabs || []);
  return writeState(replaceWorkspaceTabs(await readState(), workspaceId, tabs));
}

async function addCurrentTab(workspaceId: string): Promise<WorkspaceForgeState> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error("No active tab is available.");
  const saved = savedTabFromChrome(tab);
  if (!saved) throw new Error("The active tab does not expose a URL.");
  return writeState(addTabToWorkspace(await readState(), workspaceId, saved));
}

async function restoreWorkspace(workspaceId: string): Promise<{ windowId: number; tabCount: number }> {
  const workspace = workspaceById(await readState(), workspaceId);
  if (!workspace.tabs.length) throw new Error("This workspace has no saved tabs.");

  const created = await chrome.windows.create({ url: workspace.tabs.map((tab) => tab.url) });
  if (typeof created.id !== "number") throw new Error("Chrome did not return the restored window.");

  const createdTabs = created.tabs?.length
    ? created.tabs
    : await chrome.tabs.query({ windowId: created.id });
  const unpinnedIds: number[] = [];

  for (const [index, tab] of createdTabs.entries()) {
    if (typeof tab.id !== "number") continue;
    const saved = workspace.tabs[index];
    if (saved?.pinned) {
      await chrome.tabs.update(tab.id, { pinned: true });
    } else {
      unpinnedIds.push(tab.id);
    }
  }

  if (unpinnedIds.length) {
    const groupId = await chrome.tabs.group({
      tabIds: unpinnedIds,
      createProperties: { windowId: created.id }
    });
    await chrome.tabGroups.update(groupId, {
      title: workspace.name.slice(0, 40),
      color: GROUP_COLOR_MAP[workspace.color],
      collapsed: false
    });
  }

  return { windowId: created.id, tabCount: createdTabs.length };
}

async function closeWorkspaceTabs(workspaceId: string): Promise<{ closed: number }> {
  const workspace = workspaceById(await readState(), workspaceId);
  const openTabs = await chrome.tabs.query({});
  const ids = matchingOpenTabIds(workspace.tabs, openTabs);
  if (ids.length) await chrome.tabs.remove(ids);
  return { closed: ids.length };
}

async function handleMessage(message: WorkspaceRequest): Promise<unknown> {
  switch (message.type) {
    case "GET_STATE":
    case "EXPORT_STATE":
      return readState();
    case "OPEN_SIDE_PANEL":
      return openSidePanel(message.windowId);
    case "CREATE_WORKSPACE": {
      const created = createWorkspaceInState(await readState(), message.payload || {});
      return writeState(created.state);
    }
    case "UPDATE_WORKSPACE":
      return writeState(updateWorkspaceInState(
        await readState(),
        message.workspaceId,
        message.patch as Partial<Workspace>
      ));
    case "DELETE_WORKSPACE":
      return writeState(deleteWorkspaceFromState(await readState(), message.workspaceId));
    case "SAVE_CURRENT_WINDOW":
      return saveCurrentWindow(message.payload);
    case "REPLACE_TABS_FROM_WINDOW":
      return replaceFromCurrentWindow(message.workspaceId);
    case "ADD_CURRENT_TAB":
      return addCurrentTab(message.workspaceId);
    case "OPEN_WORKSPACE":
      return restoreWorkspace(message.workspaceId);
    case "CLOSE_WORKSPACE_TABS":
      return closeWorkspaceTabs(message.workspaceId);
    case "SET_ACTIVE_WORKSPACE":
      return writeState(setActiveWorkspace(await readState(), message.workspaceId));
    case "IMPORT_STATE":
      return writeState(importWorkspaceState(
        await readState(),
        message.payload,
        message.mode || "merge"
      ));
    default: {
      const exhaustive: never = message;
      throw new Error(`Unsupported message: ${JSON.stringify(exhaustive)}`);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void readState();
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-workspace-forge") void openSidePanel();
});

chrome.runtime.onMessage.addListener((
  message: WorkspaceRequest,
  _sender,
  sendResponse: (response: WorkspaceResponse) => void
) => {
  void handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error: unknown) => {
      console.error("Workspace Forge error:", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  return true;
});
