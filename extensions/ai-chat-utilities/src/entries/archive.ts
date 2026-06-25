import type { ConversationSnapshot } from "../core/types";
import { downloadText, safeFilename } from "../core/download";
import { toJupyter } from "../core/transform";

document.addEventListener("DOMContentLoaded", async () => {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) return;
  const response = await chrome.runtime.sendMessage({ type: "ARCHIVE_GET", id });
  const snapshot = response.snapshot as ConversationSnapshot | undefined;
  if (!snapshot) {
    document.querySelector("main")!.textContent = "Conversation not found.";
    return;
  }
  document.querySelector("#convoTitle")!.textContent = snapshot.title;
  document.querySelector("#convoMeta")!.textContent =
    `${snapshot.platformName} · ${new Date(snapshot.capturedAt).toLocaleString()}`;
  document.querySelector("#markdownViewer")!.textContent = snapshot.renderedMarkdown;
  document.querySelector("#downloadBtn")!.addEventListener("click", () =>
    downloadText(safeFilename(snapshot.title, "md"), snapshot.renderedMarkdown, "text/markdown")
  );
  document.querySelector("#jupyterBtn")!.addEventListener("click", () =>
    downloadText(safeFilename(snapshot.title, "ipynb"), toJupyter(snapshot), "application/x-ipynb+json")
  );
  document.querySelector("#copyBtn")!.addEventListener("click", () =>
    navigator.clipboard.writeText(snapshot.renderedMarkdown)
  );
  document.querySelector("#deleteBtn")!.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "ARCHIVE_DELETE", id });
    window.close();
  });
});
