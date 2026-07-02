```

  ███╗   ███╗███████╗████████╗ █████╗ ██╗     ██╗     ██╗ ██████╗
  ████╗ ████║██╔════╝╚══██╔══╝██╔══██╗██║     ██║     ██║██╔════╝
  ██╔████╔██║█████╗     ██║   ███████║██║     ██║     ██║██║
  ██║╚██╔╝██║██╔══╝     ██║   ██╔══██║██║     ██║     ██║██║
  ██║ ╚═╝ ██║███████╗   ██║   ██║  ██║███████╗███████╗██║╚██████╗
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
│   ├── comet-ntp/
│   ├── ai-chat-utilities/
│   ├── localhost-dashboard/
│   └── workspace-forge/
├── shared/            # Reusable utilities and components
├── templates/         # Starter templates for new extensions
└── README.md
```

---

## 🔌 Extensions

### comet-ntp

Provides a custom new tab dashboard for the Comet browser using manifest,
navigation, and network redirect layers.

Load unpacked from:

```text
extensions/comet-ntp
```

### AI Chat Utilities

Adds Markdown, Jupyter, clipboard, and local archive tools to Gemini, ChatGPT,
Claude, Qwen, and other chatbot pages through guided capture.

Load unpacked from:

```text
extensions/ai-chat-utilities
```

### Localhost Dashboard

Provides a developer dashboard for monitoring and navigating locally running
servers.

Load unpacked from:

```text
extensions/localhost-dashboard
```

### Workspace Forge

Turns messy browser windows into named, reusable project workspaces with saved
tabs, restore actions, tab grouping, notes, next actions, and lightweight tasks.

Load unpacked from:

```text
extensions/workspace-forge
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

---

## 🔌 Loading an Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select one of the extension folders inside `extensions/`

---

## 🛠 Extension Anatomy

Every Chrome extension needs a `manifest.json`. Here's a Manifest V3 baseline:

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
