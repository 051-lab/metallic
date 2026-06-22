import type { SiteProfile } from "../core/types";

const STYLE = `
  :host{all:initial}.bar{position:fixed;left:50%;bottom:24px;z-index:2147483647;width:min(680px,calc(100% - 32px));
  transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #3c4657;
  border-radius:14px;background:#111318;color:#eef2f8;box-shadow:0 20px 60px #000b;font:13px/1.4 system-ui,sans-serif}
  .copy{min-width:0;flex:1}.step{color:#8ab4f8;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
  strong{display:block;margin-top:2px}button{border:1px solid #3c4657;border-radius:9px;padding:8px 11px;color:#d9e5f8;
  background:#1b1f27;cursor:pointer}button.primary{color:#101319;background:#8ab4f8;border-color:#8ab4f8;font-weight:700}
`;

function escape(value: string): string {
  return globalThis.CSS?.escape
    ? globalThis.CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}

function stableSelector(element: Element): string {
  const attributes = ["data-testid", "data-message-id", "data-turn-id", "data-role",
    "data-message-author-role", "aria-label"];
  for (const attribute of attributes) {
    const value = element.getAttribute(attribute);
    if (value && value.length <= 100) return `[${attribute}="${escape(value)}"]`;
  }
  const stableClass = Array.from(element.classList).find((name) =>
    name.length >= 3 && name.length <= 40 && !/\d{3,}|__[a-z0-9]{5,}/i.test(name)
  );
  if (stableClass) return `${element.tagName.toLowerCase()}.${escape(stableClass)}`;
  const parent = element.parentElement;
  if (!parent) return element.tagName.toLowerCase();
  const siblings = Array.from(parent.children).filter((item) => item.tagName === element.tagName);
  return `${stableSelector(parent)} > ${element.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(element) + 1})`;
}

function commonContainer(first: Element, second: Element): Element {
  const parents = new Set<Element>();
  let current: Element | null = first;
  while (current) {
    parents.add(current);
    current = current.parentElement;
  }
  current = second;
  while (current && !parents.has(current)) current = current.parentElement;
  return current?.closest("main, [role='main']") || current || document.body;
}

function profileId(): string {
  const host = location.hostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `local-${host}`.slice(0, 64);
}

export function startCalibration(): Promise<SiteProfile | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.dataset.aiChatCalibration = "";
    const shadow = host.attachShadow({ mode: "open" });
    let phase: "user" | "assistant" | "title" = "user";
    let user: Element | null = null;
    let assistant: Element | null = null;
    let title: Element | null = null;
    const highlighted = new Map<Element, string | null>();

    const copy = () => phase === "user"
      ? ["1 of 3", "Click one message written by you."]
      : phase === "assistant"
        ? ["2 of 3", "Click one response written by the assistant."]
        : ["3 of 3", "Click the conversation title, or skip this step."];

    const render = () => {
      const [step, instruction] = copy();
      shadow.innerHTML = `<style>${STYLE}</style><div class="bar">
        <div class="copy"><span class="step">Calibration · ${step}</span><strong>${instruction}</strong></div>
        ${phase === "title" ? "<button data-skip>Skip title</button>" : ""}
        <button data-cancel>Cancel</button>
      </div>`;
      shadow.querySelector("[data-cancel]")?.addEventListener("click", () => finish(null));
      shadow.querySelector("[data-skip]")?.addEventListener("click", () => build());
    };

    const highlight = (element: Element, color: string) => {
      if (!highlighted.has(element)) highlighted.set(element, element.getAttribute("style"));
      (element as HTMLElement).style.outline = `3px solid ${color}`;
      (element as HTMLElement).style.outlineOffset = "3px";
    };

    const finish = (profile: SiteProfile | null) => {
      document.removeEventListener("click", onClick, true);
      for (const [element, style] of highlighted) {
        if (style === null) element.removeAttribute("style");
        else element.setAttribute("style", style);
      }
      host.remove();
      resolve(profile);
    };

    const build = () => {
      if (!user || !assistant) return;
      const userSelector = stableSelector(user);
      const assistantSelector = stableSelector(assistant);
      const container = commonContainer(user, assistant);
      const stamp = new Date().toISOString();
      finish({
        schemaVersion: 1,
        id: profileId(),
        name: document.title.split(/[|\-–—]/)[0]?.trim() || location.hostname,
        source: "local",
        origins: [location.origin],
        pathPatterns: ["/*"],
        selectors: {
          conversation: container === document.body ? undefined : stableSelector(container),
          messages: [...new Set([userSelector, assistantSelector])],
          title: title ? stableSelector(title) : undefined,
          exclude: ["nav", "aside", "[role='navigation']", "[aria-hidden='true']"]
        },
        roles: {
          strategy: "selectors",
          userSelectors: [userSelector],
          assistantSelectors: [assistantSelector],
          startsWith: "user"
        },
        confidence: 0.86,
        createdAt: stamp,
        updatedAt: stamp
      });
    };

    const onClick = (event: Event) => {
      const target = (event.target as Element | null)?.closest?.("article, div, section, h1, h2, h3");
      if (!target || target.closest("[data-ai-chat-overlay], [data-ai-chat-launcher]")) return;
      event.preventDefault();
      event.stopPropagation();
      if (phase === "user") {
        user = target;
        highlight(target, "#8ab4f8");
        phase = "assistant";
      } else if (phase === "assistant") {
        assistant = target;
        highlight(target, "#c0c0c0");
        phase = "title";
      } else {
        title = target;
        highlight(target, "#f4c57a");
        build();
        return;
      }
      render();
    };

    document.documentElement.append(host);
    document.addEventListener("click", onClick, true);
    render();
  });
}
