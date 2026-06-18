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
├── extensions/        # Individual Chrome extension projects
├── shared/            # Shared utilities, helpers, and components
├── templates/         # Starter templates for new extensions
└── README.md
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
4. Select your extension folder inside `extensions/`

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
