interface TitleAliasController {
  alias: string;
  originalTitle: string;
  lastNativeTitle: string;
  observer: MutationObserver;
}

const CONTROLLER_KEY = "__metallicTabAliasControllerV1";

/**
 * This function is passed directly to chrome.scripting.executeScript(). Keep it
 * self-contained: Chrome serializes the function body without module scope.
 */
export function installTitleAlias(alias: string): { alias: string; originalTitle: string } {
  const key = "__metallicTabAliasControllerV1";
  const root = globalThis as typeof globalThis & Record<string, unknown>;
  const previous = root[key] as TitleAliasController | undefined;
  previous?.observer.disconnect();

  const originalTitle = previous?.originalTitle || document.title || alias;
  const controller: TitleAliasController = {
    alias,
    originalTitle,
    lastNativeTitle: previous?.lastNativeTitle || originalTitle,
    observer: new MutationObserver(() => {
      const current = document.title;
      if (current && current !== controller.alias) {
        controller.lastNativeTitle = current;
        document.title = controller.alias;
      }
    })
  };

  root[key] = controller;
  controller.observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true
  });
  document.title = alias;
  return { alias, originalTitle };
}

/** Keep this self-contained for chrome.scripting.executeScript(). */
export function resetTitleAlias(): { restoredTitle: string } {
  const key = "__metallicTabAliasControllerV1";
  const root = globalThis as typeof globalThis & Record<string, unknown>;
  const controller = root[key] as TitleAliasController | undefined;
  if (!controller) return { restoredTitle: document.title };

  controller.observer.disconnect();
  const restoredTitle = controller.lastNativeTitle || controller.originalTitle || document.title;
  delete root[key];
  document.title = restoredTitle;
  return { restoredTitle };
}

export function hasInstalledTitleAlias(): boolean {
  const root = globalThis as typeof globalThis & Record<string, unknown>;
  return Boolean(root[CONTROLLER_KEY]);
}
