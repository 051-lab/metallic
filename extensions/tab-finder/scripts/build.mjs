import { build, context } from "esbuild";
import { mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");
await mkdir("dist", { recursive: true });

const options = {
  entryPoints: {
    popup: "src/entries/popup.ts"
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
  const buildContext = await context(options);
  await buildContext.watch();
  console.log("Watching Tab Finder sources…");
} else {
  await build(options);
}
