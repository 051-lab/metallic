const PICKER_STYLE = `
  :host { all: initial; }
  .bar { position:fixed; left:50%; bottom:24px; z-index:2147483647; display:flex; gap:8px;
    align-items:center; transform:translateX(-50%); padding:10px 12px; border:1px solid #3c4657;
    border-radius:14px; background:#111318; color:#eef2f8; box-shadow:0 20px 60px #0009;
    font:13px/1.4 system-ui,sans-serif; }
  button { border:1px solid #3c4657; border-radius:9px; padding:8px 11px; color:#d9e5f8;
    background:#1b1f27; cursor:pointer; }
  button.primary { color:#101319; background:#8ab4f8; border-color:#8ab4f8; font-weight:700; }
`;

export function startGuidedPicker(candidates: Element[]): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${PICKER_STYLE}</style><div class="bar">
      <span><strong data-count>0</strong> selected. Click message blocks; Shift-click changes role.</span>
      <button data-cancel>Cancel</button><button class="primary" data-done>Use selection</button>
    </div>`;
    document.documentElement.append(host);
    const selected = new Set<Element>();
    let priorStyles = new Map<Element, string | null>();
    const count = shadow.querySelector<HTMLElement>("[data-count]")!;
    const update = () => count.textContent = String(selected.size);
    const click = (event: Event) => {
      const mouse = event as MouseEvent;
      const target = candidates.find((candidate) => candidate.contains(mouse.target as Node));
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      if (!priorStyles.has(target)) priorStyles.set(target, target.getAttribute("style"));
      if (selected.has(target)) {
        selected.delete(target);
        target.removeAttribute("data-ai-chat-selected");
        target.removeAttribute("data-ai-chat-role");
        target.setAttribute("style", priorStyles.get(target) || "");
      } else {
        selected.add(target);
        target.setAttribute("data-ai-chat-selected", "");
        target.setAttribute("data-ai-chat-role", selected.size % 2 ? "user" : "assistant");
        (target as HTMLElement).style.outline = "3px solid #8ab4f8";
        (target as HTMLElement).style.outlineOffset = "3px";
      }
      if (mouse.shiftKey && selected.has(target)) {
        const current = target.getAttribute("data-ai-chat-role");
        target.setAttribute("data-ai-chat-role", current === "user" ? "assistant" : "user");
      }
      update();
    };
    const cleanup = (keep: boolean) => {
      document.removeEventListener("click", click, true);
      for (const [element, style] of priorStyles) {
        if (style === null) element.removeAttribute("style");
        else element.setAttribute("style", style);
        if (!keep) {
          element.removeAttribute("data-ai-chat-selected");
          element.removeAttribute("data-ai-chat-role");
        }
      }
      host.remove();
      resolve(keep && selected.size > 0);
    };
    document.addEventListener("click", click, true);
    shadow.querySelector("[data-cancel]")?.addEventListener("click", () => cleanup(false));
    shadow.querySelector("[data-done]")?.addEventListener("click", () => cleanup(true));
  });
}
