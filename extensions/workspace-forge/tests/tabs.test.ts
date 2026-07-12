import { matchingOpenTabIds, savedTabFromChrome, savedTabsFromChrome } from "../src/core/tabs";

const idFactory = (prefix: string) => `${prefix}-id`;

describe("Chrome tab normalization", () => {
  it("ignores tabs without a URL", () => {
    expect(savedTabFromChrome({ id: 1, index: 0, pinned: false, highlighted: false, active: false, incognito: false, selected: false, discarded: false, frozen: false, autoDiscardable: true, groupId: -1, windowId: 1 }, 100, idFactory)).toBeNull();
  });

  it("captures title, pinned state, and URL", () => {
    const saved = savedTabFromChrome({
      id: 1,
      index: 0,
      pinned: true,
      highlighted: false,
      active: true,
      incognito: false,
      selected: true,
      discarded: false,
      frozen: false,
      autoDiscardable: true,
      groupId: -1,
      windowId: 1,
      url: "https://example.com/",
      title: "Example"
    }, 100, idFactory);

    expect(saved).toMatchObject({
      id: "tab-id",
      title: "Example",
      pinned: true,
      savedAt: 100
    });
  });

  it("normalizes a window's tabs", () => {
    const tabs = savedTabsFromChrome([
      { id: 1, index: 0, pinned: false, highlighted: false, active: true, incognito: false, selected: true, discarded: false, frozen: false, autoDiscardable: true, groupId: -1, windowId: 1, url: "https://one.example" },
      { id: 2, index: 1, pinned: false, highlighted: false, active: false, incognito: false, selected: false, discarded: false, frozen: false, autoDiscardable: true, groupId: -1, windowId: 1 }
    ], 100, idFactory);
    expect(tabs).toHaveLength(1);
  });

  it("finds open tabs matching saved URLs while ignoring fragments", () => {
    const ids = matchingOpenTabIds([
      { id: "saved", url: "https://example.com/page", title: "Page", favIconUrl: "", pinned: false, group: "General", savedAt: 1 }
    ], [
      { id: 10, index: 0, pinned: false, highlighted: false, active: false, incognito: false, selected: false, discarded: false, frozen: false, autoDiscardable: true, groupId: -1, windowId: 1, url: "https://example.com/page#section" },
      { id: 11, index: 1, pinned: false, highlighted: false, active: false, incognito: false, selected: false, discarded: false, frozen: false, autoDiscardable: true, groupId: -1, windowId: 1, url: "https://other.example" }
    ]);
    expect(ids).toEqual([10]);
  });
});
