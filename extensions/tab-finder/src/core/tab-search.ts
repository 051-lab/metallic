export interface TabCandidate {
  id: number;
  windowId: number;
  index: number;
  title: string;
  alias?: string;
  aliasApplied?: boolean;
  url: string;
  domain: string;
  favIconUrl?: string;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  discarded: boolean;
  lastAccessed?: number;
}

export interface TabSearchResult {
  tab: TabCandidate;
  score: number;
}

function normalize(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/\s+/g, " ").trim();
}

export function domainForUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "chrome:" || url.protocol === "chrome-extension:") {
      return url.protocol.slice(0, -1);
    }
    return url.hostname.replace(/^www\./, "") || url.protocol.slice(0, -1) || "Other";
  } catch {
    return "Other";
  }
}

function subsequenceScore(value: string, token: string): number {
  let tokenIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (let index = 0; index < value.length && tokenIndex < token.length; index += 1) {
    if (value[index] === token[tokenIndex]) {
      if (firstMatch === -1) firstMatch = index;
      lastMatch = index;
      tokenIndex += 1;
    }
  }

  if (tokenIndex !== token.length || firstMatch === -1) return 0;
  const span = Math.max(token.length, lastMatch - firstMatch + 1);
  return Math.max(4, 24 - (span - token.length) - Math.min(firstMatch, 10));
}

function scoreField(rawValue: string, token: string, weight: number): number {
  const value = normalize(rawValue);
  if (!value) return 0;
  if (value === token) return 100 + weight;
  if (value.startsWith(token)) return 75 + weight;

  const position = value.indexOf(token);
  if (position >= 0) return Math.max(35, 62 - Math.min(position, 27)) + weight;

  const fuzzy = subsequenceScore(value, token);
  return fuzzy ? fuzzy + Math.floor(weight / 3) : 0;
}

export function recencyBoost(lastAccessed: number | undefined, now = Date.now()): number {
  if (!lastAccessed || !Number.isFinite(lastAccessed)) return 0;
  const age = Math.max(0, now - lastAccessed);
  if (age <= 5 * 60_000) return 24;
  if (age <= 60 * 60_000) return 18;
  if (age <= 24 * 60 * 60_000) return 12;
  if (age <= 7 * 24 * 60 * 60_000) return 6;
  return 0;
}

export function scoreTab(tab: TabCandidate, query: string, now = Date.now()): number {
  const tokens = normalize(query).split(" ").filter(Boolean);
  const recent = recencyBoost(tab.lastAccessed, now);

  if (!tokens.length) {
    return (tab.active ? 40 : 0) + (tab.pinned ? 4 : 0) + (tab.alias ? 3 : 0) + recent;
  }

  let score = 0;
  for (const token of tokens) {
    const tokenScore = Math.max(
      scoreField(tab.alias || "", token, 42),
      scoreField(tab.title, token, 18),
      scoreField(tab.domain, token, 24),
      scoreField(tab.url, token, 4)
    );
    if (!tokenScore) return Number.NEGATIVE_INFINITY;
    score += tokenScore;
  }

  if (tab.active) score += 5;
  if (tab.pinned) score += 2;
  if (tab.alias) score += 4;
  score += Math.min(6, Math.floor(recent / 4));
  return score;
}

export function searchTabs(tabs: TabCandidate[], query: string, now = Date.now()): TabSearchResult[] {
  const normalizedQuery = normalize(query);
  return tabs
    .map((tab) => ({ tab, score: scoreTab(tab, normalizedQuery, now) }))
    .filter((result) => Number.isFinite(result.score))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.tab.windowId !== right.tab.windowId) return left.tab.windowId - right.tab.windowId;
      return left.tab.index - right.tab.index;
    });
}

export function normalizedUrlForDuplicate(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function duplicateCounts(tabs: TabCandidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tab of tabs) {
    const key = normalizedUrlForDuplicate(tab.url);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
