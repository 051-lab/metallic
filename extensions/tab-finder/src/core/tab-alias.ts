export const TAB_ALIAS_STORAGE_KEY = "tabAliasesV1";
export const TAB_ALIAS_MAX_LENGTH = 80;

export interface TabAliasRecord {
  tabId: number;
  alias: string;
  originalTitle: string;
  createdAt: number;
  updatedAt: number;
}

export type TabAliasMap = Record<string, TabAliasRecord>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeAlias(value: string): string {
  const alias = value.replace(/\s+/g, " ").trim();
  if (!alias) throw new Error("Enter a tab alias.");
  if (alias.length > TAB_ALIAS_MAX_LENGTH) {
    throw new Error(`Tab aliases can be at most ${TAB_ALIAS_MAX_LENGTH} characters.`);
  }
  return alias;
}

export function normalizeAliasMap(value: unknown): TabAliasMap {
  if (!isRecord(value)) return {};

  const normalized: TabAliasMap = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!isRecord(candidate)) continue;
    const tabId = Number(candidate.tabId ?? key);
    const alias = typeof candidate.alias === "string" ? candidate.alias.replace(/\s+/g, " ").trim() : "";
    const originalTitle = typeof candidate.originalTitle === "string" ? candidate.originalTitle.trim() : "";
    const createdAt = typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
      ? candidate.createdAt
      : Date.now();
    const updatedAt = typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : createdAt;

    if (!Number.isInteger(tabId) || tabId < 0 || !alias || alias.length > TAB_ALIAS_MAX_LENGTH) continue;
    normalized[String(tabId)] = {
      tabId,
      alias,
      originalTitle: originalTitle || alias,
      createdAt,
      updatedAt
    };
  }
  return normalized;
}

export function aliasForTab(aliases: TabAliasMap, tabId: number): TabAliasRecord | undefined {
  return aliases[String(tabId)];
}

export function createAliasRecord(
  tabId: number,
  nativeTitle: string,
  aliasInput: string,
  now = Date.now(),
  existing?: TabAliasRecord
): TabAliasRecord {
  const alias = normalizeAlias(aliasInput);
  return {
    tabId,
    alias,
    originalTitle: existing?.originalTitle || nativeTitle.trim() || alias,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

export function withAlias(aliases: TabAliasMap, record: TabAliasRecord): TabAliasMap {
  return { ...aliases, [String(record.tabId)]: record };
}

export function withoutAlias(aliases: TabAliasMap, tabId: number): TabAliasMap {
  const next = { ...aliases };
  delete next[String(tabId)];
  return next;
}

export function pruneAliases(aliases: TabAliasMap, openTabIds: Iterable<number>): TabAliasMap {
  const open = new Set(openTabIds);
  return Object.fromEntries(
    Object.entries(aliases).filter(([, record]) => open.has(record.tabId))
  );
}

export function aliasMapsEqual(left: TabAliasMap, right: TabAliasMap): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const a = left[key];
    const b = right[key];
    if (!a || !b) return false;
    return a.tabId === b.tabId
      && a.alias === b.alias
      && a.originalTitle === b.originalTitle
      && a.createdAt === b.createdAt
      && a.updatedAt === b.updatedAt;
  });
}
