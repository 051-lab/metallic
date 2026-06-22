import type { PlatformDefinition, PlatformId } from "./types";

export const PLATFORMS: PlatformDefinition[] = [
  {
    id: "gemini",
    name: "Gemini",
    origins: ["https://gemini.google.com/*"],
    matches: ["https://gemini.google.com/*"]
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    origins: ["https://chatgpt.com/*"],
    matches: ["https://chatgpt.com/*"]
  },
  {
    id: "claude",
    name: "Claude",
    origins: ["https://claude.ai/*"],
    matches: ["https://claude.ai/*"]
  },
  {
    id: "qwen",
    name: "Qwen",
    origins: ["https://chat.qwen.ai/*"],
    matches: ["https://chat.qwen.ai/*"]
  }
];

export const platformById = (id: PlatformId) =>
  PLATFORMS.find((platform) => platform.id === id);

export function platformForUrl(value: string): PlatformDefinition | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  return PLATFORMS.find((platform) =>
    platform.origins.some((origin) => url.href.startsWith(origin.replace("*", "")))
  );
}
