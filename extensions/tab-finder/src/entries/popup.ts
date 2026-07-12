import { activateThenFocus } from "../core/tab-activation";
import {
  aliasForTab,
  aliasMapsEqual,
  createAliasRecord,
  normalizeAliasMap,
  pruneAliases,
  TAB_ALIAS_MAX_LENGTH,
  TAB_ALIAS_STORAGE_KEY,
  type TabAliasMap,
  withAlias,
  withoutAlias
} from "../core/tab-alias";
import {
  domainForUrl,
  duplicateCounts,
  normalizedUrlForDuplicate,
  searchTabs,
  type TabCandidate,
  type TabSearchResult
} from "../core/tab-search";
import { installTitleAlias, resetTitleAlias } from "../core/title-alias";

type GroupMode = "window" | "domain";

interface PopupState {
  tabs: TabCandidate[];
  results: TabSearchResult[];
  displayResults: TabSearchResult[];
  groupMode: GroupMode;
  duplicatesOnly: boolean;
  selectedIndex: number;
  windowLabels: Map<number, string>;
  duplicateCounts: Map<string, number>;
  aliases: TabAliasMap;
  invokedTabId?: number;
  aliasDialogTabId?: number;
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
  duplicateOnly: requiredElement<HTMLButtonElement>("duplicateOnly"),
  duplicateCount: requiredElement<HTMLElement>("duplicateCount"),
  rename: requiredElement<HTMLButtonElement>("renameButton"),
  refresh: requiredElement<HTMLButtonElement>("refreshButton"),
  aliasDialog: requiredElement<HTMLDialogElement>("aliasDialog"),
  aliasForm: requiredElement<HTMLFormElement>("aliasForm"),
  aliasInput: requiredElement<HTMLInputElement>("aliasInput"),
  aliasNativeTitle: requiredElement<HTMLElement>("aliasNativeTitle"),
  aliasCapability: requiredElement<HTMLElement>("aliasCapability"),
  aliasCancel: requiredElement<HTMLButtonElement>("aliasCancel"),
  aliasReset: requiredElement<HTMLButtonElement>("aliasReset")
};

elements.aliasInput.maxLength = TAB_ALIAS_MAX_LENGTH;

const state: PopupState = {
  tabs: [],
  results: [],
  displayResults: [],
  groupMode: "window",
  duplicatesOnly: false,
  selectedIndex: 0,
  windowLabels: new Map(),
  duplicateCounts: new Map(),
  aliases: {}
};

let refreshTimer: number | undefined;
let feedbackTimer: number | undefined;
let loadGeneration = 0;

function selectedTab(): TabCandidate | undefined {
  return state.displayResults[state.selectedIndex]?.tab;
}

function groupLabel(result: TabSearchResult): string {
  return state.groupMode === "domain"
    ? result.tab.domain
    : state.windowLabels.get(result.tab.windowId) || `Window ${result.tab.windowId}`;
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
  button.id = `tab-result-${tab.id}`;
  button.className = "tab-row";
  button.dataset.resultIndex = String(resultIndex);
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", String(resultIndex === state.selectedIndex));
  button.title = tab.alias
    ? `${tab.alias}\nOriginal: ${tab.title}\n${tab.url}`
    : tab.url;

  const copy = document.createElement("span");
  copy.className = "tab-copy";

  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tab.alias || tab.title;

  const metadata = document.createElement("span");
  metadata.className = "tab-meta";
  if (tab.alias) {
    const nativeTitle = document.createElement("span");
    nativeTitle.className = "tab-native-title";
    nativeTitle.textContent = tab.title;
    metadata.append(nativeTitle);
  }

  const domain = document.createElement("span");
  domain.className = "tab-domain";
  domain.textContent = tab.domain;
  metadata.append(domain);
  copy.append(title, metadata);

  const statuses = document.createElement("span");
  statuses.className = "status-stack";
  if (tab.alias) {
    statuses.append(createStatusChip(
      tab.aliasApplied ? "Alias" : "Alias only",
      tab.aliasApplied ? "alias" : "alias-only",
      tab.aliasApplied
        ? "The browser-visible page title is locked to this alias."
        : "This alias is searchable in Tab Finder. Switch to the tab and reopen Tab Finder to apply it visibly."
    ));
  }
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
  let activeId = "";
  const rows = elements.results.querySelectorAll<HTMLButtonElement>(".tab-row");
  rows.forEach((row) => {
    const selected = Number(row.dataset.resultIndex) === state.selectedIndex;
    row.classList.toggle("is-selected", selected);
    row.setAttribute("aria-selected", String(selected));
    if (selected) {
      activeId = row.id;
      if (scrollIntoView) row.scrollIntoView({ block: "nearest" });
    }
  });

  elements.rename.disabled = !selectedTab();
  if (activeId) elements.search.setAttribute("aria-activedescendant", activeId);
  else elements.search.removeAttribute("aria-activedescendant");
}

function duplicateExcessCount(): number {
  let count = 0;
  for (const value of state.duplicateCounts.values()) count += Math.max(0, value - 1);
  return count;
}

function duplicateTabCount(): number {
  return state.tabs.filter((tab) =>
    (state.duplicateCounts.get(normalizedUrlForDuplicate(tab.url)) || 0) > 1
  ).length;
}

function renderDuplicateControl(): void {
  const count = duplicateTabCount();
  elements.duplicateCount.textContent = String(count);
  elements.duplicateOnly.classList.toggle("is-active", state.duplicatesOnly);
  elements.duplicateOnly.setAttribute("aria-pressed", String(state.duplicatesOnly));
  elements.duplicateOnly.title = count
    ? `Show only ${count} tabs with duplicate URLs (Alt+D)`
    : "No duplicate URLs are currently open";
}

function renderSummary(): void {
  const windowCount = state.windowLabels.size;
  const duplicateCount = duplicateExcessCount();
  const aliasCount = state.tabs.filter((tab) => Boolean(tab.alias)).length;
  const filterLabel = state.duplicatesOnly ? " · duplicates only" : "";
  elements.windowBadge.textContent = `${windowCount} window${windowCount === 1 ? "" : "s"}`;
  elements.summary.textContent = `${state.results.length} of ${state.tabs.length} tabs · ${aliasCount} alias${aliasCount === 1 ? "" : "es"} · ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}${filterLabel}`;
}

function showFeedback(message: string, error = false): void {
  if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
  elements.summary.textContent = message;
  elements.summary.classList.toggle("is-error", error);
  feedbackTimer = window.setTimeout(() => {
    elements.summary.classList.remove("is-error");
    renderSummary();
    feedbackTimer = undefined;
  }, 2800);
}

function renderEmptyState(): void {
  const heading = elements.empty.querySelector("strong");
  const copy = elements.empty.querySelector("p");
  if (!heading || !copy) return;

  if (state.duplicatesOnly && elements.search.value.trim()) {
    heading.textContent = "No matching duplicates";
    copy.textContent = "Clear the query or turn off the duplicate filter.";
  } else if (state.duplicatesOnly) {
    heading.textContent = "No duplicate tabs";
    copy.textContent = "No equivalent URLs are open more than once.";
  } else {
    heading.textContent = "No matching tabs";
    copy.textContent = "Try an alias, title, domain, or shorter fuzzy search.";
  }
}

function groupedResults(): Map<string, TabSearchResult[]> {
  const groups = new Map<string, TabSearchResult[]>();
  for (const result of state.results) {
    const label = groupLabel(result);
    const group = groups.get(label) || [];
    group.push(result);
    groups.set(label, group);
  }
  return groups;
}

function render(preferredTabId?: number): void {
  const ranked = searchTabs(state.tabs, elements.search.value);
  state.results = state.duplicatesOnly
    ? ranked.filter((result) =>
      (state.duplicateCounts.get(normalizedUrlForDuplicate(result.tab.url)) || 0) > 1
    )
    : ranked;

  const groups = groupedResults();
  state.displayResults = [...groups.values()].flat();

  if (preferredTabId !== undefined) {
    const preferredIndex = state.displayResults.findIndex((result) => result.tab.id === preferredTabId);
    if (preferredIndex >= 0) state.selectedIndex = preferredIndex;
  }

  state.selectedIndex = state.displayResults.length
    ? Math.max(0, Math.min(state.selectedIndex, state.displayResults.length - 1))
    : -1;

  elements.results.replaceChildren();
  elements.empty.hidden = state.displayResults.length > 0;
  elements.results.hidden = state.displayResults.length === 0;

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

  renderDuplicateControl();
  renderSummary();
  renderEmptyState();
  renderSelection(false);
}

async function activateTab(tab: TabCandidate): Promise<void> {
  try {
    await activateThenFocus(
      {
        activateTab: async (tabId) => {
          await chrome.tabs.update(tabId, { active: true });
        },
        focusWindow: async (windowId) => {
          await chrome.windows.update(windowId, { focused: true });
        }
      },
      tab
    );
    window.close();
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "The tab could not be activated.", true);
  }
}

function moveSelection(delta: number): void {
  if (!state.displayResults.length) return;
  state.selectedIndex = (state.selectedIndex + delta + state.displayResults.length) % state.displayResults.length;
  renderSelection(true);
}

function jumpSelection(index: number): void {
  if (!state.displayResults.length) return;
  state.selectedIndex = Math.max(0, Math.min(index, state.displayResults.length - 1));
  renderSelection(true);
}

async function setGroupMode(mode: GroupMode): Promise<void> {
  state.groupMode = mode;
  elements.groupWindow.classList.toggle("is-active", mode === "window");
  elements.groupDomain.classList.toggle("is-active", mode === "domain");
  elements.groupWindow.setAttribute("aria-pressed", String(mode === "window"));
  elements.groupDomain.setAttribute("aria-pressed", String(mode === "domain"));
  await chrome.storage.sync.set({ groupMode: mode });
  state.selectedIndex = 0;
  render();
  elements.search.focus({ preventScroll: true });
}

function toggleDuplicatesOnly(): void {
  state.duplicatesOnly = !state.duplicatesOnly;
  state.selectedIndex = 0;
  render();
  elements.search.focus({ preventScroll: true });
}

async function persistAliases(): Promise<void> {
  await chrome.storage.session.set({ [TAB_ALIAS_STORAGE_KEY]: state.aliases });
}

async function loadAliases(): Promise<void> {
  const stored = await chrome.storage.session.get(TAB_ALIAS_STORAGE_KEY);
  state.aliases = normalizeAliasMap(stored[TAB_ALIAS_STORAGE_KEY]);
}

function canApplyVisibleAlias(tab: TabCandidate): boolean {
  return tab.id === state.invokedTabId && tab.active;
}

async function applyVisibleAlias(tab: TabCandidate, alias: string): Promise<boolean> {
  if (!canApplyVisibleAlias(tab)) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: installTitleAlias,
      args: [alias]
    });
    return true;
  } catch {
    return false;
  }
}

async function resetVisibleAlias(tab: TabCandidate): Promise<boolean> {
  if (!canApplyVisibleAlias(tab)) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: resetTitleAlias
    });
    return true;
  } catch {
    return false;
  }
}

function openAliasDialog(tab = selectedTab()): void {
  if (!tab) return;
  state.aliasDialogTabId = tab.id;
  const record = aliasForTab(state.aliases, tab.id);
  elements.aliasInput.value = record?.alias || "";
  elements.aliasNativeTitle.textContent = tab.title;
  elements.aliasReset.hidden = !record;
  elements.aliasCapability.textContent = canApplyVisibleAlias(tab)
    ? "This tab is active. Saving will rename the browser tab and lock the page title for this session."
    : "This tab will receive a searchable Tab Finder alias. Switch to it and reopen Tab Finder to apply the alias visibly.";
  elements.aliasDialog.showModal();
  window.setTimeout(() => {
    elements.aliasInput.focus();
    elements.aliasInput.select();
  }, 0);
}

function closeAliasDialog(): void {
  state.aliasDialogTabId = undefined;
  elements.aliasDialog.close();
  elements.search.focus({ preventScroll: true });
}

function aliasDialogTab(): TabCandidate | undefined {
  return state.tabs.find((tab) => tab.id === state.aliasDialogTabId);
}

async function saveAliasFromDialog(): Promise<void> {
  const tab = aliasDialogTab();
  if (!tab) return;

  try {
    const existing = aliasForTab(state.aliases, tab.id);
    const record = createAliasRecord(tab.id, tab.title, elements.aliasInput.value, Date.now(), existing);
    state.aliases = withAlias(state.aliases, record);
    await persistAliases();
    const applied = await applyVisibleAlias(tab, record.alias);

    const candidate = state.tabs.find((item) => item.id === tab.id);
    if (candidate) {
      candidate.alias = record.alias;
      candidate.aliasApplied = applied;
    }

    closeAliasDialog();
    render(tab.id);
    showFeedback(applied
      ? `Renamed the tab to “${record.alias}”.`
      : `Saved “${record.alias}” as a Tab Finder alias.`, false);
  } catch (error) {
    elements.aliasCapability.textContent = error instanceof Error ? error.message : "Unable to save this alias.";
    elements.aliasCapability.classList.add("is-error");
  }
}

async function resetAliasForTab(tab: TabCandidate): Promise<void> {
  const record = aliasForTab(state.aliases, tab.id);
  if (!record) return;

  state.aliases = withoutAlias(state.aliases, tab.id);
  await persistAliases();
  const restored = await resetVisibleAlias(tab);
  const candidate = state.tabs.find((item) => item.id === tab.id);
  if (candidate) {
    candidate.alias = undefined;
    candidate.aliasApplied = false;
    if (restored) candidate.title = record.originalTitle;
  }

  if (elements.aliasDialog.open) closeAliasDialog();
  render(tab.id);
  showFeedback(restored ? "Restored the page title." : "Removed the Tab Finder alias.");
  if (restored) scheduleReload();
}

async function resetAliasFromDialog(): Promise<void> {
  const tab = aliasDialogTab();
  if (tab) await resetAliasForTab(tab);
}

async function loadTabs(preserveSelection = false, quiet = false): Promise<void> {
  const generation = ++loadGeneration;
  const selectedTabId = preserveSelection
    ? state.displayResults[state.selectedIndex]?.tab.id
    : undefined;

  elements.refresh.disabled = true;
  if (!quiet) elements.summary.textContent = "Reading open Chrome windows…";

  try {
    const browserWindows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    if (generation !== loadGeneration) return;

    const tabs: TabCandidate[] = [];
    const labels = new Map<number, string>();

    let ordinal = 1;
    for (const browserWindow of browserWindows) {
      if (typeof browserWindow.id !== "number") continue;
      labels.set(browserWindow.id, `Window ${ordinal}${browserWindow.focused ? " · Current" : ""}`);
      ordinal += 1;

      for (const tab of browserWindow.tabs || []) {
        if (typeof tab.id !== "number" || typeof tab.windowId !== "number") continue;
        const url = tab.url || "";
        const domain = domainForUrl(url);
        const chromeTitle = tab.title?.trim() || domain || "Untitled tab";
        const alias = aliasForTab(state.aliases, tab.id);
        const aliasApplied = Boolean(alias && chromeTitle === alias.alias);
        const nativeTitle = aliasApplied && alias ? alias.originalTitle : chromeTitle;

        tabs.push({
          id: tab.id,
          windowId: tab.windowId,
          index: tab.index,
          title: nativeTitle,
          alias: alias?.alias,
          aliasApplied,
          url,
          domain,
          favIconUrl: tab.favIconUrl || undefined,
          active: tab.active,
          pinned: tab.pinned,
          audible: tab.audible || false,
          discarded: tab.discarded || false,
          lastAccessed: tab.lastAccessed
        });
      }
    }

    const pruned = pruneAliases(state.aliases, tabs.map((tab) => tab.id));
    if (!aliasMapsEqual(pruned, state.aliases)) {
      state.aliases = pruned;
      await persistAliases();
    }

    state.tabs = tabs;
    state.windowLabels = labels;
    state.duplicateCounts = duplicateCounts(state.tabs);
    if (!preserveSelection) state.selectedIndex = 0;
    render(selectedTabId);
  } catch (error) {
    if (generation !== loadGeneration) return;
    state.tabs = [];
    state.results = [];
    state.displayResults = [];
    elements.results.replaceChildren();
    elements.results.hidden = true;
    elements.empty.hidden = false;
    const heading = elements.empty.querySelector("strong");
    const copy = elements.empty.querySelector("p");
    if (heading) heading.textContent = "Unable to read tabs";
    if (copy) copy.textContent = error instanceof Error ? error.message : "Chrome did not return the current tab list.";
    elements.summary.textContent = "Tab loading failed.";
  } finally {
    if (generation === loadGeneration) elements.refresh.disabled = false;
  }
}

function scheduleReload(): void {
  if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = undefined;
    void loadTabs(true, true);
  }, 120);
}

function bindChromeEvents(): void {
  chrome.tabs.onCreated.addListener(scheduleReload);
  chrome.tabs.onRemoved.addListener(scheduleReload);
  chrome.tabs.onUpdated.addListener(scheduleReload);
  chrome.tabs.onMoved.addListener(scheduleReload);
  chrome.tabs.onAttached.addListener(scheduleReload);
  chrome.tabs.onDetached.addListener(scheduleReload);
  chrome.tabs.onActivated.addListener(scheduleReload);
  chrome.tabs.onReplaced.addListener(scheduleReload);
  chrome.windows.onCreated.addListener(scheduleReload);
  chrome.windows.onRemoved.addListener(scheduleReload);
  chrome.windows.onFocusChanged.addListener(scheduleReload);
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
    } else if (event.key === "PageDown") {
      event.preventDefault();
      moveSelection(8);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      moveSelection(-8);
    } else if (event.key === "Home") {
      event.preventDefault();
      jumpSelection(0);
    } else if (event.key === "End") {
      event.preventDefault();
      jumpSelection(state.displayResults.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = selectedTab();
      if (selected) void activateTab(selected);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (elements.search.value) {
        elements.search.value = "";
        state.selectedIndex = 0;
        render();
      } else if (state.duplicatesOnly) {
        state.duplicatesOnly = false;
        state.selectedIndex = 0;
        render();
      } else {
        window.close();
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (elements.aliasDialog.open) return;
    if (event.key === "F2") {
      event.preventDefault();
      const tab = selectedTab();
      if (!tab) return;
      if (event.shiftKey) void resetAliasForTab(tab);
      else openAliasDialog(tab);
    } else if (event.altKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      toggleDuplicatesOnly();
    } else if (event.key === "/" && document.activeElement !== elements.search) {
      event.preventDefault();
      elements.search.focus();
    }
  });

  elements.groupWindow.addEventListener("click", () => void setGroupMode("window"));
  elements.groupDomain.addEventListener("click", () => void setGroupMode("domain"));
  elements.duplicateOnly.addEventListener("click", toggleDuplicatesOnly);
  elements.rename.addEventListener("click", () => openAliasDialog());
  elements.refresh.addEventListener("click", () => void loadTabs(true));

  elements.aliasForm.addEventListener("submit", (event) => {
    event.preventDefault();
    elements.aliasCapability.classList.remove("is-error");
    void saveAliasFromDialog();
  });
  elements.aliasCancel.addEventListener("click", closeAliasDialog);
  elements.aliasReset.addEventListener("click", () => void resetAliasFromDialog());
  elements.aliasDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeAliasDialog();
  });
}

async function start(): Promise<void> {
  bindEvents();
  bindChromeEvents();

  const [invokedTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.invokedTabId = typeof invokedTab?.id === "number" ? invokedTab.id : undefined;

  const stored = await chrome.storage.sync.get({ groupMode: "window" });
  state.groupMode = stored.groupMode === "domain" ? "domain" : "window";
  elements.groupWindow.classList.toggle("is-active", state.groupMode === "window");
  elements.groupDomain.classList.toggle("is-active", state.groupMode === "domain");
  elements.groupWindow.setAttribute("aria-pressed", String(state.groupMode === "window"));
  elements.groupDomain.setAttribute("aria-pressed", String(state.groupMode === "domain"));

  await loadAliases();
  await loadTabs();

  const invocationTab = state.tabs.find((tab) => tab.id === state.invokedTabId);
  if (invocationTab?.alias && !invocationTab.aliasApplied) {
    const applied = await applyVisibleAlias(invocationTab, invocationTab.alias);
    if (applied) {
      invocationTab.aliasApplied = true;
      render(invocationTab.id);
    }
  }

  elements.search.focus();
}

void start();
