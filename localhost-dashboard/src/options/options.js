// src/options/options.js

const autoScanEl = document.getElementById('autoScan');
const scanIntervalEl = document.getElementById('scanInterval');
const commonPortsEl = document.getElementById('commonPorts');
const saveBtn = document.getElementById('saveBtn');
const statusMsg = document.getElementById('statusMsg');

const DEFAULT_CONFIG = {
  autoScanEnabled: true,
  scanIntervalMinutes: 5,
  commonPorts: [3000, 5173, 8080, 8000, 4200, 5000, 8888]
};

const loadSettings = async () => {
  const result = await chrome.storage.local.get('dashboardConfig');
  const config = result.dashboardConfig || DEFAULT_CONFIG;
  autoScanEl.checked = config.autoScanEnabled;
  scanIntervalEl.value = config.scanIntervalMinutes;
  commonPortsEl.value = config.commonPorts.join(', ');
};

saveBtn.addEventListener('click', async () => {
  const result = await chrome.storage.local.get('dashboardConfig');
  const config = result.dashboardConfig || DEFAULT_CONFIG;

  config.autoScanEnabled = autoScanEl.checked;
  config.scanIntervalMinutes = Math.max(1, parseInt(scanIntervalEl.value) || 5);

  const parsedPorts = commonPortsEl.value
    .split(',')
    .map(p => parseInt(p.trim()))
    .filter(p => !isNaN(p) && p > 0 && p <= 65535);
  config.commonPorts = [...new Set(parsedPorts)];

  await chrome.storage.local.set({ dashboardConfig: config });

  if (config.autoScanEnabled) {
    await chrome.alarms.clear('scanAlarm');
    chrome.alarms.create('scanAlarm', { periodInMinutes: config.scanIntervalMinutes });
  } else {
    await chrome.alarms.clear('scanAlarm');
  }

  statusMsg.classList.add('show');
  setTimeout(() => statusMsg.classList.remove('show'), 2000);
});

loadSettings();
