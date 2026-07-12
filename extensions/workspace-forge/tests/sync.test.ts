import {
  buildSyncManifest,
  mergeTombstones,
  mergeWorkspaceStates,
  normalizeSyncMeta,
  recordWorkspaceDeletion,
  validateSyncPayload
} from "../src/core/sync";
import { normalizeState } from "../src/core/state";

function workspace(id: string, name: string, updatedAt: number) {
  return normalizeState({
    activeWorkspaceId: id,
    workspaces: [{ id, name, createdAt: 1, updatedAt }]
  }, updatedAt, () => "generated").workspaces[0]!;
}

describe("workspace sync", () => {
  it("creates stable local sync metadata", () => {
    const meta = normalizeSyncMeta({}, () => "device-a");
    expect(meta).toMatchObject({ enabled: false, deviceId: "device-a", lastSyncedAt: null });
  });

  it("prefers the newest workspace revision", () => {
    const local = normalizeState({ activeWorkspaceId: "same", workspaces: [workspace("same", "Local", 100)] });
    const remote = normalizeState({ activeWorkspaceId: "same", workspaces: [workspace("same", "Remote", 200)] });
    const merged = mergeWorkspaceStates(local, remote, {});
    expect(merged.workspaces[0]?.name).toBe("Remote");
  });

  it("unions independent workspaces from different browsers", () => {
    const local = normalizeState({ workspaces: [workspace("one", "One", 100)] });
    const remote = normalizeState({ workspaces: [workspace("two", "Two", 200)] });
    const merged = mergeWorkspaceStates(local, remote, {});
    expect(merged.workspaces.map((item) => item.id)).toEqual(["two", "one"]);
  });

  it("honors the newest deletion tombstone", () => {
    const local = normalizeState({ workspaces: [workspace("one", "One", 100)] });
    const remote = normalizeState({ workspaces: [workspace("one", "Remote", 150)] });
    const merged = mergeWorkspaceStates(local, remote, { one: 200 });
    expect(merged.workspaces).toEqual([]);
  });

  it("keeps a workspace edited after an older deletion", () => {
    const local = normalizeState({ workspaces: [workspace("one", "Recovered", 300)] });
    const merged = mergeWorkspaceStates(local, normalizeState({ workspaces: [] }), { one: 200 });
    expect(merged.workspaces[0]?.name).toBe("Recovered");
  });

  it("merges tombstones and records local deletion time", () => {
    const base = normalizeSyncMeta({ deviceId: "device-a" });
    const deleted = recordWorkspaceDeletion(base, "one", 300);
    expect(mergeTombstones(deleted.tombstones, { one: 200, two: 400 })).toEqual({ one: 300, two: 400 });
  });

  it("rejects a workspace larger than the per-item sync budget", () => {
    const state = normalizeState({
      activeWorkspaceId: "large",
      workspaces: [{ id: "large", name: "Large", notes: "x".repeat(8_000), updatedAt: 100 }]
    });
    const meta = normalizeSyncMeta({ enabled: true, deviceId: "device-a" });
    const manifest = buildSyncManifest(state, meta, 100);
    expect(() => validateSyncPayload(manifest, state.workspaces)).toThrow("too large to sync");
  });
});
