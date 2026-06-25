import { chatgptAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { genericAdapter } from "./generic";
import { googleAiModeAdapter } from "./google-ai-mode";
import { BUNDLED_PROFILES } from "./bundled-profiles";
import { createProfileAdapter } from "./profile-adapter";
import { listLocalProfiles, profileMatches } from "../core/site-profiles";
import { qwenAdapter } from "./qwen";
import type { PlatformAdapter } from "../core/types";

export const adapters: PlatformAdapter[] = [
  geminiAdapter,
  chatgptAdapter,
  claudeAdapter,
  qwenAdapter,
  googleAiModeAdapter
];

export function adapterForUrl(value: string): PlatformAdapter {
  try {
    const url = new URL(value);
    return adapters.find((adapter) => adapter.matches(url)) || genericAdapter;
  } catch {
    return genericAdapter;
  }
}

export async function resolveAdapter(value: string): Promise<PlatformAdapter> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return genericAdapter;
  }
  const dedicated = adapters.find((adapter) => adapter.matches(url));
  if (dedicated) return dedicated;
  const local = (await listLocalProfiles()).find((profile) =>
    !profile.needsRepair && profileMatches(profile, url)
  );
  if (local) return createProfileAdapter(local);
  const bundled = BUNDLED_PROFILES.find((profile) => profileMatches(profile, url));
  return bundled ? createProfileAdapter(bundled) : genericAdapter;
}
