"use strict";
(() => {
  // src/core/templates.ts
  var WORKSPACE_TEMPLATES = [
    {
      id: "chrome-extension-dev",
      name: "Chrome Extension Dev",
      description: "Repository, Chrome APIs, testing, and local preview tabs.",
      color: "blue",
      notes: "Keep implementation decisions, browser constraints, and test findings here.",
      nextAction: "Define the smallest testable extension milestone.",
      tasks: ["Review manifest permissions", "Run typecheck and tests", "Load unpacked in Chrome"]
    },
    {
      id: "ai-research-sprint",
      name: "AI Research Sprint",
      description: "Sources, model tools, notes, and synthesis tasks.",
      color: "purple",
      notes: "Capture claims, source quality, open questions, and synthesis notes.",
      nextAction: "Write the research question and evidence standard.",
      tasks: ["Collect primary sources", "Compare findings", "Write a concise synthesis"]
    },
    {
      id: "app-build-session",
      name: "App Build Session",
      description: "Product planning, code, design references, and deployment.",
      color: "cyan",
      notes: "Track the product slice, architecture decisions, and validation results.",
      nextAction: "Choose the next vertical product slice.",
      tasks: ["Review current state", "Implement one slice", "Validate build and user flow"]
    },
    {
      id: "sound-design-lab",
      name: "Sound Design Lab",
      description: "DSP research, references, plugin docs, and listening notes.",
      color: "orange",
      notes: "Document signal flow, parameter choices, listening results, and revisions.",
      nextAction: "Define the target sound and one measurable experiment.",
      tasks: ["Collect references", "Build the processing chain", "Compare and document revisions"]
    },
    {
      id: "job-search-command-center",
      name: "Job Search Command Center",
      description: "Open roles, company research, applications, and follow-ups.",
      color: "green",
      notes: "Track role fit, company notes, contacts, application status, and follow-up dates.",
      nextAction: "Prioritize the strongest open role.",
      tasks: ["Research the company", "Tailor application materials", "Schedule follow-up"]
    }
  ];
  function templateById(templateId) {
    return WORKSPACE_TEMPLATES.find((template) => template.id === templateId);
  }

  // src/entries/sidepanel.ts
  function required(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing side panel element: ${id}`);
    return element;
  }
  var elements = {
    workspaceList: required("workspaceList"),
    empty: required("emptyState"),
    editor: required("editor"),
    title: required("workspaceTitle"),
    color: required("workspaceColor"),
    notes: required("workspaceNotes"),
    nextAction: required("workspaceNextAction"),
    tabs: required("savedTabs"),
    tasks: required("taskList"),
    newTask: required("newTask"),
    status: required("status"),
    template: required("templateSelect"),
    importFile: required("importFile")
  };
  var state = { version: 3, activeWorkspaceId: null, workspaces: [] };
  async function send(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response.ok) throw new Error(response.error || "Workspace Forge request failed.");
    return response.result;
  }
  function activeWorkspace() {
    return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
  }
  function showStatus(message, error = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-error", error);
  }
  function escapeText(value) {
    const span = document.createElement("span");
    span.textContent = value;
    return span.innerHTML;
  }
  function renderWorkspaceList() {
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
        <small>${workspace.tabs.length} tabs \xB7 ${workspace.tasks.filter((task) => !task.done).length} open tasks</small>
      </span>
    `;
      button.addEventListener("click", async () => {
        state = await send({
          type: "SET_ACTIVE_WORKSPACE",
          workspaceId: workspace.id
        });
        render();
      });
      elements.workspaceList.append(button);
    }
  }
  function hostnameInitial(urlValue) {
    try {
      return new URL(urlValue).hostname.slice(0, 1).toUpperCase() || "\u2022";
    } catch {
      return "\u2022";
    }
  }
  function renderTabs(workspace) {
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
      <button class="row-action" type="button" aria-label="Remove saved tab">\xD7</button>
    `;
      const checkbox = row.querySelector("input");
      const remove = row.querySelector("button");
      checkbox?.addEventListener("change", () => {
        const tabs = workspace.tabs.map(
          (candidate) => candidate.id === tab.id ? { ...candidate, pinned: Boolean(checkbox.checked) } : candidate
        );
        void updateWorkspace({ tabs });
      });
      remove?.addEventListener("click", () => {
        void updateWorkspace({ tabs: workspace.tabs.filter((candidate) => candidate.id !== tab.id) });
      });
      elements.tabs.append(row);
    }
  }
  function renderTasks(workspace) {
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
      <button class="row-action" type="button" aria-label="Delete task">\xD7</button>
    `;
      const checkbox = row.querySelector("input");
      const remove = row.querySelector("button");
      checkbox?.addEventListener("change", () => {
        const tasks = workspace.tasks.map(
          (candidate) => candidate.id === task.id ? { ...candidate, done: Boolean(checkbox.checked) } : candidate
        );
        void updateWorkspace({ tasks });
      });
      remove?.addEventListener("click", () => {
        void updateWorkspace({ tasks: workspace.tasks.filter((candidate) => candidate.id !== task.id) });
      });
      elements.tasks.append(row);
    }
  }
  function renderEditor() {
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
  function render() {
    renderWorkspaceList();
    renderEditor();
  }
  async function load() {
    state = await send({ type: "GET_STATE" });
    render();
  }
  async function updateWorkspace(patch) {
    const workspace = activeWorkspace();
    if (!workspace) return;
    try {
      state = await send({
        type: "UPDATE_WORKSPACE",
        workspaceId: workspace.id,
        patch
      });
      render();
      showStatus("Workspace saved.");
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Unable to save workspace.", true);
    }
  }
  function populateTemplates() {
    for (const template of WORKSPACE_TEMPLATES) {
      const option = document.createElement("option");
      option.value = template.id;
      option.textContent = template.name;
      elements.template.append(option);
    }
  }
  required("createBlank").addEventListener("click", async () => {
    state = await send({
      type: "CREATE_WORKSPACE",
      payload: { name: "New Workspace", color: "grey" }
    });
    render();
    showStatus("Created a new workspace.");
  });
  required("createTemplate").addEventListener("click", async () => {
    const template = templateById(elements.template.value);
    if (!template) return;
    const now = Date.now();
    const tasks = template.tasks.map((task, index) => ({
      id: `template-task-${now}-${index}`,
      text: task,
      done: false,
      createdAt: now
    }));
    state = await send({
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
    showStatus(`Created ${template.name}.`);
  });
  required("saveDetails").addEventListener("click", () => {
    void updateWorkspace({
      name: elements.title.value.trim() || "Untitled Workspace",
      color: elements.color.value,
      notes: elements.notes.value,
      nextAction: elements.nextAction.value
    });
  });
  required("addTask").addEventListener("click", () => {
    const workspace = activeWorkspace();
    const taskText = elements.newTask.value.trim();
    if (!workspace || !taskText) return;
    const task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text: taskText,
      done: false,
      createdAt: Date.now()
    };
    elements.newTask.value = "";
    void updateWorkspace({ tasks: [...workspace.tasks, task] });
  });
  required("addCurrentTab").addEventListener("click", async () => {
    const workspace = activeWorkspace();
    if (!workspace) return;
    state = await send({ type: "ADD_CURRENT_TAB", workspaceId: workspace.id });
    render();
    showStatus("Added the active tab.");
  });
  required("replaceTabs").addEventListener("click", async () => {
    const workspace = activeWorkspace();
    if (!workspace) return;
    state = await send({
      type: "REPLACE_TABS_FROM_WINDOW",
      workspaceId: workspace.id
    });
    render();
    showStatus("Replaced saved tabs from the current window.");
  });
  required("openWorkspace").addEventListener("click", async () => {
    const workspace = activeWorkspace();
    if (!workspace) return;
    const result = await send({
      type: "OPEN_WORKSPACE",
      workspaceId: workspace.id
    });
    showStatus(`Opened ${result.tabCount} tabs in a new window.`);
  });
  required("closeWorkspaceTabs").addEventListener("click", async () => {
    const workspace = activeWorkspace();
    if (!workspace) return;
    const result = await send({
      type: "CLOSE_WORKSPACE_TABS",
      workspaceId: workspace.id
    });
    showStatus(`Closed ${result.closed} matching tab${result.closed === 1 ? "" : "s"}.`);
  });
  required("deleteWorkspace").addEventListener("click", async () => {
    const workspace = activeWorkspace();
    if (!workspace || !confirm(`Delete \u201C${workspace.name}\u201D?`)) return;
    state = await send({
      type: "DELETE_WORKSPACE",
      workspaceId: workspace.id
    });
    render();
    showStatus("Workspace deleted.");
  });
  required("exportState").addEventListener("click", async () => {
    const exported = await send({ type: "EXPORT_STATE" });
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `workspace-forge-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });
  required("importState").addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", async () => {
    const file = elements.importFile.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      state = await send({ type: "IMPORT_STATE", payload, mode: "merge" });
      render();
      showStatus("Imported workspace data.");
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Unable to import workspace data.", true);
    } finally {
      elements.importFile.value = "";
    }
  });
  populateTemplates();
  void load().catch((error) => {
    showStatus(error instanceof Error ? error.message : "Unable to load Workspace Forge.", true);
  });
})();
