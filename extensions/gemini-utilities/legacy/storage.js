// storage.js - A simple wrapper around chrome.storage.local for archiving conversations

var ArchiveDB = {
    async saveConversation(title, markdownContent, notebookContext = null) {
        const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const date = new Date().toISOString();
        const conversation = { id, title, markdownContent, date, notebookContext };

        const data = await chrome.storage.local.get(['conversations']);
        const conversations = data.conversations || [];
        conversations.push(conversation);

        await chrome.storage.local.set({ conversations });
        return id;
    },

    async getAllConversations() {
        const data = await chrome.storage.local.get(['conversations']);
        return (data.conversations || []).sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
    },

    async getConversation(id) {
        const conversations = await this.getAllConversations();
        return conversations.find(c => c.id === id);
    },

    async deleteConversation(id) {
        let conversations = await this.getAllConversations();
        conversations = conversations.filter(c => c.id !== id);
        await chrome.storage.local.set({ conversations });
    },

    async searchConversations(query) {
        const conversations = await this.getAllConversations();
        if (!query) return conversations;

        const lowerQuery = query.toLowerCase();
        return conversations.filter(c =>
            c.title.toLowerCase().includes(lowerQuery) ||
            c.markdownContent.toLowerCase().includes(lowerQuery) ||
            (c.notebookContext || '').toLowerCase().includes(lowerQuery)
        );
    }
};

// Make it available globally
window.ArchiveDB = ArchiveDB;
