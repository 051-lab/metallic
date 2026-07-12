import { describe, expect, it, vi } from "vitest";
import { initializeBackground, runBackgroundTask } from "../src/core/background-lifecycle";

describe("background lifecycle", () => {
  it("initializes storage even when the Side Panel API is unavailable", async () => {
    const ensureState = vi.fn(async () => undefined);

    await initializeBackground(ensureState, undefined);

    expect(ensureState).toHaveBeenCalledOnce();
  });

  it("configures action-click behavior when the Side Panel API exists", async () => {
    const ensureState = vi.fn(async () => undefined);
    const setPanelBehavior = vi.fn(async () => undefined);

    await initializeBackground(ensureState, { setPanelBehavior });

    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: false });
  });

  it("captures rejected event tasks instead of leaving unhandled promises", async () => {
    const failure = new Error("side panel unavailable");
    const report = vi.fn();

    await runBackgroundTask("startup", async () => {
      throw failure;
    }, report);

    expect(report).toHaveBeenCalledWith("startup", failure);
  });
});
