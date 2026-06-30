export function safeFilename(value: string, extension: string): string {
  const base = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "transcript";
  return `${base}.${extension}`;
}

export function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
