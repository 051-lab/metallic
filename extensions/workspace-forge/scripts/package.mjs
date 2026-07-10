import { cp, mkdir, rm } from "node:fs/promises";

const releaseDir = "release/workspace-forge";
await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

for (const file of [
  "manifest.json",
  "popup.html",
  "popup.css",
  "sidepanel.html",
  "sidepanel.css",
  "README.md"
]) {
  await cp(file, `${releaseDir}/${file}`);
}
await cp("dist", `${releaseDir}/dist`, { recursive: true });
console.log(`Staged ${releaseDir}`);
