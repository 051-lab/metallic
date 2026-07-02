const STORAGE_KEY = 'workspaceForgeState';
const STATE_VERSION = 2;

const DEFAULT_STATE = {
  version: STATE_VERSION,
  activeWorkspaceId: null,
  workspaces: []
};

const GROUP_COLOR_MAP = {
  silver: 'grey',
  slate: 'grey',
  blue: 'blue',
  cyan: 'cyan',
  green: 'green',
  yellow: 'yellow',
  orange: 'orange',
  red: 'red',
  pink: 'pink',
  purple: 'purple'
};

chrome.runtime.onInstalled.addListener(async () => {
  await ensureState();

  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
});

chrome.commands.onCommand.addListener(async command => {
  if (command !== 'open-workspace-forge') return;

  try {
    const [window] = await chrome.windows.getAll({ populate: false, windowTypes: ['normal'] });
    if (window?.id && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: window.id });
    }
  } catch (error) {
    console.warn('Workspace Forge command failed:', error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(result => sendResponse({ ok: true, result }))
    .catch(error => {
      console.error('Workspace Forge error:', error);
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case 'GET_STATE':
      return ensureState();
    case 'IMPORT_STATE':
      return importState(message.payload || {});
    case 'OPEN_SIDE_PANEL':
      return openSidePanel(message.windowId);
    case 'CREATE_WORKSPACE':
      return createWorkspace(message.payload || {});
    case 'UPDATE_WORKSPACE':
      return updateWorkspace(message.workspaceId, message.patch || {});
    case 'UPDATE_WORKSPACE_FROM_CURRENT_WINDOW':
      return updateWorkspaceFromCurrentWindow(message.workspaceId, message.payload || {});
    case 'DELETE_WORKSPACE':
      return deleteWorkspace(message.workspaceId);
    case 'SAVE_CURRENT_WINDOW':
      return saveCurrentWindow(message.payload || {});
    case 'ADD_CURRENT_TAB':
      return addCurrentTab(message.workspaceId);
    case 'OPEN_WORKSPACE':
      return openWorkspace(message.workspaceId);
    case 'CLOSE_WORKSPACE_TABS':
      return closeWorkspaceTabs(message.workspaceId);
    case 'SET_ACTIVE_WORKSPACE':
      return setActiveWorkspace(message.workspaceId);
    default:
      throw new Error(`Unknown message type: ${message?.type}`);
  }
}

async function ensureState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const state = stored[STORAGE_KEY];

  if (!state || !Array.isArray(state.workspaces)) {
    await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_STATE });
    return structuredClone(DEFAULT_STATE);
  }

  const normalized = {
    ...DEFAULT_STATE,
    ...state,
    version: STATE_VERSION,
    workspaces: state.workspaces.map(normalizeWorkspace)
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

async function saveState(state) {
  const normalized = {
    ...DEFAULT_STATE,
    ...state,
    version: STATE_VERSION,
    workspaces: state.workspaces.map(normalizeWorkspace)
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  return normalized;
}

function normalizeWorkspace(workspace) {
  const now = Date.now();

  return {
    id: workspace.id || createId('workspace'),
    name: workspace.name || 'Untitled Workspace',
    color: workspace.color || 'silver',
    status: workspace.status || 'active',
    notes: workspace.notes || '',
    nextAction: workspace.nextAction || '',
    createdAt: workspace.createdAt || now,
    updatedAt: workspace.updatedAt || now,
    tabs: Array.isArray(workspace.tabs) ? workspace.tabs.map(normalizeSavedTab).filter(tab => tab.url) : [],
    tasks: Array.isArray(workspace.tasks) ? workspace.tasks.map(normalizeTask).filter(task => task.text) : []
  };
}

function normalizeSavedTab(tab) {
  return {
    id: tab.id || createId('tab'),
    url: tab.url || '',
    title: tab.title || tab.url || 'Untitled Tab',
    favIconUrl: tab.favIconUrl || '',
    pinned: Boolean(tab.pinned),
    group: tab.group || 'General',
    savedAt: tab.savedAt || Date.now()
  };
}

function normalizeTask(task) {
  return {
    id: task.id || createId('task'),
    text: typeof task === 'string' ? task : task.text || '',
    done: typeof task === 'object' ? Boolean(task.done) : false,
    createdAt: typeof task === 'object' && task.createdAt ? task.createdAt : Date.now()
  };
}

async function openSidePanel(windowId) {
  const targetWindowId = windowId || (await getCurrentWindowId());

  if (!chrome.sidePanel?.open) {
    throw new Error('Chrome Side Panel API is not available in this browser.');
  }

  await chrome.sidePanel.open({ windowId: targetWindowId });
  return { windowId: targetWindowId };
}

async function importState(payload) {
  const incoming = payload.state || payload;
  const mergeMode = payload.mode || 'merge';
  const incomingWorkspaces = Array.isArray(incoming?.workspaces)
    ? incoming.workspaces
    : Array.isArray(incoming)
      ? incoming
      : [];

  if (!incomingWorkspaces.length) {
    throw new Error('Import file does not contain any workspaces.');
  }

  const state = mergeMode === 'replace' ? structuredClone(DEFAULT_STATE) : await ensureState();
  const existingIds = new Set(state.workspaces.map(workspace => workspace.id));
  const imported = incomingWorkspaces.map(workspace => {
    const normalized = normalizeWorkspace(workspace);
    if (existingIds.has(normalized.id)) {
      normalized.id = createId('workspace');
    }
    existingIds.add(normalized.id);
    normalized.updatedAt = Date.now();
    return normalized;
  });

  state.workspaces = [...imported, ...state.workspaces];
  state.activeWorkspaceId = imported[0]?.id || state.activeWorkspaceId || null;
  return saveState(state);
}

async function createWorkspace(payload) {
  const state = await ensureState();
  const now = Date.now();
  const workspace = normalizeWorkspace({
    id: createId('workspace'),
    name: cleanName(payload.name, 'New Workspace'),
    color: payload.color || 'silver',
    notes: payload.notes || '',
    nextAction: payload.nextAction || '',
    createdAt: now,
    updatedAt: now,
    tabs: Array.isArray(payload.tabs) ? payload.tabs : [],
    tasks: Array.isArray(payload.tasks) ? payload.tasks : []
  });

  state.workspaces.unshift(workspace);
  state.activeWorkspaceId = workspace.id;
  return saveState(state);
}

async function updateWorkspace(workspaceId, patch) {
  const state = await ensureState();
  const workspace = getWorkspaceOrThrow(state, workspaceId);

  Object.assign(workspace, {
    ...patch,
    id: workspace.id,
    updatedAt: Date.now(),
    tabs: Array.isArray(patch.tabs) ? patch.tabs.map(normalizeSavedTab).filter(tab => tab.url) : workspace.tabs,
    tasks: Array.isArray(patch.tasks) ? patch.tasks.map(normalizeTask).filter(task => task.text) : workspace.tasks
  });

  return saveState(state);
}

async function updateWorkspaceFromCurrentWindow(workspaceId, payload) {
  const state = await ensureState();
  const workspace = getWorkspaceOrThrow(state, workspaceId || state.activeWorkspaceId);
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const currentTabs = tabs.filter(isSavableTab).map(tabToSavedTab);

  if (!currentTabs.length) {
    throw new Error('No savable tabs were found in the current window.');
  }

  const mode = payload.mode || 'replace';

  if (mode === 'merge') {
    const existingUrls = new Set(workspace.tabs.map(tab => normalizeUrl(tab.url)));
    for (const tab of currentTabs) {
      const normalizedUrl = normalizeUrl(tab.url);
      if (!existingUrls.has(normalizedUrl)) {
        workspace.tabs.push(tab);
        existingUrls.add(normalizedUrl);
      }
    }
  } else {
    workspace.tabs = currentTabs;
  }

  workspace.updatedAt = Date.now();
  state.activeWorkspaceId = workspace.id;
  return saveState(state);
}

async function deleteWorkspace(workspaceId) {
  const state = await ensureState();
  const nextWorkspaces = state.workspaces.filter(workspace => workspace.id !== workspaceId);

  if (nextWorkspaces.length === state.workspaces.length) {
    throw new Error('Workspace not found.');
  }

  state.workspaces = nextWorkspaces;
  if (state.activeWorkspaceId === workspaceId) {
    state.activeWorkspaceId = state.workspaces[0]?.id || null;
  }

  return saveState(state);
}

async function saveCurrentWindow(payload) {
  const state = await ensureState();
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const savableTabs = tabs.filter(isSavableTab).map(tabToSavedTab);

  if (!savableTabs.length) {
    throw new Error('No savable tabs were found in the current window.');
  }

  const now = Date.now();
  const existingWorkspace = payload.workspaceId
    ? state.workspaces.find(item => item.id === payload.workspaceId)
    : null;
  const workspace = normalizeWorkspace({
    id: payload.workspaceId || createId('workspace'),
    name: cleanName(payload.name, existingWorkspace?.name || `Workspace ${state.workspaces.length + 1}`),
    color: payload.color || existingWorkspace?.color || 'silver',
    notes: payload.notes ?? existingWorkspace?.notes ?? '',
    nextAction: payload.nextAction ?? existingWorkspace?.nextAction ?? '',
    createdAt: existingWorkspace?.createdAt || now,
    updatedAt: now,
    tabs: savableTabs,
    tasks: Array.isArray(payload.tasks) ? payload.tasks : existingWorkspace?.tasks || []
  });

  const existingIndex = state.workspaces.findIndex(item => item.id === workspace.id);
  if (existingIndex >= 0) {
    state.workspaces[existingIndex] = workspace;
  } else {
    state.workspaces.unshift(workspace);
  }

  state.activeWorkspaceId = workspace.id;
  return saveState(state);
}

async function addCurrentTab(workspaceId) {
  const state = await ensureState();
  const workspace = getWorkspaceOrThrow(state, workspaceId || state.activeWorkspaceId);
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab || !isSavableTab(activeTab)) {
    throw new Error('The active tab cannot be saved to a workspace.');
  }

  const savedTab = tabToSavedTab(activeTab);
  const alreadySaved = workspace.tabs.some(tab => normalizeUrl(tab.url) === normalizeUrl(savedTab.url));

  if (!alreadySaved) {
    workspace.tabs.push(savedTab);
  }

  workspace.updatedAt = Date.now();
  state.activeWorkspaceId = workspace.id;
  return saveState(state);
}

async function openWorkspace(workspaceId) {
  const state = await ensureState();
  const workspace = getWorkspaceOrThrow(state, workspaceId || state.activeWorkspaceId);
  const tabsToOpen = workspace.tabs.filter(tab => tab.url);

  if (!tabsToOpen.length) {
    throw new Error('This workspace does not have any saved tabs yet.');
  }

  const createdTabIds = [];
  const firstTab = tabsToOpen[0];
  const window = await chrome.windows.create({
    url: firstTab.url,
    focused: true,
    type: 'normal'
  });

  if (window.tabs?.[0]?.id) {
    createdTabIds.push(window.tabs[0].id);
    await safelyUpdateTab(window.tabs[0].id, { pinned: Boolean(firstTab.pinned) });
  }

  for (const savedTab of tabsToOpen.slice(1)) {
    const createdTab = await chrome.tabs.create({
      windowId: window.id,
      url: savedTab.url,
      active: false,
      pinned: false
    });

    if (createdTab.id) {
      createdTabIds.push(createdTab.id);
      await safelyUpdateTab(createdTab.id, { pinned: Boolean(savedTab.pinned) });
    }
  }

  await groupCreatedTabs(workspace, createdTabIds);

  workspace.updatedAt = Date.now();
  state.activeWorkspaceId = workspace.id;
  await saveState(state);

  return { workspaceId: workspace.id, windowId: window.id, tabCount: createdTabIds.length };
}

async function closeWorkspaceTabs(workspaceId) {
  const state = await ensureState();
  const workspace = getWorkspaceOrThrow(state, workspaceId || state.activeWorkspaceId);
  const workspaceUrls = new Set(workspace.tabs.map(tab => normalizeUrl(tab.url)).filter(Boolean));
  const allTabs = await chrome.tabs.query({});
  const tabsToClose = allTabs
    .filter(tab => workspaceUrls.has(normalizeUrl(tab.url)))
    .map(tab => tab.id)
    .filter(Boolean);

  if (!tabsToClose.length) {
    return { closed: 0 };
  }

  await chrome.tabs.remove(tabsToClose);
  return { closed: tabsToClose.length };
}

async function setActiveWorkspace(workspaceId) {
  const state = await ensureState();
  getWorkspaceOrThrow(state, workspaceId);
  state.activeWorkspaceId = workspaceId;
  return saveState(state);
}

async function groupCreatedTabs(workspace, tabIds) {
  const groupableTabIds = [];

  for (const tabId of tabIds) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab && !tab.pinned) {
      groupableTabIds.push(tabId);
    }
  }

  if (!groupableTabIds.length) return;

  try {
    const groupId = await chrome.tabs.group({ tabIds: groupableTabIds });
    await chrome.tabGroups.update(groupId, {
      title: workspace.name,
      color: GROUP_COLOR_MAP[workspace.color] || 'grey',
      collapsed: false
    });
  } catch (error) {
    console.warn('Could not group workspace tabs:', error);
  }
}

async function safelyUpdateTab(tabId, patch) {
  try {
    await chrome.tabs.update(tabId, patch);
  } catch (error) {
    console.warn(`Could not update tab ${tabId}:`, error);
  }
}

async function getCurrentWindowId() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.windowId) return activeTab.windowId;

  const [window] = await chrome.windows.getAll({ populate: false, windowTypes: ['normal'] });
  if (window?.id) return window.id;

  throw new Error('No Chrome window is available.');
}

function getWorkspaceOrThrow(state, workspaceId) {
  const workspace = state.workspaces.find(item => item.id === workspaceId);
  if (!workspace) {
    throw new Error('Workspace not found.');
  }
  return workspace;
}

function tabToSavedTab(tab) {
  return normalizeSavedTab({
    id: createId('tab'),
    url: tab.url,
    title: tab.title || tab.url,
    favIconUrl: tab.favIconUrl || '',
    pinned: Boolean(tab.pinned),
    group: 'General',
    savedAt: Date.now()
  });
}

function isSavableTab(tab) {
  if (!tab?.url) return false;
  return !tab.url.startsWith('chrome://') &&
    !tab.url.startsWith('chrome-extension://') &&
    !tab.url.startsWith('edge://') &&
    !tab.url.startsWith('about:') &&
    !tab.url.startsWith('devtools://');
}

function cleanName(value, fallback) {
  const trimmed = String(value || '').trim();
  return trimmed || fallback;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(url || '').trim();
  }
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
