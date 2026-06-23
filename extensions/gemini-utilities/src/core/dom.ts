import TurndownService from "turndown";
import type {
  AttachmentReference,
  Citation,
  ConversationMessage,
  MessageRole,
  SemanticExtraction
} from "./types";

export const turndown = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced"
});

turndown.addRule("citations", {
  filter: (node) =>
    node.nodeName === "A" &&
    Boolean((node as HTMLAnchorElement).href) &&
    /^\s*\[?\d+\]?\s*$/.test(node.textContent || ""),
  replacement: (content, node) =>
    `[${content.trim().replace(/^\[|\]$/g, "")}](${(node as HTMLAnchorElement).href})`
});

export function firstText(document: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent?.trim();
    if (text) return text;
  }
  return undefined;
}

export function roleFromElement(element: Element, fallback: MessageRole = "unknown"): MessageRole {
  const signal = [
    element.getAttribute("data-message-author-role"),
    element.getAttribute("data-author"),
    element.getAttribute("aria-label"),
    element.className,
    element.tagName
  ].join(" ").toLowerCase();
  if (/(^|\W)(user|human|you)(\W|$)/.test(signal)) return "user";
  if (/(assistant|bot|model|claude|gemini|qwen|chatgpt)/.test(signal)) return "assistant";
  if (/system/.test(signal)) return "system";
  if (/tool/.test(signal)) return "tool";
  return fallback;
}

export function collectCitations(element: Element): Citation[] {
  return Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .map((anchor) => ({
      label: anchor.textContent?.trim() || new URL(anchor.href).hostname,
      url: anchor.href
    }))
    .filter((citation, index, all) =>
      all.findIndex((candidate) => candidate.url === citation.url) === index
    );
}

export function collectAttachments(element: Element): AttachmentReference[] {
  const attachments: AttachmentReference[] = [];
  element.querySelectorAll<HTMLAnchorElement>("a[download], a[href]").forEach((anchor) => {
    const name = anchor.getAttribute("download") || anchor.textContent?.trim();
    if (!name || name.length > 160) return;
    const signal = `${anchor.className} ${anchor.getAttribute("aria-label") || ""}`.toLowerCase();
    if (/(attachment|artifact|file|download)/.test(signal)) {
      attachments.push({ name, url: anchor.href, kind: signal.includes("artifact") ? "artifact" : "file" });
    }
  });
  element.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    const name = image.alt?.trim();
    if (name) attachments.push({ name, url: image.src, kind: "image" });
  });
  return attachments.filter((item, index, all) =>
    all.findIndex((candidate) => candidate.name === item.name && candidate.url === item.url) === index
  );
}

export function messageFromElement(element: Element, role?: MessageRole): ConversationMessage {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("button, textarea, input, nav, [contenteditable='true']").forEach((node) => node.remove());
  const markdown = turndown.turndown(clone.innerHTML).trim();
  return {
    role: role || roleFromElement(element),
    markdown,
    plainText: element.textContent?.trim() || "",
    citations: collectCitations(element),
    attachments: collectAttachments(element)
  };
}

export function dedupeNested(elements: Element[]): Element[] {
  const unique = [...new Set(elements)];
  return unique.filter((element, index) =>
    !unique.some((candidate, candidateIndex) =>
      candidateIndex !== index && candidate.contains(element)
    )
  );
}

export function possibleVirtualization(document: Document): boolean {
  return Boolean(document.querySelector(
    "[data-virtualized], [style*='translateY'], [aria-rowcount], .virtualized"
  ));
}

export function queryComposedAll(selectors: string[], document: Document = window.document): Element[] {
  const results: Element[] = [];
  const visited = new Set<Document | ShadowRoot>();
  const visit = (root: Document | ShadowRoot) => {
    if (visited.has(root)) return;
    visited.add(root);
    for (const selector of selectors) {
      try {
        results.push(...Array.from(root.querySelectorAll(selector)));
      } catch {
        // Invalid imported selectors are ignored at extraction time.
      }
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
        // Cross-origin frames are outside extension page access.
      }
    });
  };
  visit(document);
  return [...new Set(results)];
}

const SEMANTIC_SELECTORS = [
  "[data-message-author-role]",
  "[data-message-role]",
  "[data-role='user']",
  "[data-role='assistant']",
  "[role='article']",
  "main article",
  "main [class*='message']",
  "main [class*='Message']",
  "main [class*='turn']",
  "main [class*='Turn']",
  "main [class*='response']",
  "main [class*='Response']"
];

function isUsableMessage(element: Element): boolean {
  if (element.closest("nav, aside, header, footer, [role='navigation'], [aria-hidden='true']")) {
    return false;
  }
  const text = element.textContent?.trim() || "";
  if (text.length < 2 || text.length > 250_000) return false;
  if (element.matches("button, form, textarea, input, [contenteditable='true']")) return false;
  return true;
}

export function semanticExtraction(document: Document): SemanticExtraction {
  const raw = queryComposedAll(SEMANTIC_SELECTORS, document).filter(isUsableMessage);
  const elements = dedupeNested(raw);
  const roleCount = elements.filter((element) => roleFromElement(element) !== "unknown").length;
  const mainCount = elements.filter((element) => Boolean(element.closest("main, [role='main']"))).length;
  const alternating = elements.length >= 2
    ? elements.reduce((count, element, index) => {
      if (!index) return count;
      const current = roleFromElement(element);
      const prior = roleFromElement(elements[index - 1]!);
      return count + (current !== "unknown" && prior !== "unknown" && current !== prior ? 1 : 0);
    }, 0)
    : 0;
  let confidence = 0.12;
  if (elements.length >= 2) confidence += 0.22;
  if (elements.length >= 4) confidence += 0.13;
  confidence += Math.min(0.25, (roleCount / Math.max(1, elements.length)) * 0.25);
  confidence += Math.min(0.13, (mainCount / Math.max(1, elements.length)) * 0.13);
  if (alternating >= Math.max(1, elements.length / 3)) confidence += 0.1;
  return {
    elements,
    confidence: Math.min(0.95, confidence),
    reasons: [
      `${elements.length} repeated message blocks`,
      `${roleCount} explicit speaker signals`,
      `${mainCount} candidates inside the primary content region`
    ]
  };
}
