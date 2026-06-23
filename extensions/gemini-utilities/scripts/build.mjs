import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");
await mkdir("dist", { recursive: true });

const context = {
  entryPoints: {
    background: "src/entries/background.ts",
    content: "src/entries/content.ts",
    popup: "src/entries/popup.ts",
    options: "src/entries/options.ts",
    archive: "src/entries/archive.ts"
  },
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  minify: false,
  logLevel: "info"
};

if (watch) {
  const result = await build({ ...context, watch: true });
  console.log("Watching AI Chat Utilities sources…", result);
} else {
  await build(context);
}
