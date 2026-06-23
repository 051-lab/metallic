import {
  dedupeNested,
  messageFromElement,
  possibleVirtualization,
  queryComposedAll,
  roleFromElement
} from "../core/dom";
import type {
  ConversationDraft,
  MessageRole,
  PlatformAdapter,
  SiteProfile
} from "../core/types";

function profileElements(profile: SiteProfile, document: Document): Element[] {
  const roots = profile.selectors.conversation
    ? queryComposedAll([profile.selectors.conversation], document)
    : [document.documentElement];
  const candidates = roots.flatMap((root) =>
    profile.selectors.messages.flatMap((selector) => {
      try {
        return Array.from(root.querySelectorAll(selector));
      } catch {
        return [];
      }
    })
  );
  const excluded = profile.selectors.exclude || [];
  return dedupeNested(candidates).filter((element) =>
    !excluded.some((selector) => {
      try {
        return element.matches(selector) || Boolean(element.closest(selector));
      } catch {
        return false;
      }
    })
  );
}

function roleFor(profile: SiteProfile, element: Element, index: number): MessageRole {
  const roles = profile.roles;
  if (roles.strategy === "attribute" && roles.attribute) {
    const value = (element.getAttribute(roles.attribute) || "").toLowerCase();
    if (roles.userValues?.some((candidate) => value.includes(candidate.toLowerCase()))) return "user";
    if (roles.assistantValues?.some((candidate) => value.includes(candidate.toLowerCase()))) {
      return "assistant";
    }
  }
  if (roles.strategy === "selectors") {
    const matches = (selector: string) => {
      try {
        return element.matches(selector) || Boolean(element.querySelector(selector));
      } catch {
        return false;
      }
    };
    if (roles.assistantSelectors?.some(matches)) return "assistant";
    if (roles.userSelectors?.some(matches)) return "user";
  }
  const inferred = roleFromElement(element);
  if (inferred !== "unknown") return inferred;
  const startsUser = roles.startsWith !== "assistant";
  return (index % 2 === 0) === startsUser ? "user" : "assistant";
}

export function createProfileAdapter(profile: SiteProfile): PlatformAdapter {
  return {
    id: `profile:${profile.id}`,
    displayName: profile.name,
    adapterVersion: profile.schemaVersion,
    hostPatterns: profile.origins,
    matches: (url) =>
      profile.origins.includes(url.origin) &&
      profile.pathPatterns.some((path) =>
        path === "/*" || url.pathname.startsWith(path.replace(/\*.*$/, ""))),
    detect(document) {
      const count = profileElements(profile, document).length;
      const health = count >= 2 ? profile.confidence : Math.min(0.4, profile.confidence / 2);
      return { confidence: health, reason: `${count} profile-matched messages` };
    },
    async extract(document): Promise<ConversationDraft> {
      const elements = profileElements(profile, document);
      const title = profile.selectors.title
        ? queryComposedAll([profile.selectors.title], document)[0]?.textContent?.trim()
        : undefined;
      const warnings: string[] = [];
      if (elements.length < 2) warnings.push("This site profile may be outdated. Recalibration is recommended.");
      if (possibleVirtualization(document)) {
        warnings.push("This page may virtualize older messages; scroll through the thread before capture.");
      }
      return {
        title: title || document.title || `${profile.name} conversation`,
        messages: elements.map((element, index) => {
          let content = element;
          if (profile.selectors.content) {
            try {
              content = element.querySelector(profile.selectors.content) || element;
            } catch {
              content = element;
            }
          }
          return messageFromElement(content, roleFor(profile, element, index));
        }),
        completeness: warnings.length ? "possibly-truncated" : "complete",
        warnings
      };
    }
  };
}
