import {
  WORKSPACE_SYNC_SCHEMA_VERSION,
  type Workspace,
  type WorkspaceForgeState,
  type WorkspaceSyncManifest,
  type WorkspaceSyncPreferences
} from "./models";
import { normalizeState } from "./state";

export const SYNC_MANIFEST_KEY = "workspaceForgeSyncManifestV1";
export const SYNC_CHUNK_PREFIX = "workspaceForgeSyncChunkV1";
export const SYNC_PREFERENCES_KEY = "workspaceForgeSyncPreferencesV1";
export const SYNC_QUOTA_BYTES = 102_400;
export const SYNC_ITEM_BYTES = 8_192;
export const SYNC_CHUNK_CHAR_LIMIT = 7_000;

export interface EncodedWorkspaceSnapshot {
  manifest: WorkspaceSyncManifest;
  chunks: string[];
}

export function syncChunkKey(index: number): string {
  return `${SYNC_CHUNK_PREFIX}-${String(index).padStart(3, "0")}`;
}

export function createDeviceId(): string {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `device-${random[0]!.toString(36)}${random[1]!.toString(36)}`;
}

export function defaultSyncPreferences(deviceId = createDeviceId()): WorkspaceSyncPreferences {
  return {
    enabled: false,
    deviceId,
    lastSyncedRevision: 0,
    lastSyncedChecksum: "",
    lastSyncAt: null,
    dirty: false,
    lastError: "",
    conflict: null
  };
}

export function normalizeSyncPreferences(value: unknown): WorkspaceSyncPreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const fallback = defaultSyncPreferences();
  const conflictSource = source.conflict && typeof source.conflict === "object"
    ? source.conflict as Record<string, unknown>
    : null;
  return {
    enabled: Boolean(source.enabled),
    deviceId: typeof source.deviceId === "string" && source.deviceId ? source.deviceId : fallback.deviceId,
    lastSyncedRevision: typeof source.lastSyncedRevision === "number" ? source.lastSyncedRevision : 0,
    lastSyncedChecksum: typeof source.lastSyncedChecksum === "string" ? source.lastSyncedChecksum : "",
    lastSyncAt: typeof source.lastSyncAt === "number" ? source.lastSyncAt : null,
    dirty: Boolean(source.dirty),
    lastError: typeof source.lastError === "string" ? source.lastError : "",
    conflict: conflictSource &&
      typeof conflictSource.remoteRevision === "number" &&
      typeof conflictSource.remoteUpdatedAt === "number" &&
      typeof conflictSource.remoteDeviceId === "string" &&
      typeof conflictSource.remoteChecksum === "string"
      ? {
        remoteRevision: conflictSource.remoteRevision,
        remoteUpdatedAt: conflictSource.remoteUpdatedAt,
        remoteDeviceId: conflictSource.remoteDeviceId,
        remoteChecksum: conflictSource.remoteChecksum
      }
      : null
  };
}

export function normalizeSyncManifest(value: unknown): WorkspaceSyncManifest | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (
    source.schemaVersion !== WORKSPACE_SYNC_SCHEMA_VERSION ||
    typeof source.stateVersion !== "number" ||
    typeof source.revision !== "number" ||
    typeof source.updatedAt !== "number" ||
    typeof source.deviceId !== "string" ||
    typeof source.checksum !== "string" ||
    (source.compression !== "gzip" && source.compression !== "none") ||
    typeof source.chunkCount !== "number" ||
    typeof source.compressedBytes !== "number" ||
    typeof source.encodedBytes !== "number"
  ) return null;
  if (source.chunkCount < 1 || source.chunkCount > 512) return null;
  return source as unknown as WorkspaceSyncManifest;
}

function checksumBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function workspaceStateChecksum(state: WorkspaceForgeState): string {
  const normalized = normalizeState(state);
  return checksumBytes(new TextEncoder().encode(JSON.stringify({
    ...normalized,
    activeWorkspaceId: null
  })));
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  const block = 0x8000;
  for (let index = 0; index < bytes.length; index += block) {
    output += String.fromCharCode(...bytes.subarray(index, index + block));
  }
  return btoa(output);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function compress(bytes: Uint8Array): Promise<{ bytes: Uint8Array; compression: "gzip" | "none" }> {
  if (typeof CompressionStream === "undefined") return { bytes, compression: "none" };
  const stream = new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream("gzip"));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), compression: "gzip" };
}

async function decompress(bytes: Uint8Array, compression: "gzip" | "none"): Promise<Uint8Array> {
  if (compression === "none") return bytes;
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress the synced workspace snapshot.");
  const stream = new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function chunkEncodedSnapshot(value: string, chunkSize = SYNC_CHUNK_CHAR_LIMIT): string[] {
  if (!value) return [""];
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) chunks.push(value.slice(index, index + chunkSize));
  return chunks;
}

export function estimateSnapshotStorageBytes(manifest: WorkspaceSyncManifest, chunks: string[]): number {
  let total = new TextEncoder().encode(SYNC_MANIFEST_KEY + JSON.stringify(manifest)).length;
  chunks.forEach((chunk, index) => {
    total += new TextEncoder().encode(syncChunkKey(index) + JSON.stringify(chunk)).length;
  });
  return total;
}

export async function encodeWorkspaceSnapshot(
  state: WorkspaceForgeState,
  deviceId: string,
  revision: number,
  updatedAt = Date.now()
): Promise<EncodedWorkspaceSnapshot> {
  const normalized = normalizeState(state);
  const raw = new TextEncoder().encode(JSON.stringify(normalized));
  const compressed = await compress(raw);
  const encoded = bytesToBase64(compressed.bytes);
  const chunks = chunkEncodedSnapshot(encoded);
  const manifest: WorkspaceSyncManifest = {
    schemaVersion: WORKSPACE_SYNC_SCHEMA_VERSION,
    stateVersion: normalized.version,
    revision,
    updatedAt,
    deviceId,
    checksum: checksumBytes(compressed.bytes),
    compression: compressed.compression,
    chunkCount: chunks.length,
    compressedBytes: compressed.bytes.length,
    encodedBytes: encoded.length
  };
  const estimatedBytes = estimateSnapshotStorageBytes(manifest, chunks);
  if (estimatedBytes > SYNC_QUOTA_BYTES) {
    throw new Error(`Workspace library is too large for Chrome Sync (${estimatedBytes} of ${SYNC_QUOTA_BYTES} bytes). Use JSON export for this library.`);
  }
  for (const [index, chunk] of chunks.entries()) {
    const itemBytes = new TextEncoder().encode(syncChunkKey(index) + JSON.stringify(chunk)).length;
    if (itemBytes > SYNC_ITEM_BYTES) throw new Error(`Sync chunk ${index + 1} exceeds Chrome's per-item limit.`);
  }
  return { manifest, chunks };
}

export async function decodeWorkspaceSnapshot(
  manifestValue: unknown,
  chunks: string[]
): Promise<WorkspaceForgeState> {
  const manifest = normalizeSyncManifest(manifestValue);
  if (!manifest) throw new Error("The synced workspace manifest is invalid.");
  if (chunks.length !== manifest.chunkCount || chunks.some((chunk) => typeof chunk !== "string")) {
    throw new Error("The synced workspace snapshot is incomplete.");
  }
  const encoded = chunks.join("");
  if (encoded.length !== manifest.encodedBytes) throw new Error("The synced workspace snapshot length does not match its manifest.");
  const compressed = base64ToBytes(encoded);
  if (compressed.length !== manifest.compressedBytes || checksumBytes(compressed) !== manifest.checksum) {
    throw new Error("The synced workspace snapshot failed its integrity check.");
  }
  const raw = await decompress(compressed, manifest.compression);
  return normalizeState(JSON.parse(new TextDecoder().decode(raw)) as unknown);
}

export function mergeWorkspaceStates(localValue: WorkspaceForgeState, remoteValue: WorkspaceForgeState): WorkspaceForgeState {
  const local = normalizeState(localValue);
  const remote = normalizeState(remoteValue);
  const merged = new Map<string, Workspace>();
  for (const workspace of remote.workspaces) merged.set(workspace.id, workspace);
  for (const workspace of local.workspaces) {
    const candidate = merged.get(workspace.id);
    if (!candidate || workspace.updatedAt >= candidate.updatedAt) merged.set(workspace.id, workspace);
  }
  const workspaces = [...merged.values()].sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
  const activeCandidates = [local.activeWorkspaceId, remote.activeWorkspaceId];
  const activeWorkspaceId = activeCandidates.find((id) => id && workspaces.some((workspace) => workspace.id === id)) ?? workspaces[0]?.id ?? null;
  return normalizeState({ version: local.version, activeWorkspaceId, workspaces });
}
