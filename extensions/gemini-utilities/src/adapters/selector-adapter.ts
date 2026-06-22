import {
  dedupeNested,
  firstText,
  messageFromElement,
  possibleVirtualization,
  roleFromElement
} from "../core/dom";
import type {
  ConversationDraft,
  MessageRole,
  PlatformAdapter,
  PlatformId
} from "../core/types";

export interface SelectorAdapterConfig {
  id: Exclude<PlatformId, "generic">;
  displayName: string;
  hosts: string[];
  messageSelectors: string[];
  titleSelectors: string[];
  contextSelectors?: Record<string, string[]>;
  role?: (element: Element, index: number) => MessageRole;
  newChatSelectors?: string[];
}

export function createSelectorAdapter(config: SelectorAdapterConfig): PlatformAdapter {
  return {
    id: config.id,
    displayName: config.displayName,
    adapterVersion: 1,
    hostPatterns: config.hosts,
    matches: (url) => config.hosts.includes(url.hostname),
    detect(document) {
      const count = config.messageSelectors.reduce(
        (total, selector) => total + document.querySelectorAll(selector).length,
        0
      );
      return {
        confidence: count > 1 ? 0.95 : count === 1 ? 0.6 : 0,
        reason: `${count} message candidates`
      };
    },
    async extract(document): Promise<ConversationDraft> {
      const elements = dedupeNested(
        config.messageSelectors.flatMap((selector) =>
          Array.from(document.querySelectorAll(selector))
        )
      );
      const messages = elements
        .map((element, index) =>
          messageFromElement(element, config.role?.(element, index) || roleFromElement(
            element,
            index % 2 === 0 ? "user" : "assistant"
          ))
        )
        .filter((message) => message.plainText || message.markdown);
      const context: Record<string, string> = {};
      for (const [key, selectors] of Object.entries(config.contextSelectors || {})) {
        const value = firstText(document, selectors);
        if (value) context[key] = value;
      }
      const virtualized = possibleVirtualization(document);
      return {
        title: firstText(document, config.titleSelectors) ||
          document.title.replace(/\s*[-|]\s*(Gemini|ChatGPT|Claude|Qwen).*$/i, "").trim() ||
          `${config.displayName} conversation`,
        context,
        messages,
        completeness: virtualized ? "possibly-truncated" : "complete",
        warnings: virtualized
          ? ["This page may virtualize older messages. Scroll to the beginning and retry for a complete capture."]
          : []
      };
    },
    getNewChatTarget(document) {
      for (const selector of config.newChatSelectors || []) {
        const target = document.querySelector<HTMLAnchorElement>(selector)?.href;
        if (target) return target;
      }
      return null;
    }
  };
}
