import {
  dedupeNested,
  firstText,
  messageFromElement,
  possibleVirtualization,
  queryComposedAll,
  roleFromElement,
  semanticExtraction
} from "../core/dom";
import { isGoogleAiModeUrl } from "../core/platforms";
import type { ConversationDraft, MessageRole, PlatformAdapter } from "../core/types";

const MESSAGE_SELECTORS = [
  "[data-message-author-role]",
  "[data-message-role]",
  "[data-author]",
  "[data-role='user']",
  "[data-role='assistant']",
  "[role='article']",
  "main article",
  "main [class*='message']",
  "main [class*='Message']",
  "main [class*='response']",
  "main [class*='Response']",
  "main [class*='answer']",
  "main [class*='Answer']",
  "main [class*='query']",
  "main [class*='Query']"
];

function usable(element: Element): boolean {
  if (element.closest("nav, aside, header, footer, [role='navigation'], [aria-hidden='true']")) {
    return false;
  }
  if (element.matches("button, form, textarea, input, [contenteditable='true']")) return false;
  const text = element.textContent?.trim() || "";
  if (text.length < 2 || text.length > 250_000) return false;
  return true;
}

function googleRole(element: Element, index: number): MessageRole {
  const explicit = roleFromElement(element);
  if (explicit !== "unknown") return explicit;
  const signal = [
    element.getAttribute("aria-label"),
    element.getAttribute("data-testid"),
    element.getAttribute("data-role"),
    element.className,
    element.id
  ].join(" ").toLowerCase();
  if (/(^|\W)(you|your|user|query|question|prompt)(\W|$)/.test(signal)) return "user";
  if (/(ai\s*mode|assistant|answer|response|overview|gemini)/.test(signal)) return "assistant";
  return index % 2 === 0 ? "user" : "assistant";
}

function titleFor(document: Document): string {
  return firstText(document, [
    "h1",
    "main h1",
    "[data-attrid='title']",
    "[role='heading'][aria-level='1']"
  ]) ||
    document.title
      .replace(/\s*[-|]\s*(Google Search|Google|AI Mode).*$/i, "")
      .replace(/^AI Mode\s*[-|]\s*/i, "")
      .trim() ||
    "Google AI Mode conversation";
}

export const googleAiModeAdapter: PlatformAdapter = {
  id: "google-ai-mode",
  displayName: "Google AI Mode",
  adapterVersion: 1,
  hostPatterns: ["google.com", "www.google.com"],
  matches: isGoogleAiModeUrl,
  detect(document) {
    const semantic = semanticExtraction(document);
    const googleCandidates = dedupeNested(queryComposedAll(MESSAGE_SELECTORS, document).filter(usable));
    const count = Math.max(semantic.elements.length, googleCandidates.length);
    return {
      confidence: count >= 2 ? Math.max(0.76, semantic.confidence) : semantic.confidence,
      reason: `${count} Google AI Mode message candidates`
    };
  },
  async extract(document): Promise<ConversationDraft> {
    const googleCandidates = dedupeNested(queryComposedAll(MESSAGE_SELECTORS, document).filter(usable));
    const semantic = semanticExtraction(document);
    const source = googleCandidates.length >= 2 ? googleCandidates : semantic.elements;
    const virtualized = possibleVirtualization(document);
    return {
      title: titleFor(document),
      context: {
        surface: "Google Search AI Mode"
      },
      messages: source.map((element, index) =>
        messageFromElement(element, googleRole(element, index))
      ).filter((message) => message.plainText || message.markdown),
      completeness: virtualized ? "possibly-truncated" : "complete",
      warnings: virtualized
        ? ["Google AI Mode may virtualize older content. Scroll through the thread before capture."]
        : []
    };
  },
  getNewChatTarget() {
    return "https://www.google.com/ai";
  }
};
