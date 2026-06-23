const DEFAULT_LINKS = [
  { label: "GitHub", url: "https://github.com/" },
  { label: "Google", url: "https://www.google.com/" },
  { label: "YouTube", url: "https://www.youtube.com/" },
  { label: "Perplexity", url: "https://www.perplexity.ai/search" },
  { label: "X / Twitter", url: "https://x.com/" }
];

const form = document.getElementById("settingsForm");
const userName = document.getElementById("userName");
const defaultEngine = document.getElementById("defaultEngine");
const quickLinksList = document.getElementById("quickLinksList");
const showAddLink = document.getElementById("showAddLink");
const addLinkForm = document.getElementById("addLinkForm");
const linkLabel = document.getElementById("linkLabel");
const linkUrl = document.getElementById("linkUrl");
const confirmAddLink = document.getElementById("confirmAddLink");
const cancelAddLink = document.getElementById("cancelAddLink");
const linkError = document.getElementById("linkError");
const customUrlGroup = document.getElementById("customUrlGroup");
const customUrl = document.getElementById("customUrl");
const colorControls = document.getElementById("colorControls");
const gradientControls = document.getElementById("gradientControls");
const imageControls = document.getElementById("imageControls");
const backgroundColor = document.getElementById("backgroundColor");
const gradientFrom = document.getElementById("gradientFrom");
const gradientTo = document.getElementById("gradientTo");
const gradientDirection = document.getElementById("gradientDirection");
const backgroundImageUrl = document.getElementById("backgroundImageUrl");
const toast = document.getElementById("toast");

let quickLinks = [];
let draggedIndex = null;

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function selectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value;
}

function setSelectedValue(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function updateConditionalControls() {
  const mode = selectedValue("mode");
  const backgroundType = selectedValue("backgroundType");

  customUrlGroup.hidden = mode !== "custom";
  colorControls.hidden = backgroundType !== "color";
  gradientControls.hidden = backgroundType !== "gradient";
  imageControls.hidden = backgroundType !== "image";
}

function renderQuickLinks() {
  quickLinksList.replaceChildren();

  quickLinks.forEach((link, index) => {
    const row = document.createElement("div");
    const handle = document.createElement("span");
    const label = document.createElement("span");
    const url = document.createElement("span");
    const remove = document.createElement("button");

    row.className = "link-row";
    row.draggable = true;
    row.dataset.index = String(index);

    handle.className = "drag-handle";
    handle.textContent = "⠿";
    handle.title = "Drag to reorder";

    label.className = "link-label";
    label.textContent = link.label;

    url.className = "link-url";
    url.textContent = link.url;

    remove.className = "delete-link";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Delete ${link.label}`);
    remove.addEventListener("click", () => {
      quickLinks.splice(index, 1);
      renderQuickLinks();
    });

    row.addEventListener("dragstart", () => {
      draggedIndex = index;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      draggedIndex = null;
      row.classList.remove("dragging");
    });
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetIndex = Number(row.dataset.index);
      if (draggedIndex === null || draggedIndex === targetIndex) return;

      const [moved] = quickLinks.splice(draggedIndex, 1);
      quickLinks.splice(targetIndex, 0, moved);
      renderQuickLinks();
    });

    row.append(handle, label, url, remove);
    quickLinksList.append(row);
  });
}

function getBackgroundSettings() {
  const type = selectedValue("backgroundType") || "default";

  if (type === "color") {
    return { type, color: backgroundColor.value };
  }

  if (type === "gradient") {
    return {
      type,
      from: gradientFrom.value,
      to: gradientTo.value,
      direction: gradientDirection.value
    };
  }

  if (type === "image") {
    return { type, imageUrl: backgroundImageUrl.value.trim() };
  }

  return { type: "default" };
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 1800);
}

showAddLink.addEventListener("click", () => {
  addLinkForm.hidden = false;
  showAddLink.hidden = true;
  linkLabel.focus();
});

cancelAddLink.addEventListener("click", () => {
  addLinkForm.hidden = true;
  showAddLink.hidden = false;
  linkLabel.value = "";
  linkUrl.value = "";
  linkError.textContent = "";
});

confirmAddLink.addEventListener("click", () => {
  const label = linkLabel.value.trim();
  const url = linkUrl.value.trim();

  if (!label || !isValidHttpUrl(url)) {
    linkError.textContent = "Enter a label and a valid HTTP or HTTPS URL.";
    return;
  }

  quickLinks.push({ label, url: new URL(url).href });
  renderQuickLinks();
  cancelAddLink.click();
});

document.querySelectorAll('input[name="mode"], input[name="backgroundType"]')
  .forEach((input) => input.addEventListener("change", updateConditionalControls));

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const mode = selectedValue("mode") || "dashboard";
  const customUrlValue = customUrl.value.trim();
  const background = getBackgroundSettings();

  if (mode === "custom" && !isValidHttpUrl(customUrlValue)) {
    customUrl.focus();
    showToast("Enter a valid custom URL");
    return;
  }

  if (background.type === "image" &&
      background.imageUrl &&
      !isValidHttpUrl(background.imageUrl)) {
    backgroundImageUrl.focus();
    showToast("Enter a valid image URL");
    return;
  }

  await chrome.storage.sync.set({
    userName: userName.value.trim() || "friend",
    defaultEngine: defaultEngine.value,
    quickLinks,
    mode,
    customUrl: customUrlValue,
    background
  });

  showToast("Saved!");
});

async function initialize() {
  const settings = await chrome.storage.sync.get({
    userName: "friend",
    defaultEngine: "google",
    quickLinks: DEFAULT_LINKS,
    mode: "dashboard",
    customUrl: "",
    background: { type: "default" }
  });

  userName.value = settings.userName;
  defaultEngine.value = settings.defaultEngine;
  quickLinks = Array.isArray(settings.quickLinks)
    ? settings.quickLinks
    : DEFAULT_LINKS;
  customUrl.value = settings.customUrl || "";

  setSelectedValue("mode", settings.mode || "dashboard");
  setSelectedValue("backgroundType", settings.background?.type || "default");

  backgroundColor.value = settings.background?.color || "#0d0d0f";
  gradientFrom.value = settings.background?.from || "#0d0d0f";
  gradientTo.value = settings.background?.to || "#17243a";
  gradientDirection.value = settings.background?.direction || "135deg";
  backgroundImageUrl.value = settings.background?.imageUrl || "";

  renderQuickLinks();
  updateConditionalControls();
}

initialize();
