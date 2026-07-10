import {
  WORKSPACE_STATE_VERSION,
  type SavedTab,
  type Workspace,
  type WorkspaceColor,
  type WorkspaceForgeState,
  type WorkspaceTask
} from "./models";

type UnknownRecord = Record<string, unknown>;
export type IdFactory = (prefix: string) => string;

const COLORS = new Set<WorkspaceColor>([
  "grey", "blue", "cyan", "green", "yellow",
  "orange", "red", "pink", "purple"
]);

export const emptyState = (): WorkspaceForgeState => ({
  version: WORKSPACE_STATE_VERSION,
  activeWorkspaceId: null,
  workspaces: []
});

export function createId(prefix: string): string {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}-${Date.now().toString(36)}-${random[0]!.toString(36)}${random[1]!.toString(36)}`;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function color(value: unknown): WorkspaceColor {
  return typeof value === "string" && COLORS.has(value as WorkspaceColor)
    ? value as WorkspaceColor
    : "grey";
}

export function normalizeComparableUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function normalizeSavedTab(
  value: unknown,
  now = Date.now(),
  idFactory: IdFactory = createId
): SavedTab | null {
  const source = record(value);
  const url = text(source.url);
  if (!url) return null;
  return {
    id: text(source.id) || idFactory("tab"),
    url,
    title: text(source.title) || url,
    favIconUrl: text(source.favIconUrl),
    pinned: Boolean(source.pinned),
    group: text(source.group) || "General",
    savedAt: finiteNumber(source.savedAt, now)
  };
}

export function normalizeTask(
  value: unknown,
  now = Date.now(),
  idFactory: IdFactory = createId
): WorkspaceTask | null {
  const source = typeof value === "string" ? { text: value } : record(value);
  const taskText = text(source.text);
  if (!taskText) return null;
  return {
    id: text(source.id) || idFactory("task"),
    text: taskText,
    done: Boolean(source.done),
    createdAt: finiteNumber(source.createdAt, now)
  };
}

export function normalizeWorkspace(
  value: unknown,
  now = Date.now(),
  idFactory: IdFactory = createId
): Workspace {
  const source = record(value);
  const tabs = Array.isArray(source.tabs)
    ? source.tabs
      .map((tab) => normalizeSavedTab(tab, now, idFactory))
      .filter((tab): tab is SavedTab => Boolean(tab))
    : [];
  const tasks = Array.isArray(source.tasks)
    ? source.tasks
      .map((task) => normalizeTask(task, now, idFactory))
      .filter((task): task is WorkspaceTask => Boolean(task))
    : [];

  return {
    id: text(source.id) || idFactory("workspace"),
    name: text(source.name) || "Untitled Workspace",
    color: color(source.color),
    status: source.status === "archived" ? "archived" : "active",
    notes: text(source.notes),
    nextAction: text(source.nextAction),
    createdAt: finiteNumber(source.createdAt, now),
    updatedAt: finiteNumber(source.updatedAt, now),
    tabs,
    tasks
  };
}

export function normalizeState(
  value: unknown,
  now = Date.now(),
  idFactory: IdFactory = createId
): WorkspaceForgeState {
  const source = record(value);
  const workspaces = Array.isArray(source.workspaces)
    ? source.workspaces.map((workspace) => normalizeWorkspace(workspace, now, idFactory))
    : [];
  const requestedActiveId = typeof source.activeWorkspaceId === "string"
    ? source.activeWorkspaceId
    : null;
  const activeWorkspaceId = requestedActiveId && workspaces.some((workspace) => workspace.id === requestedActiveId)
    ? requestedActiveId
    : workspaces[0]?.id ?? null;

  return {
    version: WORKSPACE_STATE_VERSION,
    activeWorkspaceId,
    workspaces
  };
}

export function workspaceById(state: WorkspaceForgeState, workspaceId: string): Workspace {
  const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) throw new Error("Workspace not found.");
  return workspace;
}

export function createWorkspaceInState(
  state: WorkspaceForgeState,
  value: unknown,
  now = Date.now(),
  idFactory: IdFactory = createId
): { state: WorkspaceForgeState; workspace: Workspace } {
  const workspace = normalizeWorkspace({
    ...record(value),
    id: undefined,
    createdAt: now,
    updatedAt: now
  }, now, idFactory);
  return {
    workspace,
    state: {
      ...state,
      version: WORKSPACE_STATE_VERSION,
      activeWorkspaceId: workspace.id,
      workspaces: [workspace, ...state.workspaces]
    }
  };
}

export function updateWorkspaceInState(
  state: WorkspaceForgeState,
  workspaceId: string,
  patch: Partial<Workspace>,
  now = Date.now(),
  idFactory: IdFactory = createId
): WorkspaceForgeState {
  workspaceById(state, workspaceId);
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId
        ? normalizeWorkspace({
          ...workspace,
          ...patch,
          id: workspace.id,
          createdAt: workspace.createdAt,
          updatedAt: now
        }, now, idFactory)
        : workspace
    )
  };
}

export function deleteWorkspaceFromState(
  state: WorkspaceForgeState,
  workspaceId: string
): WorkspaceForgeState {
  const workspaces = state.workspaces.filter((workspace) => workspace.id !== workspaceId);
  return {
    ...state,
    activeWorkspaceId: state.activeWorkspaceId === workspaceId
      ? workspaces[0]?.id ?? null
      : state.activeWorkspaceId,
    workspaces
  };
}

export function setActiveWorkspace(
  state: WorkspaceForgeState,
  workspaceId: string | null
): WorkspaceForgeState {
  if (workspaceId !== null) workspaceById(state, workspaceId);
  return { ...state, activeWorkspaceId: workspaceId };
}

export function replaceWorkspaceTabs(
  state: WorkspaceForgeState,
  workspaceId: string,
  tabs: SavedTab[],
  now = Date.now()
): WorkspaceForgeState {
  return updateWorkspaceInState(state, workspaceId, { tabs }, now);
}

export function addTabToWorkspace(
  state: WorkspaceForgeState,
  workspaceId: string,
  tab: SavedTab,
  now = Date.now()
): WorkspaceForgeState {
  const workspace = workspaceById(state, workspaceId);
  const key = normalizeComparableUrl(tab.url);
  const tabs = [
    tab,
    ...workspace.tabs.filter((candidate) => normalizeComparableUrl(candidate.url) !== key)
  ];
  return updateWorkspaceInState(state, workspaceId, { tabs }, now);
}

export function importWorkspaceState(
  current: WorkspaceForgeState,
  payload: unknown,
  mode: "merge" | "replace" = "merge",
  now = Date.now(),
  idFactory: IdFactory = createId
): WorkspaceForgeState {
  const source = record(payload);
  const incomingValue = source.state ?? payload;
  const incomingRecord = record(incomingValue);
  const incomingList = Array.isArray(incomingRecord.workspaces)
    ? incomingRecord.workspaces
    : Array.isArray(incomingValue)
      ? incomingValue
      : [];

  if (!incomingList.length) throw new Error("Import file does not contain any workspaces.");

  const base = mode === "replace" ? emptyState() : current;
  const existingIds = new Set(base.workspaces.map((workspace) => workspace.id));
  const imported = incomingList.map((value) => {
    const workspace = normalizeWorkspace(value, now, idFactory);
    if (existingIds.has(workspace.id)) workspace.id = idFactory("workspace");
    workspace.updatedAt = now;
    existingIds.add(workspace.id);
    return workspace;
  });

  return {
    version: WORKSPACE_STATE_VERSION,
    activeWorkspaceId: imported[0]?.id ?? base.activeWorkspaceId,
    workspaces: [...imported, ...base.workspaces]
  };
}
