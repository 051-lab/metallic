import { messageFromElement, semanticExtraction } from "../core/dom";
import type { ConversationDraft, MessageRole, PlatformAdapter } from "../core/types";

export const genericAdapter: PlatformAdapter = {
  id: "generic",
  displayName: "Generic chatbot",
  adapterVersion: 1,
  hostPatterns: [],
  matches: () => true,
  detect(document) {
    const result = semanticExtraction(document);
    return {
      confidence: result.confidence,
      reason: result.reasons.join("; ")
    };
  },
  async extract(document): Promise<ConversationDraft> {
    const result = semanticExtraction(document);
    const selected = result.elements.filter((element) =>
      element.hasAttribute("data-ai-chat-selected")
    );
    const source = selected.length ? selected : result.elements;
    return {
      title: document.title || "AI conversation",
      messages: source.map((element, index) => {
        const assigned = element.getAttribute("data-ai-chat-role") as MessageRole | null;
        return messageFromElement(element, assigned || (index % 2 === 0 ? "user" : "assistant"));
      }),
      completeness: "possibly-truncated",
      warnings: [
        `Local semantic detection confidence: ${Math.round(result.confidence * 100)}%. Review speaker roles and content before relying on the export.`
      ]
    };
  }
};
