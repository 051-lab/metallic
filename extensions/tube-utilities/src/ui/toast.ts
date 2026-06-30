export function showToast(message: string, tone: "info" | "error" = "info"): void {
  document.querySelector("[data-tube-toast]")?.remove();
  const host = document.createElement("div");
  host.dataset.tubeToast = "";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    :host{all:initial}.toast{position:fixed;right:20px;bottom:82px;z-index:2147483647;
      max-width:360px;padding:11px 14px;border:1px solid ${tone === "error" ? "#9d5555" : "#4c6387"};
      border-radius:11px;color:#eef3fa;background:#141820;box-shadow:0 18px 50px #0009;
      font:13px/1.45 system-ui,sans-serif}
  </style><div class="toast" role="status"></div>`;
  shadow.querySelector(".toast")!.textContent = message;
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 2600);
}
