# Frame Meter

Frame Meter is a Manifest V3 Chrome extension that displays a live FPS counter overlay on every web page, measured via `requestAnimationFrame`.

## Features

- Live FPS counter in any screen corner (top/bottom, left/right).
- Color-coded FPS: green ≥50, yellow 30–49, red <30.
- Optional frame-time (ms/frame) display.
- Click the badge to expand session stats (average/min/max/frame time).
- Per-site disable list.
- Shadow-DOM-isolated overlay so page CSS cannot break it.

## Development

```bash
npm install
npm run check
```

Load the extension unpacked from this directory after running:

```bash
npm run build
```

The runtime entry files are emitted to `dist/`.

## How it works

The content script runs a `requestAnimationFrame` loop, measuring the delta between frames and feeding it to a pure `FrameMeter` class that maintains a rolling 60-frame window and session min/max. The overlay updates ~2x/sec to avoid layout thrash. All UI is rendered into a Shadow DOM host appended to `document.documentElement` with `:host { all: initial; }` isolation.
