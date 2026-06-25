import { cp, mkdir, rm } from "node:fs/promises";

const output = "release/ai-chat-utilities";
await rm("release", { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of [
  "manifest.json",
  "popup.html",
  "options.html",
  "archive.html",
  "ui.css",
  "README.md"
]) {
  await cp(file, `${output}/${file}`);
}
await cp("dist", `${output}/dist`, { recursive: true });
await cp("images", `${output}/images`, { recursive: true });
console.log(`Runtime package staged at ${output}`);
