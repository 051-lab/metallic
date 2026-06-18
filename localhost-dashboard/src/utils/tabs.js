// src/utils/tabs.js - Tab Management

export const openOrFocusTab = async (url) => {
  const existingTabs = await chrome.tabs.query({ url: `${url}*` });
  if (existingTabs.length > 0) {
    await chrome.tabs.update(existingTabs[0].id, { active: true });
    await chrome.windows.update(existingTabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
};

export const buildServerUrl = (server) => {
  return `${server.protocol || 'http'}://localhost:${server.port}${server.healthEndpoint || '/'}`;
};
