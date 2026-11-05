// Main-process wiring for app updates (Decision 36).
//
// Picks the backend for this build, owns the one UpdateService, forwards its
// state to every window (`update:state`) and answers the window's requests
// (`update:get|check|install|open`). The sys CLI reaches the same service
// through getUpdater().

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { UpdateService } from './UpdateService';
import type { UpdateBackend } from './UpdateService';
import { createGithubNotifyBackend, createNsisBackend } from './backends';
import type { FetchLike } from './backends';
import type { CliDispatchFn } from '../../sys/SysFacade';
import type { UpdaterPort } from '../../shared/update';

let service: UpdateService | null = null;

/** The running updater, for SysFacade (krnl update …). Undefined before init. */
export function getUpdater(): UpdaterPort | undefined {
  return service ?? undefined;
}

export interface UpdaterEnv {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
}

export type BackendChoice =
  | { kind: 'disabled'; reason: string }
  | { kind: 'nsis' }
  | { kind: 'github' };

/** Which backend this build uses, or why updates are off (F8). Pure — tested. */
export function chooseBackend({ isPackaged, platform, env }: UpdaterEnv): BackendChoice {
  if (env['KRNL0_DISABLE_UPDATES'] === '1') return { kind: 'disabled', reason: 'turned off by KRNL0_DISABLE_UPDATES' };
  // Explicit opt-in to try the flow against the real releases, any build.
  if (env['KRNL0_UPDATES'] === 'notify') return { kind: 'github' };
  if (!isPackaged) return { kind: 'disabled', reason: 'development build' };
  // An isolated data folder means a test / worktree run (AGENTS.md rule 10).
  if (env['KRNL0_USER_DATA']) return { kind: 'disabled', reason: 'isolated data folder' };
  if (platform === 'win32') return { kind: 'nsis' };
  return { kind: 'github' };
}

const log = (m: string): void => console.log(`[updater] ${m}`);

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/** Ask the window to commit edits and save the camera; never waits more than 3 s (F7). */
async function flushWindow(getDispatch: () => CliDispatchFn | null): Promise<void> {
  const dispatch = getDispatch();
  if (!dispatch || BrowserWindow.getAllWindows().length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, 3000); });
  await Promise.race([dispatch('app.flush', {}).then(() => undefined), timeout]);
  if (timer) clearTimeout(timer);
}

export function initUpdater(getDispatch: () => CliDispatchFn | null): UpdateService {
  if (service) return service;

  const choice = chooseBackend({ isPackaged: app.isPackaged, platform: process.platform, env: process.env });
  let backend: UpdateBackend | null = null;
  if (choice.kind === 'nsis') backend = createNsisBackend(log);
  if (choice.kind === 'github') backend = createGithubNotifyBackend(globalThis.fetch as unknown as FetchLike);

  service = new UpdateService({
    currentVersion: app.getVersion(),
    backend,
    ...(choice.kind === 'disabled' ? { disabledReason: choice.reason } : {}),
    openExternal: (url) => shell.openExternal(url),
    beforeInstall: () => flushWindow(getDispatch),
    log,
  });
  log(choice.kind === 'disabled' ? `off: ${choice.reason}` : `on (${choice.kind}), v${app.getVersion()}`);

  service.subscribe((state) => broadcast('update:state', state));

  ipcMain.handle('update:get', () => service!.state());
  ipcMain.handle('update:check', () => service!.check());
  ipcMain.handle('update:install', () => service!.install());
  ipcMain.handle('update:open', () => service!.openRelease());

  app.on('before-quit', () => service?.stop());

  service.start();
  return service;
}
