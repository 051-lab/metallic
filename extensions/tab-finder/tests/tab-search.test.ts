import {
  domainForUrl,
  duplicateCounts,
  normalizedUrlForDuplicate,
  scoreTab,
  searchTabs,
  type TabCandidate
} from "../src/core/tab-search";

const tabs: TabCandidate[] = [
  {
    id: 1,
    windowId: 10,
    index: 0,
    title: "Metallic repository · GitHub",
    url: "https://github.com/051-lab/metallic",
    domain: "github.com",
    active: true,
    pinned: false,
    audible: false,
    discarded: false
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
    discarded: false
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
    discarded: true
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

describe("tab scoring", () => {
  it("ranks exact domain matches strongly", () => {
    expect(scoreTab(tabs[0]!, "github.com")).toBeGreaterThan(scoreTab(tabs[0]!, "metal"));
  });

  it("supports fuzzy subsequence matching", () => {
    expect(scoreTab(tabs[1]!, "chrm ext")).toBeGreaterThan(0);
  });

  it("requires every query token to match", () => {
    expect(scoreTab(tabs[1]!, "chrome impossible-token")).toBe(Number.NEGATIVE_INFINITY);
  });

  it("returns ranked matches and preserves browser order for an empty query", () => {
    expect(searchTabs(tabs, "metallic").map((result) => result.tab.id)).toEqual([1, 3]);
    expect(searchTabs(tabs, "").map((result) => result.tab.id)).toEqual([1, 2, 3]);
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
