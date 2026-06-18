// src/popup/popup.js
import { getDashboardData, addServer, removeServer } from '../utils/storage.js';
import { openOrFocusTab, buildServerUrl } from '../utils/tabs.js';

const serverListEl = document.getElementById('serverList');
const loadingEl = document.getElementById('loading');
const emptyStateEl = document.getElementById('emptyState');
const modal = document.getElementById('modal');
const addForm = document.getElementById('addForm');
const lastScanTimeEl = document.getElementById('lastScanTime');

const renderServers = async () => {
  loadingEl.classList.remove('hidden');
  serverListEl.innerHTML = '';
  emptyStateEl.classList.add('hidden');

  const config = await getDashboardData();
  const { lastScanResults = {}, lastScanTime } = await chrome.storage.local.get(['lastScanResults', 'lastScanTime']);

  if (lastScanTime) {
    const d = new Date(lastScanTime);
    lastScanTimeEl.textContent = `Last scan: ${d.toLocaleTimeString()}`;
  }

  const servers = [
    ...config.commonPorts.map(p => ({
      id: `common-${p}`,
      name: `Port ${p}`,
      port: p,
      protocol: 'http',
      healthEndpoint: '/',
      isCommon: true
    })),
    ...config.customServers
  ];

  const visibleServers = servers.filter(s =>
    lastScanResults[s.port] === 'online' || !s.isCommon
  );

  loadingEl.classList.add('hidden');

  if (visibleServers.length === 0) {
    emptyStateEl.classList.remove('hidden');
    return;
  }

  visibleServers.forEach(server => {
    const status = lastScanResults[server.port] || 'unknown';
    const card = document.createElement('div');
    card.className = `server-card status-${status}`;
    const url = buildServerUrl(server);

    card.innerHTML = `
      <div class="server-info">
        <div class="status-dot"></div>
        <div class="server-details">
          <span class="server-name">${server.name}</span>
          <span class="server-url">${url}</span>
        </div>
      </div>
      <div class="server-actions">
        <button class="btn btn-open">Open</button>
        ${!server.isCommon ? `<button class="btn btn-remove">✕</button>` : ''}
      </div>
    `;

    card.querySelector('.btn-open').addEventListener('click', () => openOrFocusTab(url));
    const removeBtn = card.querySelector('.btn-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        await removeServer(server.id);
        renderServers();
      });
    }

    serverListEl.appendChild(card);
  });
};

document.getElementById('refreshBtn').addEventListener('click', async () => {
  const btn = document.getElementById('refreshBtn');
  btn.textContent = '...';
  btn.disabled = true;
  await chrome.runtime.sendMessage({ action: 'refreshScan' });
  setTimeout(() => {
    renderServers();
    btn.textContent = '\u21BB';
    btn.disabled = false;
  }, 1500);
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('addServerBtn').addEventListener('click', () => {
  modal.classList.remove('hidden');
});
document.getElementById('cancelBtn').addEventListener('click', () => {
  modal.classList.add('hidden');
  addForm.reset();
});

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('serverName').value.trim();
  const port = document.getElementById('serverPort').value;
  const protocol = document.getElementById('serverProtocol').value;
  await addServer({ name, port, protocol });
  modal.classList.add('hidden');
  addForm.reset();
  renderServers();
});

renderServers();
