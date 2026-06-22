import { describe, expect, it } from "vitest";
import { normalizeSnapshot, toJupyter } from "../src/core/transform";
import { safeFilename } from "../src/core/download";
import type { PlatformAdapter } from "../src/core/types";

const adapter: PlatformAdapter = {
  id: "chatgpt",
  displayName: "ChatGPT",
  adapterVersion: 1,
  hostPatterns: ["chatgpt.com"],
  matches: () => true,
  detect: () => ({ confidence: 1, reason: "fixture" }),
  extract: async () => ({ title: "Fixture", messages: [] })
};

describe("conversation transforms", () => {
  it("renders platform-neutral markdown and executable notebook cells", () => {
    const snapshot = normalizeSnapshot(adapter, {
      title: "Analysis",
      context: { project: "Tests" },
      messages: [
        { role: "user", markdown: "Run this", plainText: "Run this", citations: [], attachments: [] },
        { role: "assistant", markdown: "```python\nprint(1)\n```", plainText: "print(1)", citations: [], attachments: [] }
      ]
    }, "https://chatgpt.com/c/example");
    expect(snapshot.renderedMarkdown).toContain('platform: "ChatGPT"');
    expect(snapshot.renderedMarkdown).toContain("## Assistant");
    const notebook = JSON.parse(toJupyter(snapshot));
    expect(notebook.nbformat).toBe(4);
    expect(notebook.cells.some((cell: { cell_type: string }) => cell.cell_type === "code")).toBe(true);
  });

  it("sanitizes generated filenames", () => {
    expect(safeFilename('ChatGPT: "analysis" / notes', "md"))
      .toBe("ChatGPT_ _analysis_ _ notes.md");
  });
});
