import { downloadText, safeFilename } from "../core/download";
import type { TranscriptSnapshot } from "../core/types";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function snapshotId(): string | null {
  return new URLSearchParams(location.search).get("id");
}

function filename(snapshot: TranscriptSnapshot, extension: string): string {
  return safeFilename(`${snapshot.title}-${snapshot.capturedAt.slice(0, 10)}`, extension);
}

function render(snapshot: TranscriptSnapshot): void {
  $("#archiveTitle").textContent = snapshot.title;
  $("#archiveMeta").textContent =
    `${snapshot.author} · ${new Date(snapshot.capturedAt).toLocaleString()} · ${snapshot.segments.length} segments`;
  ($("#sourceLink") as HTMLAnchorElement).href = snapshot.sourceUrl;
  $("#transcriptBody").textContent = snapshot.renderedMarkdown;
}

document.addEventListener("DOMContentLoaded", async () => {
  const id = snapshotId();
  if (!id) {
    $("#archiveTitle").textContent = "Missing archive id";
    $("#transcriptBody").textContent = "This archive URL does not include a transcript id.";
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: "ARCHIVE_GET", id });
  if (!response?.ok || !response.snapshot) {
    $("#archiveTitle").textContent = "Transcript not found";
    $("#transcriptBody").textContent = response?.error || "The selected transcript is no longer in the local archive.";
    return;
  }

  const snapshot = response.snapshot as TranscriptSnapshot;
  render(snapshot);

  $("#downloadMarkdown").addEventListener("click", () =>
    downloadText(filename(snapshot, "md"), snapshot.renderedMarkdown, "text/markdown")
  );
  $("#downloadPlain").addEventListener("click", () =>
    downloadText(filename(snapshot, "txt"), snapshot.plainText, "text/plain")
  );
  $("#copyPlain").addEventListener("click", async () => {
    await navigator.clipboard.writeText(snapshot.plainText);
    $("#archiveMeta").textContent = "Copied transcript text to clipboard.";
  });
  $("#deleteSnapshot").addEventListener("click", async () => {
    if (!confirm("Delete this archived transcript?")) return;
    await chrome.runtime.sendMessage({ type: "ARCHIVE_DELETE", id });
    window.close();
  });
});
