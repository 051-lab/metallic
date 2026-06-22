"use strict";
(() => {
  // src/core/download.ts
  function safeFilename(value, extension) {
    const base = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "ai-conversation";
    return `${base}.${extension}`;
  }
  function downloadText(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  // src/core/transform.ts
  var roleLabel = (role) => ({
    user: "User",
    assistant: "Assistant",
    system: "System",
    tool: "Tool",
    unknown: "Message"
  })[role] || "Message";
  function toJupyter(snapshot) {
    const cells = [{
      cell_type: "markdown",
      metadata: {},
      source: [`# ${snapshot.title}

**Platform:** ${snapshot.platformName}

**Source:** ${snapshot.sourceUrl}`]
    }];
    const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
    for (const message of snapshot.messages) {
      cells.push({ cell_type: "markdown", metadata: {}, source: [`**${roleLabel(message.role)}**`] });
      let last = 0;
      let match;
      while (match = fence.exec(message.markdown)) {
        const prose = message.markdown.slice(last, match.index).trim();
        if (prose) cells.push({ cell_type: "markdown", metadata: {}, source: [prose] });
        const code = match[2] || "";
        cells.push({
          cell_type: "code",
          execution_count: null,
          metadata: match[1] ? { language: match[1].trim() } : {},
          outputs: [],
          source: code.replace(/\n$/, "").split("\n").map(
            (line, index, all) => index < all.length - 1 ? `${line}
` : line
          )
        });
        last = fence.lastIndex;
      }
      const tail = message.markdown.slice(last).trim();
      if (tail) cells.push({ cell_type: "markdown", metadata: {}, source: [tail] });
    }
    return JSON.stringify({ cells, metadata: {}, nbformat: 4, nbformat_minor: 5 }, null, 2);
  }

  // src/entries/archive.ts
  document.addEventListener("DOMContentLoaded", async () => {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return;
    const response = await chrome.runtime.sendMessage({ type: "ARCHIVE_GET", id });
    const snapshot = response.snapshot;
    if (!snapshot) {
      document.querySelector("main").textContent = "Conversation not found.";
      return;
    }
    document.querySelector("#convoTitle").textContent = snapshot.title;
    document.querySelector("#convoMeta").textContent = `${snapshot.platformName} \xB7 ${new Date(snapshot.capturedAt).toLocaleString()}`;
    document.querySelector("#markdownViewer").textContent = snapshot.renderedMarkdown;
    document.querySelector("#downloadBtn").addEventListener(
      "click",
      () => downloadText(safeFilename(snapshot.title, "md"), snapshot.renderedMarkdown, "text/markdown")
    );
    document.querySelector("#jupyterBtn").addEventListener(
      "click",
      () => downloadText(safeFilename(snapshot.title, "ipynb"), toJupyter(snapshot), "application/x-ipynb+json")
    );
    document.querySelector("#copyBtn").addEventListener(
      "click",
      () => navigator.clipboard.writeText(snapshot.renderedMarkdown)
    );
    document.querySelector("#deleteBtn").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "ARCHIVE_DELETE", id });
      window.close();
    });
  });
})();
//# sourceMappingURL=archive.js.map
