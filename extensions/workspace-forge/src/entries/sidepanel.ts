import type {
  SyncConflictResolution,
  Workspace,
  WorkspaceColor,
  WorkspaceForgeState,
  WorkspaceRequest,
  WorkspaceResponse,
  WorkspaceSyncStatus,
  WorkspaceTask
} from "../core/models";
import { WORKSPACE_TEMPLATES, templateById } from "../core/templates";

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing side panel element: ${id}`);
  return element as T;
}

const elements = {
  workspaceList: required<HTMLElement>("workspaceList"),
  empty: required<HTMLElement>("emptyState"),
  editor: required<HTMLElement>("editor"),
  title: required<HTMLInputElement>("workspaceTitle"),
  color: required<HTMLSelectElement>("workspaceColor"),
  notes: required<HTMLTextAreaElement>("workspaceNotes"),
  nextAction: required<HTMLInputElement>("workspaceNextAction"),
  tabs: required<HTMLElement>("savedTabs"),
  tasks: required<HTMLElement>("taskList"),
  newTask: required<HTMLInputElement>("newTask"),
  status: required<HTMLElement>("status"),
  template: required<HTMLSelectElement>("templateSelect"),
  importFile: required<HTMLInputElement>("importFile"),
  syncBadge: required<HTMLElement>("syncBadge"),
  syncSummary: required<HTMLElement>("syncSummary"),
  syncToggle: required<HTMLButtonElement>("syncToggle"),
  syncNow: required<HTMLButtonElement>("syncNow"),
  syncConflict: required<HTMLElement>("syncConflict"),
  syncUseLocal: required<HTMLButtonElement>("syncUseLocal"),
  syncUseRemote: required<HTMLButtonElement>("syncUseRemote"),
  syncMerge: required<HTMLButtonElement>("syncMerge"),
  syncDelete: required<HTMLButtonElement>("syncDelete")
};

let state: WorkspaceForgeState = { version: 3, activeWorkspaceId: null, workspaces: [] };
let syncStatus: WorkspaceSyncStatus | null = null;
let actionInProgress = false;

async function send<T>(message: WorkspaceRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as WorkspaceResponse<T>;
  if (!response.ok) throw new Error(response.error || "Workspace Forge request failed.");
  return response.result as T;
}

function activeWorkspace(): Workspace | undefined {
  return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
}

function showStatus(message: string, error = false): void {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", error);
}

function escapeText(value: string): string {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatTime(value: number | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function renderSync(): void {
  if (!syncStatus) return;
  elements.syncBadge.textContent = syncStatus.phase === "disabled"
    ? "Off"
    : syncStatus.phase === "synced"
      ? "Synced"
      : syncStatus.phase === "conflict"
        ? "Conflict"
        : syncStatus.phase === "error"
          ? "Error"
          : "Pending";
  elements.syncBadge.className = `sync-badge sync-${syncStatus.phase}`;
  elements.syncSummary.textContent = `${syncStatus.message} ${formatBytes(syncStatus.bytesInUse)} of ${formatBytes(syncStatus.quotaBytes)} used · Last sync: ${formatTime(syncStatus.lastSyncAt)}`;
  elements.syncToggle.textContent = syncStatus.enabled ? "Disable" : "Enable";
  elements.syncNow.disabled = !syncStatus.enabled || syncStatus.phase === "conflict" || actionInProgress;
  elements.syncToggle.disabled = actionInProgress;
  elements.syncDelete.disabled = actionInProgress || syncStatus.remoteRevision === null;
  elements.syncConflict.hidden = syncStatus.phase !== "conflict";
}

function renderWorkspaceList(): void {
  elements.workspaceList.replaceChildren();
  for (const workspace of state.workspaces) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-card";
    button.classList.toggle("is-active", workspace.id === state.activeWorkspaceId);
    button.dataset.workspaceId = workspace.id;
    button.innerHTML = `
      <span class="color-dot color-${workspace.color}"></span>
      <span class="workspace-card-copy">
        <strong>${escapeText(workspace.name)}</strong>
        <small>${workspace.tabs.length} tabs · ${workspace.tasks.filter((task) => !task.done).length} open tasks</small>
      </span>
    `;
    button.addEventListener("click", () => void runAction(async () => {
      state = await send<WorkspaceForgeState>({ type: "SET_ACTIVE_WORKSPACE", workspaceId: workspace.id });
      render();
    }));
    elements.workspaceList.append(button);
  }
}

function hostnameInitial(urlValue: string): string {
  try {
    return new URL(urlValue).hostname.slice(0, 1).toUpperCase() || "•";
  } catch {
    return "•";
  }
}

function renderTabs(workspace: Workspace): void {
  elements.tabs.replaceChildren();
  if (!workspace.tabs.length) {
    elements.tabs.innerHTML = '<p class="muted empty-copy">No tabs saved yet.</p>';
    return;
  }
  for (const tab of workspace.tabs) {
    const row = document.createElement("div");
    row.className = "saved-row";
    row.innerHTML = `
      <span class="favicon">${escapeText(hostnameInitial(tab.url))}</span>
      <span class="saved-copy">
        <strong title="${escapeText(tab.url)}">${escapeText(tab.title)}</strong>
        <small>${escapeText(tab.url)}</small>
      </span>
      <label class="pin-toggle"><input type="checkbox" ${tab.pinned ? "checked" : ""}> Pin</label>
      <button class="row-action" type="button" aria-label="Remove saved tab">×</button>
    `;
    const checkbox = row.querySelector<HTMLInputElement>("input");
    const remove = row.querySelector<HTMLButtonElement>("button");
    checkbox?.addEventListener("change", () => {
      const tabs = workspace.tabs.map((candidate) =>
        candidate.id === tab.id ? { ...candidate, pinned: Boolean(checkbox.checked) } : candidate
      );
      void updateWorkspace({ tabs });
    });
    remove?.addEventListener("click", () => {
      void updateWorkspace({ tabs: workspace.tabs.filter((candidate) => candidate.id !== tab.id) });
    });
    elements.tabs.append(row);
  }
}

function renderTasks(workspace: Workspace): void {
  elements.tasks.replaceChildren();
  if (!workspace.tasks.length) {
    elements.tasks.innerHTML = '<p class="muted empty-copy">No tasks yet.</p>';
    return;
  }
  for (const task of workspace.tasks) {
    const row = document.createElement("div");
    row.className = "task-row";
    row.innerHTML = `
      <label>
        <input type="checkbox" ${task.done ? "checked" : ""}>
        <span class="${task.done ? "is-done" : ""}">${escapeText(task.text)}</span>
      </label>
      <button class="row-action" type="button" aria-label="Delete task">×</button>
    `;
    const checkbox = row.querySelector<HTMLInputElement>("input");
    const remove = row.querySelector<HTMLButtonElement>("button");
    checkbox?.addEventListener("change", () => {
      const tasks = workspace.tasks.map((candidate) =>
        candidate.id === task.id ? { ...candidate, done: Boolean(checkbox.checked) } : candidate
      );
      void updateWorkspace({ tasks });
    });
    remove?.addEventListener("click", () => {
      void updateWorkspace({ tasks: workspace.tasks.filter((candidate) => candidate.id !== task.id) });
    });
    elements.tasks.append(row);
  }
}

function renderEditor(): void {
  const workspace = activeWorkspace();
  elements.empty.hidden = Boolean(workspace);
  elements.editor.hidden = !workspace;
  if (!workspace) return;
  elements.title.value = workspace.name;
  elements.color.value = workspace.color;
  elements.notes.value = workspace.notes;
  elements.nextAction.value = workspace.nextAction;
  renderTabs(workspace);
  renderTasks(workspace);
}

function render(): void {
  renderWorkspaceList();
  renderEditor();
  renderSync();
}

async function refreshSyncStatus(): Promise<void> {
  syncStatus = await send<WorkspaceSyncStatus>({ type: "GET_SYNC_STATUS" });
  renderSync();
}

async function load(): Promise<void> {
  [state, syncStatus] = await Promise.all([
    send<WorkspaceForgeState>({ type: "GET_STATE" }),
    send<WorkspaceSyncStatus>({ type: "GET_SYNC_STATUS" })
  ]);
  render();
}

async function runAction(action: () => Promise<void>, successMessage?: string): Promise<void> {
  if (actionInProgress) return;
  actionInProgress = true;
  renderSync();
  try {
    await action();
    await refreshSyncStatus();
    if (successMessage) showStatus(successMessage);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Workspace action failed.", true);
  } finally {
    actionInProgress = false;
    renderSync();
  }
}

async function updateWorkspace(patch: Partial<Workspace>): Promise<void> {
  const workspace = activeWorkspace();
  if (!workspace) return;
  await runAction(async () => {
    state = await send<WorkspaceForgeState>({
      type: "UPDATE_WORKSPACE",
      workspaceId: workspace.id,
      patch
    });
    render();
  }, "Workspace saved.");
}

function populateTemplates(): void {
  for (const template of WORKSPACE_TEMPLATES) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    elements.template.append(option);
  }
}

required<HTMLButtonElement>("createBlank").addEventListener("click", () => void runAction(async () => {
  state = await send<WorkspaceForgeState>({
    type: "CREATE_WORKSPACE",
    payload: { name: "New Workspace", color: "grey" }
  });
  render();
}, "Created a new workspace."));

required<HTMLButtonElement>("createTemplate").addEventListener("click", () => void runAction(async () => {
  const template = templateById(elements.template.value);
  if (!template) return;
  const now = Date.now();
  const tasks: WorkspaceTask[] = template.tasks.map((task, index) => ({
    id: `template-task-${now}-${index}`,
    text: task,
    done: false,
    createdAt: now
  }));
  state = await send<WorkspaceForgeState>({
    type: "CREATE_WORKSPACE",
    payload: {
      name: template.name,
      color: template.color,
      notes: template.notes,
      nextAction: template.nextAction,
      tasks
    }
  });
  render();
}, "Created a template workspace."));

required<HTMLButtonElement>("saveDetails").addEventListener("click", () => void updateWorkspace({
  name: elements.title.value.trim() || "Untitled Workspace",
  color: elements.color.value as WorkspaceColor,
  notes: elements.notes.value,
  nextAction: elements.nextAction.value
}));

required<HTMLButtonElement>("addTask").addEventListener("click", () => {
  const workspace = activeWorkspace();
  const taskText = elements.newTask.value.trim();
  if (!workspace || !taskText) return;
  const task: WorkspaceTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    text: taskText,
    done: false,
    createdAt: Date.now()
  };
  elements.newTask.value = "";
  void updateWorkspace({ tasks: [...workspace.tasks, task] });
});

required<HTMLButtonElement>("addCurrentTab").addEventListener("click", () => void runAction(async () => {
  const workspace = activeWorkspace();
  if (!workspace) return;
  state = await send<WorkspaceForgeState>({ type: "ADD_CURRENT_TAB", workspaceId: workspace.id });
  render();
}, "Added the active tab."));

required<HTMLButtonElement>("replaceTabs").addEventListener("click", () => void runAction(async () => {
  const workspace = activeWorkspace();
  if (!workspace) return;
  state = await send<WorkspaceForgeState>({
    type: "REPLACE_TABS_FROM_WINDOW",
    workspaceId: workspace.id
  });
  render();
}, "Replaced saved tabs from the current window."));

required<HTMLButtonElement>("openWorkspace").addEventListener("click", () => void runAction(async () => {
  const workspace = activeWorkspace();
  if (!workspace) return;
  const result = await send<{ tabCount: number }>({ type: "OPEN_WORKSPACE", workspaceId: workspace.id });
  showStatus(`Opened ${result.tabCount} tabs in a new window.`);
}));

required<HTMLButtonElement>("closeWorkspaceTabs").addEventListener("click", () => void runAction(async () => {
  const workspace = activeWorkspace();
  if (!workspace) return;
  const result = await send<{ closed: number }>({
    type: "CLOSE_WORKSPACE_TABS",
    workspaceId: workspace.id
  });
  showStatus(`Closed ${result.closed} matching tab${result.closed === 1 ? "" : "s"}.`);
}));

required<HTMLButtonElement>("deleteWorkspace").addEventListener("click", () => void runAction(async () => {
  const workspace = activeWorkspace();
  if (!workspace || !confirm(`Delete “${workspace.name}”?`)) return;
  state = await send<WorkspaceForgeState>({ type: "DELETE_WORKSPACE", workspaceId: workspace.id });
  render();
}, "Workspace deleted."));

required<HTMLButtonElement>("exportState").addEventListener("click", () => void runAction(async () => {
  const exported = await send<WorkspaceForgeState>({ type: "EXPORT_STATE" });
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `workspace-forge-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}));

required<HTMLButtonElement>("importState").addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", () => void runAction(async () => {
  const file = elements.importFile.files?.[0];
  if (!file) return;
  try {
    state = await send<WorkspaceForgeState>({
      type: "IMPORT_STATE",
      payload: JSON.parse(await file.text()) as unknown,
      mode: "merge"
    });
    render();
    showStatus("Imported workspace data.");
  } finally {
    elements.importFile.value = "";
  }
}));

elements.syncToggle.addEventListener("click", () => {
  const disabling = Boolean(syncStatus?.enabled);
  void runAction(async () => {
    syncStatus = await send<WorkspaceSyncStatus>({ type: disabling ? "DISABLE_SYNC" : "ENABLE_SYNC" });
    state = await send<WorkspaceForgeState>({ type: "GET_STATE" });
    render();
  }, disabling ? "Chrome Sync disabled." : "Chrome Sync enabled.");
});

elements.syncNow.addEventListener("click", () => void runAction(async () => {
  syncStatus = await send<WorkspaceSyncStatus>({ type: "SYNC_NOW" });
  state = await send<WorkspaceForgeState>({ type: "GET_STATE" });
  render();
}, "Workspace library synchronized."));

function bindConflict(button: HTMLButtonElement, resolution: SyncConflictResolution, message: string): void {
  button.addEventListener("click", () => void runAction(async () => {
    syncStatus = await send<WorkspaceSyncStatus>({ type: "RESOLVE_SYNC_CONFLICT", resolution });
    state = await send<WorkspaceForgeState>({ type: "GET_STATE" });
    render();
  }, message));
}

bindConflict(elements.syncUseLocal, "local", "This browser replaced the synced copy.");
bindConflict(elements.syncUseRemote, "remote", "Loaded the synced workspace library.");
bindConflict(elements.syncMerge, "merge", "Merged local and synced workspaces.");

elements.syncDelete.addEventListener("click", () => void runAction(async () => {
  if (!confirm("Remove the Workspace Forge cloud copy and disable sync on this browser? Local workspaces will remain.")) return;
  syncStatus = await send<WorkspaceSyncStatus>({ type: "DELETE_SYNC_COPY" });
  render();
}, "Removed the Chrome Sync copy."));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.workspaceForgeState || changes.workspaceForgeSyncPreferencesV1) {
    void load().catch((error: unknown) => {
      showStatus(error instanceof Error ? error.message : "Unable to refresh Workspace Forge.", true);
    });
  }
});

populateTemplates();
void load().catch((error: unknown) => {
  showStatus(error instanceof Error ? error.message : "Unable to load Workspace Forge.", true);
});
