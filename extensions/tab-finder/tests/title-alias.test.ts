/** @vitest-environment jsdom */

import {
  hasInstalledTitleAlias,
  installTitleAlias,
  resetTitleAlias
} from "../src/core/title-alias";

async function flushMutations(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("browser-visible title alias controller", () => {
  beforeEach(() => {
    document.title = "Original page title";
    if (hasInstalledTitleAlias()) resetTitleAlias();
  });

  afterEach(() => {
    if (hasInstalledTitleAlias()) resetTitleAlias();
  });

  it("applies and locks an alias", async () => {
    installTitleAlias("Auralis architecture");
    expect(document.title).toBe("Auralis architecture");

    document.title = "Page-generated update";
    await flushMutations();
    expect(document.title).toBe("Auralis architecture");
  });

  it("restores the latest native title when reset", async () => {
    installTitleAlias("Research session");
    document.title = "Unread message (2)";
    await flushMutations();

    expect(resetTitleAlias()).toEqual({ restoredTitle: "Unread message (2)" });
    expect(document.title).toBe("Unread message (2)");
    expect(hasInstalledTitleAlias()).toBe(false);
  });

  it("updates an existing alias without losing the original title", () => {
    expect(installTitleAlias("First alias").originalTitle).toBe("Original page title");
    expect(installTitleAlias("Second alias").originalTitle).toBe("Original page title");
    expect(document.title).toBe("Second alias");
  });
});
