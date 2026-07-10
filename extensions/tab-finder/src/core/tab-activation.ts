export interface TabActivationTarget {
  id: number;
  windowId: number;
}

export interface TabActivationApi {
  activateTab(tabId: number): Promise<void>;
  focusWindow(windowId: number): Promise<void>;
}

/**
 * Activate the destination tab before focusing its window.
 *
 * Chrome closes an extension popup when another browser window receives focus.
 * If the window is focused first, the popup context can be destroyed before the
 * subsequent tab activation request is dispatched.
 */
export async function activateThenFocus(
  api: TabActivationApi,
  target: TabActivationTarget
): Promise<void> {
  await api.activateTab(target.id);
  await api.focusWindow(target.windowId);
}
