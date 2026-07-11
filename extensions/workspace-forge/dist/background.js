"use strict";
(() => {
  // src/core/models.ts
  var WORKSPACE_STATE_VERSION = 3;

  // src/core/state.ts
  var COLORS = /* @__PURE__ */ new Set([
    "grey",
    "blue",
    "cyan",
    "green",
    "yellow",
    "orange",
    "red",
    "pink",
    "purple"
  ]);
  var emptyState = () => ({
    version: WORKSPACE_STATE_VERSION,
    activeWorkspaceId: null,
    workspaces: []
  });
  function createId(prefix) {
    const random = crypto.getRandomValues(new Uint32Array(2));
    return `${prefix}-${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
  }
  function record(value) {
    return value && typeof value === "object" ? value : {};
  }
  function text(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
  }
  function finiteNumber(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
  function color(value) {
    return typeof value === "string" && COLORS.has(value) ? value : "grey";
  }
  function normalizeComparableUrl(value) {
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
  function normalizeSavedTab(value, now = Date.now(), idFactory = createId) {
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
  function normalizeTask(value, now = Date.now(), idFactory = createId) {
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
  function normalizeWorkspace(value, now = Date.now(), idFactory = createId) {
    const source = record(value);
    const tabs = Array.isArray(source.tabs) ? source.tabs.map((tab) => normalizeSavedTab(tab, now, idFactory)).filter((tab) => Boolean(tab)) : [];
    const tasks = Array.isArray(source.tasks) ? source.tasks.map((task) => normalizeTask(task, now, idFactory)).filter((task) => Boolean(task)) : [];
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
  function normalizeState(value, now = Date.now(), idFactory = createId) {
    const source = record(value);
    const workspaces = Array.isArray(source.workspaces) ? source.workspaces.map((workspace) => normalizeWorkspace(workspace, now, idFactory)) : [];
    const requestedActiveId = typeof source.activeWorkspaceId === "string" ? source.activeWorkspaceId : null;
    const activeWorkspaceId = requestedActiveId && workspaces.some((workspace) => workspace.id === requestedActiveId) ? requestedActiveId : workspaces[0]?.id ?? null;
    return {
      version: WORKSPACE_STATE_VERSION,
      activeWorkspaceId,
      workspaces
    };
  }
  function workspaceById(state, workspaceId) {
    const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) throw new Error("Workspace not found.");
    return workspace;
  }
  function createWorkspaceInState(state, value, now = Date.now(), idFactory = createId) {
    const workspace = normalizeWorkspace({
      ...record(value),
      id: void 0,
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
  function updateWorkspaceInState(state, workspaceId, patch, now = Date.now(), idFactory = createId) {
    workspaceById(state, workspaceId);
    return {
      ...state,
      workspaces: state.workspaces.map(
        (workspace) => workspace.id === workspaceId ? normalizeWorkspace({
          ...workspace,
          ...patch,
          id: workspace.id,
          createdAt: workspace.createdAt,
          updatedAt: now
        }, now, idFactory) : workspace
      )
    };
  }
  function deleteWorkspaceFromState(state, workspaceId) {
    const workspaces = state.workspaces.filter((workspace) => workspace.id !== workspaceId);
    return {
      ...state,
      activeWorkspaceId: state.activeWorkspaceId === workspaceId ? workspaces[0]?.id ?? null : state.activeWorkspaceId,
      workspaces
    };
  }
  function setActiveWorkspace(state, workspaceId) {
    if (workspaceId !== null) workspaceById(state, workspaceId);
    return { ...state, activeWorkspaceId: workspaceId };
  }
  function replaceWorkspaceTabs(state, workspaceId, tabs, now = Date.now()) {
    return updateWorkspaceInState(state, workspaceId, { tabs }, now);
  }
  function addTabToWorkspace(state, workspaceId, tab, now = Date.now()) {
    const workspace = workspaceById(state, workspaceId);
    const key = normalizeComparableUrl(tab.url);
    const tabs = [
      tab,
      ...workspace.tabs.filter((candidate) => normalizeComparableUrl(candidate.url) !== key)
    ];
    return updateWorkspaceInState(state, workspaceId, { tabs }, now);
  }
  function importWorkspaceState(current, payload, mode = "merge", now = Date.now(), idFactory = createId) {
    const source = record(payload);
    const incomingValue = source.state ?? payload;
    const incomingRecord = record(incomingValue);
    const incomingList = Array.isArray(incomingRecord.workspaces) ? incomingRecord.workspaces : Array.isArray(incomingValue) ? incomingValue : [];
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

  // src/core/tabs.ts
  function savedTabFromChrome(tab, now = Date.now(), idFactory = createId) {
    const url = tab.url?.trim();
    if (!url) return null;
    return {
      id: idFactory("tab"),
      url,
      title: tab.title?.trim() || url,
      favIconUrl: tab.favIconUrl || "",
      pinned: Boolean(tab.pinned),
      group: "General",
      savedAt: now
    };
  }
  function savedTabsFromChrome(tabs, now = Date.now(), idFactory = createId) {
    return tabs.map((tab) => savedTabFromChrome(tab, now, idFactory)).filter((tab) => Boolean(tab));
  }
  function matchingOpenTabIds(savedTabs, openTabs) {
    const savedUrls = new Set(savedTabs.map((tab) => normalizeComparableUrl(tab.url)));
    return openTabs.filter((tab) => typeof tab.id === "number" && tab.url && savedUrls.has(normalizeComparableUrl(tab.url))).map((tab) => tab.id);
  }

  // src/core/background-lifecycle.ts
  async function initializeBackground(ensureState, sidePanel) {
    await ensureState();
    await sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });
  }
  async function runBackgroundTask(context, task, report) {
    try {
      await task();
    } catch (error) {
      report(context, error);
    }
  }

  // src/entries/background.ts
  var STORAGE_KEY = "workspaceForgeState";
  var GROUP_COLOR_MAP = {
    grey: "grey",
    blue: "blue",
    cyan: "cyan",
    green: "green",
    yellow: "yellow",
    orange: "orange",
    red: "red",
    pink: "pink",
    purple: "purple"
  };
  async function readState() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const normalized = normalizeState(stored[STORAGE_KEY] ?? emptyState());
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
    return normalized;
  }
  async function writeState(state) {
    const normalized = normalizeState(state);
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
    return normalized;
  }
  async function lastFocusedWindow() {
    const browserWindow = await chrome.windows.getLastFocused({
      populate: true,
      windowTypes: ["normal"]
    });
    if (typeof browserWindow.id !== "number") throw new Error("No normal Chrome window is available.");
    return browserWindow;
  }
  async function openSidePanel(windowId) {
    const sidePanel = chrome.sidePanel;
    if (!sidePanel?.open) {
      throw new Error("Workspace Forge requires Chrome 116 or newer for Side Panel support.");
    }
    const targetId = windowId ?? (await lastFocusedWindow()).id;
    if (typeof targetId !== "number") throw new Error("No Chrome window is available.");
    await sidePanel.open({ windowId: targetId });
    return { windowId: targetId };
  }
  async function saveCurrentWindow(payload = {}) {
    const browserWindow = await lastFocusedWindow();
    const tabs = savedTabsFromChrome(browserWindow.tabs || []);
    const current = await readState();
    const created = createWorkspaceInState(current, {
      name: payload.name?.trim() || `Workspace ${current.workspaces.length + 1}`,
      color: payload.color || "blue",
      tabs
    });
    return writeState(created.state);
  }
  async function replaceFromCurrentWindow(workspaceId) {
    const browserWindow = await lastFocusedWindow();
    const tabs = savedTabsFromChrome(browserWindow.tabs || []);
    return writeState(replaceWorkspaceTabs(await readState(), workspaceId, tabs));
  }
  async function addCurrentTab(workspaceId) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) throw new Error("No active tab is available.");
    const saved = savedTabFromChrome(tab);
    if (!saved) throw new Error("The active tab does not expose a URL.");
    return writeState(addTabToWorkspace(await readState(), workspaceId, saved));
  }
  async function restoreWorkspace(workspaceId) {
    const workspace = workspaceById(await readState(), workspaceId);
    if (!workspace.tabs.length) throw new Error("This workspace has no saved tabs.");
    const created = await chrome.windows.create({ url: workspace.tabs.map((tab) => tab.url) });
    if (typeof created.id !== "number") throw new Error("Chrome did not return the restored window.");
    const createdTabs = created.tabs?.length ? created.tabs : await chrome.tabs.query({ windowId: created.id });
    const unpinnedIds = [];
    for (const [index, tab] of createdTabs.entries()) {
      if (typeof tab.id !== "number") continue;
      const saved = workspace.tabs[index];
      if (saved?.pinned) {
        await chrome.tabs.update(tab.id, { pinned: true });
      } else {
        unpinnedIds.push(tab.id);
      }
    }
    if (unpinnedIds.length) {
      const groupId = await chrome.tabs.group({
        tabIds: unpinnedIds,
        createProperties: { windowId: created.id }
      });
      await chrome.tabGroups.update(groupId, {
        title: workspace.name.slice(0, 40),
        color: GROUP_COLOR_MAP[workspace.color],
        collapsed: false
      });
    }
    return { windowId: created.id, tabCount: createdTabs.length };
  }
  async function closeWorkspaceTabs(workspaceId) {
    const workspace = workspaceById(await readState(), workspaceId);
    const openTabs = await chrome.tabs.query({});
    const ids = matchingOpenTabIds(workspace.tabs, openTabs);
    if (ids.length) await chrome.tabs.remove(ids);
    return { closed: ids.length };
  }
  async function handleMessage(message) {
    switch (message.type) {
      case "GET_STATE":
      case "EXPORT_STATE":
        return readState();
      case "OPEN_SIDE_PANEL":
        return openSidePanel(message.windowId);
      case "CREATE_WORKSPACE": {
        const created = createWorkspaceInState(await readState(), message.payload || {});
        return writeState(created.state);
      }
      case "UPDATE_WORKSPACE":
        return writeState(updateWorkspaceInState(
          await readState(),
          message.workspaceId,
          message.patch
        ));
      case "DELETE_WORKSPACE":
        return writeState(deleteWorkspaceFromState(await readState(), message.workspaceId));
      case "SAVE_CURRENT_WINDOW":
        return saveCurrentWindow(message.payload);
      case "REPLACE_TABS_FROM_WINDOW":
        return replaceFromCurrentWindow(message.workspaceId);
      case "ADD_CURRENT_TAB":
        return addCurrentTab(message.workspaceId);
      case "OPEN_WORKSPACE":
        return restoreWorkspace(message.workspaceId);
      case "CLOSE_WORKSPACE_TABS":
        return closeWorkspaceTabs(message.workspaceId);
      case "SET_ACTIVE_WORKSPACE":
        return writeState(setActiveWorkspace(await readState(), message.workspaceId));
      case "IMPORT_STATE":
        return writeState(importWorkspaceState(
          await readState(),
          message.payload,
          message.mode || "merge"
        ));
      default: {
        const exhaustive = message;
        throw new Error(`Unsupported message: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
  function reportBackgroundError(context, error) {
    console.error(`Workspace Forge ${context} failed:`, error);
  }
  function initializeWorker() {
    const sidePanel = chrome.sidePanel;
    return initializeBackground(readState, sidePanel);
  }
  chrome.runtime.onInstalled.addListener(() => {
    void runBackgroundTask("installation", initializeWorker, reportBackgroundError);
  });
  chrome.runtime.onStartup.addListener(() => {
    void runBackgroundTask("startup", initializeWorker, reportBackgroundError);
  });
  chrome.commands.onCommand.addListener((command) => {
    if (command === "open-workspace-forge") {
      void runBackgroundTask("keyboard shortcut", () => openSidePanel(), reportBackgroundError);
    }
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handleMessage(message).then((result) => sendResponse({ ok: true, result })).catch((error) => {
      console.warn("Workspace Forge request failed:", error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });
    return true;
  });
})();
