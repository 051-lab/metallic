import type {
  Workspace,
  WorkspaceColor,
  WorkspaceForgeState,
  WorkspaceRequest,
  WorkspaceResponse,
  WorkspaceSyncManifest,
  WorkspaceSyncPreferences,
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
  SYNC_CHUNK_PREFIX,
  SYNC_MANIFEST_KEY,
  SYNC_PREFERENCES_KEY,
  SYNC_QUOTA_BYTES,
  decodeWorkspaceSnapshot,
  defaultSyncPreferences,
  encodeWorkspaceSnapshot,
  mergeWorkspaceStates,
  normalizeSyncManifest,
  normalizeSyncPreferences,
  syncChunkKey,
  workspaceStateChecksum
} from "../core/sync";

const STORAGE_KEY = "workspaceForgeState";

const GROUP_COLOR_MAP: Record<WorkspaceColor, NonNullable<chrome.tabGroups.UpdateProperties["color"]>> = {
  grey: "grey", blue: "blue", cyan: "cyan", green: "green", yellow: "yellow",
  orange: "orange", red: "red", pink: "pink", purple: "purple"
};

interface RemoteSnapshot {
  manifest: WorkspaceSyncManifest;
  state: WorkspaceForgeState;
}

async function readState(): Promise<WorkspaceForgeState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const normalized = normalizeState(stored[STORAGE_KEY] ?? emptyState());
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

async function readSyncPreferences(): Promise<WorkspaceSyncPreferences> {
  const stored = await chrome.storage.local.get(SYNC_PREFERENCES_KEY);
  const preferences = normalizeSyncPreferences(stored[SYNC_PREFERENCES_KEY]);
  await chrome.storage.local.set({ [SYNC_PREFERENCES_KEY]: preferences });
  return preferences;
}

async function saveSyncPreferences(preferences: WorkspaceSyncPreferences): Promise<WorkspaceSyncPreferences> {
  const normalized = normalizeSyncPreferences(preferences);
  await chrome.storage.local.set({ [SYNC_PREFERENCES_KEY]: normalized });
  return normalized;
}

async function remoteManifest(): Promise<WorkspaceSyncManifest | null> {
  const stored = await chrome.storage.sync.get(SYNC_MANIFEST_KEY);
  return normalizeSyncManifest(stored[SYNC_MANIFEST_KEY]);
}

async function readRemoteSnapshot(): Promise<RemoteSnapshot | null> {
  const manifest = await remoteManifest();
  if (!manifest) return null;
  const keys = Array.from({ length: manifest.chunkCount }, (_, index) => syncChunkKey(index));
  const stored = await chrome.storage.sync.get(keys);
  const chunks = keys.map((key) => stored[key]).filter((value): value is string => typeof value === "string");
  const state = await decodeWorkspaceSnapshot(manifest, chunks);
  return { manifest, state };
}

async function removeObsoleteChunks(chunkCount: number): Promise<void> {
  const all = await chrome.storage.sync.get(null);
  const obsolete = Object.keys(all).filter((key) => {
    if (!key.startsWith(`${SYNC_CHUNK_PREFIX}-`)) return false;
    const index = Number(key.slice(SYNC_CHUNK_PREFIX.length + 1));
    return Number.isFinite(index) && index >= chunkCount;
  });
  if (obsolete.length) await chrome.storage.sync.remove(obsolete);
}

async function pushLocalSnapshot(
  state: WorkspaceForgeState,
  preferencesValue?: WorkspaceSyncPreferences
): Promise<WorkspaceSyncPreferences> {
  let preferences = preferencesValue ?? await readSyncPreferences();
  if (!preferences.enabled) return preferences;
  const existing = await remoteManifest();
  const revision = Math.max(existing?.revision ?? 0, preferences.lastSyncedRevision) + 1;
  const encoded = await encodeWorkspaceSnapshot(state, preferences.deviceId, revision);
  const entries: Record<string, unknown> = { [SYNC_MANIFEST_KEY]: encoded.manifest };
  encoded.chunks.forEach((chunk, index) => { entries[syncChunkKey(index)] = chunk; });
  await chrome.storage.sync.set(entries);
  await removeObsoleteChunks(encoded.chunks.length);
  preferences = await saveSyncPreferences({
    ...preferences,
    lastSyncedRevision: encoded.manifest.revision,
    lastSyncedChecksum: encoded.manifest.checksum,
    lastSyncAt: encoded.manifest.updatedAt,
    dirty: false,
    lastError: "",
    conflict: null
  });
  return preferences;
}

async function markDirtyAndPush(state: WorkspaceForgeState): Promise<void> {
  let preferences = await readSyncPreferences();
  if (!preferences.enabled) return;
  preferences = await saveSyncPreferences({ ...preferences, dirty: true, lastError: "" });
  try {
    await pushLocalSnapshot(state, preferences);
  } catch (error) {
    await saveSyncPreferences({
      ...preferences,
      dirty: true,
      lastError: error instanceof Error ? error.message : String(error)
    });
  }
}

async function writeState(state: WorkspaceForgeState): Promise<WorkspaceForgeState> {
  const normalized = normalizeState(state);
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  await markDirtyAndPush(normalized);
  return normalized;
}

async function applyRemoteSnapshot(snapshot: RemoteSnapshot, preferencesValue?: WorkspaceSyncPreferences): Promise<WorkspaceForgeState> {
  const normalized = normalizeState(snapshot.state);
  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  const preferences = preferencesValue ?? await readSyncPreferences();
  await saveSyncPreferences({
    ...preferences,
    lastSyncedRevision: snapshot.manifest.revision,
    lastSyncedChecksum: snapshot.manifest.checksum,
    lastSyncAt: Date.now(),
    dirty: false,
    lastError: "",
    conflict: null
  });
  return normalized;
}

async function setConflict(snapshot: RemoteSnapshot, preferencesValue?: WorkspaceSyncPreferences): Promise<void> {
  const preferences = preferencesValue ?? await readSyncPreferences();
  await saveSyncPreferences({
    ...preferences,
    lastError: "",
    conflict: {
      remoteRevision: snapshot.manifest.revision,
      remoteUpdatedAt: snapshot.manifest.updatedAt,
      remoteDeviceId: snapshot.manifest.deviceId,
      remoteChecksum: snapshot.manifest.checksum
    }
  });
}

async function enableSync(): Promise<WorkspaceSyncStatus> {
  let preferences = await readSyncPreferences();
  preferences = await saveSyncPreferences({ ...preferences, enabled: true, lastError: "" });
  const local = await readState();
  const remote = await readRemoteSnapshot();
  if (!remote) {
    await pushLocalSnapshot(local, preferences);
    return getSyncStatus();
  }
  const localChecksum = workspaceStateChecksum(local);
  const remoteChecksum = workspaceStateChecksum(remote.state);
  if (localChecksum === remoteChecksum) {
    await saveSyncPreferences({
      ...preferences,
      lastSyncedRevision: remote.manifest.revision,
      lastSyncedChecksum: remote.manifest.checksum,
      lastSyncAt: Date.now(),
      dirty: false,
      conflict: null
    });
  } else if (!local.workspaces.length) {
    await applyRemoteSnapshot(remote, preferences);
  } else if (!remote.state.workspaces.length || (
    remote.manifest.deviceId === preferences.deviceId &&
    remote.manifest.revision <= preferences.lastSyncedRevision
  )) {
    await pushLocalSnapshot(local, preferences);
  } else {
    await setConflict(remote, { ...preferences, dirty: true });
  }
  return getSyncStatus();
}

async function disableSync(): Promise<WorkspaceSyncStatus> {
  const preferences = await readSyncPreferences();
  await saveSyncPreferences({ ...preferences, enabled: false, conflict: null, lastError: "" });
  return getSyncStatus();
}

async function syncNow(): Promise<WorkspaceSyncStatus> {
  let preferences = await readSyncPreferences();
  if (!preferences.enabled) throw new Error("Enable Chrome Sync before syncing this workspace library.");
  if (preferences.conflict) return getSyncStatus();
  const local = await readState();
  const remote = await readRemoteSnapshot();
  if (!remote) {
    await pushLocalSnapshot(local, preferences);
    return getSyncStatus();
  }
  const localChecksum = workspaceStateChecksum(local);
  const remoteChecksum = workspaceStateChecksum(remote.state);
  if (localChecksum === remoteChecksum) {
    await saveSyncPreferences({
      ...preferences,
      lastSyncedRevision: remote.manifest.revision,
      lastSyncedChecksum: remote.manifest.checksum,
      lastSyncAt: Date.now(),
      dirty: false,
      lastError: ""
    });
  } else if (preferences.dirty) {
    if (remote.manifest.deviceId === preferences.deviceId && remote.manifest.revision <= preferences.lastSyncedRevision) {
      await pushLocalSnapshot(local, preferences);
    } else {
      await setConflict(remote, preferences);
    }
  } else if (remote.manifest.revision > preferences.lastSyncedRevision) {
    await applyRemoteSnapshot(remote, preferences);
  } else {
    await pushLocalSnapshot(local, preferences);
  }
  return getSyncStatus();
}

async function resolveConflict(resolution: "local" | "remote" | "merge"): Promise<WorkspaceSyncStatus> {
  let preferences = await readSyncPreferences();
  if (!preferences.enabled) throw new Error("Chrome Sync is disabled.");
  const remote = await readRemoteSnapshot();
  if (!remote) {
    await pushLocalSnapshot(await readState(), { ...preferences, conflict: null });
    return getSyncStatus();
  }
  if (resolution === "remote") {
    await applyRemoteSnapshot(remote, preferences);
  } else if (resolution === "local") {
    preferences = await saveSyncPreferences({ ...preferences, conflict: null, dirty: true });
    await pushLocalSnapshot(await readState(), preferences);
  } else {
    const merged = mergeWorkspaceStates(await readState(), remote.state);
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
    preferences = await saveSyncPreferences({ ...preferences, conflict: null, dirty: true });
    await pushLocalSnapshot(merged, preferences);
  }
  return getSyncStatus();
}

async function deleteSyncCopy(): Promise<WorkspaceSyncStatus> {
  const all = await chrome.storage.sync.get(null);
  const keys = Object.keys(all).filter((key) => key === SYNC_MANIFEST_KEY || key.startsWith(`${SYNC_CHUNK_PREFIX}-`));
  if (keys.length) await chrome.storage.sync.remove(keys);
  const preferences = await readSyncPreferences();
  await saveSyncPreferences({
    ...preferences,
    enabled: false,
    lastSyncedRevision: 0,
    lastSyncedChecksum: "",
    lastSyncAt: null,
    dirty: false,
    lastError: "",
    conflict: null
  });
  return getSyncStatus();
}

async function getSyncStatus(): Promise<WorkspaceSyncStatus> {
  const preferences = await readSyncPreferences();
  const manifest = await remoteManifest();
  const bytesInUse = await chrome.storage.sync.getBytesInUse(null);
  let phase: WorkspaceSyncStatus["phase"] = "disabled";
  let message = "Chrome account sync is off. JSON export remains available for other browsers.";
  if (preferences.enabled) {
    if (preferences.conflict) {
      phase = "conflict";
      message = "This browser and the synced library both changed. Choose which copy to keep or merge them.";
    } else if (preferences.lastError) {
      phase = "error";
      message = preferences.lastError;
    } else if (preferences.dirty) {
      phase = "pending";
      message = "Local changes are waiting to sync.";
    } else {
      phase = "synced";
      message = manifest ? "Workspace library is synced through Chrome Sync." : "Sync is enabled; no cloud snapshot exists yet.";
    }
  }
  return {
    enabled: preferences.enabled,
    phase,
    message,
    deviceId: preferences.deviceId,
    dirty: preferences.dirty,
    lastSyncAt: preferences.lastSyncAt,
    remoteRevision: manifest?.revision ?? null,
    remoteUpdatedAt: manifest?.updatedAt ?? null,
    remoteDeviceId: manifest?.deviceId ?? null,
    bytesInUse,
    quotaBytes: SYNC_QUOTA_BYTES,
    conflict: preferences.conflict
  };
}

async function lastFocusedWindow(): Promise<chrome.windows.Window> {
  const browserWindow = await chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] });
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
  return writeState(created.state);
}

async function replaceFromCurrentWindow(workspaceId: string): Promise<WorkspaceForgeState> {
  const browserWindow = await lastFocusedWindow();
  return writeState(replaceWorkspaceTabs(await readState(), workspaceId, savedTabsFromChrome(browserWindow.tabs || [])));
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
  const createdTabs = created.tabs?.length ? created.tabs : await chrome.tabs.query({ windowId: created.id });
  const unpinnedIds: number[] = [];
  for (const [index, tab] of createdTabs.entries()) {
    if (typeof tab.id !== "number") continue;
    if (workspace.tabs[index]?.pinned) await chrome.tabs.update(tab.id, { pinned: true });
    else unpinnedIds.push(tab.id);
  }
  if (unpinnedIds.length) {
    const groupId = await chrome.tabs.group({ tabIds: unpinnedIds, createProperties: { windowId: created.id } });
    await chrome.tabGroups.update(groupId, { title: workspace.name.slice(0, 40), color: GROUP_COLOR_MAP[workspace.color], collapsed: false });
  }
  return { windowId: created.id, tabCount: createdTabs.length };
}

async function closeWorkspaceTabs(workspaceId: string): Promise<{ closed: number }> {
  const workspace = workspaceById(await readState(), workspaceId);
  const ids = matchingOpenTabIds(workspace.tabs, await chrome.tabs.query({}));
  if (ids.length) await chrome.tabs.remove(ids);
  return { closed: ids.length };
}

async function handleMessage(message: WorkspaceRequest): Promise<unknown> {
  switch (message.type) {
    case "GET_STATE": case "EXPORT_STATE": return readState();
    case "OPEN_SIDE_PANEL": return openSidePanel(message.windowId);
    case "CREATE_WORKSPACE": {
      const created = createWorkspaceInState(await readState(), message.payload || {});
      return writeState(created.state);
    }
    case "UPDATE_WORKSPACE": return writeState(updateWorkspaceInState(await readState(), message.workspaceId, message.patch as Partial<Workspace>));
    case "DELETE_WORKSPACE": return writeState(deleteWorkspaceFromState(await readState(), message.workspaceId));
    case "SAVE_CURRENT_WINDOW": return saveCurrentWindow(message.payload);
    case "REPLACE_TABS_FROM_WINDOW": return replaceFromCurrentWindow(message.workspaceId);
    case "ADD_CURRENT_TAB": return addCurrentTab(message.workspaceId);
    case "OPEN_WORKSPACE": return restoreWorkspace(message.workspaceId);
    case "CLOSE_WORKSPACE_TABS": return closeWorkspaceTabs(message.workspaceId);
    case "SET_ACTIVE_WORKSPACE": return writeState(setActiveWorkspace(await readState(), message.workspaceId));
    case "IMPORT_STATE": return writeState(importWorkspaceState(await readState(), message.payload, message.mode || "merge"));
    case "GET_SYNC_STATUS": return getSyncStatus();
    case "ENABLE_SYNC": return enableSync();
    case "DISABLE_SYNC": return disableSync();
    case "SYNC_NOW": return syncNow();
    case "RESOLVE_SYNC_CONFLICT": return resolveConflict(message.resolution);
    case "DELETE_SYNC_COPY": return deleteSyncCopy();
    default: {
      const exhaustive: never = message;
      throw new Error(`Unsupported message: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function reportBackgroundError(context: string, error: unknown): void {
  console.error(`Workspace Forge ${context} failed:`, error);
}

function initializeWorker(): Promise<void> {
  const sidePanel = chrome.sidePanel as typeof chrome.sidePanel | undefined;
  return initializeBackground(async () => {
    await readState();
    await readSyncPreferences();
    const preferences = await readSyncPreferences();
    if (preferences.enabled) await syncNow();
  }, sidePanel);
}

chrome.runtime.onInstalled.addListener(() => { void runBackgroundTask("installation", initializeWorker, reportBackgroundError); });
chrome.runtime.onStartup.addListener(() => { void runBackgroundTask("startup", initializeWorker, reportBackgroundError); });
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-workspace-forge") void runBackgroundTask("keyboard shortcut", () => openSidePanel(), reportBackgroundError);
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes[SYNC_MANIFEST_KEY]?.newValue) return;
  void runBackgroundTask("remote sync update", async () => {
    const preferences = await readSyncPreferences();
    if (!preferences.enabled) return;
    const manifest = normalizeSyncManifest(changes[SYNC_MANIFEST_KEY]!.newValue);
    if (!manifest || manifest.deviceId === preferences.deviceId || manifest.revision <= preferences.lastSyncedRevision) return;
    const remote = await readRemoteSnapshot();
    if (!remote) return;
    if (preferences.dirty) await setConflict(remote, preferences);
    else await applyRemoteSnapshot(remote, preferences);
  }, reportBackgroundError);
});
chrome.runtime.onMessage.addListener((message: WorkspaceRequest, _sender, sendResponse: (response: WorkspaceResponse) => void) => {
  void handleMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error: unknown) => {
      console.warn("Workspace Forge request failed:", error);
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});
