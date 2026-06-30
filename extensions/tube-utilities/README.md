# Tube Utilities

Tube Utilities is a Manifest V3 Chrome extension for capturing, exporting, and archiving YouTube video transcripts.

## Features

- Capture YouTube caption tracks from watch pages.
- Export transcripts as Markdown, plain text, SubRip `.srt`, or WebVTT `.vtt`.
- Copy clean transcript text to the clipboard.
- Save transcripts to a local IndexedDB archive.
- Search archived transcripts from the popup.
- Configure launcher position, filename template, timestamps, and preferred caption language.

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
