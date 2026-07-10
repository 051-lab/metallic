import {
  domainForUrl,
  duplicateCounts,
  normalizedUrlForDuplicate,
  searchTabs,
  type TabCandidate,
  type TabSearchResult
} from "../core/tab-search";

type GroupMode = "window" | "domain";

interface PopupState {
  tabs: TabCandidate[];
  results: TabSearchResult[];
  groupMode: GroupMode;
  selectedIndex: number;
  windowLabels: Map<number, string>;
  duplicateCounts: Map<string, number>;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element as T;
}

const elements = {
  search: requiredElement<HTMLInputElement>("searchInput"),
  results: requiredElement<HTMLElement>("results"),
  empty: requiredElement<HTMLElement>("emptyState"),
  summary: requiredElement<HTMLElement>("summary"),
  windowBadge: requiredElement<HTMLElement>("windowBadge"),
  groupWindow: requiredElement<HTMLButtonElement>("groupWindow"),
  groupDomain: requiredElement<HTMLButtonElement>("groupDomain"),
  refresh: requiredElement<HTMLButtonElement>("refreshButton")
};

const state: PopupState = {
  tabs: [],
  results: [],
  groupMode: "window",
  selectedIndex: 0,
  windowLabels: new Map(),
  duplicateCounts: new Map()
};

function groupLabel(result: TabSearchResult): string {
  if (state.groupMode === "domain") return result.tab.domain;
  return state.windowLabels.get(result.tab.windowId) || `Window ${result.tab.windowId}`;
}

function createStatusChip(label: string, className = "", title = ""): HTMLElement {
  const chip = document.createElement("span");
  chip.className = `status-chip ${className}`.trim();
  chip.textContent = label;
  if (title) chip.title = title;
  return chip;
}

function createFavicon(tab: TabCandidate): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "favicon-wrap";

  const fallback = document.createElement("span");
  fallback.textContent = tab.domain.slice(0, 1).toUpperCase() || "•";
  wrapper.append(fallback);

  if (tab.favIconUrl) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = tab.favIconUrl;
    image.addEventListener("load", () => fallback.remove(), { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });
    wrapper.prepend(image);
  }

  return wrapper;
}

function createTabRow(result: TabSearchResult, resultIndex: number): HTMLButtonElement {
  const { tab } = result;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tab-row";
  button.dataset.resultIndex = String(resultIndex);
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", String(resultIndex === state.selectedIndex));
  button.title = tab.url;

  const copy = document.createElement("span");
  copy.className = "tab-copy";

  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tab.title;

  const metadata = document.createElement("span");
  metadata.className = "tab-meta";
  const domain = document.createElement("span");
  domain.className = "tab-domain";
  domain.textContent = tab.domain;
  metadata.append(domain);

  copy.append(title, metadata);

  const statuses = document.createElement("span");
  statuses.className = "status-stack";
  if (tab.active) statuses.append(createStatusChip("Active", "active"));
  if (tab.pinned) statuses.append(createStatusChip("Pin", "", "Pinned tab"));
  if (tab.audible) statuses.append(createStatusChip("Audio", "audio", "Playing audio"));
  if (tab.discarded) statuses.append(createStatusChip("Sleep", "sleeping", "Discarded to save memory"));

  const duplicateCount = state.duplicateCounts.get(normalizedUrlForDuplicate(tab.url)) || 0;
  if (duplicateCount > 1) {
    statuses.append(createStatusChip(`${duplicateCount}×`, "duplicate", `${duplicateCount} open copies`));
  }

  button.append(createFavicon(tab), copy, statuses);
  button.addEventListener("mouseenter", () => {
    state.selectedIndex = resultIndex;
    renderSelection(false);
  });
  button.addEventListener("click", () => void activateTab(tab));
  return button;
}

function renderSelection(scrollIntoView: boolean): void {
  const rows = elements.results.querySelectorAll<HTMLButtonElement>(".tab-row");
  rows.forEach((row) => {
    const isSelected = Number(row.dataset.resultIndex) === state.selectedIndex;
    row.classList.toggle("is-selected", isSelected);
    row.setAttribute("aria-selected", String(isSelected));
    if (isSelected && scrollIntoView) row.scrollIntoView({ block: "nearest" });
  });
}

function duplicateExcessCount(): number {
  let count = 0;
  for (const value of state.duplicateCounts.values()) count += Math.max(0, value - 1);
  return count;
}

function renderSummary(): void {
  const windowCount = state.windowLabels.size;
  const duplicateCount = duplicateExcessCount();
  elements.windowBadge.textContent = `${windowCount} window${windowCount === 1 ? "" : "s"}`;
  elements.summary.textContent = `${state.results.length} of ${state.tabs.length} tabs · ${windowCount} window${windowCount === 1 ? "" : "s"} · ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}`;
}

function render(): void {
  state.results = searchTabs(state.tabs, elements.search.value).slice(0, 200);
  state.selectedIndex = state.results.length
    ? Math.max(0, Math.min(state.selectedIndex, state.results.length - 1))
    : -1;

  elements.results.replaceChildren();
  elements.empty.hidden = state.results.length > 0;
  elements.results.hidden = state.results.length === 0;

  const groups = new Map<string, TabSearchResult[]>();
  for (const result of state.results) {
    const label = groupLabel(result);
    const current = groups.get(label) || [];
    current.push(result);
    groups.set(label, current);
  }

  let resultIndex = 0;
  for (const [label, results] of groups) {
    const section = document.createElement("section");
    section.className = "group";

    const heading = document.createElement("h2");
    heading.className = "group-heading";
    const headingLabel = document.createElement("span");
    headingLabel.textContent = label;
    const headingCount = document.createElement("span");
    headingCount.textContent = String(results.length);
    heading.append(headingLabel, headingCount);

    const list = document.createElement("ul");
    list.className = "tab-list";
    for (const result of results) {
      const item = document.createElement("li");
      item.append(createTabRow(result, resultIndex));
      list.append(item);
      resultIndex += 1;
    }

    section.append(heading, list);
    elements.results.append(section);
  }

  renderSummary();
  renderSelection(false);
}

async function activateTab(tab: TabCandidate): Promise<void> {
  try {
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    window.close();
  } catch (error) {
    elements.summary.textContent = error instanceof Error ? error.message : "The tab could not be activated.";
  }
}

function moveSelection(delta: number): void {
  if (!state.results.length) return;
  state.selectedIndex = (state.selectedIndex + delta + state.results.length) % state.results.length;
  renderSelection(true);
}

async function setGroupMode(mode: GroupMode): Promise<void> {
  state.groupMode = mode;
  elements.groupWindow.classList.toggle("is-active", mode === "window");
  elements.groupDomain.classList.toggle("is-active", mode === "domain");
  elements.groupWindow.setAttribute("aria-pressed", String(mode === "window"));
  elements.groupDomain.setAttribute("aria-pressed", String(mode === "domain"));
  await chrome.storage.sync.set({ groupMode: mode });
  render();
}

async function loadTabs(): Promise<void> {
  elements.refresh.disabled = true;
  elements.summary.textContent = "Reading open Chrome windows…";

  try {
    const browserWindows = await chrome.windows.getAll({
      populate: true,
      windowTypes: ["normal"]
    });

    state.tabs = [];
    state.windowLabels.clear();

    let ordinal = 1;
    for (const browserWindow of browserWindows) {
      if (typeof browserWindow.id !== "number") continue;
      state.windowLabels.set(
        browserWindow.id,
        `Window ${ordinal}${browserWindow.focused ? " · Current" : ""}`
      );
      ordinal += 1;

      for (const tab of browserWindow.tabs || []) {
        if (typeof tab.id !== "number" || typeof tab.windowId !== "number") continue;
        const url = tab.url || "";
        const domain = domainForUrl(url);
        state.tabs.push({
          id: tab.id,
          windowId: tab.windowId,
          index: tab.index,
          title: tab.title?.trim() || domain || "Untitled tab",
          url,
          domain,
          favIconUrl: tab.favIconUrl || undefined,
          active: tab.active,
          pinned: tab.pinned,
          audible: tab.audible || false,
          discarded: tab.discarded || false
        });
      }
    }

    state.duplicateCounts = duplicateCounts(state.tabs);
    state.selectedIndex = 0;
    render();
  } catch (error) {
    state.tabs = [];
    state.results = [];
    elements.results.replaceChildren();
    elements.results.hidden = true;
    elements.empty.hidden = false;
    elements.empty.querySelector("strong")!.textContent = "Unable to read tabs";
    elements.empty.querySelector("p")!.textContent = error instanceof Error ? error.message : "Chrome did not return the current tab list.";
    elements.summary.textContent = "Tab loading failed.";
  } finally {
    elements.refresh.disabled = false;
  }
}

function bindEvents(): void {
  elements.search.addEventListener("input", () => {
    state.selectedIndex = 0;
    render();
  });

  elements.search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = state.results[state.selectedIndex];
      if (selected) void activateTab(selected.tab);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (elements.search.value) {
        elements.search.value = "";
        state.selectedIndex = 0;
        render();
      } else {
        window.close();
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== elements.search) {
      event.preventDefault();
      elements.search.focus();
    }
  });

  elements.groupWindow.addEventListener("click", () => void setGroupMode("window"));
  elements.groupDomain.addEventListener("click", () => void setGroupMode("domain"));
  elements.refresh.addEventListener("click", () => void loadTabs());
}

async function start(): Promise<void> {
  bindEvents();
  const stored = await chrome.storage.sync.get({ groupMode: "window" });
  state.groupMode = stored.groupMode === "domain" ? "domain" : "window";
  elements.groupWindow.classList.toggle("is-active", state.groupMode === "window");
  elements.groupDomain.classList.toggle("is-active", state.groupMode === "domain");
  elements.groupWindow.setAttribute("aria-pressed", String(state.groupMode === "window"));
  elements.groupDomain.setAttribute("aria-pressed", String(state.groupMode === "domain"));
  await loadTabs();
  elements.search.focus();
}

void start();
