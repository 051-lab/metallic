# AI Chat Utilities Installation

## Build

From `extensions/ai-chat-utilities`:

```bash
npm install
npm run check
```

## Load unpacked

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `extensions/ai-chat-utilities`.

## Enable platforms

Open the extension's **Details → Extension options** page and enable Gemini,
ChatGPT, Claude, Qwen, or Google AI Mode. Chrome requests access separately for
each selected site. Disabled sites receive no persistent access.

On other chatbot pages, click the toolbar action and choose **Capture this page
once**. Choose **Always enable on this site** only when you want persistent
launcher access for that exact origin.

If local semantic detection is uncertain, calibration asks you to identify one
user message, one assistant message, and optionally the conversation title.
The resulting declarative profile is stored locally and can be managed,
exported, imported, or deleted from extension options.

## Validation checklist

- The extension loads without manifest errors.
- Enabled chatbot sites display the floating `AI` launcher.
- Markdown and Jupyter downloads contain ordered speaker roles.
- Archive entries appear in the popup and open in the archive viewer.
- Existing Gemini archive entries are migrated and remain readable.
- Disabling a platform removes its registered content script and host access.
- Revoking a persistent site removes its exact-origin content script and host access.
- Profile exports contain selectors and metadata, never conversation content.
