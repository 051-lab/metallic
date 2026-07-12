"use strict";
(() => {
  // src/entries/popup.ts
  function required(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing popup element: ${id}`);
    return element;
  }
  var nameInput = required("workspaceName");
  var saveButton = required("saveWindow");
  var openButton = required("openPanel");
  var summary = required("workspaceSummary");
  var status = required("status");
  async function send(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response.ok) throw new Error(response.error || "Workspace Forge request failed.");
    return response.result;
  }
  function showStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle("is-error", error);
  }
  async function refreshSummary() {
    const state = await send({ type: "GET_STATE" });
    const tabCount = state.workspaces.reduce((total, workspace) => total + workspace.tabs.length, 0);
    summary.textContent = `${state.workspaces.length} workspace${state.workspaces.length === 1 ? "" : "s"} \xB7 ${tabCount} saved tab${tabCount === 1 ? "" : "s"}`;
  }
  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    showStatus("Saving current window\u2026");
    try {
      const state = await send({
        type: "SAVE_CURRENT_WINDOW",
        payload: { name: nameInput.value.trim() || void 0, color: "blue" }
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
      const sidePanel = chrome.sidePanel;
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
  void refreshSummary().catch((error) => {
    showStatus(error instanceof Error ? error.message : "Unable to read workspaces.", true);
  });
})();
