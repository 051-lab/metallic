// src/background/index.js - Service Worker
import { getDashboardData, saveDashboardData } from '../utils/storage.js';

const DEFAULT_CONFIG = {
  autoScanEnabled: true,
  scanIntervalMinutes: 5,
  commonPorts: [3000, 5173, 8080, 8000, 4200, 5000, 8888],
  customServers: []
};

async function pingPort(port) {
  try {
    await fetch(`http://localhost:${port}`, {
      method: 'GET',
      mode: 'no-cors',
      signal: AbortSignal.timeout(3000)
    });
    return { status: 'online', port };
  } catch (e) {
    if (e.name === 'TimeoutError') return { status: 'offline', port };
    // CORS errors mean the server IS running
    if (e.message.includes('Failed to fetch') || e.name === 'TypeError') {
      return { status: 'online', port };
    }
    return { status: 'offline', port };
  }
}

function updateBadge(onlineCount) {
  if (onlineCount === 0) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setBadgeText({ text: String(onlineCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  }
}

async function performScan() {
  const config = await getDashboardData();
  if (!config.autoScanEnabled) return;

  let onlineCount = 0;
  const portsToScan = [...new Set([...config.commonPorts, ...config.customServers.map(s => s.port)])];

  const results = {};
  for (const port of portsToScan) {
    const result = await pingPort(port);
    results[port] = result.status;
    if (result.status === 'online') onlineCount++;
  }

  await chrome.storage.local.set({ lastScanResults: results, lastScanTime: Date.now() });
  updateBadge(onlineCount);
}

// Initialize alarms
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('scanAlarm', { periodInMinutes: 5 });
  performScan();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'scanAlarm') performScan();
});

// Context menu
chrome.contextMenus.create({
  id: 'add-to-dashboard',
  title: 'Add to Localhost Dashboard',
  contexts: ['page'],
  documentUrlPatterns: ['http://localhost/*', 'http://127.0.0.1/*']
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'add-to-dashboard') {
    try {
      const url = new URL(tab.url);
      const port = parseInt(url.port) || 80;
      const config = await getDashboardData();
      const alreadyExists = config.customServers.some(s => s.port === port);
      if (!alreadyExists) {
        config.customServers.push({
          id: crypto.randomUUID(),
          name: `Port ${port}`,
          port,
          protocol: url.protocol.replace(':', '') || 'http',
          healthEndpoint: '/'
        });
        await saveDashboardData(config);
      }
    } catch (e) {
      console.error('Failed to add server from context menu', e);
    }
  }
});

// Message listener for popup refresh requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'refreshScan') {
    performScan().then(() => sendResponse({ success: true }));
    return true;
  }
});

// Initial scan on startup
performScan();
