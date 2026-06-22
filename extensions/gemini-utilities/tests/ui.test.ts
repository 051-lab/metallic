// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountLauncher } from "../src/ui/launcher";
import { startGuidedPicker } from "../src/ui/picker";
import { startCalibration } from "../src/ui/calibration";

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.querySelectorAll(
    "[data-ai-chat-launcher], [data-ai-chat-selected]"
  ).forEach((element) => element.remove());
});

describe("floating launcher", () => {
  it("prevents duplicates and supports left positioning", () => {
    const click = vi.fn();
    mountLauncher(click);
    mountLauncher(click, "bottom-left");
    const hosts = document.querySelectorAll("[data-ai-chat-launcher]");
    expect(hosts).toHaveLength(1);
    const shadow = hosts[0]?.shadowRoot;
    expect(shadow?.textContent).toContain("button{right:auto;left:20px}");
    (shadow?.querySelector("button") as HTMLButtonElement).click();
    expect(click).toHaveBeenCalledOnce();
  });
});

describe("guided message picker", () => {
  it("selects messages, alternates roles, and restores inline styles", async () => {
    document.body.innerHTML = `
      <main>
        <article style="color:red">Question</article>
        <article>Answer</article>
      </main>`;
    const candidates = Array.from(document.querySelectorAll("article"));
    const result = startGuidedPicker(candidates);
    candidates[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    candidates[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const host = Array.from(document.documentElement.children)
      .find((element) => element.shadowRoot?.querySelector("[data-done]"));
    (host?.shadowRoot?.querySelector("[data-done]") as HTMLButtonElement).click();

    await expect(result).resolves.toBe(true);
    expect(candidates[0]?.getAttribute("data-ai-chat-role")).toBe("user");
    expect(candidates[1]?.getAttribute("data-ai-chat-role")).toBe("assistant");
    expect(candidates[0]?.getAttribute("style")).toBe("color:red");
  });

  it("cleans attributes when cancelled", async () => {
    document.body.innerHTML = `<main><article>Question</article></main>`;
    const candidate = document.querySelector("article")!;
    const result = startGuidedPicker([candidate]);
    candidate.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const host = Array.from(document.documentElement.children)
      .find((element) => element.shadowRoot?.querySelector("[data-cancel]"));
    (host?.shadowRoot?.querySelector("[data-cancel]") as HTMLButtonElement).click();
    await expect(result).resolves.toBe(false);
    expect(candidate.hasAttribute("data-ai-chat-selected")).toBe(false);
  });
});

describe("site calibration", () => {
  it("learns user and assistant selectors without storing page content", async () => {
    window.history.replaceState({}, "", "/chat/1");
    document.body.innerHTML = `<main>
      <article data-role="user">Private question</article>
      <article data-role="assistant">Private answer</article>
    </main>`;
    const result = startCalibration();
    const messages = document.querySelectorAll("article");
    messages[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    messages[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const host = document.querySelector("[data-ai-chat-calibration]");
    (host?.shadowRoot?.querySelector("[data-skip]") as HTMLButtonElement).click();
    const profile = await result;
    expect(profile?.selectors.messages).toEqual([
      "[data-role=\"user\"]",
      "[data-role=\"assistant\"]"
    ]);
    expect(JSON.stringify(profile)).not.toContain("Private question");
    expect(JSON.stringify(profile)).not.toContain("Private answer");
  });
});
