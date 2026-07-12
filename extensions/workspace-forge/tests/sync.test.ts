import {
  SYNC_CHUNK_CHAR_LIMIT,
  chunkEncodedSnapshot,
  decodeWorkspaceSnapshot,
  defaultSyncPreferences,
  encodeWorkspaceSnapshot,
  mergeWorkspaceStates,
  normalizeSyncPreferences,
  workspaceStateChecksum
} from "../src/core/sync";
import type { WorkspaceForgeState } from "../src/core/models";

function state(name: string, updatedAt = 10): WorkspaceForgeState {
  return {
    version: 3,
    activeWorkspaceId: "w1",
    workspaces: [{
      id: "w1",
      name,
      color: "blue",
      status: "active",
      notes: "α notes",
      nextAction: "Ship it",
      createdAt: 1,
      updatedAt,
      tabs: [{
        id: "t1",
        url: "https://example.com",
        title: "Example",
        favIconUrl: "",
        pinned: false,
        group: "General",
        savedAt: 1
      }],
      tasks: []
    }]
  };
}

describe("workspace sync codec", () => {
  it("round-trips compressed workspace state", async () => {
    const source = state("Research Workspace");
    const encoded = await encodeWorkspaceSnapshot(source, "device-a", 4, 1000);
    expect(encoded.manifest.revision).toBe(4);
    expect(encoded.chunks.every((chunk) => chunk.length <= SYNC_CHUNK_CHAR_LIMIT)).toBe(true);
    await expect(decodeWorkspaceSnapshot(encoded.manifest, encoded.chunks)).resolves.toEqual(source);
  });

  it("rejects a corrupted snapshot", async () => {
    const encoded = await encodeWorkspaceSnapshot(state("A"), "device-a", 1);
    const chunks = [...encoded.chunks];
    chunks[0] = `${chunks[0]!.slice(0, -1)}A`;
    await expect(decodeWorkspaceSnapshot(encoded.manifest, chunks)).rejects.toThrow(/integrity|length/);
  });

  it("chunks encoded strings deterministically", () => {
    expect(chunkEncodedSnapshot("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });
});

describe("workspace sync merge", () => {
  it("keeps the newest version of a shared workspace", () => {
    const local = state("Local", 20);
    const remote = state("Remote", 10);
    expect(mergeWorkspaceStates(local, remote).workspaces[0]?.name).toBe("Local");
  });

  it("preserves workspaces unique to either library", () => {
    const local = state("Local", 20);
    const remote = state("Remote", 10);
    remote.workspaces[0]!.id = "w2";
    remote.activeWorkspaceId = "w2";
    expect(mergeWorkspaceStates(local, remote).workspaces.map((workspace) => workspace.id).sort()).toEqual(["w1", "w2"]);
  });
});

describe("workspace sync preferences", () => {
  it("repairs incomplete stored preferences", () => {
    const preferences = normalizeSyncPreferences({ enabled: true, deviceId: "device-a", dirty: true });
    expect(preferences.enabled).toBe(true);
    expect(preferences.deviceId).toBe("device-a");
    expect(preferences.lastSyncedRevision).toBe(0);
  });

  it("creates stable checksums for normalized state", () => {
    expect(workspaceStateChecksum(state("A"))).toBe(workspaceStateChecksum(state("A")));
    expect(workspaceStateChecksum(state("A"))).not.toBe(workspaceStateChecksum(state("B")));
  });

  it("creates disabled defaults", () => {
    expect(defaultSyncPreferences("device-a")).toMatchObject({ enabled: false, deviceId: "device-a", dirty: false });
  });
});
