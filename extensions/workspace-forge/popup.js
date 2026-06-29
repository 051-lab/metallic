const notice = document.querySelector('#notice');
const openPanelButton = document.querySelector('#open-panel');
const saveWindowButton = document.querySelector('#save-window');
const workspaceCount = document.querySelector('#workspace-count');
const plural = document.querySelector('#plural');

openPanelButton.addEventListener('click', openPanel);
saveWindowButton.addEventListener('click', saveCurrentWindow);

document.addEventListener('DOMContentLoaded', refreshSummary);

async function refreshSummary() {
  await runAction(async () => {
    const state = await sendMessage({ type: 'GET_STATE' });
    workspaceCount.textContent = String(state.workspaces.length);
    plural.hidden = state.workspaces.length === 1;
  }, { quiet: true });
}

async function openPanel() {
  await runAction(async () => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await sendMessage({ type: 'OPEN_SIDE_PANEL', windowId: activeTab?.windowId });
    window.close();
  });
}

async function saveCurrentWindow() {
  const name = prompt('Name this workspace:', suggestWorkspaceName());
  if (name === null) return;

  await runAction(async () => {
    const state = await sendMessage({
      type: 'SAVE_CURRENT_WINDOW',
      payload: { name, color: 'silver' }
    });
    workspaceCount.textContent = String(state.workspaces.length);
    plural.hidden = state.workspaces.length === 1;
    showNotice('Current window saved. Open the side panel to edit details.');
  });
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

function suggestWorkspaceName() {
  const date = new Date();
  return `Workspace ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.hidden = false;
}

function hideNotice() {
  notice.hidden = true;
  notice.classList.remove('error');
  notice.textContent = '';
}
