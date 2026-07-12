export interface SidePanelLifecycle {
  setPanelBehavior?: (options: { openPanelOnActionClick: boolean }) => Promise<void> | void;
}

export type BackgroundErrorReporter = (context: string, error: unknown) => void;

export async function initializeBackground(
  ensureState: () => Promise<unknown>,
  sidePanel: SidePanelLifecycle | undefined
): Promise<void> {
  await ensureState();
  await sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });
}

export async function runBackgroundTask(
  context: string,
  task: () => Promise<unknown>,
  report: BackgroundErrorReporter
): Promise<void> {
  try {
    await task();
  } catch (error) {
    report(context, error);
  }
}
