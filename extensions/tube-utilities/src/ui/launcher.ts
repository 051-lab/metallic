const STYLE = `
  :host { all: initial; }
  button { position:fixed; right:20px; bottom:20px; z-index:2147483646; display:grid; width:48px;
    height:48px; place-items:center; border:1px solid #465166; border-radius:15px; color:#101319;
    background:#8ab4f8; box-shadow:0 18px 48px #0008; cursor:pointer; font:700 16px system-ui;
    transition:transform .16s ease, box-shadow .16s ease; }
  button:hover { transform:translateY(-3px); box-shadow:0 22px 58px #000a, 0 0 24px #8ab4f855; }
  button:focus-visible { outline:3px solid white; outline-offset:3px; }
`;

export type LauncherPosition = "bottom-right" | "bottom-left";

export function mountLauncher(
  onClick: () => void,
  position: LauncherPosition = "bottom-right"
): () => void {
  const existing = document.querySelector("[data-tube-launcher]");
  if (existing) existing.remove();
  const host = document.createElement("div");
  host.dataset.tubeLauncher = "";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${STYLE}${position === "bottom-left" ? "button{right:auto;left:20px}" : ""}</style><button type="button" title="Open Tube Utilities" aria-label="Open Tube Utilities">T</button>`;
  shadow.querySelector("button")?.addEventListener("click", onClick);
  document.documentElement.append(host);
  return () => host.remove();
}
