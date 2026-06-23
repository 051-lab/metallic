import type { AdapterDetection, ConversationSnapshot, PlatformAdapter } from "../core/types";

const STYLE = `
  :host { all:initial; }
  .backdrop { position:fixed; inset:0; z-index:2147483647; display:grid; place-items:center;
    padding:20px; background:#07090db8; backdrop-filter:blur(10px); font:14px/1.45 system-ui,sans-serif; }
  .panel { width:min(560px,100%); border:1px solid #323b4b; border-radius:20px; color:#edf2f8;
    background:#111318; box-shadow:0 28px 90px #000c; overflow:hidden; }
  header { display:flex; justify-content:space-between; gap:20px; padding:22px 24px; border-bottom:1px solid #262d39; }
  .eyebrow { color:#8ab4f8; font-size:11px; font-weight:800; letter-spacing:.15em; text-transform:uppercase; }
  h2 { margin:5px 0 0; font-size:22px; } p { margin:7px 0 0; color:#919aab; }
  .close { border:0; color:#aeb7c5; background:transparent; cursor:pointer; font-size:22px; }
  .status { padding:15px 24px; border-bottom:1px solid #262d39; color:#bec7d5; background:#151922; }
  .warning { color:#f4c57a; }
  .preview { display:grid; gap:7px; max-height:156px; padding:14px 24px; overflow:auto; border-bottom:1px solid #262d39; }
  .message { display:grid; grid-template-columns:72px 1fr; gap:10px; color:#b7c0ce; font-size:12px; }
  .message b { color:#8ab4f8; font-size:10px; letter-spacing:.08em; text-transform:uppercase; }
  .message span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:20px 24px 24px; }
  .action { min-height:86px; padding:14px; border:1px solid #303949; border-radius:12px; color:#e8edf5;
    background:#171b23; text-align:left; cursor:pointer; }
  .action:hover { border-color:#6684b7; background:#1b2330; }
  .action strong,.action span { display:block; }.action span { margin-top:5px;color:#8993a3;font-size:12px; }
  .action.primary { border-color:#5978a9; background:#182538; }
  @media(max-width:520px){.grid{grid-template-columns:1fr}}
`;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[character]!));

export type OverlayAction = "markdown" | "copy" | "jupyter" | "archive" | "new-chat" | "picker";

export function showOverlay(
  adapter: PlatformAdapter,
  snapshot: ConversationSnapshot | null,
  onAction: (action: OverlayAction) => void,
  detection?: AdapterDetection
): void {
  document.querySelector("[data-ai-chat-overlay]")?.remove();
  const host = document.createElement("div");
  host.dataset.aiChatOverlay = "";
  const shadow = host.attachShadow({ mode: "open" });
  const warning = snapshot?.warnings[0];
  const canCalibrate = adapter.id === "generic" || adapter.id.startsWith("profile:");
  shadow.innerHTML = `<style>${STYLE}</style><div class="backdrop"><section class="panel" role="dialog" aria-modal="true">
    <header><div><div class="eyebrow">${escapeHtml(adapter.displayName)}</div><h2>AI Chat Utilities</h2>
      <p>${snapshot ? `${snapshot.messages.length} messages · ${escapeHtml(snapshot.title)}` : "No conversation detected yet."}</p></div>
      <button class="close" aria-label="Close">×</button></header>
    <div class="status ${warning ? "warning" : ""}">${warning ? escapeHtml(warning) :
      `Conversation ready · ${Math.round((detection?.confidence || 1) * 100)}% extraction confidence.`}</div>
    ${snapshot ? `<div class="preview">${snapshot.messages.slice(0, 6).map((message) =>
      `<div class="message"><b>${message.role}</b><span></span></div>`).join("")}</div>` : ""}
    <div class="grid">
      <button class="action primary" data-action="markdown"><strong>Download Markdown</strong><span>Structured, portable conversation export.</span></button>
      <button class="action" data-action="copy"><strong>Copy Markdown</strong><span>Put the rendered conversation on the clipboard.</span></button>
      <button class="action" data-action="jupyter"><strong>Export Jupyter</strong><span>Split fenced code into executable cells.</span></button>
      <button class="action" data-action="archive"><strong>Save to Archive</strong><span>Store locally for search and retrieval.</span></button>
      ${canCalibrate ? `<button class="action" data-action="picker"><strong>${adapter.id === "generic" ? "Calibrate this site" : "Recalibrate profile"}</strong><span>Identify one user message, one assistant response, and the optional title.</span></button>` : ""}
      ${adapter.getNewChatTarget?.(document) ? `<button class="action" data-action="new-chat"><strong>New Chat</strong><span>Open this platform's new conversation page.</span></button>` : ""}
    </div></section></div>`;
  shadow.querySelector(".close")?.addEventListener("click", () => host.remove());
  shadow.querySelectorAll(".message span").forEach((element, index) => {
    element.textContent = snapshot?.messages[index]?.plainText || "";
  });
  shadow.querySelector(".backdrop")?.addEventListener("click", (event) => {
    if (event.target === shadow.querySelector(".backdrop")) host.remove();
  });
  shadow.querySelectorAll<HTMLElement>("[data-action]").forEach((button) =>
    button.addEventListener("click", () => {
      onAction(button.dataset.action as OverlayAction);
      if (button.dataset.action !== "picker") host.remove();
    })
  );
  document.documentElement.append(host);
}
