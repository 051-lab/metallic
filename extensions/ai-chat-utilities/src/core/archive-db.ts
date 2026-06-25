import type { ArchiveListItem, ConversationSnapshot } from "./types";

const DB_NAME = "ai-chat-utilities";
const STORE = "conversations";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("capturedAt", "capturedAt");
      store.createIndex("platformId", "platformId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function saveSnapshot(snapshot: ConversationSnapshot): Promise<string> {
  const id = snapshot.id || crypto.randomUUID();
  await storeRequest("readwrite", (store) => store.put({ ...snapshot, id }));
  return id;
}

export async function getSnapshot(id: string): Promise<ConversationSnapshot | undefined> {
  return storeRequest("readonly", (store) => store.get(id));
}

export async function deleteSnapshot(id: string): Promise<void> {
  await storeRequest("readwrite", (store) => store.delete(id));
}

export async function listSnapshots(query = "", platformId = ""): Promise<ArchiveListItem[]> {
  const records = await storeRequest<ConversationSnapshot[]>(
    "readonly",
    (store) => store.getAll()
  );
  const normalizedQuery = query.trim().toLowerCase();
  return records
    .filter((record) =>
      (!platformId || record.platformId === platformId) &&
      (!normalizedQuery ||
        record.title.toLowerCase().includes(normalizedQuery) ||
        record.renderedMarkdown.toLowerCase().includes(normalizedQuery) ||
        Object.values(record.context).some((value) => value.toLowerCase().includes(normalizedQuery)))
    )
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
    .map(({ id, platformId, platformName, title, capturedAt, context, completeness }) => ({
      id: id!,
      platformId,
      platformName,
      title,
      capturedAt,
      context,
      completeness
    }));
}

function legacyMessages(markdown: string): ConversationSnapshot["messages"] {
  const marker = /\*\*(User|Gemini):\*\*\s*\n([\s\S]*?)(?=\n---\n|\s*$)/g;
  const messages: ConversationSnapshot["messages"] = [];
  let match: RegExpExecArray | null;
  while ((match = marker.exec(markdown))) {
    messages.push({
      role: match[1] === "User" ? "user" : "assistant",
      markdown: match[2]?.trim() || "",
      plainText: match[2]?.trim() || "",
      citations: [],
      attachments: []
    });
  }
  return messages.length ? messages : [{
    role: "unknown",
    markdown,
    plainText: markdown,
    citations: [],
    attachments: []
  }];
}

export async function migrateLegacyArchive(): Promise<number> {
  const { archiveSchemaVersion, conversations = [] } = await chrome.storage.local.get({
    archiveSchemaVersion: 0,
    conversations: []
  });
  if (archiveSchemaVersion >= 2 || !Array.isArray(conversations)) return 0;
  let migrated = 0;
  for (const legacy of conversations) {
    const markdown = String(legacy.markdownContent || "");
    const snapshot: ConversationSnapshot = {
      schemaVersion: 2,
      id: `legacy-${legacy.id || crypto.randomUUID()}`,
      platformId: "gemini",
      platformName: "Gemini",
      adapterVersion: 0,
      title: legacy.title || "Legacy Gemini conversation",
      sourceUrl: "https://gemini.google.com/",
      capturedAt: legacy.date || new Date().toISOString(),
      context: legacy.notebookContext ? { notebook: legacy.notebookContext } : {},
      messages: legacyMessages(markdown),
      renderedMarkdown: markdown,
      completeness: "complete",
      warnings: ["Migrated from the Gemini Utilities v1 archive."]
    };
    await saveSnapshot(snapshot);
    migrated += 1;
  }
  await chrome.storage.local.set({
    archiveSchemaVersion: 2,
    legacyConversationsBackup: conversations
  });
  return migrated;
}
