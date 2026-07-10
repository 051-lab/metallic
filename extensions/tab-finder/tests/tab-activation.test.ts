import { activateThenFocus } from "../src/core/tab-activation";

describe("tab activation", () => {
  it("activates the tab before focusing its browser window", async () => {
    const calls: string[] = [];

    await activateThenFocus(
      {
        activateTab: async (tabId) => { calls.push(`tab:${tabId}`); },
        focusWindow: async (windowId) => { calls.push(`window:${windowId}`); }
      },
      { id: 42, windowId: 7 }
    );

    expect(calls).toEqual(["tab:42", "window:7"]);
  });

  it("does not focus the window when tab activation fails", async () => {
    const calls: string[] = [];

    await expect(activateThenFocus(
      {
        activateTab: async () => { throw new Error("activation failed"); },
        focusWindow: async (windowId) => { calls.push(`window:${windowId}`); }
      },
      { id: 42, windowId: 7 }
    )).rejects.toThrow("activation failed");

    expect(calls).toEqual([]);
  });
});
