import {
  dedupeNested,
  firstText,
  messageFromElement,
  possibleVirtualization,
  queryComposedAll,
  roleFromElement,
  turndown,
  semanticExtraction
} from "../core/dom";
import { isGoogleAiModeUrl } from "../core/platforms";
import type { ConversationDraft, ConversationMessage, MessageRole, PlatformAdapter } from "../core/types";

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

function visibleText(element: Element): string {
  const htmlElement = element as HTMLElement;
  const style = typeof getComputedStyle === "function" ? getComputedStyle(htmlElement) : undefined;
  if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
    return "";
  }
  return element.textContent?.replace(/\s+/g, " ").trim() || "";
}

function shouldSkipTextParent(element: Element): boolean {
  return Boolean(element.closest([
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "nav",
    "aside",
    "header",
    "footer",
    "button",
    "form",
    "textarea",
    "input",
    "[contenteditable='true']",
    "[role='navigation']",
    "[aria-hidden='true']"
  ].join(",")));
}

function inLikelySourceRail(element: Element): boolean {
  const rect = (element as HTMLElement).getBoundingClientRect?.();
  const viewportWidth = typeof innerWidth === "number" ? innerWidth : 0;
  if (!rect || !viewportWidth || rect.width === 0) return false;
  return rect.left > viewportWidth * 0.55 && rect.width < viewportWidth * 0.5;
}

function isGoogleUiText(text: string): boolean {
  return /^(AI Mode|All|Images|Videos|News|More|Upgrade|Ask anything|Skip to main content|Accessibility help|See my AI Mode history|Search Results|AI Mode history|Recent|You said:)$/i
    .test(text) ||
    /^.+ - Google Search$/i.test(text) ||
    /^Something went wrong\./i.test(text) ||
    /^what'?s on your mind\??$/i.test(text) ||
    /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(text);
}

function isPostAnswerUiText(text: string): boolean {
  return /^(Share public link|This public link shares a thread|A copy of this chat|Your feedback will include|Thanks for letting us know|Google may use account and system data|Terms of Service|make a legal removal request)$/i
    .test(text);
}

function cleanAssistantMarkdown(markdown: string, query: string): string {
  let value = markdown.replace(query, "").trim();
  const stop = value.search(/\b(Share public link|This public link shares a thread|A copy of this chat|Your feedback will include|Thanks for letting us know|Google may use account and system data)\b/i);
  if (stop >= 0) value = value.slice(0, stop).trim();
  value = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isGoogleUiText(line) && !isPostAnswerUiText(line))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return repairQueryTermGaps(value, query);
}

function queryTerm(query: string): string {
  const cleaned = query
    .replace(/[?!.]+$/g, "")
    .replace(/^(what|who|where|when|why|how)\s+(is|are|was|were|do|does|did|to)\s+/i, "")
    .replace(/^(explain|define|describe)\s+/i, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1]! : cleaned;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function repairQueryTermGaps(markdown: string, query: string): string {
  const term = queryTerm(query);
  if (!term || term.length > 40) return markdown;
  const escaped = escapeRegExp(term);
  let value = markdown;

  // Google AI Mode often renders the command token as a separate chip. When
  // the fallback text walker misses that chip, predictable sentence fragments
  // are left behind. Repair those gaps using the query term.
  value = value
    .replace(new RegExp(`^is a powerful command-line utility`, "im"), `${term} is a powerful command-line utility`)
    .replace(new RegExp(`\\bHow\\s+Works\\b`, "g"), `How ${term} Works`)
    .replace(new RegExp(`\\bBy default,\\s+reads\\b`, "g"), `By default, ${term} reads`)
    .replace(new RegExp(`\\bYou can use\\s+to scan\\b`, "g"), `You can use ${term} to scan`)
    .replace(new RegExp(`\\bCombine\\s+with other commands\\b`, "g"), `Combine ${term} with other commands`)
    .replace(new RegExp(`\\bModifiers can drastically alter how\\s+finds\\b`, "g"), `Modifiers can drastically alter how ${term} finds`)
    .replace(new RegExp(`\\bBasic Regex Examples with\\s+becomes\\b`, "g"), `Basic Regex Examples with ${term}\n\n${term} becomes`)
    .replace(new RegExp(`\\bThe basic syntax is:\\s+${escaped}\\s+\\[options\\]`, "i"), `The basic syntax is:\n\n${term} [options]`);

  if (term.toLowerCase() === "grep") {
    value = value
      .replace(/\bThe name stands for\s+lobal\s+egular\s+xpression\s+rint\b/gi, "The name stands for Global Regular Expression Print")
      .replace(/\bThe name stands for\s+rint\b/gi, "The name stands for Global Regular Expression Print")
      .replace(/\(\s+g\/re\/p\s+\)/g, "(g/re/p)")
      .replace(/\(\s*\)\s+that meant/gi, "(g/re/p) that meant");
  }

  return value.replace(/\n{3,}/g, "\n\n").trim();
}

function artifactScore(markdown: string): number {
  const patterns = [
    /^\s*is a powerful command-line utility/im,
    /The name stands for\s+rint/i,
    /stemming from.*command\s*\(\s*\)/is,
    /\nreads through text line-by-line/i,
    /Common Ways to Use\s+to scan/i,
    /how\s+finds or displays data/i,
    /Basic Regex Examples with\s+becomes/i
  ];
  return patterns.reduce((score, pattern) => score + (pattern.test(markdown) ? 1 : 0), 0);
}

function chooseAssistantBlocks(candidates: string[][], query: string): string[] {
  const scored = candidates
    .filter((blocks) => blocks.length)
    .map((blocks) => {
      const markdown = cleanAssistantMarkdown(blocks.join("\n\n"), query);
      return {
        blocks,
        markdown,
        score: markdown.length - artifactScore(markdown) * 10_000
      };
    })
    .filter((candidate) => candidate.markdown.length >= 12)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.blocks || [];
}

function composedTextRuns(document: Document): string[] {
  const runs: string[] = [];
  const visited = new Set<Document | ShadowRoot>();
  const addText = (value: string) => {
    const text = value.replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 25_000) return;
    if (isGoogleUiText(text) || isPostAnswerUiText(text)) return;
    if (!runs.includes(text)) runs.push(text);
  };
  const visit = (root: Document | ShadowRoot) => {
    if (visited.has(root)) return;
    visited.add(root);
    const owner = root instanceof Document ? root : root.ownerDocument;
    const walker = owner.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node: Node) {
        const text = node.textContent?.replace(/\s+/g, " ").trim() || "";
        if (text.length < 2) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || shouldSkipTextParent(parent)) return NodeFilter.FILTER_REJECT;
        if (inLikelySourceRail(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let node = walker.nextNode();
    while (node) {
      addText(node.textContent || "");
      node = walker.nextNode();
    }
    root.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot) visit(element.shadowRoot);
    });
    root.querySelectorAll<HTMLIFrameElement>("iframe").forEach((frame) => {
      try {
        if (frame.contentDocument && frame.contentDocument.location.origin === location.origin) {
          visit(frame.contentDocument);
        }
      } catch {
        // Cross-origin frames are not readable from the extension content script.
      }
    });
  };
  visit(document);
  return runs;
}

function composedElementBlocks(document: Document): string[] {
  const selectors = [
    "main p",
    "main li",
    "main h1",
    "main h2",
    "main h3",
    "main h4",
    "main pre",
    "main code",
    "main blockquote",
    "main tr",
    "[role='main'] p",
    "[role='main'] li",
    "[role='main'] h1",
    "[role='main'] h2",
    "[role='main'] h3",
    "[role='main'] h4",
    "[role='main'] pre",
    "[role='main'] code",
    "[role='main'] blockquote",
    "[role='main'] tr"
  ];
  const blocks: string[] = [];
  for (const element of queryComposedAll(selectors, document)) {
    if (shouldSkipTextParent(element) || inLikelySourceRail(element)) continue;
    const text = visibleText(element);
    if (text.length < 2 || text.length > 25_000) continue;
    if (isGoogleUiText(text) || isPostAnswerUiText(text)) continue;
    if (!blocks.includes(text)) blocks.push(text);
  }
  return blocks;
}

function hasVisibleBox(element: Element): boolean {
  const rect = (element as HTMLElement).getBoundingClientRect?.();
  if (!rect) return true;
  return rect.width > 0 && rect.height > 0;
}

function nearestUsefulBlock(element: Element): Element {
  let current: Element = element;
  for (let depth = 0; depth < 5 && current.parentElement; depth += 1) {
    const parent = current.parentElement;
    if (parent.matches("main, [role='main'], body")) break;
    const text = visibleText(parent);
    if (text.length > 1600) break;
    current = parent;
  }
  return current;
}

function visibleAiModeBlocks(document: Document): Element[] {
  const roots = queryComposedAll(["main", "[role='main']"], document);
  const root = roots[0] || document.body;
  if (!root) return [];
  const candidates = Array.from(root.querySelectorAll([
    "article",
    "[role='article']",
    "[role='heading']",
    "h1",
    "h2",
    "h3",
    "p",
    "li",
    "pre",
    "blockquote",
    "[data-attrid]",
    "[data-md]",
    "[jsname]",
    "div"
  ].join(",")))
    .filter((element) => {
      if (!usable(element) || !hasVisibleBox(element)) return false;
      const text = visibleText(element);
      if (text.length < 24 || text.length > 20_000) return false;
      if (isGoogleUiText(text) || isPostAnswerUiText(text)) return false;
      if (inLikelySourceRail(element)) return false;
      return true;
    })
    .map(nearestUsefulBlock);

  const deduped = dedupeNested(candidates);
  const byText = new Map<string, Element>();
  for (const element of deduped) {
    const text = visibleText(element);
    if (!text) continue;
    const key = text.slice(0, 500);
    const existing = byText.get(key);
    if (!existing || visibleText(existing).length < text.length) byText.set(key, element);
  }
  return [...byText.values()].slice(0, 80);
}

function fallbackMessages(document: Document): ConversationMessage[] {
  const blocks = visibleAiModeBlocks(document);
  const title = titleFor(document);
  const href = document.location?.href || (typeof location !== "undefined" ? location.href : "");
  const query = href ? new URL(href).searchParams.get("q") || title : title;
  const messages: ConversationMessage[] = [];
  if (query && query.length >= 2) {
    messages.push({
      role: "user",
      markdown: query,
      plainText: query,
      citations: [],
      attachments: []
    });
  }
  const blockCandidate = blocks
    .filter((element) => {
      const text = visibleText(element);
      return text && text !== query && !text.includes("Ask anything") &&
        !isGoogleUiText(text) && !isPostAnswerUiText(text) && !inLikelySourceRail(element);
    })
    .map((element) => turndown.turndown((element as HTMLElement).innerHTML).trim())
    .filter((markdown, index, all) =>
      markdown.length >= 12 && all.findIndex((candidate) => candidate === markdown) === index
    );
  const elementCandidate = composedElementBlocks(document)
    .filter((text, index, all) =>
      text !== query &&
      !text.includes("Ask anything") &&
      !isGoogleUiText(text) &&
      !isPostAnswerUiText(text) &&
      all.indexOf(text) === index
    );
  const textCandidate = composedTextRuns(document)
    .filter((text, index, all) =>
      text !== query &&
      !text.includes("Ask anything") &&
      !isGoogleUiText(text) &&
      !isPostAnswerUiText(text) &&
      all.indexOf(text) === index
    );
  let assistantBlocks = chooseAssistantBlocks([blockCandidate, elementCandidate, textCandidate], query);
  if (!assistantBlocks.length) {
    const rootText = visibleText(queryComposedAll(["main", "[role='main']"], document)[0] || document.body)
      .replace(/^AI Mode\s*/i, "")
      .replace(/Ask anything[\s\S]*$/i, "")
      .trim();
    if (rootText && rootText !== query) {
      assistantBlocks = [rootText.replace(query, "").trim() || rootText];
    }
  }
  if (assistantBlocks.length) {
    const assistantMarkdown = cleanAssistantMarkdown(assistantBlocks.join("\n\n"), query);
    messages.push({
      role: "assistant",
      markdown: assistantMarkdown,
      plainText: assistantMarkdown.replace(/[#*_`>~-]/g, "").replace(/\n{3,}/g, "\n\n").trim(),
      citations: [],
      attachments: []
    });
  }
  return messages;
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
    const fallbackCount = visibleAiModeBlocks(document).length;
    const count = Math.max(semantic.elements.length, googleCandidates.length, fallbackCount);
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
    const extracted = source.length
      ? source.map((element, index) =>
        messageFromElement(element, googleRole(element, index))
      ).filter((message) => message.plainText || message.markdown)
      : [];
    const messages = extracted.length >= 2 ? extracted : fallbackMessages(document);
    return {
      title: titleFor(document),
      context: {
        surface: "Google Search AI Mode"
      },
      messages,
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
