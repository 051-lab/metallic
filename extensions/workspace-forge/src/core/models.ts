export const WORKSPACE_STATE_VERSION = 3;
export const WORKSPACE_SYNC_SCHEMA_VERSION = 1;

export type WorkspaceColor =
  | "grey"
  | "blue"
  | "cyan"
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "pink"
  | "purple";

export interface SavedTab {
  id: string;
  url: string;
  title: string;
  favIconUrl: string;
  pinned: boolean;
  group: string;
  savedAt: number;
}

export interface WorkspaceTask {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  color: WorkspaceColor;
  status: "active" | "archived";
  notes: string;
  nextAction: string;
  createdAt: number;
  updatedAt: number;
  tabs: SavedTab[];
  tasks: WorkspaceTask[];
}

export interface WorkspaceForgeState {
  version: number;
  activeWorkspaceId: string | null;
  workspaces: Workspace[];
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  color: WorkspaceColor;
  notes: string;
  nextAction: string;
  tasks: string[];
}

export type SyncPhase = "disabled" | "synced" | "pending" | "conflict" | "error";
export type SyncConflictResolution = "local" | "remote" | "merge";

export interface WorkspaceSyncManifest {
  schemaVersion: number;
  stateVersion: number;
  revision: number;
  updatedAt: number;
  deviceId: string;
  checksum: string;
  compression: "gzip" | "none";
  chunkCount: number;
  compressedBytes: number;
  encodedBytes: number;
}

export interface WorkspaceSyncConflict {
  remoteRevision: number;
  remoteUpdatedAt: number;
  remoteDeviceId: string;
  remoteChecksum: string;
}

export interface WorkspaceSyncPreferences {
  enabled: boolean;
  deviceId: string;
  lastSyncedRevision: number;
  lastSyncedChecksum: string;
  lastSyncAt: number | null;
  dirty: boolean;
  lastError: string;
  conflict: WorkspaceSyncConflict | null;
}

export interface WorkspaceSyncStatus {
  enabled: boolean;
  phase: SyncPhase;
  message: string;
  deviceId: string;
  dirty: boolean;
  lastSyncAt: number | null;
  remoteRevision: number | null;
  remoteUpdatedAt: number | null;
  remoteDeviceId: string | null;
  bytesInUse: number;
  quotaBytes: number;
  conflict: WorkspaceSyncConflict | null;
}

export type WorkspaceRequest =
  | { type: "GET_STATE" }
  | { type: "OPEN_SIDE_PANEL"; windowId?: number }
  | { type: "CREATE_WORKSPACE"; payload?: Partial<Workspace> }
  | { type: "UPDATE_WORKSPACE"; workspaceId: string; patch: Partial<Workspace> }
  | { type: "DELETE_WORKSPACE"; workspaceId: string }
  | { type: "SAVE_CURRENT_WINDOW"; payload?: { name?: string; color?: WorkspaceColor } }
  | { type: "REPLACE_TABS_FROM_WINDOW"; workspaceId: string }
  | { type: "ADD_CURRENT_TAB"; workspaceId: string }
  | { type: "OPEN_WORKSPACE"; workspaceId: string }
  | { type: "CLOSE_WORKSPACE_TABS"; workspaceId: string }
  | { type: "SET_ACTIVE_WORKSPACE"; workspaceId: string | null }
  | { type: "IMPORT_STATE"; payload: unknown; mode?: "merge" | "replace" }
  | { type: "EXPORT_STATE" }
  | { type: "GET_SYNC_STATUS" }
  | { type: "ENABLE_SYNC" }
  | { type: "DISABLE_SYNC" }
  | { type: "SYNC_NOW" }
  | { type: "RESOLVE_SYNC_CONFLICT"; resolution: SyncConflictResolution }
  | { type: "DELETE_SYNC_COPY" };

export interface WorkspaceResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error?: string;
}
