// Electron glue for calendar links (Decision 64, P1): the service with the OS
// keychain, and the two file dialogs of Export / Import .ics. Everything else
// the window asks goes through `krnl cal …` (sys:run), the CLI's own path.

import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import { parkedBoardDirs, readBoardsIndex } from '../persistence/boards';
import { join } from 'path';
import { homedir } from 'os';
import { CalendarLinkService } from './service';
import { setCalendars } from './registry';

export { getCalendars } from './registry';

let service: CalendarLinkService | null = null;

export function initCalendars(deps: { boardPath: () => string; boardDir: () => string; notifyBoardChanged: () => void }): CalendarLinkService {
  if (service) return service;
  service = new CalendarLinkService({
    boardPath: deps.boardPath,
    userDataDir: app.getPath('userData'),
    secrets: {
      available: () => safeStorage.isEncryptionAvailable(),
      seal: (text) => safeStorage.encryptString(text).toString('base64'),
      open: (sealed) => safeStorage.decryptString(Buffer.from(sealed, 'base64')),
    },
    notifyBoardChanged: deps.notifyBoardChanged,
    log: (m) => console.log(`[calendars] ${m}`),
    openBrowser: (url) => shell.openExternal(url),
    otherBoardPaths: () => { try { return parkedBoardDirs(deps.boardDir()).map((d) => join(d, 'board.json')); } catch { return []; } },
    // With several boards, each sends to its own "KRNL0 · Name" calendar.
    boardName: () => {
      try {
        const idx = readBoardsIndex(deps.boardDir());
        return idx.boards.length > 1 ? idx.boards.find((b) => b.id === idx.activeId)?.name ?? null : null;
      } catch { return null; }
    },
  });
  const svc = service;
  setCalendars(svc);

  // Signing in (P2/P4). Passwords travel here, never through `krnl` argv.
  ipcMain.handle('cal:connect', async (_e, kind: unknown, a: unknown, b: unknown, c: unknown) => {
    if (kind === 'apple') return svc.connectApple(String(a ?? ''), String(b ?? ''));
    if (kind === 'caldav') return svc.connectCalDav(String(a ?? ''), String(b ?? ''), String(c ?? ''));
    if (kind === 'google') return svc.connectGoogle();
    return { ok: false, reason: 'unreachable', message: 'unknown account kind' };
  });
  ipcMain.handle('cal:accountCalendars', async (_e, id: unknown) => svc.accountCalendars(String(id ?? '')));
  ipcMain.handle('cal:addAccount', async (_e, id: unknown, show: unknown, send: unknown) =>
    svc.addAccountCalendars(String(id ?? ''), Array.isArray(show) ? show.map(String) : [], send === true));
  ipcMain.handle('cal:accountHelp', async (_e, which: unknown) => {
    // The page where Apple makes app-specific passwords (F6).
    if (which === 'apple') await shell.openExternal('https://account.apple.com/account/manage');
  });

  const parent = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  ipcMain.handle('cal:pickIcs', async () => {
    const win = parent();
    const opts = { title: 'Import a calendar file', properties: ['openFile' as const], filters: [{ name: 'Calendar', extensions: ['ics', 'ical', 'ifb', 'icalendar'] }] };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? null : res.filePaths[0] ?? null;
  });
  ipcMain.handle('cal:saveIcs', async () => {
    const win = parent();
    const opts = { title: 'Export the Calendar', defaultPath: join(app.getPath('documents') || homedir(), 'KRNL0 calendar.ics'), filters: [{ name: 'Calendar', extensions: ['ics'] }] };
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    return res.canceled ? null : res.filePath ?? null;
  });

  service.start();
  return service;
}
