// The main window, by name (Decision 37). With the pocket timer there are two
// BrowserWindows, so "the first window" or "the focused window" may be the
// pocket. Everything that means the app's window — CLI dispatch, second-instance
// focus, window size for placement, update broadcasts — asks here instead.

import type { BrowserWindow } from 'electron';

let main: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  main = win;
  win.on('closed', () => {
    if (main === win) main = null;
  });
}

/** The main window, or null before it opens / after it closes. */
export function getMainWindow(): BrowserWindow | null {
  return main && !main.isDestroyed() ? main : null;
}

/** Restore, show and focus the main window (second launch, pocket "Open"). */
export function revealMainWindow(): void {
  const win = getMainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}
