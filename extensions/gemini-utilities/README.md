# AI Chat Utilities

AI Chat Utilities is a local-first Manifest V3 extension for capturing,
exporting, and archiving AI chatbot conversations.

## Supported platforms

- Gemini
- ChatGPT
- Claude
- Qwen
- Initial bundled profiles for Z.ai, Mistral Vibe, Ai2 Playground, and DeepSeek
  Chat (pending authenticated smoke validation)
- Local semantic detection and guided calibration for other web chatbots

## Features

- Platform-neutral Markdown export
- Jupyter Notebook export with executable fenced-code cells
- Clipboard export
- IndexedDB conversation archive with platform and text search
- Optional per-platform and exact-origin host permissions
- Shadow DOM floating launcher on enabled platforms
- Local compatibility profiles with JSON import/export and repair state
- Open Shadow DOM and same-origin frame discovery
- Legacy Gemini archive migration without deleting the original records

Text, citations, code, and attachment or artifact references are preserved.
Binary files and interactive artifacts are not downloaded.

## Development

```bash
npm install
npm run check
```

The extension root remains directly loadable after `npm run build`:

```text
extensions/gemini-utilities
```

Authored TypeScript lives in `src/`; deterministic browser bundles are emitted
to `dist/`. The v1 implementation is retained in `legacy/` for reference.

## Installation

1. Run `npm install && npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click **Load unpacked**.
5. Select `extensions/gemini-utilities`.
6. Open the extension settings and enable persistent access for the platforms
   you use.

Unknown sites can be captured once with `activeTab`, or enabled persistently
for one exact origin. Low-confidence pages launch a three-step calibration
flow that learns message and role selectors without storing conversation text.

## Privacy

Conversation data, semantic analysis, learned profiles, and archives stay in
the browser. The extension does not send telemetry or conversation content to
an external service.
