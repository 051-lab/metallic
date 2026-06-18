// src/utils/storage.js - Data Layer

const DEFAULT_CONFIG = {
  autoScanEnabled: true,
  scanIntervalMinutes: 5,
  commonPorts: [3000, 5173, 8080, 8000, 4200, 5000, 8888],
  customServers: []
};

export const getDashboardData = async () => {
  const result = await chrome.storage.local.get('dashboardConfig');
  return result.dashboardConfig || DEFAULT_CONFIG;
};

export const saveDashboardData = async (config) => {
  await chrome.storage.local.set({ dashboardConfig: config });
};

export const addServer = async (server) => {
  const config = await getDashboardData();
  const newServer = {
    id: crypto.randomUUID(),
    name: server.name || `Port ${server.port}`,
    port: parseInt(server.port),
    protocol: server.protocol || 'http',
    healthEndpoint: server.healthEndpoint || '/',
    icon: server.icon || 'server',
    ...server
  };
  config.customServers.push(newServer);
  await saveDashboardData(config);
  return newServer;
};

export const removeServer = async (id) => {
  const config = await getDashboardData();
  config.customServers = config.customServers.filter(s => s.id !== id);
  await saveDashboardData(config);
};

export const updateServer = async (id, updates) => {
  const config = await getDashboardData();
  config.customServers = config.customServers.map(s =>
    s.id === id ? { ...s, ...updates } : s
  );
  await saveDashboardData(config);
};
