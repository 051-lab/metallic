const SEARCH_ENGINES = {
  google: "https://www.google.com/search?q=",
  bing: "https://www.bing.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  brave: "https://search.brave.com/search?q=",
  perplexity: "https://www.perplexity.ai/search?q="
};

const DEFAULT_LINKS = [
  { label: "GitHub", url: "https://github.com/" },
  { label: "Google", url: "https://www.google.com/" },
  { label: "YouTube", url: "https://www.youtube.com/" },
  { label: "Perplexity", url: "https://www.perplexity.ai/search" },
  { label: "X / Twitter", url: "https://x.com/" }
];

const clock = document.getElementById("clock");
const date = document.getElementById("date");
const greeting = document.getElementById("greeting");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const engineSelect = document.getElementById("engineSelect");
const quickLinks = document.getElementById("quickLinks");
const linkCount = document.getElementById("linkCount");

function safeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function getGreeting(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function updateTime(userName) {
  const now = new Date();
  clock.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);
  date.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(now);
  greeting.textContent = `${getGreeting(now.getHours())}, ${userName}`;
}

function applyBackground(background = { type: "default" }) {
  const layers = [];

  if (background.type === "color" && background.color) {
    document.body.style.background = background.color;
    return;
  }

  if (background.type === "gradient") {
    const from = background.from || "#0d0d0f";
    const to = background.to || "#17243a";
    const direction = background.direction || "135deg";
    document.body.style.background = `linear-gradient(${direction}, ${from}, ${to})`;
    return;
  }

  if (background.type === "image" && safeHttpUrl(background.imageUrl)) {
    const imageUrl = new URL(background.imageUrl).href;
    layers.push("linear-gradient(rgba(8, 9, 12, 0.65), rgba(8, 9, 12, 0.82))");
    layers.push(`url("${imageUrl}")`);
    document.body.style.background = layers.join(", ");
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundAttachment = "fixed";
  }
}

function createQuickLink(link) {
  const url = safeHttpUrl(link.url);
  if (!url) return null;

  const anchor = document.createElement("a");
  const icon = document.createElement("img");
  const label = document.createElement("span");

  anchor.className = "quick-link";
  anchor.href = url.href;
  anchor.title = `${link.label} — ${url.hostname}`;

  icon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=32`;
  icon.alt = "";
  icon.width = 32;
  icon.height = 32;

  label.textContent = link.label || url.hostname;
  anchor.append(icon, label);
  return anchor;
}

function renderQuickLinks(links) {
  quickLinks.replaceChildren();
  const validLinks = links
    .map(createQuickLink)
    .filter(Boolean);

  if (validLinks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-links";
    empty.textContent = "Add quick links in settings to build your launch grid.";
    quickLinks.append(empty);
  } else {
    quickLinks.append(...validLinks);
  }

  linkCount.textContent = `${validLinks.length} saved`;
}

async function initialize() {
  const settings = await chrome.storage.sync.get({
    userName: "friend",
    defaultEngine: "google",
    quickLinks: DEFAULT_LINKS,
    mode: "dashboard",
    customUrl: "",
    background: { type: "default" }
  });

  if (settings.mode === "custom") {
    const customUrl = safeHttpUrl(settings.customUrl);
    if (customUrl) {
      location.replace(customUrl.href);
      return;
    }
  }

  const userName = settings.userName.trim() || "friend";
  engineSelect.value = SEARCH_ENGINES[settings.defaultEngine]
    ? settings.defaultEngine
    : "google";
  applyBackground(settings.background);
  renderQuickLinks(settings.quickLinks);
  updateTime(userName);
  window.setInterval(() => updateTime(userName), 1000);
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  const searchBase = SEARCH_ENGINES[engineSelect.value] || SEARCH_ENGINES.google;
  location.href = `${searchBase}${encodeURIComponent(query)}`;
});

engineSelect.addEventListener("change", () => {
  chrome.storage.sync.set({ defaultEngine: engineSelect.value });
});

initialize();
