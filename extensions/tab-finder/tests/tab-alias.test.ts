import {
  aliasForTab,
  createAliasRecord,
  normalizeAlias,
  normalizeAliasMap,
  pruneAliases,
  withAlias,
  withoutAlias
} from "../src/core/tab-alias";

describe("tab alias records", () => {
  it("normalizes whitespace and rejects empty aliases", () => {
    expect(normalizeAlias("  Auralis   architecture  ")).toBe("Auralis architecture");
    expect(() => normalizeAlias("   ")).toThrow("Enter a tab alias");
  });

  it("preserves the original title when an alias is updated", () => {
    const first = createAliasRecord(7, "GitHub · 051-lab/auralis", "Auralis", 100);
    const second = createAliasRecord(7, "Auralis", "Auralis architecture", 200, first);

    expect(second).toEqual({
      tabId: 7,
      alias: "Auralis architecture",
      originalTitle: "GitHub · 051-lab/auralis",
      createdAt: 100,
      updatedAt: 200
    });
  });

  it("adds, reads, removes, and prunes tab-scoped aliases", () => {
    const one = createAliasRecord(1, "One", "First", 10);
    const two = createAliasRecord(2, "Two", "Second", 20);
    let aliases = withAlias({}, one);
    aliases = withAlias(aliases, two);

    expect(aliasForTab(aliases, 2)?.alias).toBe("Second");
    expect(Object.keys(pruneAliases(aliases, [2]))).toEqual(["2"]);
    expect(aliasForTab(withoutAlias(aliases, 1), 1)).toBeUndefined();
  });

  it("repairs valid stored records and ignores malformed values", () => {
    const normalized = normalizeAliasMap({
      "4": {
        tabId: 4,
        alias: "  Project   dashboard ",
        originalTitle: "Dashboard",
        createdAt: 1,
        updatedAt: 2
      },
      bad: { tabId: "nope", alias: "Broken" }
    });

    expect(normalized).toEqual({
      "4": {
        tabId: 4,
        alias: "Project dashboard",
        originalTitle: "Dashboard",
        createdAt: 1,
        updatedAt: 2
      }
    });
  });
});
