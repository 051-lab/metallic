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
  messages: string[] = commonMessages
): SiteProfile => ({
  schemaVersion: 1,
  id,
  name,
  source: "bundled",
  origins: [origin],
  pathPatterns: ["/*"],
  selectors: {
    conversation: "main",
    messages,
    exclude: ["nav", "aside", "[role='navigation']", "[aria-hidden='true']"]
  },
  roles: {
    strategy: "attribute",
    attribute: "data-message-author-role",
    userValues: ["user", "human"],
    assistantValues: ["assistant", "model", "bot"]
  },
  confidence: 0.78,
  createdAt: timestamp,
  updatedAt: timestamp
});

export const BUNDLED_PROFILES: SiteProfile[] = [
  profile("z-ai", "Z.ai", "https://chat.z.ai"),
  profile("mistral-vibe", "Mistral Vibe", "https://chat.mistral.ai"),
  profile("ai2-playground", "Ai2 Playground", "https://playground.allenai.org"),
  profile("deepseek", "DeepSeek Chat", "https://chat.deepseek.com")
];
