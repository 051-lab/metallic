import { describe, expect, it, vi } from "vitest";
import {
  desiredPlatformScripts,
  reconcilePlatformScripts,
  type ScriptingRegistrationApi
} from "../src/core/permissions";

describe("optional platform permissions", () => {
  it("registers only enabled platforms with granted origins", () => {
    const scripts = desiredPlatformScripts(
      ["gemini", "chatgpt", "claude", "google-ai-mode"],
      [
        "https://gemini.google.com/*",
        "https://claude.ai/*",
        "https://www.google.com/*",
        "https://google.com/*"
      ]
    );
    expect(scripts.map((script) => script.id)).toEqual([
      "ai-chat-gemini",
      "ai-chat-claude",
      "ai-chat-google-ai-mode"
    ]);
  });

  it("removes managed registrations without touching unrelated scripts", async () => {
    const api: ScriptingRegistrationApi = {
      getRegisteredContentScripts: vi.fn(async () => [
        { id: "ai-chat-gemini", matches: ["https://gemini.google.com/*"] },
        { id: "other-extension-script", matches: ["https://example.com/*"] }
      ]),
      unregisterContentScripts: vi.fn(async () => undefined),
      registerContentScripts: vi.fn(async () => undefined)
    };

    await reconcilePlatformScripts(
      api,
      ["chatgpt"],
      ["https://chatgpt.com/*"]
    );

    expect(api.unregisterContentScripts).toHaveBeenCalledWith({ ids: ["ai-chat-gemini"] });
    expect(api.registerContentScripts).toHaveBeenCalledWith([
      expect.objectContaining({ id: "ai-chat-chatgpt" })
    ]);
  });

  it("registers exact-origin persistent scripts only when permission is granted", () => {
    const scripts = desiredPlatformScripts(
      [],
      ["https://chat.deepseek.com/*"],
      ["https://chat.deepseek.com", "https://ungranted.example"]
    );
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.matches).toEqual(["https://chat.deepseek.com/*"]);
    expect(scripts[0]?.id).toContain("ai-chat-site-");
  });
});
