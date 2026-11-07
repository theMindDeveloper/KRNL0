// App state across launches (Decision 38, docs/06-requirements/launch-experience.md).
//
// Runs once at startup, before the window and before anything can save the
// board: works out which version last opened this board, copies board.json
// into `<board dir>/backups/` when the version changed (F4), and remembers
// when KRNL0 was last in use (for "Welcome back"). The window reads the result
// over `app:launch`; the sys CLI reads it through getAppStatePort().

import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { arch, release, type as osType } from 'os';
import { isAllowedExternalUrl } from '../shared/feedback';
import { writeFileAtomic } from './persistence/board';
import {
  DAY_MS,
  applyPrefsPatch,
  backupFileName,
  backupsToPrune,
  parseAppState,
  updateKind,
  type AppStateFile,
  type AppStatePort,
  type LaunchInfo,
  type UpdateKind,
} from '../shared/appState';

const log = (m: string): void => console.log(`[app-state] ${m}`);
const ACTIVE_EVERY_MS = 5 * 60_000;

let statePath = '';
let state: AppStateFile = parseAppState(null);
let launch: LaunchInfo | null = null;

function save(): void {
  try {
    // Atomic: a crash mid-write must not wipe the user's settings.
    writeFileAtomic(statePath, JSON.stringify(state, null, 2));
  } catch (err) {
    log(`not saved: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function listBackups(dir: string): Array<{ name: string; mtimeMs: number }> {
  try {
    return readdirSync(dir)
      .filter((n) => /^board-.*\.json$/.test(n))
      .map((name) => ({ name, mtimeMs: statSync(join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}

/** Copy board.json aside before a new version can migrate it. Never overwrites a copy. */
export function backupBoard(boardDir: string, previous: string | null, current: string): string | null {
  const board = join(boardDir, 'board.json');
  if (!existsSync(board)) return null;
  const dir = join(boardDir, 'backups');
  const name = backupFileName(previous, current);
  try {
    mkdirSync(dir, { recursive: true });
    if (!existsSync(join(dir, name))) copyFileSync(board, join(dir, name));
    for (const old of backupsToPrune(listBackups(dir))) {
      try { unlinkSync(join(dir, old)); } catch { /* in use — next time */ }
    }
    log(`board copied to backups/${name}`);
    return name;
  } catch (err) {
    log(`board backup failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** "Windows 11 (10.0.26300) · x64" — for feedback reports. */
function describeSystem(): string {
  const name = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : osType();
  const ver = release();
  const win11 = process.platform === 'win32' && Number(ver.split('.')[2] ?? 0) >= 22000;
  return `${name}${win11 ? ' 11' : ''} (${ver}) · ${arch()}`;
}

/** KRNL0_SIMULATE_UPDATE=feature|patch: pretend the last run was an older version (previews). */
function simulatedPrevious(current: string, env: NodeJS.ProcessEnv): string | null {
  const kind = env['KRNL0_SIMULATE_UPDATE'];
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(current);
  if (!m || (kind !== 'feature' && kind !== 'patch')) return null;
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === 'patch') return pat > 0 ? `${maj}.${min}.${pat - 1}` : `${maj}.${min}.0-pre`;
  return min > 0 ? `${maj}.${min - 1}.0` : `${Math.max(0, maj - 1)}.9.0`;
}

/**
 * Read app-state.json, back up the board if the version changed, record this
 * version. Call once at startup, before the board can be saved.
 */
export function initAppState(boardDir: string, env: NodeJS.ProcessEnv = process.env): LaunchInfo {
  statePath = join(app.getPath('userData'), 'app-state.json');
  try {
    state = parseAppState(JSON.parse(readFileSync(statePath, 'utf-8')) as unknown);
  } catch {
    state = parseAppState(null);
  }
  const version = app.getVersion();
  const now = Date.now();

  const fakePrev = simulatedPrevious(version, env);
  const awayDays = Number(env['KRNL0_SIMULATE_AWAY_DAYS']);
  const fakeAway = Number.isFinite(awayDays) && awayDays > 0 ? awayDays * DAY_MS : null;

  const previous = fakePrev ?? state.lastVersion;
  let kind: UpdateKind = updateKind(previous, version);
  // An existing board with no app-state file was last opened by a version
  // older than this feature: treat it as an update so it gets a backup.
  if (kind === 'first-run' && existsSync(join(boardDir, 'board.json'))) kind = 'feature';
  if (fakePrev) kind = env['KRNL0_SIMULATE_UPDATE'] === 'patch' ? 'patch' : 'feature';

  const changed = kind === 'feature' || kind === 'patch' || kind === 'downgrade';
  const backupFile = changed ? backupBoard(boardDir, previous, version) : null;

  const lastActive = fakeAway !== null ? now - fakeAway : state.lastActiveAt;
  const awayMs = lastActive !== null ? Math.max(0, now - lastActive) : null;

  launch = {
    version,
    previousVersion: changed ? previous : null,
    kind,
    backupFile,
    backupDir: join(boardDir, 'backups'),
    backups: listBackups(join(boardDir, 'backups')).map((b) => b.name),
    awayMs,
    awayFrom: lastActive,
    simulated: fakePrev !== null || fakeAway !== null,
    system: describeSystem(),
    prefs: state,
  };

  state = { ...state, lastVersion: version, lastActiveAt: now };
  save();
  return launch;
}

export function getLaunchInfo(): LaunchInfo | null {
  return launch ? { ...launch, prefs: state, backups: listBackups(launch.backupDir).map((b) => b.name) } : null;
}

export function getAppPrefs(): AppStateFile {
  return state;
}

export function setAppPrefs(patch: unknown): AppStateFile {
  state = applyPrefsPatch(state, patch);
  save();
  return state;
}

function markActive(): void {
  state = { ...state, lastActiveAt: Date.now() };
  save();
}

/** Track when the main window was last in use: on focus changes, every 5 min while focused, on quit. */
export function trackActivity(win: BrowserWindow): void {
  win.on('focus', markActive);
  win.on('blur', markActive);
  const timer = setInterval(() => { if (!win.isDestroyed() && win.isFocused()) markActive(); }, ACTIVE_EVERY_MS);
  win.on('closed', () => clearInterval(timer));
}

export function registerAppStateHandlers(): void {
  ipcMain.handle('app:launch', () => getLaunchInfo());
  ipcMain.handle('app:prefs:set', (_e, patch: unknown) => setAppPrefs(patch));
  ipcMain.handle('app:backups:open', async () => {
    const dir = launch?.backupDir;
    if (!dir) return { ok: false, message: 'no backups folder' };
    mkdirSync(dir, { recursive: true });
    const err = await shell.openPath(dir);
    return err ? { ok: false, message: err } : { ok: true, message: dir };
  });
  ipcMain.handle('app:open-external', async (_e, url: unknown) => {
    // Only the project's own pages and the feedback email: the feedback flow and Help links.
    if (!isAllowedExternalUrl(url)) {
      return { ok: false, message: 'refused' };
    }
    await shell.openExternal(url);
    return { ok: true, message: url };
  });
  app.on('before-quit', markActive);
}

/** For SysFacade (`krnl app …`). */
export const appStatePort: AppStatePort = {
  launch: () => getLaunchInfo(),
  setPrefs: (patch) => setAppPrefs(patch),
};
