"use strict";
async function activateThenFocus(api, target) {
    await api.activateTab(target.id);
    await api.focusWindow(target.windowId);
}
function tabIdFromRow(row) {
    if (!(row instanceof HTMLElement))
        return undefined;
    const match = /^tab-result-(\d+)$/.exec(row.id);
    if (!match)
        return undefined;
    const tabId = Number(match[1]);
    return Number.isSafeInteger(tabId) ? tabId : undefined;
}
function showActivationError(error) {
    const summary = document.getElementById("summary");
    if (!summary)
        return;
    summary.textContent = error instanceof Error ? error.message : "The tab could not be activated.";
}
async function activateTabId(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (typeof tab.windowId !== "number")
            throw new Error("The selected tab has no browser window.");
        await activateThenFocus({
            activateTab: async (id) => {
                await chrome.tabs.update(id, { active: true });
            },
            focusWindow: async (windowId) => {
                await chrome.windows.update(windowId, { focused: true });
            }
        }, { id: tabId, windowId: tab.windowId });
        window.close();
    }
    catch (error) {
        showActivationError(error);
    }
}
function selectedRow() {
    return document.querySelector(".tab-row.is-selected");
}
document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing)
        return;
    const tabId = tabIdFromRow(selectedRow());
    if (tabId === undefined)
        return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void activateTabId(tabId);
}, true);
document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element))
        return;
    const row = target.closest(".tab-row");
    const tabId = tabIdFromRow(row);
    if (tabId === undefined)
        return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void activateTabId(tabId);
}, true);
