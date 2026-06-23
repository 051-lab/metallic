import type { SiteProfile } from "../core/types";

const timestamp = "2026-06-22T00:00:00.000Z";
const commonMessages = [
  "[data-message-author-role]",
  "[data-role='user']",
  "[data-role='assistant']",
  "[data-testid*='message']",
  "article",
  "[class*='message']",
  "[class*='Message']",
  "[class*='turn']"
];

const profile = (
  id: string,
  name: string,
  origin: string,
  messages: string[] = commonMessages,
  overrides: Partial<Pick<SiteProfile, "selectors" | "roles" | "confidence">> = {}
): SiteProfile => ({
  schemaVersion: 1,
  id,
  name,
  source: "bundled",
  origins: [origin],
  pathPatterns: ["/*"],
  selectors: overrides.selectors || {
    conversation: "main",
    messages,
    exclude: ["nav", "aside", "[role='navigation']", "[aria-hidden='true']"]
  },
  roles: overrides.roles || {
    strategy: "attribute",
    attribute: "data-message-author-role",
    userValues: ["user", "human"],
    assistantValues: ["assistant", "model", "bot"]
  },
  confidence: overrides.confidence || 0.78,
  createdAt: timestamp,
  updatedAt: timestamp
});

export const BUNDLED_PROFILES: SiteProfile[] = [
  profile("z-ai", "Z.ai", "https://chat.z.ai", [
    "[id^='message-']:not([id$='-start'])"
  ], {
    selectors: {
      messages: ["[id^='message-']:not([id$='-start'])"],
      exclude: ["nav", "aside", "[role='navigation']", "[aria-hidden='true']"]
    },
    roles: {
      strategy: "selectors",
      userSelectors: [".user-message"],
      assistantSelectors: ["[id^='message-']:not(.user-message):not([id$='-start'])"],
      startsWith: "user"
    },
    confidence: 0.95
  }),
  profile("mistral-vibe", "Mistral Vibe", "https://chat.mistral.ai"),
  profile("ai2-playground", "Ai2 Playground", "https://playground.allenai.org"),
  profile("deepseek", "DeepSeek Chat", "https://chat.deepseek.com")
];
