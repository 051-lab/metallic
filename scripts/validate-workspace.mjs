import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const extensionsRoot = path.join(root, "extensions");
const manifestCandidates = ["manifest.json", "manifest-v3-chrome.json"];
const generatedPrefixes = ["dist/", "release/"];

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
  const addValue = (value) => {
    if (typeof value === "string") {
      add(value);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const file of Object.values(value)) add(file);
  };

  add(manifest.action?.default_popup);
  addValue(manifest.action?.default_icon);
  add(manifest.background?.service_worker);
  add(manifest.options_ui?.page);
  add(manifest.options_page);
  add(manifest.side_panel?.default_path);
  addValue(manifest.icons);
  addValue(manifest.chrome_url_overrides);

  for (const script of manifest.content_scripts || []) {
    for (const file of script.js || []) add(file);
    for (const file of script.css || []) add(file);
  }

  for (const resource of manifest.declarative_net_request?.rule_resources || []) {
    add(resource.path);
  }

  for (const resourceGroup of manifest.web_accessible_resources || []) {
    for (const file of resourceGroup.resources || []) add(file);
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
  const packagePath = path.join(extensionDir, "package.json");
  const hasPackage = await fileExists(packagePath);
  let manifestPath;

  for (const candidate of manifestCandidates) {
    const candidatePath = path.join(extensionDir, candidate);
    if (await fileExists(candidatePath)) {
      manifestPath = candidatePath;
      break;
    }
  }

  if (!manifestPath) {
    failures.push(`${extensionName}: no Manifest V3 source file found`);
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
  const generated = [];
  for (const relativePath of referencedFiles(manifest)) {
    if (await fileExists(path.join(extensionDir, relativePath))) continue;
    if (hasPackage && generatedPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
      generated.push(relativePath);
    } else {
      missing.push(relativePath);
    }
  }

  if (missing.length) {
    failures.push(`${extensionName}: missing referenced files: ${missing.join(", ")}`);
  }

  summaries.push({
    directory: extensionName,
    name: manifest.name || extensionName,
    version: manifest.version || "unknown",
    manifest: path.basename(manifestPath),
    package: hasPackage,
    generated: generated.length
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
