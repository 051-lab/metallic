// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  migrateLegacyArchive,
  saveSnapshot
} from "../src/core/archive-db";
import type { ConversationSnapshot } from "../src/core/types";

const snapshot = (title: string, platformId: ConversationSnapshot["platformId"]): ConversationSnapshot => ({
  schemaVersion: 2,
  platformId,
  platformName: platformId === "chatgpt" ? "ChatGPT" : "Gemini",
  adapterVersion: 1,
  title,
  sourceUrl: "https://example.test/chat",
  capturedAt: new Date().toISOString(),
  context: {},
  messages: [],
  renderedMarkdown: `# ${title}`,
  completeness: "complete",
  warnings: []
});

const deleteDatabase = () => new Promise<void>((resolve, reject) => {
  const request = indexedDB.deleteDatabase("ai-chat-utilities");
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});

beforeEach(async () => {
  await deleteDatabase();
  vi.restoreAllMocks();
});

describe("archive database", () => {
  it("saves, searches, filters, retrieves, and deletes snapshots", async () => {
    const geminiId = await saveSnapshot(snapshot("Gemini research", "gemini"));
    await saveSnapshot(snapshot("ChatGPT analysis", "chatgpt"));

    expect((await listSnapshots()).map((item) => item.title)).toHaveLength(2);
    expect((await listSnapshots("research")).map((item) => item.title)).toEqual(["Gemini research"]);
    expect((await listSnapshots("", "chatgpt")).map((item) => item.title)).toEqual(["ChatGPT analysis"]);
    expect((await getSnapshot(geminiId))?.title).toBe("Gemini research");

    await deleteSnapshot(geminiId);
    expect(await getSnapshot(geminiId)).toBeUndefined();
  });

  it("migrates legacy archives once and preserves a backup", async () => {
    const state: Record<string, unknown> = {
      archiveSchemaVersion: 0,
      conversations: [{
        id: "123",
        title: "Legacy thread",
        date: "2026-06-20T12:00:00.000Z",
        notebookContext: "Research",
        markdownContent: "**User:**\nQuestion\n\n---\n\n**Gemini:**\nAnswer\n\n---\n"
      }]
    };
    const set = vi.fn(async (values: Record<string, unknown>) => Object.assign(state, values));
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (defaults: Record<string, unknown>) => ({ ...defaults, ...state })),
          set
        }
      }
    });

    expect(await migrateLegacyArchive()).toBe(1);
    expect(await migrateLegacyArchive()).toBe(0);
    const migrated = await getSnapshot("legacy-123");
    expect(migrated?.context.notebook).toBe("Research");
    expect(migrated?.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      archiveSchemaVersion: 2,
      legacyConversationsBackup: state.conversations
    }));
  });
});
