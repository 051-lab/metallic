import type { Workspace, WorkspaceForgeState } from "./models";
import { normalizeState } from "./state";

export const SYNC_SCHEMA_VERSION = 1;
export const SYNC_MANIFEST_KEY = "workspaceForgeSyncManifestV1";
export const SYNC_WORKSPACE_PREFIX = "workspaceForgeSyncWorkspaceV1:";
export const SYNC_ITEM_SOFT_LIMIT = 7_500;
export const SYNC_TOTAL_SOFT_LIMIT = 95_000;

export interface WorkspaceSyncManifest {
  version: 1;
  deviceId: string;
  updatedAt: number;
  activeWorkspaceId: string | null;
  workspaceIds: string[];
  tombstones: Record<string, number>;
}

export interface WorkspaceSyncMeta {
  enabled: boolean;
  deviceId: string;
  lastSyncedAt: number | null;
  lastError: string;
  tombstones: Record<string, number>;
}

export interface WorkspaceSyncStatus {
  enabled: boolean;
  deviceId: string;
  lastSyncedAt: number | null;
  remoteUpdatedAt: number | null;
  bytesInUse: number;
  state: "off" | "ready" | "error";
  message: string;
}

export function workspaceSyncKey(workspaceId: string): string {
  return `${SYNC_WORKSPACE_PREFIX}${workspaceId}`;
}

export function createDeviceId(): string {
  const values = crypto.getRandomValues(new Uint32Array(2));
  return `device-${Date.now().toString(36)}-${values[0]?.toString(36)}${values[1]?.toString(36)}`;
}

export function normalizeSyncMeta(value: unknown, deviceIdFactory = createDeviceId): WorkspaceSyncMeta {
  const source = value && typeof value === "object" ? value as Partial<WorkspaceSyncMeta> : {};
  const tombstones = source.tombstones && typeof source.tombstones === "object"
    ? Object.fromEntries(Object.entries(source.tombstones).filter(([, deletedAt]) =>
      typeof deletedAt === "number" && Number.isFinite(deletedAt)
    ))
    : {};
  return {
    enabled: Boolean(source.enabled),
    deviceId: typeof source.deviceId === "string" && source.deviceId ? source.deviceId : deviceIdFactory(),
    lastSyncedAt: typeof source.lastSyncedAt === "number" && Number.isFinite(source.lastSyncedAt)
      ? source.lastSyncedAt
      : null,
    lastError: typeof source.lastError === "string" ? source.lastError : "",
    tombstones
  };
}

export function recordWorkspaceDeletion(
  meta: WorkspaceSyncMeta,
  workspaceId: string,
  deletedAt = Date.now()
): WorkspaceSyncMeta {
  return {
    ...meta,
    tombstones: { ...meta.tombstones, [workspaceId]: deletedAt }
  };
}

export function clearWorkspaceTombstone(meta: WorkspaceSyncMeta, workspaceId: string): WorkspaceSyncMeta {
  if (!(workspaceId in meta.tombstones)) return meta;
  const tombstones = { ...meta.tombstones };
  delete tombstones[workspaceId];
  return { ...meta, tombstones };
}

export function mergeTombstones(
  local: Record<string, number>,
  remote: Record<string, number>
): Record<string, number> {
  const merged = { ...local };
  for (const [workspaceId, deletedAt] of Object.entries(remote)) {
    merged[workspaceId] = Math.max(merged[workspaceId] || 0, deletedAt);
  }
  return merged;
}

export function mergeWorkspaceStates(
  localValue: WorkspaceForgeState,
  remoteValue: WorkspaceForgeState,
  tombstones: Record<string, number>
): WorkspaceForgeState {
  const local = normalizeState(localValue);
  const remote = normalizeState(remoteValue);
  const workspaces = new Map<string, Workspace>();

  for (const workspace of [...local.workspaces, ...remote.workspaces]) {
    const current = workspaces.get(workspace.id);
    if (!current || workspace.updatedAt > current.updatedAt) workspaces.set(workspace.id, workspace);
  }

  for (const [workspaceId, deletedAt] of Object.entries(tombstones)) {
    const workspace = workspaces.get(workspaceId);
    if (workspace && deletedAt >= workspace.updatedAt) workspaces.delete(workspaceId);
  }

  const mergedWorkspaces = [...workspaces.values()].sort((left, right) => right.updatedAt - left.updatedAt);
  const preferredActiveId = remote.activeWorkspaceId || local.activeWorkspaceId;
  const activeWorkspaceId = preferredActiveId && workspaces.has(preferredActiveId)
    ? preferredActiveId
    : mergedWorkspaces[0]?.id || null;

  return normalizeState({
    version: Math.max(local.version, remote.version),
    activeWorkspaceId,
    workspaces: mergedWorkspaces
  });
}

export function buildSyncManifest(
  state: WorkspaceForgeState,
  meta: WorkspaceSyncMeta,
  updatedAt = Date.now()
): WorkspaceSyncManifest {
  return {
    version: SYNC_SCHEMA_VERSION,
    deviceId: meta.deviceId,
    updatedAt,
    activeWorkspaceId: state.activeWorkspaceId,
    workspaceIds: state.workspaces.map((workspace) => workspace.id),
    tombstones: meta.tombstones
  };
}

export function serializedBytes(key: string, value: unknown): number {
  return new TextEncoder().encode(key + JSON.stringify(value)).byteLength;
}

export function validateSyncPayload(
  manifest: WorkspaceSyncManifest,
  workspaces: Workspace[]
): { totalBytes: number } {
  let totalBytes = serializedBytes(SYNC_MANIFEST_KEY, manifest);
  for (const workspace of workspaces) {
    const bytes = serializedBytes(workspaceSyncKey(workspace.id), workspace);
    if (bytes > SYNC_ITEM_SOFT_LIMIT) {
      throw new Error(`Workspace “${workspace.name}” is too large to sync. Shorten its notes or remove saved tabs.`);
    }
    totalBytes += bytes;
  }
  if (totalBytes > SYNC_TOTAL_SOFT_LIMIT) {
    throw new Error("The workspace library is too large for Chrome Sync. Export JSON or reduce saved workspace data.");
  }
  return { totalBytes };
}
