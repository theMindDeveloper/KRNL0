// Pocket timer window (Decision 37, docs/06-requirements/pocket-timer.md).
//
// A second, always-on-top BrowserWindow that shows the Pomo node while the
// main window is minimised. It is a view: the main window's renderer sends a
// snapshot of the node (`pocket:state`), main forwards it, and the pocket's
// buttons come back as one of the node's own commands (`pocket:command` →
// `pocket:run` on the main window). The pocket never touches the board.

import { BrowserWindow, app, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  POCKET_COLLAPSED_HEIGHT,
  POCKET_MAX_HEIGHT,
  POCKET_WIDTH,
  clampPocketPosition,
  isPocketLive,
  parsePocketPrefs,
  shouldShowPocket,
  type PocketPort,
  type PocketPrefs,
  type PocketSnapshot,
  type PocketStatus,
} from '../../shared/pocket';
import { isPomoControlCommand } from '../../renderer/components/nodes/PomoNode/derive';
import { getMainWindow, revealMainWindow } from '../mainWindow';

export interface PocketOptions {
  /** URL of the renderer for the pocket view (same bundle, `?pocket=1`). */
  url: () => string;
  preload: string;
  icon: string;
}

const log = (m: string): void => console.log(`[pocket] ${m}`);

let opts: PocketOptions | null = null;
let pocket: BrowserWindow | null = null;
let prefs: PocketPrefs = parsePocketPrefs(null);
let snapshot: PocketSnapshot | null = null;
/** `krnl mini show` while a session runs: show even with the main window up. */
let forced = false;
let height = 260;
/** Other main-side views of the Pomo (taskbar, menu bar) follow the same snapshot. */
const snapshotListeners = new Set<(s: PocketSnapshot | null) => void>();

export function onPocketSnapshot(listener: (s: PocketSnapshot | null) => void): () => void {
  snapshotListeners.add(listener);
  listener(snapshot);
  return () => { snapshotListeners.delete(listener); };
}

/** Run one of the Pomo node's control commands in the main window (same path as the pocket's buttons). */
export function runPomoCommand(command: string): boolean {
  if (!isPomoControlCommand(command)) return false;
  const main = getMainWindow();
  if (!main) return false;
  main.webContents.send('pocket:run', command);
  return true;
}

const prefsPath = (): string => join(app.getPath('userData'), 'pocket.json');

function loadPrefs(): PocketPrefs {
  try {
    return parsePocketPrefs(JSON.parse(readFileSync(prefsPath(), 'utf-8')) as unknown);
  } catch {
    return parsePocketPrefs(null);
  }
}

function savePrefs(): void {
  try {
    mkdirSync(dirname(prefsPath()), { recursive: true });
    writeFileSync(prefsPath(), JSON.stringify(prefs, null, 2));
  } catch (err) {
    log(`prefs not saved: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const live = (): boolean => isPocketLive(snapshot?.state.status);
const contentHeight = (): number => (prefs.collapsed ? POCKET_COLLAPSED_HEIGHT : height);

function ensureWindow(): BrowserWindow | null {
  if (pocket && !pocket.isDestroyed()) return pocket;
  if (!opts) return null;
  const win = new BrowserWindow({
    width: POCKET_WIDTH,
    height: contentHeight(),
    useContentSize: true,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    title: 'KRNL0 timer',
    backgroundColor: '#1c1a13',
    icon: opts.icon,
    webPreferences: {
      preload: opts.preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Above normal windows but below system dialogs; on a Mac also over full-screen apps.
  win.setAlwaysOnTop(true, 'floating');
  // skipTransformProcessType: without it macOS briefly hides the Dock icon on every call.
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  win.on('moved', () => {
    const [x, y] = win.getPosition();
    if (x !== undefined && y !== undefined) {
      prefs = { ...prefs, x, y };
      savePrefs();
    }
  });
  win.on('closed', () => {
    if (pocket === win) pocket = null;
  });
  void win.loadURL(opts.url());
  pocket = win;
  return win;
}

function place(win: BrowserWindow): void {
  const size = { width: POCKET_WIDTH, height: contentHeight() };
  const areas = screen.getAllDisplays().map((d) => d.workArea);
  const { x, y } = clampPocketPosition({ x: prefs.x, y: prefs.y }, size, areas);
  win.setContentSize(size.width, size.height);
  win.setPosition(x, y);
}

/** Show or hide to match the rules (F1, F9, F10). */
function reevaluate(): void {
  if (!live()) forced = false;
  const main = getMainWindow();
  const want = shouldShowPocket({
    prefs,
    live: live(),
    mainMinimized: main ? main.isMinimized() || !main.isVisible() : false,
    forced,
  });
  if (want) {
    const win = ensureWindow();
    if (!win) return;
    if (!win.isVisible()) {
      place(win);
      win.showInactive();
    }
  } else if (pocket && !pocket.isDestroyed() && pocket.isVisible()) {
    pocket.hide();
  }
}

function sendToPocket(channel: string, payload: unknown): void {
  if (pocket && !pocket.isDestroyed()) pocket.webContents.send(channel, payload);
}

const fromMain = (e: IpcMainEvent | IpcMainInvokeEvent): boolean => e.sender === getMainWindow()?.webContents;
const fromPocket = (e: IpcMainEvent | IpcMainInvokeEvent): boolean =>
  pocket !== null && !pocket.isDestroyed() && e.sender === pocket.webContents;

function looksLikeSnapshot(v: unknown): v is PocketSnapshot {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  const state = s['state'] as Record<string, unknown> | undefined;
  return typeof s['nodeId'] === 'string' && typeof state === 'object' && state !== null && typeof state['status'] === 'string';
}

/** Hook the main window's minimise / restore and closing. */
export function attachMainWindow(win: BrowserWindow): void {
  win.on('minimize', reevaluate);
  win.on('hide', reevaluate);
  const back = (): void => { forced = false; reevaluate(); };
  win.on('restore', back);
  win.on('show', back);
  win.on('focus', back);
  win.on('closed', () => {
    if (pocket && !pocket.isDestroyed()) pocket.destroy();
    pocket = null;
  });
}

export function initPocket(options: PocketOptions): PocketPort {
  opts = options;
  prefs = loadPrefs();

  // The main window's renderer: the latest Pomo snapshot.
  ipcMain.on('pocket:state', (e, raw: unknown) => {
    if (!fromMain(e)) return;
    if (raw === null) snapshot = null;
    else if (looksLikeSnapshot(raw)) snapshot = raw;
    else return;
    sendToPocket('pocket:snapshot', snapshot);
    for (const l of snapshotListeners) {
      try { l(snapshot); } catch (err) { log(`listener failed: ${err instanceof Error ? err.message : String(err)}`); }
    }
    reevaluate();
  });

  // The pocket: first paint pulls what is known.
  ipcMain.handle('pocket:get', (e) => (fromPocket(e) ? { snapshot, prefs } : null));

  // The pocket's buttons — only the node's own control commands pass (F5).
  ipcMain.handle('pocket:command', (e, command: unknown) => {
    if (!fromPocket(e)) return { ok: false, message: 'not the pocket window' };
    if (!isPomoControlCommand(command)) return { ok: false, message: `refused: ${String(command)}` };
    const main = getMainWindow();
    if (!main) return { ok: false, message: 'KRNL0 is not open' };
    main.webContents.send('pocket:run', command);
    return { ok: true, message: command };
  });

  ipcMain.on('pocket:open', (e) => {
    if (!fromPocket(e)) return;
    revealMainWindow();
  });

  ipcMain.on('pocket:collapse', (e, collapsed: unknown) => {
    if (!fromPocket(e) || typeof collapsed !== 'boolean') return;
    prefs = { ...prefs, collapsed };
    savePrefs();
    sendToPocket('pocket:prefs', prefs);
    if (pocket && !pocket.isDestroyed()) pocket.setContentSize(POCKET_WIDTH, contentHeight());
  });

  // The pocket measures its content; the window follows (expanded only).
  ipcMain.on('pocket:resize', (e, h: unknown) => {
    if (!fromPocket(e) || typeof h !== 'number' || !Number.isFinite(h)) return;
    height = Math.max(POCKET_COLLAPSED_HEIGHT, Math.min(POCKET_MAX_HEIGHT, Math.round(h)));
    if (!prefs.collapsed && pocket && !pocket.isDestroyed()) pocket.setContentSize(POCKET_WIDTH, height);
  });

  const status = (): PocketStatus => ({
    enabled: prefs.enabled,
    visible: pocket !== null && !pocket.isDestroyed() && pocket.isVisible(),
    collapsed: prefs.collapsed,
    live: live(),
  });

  return {
    status,
    show: () => {
      if (!prefs.enabled) return { ok: false, message: 'The floating timer is off. Turn it on with "krnl mini on".' };
      if (!live()) return { ok: false, message: 'Nothing is being timed. Start the Pomo first.' };
      forced = true;
      reevaluate();
      return { ok: true, message: 'Floating timer shown.' };
    },
    hide: () => {
      forced = false;
      if (pocket && !pocket.isDestroyed()) pocket.hide();
      return { ok: true, message: 'Floating timer hidden. It shows again the next time KRNL0 is minimised.' };
    },
    setEnabled: (on: boolean) => {
      prefs = { ...prefs, enabled: on };
      savePrefs();
      sendToPocket('pocket:prefs', prefs);
      reevaluate();
      return { ok: true, message: on ? 'Floating timer on.' : 'Floating timer off.' };
    },
  };
}

/** For Settings: the renderer reads and flips the on/off switch (F9). */
export function registerPocketSettings(port: PocketPort): void {
  ipcMain.handle('pocket:settings:get', () => port.status());
  ipcMain.handle('pocket:settings:set', (_e, on: unknown) => (typeof on === 'boolean' ? port.setEnabled(on) : { ok: false, message: 'expected true or false' }));
}

let port: PocketPort | null = null;
export function setPocketPort(p: PocketPort): void { port = p; }
/** The running pocket, for SysFacade (`krnl mini …`). Undefined before init. */
export function getPocket(): PocketPort | undefined { return port ?? undefined; }
