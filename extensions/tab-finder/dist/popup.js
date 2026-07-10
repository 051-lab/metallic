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
    }
    catch {
        return "Other";
    }
}
function subsequenceScore(value, token) {
    let tokenIndex = 0;
    let firstMatch = -1;
    let lastMatch = -1;
    for (let index = 0; index < value.length && tokenIndex < token.length; index += 1) {
        if (value[index] === token[tokenIndex]) {
            if (firstMatch === -1)
                firstMatch = index;
            lastMatch = index;
            tokenIndex += 1;
        }
    }
    if (tokenIndex !== token.length || firstMatch === -1)
        return 0;
    const span = Math.max(token.length, lastMatch - firstMatch + 1);
    return Math.max(4, 24 - (span - token.length) - Math.min(firstMatch, 10));
}
function scoreField(rawValue, token, weight) {
    const value = normalize(rawValue);
    if (!value)
        return 0;
    if (value === token)
        return 100 + weight;
    if (value.startsWith(token))
        return 75 + weight;
    const position = value.indexOf(token);
    if (position >= 0)
        return Math.max(35, 62 - Math.min(position, 27)) + weight;
    const fuzzy = subsequenceScore(value, token);
    return fuzzy ? fuzzy + Math.floor(weight / 3) : 0;
}
function recencyBoost(lastAccessed, now = Date.now()) {
    if (!lastAccessed || !Number.isFinite(lastAccessed))
        return 0;
    const age = Math.max(0, now - lastAccessed);
    if (age <= 5 * 60_000)
        return 24;
    if (age <= 60 * 60_000)
        return 18;
    if (age <= 24 * 60 * 60_000)
        return 12;
    if (age <= 7 * 24 * 60 * 60_000)
        return 6;
    return 0;
}
function scoreTab(tab, query, now = Date.now()) {
    const tokens = normalize(query).split(" ").filter(Boolean);
    const recent = recencyBoost(tab.lastAccessed, now);
    if (!tokens.length) {
        return (tab.active ? 40 : 0) + (tab.pinned ? 4 : 0) + recent;
    }
    let score = 0;
    for (const token of tokens) {
        const tokenScore = Math.max(scoreField(tab.title, token, 18), scoreField(tab.domain, token, 24), scoreField(tab.url, token, 4));
        if (!tokenScore)
            return Number.NEGATIVE_INFINITY;
        score += tokenScore;
    }
    if (tab.active)
        score += 5;
    if (tab.pinned)
        score += 2;
    score += Math.min(6, Math.floor(recent / 4));
    return score;
}
function searchTabs(tabs, query, now = Date.now()) {
    const normalizedQuery = normalize(query);
    return tabs
        .map((tab) => ({ tab, score: scoreTab(tab, normalizedQuery, now) }))
        .filter((result) => Number.isFinite(result.score))
        .sort((left, right) => {
        if (right.score !== left.score)
            return right.score - left.score;
        if (left.tab.windowId !== right.tab.windowId)
            return left.tab.windowId - right.tab.windowId;
        return left.tab.index - right.tab.index;
    });
}
function normalizedUrlForDuplicate(value) {
    try {
        const url = new URL(value);
        url.hash = "";
        if (url.pathname !== "/")
            url.pathname = url.pathname.replace(/\/$/, "");
        return url.toString();
    }
    catch {
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
    if (!element)
        throw new Error(`Missing popup element: ${id}`);
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
    duplicateOnly: requiredElement("duplicateOnly"),
    duplicateCount: requiredElement("duplicateCount"),
    refresh: requiredElement("refreshButton")
};
const state = {
    tabs: [],
    results: [],
    displayResults: [],
    groupMode: "window",
    duplicatesOnly: false,
    selectedIndex: 0,
    windowLabels: new Map(),
    duplicateCounts: new Map()
};
let refreshTimer;
let loadGeneration = 0;
function groupLabel(result) {
    return state.groupMode === "domain"
        ? result.tab.domain
        : state.windowLabels.get(result.tab.windowId) || `Window ${result.tab.windowId}`;
}
function createStatusChip(label, className = "", title = "") {
    const chip = document.createElement("span");
    chip.className = `status-chip ${className}`.trim();
    chip.textContent = label;
    if (title)
        chip.title = title;
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
    button.id = `tab-result-${tab.id}`;
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
    if (tab.active)
        statuses.append(createStatusChip("Active", "active"));
    if (tab.pinned)
        statuses.append(createStatusChip("Pin", "", "Pinned tab"));
    if (tab.audible)
        statuses.append(createStatusChip("Audio", "audio", "Playing audio"));
    if (tab.discarded)
        statuses.append(createStatusChip("Sleep", "sleeping", "Discarded to save memory"));
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
    let activeId = "";
    const rows = elements.results.querySelectorAll(".tab-row");
    rows.forEach((row) => {
        const selected = Number(row.dataset.resultIndex) === state.selectedIndex;
        row.classList.toggle("is-selected", selected);
        row.setAttribute("aria-selected", String(selected));
        if (selected) {
            activeId = row.id;
            if (scrollIntoView)
                row.scrollIntoView({ block: "nearest" });
        }
    });
    if (activeId)
        elements.search.setAttribute("aria-activedescendant", activeId);
    else
        elements.search.removeAttribute("aria-activedescendant");
}
function duplicateExcessCount() {
    let count = 0;
    for (const value of state.duplicateCounts.values())
        count += Math.max(0, value - 1);
    return count;
}
function duplicateTabCount() {
    return state.tabs.filter((tab) => (state.duplicateCounts.get(normalizedUrlForDuplicate(tab.url)) || 0) > 1).length;
}
function renderDuplicateControl() {
    const count = duplicateTabCount();
    elements.duplicateCount.textContent = String(count);
    elements.duplicateOnly.classList.toggle("is-active", state.duplicatesOnly);
    elements.duplicateOnly.setAttribute("aria-pressed", String(state.duplicatesOnly));
    elements.duplicateOnly.title = count
        ? `Show only ${count} tabs with duplicate URLs (Alt+D)`
        : "No duplicate URLs are currently open";
}
function renderSummary() {
    const windowCount = state.windowLabels.size;
    const duplicateCount = duplicateExcessCount();
    const filterLabel = state.duplicatesOnly ? " · duplicates only" : "";
    elements.windowBadge.textContent = `${windowCount} window${windowCount === 1 ? "" : "s"}`;
    elements.summary.textContent = `${state.results.length} of ${state.tabs.length} tabs · ${windowCount} window${windowCount === 1 ? "" : "s"} · ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}${filterLabel}`;
}
function renderEmptyState() {
    const heading = elements.empty.querySelector("strong");
    const copy = elements.empty.querySelector("p");
    if (!heading || !copy)
        return;
    if (state.duplicatesOnly && elements.search.value.trim()) {
        heading.textContent = "No matching duplicates";
        copy.textContent = "Clear the query or turn off the duplicate filter.";
    }
    else if (state.duplicatesOnly) {
        heading.textContent = "No duplicate tabs";
        copy.textContent = "No equivalent URLs are open more than once.";
    }
    else {
        heading.textContent = "No matching tabs";
        copy.textContent = "Try a title, domain, or a shorter fuzzy search.";
    }
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
function render(preferredTabId) {
    const ranked = searchTabs(state.tabs, elements.search.value);
    state.results = state.duplicatesOnly
        ? ranked.filter((result) => (state.duplicateCounts.get(normalizedUrlForDuplicate(result.tab.url)) || 0) > 1)
        : ranked;
    const groups = groupedResults();
    state.displayResults = [...groups.values()].flat();
    if (preferredTabId !== undefined) {
        const preferredIndex = state.displayResults.findIndex((result) => result.tab.id === preferredTabId);
        if (preferredIndex >= 0)
            state.selectedIndex = preferredIndex;
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
async function activateTab(tab) {
    try {
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tab.id, { active: true });
        window.close();
    }
    catch (error) {
        elements.summary.textContent = error instanceof Error ? error.message : "The tab could not be activated.";
    }
}
function moveSelection(delta) {
    if (!state.displayResults.length)
        return;
    state.selectedIndex = (state.selectedIndex + delta + state.displayResults.length) % state.displayResults.length;
    renderSelection(true);
}
function jumpSelection(index) {
    if (!state.displayResults.length)
        return;
    state.selectedIndex = Math.max(0, Math.min(index, state.displayResults.length - 1));
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
    elements.search.focus({ preventScroll: true });
}
function toggleDuplicatesOnly() {
    state.duplicatesOnly = !state.duplicatesOnly;
    state.selectedIndex = 0;
    render();
    elements.search.focus({ preventScroll: true });
}
async function loadTabs(preserveSelection = false, quiet = false) {
    const generation = ++loadGeneration;
    const selectedTabId = preserveSelection
        ? state.displayResults[state.selectedIndex]?.tab.id
        : undefined;
    elements.refresh.disabled = true;
    if (!quiet)
        elements.summary.textContent = "Reading open Chrome windows…";
    try {
        const browserWindows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
        if (generation !== loadGeneration)
            return;
        const tabs = [];
        const labels = new Map();
        let ordinal = 1;
        for (const browserWindow of browserWindows) {
            if (typeof browserWindow.id !== "number")
                continue;
            labels.set(browserWindow.id, `Window ${ordinal}${browserWindow.focused ? " · Current" : ""}`);
            ordinal += 1;
            for (const tab of browserWindow.tabs || []) {
                if (typeof tab.id !== "number" || typeof tab.windowId !== "number")
                    continue;
                const url = tab.url || "";
                const domain = domainForUrl(url);
                tabs.push({
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
                    discarded: tab.discarded || false,
                    lastAccessed: tab.lastAccessed
                });
            }
        }
        state.tabs = tabs;
        state.windowLabels = labels;
        state.duplicateCounts = duplicateCounts(state.tabs);
        if (!preserveSelection)
            state.selectedIndex = 0;
        render(selectedTabId);
    }
    catch (error) {
        if (generation !== loadGeneration)
            return;
        state.tabs = [];
        state.results = [];
        state.displayResults = [];
        elements.results.replaceChildren();
        elements.results.hidden = true;
        elements.empty.hidden = false;
        const heading = elements.empty.querySelector("strong");
        const copy = elements.empty.querySelector("p");
        if (heading)
            heading.textContent = "Unable to read tabs";
        if (copy)
            copy.textContent = error instanceof Error ? error.message : "Chrome did not return the current tab list.";
        elements.summary.textContent = "Tab loading failed.";
    }
    finally {
        if (generation === loadGeneration)
            elements.refresh.disabled = false;
    }
}
function scheduleReload() {
    if (refreshTimer !== undefined)
        window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        void loadTabs(true, true);
    }, 120);
}
function bindChromeEvents() {
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
function bindEvents() {
    elements.search.addEventListener("input", () => {
        state.selectedIndex = 0;
        render();
    });
    elements.search.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            moveSelection(1);
        }
        else if (event.key === "ArrowUp") {
            event.preventDefault();
            moveSelection(-1);
        }
        else if (event.key === "PageDown") {
            event.preventDefault();
            moveSelection(8);
        }
        else if (event.key === "PageUp") {
            event.preventDefault();
            moveSelection(-8);
        }
        else if (event.key === "Home") {
            event.preventDefault();
            jumpSelection(0);
        }
        else if (event.key === "End") {
            event.preventDefault();
            jumpSelection(state.displayResults.length - 1);
        }
        else if (event.key === "Enter") {
            event.preventDefault();
            const selected = state.displayResults[state.selectedIndex];
            if (selected)
                void activateTab(selected.tab);
        }
        else if (event.key === "Escape") {
            event.preventDefault();
            if (elements.search.value) {
                elements.search.value = "";
                state.selectedIndex = 0;
                render();
            }
            else if (state.duplicatesOnly) {
                state.duplicatesOnly = false;
                state.selectedIndex = 0;
                render();
            }
            else {
                window.close();
            }
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.altKey && event.key.toLowerCase() === "d") {
            event.preventDefault();
            toggleDuplicatesOnly();
        }
        else if (event.key === "/" && document.activeElement !== elements.search) {
            event.preventDefault();
            elements.search.focus();
        }
    });
    elements.groupWindow.addEventListener("click", () => void setGroupMode("window"));
    elements.groupDomain.addEventListener("click", () => void setGroupMode("domain"));
    elements.duplicateOnly.addEventListener("click", toggleDuplicatesOnly);
    elements.refresh.addEventListener("click", () => void loadTabs(true));
}
async function start() {
    bindEvents();
    bindChromeEvents();
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
