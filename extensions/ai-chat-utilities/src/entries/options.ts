import { PLATFORMS } from "../core/platforms";
import type { SiteProfile } from "../core/types";

const list = document.querySelector("#platformList")!;
const toast = document.querySelector<HTMLElement>("#toast")!;
const persistentSiteList = document.querySelector("#persistentSiteList")!;
const profileList = document.querySelector("#profileList")!;

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 1800);
}

async function render(): Promise<void> {
  const { enabledPlatforms = ["gemini"] } = await chrome.storage.sync.get({
    enabledPlatforms: ["gemini"]
  });
  const permissions = await chrome.permissions.getAll();
  list.replaceChildren();
  for (const platform of PLATFORMS) {
    const row = document.createElement("label");
    row.className = "platform-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = enabledPlatforms.includes(platform.id) &&
      platform.origins.every((origin) => permissions.origins?.includes(origin));
    const copy = document.createElement("span");
    copy.innerHTML = `<strong>${platform.name}</strong><small>${platform.origins[0]}</small>`;
    checkbox.addEventListener("change", async () => {
      const current = await chrome.storage.sync.get({ enabledPlatforms: ["gemini"] });
      let next = [...current.enabledPlatforms];
      if (checkbox.checked) {
        const granted = await chrome.permissions.request({ origins: platform.origins });
        if (!granted) {
          checkbox.checked = false;
          showToast("Permission was not granted.");
          return;
        }
        next = [...new Set([...next, platform.id])];
      } else {
        await chrome.permissions.remove({ origins: platform.origins });
        next = next.filter((id: string) => id !== platform.id);
      }
      await chrome.storage.sync.set({ enabledPlatforms: next });
      await chrome.runtime.sendMessage({ type: "RECONCILE_SCRIPTS" });
      showToast(`${platform.name} ${checkbox.checked ? "enabled" : "disabled"}.`);
    });
    row.append(checkbox, copy);
    list.append(row);
  }
}

function emptyState(message: string): HTMLElement {
  const element = document.createElement("p");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}

async function renderPersistentSites(): Promise<void> {
  const { persistentOrigins = [] } = await chrome.storage.local.get({ persistentOrigins: [] });
  persistentSiteList.replaceChildren();
  if (!persistentOrigins.length) {
    persistentSiteList.append(emptyState("No additional sites have persistent access."));
    return;
  }
  for (const origin of persistentOrigins as string[]) {
    const row = document.createElement("div");
    row.className = "management-row";
    const copy = document.createElement("div");
    copy.innerHTML = `<strong></strong><small>Launcher access enabled</small>`;
    copy.querySelector("strong")!.textContent = origin;
    const remove = document.createElement("button");
    remove.className = "danger-button compact-button";
    remove.textContent = "Revoke";
    remove.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "DISABLE_SITE", origin });
      await renderPersistentSites();
      showToast(`Revoked access to ${origin}.`);
    });
    row.append(copy, remove);
    persistentSiteList.append(row);
  }
}

async function renderProfiles(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: "PROFILE_LIST" });
  const profiles = (response.profiles || []) as SiteProfile[];
  profileList.replaceChildren();
  if (!profiles.length) {
    profileList.append(emptyState("No local profiles yet. Calibrate an unknown chatbot from the page overlay."));
    return;
  }
  for (const profile of profiles) {
    const row = document.createElement("div");
    row.className = "management-row";
    const copy = document.createElement("div");
    const status = profile.needsRepair ? "Needs repair" : `${Math.round(profile.confidence * 100)}% profile confidence`;
    copy.innerHTML = `<strong></strong><small></small><span class="status-pill"></span>`;
    copy.querySelector("strong")!.textContent = profile.name;
    copy.querySelector("small")!.textContent = profile.origins.join(", ");
    copy.querySelector(".status-pill")!.textContent = status;
    if (profile.needsRepair) copy.querySelector(".status-pill")!.classList.add("warning");
    const actions = document.createElement("div");
    actions.className = "inline-actions";
    if (profile.needsRepair) {
      const repair = document.createElement("button");
      repair.className = "compact-button";
      repair.textContent = "Open to repair";
      repair.addEventListener("click", () => chrome.tabs.create({ url: profile.origins[0] }));
      actions.append(repair);
    }
    const remove = document.createElement("button");
    remove.className = "danger-button compact-button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "PROFILE_DELETE", id: profile.id });
      await renderProfiles();
      showToast(`Deleted ${profile.name}.`);
    });
    actions.append(remove);
    row.append(copy, actions);
    profileList.append(row);
  }
}

document.addEventListener("DOMContentLoaded", () =>
  Promise.all([render(), renderPersistentSites(), renderProfiles()]));

document.querySelector("#preferenceForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.sync.set({
    launcherEnabled: (document.querySelector("#launcherEnabled") as HTMLInputElement).checked,
    launcherPosition: (document.querySelector("#launcherPosition") as HTMLSelectElement).value,
    filenameTemplate: (document.querySelector("#filenameTemplate") as HTMLInputElement).value.trim() ||
      "{platform}-{title}"
  });
  showToast("Preferences saved.");
});

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await chrome.storage.sync.get({
    launcherEnabled: true,
    launcherPosition: "bottom-right",
    filenameTemplate: "{platform}-{title}"
  });
  (document.querySelector("#launcherEnabled") as HTMLInputElement).checked = settings.launcherEnabled;
  (document.querySelector("#launcherPosition") as HTMLSelectElement).value = settings.launcherPosition;
  (document.querySelector("#filenameTemplate") as HTMLInputElement).value = settings.filenameTemplate;
});

document.querySelector("#exportProfiles")?.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "PROFILE_EXPORT" });
  const blob = new Blob([response.json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ai-chat-utilities-profiles.json";
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Profile export created.");
});

document.querySelector("#importProfiles")?.addEventListener("click", () =>
  (document.querySelector("#profileFile") as HTMLInputElement).click());

document.querySelector("#profileFile")?.addEventListener("change", async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const json = await file.text();
    const incoming = JSON.parse(json);
    const values = Array.isArray(incoming) ? incoming : [incoming];
    const current = await chrome.runtime.sendMessage({ type: "PROFILE_LIST" });
    const currentIds = new Set((current.profiles as SiteProfile[]).map((profile) => profile.id));
    const conflicts = values.filter((value) =>
      value && typeof value === "object" && currentIds.has((value as { id?: string }).id || "")
    ).length;
    if (conflicts && !confirm(
      `${conflicts} imported profile${conflicts === 1 ? "" : "s"} will replace local profiles with the same ID. Continue?`
    )) return;
    const response = await chrome.runtime.sendMessage({
      type: "PROFILE_IMPORT",
      json
    });
    if (!response.ok) throw new Error(response.error);
    await renderProfiles();
    showToast(`Imported ${response.count} profile${response.count === 1 ? "" : "s"}.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Profile import failed.");
  } finally {
    input.value = "";
  }
});
