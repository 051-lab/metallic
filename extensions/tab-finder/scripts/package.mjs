import { cp, mkdir, rm } from "node:fs/promises";

const output = "release/tab-finder";
await rm("release", { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["manifest.json", "popup.html", "popup.css", "README.md"]) {
  await cp(file, `${output}/${file}`);
}
await cp("dist", `${output}/dist`, { recursive: true });
console.log(`Runtime package staged at ${output}`);
