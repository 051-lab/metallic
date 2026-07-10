```

  ███╗   ███╗███████╗████████╗ █████╗ ██╗     ██╗     ██╗ ██████╗
  ████╗ ████║██╔════╝╚══██╔══╝██╔══██╗██║     ██║     ██║██╔════╝
  ██╔████╔██║█████╗     ██║   ███████║██║     ██║     ██║██║
  ██║╚██╔╝██║██╔══╝     ██║   ██╔══██║██║     ██║     ██║██║
  ██║ ╚═╝ ██║███████╗   ██║   ██╔══██║███████╗███████╗██║╚██████╗
  ╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝ ╚═════╝

```

> *Forged in code. Finished in chrome.*

---

## ⚙ Overview

**metallic** is a Chrome extension workspace — a forge for building powerful, polished browser extensions from the ground up.

---

## 📁 Structure

```
metallic/
├── extensions/
│   ├── ai-chat-utilities/
│   ├── comet-ntp/
│   ├── frame-meter/
│   ├── freedium/
│   ├── localhost-dashboard/
│   ├── tab-finder/
│   └── tube-utilities/
├── scripts/           # Workspace-level validation utilities
├── shared/            # Reusable utilities and components
├── templates/         # Starter templates for new extensions
└── README.md
```

---

## 🔌 Extensions

### AI Chat Utilities

Adds Markdown, Jupyter, clipboard, and local archive tools to Gemini, ChatGPT,
Claude, Qwen, and other chatbot pages through guided capture.

Load unpacked from:

```text
extensions/ai-chat-utilities
```

### comet-ntp

Provides a custom new tab dashboard for the Comet browser using manifest,
navigation, and network redirect layers.

Load unpacked from:

```text
extensions/comet-ntp
```

### Frame Meter

Displays a live FPS counter overlay on any web page, measured via
`requestAnimationFrame`. Configurable corner placement, color coding,
frame-time toggle, expandable session stats, and a per-site disable list.

Load unpacked from:

```text
extensions/frame-meter
```

### Open in Freedium

Adds context-menu actions for opening supported article links and pages through
Freedium. The Chrome build uses `manifest-v3-chrome.json` as its source
manifest.

Build and load according to:

```text
extensions/freedium/README.md
```

### Localhost Dashboard

Provides a developer dashboard for monitoring and navigating locally running
servers.

Load unpacked from:

```text
extensions/localhost-dashboard
```

### Metallic Tab Finder

Provides keyboard-first fuzzy search across every open tab and normal Chrome
window. Results can be grouped by window or domain and include tab-state and
duplicate indicators.

Load unpacked from:

```text
extensions/tab-finder
```

### Tube Utilities

Captures, exports, and locally archives YouTube transcripts. Supports Markdown,
plain text, SubRip, and WebVTT output.

Load unpacked after building from:

```text
extensions/tube-utilities
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- Google Chrome or Chromium
- Git

### Clone the repo

```bash
git clone https://github.com/051-lab/metallic.git
cd metallic
```

### Validate the workspace

```bash
npm run validate
```

The validator discovers extension directories, parses their Manifest V3 source,
and checks that files referenced by each manifest exist. Pull requests also run
the individual `npm run check` pipeline for every extension package that defines
one in the repository workflow matrix.

---

## 🔌 Loading an Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select one of the extension folders inside `extensions/`

---

## 🛠 Extension Anatomy

Every Chrome extension needs a Manifest V3 file. Most Metallic extensions use
`manifest.json`; imported projects may keep a clearly documented source
manifest such as `manifest-v3-chrome.json`.

```json
{
  "manifest_version": 3,
  "name": "My Extension",
  "version": "1.0",
  "description": "Built with metallic.",
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon.png"
  },
  "permissions": []
}
```

---

## 📜 License

MIT — build freely, ship boldly.
