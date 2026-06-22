chrome.runtime.onStartup.addListener(() => {
  console.log('Chrome started. Waiting for user interaction.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startExtension') {
    console.log('Extension started');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id || !tab.url?.startsWith('https://gemini.google.com/')) {
        sendResponse({ ok: false, error: 'Open a Gemini tab before starting the tool.' });
        return;
      }

      const showOverlay = () => {
        chrome.tabs.sendMessage(tab.id, { action: 'showOverlay' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response || { ok: true });
        });
      };

      // The manifest normally injects these files. Only inject them when the tab
      // predates an extension reload and therefore has no content-script listener.
      chrome.tabs.sendMessage(tab.id, { action: 'ping' }, () => {
        if (!chrome.runtime.lastError) {
          showOverlay();
          return;
        }

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['turndown.min.js', 'storage.js', 'contentScript.js']
        }, () => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          showOverlay();
        });
      });
    });

    return true;
  }
});
