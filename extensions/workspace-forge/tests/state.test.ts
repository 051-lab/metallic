import {
  addTabToWorkspace,
  createWorkspaceInState,
  deleteWorkspaceFromState,
  emptyState,
  importWorkspaceState,
  normalizeState,
  replaceWorkspaceTabs,
  updateWorkspaceInState
} from "../src/core/state";

function ids() {
  let index = 0;
  return (prefix: string) => `${prefix}-${++index}`;
}

describe("workspace state", () => {
  it("normalizes legacy state and repairs the active workspace", () => {
    const state = normalizeState({
      version: 1,
      activeWorkspaceId: "missing",
      workspaces: [{ id: "one", name: "Research", tasks: ["Collect sources"] }]
    }, 100, ids());

    expect(state.version).toBe(3);
    expect(state.activeWorkspaceId).toBe("one");
    expect(state.workspaces[0]?.tasks[0]?.text).toBe("Collect sources");
  });

  it("creates, updates, and deletes a workspace without losing identity", () => {
    const factory = ids();
    const created = createWorkspaceInState(emptyState(), { name: "Auralis", notes: "Initial" }, 100, factory);
    const workspaceId = created.workspace.id;
    const updated = updateWorkspaceInState(created.state, workspaceId, { notes: "Revised" }, 200, factory);
    expect(updated.workspaces[0]?.id).toBe(workspaceId);
    expect(updated.workspaces[0]?.notes).toBe("Revised");
    expect(updated.workspaces[0]?.updatedAt).toBe(200);

    const deleted = deleteWorkspaceFromState(updated, workspaceId);
    expect(deleted.workspaces).toEqual([]);
    expect(deleted.activeWorkspaceId).toBeNull();
  });

  it("replaces tabs while preserving notes and tasks", () => {
    const factory = ids();
    const created = createWorkspaceInState(emptyState(), {
      name: "Metallic",
      notes: "Keep this",
      tasks: ["Validate"]
    }, 100, factory);
    const workspaceId = created.workspace.id;
    const next = replaceWorkspaceTabs(created.state, workspaceId, [{
      id: "tab-1",
      url: "https://github.com/051-lab/metallic",
      title: "Metallic",
      favIconUrl: "",
      pinned: false,
      group: "General",
      savedAt: 200
    }], 200);

    expect(next.workspaces[0]?.notes).toBe("Keep this");
    expect(next.workspaces[0]?.tasks).toHaveLength(1);
    expect(next.workspaces[0]?.tabs).toHaveLength(1);
  });

  it("deduplicates an added tab by normalized URL", () => {
    const factory = ids();
    const created = createWorkspaceInState(emptyState(), {
      name: "Research",
      tabs: [{ id: "old", url: "https://example.com/page/#old", title: "Old" }]
    }, 100, factory);
    const next = addTabToWorkspace(created.state, created.workspace.id, {
      id: "new",
      url: "https://example.com/page",
      title: "New",
      favIconUrl: "",
      pinned: false,
      group: "General",
      savedAt: 200
    }, 200);
    expect(next.workspaces[0]?.tabs.map((tab) => tab.id)).toEqual(["new"]);
  });

  it("reassigns colliding workspace IDs during merge import", () => {
    const factory = ids();
    const current = normalizeState({
      activeWorkspaceId: "same",
      workspaces: [{ id: "same", name: "Existing" }]
    }, 100, factory);
    const imported = importWorkspaceState(current, {
      workspaces: [{ id: "same", name: "Imported" }]
    }, "merge", 200, factory);

    expect(imported.workspaces).toHaveLength(2);
    expect(new Set(imported.workspaces.map((workspace) => workspace.id)).size).toBe(2);
    expect(imported.workspaces[0]?.name).toBe("Imported");
  });
});
