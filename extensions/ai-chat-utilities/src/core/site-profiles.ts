import type { SiteProfile } from "./types";

const STORAGE_KEY = "siteProfilesV1";
const MAX_PROFILES = 100;
const MAX_SELECTOR_LENGTH = 500;

const now = () => new Date().toISOString();

function wildcardMatch(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function validSelector(selector: unknown): selector is string {
  if (typeof selector !== "string" || !selector.trim() || selector.length > MAX_SELECTOR_LENGTH) {
    return false;
  }
  if (/[{};]/.test(selector)) return false;
  if ((selector.match(/\[/g) || []).length !== (selector.match(/\]/g) || []).length) return false;
  if (typeof document === "undefined") return true;
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

export function profileMatches(profile: SiteProfile, url: URL): boolean {
  return profile.origins.includes(url.origin) &&
    profile.pathPatterns.some((pattern) => wildcardMatch(url.pathname, pattern));
}

export function validateSiteProfile(value: unknown, source: SiteProfile["source"] = "local"): SiteProfile {
  if (!value || typeof value !== "object") throw new Error("Profile must be an object.");
  const input = value as Partial<SiteProfile>;
  if (input.schemaVersion !== 1) throw new Error("Unsupported profile schema.");
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(input.id || "")) throw new Error("Invalid profile ID.");
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 80) {
    throw new Error("Invalid profile name.");
  }
  const origins = Array.isArray(input.origins)
    ? input.origins.filter((origin): origin is string => {
      if (typeof origin !== "string") return false;
      try {
        const url = new URL(origin);
        return ["http:", "https:"].includes(url.protocol) && url.origin === origin;
      } catch {
        return false;
      }
    })
    : [];
  if (!origins.length || origins.length > 10) throw new Error("Profile needs valid HTTP origins.");
  const paths = Array.isArray(input.pathPatterns)
    ? input.pathPatterns.filter((path): path is string =>
      typeof path === "string" && path.startsWith("/") && path.length <= 200)
    : [];
  if (!paths.length) throw new Error("Profile needs a path pattern.");
  const selectors = input.selectors;
  if (!selectors || !Array.isArray(selectors.messages) || !selectors.messages.length ||
      !selectors.messages.every(validSelector)) {
    throw new Error("Profile needs valid message selectors.");
  }
  for (const selector of [selectors.conversation, selectors.content, selectors.title]) {
    if (selector !== undefined && !validSelector(selector)) throw new Error("Invalid selector.");
  }
  if (selectors.exclude && !selectors.exclude.every(validSelector)) {
    throw new Error("Invalid exclusion selector.");
  }
  const roles = input.roles;
  if (!roles || !["attribute", "selectors", "alternating"].includes(roles.strategy)) {
    throw new Error("Invalid role strategy.");
  }
  if (roles.strategy === "attribute" && (!roles.attribute || roles.attribute.length > 100)) {
    throw new Error("Attribute role profiles require an attribute.");
  }
  if (roles.strategy === "selectors") {
    if (!Array.isArray(roles.userSelectors) || !Array.isArray(roles.assistantSelectors) ||
        !roles.userSelectors.length || !roles.assistantSelectors.length ||
        ![...roles.userSelectors, ...roles.assistantSelectors].every(validSelector)) {
      throw new Error("Invalid role selector.");
    }
  }
  for (const values of [roles.userValues, roles.assistantValues]) {
    if (values !== undefined &&
        (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.length > 80))) {
      throw new Error("Invalid role values.");
    }
  }
  return {
    schemaVersion: 1,
    id: input.id!,
    name: input.name!.trim(),
    source,
    origins,
    pathPatterns: paths,
    selectors: {
      conversation: selectors.conversation,
      messages: [...selectors.messages],
      content: selectors.content,
      title: selectors.title,
      exclude: selectors.exclude ? [...selectors.exclude] : undefined
    },
    roles: {
      strategy: roles.strategy,
      attribute: roles.attribute,
      userValues: roles.userValues ? [...roles.userValues] : undefined,
      assistantValues: roles.assistantValues ? [...roles.assistantValues] : undefined,
      userSelectors: roles.userSelectors ? [...roles.userSelectors] : undefined,
      assistantSelectors: roles.assistantSelectors ? [...roles.assistantSelectors] : undefined,
      startsWith: roles.startsWith
    },
    confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0.7)),
    createdAt: input.createdAt || now(),
    updatedAt: input.updatedAt || now(),
    needsRepair: Boolean(input.needsRepair)
  };
}

export async function listLocalProfiles(): Promise<SiteProfile[]> {
  const result = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  const values = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  return values.flatMap((value: unknown) => {
    try {
      return [validateSiteProfile(value)];
    } catch {
      return [];
    }
  });
}

export async function saveLocalProfile(profile: SiteProfile): Promise<void> {
  const valid = validateSiteProfile({ ...profile, updatedAt: now() });
  const profiles = await listLocalProfiles();
  const next = [valid, ...profiles.filter((item) => item.id !== valid.id)].slice(0, MAX_PROFILES);
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

export async function deleteLocalProfile(id: string): Promise<void> {
  const profiles = await listLocalProfiles();
  await chrome.storage.local.set({
    [STORAGE_KEY]: profiles.filter((profile) => profile.id !== id)
  });
}

export async function importLocalProfiles(json: string): Promise<number> {
  if (json.length > 500_000) throw new Error("Profile import is too large.");
  const parsed: unknown = JSON.parse(json);
  const values = Array.isArray(parsed) ? parsed : [parsed];
  if (!values.length || values.length > MAX_PROFILES) throw new Error("Invalid profile count.");
  const imported = values.map((value) => validateSiteProfile(value));
  const current = await listLocalProfiles();
  const ids = new Set(imported.map((profile) => profile.id));
  await chrome.storage.local.set({
    [STORAGE_KEY]: [...imported, ...current.filter((profile) => !ids.has(profile.id))]
      .slice(0, MAX_PROFILES)
  });
  return imported.length;
}

export async function markProfileForRepair(id: string): Promise<void> {
  const profiles = await listLocalProfiles();
  const profile = profiles.find((item) => item.id === id);
  if (profile) await saveLocalProfile({ ...profile, needsRepair: true });
}

export function exportProfiles(profiles: SiteProfile[]): string {
  return JSON.stringify(profiles.map((profile) => ({ ...profile, source: "local" })), null, 2);
}
