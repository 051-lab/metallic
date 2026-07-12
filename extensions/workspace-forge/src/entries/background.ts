import type {
  SavedTab,
  Workspace,
  WorkspaceColor,
  WorkspaceForgeState,
  WorkspaceRequest,
  WorkspaceResponse,
  WorkspaceSyncStatus
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
import { initializeBackground, runBackgroundTask } from "../core/background-lifecycle";
import {
  buildSyncManifest,
  clearWorkspaceTombstone,
  mergeTombstones,
  mergeWorkspaceStates,
  normalizeSyncMeta,
  recordWorkspaceDeletion,
  SYNC_MANIFEST_KEY,
  SYNC_WORKSPACE_PREFIX,
  validateSyncPayload,
  workspaceSyncKey,
  type WorkspaceSyncManifest,
  type WorkspaceSyncMeta
} from "../core/sync";

const STORAGE_KEY = "workspaceForgeState";
const SYNC_META_KEY = "workspaceForgeSyncMetaV1";

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

async function writeLocalState(state: WorkspaceForgeState): Promise<WorkspaceForgeState> {
  const normalized = normalizeState(state);
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

async function readSyncMeta(): Promise<WorkspaceSyncMeta> {
  const stored = await chrome.storage.local.get(SYNC_META_KEY);
  const meta = normalizeSyncMeta(stored[SYNC_META_KEY]);
  await chrome.storage.local.set({ [SYNC_META_KEY]: meta });
  return meta;
}

async function writeSyncMeta(meta: WorkspaceSyncMeta): Promise<WorkspaceSyncMeta> {
  const normalized = normalizeSyncMeta(meta);
  await chrome.storage.local.set({ [SYNC_META_KEY]: normalized });
  return normalized;
}

async function remoteManifest(): Promise<WorkspaceSyncManifest | null> {
  const stored = await chrome.storage.sync.get(SYNC_MANIFEST_KEY);
  const value = stored[SYNC_MANIFEST_KEY];
  if (!value || typeof value !== "object") return null;
  const manifest = value as Partial<WorkspaceSyncManifest>;
  if (manifest.version !== 1 || !Array.isArray(manifest.workspaceIds)) return null;
  return {
    version: 1,
    deviceId: typeof manifest.deviceId === "string" ? manifest.deviceId : "unknown-device",
    updatedAt: typeof manifest.updatedAt === "number" ? manifest.updatedAt : 0,
    activeWorkspaceId: typeof manifest.activeWorkspaceId === "string" ? manifest.activeWorkspaceId : null,
    workspaceIds: manifest.workspaceIds.filter((id): id is string => typeof id === "string"),
    tombstones: manifest.tombstones && typeof manifest.tombstones === "object"
      ? manifest.tombstones as Record<string, number>
      : {}
  };
}

async function readRemoteState(manifest: WorkspaceSyncManifest): Promise<WorkspaceForgeState> {
  const keys = manifest.workspaceIds.map(workspaceSyncKey);
  const stored = keys.length ? await chrome.storage.sync.get(keys) : {};
  const workspaces = manifest.workspaceIds
    .map((workspaceId) => stored[workspaceSyncKey(workspaceId)])
    .filter((workspace): workspace is Workspace => Boolean(workspace && typeof workspace === "object"));
  return normalizeState({
    version: 3,
    activeWorkspaceId: manifest.activeWorkspaceId,
    workspaces
  });
}

async function publishState(state: WorkspaceForgeState): Promise<WorkspaceSyncStatus> {
  let meta = await readSyncMeta();
  if (!meta.enabled) return getSyncStatus();

  try {
    const manifest = buildSyncManifest(state, meta);
    validateSyncPayload(manifest, state.workspaces);
    const payload: Record<string, unknown> = {};
    for (const workspace of state.workspaces) payload[workspaceSyncKey(workspace.id)] = workspace;

    const existing = await chrome.storage.sync.get(null);
    const liveKeys = new Set(Object.keys(payload));
    const staleKeys = Object.keys(existing).filter((key) =>
      key.startsWith(SYNC_WORKSPACE_PREFIX) && !liveKeys.has(key)
    );

    if (Object.keys(payload).length) await chrome.storage.sync.set(payload);
    if (staleKeys.length) await chrome.storage.sync.remove(staleKeys);
    await chrome.storage.sync.set({ [SYNC_MANIFEST_KEY]: manifest });

    meta = await writeSyncMeta({
      ...meta,
      lastSyncedAt: manifest.updatedAt,
      lastError: ""
    });
    return getSyncStatus(meta, manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    meta = await writeSyncMeta({ ...meta, lastError: message });
    throw new Error(message);
  }
}

async function pullState(): Promise<WorkspaceForgeState> {
  const manifest = await remoteManifest();
  if (!manifest) return readState();

  let meta = await readSyncMeta();
  const local = await readState();
  const remote = await readRemoteState(manifest);
  const tombstones = mergeTombstones(meta.tombstones, manifest.tombstones);
  const merged = mergeWorkspaceStates(local, remote, tombstones);
  await writeLocalState(merged);
  meta = await writeSyncMeta({
    ...meta,
    tombstones,
    lastSyncedAt: manifest.updatedAt,
    lastError: ""
  });
  return merged;
}

async function syncAfterWrite(state: WorkspaceForgeState): Promise<void> {
  const meta = await readSyncMeta();
  if (!meta.enabled) return;
  try {
    await publishState(state);
  } catch (error) {
    console.warn("Workspace Forge automatic sync failed:", error);
  }
}

async function writeState(state: WorkspaceForgeState): Promise<WorkspaceForgeState> {
  const normalized = await writeLocalState(state);
  await syncAfterWrite(normalized);
  return normalized;
}

async function getSyncStatus(
  suppliedMeta?: WorkspaceSyncMeta,
  suppliedManifest?: WorkspaceSyncManifest | null
): Promise<WorkspaceSyncStatus> {
  const meta = suppliedMeta || await readSyncMeta();
  const manifest = suppliedManifest === undefined ? await remoteManifest() : suppliedManifest;
  const bytesInUse = await chrome.storage.sync.getBytesInUse(null);
  return {
    enabled: meta.enabled,
    deviceId: meta.deviceId,
    lastSyncedAt: meta.lastSyncedAt,
    remoteUpdatedAt: manifest?.updatedAt || null,
    bytesInUse,
    state: !meta.enabled ? "off" : meta.lastError ? "error" : "ready",
    message: !meta.enabled
      ? "Sync is off. Workspaces remain local to this browser."
      : meta.lastError || "Workspace changes sync automatically."
  };
}

async function setSyncEnabled(enabled: boolean): Promise<WorkspaceSyncStatus> {
  let meta = await readSyncMeta();
  meta = await writeSyncMeta({ ...meta, enabled, lastError: "" });
  if (!enabled) return getSyncStatus(meta);

  const merged = await pullState();
  return publishState(merged);
}

async function pushSync(): Promise<WorkspaceSyncStatus> {
  const meta = await readSyncMeta();
  if (!meta.enabled) throw new Error("Enable Workspace Sync before pushing changes.");
  return publishState(await readState());
}

async function pullSync(): Promise<WorkspaceSyncStatus> {
  const meta = await readSyncMeta();
  if (!meta.enabled) throw new Error("Enable Workspace Sync before pulling changes.");
  const merged = await pullState();
  return publishState(merged);
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
  const sidePanel = chrome.sidePanel as typeof chrome.sidePanel | undefined;
  if (!sidePanel?.open) throw new Error("Workspace Forge requires Chrome 116 or newer for Side Panel support.");
  const targetId = windowId ?? (await lastFocusedWindow()).id;
  if (typeof targetId !== "number") throw new Error("No Chrome window is available.");
  await sidePanel.open({ windowId: targetId });
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
  const meta = clearWorkspaceTombstone(await readSyncMeta(), created.workspace.id);
  await writeSyncMeta(meta);
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
  const created = await chrome.windows.create({ url: workspace.tabs.map((tab: SavedTab) => tab.url) });
  if (typeof created.id !== "number") throw new Error("Chrome did not return the restored window.");
  const createdTabs = created.tabs?.length ? created.tabs : await chrome.tabs.query({ windowId: created.id });
  const unpinnedIds: number[] = [];
  for (const [index, tab] of createdTabs.entries()) {
    if (typeof tab.id !== "number") continue;
    const saved = workspace.tabs[index];
    if (saved?.pinned) await chrome.tabs.update(tab.id, { pinned: true });
    else unpinnedIds.push(tab.id);
  }
  if (unpinnedIds.length) {
    const groupId = await chrome.tabs.group({ tabIds: unpinnedIds, createProperties: { windowId: created.id } });
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
  const ids = matchingOpenTabIds(workspace.tabs, await chrome.tabs.query({}));
  if (ids.length) await chrome.tabs.remove(ids);
  return { closed: ids.length };
}

async function deleteWorkspace(workspaceId: string): Promise<WorkspaceForgeState> {
  const meta = recordWorkspaceDeletion(await readSyncMeta(), workspaceId);
  await writeSyncMeta(meta);
  return writeState(deleteWorkspaceFromState(await readState(), workspaceId));
}

async function handleMessage(message: WorkspaceRequest): Promise<unknown> {
  switch (message.type) {
    case "GET_STATE":
    case "EXPORT_STATE": return readState();
    case "OPEN_SIDE_PANEL": return openSidePanel(message.windowId);
    case "CREATE_WORKSPACE": {
      const created = createWorkspaceInState(await readState(), message.payload || {});
      await writeSyncMeta(clearWorkspaceTombstone(await readSyncMeta(), created.workspace.id));
      return writeState(created.state);
    }
    case "UPDATE_WORKSPACE":
      return writeState(updateWorkspaceInState(await readState(), message.workspaceId, message.patch as Partial<Workspace>));
    case "DELETE_WORKSPACE": return deleteWorkspace(message.workspaceId);
    case "SAVE_CURRENT_WINDOW": return saveCurrentWindow(message.payload);
    case "REPLACE_TABS_FROM_WINDOW": return replaceFromCurrentWindow(message.workspaceId);
    case "ADD_CURRENT_TAB": return addCurrentTab(message.workspaceId);
    case "OPEN_WORKSPACE": return restoreWorkspace(message.workspaceId);
    case "CLOSE_WORKSPACE_TABS": return closeWorkspaceTabs(message.workspaceId);
    case "SET_ACTIVE_WORKSPACE": return writeState(setActiveWorkspace(await readState(), message.workspaceId));
    case "IMPORT_STATE": return writeState(importWorkspaceState(await readState(), message.payload, message.mode || "merge"));
    case "GET_SYNC_STATUS": return getSyncStatus();
    case "SET_SYNC_ENABLED": return setSyncEnabled(message.enabled);
    case "PUSH_SYNC": return pushSync();
    case "PULL_SYNC": return pullSync();
    default: {
      const exhaustive: never = message;
      throw new Error(`Unsupported message: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function reportBackgroundError(context: string, error: unknown): void {
  console.error(`Workspace Forge ${context} failed:`, error);
}

async function initializeWorker(): Promise<void> {
  const sidePanel = chrome.sidePanel as typeof chrome.sidePanel | undefined;
  await initializeBackground(readState, sidePanel);
  const meta = await readSyncMeta();
  if (meta.enabled) await pullState();
}

chrome.runtime.onInstalled.addListener(() => {
  void runBackgroundTask("installation", initializeWorker, reportBackgroundError);
});
chrome.runtime.onStartup.addListener(() => {
  void runBackgroundTask("startup", initializeWorker, reportBackgroundError);
});
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-workspace-forge") {
    void runBackgroundTask("keyboard shortcut", () => openSidePanel(), reportBackgroundError);
  }
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes[SYNC_MANIFEST_KEY]?.newValue) return;
  void runBackgroundTask("remote sync", async () => {
    const meta = await readSyncMeta();
    const manifest = changes[SYNC_MANIFEST_KEY]?.newValue as WorkspaceSyncManifest;
    if (meta.enabled && manifest?.deviceId !== meta.deviceId) await pullState();
  }, reportBackgroundError);
});
chrome.runtime.onMessage.addListener((
  message: WorkspaceRequest,
  _sender,
  sendResponse: (response: WorkspaceResponse) => void
) => {
  void handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error: unknown) => {
      console.warn("Workspace Forge request failed:", error);
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});
