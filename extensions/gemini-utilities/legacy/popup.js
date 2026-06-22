document.addEventListener('DOMContentLoaded', async function() {
  const button = document.getElementById('myButton');
  if (button) {
    button.addEventListener('click', function() {
      chrome.runtime.sendMessage({ action: 'startExtension' }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          button.textContent = response?.error || 'Unable to start';
          button.title = response?.error || chrome.runtime.lastError?.message || '';
          setTimeout(() => {
            button.textContent = 'Start Tool';
            button.title = '';
          }, 2500);
          return;
        }
        window.close();
      });
    });
  }

  const archiveList = document.getElementById('archiveList');
  const searchInput = document.getElementById('searchInput');

  async function renderConversations(query = '') {
    const convos = await window.ArchiveDB.searchConversations(query);
    archiveList.innerHTML = '';

    if (convos.length === 0) {
      archiveList.innerHTML = `<div class="empty-state">No archived conversations found.<br><br>Use the "Save to Archive" button in the Gemini Utilities overlay to save one!</div>`;
      return;
    }

    convos.forEach(convo => {
      const li = document.createElement('li');
      li.className = 'archive-item';

      const title = document.createElement('div');
      title.className = 'archive-title';
      title.textContent = convo.title;

      if (convo.notebookContext) {
        const badge = document.createElement('span');
        badge.className = 'notebook-badge';
        badge.textContent = convo.notebookContext;
        title.appendChild(badge);
      }

      const date = document.createElement('div');
      date.className = 'archive-date';
      date.textContent = new Date(convo.date).toLocaleString();

      li.appendChild(title);
      li.appendChild(date);

      li.addEventListener('click', () => {
        // Open archive.html with the ID
        chrome.tabs.create({ url: chrome.runtime.getURL(`archive.html?id=${convo.id}`) });
      });

      archiveList.appendChild(li);
    });
  }

  searchInput.addEventListener('input', (e) => {
    renderConversations(e.target.value);
  });

  // Initial render
  await renderConversations();
});
