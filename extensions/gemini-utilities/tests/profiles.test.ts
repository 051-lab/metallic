// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_PROFILES } from "../src/adapters/bundled-profiles";
import { createProfileAdapter } from "../src/adapters/profile-adapter";
import { semanticExtraction } from "../src/core/dom";
import {
  importLocalProfiles,
  listLocalProfiles,
  profileMatches,
  saveLocalProfile,
  validateSiteProfile
} from "../src/core/site-profiles";
import type { SiteProfile } from "../src/core/types";

const fixtureProfile = (): SiteProfile => ({
  schemaVersion: 1,
  id: "local-example",
  name: "Example AI",
  source: "local",
  origins: ["https://example.com"],
  pathPatterns: ["/chat/*"],
  selectors: {
    conversation: "main",
    messages: ["[data-role]"],
    title: "h1"
  },
  roles: {
    strategy: "attribute",
    attribute: "data-role",
    userValues: ["user"],
    assistantValues: ["assistant"]
  },
  confidence: 0.86,
  createdAt: "2026-06-22T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z"
});

beforeEach(() => {
  document.body.innerHTML = "";
  const state: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (defaults: Record<string, unknown>) => ({ ...defaults, ...state })),
        set: vi.fn(async (values: Record<string, unknown>) => Object.assign(state, values))
      }
    }
  });
});

describe("site profiles", () => {
  it("validates, stores, imports, and matches declarative profiles", async () => {
    const profile = validateSiteProfile(fixtureProfile());
    expect(profileMatches(profile, new URL("https://example.com/chat/123"))).toBe(true);
    expect(profileMatches(profile, new URL("https://example.com/settings"))).toBe(false);
    await saveLocalProfile(profile);
    expect(await listLocalProfiles()).toHaveLength(1);
    expect(await importLocalProfiles(JSON.stringify([{ ...profile, name: "Updated" }]))).toBe(1);
    expect((await listLocalProfiles())[0]?.name).toBe("Updated");
  });

  it("rejects malformed and style-injection selectors", () => {
    expect(() => validateSiteProfile({
      ...fixtureProfile(),
      selectors: { messages: ["article { color: red; }"] }
    })).toThrow("valid message selectors");
  });

  it("extracts a profile-backed conversation with correct roles", async () => {
    document.body.innerHTML = `<main><h1>Thread</h1>
      <article data-role="user">Question</article>
      <article data-role="assistant">Answer</article></main>`;
    const adapter = createProfileAdapter(fixtureProfile());
    const draft = await adapter.extract(document);
    expect(draft.title).toBe("Thread");
    expect(draft.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(draft.messages.map((message) => message.plainText)).toEqual(["Question", "Answer"]);
  });

  it("ships valid profiles for the four initial labs", () => {
    expect(BUNDLED_PROFILES.map((profile) => profile.id)).toEqual([
      "z-ai", "mistral-vibe", "ai2-playground", "deepseek"
    ]);
    BUNDLED_PROFILES.forEach((profile) =>
      expect(validateSiteProfile(profile, "bundled").source).toBe("bundled"));
  });

  it("extracts current Z.ai and Mistral live-DOM shapes", async () => {
    const [zai, mistral] = BUNDLED_PROFILES;
    document.body.innerHTML = `<div>
      <div id="message-user-id" class="flex user-message">Build a wallpaper</div>
      <div id="message-assistant-id" class="flex message-assistant-id">Generated concept</div>
      <div class="messageInputContainer">Composer text</div>
    </div>`;
    const zaiDraft = await createProfileAdapter(zai!).extract(document);
    expect(zaiDraft.messages.map((message) => [message.role, message.plainText])).toEqual([
      ["user", "Build a wallpaper"],
      ["assistant", "Generated concept"]
    ]);

    document.body.innerHTML = `<main>
      <div class="group/message" data-message-author-role="user">Business question</div>
      <div class="group/message" data-message-author-role="assistant">Business answer</div>
    </main>`;
    const mistralDraft = await createProfileAdapter(mistral!).extract(document);
    expect(mistralDraft.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });

  it("extracts the current DeepSeek live-DOM shape", async () => {
    const deepseek = BUNDLED_PROFILES.find((profile) => profile.id === "deepseek")!;
    document.body.innerHTML = `<section>
      <div class="generated-user ds-message"><div>Hello</div></div>
      <div class="ds-message">
        <div class="ds-markdown ds-assistant-message-main-content">
          <p>Hello! How can I help you today?</p>
        </div>
      </div>
    </section>`;
    const draft = await createProfileAdapter(deepseek).extract(document);
    expect(draft.messages.map((message) => [message.role, message.plainText])).toEqual([
      ["user", "Hello"],
      ["assistant", "Hello! How can I help you today?"]
    ]);
  });
});

describe("semantic extraction", () => {
  it("finds role-labelled messages inside open shadow roots", () => {
    const host = document.createElement("section");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<main>
      <article data-message-author-role="user">Question</article>
      <article data-message-author-role="assistant">Answer</article>
    </main>`;
    document.body.append(host);
    const result = semanticExtraction(document);
    expect(result.elements).toHaveLength(2);
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it("excludes navigation and sidebar message-like elements", () => {
    document.body.innerHTML = `<aside><div class="message">Old thread</div></aside><main>
      <article data-role="user">Question</article>
      <article data-role="assistant">Answer</article></main>`;
    const result = semanticExtraction(document);
    expect(result.elements.map((element) => element.textContent?.trim()))
      .toEqual(["Question", "Answer"]);
  });
});
