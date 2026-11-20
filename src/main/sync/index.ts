// Electron glue for sync (Decision 51): start at launch, Settings › Sync over
// IPC, status pushed to every window, and the port `krnl sync` uses.

import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { SyncService, type SecretBox } from './service';
import type { SyncPort } from '../../shared/sync/port';

let service: SyncService | null = null;

/** The running sync service, for SysFacade (krnl sync …). Undefined before init. */
export function getSync(): SyncPort | undefined {
  return service ?? undefined;
}

const secrets: SecretBox = {
  available: () => safeStorage.isEncryptionAvailable(),
  seal: (text) => safeStorage.encryptString(text).toString('base64'),
  open: (sealed) => safeStorage.decryptString(Buffer.from(sealed, 'base64')),
};

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function initSync(deps: {
  boardDir: string;
  notifyBoardChanged: () => void;
  switchToBoard: (id: string) => boolean;
}): SyncService {
  if (service) return service;
  service = new SyncService({
    boardDir: deps.boardDir,
    userDataDir: app.getPath('userData'),
    appVersion: app.getVersion(),
    secrets,
    notifyBoardChanged: deps.notifyBoardChanged,
    switchToBoard: deps.switchToBoard,
    onStatus: (info) => broadcast('sync:status', info),
    log: (m, f) => console.log(`[sync] ${m}`, f ? JSON.stringify(f) : ''),
  });
  const s = service;

  ipcMain.handle('sync:status', () => s.info());
  ipcMain.handle('sync:begin', async (_e, address: unknown) => {
    try { return { ok: true, ...(await s.begin(String(address ?? ''))) }; } catch (err) { return { ok: false, message: message(err) }; }
  });
  ipcMain.handle('sync:finish', async (_e, password: unknown, code: unknown) => {
    try { return { ok: true, info: await s.finish(String(password ?? ''), typeof code === 'string' && code ? code : undefined) }; } catch (err) { return { ok: false, message: message(err) }; }
  });
  ipcMain.handle('sync:disconnect', async () => ({ ok: true, info: await s.disconnect() }));
  ipcMain.handle('sync:retry', async () => ({ ok: true, info: await s.retry() }));
  ipcMain.handle('sync:devices', async () => s.devices());
  // server-updates F1–F6: the server's update state, one click, night updates.
  ipcMain.handle('sync:server', async (_e, check: unknown) => s.serverUpdate(check === true));
  ipcMain.handle('sync:server-update', async (_e, password: unknown, code: unknown) => s.startServerUpdate(String(password ?? ''), typeof code === 'string' && code ? code : undefined));
  ipcMain.handle('sync:server-auto', async (_e, on: unknown, password: unknown, code: unknown) => s.setServerAuto(on === true, String(password ?? ''), typeof code === 'string' && code ? code : undefined));

  s.start();
  app.on('before-quit', () => s.stop());
  return s;
}
