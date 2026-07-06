import type { Corner, FrameMeterPrefs } from "../core/preferences";
import type { FpsStats } from "../core/fps";

const STYLE = `
  :host { all: initial; }
  .badge {
    position: fixed;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 10px;
    background: #07090db8;
    color: #edf2f8;
    font: 600 13px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    backdrop-filter: blur(6px);
    cursor: pointer;
    user-select: none;
    box-shadow: 0 4px 14px #0006;
    transition: opacity .15s ease;
  }
  .badge:hover { opacity: .9; }
  .badge.top-left { top: 10px; left: 10px; }
  .badge.top-right { top: 10px; right: 10px; }
  .badge.bottom-left { bottom: 10px; left: 10px; }
  .badge.bottom-right { bottom: 10px; right: 10px; }
  .fps { min-width: 38px; text-align: right; }
  .frame-time { color: #98a4b5; font-size: 11px; }
  .panel {
    position: fixed;
    z-index: 2147483647;
    margin-top: 4px;
    padding: 8px 10px;
    border-radius: 10px;
    background: #111318;
    color: #c8d2df;
    font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    box-shadow: 0 6px 18px #000a;
    border: 1px solid #2a3342;
  }
  .panel.top-left { top: 44px; left: 10px; }
  .panel.top-right { top: 44px; right: 10px; }
  .panel.bottom-left { bottom: 44px; left: 10px; }
  .panel.bottom-right { bottom: 44px; right: 10px; }
  .panel dl { display: grid; grid-template-columns: auto auto; gap: 2px 12px; margin: 0; }
  .panel dt { color: #98a4b5; }
  .panel dd { margin: 0; text-align: right; }
  .green { color: #5fd17a; }
  .yellow { color: #f4c57a; }
  .red { color: #ff8d8d; }
`;

function colorClass(fps: number): string {
  if (fps >= 50) return "green";
  if (fps >= 30) return "yellow";
  return "red";
}

function formatFps(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return Math.round(value).toString();
}

export interface BadgeController {
  update(stats: FpsStats): void;
  remove(): void;
}

export function mountBadge(
  prefs: FrameMeterPrefs,
  onToggle: () => void
): BadgeController {
  document.querySelector("[data-frame-meter]")?.remove();

  const host = document.createElement("div");
  host.dataset.frameMeter = "";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${STYLE}</style>
    <div class="badge ${prefs.corner}" role="status" aria-label="Frame rate">
      <span class="fps">—</span>
      ${prefs.showFrameTime ? '<span class="frame-time">0.0ms</span>' : ""}
    </div>
    <div class="panel ${prefs.corner}" hidden>
      <dl>
        <dt>Average</dt><dd class="avg">—</dd>
        <dt>Min</dt><dd class="min">—</dd>
        <dt>Max</dt><dd class="max">—</dd>
        <dt>Frame</dt><dd class="ft">0.0ms</dd>
      </dl>
    </div>
  `;

  const badge = shadow.querySelector<HTMLDivElement>(".badge")!;
  const fpsEl = shadow.querySelector<HTMLSpanElement>(".fps")!;
  const ftEl = shadow.querySelector<HTMLSpanElement>(".frame-time");
  const panel = shadow.querySelector<HTMLDivElement>(".panel")!;

  badge.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    onToggle();
  });

  document.documentElement.append(host);

  let lastColor = "";

  return {
    update(stats: FpsStats) {
      fpsEl.textContent = formatFps(stats.current);
      const cls = prefs.colorCoding ? colorClass(stats.current) : "";
      const next = `fps ${cls}`.trim();
      if (next !== lastColor) {
        fpsEl.className = next;
        lastColor = next;
      }
      if (ftEl) ftEl.textContent = `${stats.frameTimeMs.toFixed(1)}ms`;
      shadow.querySelector<HTMLElement>(".avg")!.textContent = formatFps(stats.average);
      shadow.querySelector<HTMLElement>(".min")!.textContent = formatFps(stats.min);
      shadow.querySelector<HTMLElement>(".max")!.textContent = formatFps(stats.max);
      shadow.querySelector<HTMLElement>(".ft")!.textContent = `${stats.frameTimeMs.toFixed(1)}ms`;
    },
    remove() {
      host.remove();
    }
  };
}

/** Re-applies corner and showFrameTime without rebuilding the whole badge. */
export function repositionBadge(prefs: FrameMeterPrefs): void {
  const host = document.querySelector<HTMLElement>("[data-frame-meter]");
  if (!host?.shadowRoot) return;
  const badge = host.shadowRoot.querySelector<HTMLDivElement>(".badge");
  const panel = host.shadowRoot.querySelector<HTMLDivElement>(".panel");
  if (!badge || !panel) return;
  badge.className = `badge ${prefs.corner}`;
  panel.className = `panel ${prefs.corner}`;

  let ft = badge.querySelector<HTMLSpanElement>(".frame-time");
  if (prefs.showFrameTime && !ft) {
    ft = document.createElement("span");
    ft.className = "frame-time";
    ft.textContent = "0.0ms";
    badge.append(ft);
  } else if (!prefs.showFrameTime && ft) {
    ft.remove();
  }
}

export type { Corner };
