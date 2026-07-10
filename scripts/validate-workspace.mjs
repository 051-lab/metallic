import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const extensionsRoot = path.join(root, "extensions");
const manifestCandidates = ["manifest.json", "manifest-v3-chrome.json"];

const fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

function referencedFiles(manifest) {
  const files = new Set();
  const add = (value) => {
    if (typeof value === "string" && value.trim()) files.add(value);
  };
  const addRecord = (value) => {
    if (!value || typeof value !== "object") return;
    for (const file of Object.values(value)) add(file);
  };

  add(manifest.action?.default_popup);
  addRecord(manifest.action?.default_icon);
  add(manifest.background?.service_worker);
  add(manifest.options_ui?.page);
  add(manifest.side_panel?.default_path);
  addRecord(manifest.icons);

  for (const script of manifest.content_scripts || []) {
    for (const file of script.js || []) add(file);
    for (const file of script.css || []) add(file);
  }

  return [...files];
}

const extensionEntries = await readdir(extensionsRoot, { withFileTypes: true });
const extensionDirs = extensionEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const failures = [];
const summaries = [];

for (const extensionName of extensionDirs) {
  const extensionDir = path.join(extensionsRoot, extensionName);
  let manifestPath;

  for (const candidate of manifestCandidates) {
    const candidatePath = path.join(extensionDir, candidate);
    if (await fileExists(candidatePath)) {
      manifestPath = candidatePath;
      break;
    }
  }

  if (!manifestPath) {
    failures.push(`${extensionName}: no Manifest V3 file found`);
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    failures.push(`${extensionName}: invalid JSON in ${path.basename(manifestPath)} (${error.message})`);
    continue;
  }

  if (manifest.manifest_version !== 3) {
    failures.push(`${extensionName}: expected manifest_version 3`);
  }

  const missing = [];
  for (const relativePath of referencedFiles(manifest)) {
    if (!(await fileExists(path.join(extensionDir, relativePath)))) missing.push(relativePath);
  }

  if (missing.length) {
    failures.push(`${extensionName}: missing referenced files: ${missing.join(", ")}`);
  }

  const packagePath = path.join(extensionDir, "package.json");
  const hasPackage = await fileExists(packagePath);
  summaries.push({
    directory: extensionName,
    name: manifest.name || extensionName,
    version: manifest.version || "unknown",
    manifest: path.basename(manifestPath),
    package: hasPackage
  });
}

console.table(summaries);

if (failures.length) {
  console.error("\nWorkspace validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\nValidated ${summaries.length} extension directories.`);
}
