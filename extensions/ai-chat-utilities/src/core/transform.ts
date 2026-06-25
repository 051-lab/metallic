import type { ConversationDraft, ConversationSnapshot, PlatformAdapter } from "./types";

const roleLabel = (role: string) => ({
  user: "User",
  assistant: "Assistant",
  system: "System",
  tool: "Tool",
  unknown: "Message"
}[role] || "Message");

const yamlValue = (value: string) => JSON.stringify(value);

export function renderMarkdown(
  adapter: PlatformAdapter,
  draft: ConversationDraft,
  sourceUrl: string,
  capturedAt = new Date().toISOString()
): string {
  const lines = [
    "---",
    `title: ${yamlValue(draft.title)}`,
    `platform: ${yamlValue(adapter.displayName)}`,
    `source: ${yamlValue(sourceUrl)}`,
    `captured_at: ${capturedAt}`,
    `completeness: ${draft.completeness || "complete"}`
  ];
  for (const [key, value] of Object.entries(draft.context || {})) {
    lines.push(`${key.replace(/\W+/g, "_").toLowerCase()}: ${yamlValue(value)}`);
  }
  lines.push("---", "");
  for (const message of draft.messages) {
    lines.push(`## ${roleLabel(message.role)}`, "", message.markdown || message.plainText, "", "---", "");
  }
  if (draft.warnings?.length) {
    lines.push("## Capture warnings", "", ...draft.warnings.map((warning) => `- ${warning}`), "");
  }
  return lines.join("\n");
}

export function normalizeSnapshot(
  adapter: PlatformAdapter,
  draft: ConversationDraft,
  sourceUrl: string
): ConversationSnapshot {
  const capturedAt = new Date().toISOString();
  return {
    schemaVersion: 2,
    platformId: adapter.id,
    platformName: adapter.displayName,
    adapterVersion: adapter.adapterVersion,
    title: draft.title,
    sourceUrl,
    capturedAt,
    context: draft.context || {},
    messages: draft.messages,
    renderedMarkdown: renderMarkdown(adapter, draft, sourceUrl, capturedAt),
    completeness: draft.completeness || "complete",
    warnings: draft.warnings || []
  };
}

export function toJupyter(snapshot: ConversationSnapshot): string {
  const cells: Record<string, unknown>[] = [{
    cell_type: "markdown",
    metadata: {},
    source: [`# ${snapshot.title}\n\n**Platform:** ${snapshot.platformName}\n\n**Source:** ${snapshot.sourceUrl}`]
  }];
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
  for (const message of snapshot.messages) {
    cells.push({ cell_type: "markdown", metadata: {}, source: [`**${roleLabel(message.role)}**`] });
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = fence.exec(message.markdown))) {
      const prose = message.markdown.slice(last, match.index).trim();
      if (prose) cells.push({ cell_type: "markdown", metadata: {}, source: [prose] });
      const code = match[2] || "";
      cells.push({
        cell_type: "code",
        execution_count: null,
        metadata: match[1] ? { language: match[1].trim() } : {},
        outputs: [],
        source: code.replace(/\n$/, "").split("\n").map((line, index, all) =>
          index < all.length - 1 ? `${line}\n` : line
        )
      });
      last = fence.lastIndex;
    }
    const tail = message.markdown.slice(last).trim();
    if (tail) cells.push({ cell_type: "markdown", metadata: {}, source: [tail] });
  }
  return JSON.stringify({ cells, metadata: {}, nbformat: 4, nbformat_minor: 5 }, null, 2);
}
