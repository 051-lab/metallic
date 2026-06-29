let state = null;
let selectedWorkspaceId = null;

const workspaceTemplates = Array.isArray(globalThis.WORKSPACE_TEMPLATES) ? globalThis.WORKSPACE_TEMPLATES : [];

const elements = {
  notice: document.querySelector('#notice'),
  saveWindow: document.querySelector('#save-window'),
  createWorkspace: document.querySelector('#create-workspace'),
  refreshState: document.querySelector('#refresh-state'),
  templateSelect: document.querySelector('#template-select'),
  createFromTemplate: document.querySelector('#create-from-template'),
  exportWorkspaces: document.querySelector('#export-workspaces'),
  workspaceCount: document.querySelector('#workspace-count'),
  workspaceList: document.querySelector('#workspace-list'),
  workspaceDetail: document.querySelector('#workspace-detail'),
  workspaceCardTemplate: document.querySelector('#workspace-card-template'),
  workspaceDetailTemplate: document.querySelector('#workspace-detail-template')
};

document.addEventListener('DOMContentLoaded', init);

elements.saveWindow.addEventListener('click', saveCurrentWindowAsWorkspace);
elements.createWorkspace.addEventListener('click', createWorkspace);
elements.refreshState.addEventListener('click', refresh);
elements.createFromTemplate.addEventListener('click', createWorkspaceFromTemplate);
elements.exportWorkspaces.addEventListener('click', () => showNotice('JSON export UI is reserved for the next pass.'));

async function init() {
  renderTemplateOptions();
  await refresh();
}

async function refresh() {
  await runAction(async () => {
    state = await sendMessage({ type: 'GET_STATE' });
    selectedWorkspaceId = selectedWorkspaceId || state.activeWorkspaceId || state.workspaces[0]?.id || null;
    render();
  });
}

function render() {
  renderWorkspaceList();
  renderWorkspaceDetail();
}

function renderTemplateOptions() {
  if (!elements.templateSelect) return;

  for (const template of workspaceTemplates) {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = template.name;
    elements.templateSelect.append(option);
  }
}

function renderWorkspaceList() {
  elements.workspaceList.textContent = '';
  elements.workspaceCount.textContent = String(state.workspaces.length);

  if (!state.workspaces.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = 'No workspaces yet. Save the current window to create your first project space.';
    elements.workspaceList.append(empty);
    return;
  }

  for (const workspace of state.workspaces) {
    const fragment = elements.workspaceCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.workspace-card');
    const name = fragment.querySelector('.workspace-card__name');
    const meta = fragment.querySelector('.workspace-card__meta');

    card.dataset.workspaceColor = workspace.color;
    card.dataset.workspaceId = workspace.id;
    card.classList.toggle('is-active', workspace.id === selectedWorkspaceId);
    name.textContent = workspace.name;
    meta.textContent = `${workspace.tabs.length} tab${workspace.tabs.length === 1 ? '' : 's'} • ${relativeTime(workspace.updatedAt)}`;

    card.addEventListener('click', async () => {
      selectedWorkspaceId = workspace.id;
      await runAction(async () => {
        state = await sendMessage({ type: 'SET_ACTIVE_WORKSPACE', workspaceId: workspace.id });
        render();
      });
    });

    elements.workspaceList.append(fragment);
  }
}

function renderWorkspaceDetail() {
  const workspace = getSelectedWorkspace();
  elements.workspaceDetail.textContent = '';

  if (!workspace) {
    elements.workspaceDetail.innerHTML = `
      <div class="empty-state">
        <div>
          <h2>No workspace selected</h2>
          <p>Create a workspace or save your current window to begin.</p>
        </div>
      </div>
    `;
    return;
  }

  const fragment = elements.workspaceDetailTemplate.content.cloneNode(true);
  const editor = fragment.querySelector('.workspace-editor');
  const nameInput = fragment.querySelector('#workspace-name');
  const colorSelect = fragment.querySelector('#workspace-color');
  const nextActionInput = fragment.querySelector('#workspace-next-action');
  const notesInput = fragment.querySelector('#workspace-notes');
  const openButton = fragment.querySelector('#open-workspace');
  const addTabButton = fragment.querySelector('#add-current-tab');
  const replaceTabsButton = fragment.querySelector('#replace-tabs-from-window');
  const closeTabsButton = fragment.querySelector('#close-workspace-tabs');
  const saveDetailsButton = fragment.querySelector('#save-workspace-details');
  const deleteButton = fragment.querySelector('#delete-workspace');
  const savedTabs = fragment.querySelector('#saved-tabs');
  const tabCount = fragment.querySelector('#tab-count');
  const taskForm = fragment.querySelector('#task-form');
  const taskInput = fragment.querySelector('#task-input');
  const taskList = fragment.querySelector('#task-list');
  const taskCount = fragment.querySelector('#task-count');

  editor.dataset.workspaceColor = workspace.color;
  nameInput.value = workspace.name;
  colorSelect.value = workspace.color;
  nextActionInput.value = workspace.nextAction || '';
  notesInput.value = workspace.notes || '';
  tabCount.textContent = String(workspace.tabs.length);
  taskCount.textContent = String(workspace.tasks.length);

  openButton.addEventListener('click', () => openWorkspace(workspace.id));
  addTabButton.addEventListener('click', () => addCurrentTab(workspace.id));
  replaceTabsButton.addEventListener('click', () => replaceTabsFromCurrentWindow(workspace.id));
  closeTabsButton.addEventListener('click', () => closeWorkspaceTabs(workspace.id));
  saveDetailsButton.addEventListener('click', () => saveWorkspaceDetails(workspace.id, {
    name: nameInput.value,
    color: colorSelect.value,
    nextAction: nextActionInput.value,
    notes: notesInput.value
  }));
  deleteButton.addEventListener('click', () => deleteWorkspace(workspace.id));
  colorSelect.addEventListener('change', () => {
    editor.dataset.workspaceColor = colorSelect.value;
  });

  renderSavedTabs(savedTabs, workspace);
  renderTasks(taskList, workspace);

  taskForm.addEventListener('submit', event => {
    event.preventDefault();
    addTask(workspace.id, taskInput.value);
  });

  elements.workspaceDetail.append(fragment);
}

function renderSavedTabs(container, workspace) {
  container.textContent = '';

  if (!workspace.tabs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = 'No tabs saved yet. Add the active tab or save a browser window.';
    container.append(empty);
    return;
  }

  workspace.tabs.forEach(savedTab => {
    const item = document.createElement('article');
    item.className = 'saved-tab';

    const title = document.createElement('div');
    title.className = 'saved-tab__title';

    if (savedTab.favIconUrl) {
      const favicon = document.createElement('img');
      favicon.src = savedTab.favIconUrl;
      favicon.alt = '';
      title.append(favicon);
    }

    const titleText = document.createElement('span');
    titleText.textContent = savedTab.title || savedTab.url;
    title.append(titleText);

    const url = document.createElement('div');
    url.className = 'saved-tab__url';
    url.textContent = savedTab.url;

    const actions = document.createElement('div');
    actions.className = 'saved-tab__actions';

    const pinnedLabel = document.createElement('label');
    pinnedLabel.className = 'inline-control';
    const pinnedCheckbox = document.createElement('input');
    pinnedCheckbox.type = 'checkbox';
    pinnedCheckbox.checked = Boolean(savedTab.pinned);
    pinnedCheckbox.addEventListener('change', () => patchSavedTab(workspace.id, savedTab.id, { pinned: pinnedCheckbox.checked }));
    pinnedLabel.append(pinnedCheckbox, 'Pinned');

    const removeButton = document.createElement('button');
    removeButton.className = 'link-button danger-text';
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeSavedTab(workspace.id, savedTab.id));

    actions.append(pinnedLabel, removeButton);
    item.append(title, url, actions);
    container.append(item);
  });
}

function renderTasks(container, workspace) {
  container.textContent = '';

  if (!workspace.tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = 'No tasks yet. Add the next concrete step for this workspace.';
    container.append(empty);
    return;
  }

  workspace.tasks.forEach(task => {
    const item = document.createElement('article');
    item.className = 'task-item';
    item.classList.toggle('is-done', task.done);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.done);
    checkbox.addEventListener('change', () => patchTask(workspace.id, task.id, { done: checkbox.checked }));

    const text = document.createElement('div');
    text.className = 'task-text';
    text.textContent = task.text;

    const removeButton = document.createElement('button');
    removeButton.className = 'link-button danger-text';
    removeButton.type = 'button';
    removeButton.textContent = 'Delete';
    removeButton.addEventListener('click', () => removeTask(workspace.id, task.id));

    item.append(checkbox, text, removeButton);
    container.append(item);
  });
}

async function saveCurrentWindowAsWorkspace() {
  const name = prompt('Name this workspace:', suggestWorkspaceName());
  if (name === null) return;

  await runAction(async () => {
    state = await sendMessage({
      type: 'SAVE_CURRENT_WINDOW',
      payload: { name, color: 'silver' }
    });
    selectedWorkspaceId = state.activeWorkspaceId;
    render();
    showNotice('Current window saved as a workspace.');
  });
}

async function createWorkspace() {
  const name = prompt('Workspace name:', 'New Workspace');
  if (name === null) return;

  await runAction(async () => {
    state = await sendMessage({
      type: 'CREATE_WORKSPACE',
      payload: { name, color: 'silver' }
    });
    selectedWorkspaceId = state.activeWorkspaceId;
    render();
    showNotice('Workspace created.');
  });
}

async function createWorkspaceFromTemplate() {
  const templateId = elements.templateSelect.value;
  const template = workspaceTemplates.find(item => item.id === templateId);

  if (!template) {
    showNotice('Choose a workspace template first.', true);
    return;
  }

  await runAction(async () => {
    state = await sendMessage({
      type: 'CREATE_WORKSPACE',
      payload: {
        name: template.name,
        color: template.color,
        notes: template.notes,
        nextAction: template.nextAction,
        tasks: template.tasks.map(text => ({ text, done: false }))
      }
    });
    selectedWorkspaceId = state.activeWorkspaceId;
    elements.templateSelect.value = '';
    render();
    showNotice(`Created ${template.name} from a template.`);
  });
}

async function saveWorkspaceDetails(workspaceId, formData) {
  await runAction(async () => {
    state = await sendMessage({
      type: 'UPDATE_WORKSPACE',
      workspaceId,
      patch: {
        name: formData.name.trim() || 'Untitled Workspace',
        color: formData.color,
        nextAction: formData.nextAction.trim(),
        notes: formData.notes.trim()
      }
    });
    render();
    showNotice('Workspace details saved.');
  });
}

async function openWorkspace(workspaceId) {
  await runAction(async () => {
    const result = await sendMessage({ type: 'OPEN_WORKSPACE', workspaceId });
    await refresh();
    showNotice(`Opened ${result.tabCount} workspace tab${result.tabCount === 1 ? '' : 's'}.`);
  });
}

async function addCurrentTab(workspaceId) {
  await runAction(async () => {
    state = await sendMessage({ type: 'ADD_CURRENT_TAB', workspaceId });
    render();
    showNotice('Active tab added to workspace.');
  });
}

async function replaceTabsFromCurrentWindow(workspaceId) {
  const workspace = findWorkspace(workspaceId);
  if (!workspace) return;

  const message = `Replace the saved tabs in "${workspace.name}" with the tabs in your current browser window? Notes and tasks will be preserved.`;
  if (!confirm(message)) return;

  await runAction(async () => {
    state = await sendMessage({
      type: 'UPDATE_WORKSPACE_FROM_CURRENT_WINDOW',
      workspaceId,
      payload: { mode: 'replace' }
    });
    render();
    const updated = findWorkspace(workspaceId);
    const count = updated?.tabs.length || 0;
    showNotice(`Replaced saved tabs with ${count} current-window tab${count === 1 ? '' : 's'}.`);
  });
}

async function closeWorkspaceTabs(workspaceId) {
  if (!confirm('Close every open tab that matches this workspace?')) return;

  await runAction(async () => {
    const result = await sendMessage({ type: 'CLOSE_WORKSPACE_TABS', workspaceId });
    showNotice(`Closed ${result.closed} matching tab${result.closed === 1 ? '' : 's'}.`);
  });
}

async function deleteWorkspace(workspaceId) {
  const workspace = getSelectedWorkspace();
  if (!workspace) return;
  if (!confirm(`Delete "${workspace.name}"? This removes the saved workspace but does not close browser tabs.`)) return;

  await runAction(async () => {
    state = await sendMessage({ type: 'DELETE_WORKSPACE', workspaceId });
    selectedWorkspaceId = state.activeWorkspaceId || state.workspaces[0]?.id || null;
    render();
    showNotice('Workspace deleted.');
  });
}

async function patchSavedTab(workspaceId, tabId, patch) {
  const workspace = findWorkspace(workspaceId);
  if (!workspace) return;

  const tabs = workspace.tabs.map(tab => tab.id === tabId ? { ...tab, ...patch } : tab);
  await patchWorkspace(workspaceId, { tabs });
}

async function removeSavedTab(workspaceId, tabId) {
  const workspace = findWorkspace(workspaceId);
  if (!workspace) return;

  const tabs = workspace.tabs.filter(tab => tab.id !== tabId);
  await patchWorkspace(workspaceId, { tabs });
}

async function addTask(workspaceId, text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const workspace = findWorkspace(workspaceId);
  if (!workspace) return;

  const task = {
    id: createId('task'),
    text: trimmed,
    done: false,
    createdAt: Date.now()
  };

  await patchWorkspace(workspaceId, { tasks: [...workspace.tasks, task] });
}

async function patchTask(workspaceId, taskId, patch) {
  const workspace = findWorkspace(workspaceId);
  if (!workspace) return;

  const tasks = workspace.tasks.map(task => task.id === taskId ? { ...task, ...patch } : task);
  await patchWorkspace(workspaceId, { tasks });
}

async function removeTask(workspaceId, taskId) {
  const workspace = findWorkspace(workspaceId);
  if (!workspace) return;

  const tasks = workspace.tasks.filter(task => task.id !== taskId);
  await patchWorkspace(workspaceId, { tasks });
}

async function patchWorkspace(workspaceId, patch) {
  await runAction(async () => {
    state = await sendMessage({ type: 'UPDATE_WORKSPACE', workspaceId, patch });
    render();
  }, { quiet: true });
}

async function runAction(action, options = {}) {
  try {
    if (!options.quiet) hideNotice();
    await action();
  } catch (error) {
    showNotice(error.message || String(error), true);
  }
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || 'Workspace Forge request failed.'));
        return;
      }

      resolve(response.result);
    });
  });
}

function getSelectedWorkspace() {
  return findWorkspace(selectedWorkspaceId) || state?.workspaces?.[0] || null;
}

function findWorkspace(workspaceId) {
  return state?.workspaces?.find(workspace => workspace.id === workspaceId) || null;
}

function suggestWorkspaceName() {
  const date = new Date();
  return `Workspace ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function showNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.classList.toggle('error', isError);
  elements.notice.hidden = false;
}

function hideNotice() {
  elements.notice.hidden = true;
  elements.notice.classList.remove('error');
  elements.notice.textContent = '';
}

function relativeTime(timestamp) {
  if (!timestamp) return 'just now';

  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
