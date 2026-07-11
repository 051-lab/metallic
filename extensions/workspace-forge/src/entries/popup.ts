import type { WorkspaceForgeState, WorkspaceRequest, WorkspaceResponse } from "../core/models";

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element as T;
}

const nameInput = required<HTMLInputElement>("workspaceName");
const saveButton = required<HTMLButtonElement>("saveWindow");
const openButton = required<HTMLButtonElement>("openPanel");
const summary = required<HTMLElement>("workspaceSummary");
const status = required<HTMLElement>("status");

async function send<T>(message: WorkspaceRequest): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as WorkspaceResponse<T>;
  if (!response.ok) throw new Error(response.error || "Workspace Forge request failed.");
  return response.result as T;
}

function showStatus(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle("is-error", error);
}

async function refreshSummary(): Promise<void> {
  const state = await send<WorkspaceForgeState>({ type: "GET_STATE" });
  const tabCount = state.workspaces.reduce((total, workspace) => total + workspace.tabs.length, 0);
  summary.textContent = `${state.workspaces.length} workspace${state.workspaces.length === 1 ? "" : "s"} · ${tabCount} saved tab${tabCount === 1 ? "" : "s"}`;
}

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  showStatus("Saving current window…");
  try {
    const state = await send<WorkspaceForgeState>({
      type: "SAVE_CURRENT_WINDOW",
      payload: { name: nameInput.value.trim() || undefined, color: "blue" }
    });
    const workspace = state.workspaces.find((candidate) => candidate.id === state.activeWorkspaceId);
    showStatus(`Saved ${workspace?.tabs.length || 0} tabs to ${workspace?.name || "workspace"}.`);
    nameInput.value = "";
    await refreshSummary();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Unable to save this window.", true);
  } finally {
    saveButton.disabled = false;
  }
});

openButton.addEventListener("click", async () => {
  openButton.disabled = true;
  try {
    const sidePanel = chrome.sidePanel as typeof chrome.sidePanel | undefined;
    if (!sidePanel?.open) {
      throw new Error("Workspace Forge requires Chrome 116 or newer for Side Panel support.");
    }

    const current = await chrome.windows.getCurrent();
    if (typeof current.id !== "number") throw new Error("No Chrome window is available.");
    await sidePanel.open({ windowId: current.id });
    window.close();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "Unable to open the side panel.", true);
    openButton.disabled = false;
  }
});

void refreshSummary().catch((error: unknown) => {
  showStatus(error instanceof Error ? error.message : "Unable to read workspaces.", true);
});
