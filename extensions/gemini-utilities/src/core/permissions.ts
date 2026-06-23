import { PLATFORMS } from "./platforms";

export interface ScriptingRegistrationApi {
  getRegisteredContentScripts(): Promise<chrome.scripting.RegisteredContentScript[]>;
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
  registerContentScripts(scripts: chrome.scripting.RegisteredContentScript[]): Promise<void>;
}

export function desiredPlatformScripts(
  enabledPlatforms: string[],
  grantedOrigins: string[],
  persistentOrigins: string[] = []
): chrome.scripting.RegisteredContentScript[] {
  const origins = new Set(grantedOrigins);
  const platformScripts: chrome.scripting.RegisteredContentScript[] = PLATFORMS
    .filter((platform) =>
      enabledPlatforms.includes(platform.id) &&
      platform.origins.every((origin) => origins.has(origin))
    )
    .map((platform) => ({
      id: `ai-chat-${platform.id}`,
      matches: platform.matches,
      js: ["dist/content.js"],
      runAt: "document_idle" as const,
      persistAcrossSessions: true
    }));
  const siteScripts = persistentOrigins
    .filter((origin) => origins.has(`${origin}/*`))
    .map((origin) => ({
      id: `ai-chat-site-${origin.replace(/[^a-z0-9]/gi, "-").slice(0, 80)}`,
      matches: [`${origin}/*`],
      js: ["dist/content.js"],
      runAt: "document_idle" as const,
      persistAcrossSessions: true
    }));
  return [...platformScripts, ...siteScripts];
}

export async function reconcilePlatformScripts(
  api: ScriptingRegistrationApi,
  enabledPlatforms: string[],
  grantedOrigins: string[],
  persistentOrigins: string[] = []
): Promise<void> {
  const desired = desiredPlatformScripts(enabledPlatforms, grantedOrigins, persistentOrigins);
  const existing = await api.getRegisteredContentScripts();
  const managedIds = existing
    .filter((script) => script.id.startsWith("ai-chat-"))
    .map((script) => script.id);

  if (managedIds.length) {
    await api.unregisterContentScripts({ ids: managedIds });
  }
  if (desired.length) {
    await api.registerContentScripts(desired);
  }
}
