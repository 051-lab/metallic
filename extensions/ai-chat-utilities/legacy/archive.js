document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
        document.body.innerHTML = '<h2 style="padding: 20px;">No conversation ID provided.</h2>';
        return;
    }

    const convo = await window.ArchiveDB.getConversation(id);

    if (!convo) {
        document.body.innerHTML = '<h2 style="padding: 20px;">Conversation not found or has been deleted.</h2>';
        return;
    }

    document.getElementById('convoTitle').textContent = convo.title;

    if (convo.notebookContext) {
        const nbEl = document.getElementById('convoNotebook');
        nbEl.textContent = '📓 ' + convo.notebookContext;
        nbEl.style.display = 'block';
    }

    document.getElementById('convoDate').textContent = new Date(convo.date).toLocaleString();
    document.getElementById('markdownViewer').textContent = convo.markdownContent;

    document.getElementById('downloadBtn').addEventListener('click', () => {
        const blob = new Blob([convo.markdownContent], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = convo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    document.getElementById('copyBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(convo.markdownContent).then(() => {
            const btn = document.getElementById('copyBtn');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => btn.textContent = originalText, 2000);
        });
    });

    document.getElementById('deleteBtn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this archived conversation?')) {
            await window.ArchiveDB.deleteConversation(id);
            window.close();
        }
    });
});
