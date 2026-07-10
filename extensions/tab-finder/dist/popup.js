(() => {
  "use strict";

  function normalize(value) {
    return value.normalize("NFKD").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function domainForUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol === "chrome:" || url.protocol === "chrome-extension:") {
        return url.protocol.slice(0, -1);
      }
      return url.hostname.replace(/^www\./, "") || url.protocol.slice(0, -1) || "Other";
    } catch {
      return "Other";
    }
  }

  function subsequenceScore(value, token) {
    let tokenIndex = 0;
    let firstMatch = -1;
    let lastMatch = -1;
    for (let index = 0; index < value.length && tokenIndex < token.length; index += 1) {
      if (value[index] === token[tokenIndex]) {
        if (firstMatch === -1) firstMatch = index;
        lastMatch = index;
        tokenIndex += 1;
      }
    }
    if (tokenIndex !== token.length || firstMatch === -1) return 0;
    const span = Math.max(token.length, lastMatch - firstMatch + 1);
    return Math.max(4, 24 - (span - token.length) - Math.min(firstMatch, 10));
  }

  function scoreField(rawValue, token, weight) {
    const value = normalize(rawValue);
    if (!value) return 0;
    if (value === token) return 100 + weight;
    if (value.startsWith(token)) return 75 + weight;
    const position = value.indexOf(token);
    if (position >= 0) return Math.max(35, 62 - Math.min(position, 27)) + weight;
    const fuzzy = subsequenceScore(value, token);
    return fuzzy ? fuzzy + Math.floor(weight / 3) : 0;
  }

  function scoreTab(tab, query) {
    const tokens = normalize(query).split(" ").filter(Boolean);
    if (!tokens.length) return 0;
    let score = 0;
    for (const token of tokens) {
      const tokenScore = Math.max(
        scoreField(tab.title, token, 18),
        scoreField(tab.domain, token, 24),
        scoreField(tab.url, token, 4)
      );
      if (!tokenScore) return Number.NEGATIVE_INFINITY;
      score += tokenScore;
    }
    if (tab.active) score += 5;
    if (tab.pinned) score += 2;
    return score;
  }

  function searchTabs(tabs, query) {
    const normalizedQuery = normalize(query);
    return tabs
      .map((tab) => ({ tab, score: scoreTab(tab, normalizedQuery) }))
      .filter((result) => Number.isFinite(result.score))
      .sort((left, right) => {
        if (normalizedQuery && right.score !== left.score) return right.score - left.score;
        if (left.tab.windowId !== right.tab.windowId) return left.tab.windowId - right.tab.windowId;
        return left.tab.index - right.tab.index;
      });
  }

  function normalizedUrlForDuplicate(value) {
    try {
      const url = new URL(value);
      url.hash = "";
      if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
      return url.toString();
    } catch {
      return value.trim();
    }
  }

  function duplicateCounts(tabs) {
    const counts = new Map();
    for (const tab of tabs) {
      const key = normalizedUrlForDuplicate(tab.url);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  function requiredElement(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing popup element: ${id}`);
    return element;
  }

  const elements = {
    search: requiredElement("searchInput"),
    results: requiredElement("results"),
    empty: requiredElement("emptyState"),
    summary: requiredElement("summary"),
    windowBadge: requiredElement("windowBadge"),
    groupWindow: requiredElement("groupWindow"),
    groupDomain: requiredElement("groupDomain"),
    refresh: requiredElement("refreshButton")
  };

  const state = {
    tabs: [],
    results: [],
    displayResults: [],
    groupMode: "window",
    selectedIndex: 0,
    windowLabels: new Map(),
    duplicateCounts: new Map()
  };

  function groupLabel(result) {
    return state.groupMode === "domain"
      ? result.tab.domain
      : state.windowLabels.get(result.tab.windowId) || `Window ${result.tab.windowId}`;
  }

  function createStatusChip(label, className = "", title = "") {
    const chip = document.createElement("span");
    chip.className = `status-chip ${className}`.trim();
    chip.textContent = label;
    if (title) chip.title = title;
    return chip;
  }

  function createFavicon(tab) {
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

  function createTabRow(result, resultIndex) {
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

  function renderSelection(scrollIntoView) {
    const rows = elements.results.querySelectorAll(".tab-row");
    rows.forEach((row) => {
      const selected = Number(row.dataset.resultIndex) === state.selectedIndex;
      row.classList.toggle("is-selected", selected);
      row.setAttribute("aria-selected", String(selected));
      if (selected && scrollIntoView) row.scrollIntoView({ block: "nearest" });
    });
  }

  function duplicateExcessCount() {
    let count = 0;
    for (const value of state.duplicateCounts.values()) count += Math.max(0, value - 1);
    return count;
  }

  function renderSummary() {
    const windowCount = state.windowLabels.size;
    const duplicateCount = duplicateExcessCount();
    elements.windowBadge.textContent = `${windowCount} window${windowCount === 1 ? "" : "s"}`;
    elements.summary.textContent = `${state.results.length} of ${state.tabs.length} tabs · ${windowCount} window${windowCount === 1 ? "" : "s"} · ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}`;
  }

  function groupedResults() {
    const groups = new Map();
    for (const result of state.results) {
      const label = groupLabel(result);
      const group = groups.get(label) || [];
      group.push(result);
      groups.set(label, group);
    }
    return groups;
  }

  function render() {
    state.results = searchTabs(state.tabs, elements.search.value).slice(0, 200);
    const groups = groupedResults();
    state.displayResults = [...groups.values()].flat();
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
    renderSummary();
    renderSelection(false);
  }

  async function activateTab(tab) {
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tab.id, { active: true });
      window.close();
    } catch (error) {
      elements.summary.textContent = error instanceof Error ? error.message : "The tab could not be activated.";
    }
  }

  function moveSelection(delta) {
    if (!state.displayResults.length) return;
    state.selectedIndex = (state.selectedIndex + delta + state.displayResults.length) % state.displayResults.length;
    renderSelection(true);
  }

  async function setGroupMode(mode) {
    state.groupMode = mode;
    elements.groupWindow.classList.toggle("is-active", mode === "window");
    elements.groupDomain.classList.toggle("is-active", mode === "domain");
    elements.groupWindow.setAttribute("aria-pressed", String(mode === "window"));
    elements.groupDomain.setAttribute("aria-pressed", String(mode === "domain"));
    await chrome.storage.sync.set({ groupMode: mode });
    state.selectedIndex = 0;
    render();
  }

  async function loadTabs() {
    elements.refresh.disabled = true;
    elements.summary.textContent = "Reading open Chrome windows…";
    try {
      const browserWindows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
      state.tabs = [];
      state.windowLabels.clear();
      let ordinal = 1;
      for (const browserWindow of browserWindows) {
        if (typeof browserWindow.id !== "number") continue;
        state.windowLabels.set(browserWindow.id, `Window ${ordinal}${browserWindow.focused ? " · Current" : ""}`);
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
      elements.refresh.disabled = false;
    }
  }

  function bindEvents() {
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
        const selected = state.displayResults[state.selectedIndex];
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

  async function start() {
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
})();
