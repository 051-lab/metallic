import {
  domainForUrl,
  duplicateCounts,
  normalizedUrlForDuplicate,
  recencyBoost,
  scoreTab,
  searchTabs,
  type TabCandidate
} from "../src/core/tab-search";

const NOW = Date.UTC(2026, 6, 10, 22, 0, 0);

const tabs: TabCandidate[] = [
  {
    id: 1,
    windowId: 10,
    index: 0,
    title: "Metallic repository · GitHub",
    alias: "Extension command center",
    aliasApplied: true,
    url: "https://github.com/051-lab/metallic",
    domain: "github.com",
    active: true,
    pinned: false,
    audible: false,
    discarded: false,
    lastAccessed: NOW - 2 * 60_000
  },
  {
    id: 2,
    windowId: 10,
    index: 1,
    title: "Chrome Extensions documentation",
    url: "https://developer.chrome.com/docs/extensions/",
    domain: "developer.chrome.com",
    active: false,
    pinned: true,
    audible: false,
    discarded: false,
    lastAccessed: NOW - 30 * 60_000
  },
  {
    id: 3,
    windowId: 11,
    index: 0,
    title: "Metallic repository duplicate",
    url: "https://github.com/051-lab/metallic#readme",
    domain: "github.com",
    active: false,
    pinned: false,
    audible: false,
    discarded: true,
    lastAccessed: NOW - 3 * 24 * 60 * 60_000
  }
];

describe("domainForUrl", () => {
  it("normalizes ordinary hostnames", () => {
    expect(domainForUrl("https://www.example.com/path")).toBe("example.com");
  });

  it("handles Chrome pages and malformed values", () => {
    expect(domainForUrl("chrome://extensions")).toBe("chrome");
    expect(domainForUrl("not a url")).toBe("Other");
  });
});

describe("recencyBoost", () => {
  it("uses bounded activity buckets", () => {
    expect(recencyBoost(NOW - 60_000, NOW)).toBe(24);
    expect(recencyBoost(NOW - 30 * 60_000, NOW)).toBe(18);
    expect(recencyBoost(NOW - 12 * 60 * 60_000, NOW)).toBe(12);
    expect(recencyBoost(NOW - 3 * 24 * 60 * 60_000, NOW)).toBe(6);
    expect(recencyBoost(NOW - 10 * 24 * 60 * 60_000, NOW)).toBe(0);
  });
});

describe("tab scoring", () => {
  it("ranks exact alias matches above exact domain matches", () => {
    expect(scoreTab(tabs[0]!, "extension command center", NOW))
      .toBeGreaterThan(scoreTab(tabs[0]!, "github.com", NOW));
  });

  it("keeps native titles searchable after an alias is assigned", () => {
    expect(searchTabs(tabs, "metallic repository", NOW).map((result) => result.tab.id)).toEqual([1, 3]);
  });

  it("supports fuzzy subsequence matching", () => {
    expect(scoreTab(tabs[1]!, "chrm ext", NOW)).toBeGreaterThan(0);
  });

  it("requires every query token to match", () => {
    expect(scoreTab(tabs[1]!, "chrome impossible-token", NOW)).toBe(Number.NEGATIVE_INFINITY);
  });

  it("uses recent activity for an empty query", () => {
    const recent = { ...tabs[1]!, id: 4, pinned: false, lastAccessed: NOW - 1_000 };
    const old = { ...tabs[1]!, id: 5, pinned: false, lastAccessed: NOW - 8 * 24 * 60 * 60_000 };
    expect(searchTabs([old, recent], "", NOW).map((result) => result.tab.id)).toEqual([4, 5]);
  });
});

describe("duplicate detection", () => {
  it("ignores fragments and trailing slashes", () => {
    expect(normalizedUrlForDuplicate("https://example.com/path/#section")).toBe("https://example.com/path");
  });

  it("counts equivalent tab URLs", () => {
    const counts = duplicateCounts(tabs);
    expect(counts.get("https://github.com/051-lab/metallic")).toBe(2);
  });
});
