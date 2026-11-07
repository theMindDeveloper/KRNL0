// Time at a glance outside the window (launch-experience.md F10–F11).
//
// Windows: a progress bar on the KRNL0 taskbar icon (yellow when paused), a
// badge on breaks and in Observe, and Pause / Break / Stop buttons in the
// thumbnail preview. macOS: the time in the menu bar, with the same controls
// in its menu. Both follow the Pomo snapshot the pocket timer already gets
// (Decision 37) and send the node's own commands back — a view, nothing more.

import { Menu, Tray, nativeImage, type BrowserWindow, type NativeImage, type ThumbarButton } from 'electron';
import { getPocket, onPocketSnapshot, runPomoCommand } from './pocket';
import { revealMainWindow } from './mainWindow';
import { IDLE_VIEW, systemTimerView, type SystemTimerView } from '../shared/systemTimer';
import type { PocketSnapshot } from '../shared/pocket';
import type { PomoControlId } from '../renderer/components/nodes/PomoNode/derive';

type Glyph = 'pause' | 'play' | 'stop' | 'break' | 'dot';

/** A tiny white glyph drawn into a BGRA bitmap — no image files to ship. */
function glyph(kind: Glyph, rgb: [number, number, number] = [240, 236, 224], size = 16): NativeImage {
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const set = (x: number, y: number, a = 255): void => {
    const i = (y * size + x) * 4;
    buf[i] = rgb[2]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[0]; buf[i + 3] = a;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const r = Math.hypot(dx, dy);
      let on = false;
      if (kind === 'pause') on = y >= 3 && y <= 12 && ((x >= 4 && x <= 6) || (x >= 9 && x <= 11));
      if (kind === 'stop') on = x >= 4 && x <= 11 && y >= 4 && y <= 11;
      if (kind === 'play') on = x >= 5 && x <= 12 && Math.abs(dy) <= (x - 5) * 0.62 + 0.5 && Math.abs(dy) <= 4.5;
      if (kind === 'break') on = r <= 5.5 && r >= 3.5;
      if (kind === 'dot') on = r <= 5;
      if (on) set(x, y);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

const GLYPH_FOR: Record<PomoControlId, Glyph> = {
  start: 'play', resume: 'play', backToWork: 'play', extend: 'play',
  pause: 'pause', break: 'break', endBreak: 'stop', stop: 'stop',
};

let win: BrowserWindow | null = null;
let snap: PocketSnapshot | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let tray: Tray | null = null;
let lastKey = '';
let lastMenuKey = '';

function renderWindows(v: SystemTimerView): void {
  if (!win || win.isDestroyed()) return;
  if (!v.live) {
    win.setProgressBar(-1);
    win.setOverlayIcon(null, '');
    win.setThumbarButtons([]);
    win.setTitle('KRNL0');
    lastKey = ''; // buttons cleared: the next live state sets them again
    return;
  }
  if (v.progress !== null) win.setProgressBar(Math.max(0.01, v.progress), { mode: v.barMode === 'paused' ? 'paused' : 'normal' });
  else win.setProgressBar(-1);
  win.setTitle(`KRNL0 · ${v.time} · ${v.label}`);
  // Overlay and buttons only change with the state, not every second.
  const key = `${v.badge}|${v.controls.map((c) => c.id).join(',')}`;
  if (key === lastKey) return;
  lastKey = key;
  if (v.badge === 'break') win.setOverlayIcon(glyph('break', [217, 165, 90]), 'On a break');
  else if (v.badge === 'observe') win.setOverlayIcon(glyph('dot', [238, 132, 102]), 'Observe · recording');
  else win.setOverlayIcon(null, '');
  const buttons: ThumbarButton[] = v.controls.map((c) => ({
    tooltip: c.label,
    icon: glyph(GLYPH_FOR[c.id]),
    click: () => { runPomoCommand(c.command); },
  }));
  win.setThumbarButtons(buttons);
}

function trayMenu(v: SystemTimerView): Menu {
  const pocket = getPocket();
  const pocketOn = pocket?.status().enabled ?? false;
  return Menu.buildFromTemplate([
    { label: v.label, enabled: false },
    { type: 'separator' },
    ...v.controls.map((c) => ({ label: c.label, click: () => { runPomoCommand(c.command); } })),
    { type: 'separator' },
    { label: 'Floating timer', type: 'checkbox', checked: pocketOn, click: () => { pocket?.setEnabled(!pocketOn); } },
    { label: 'Open KRNL0', click: () => revealMainWindow() },
  ]);
}

function renderMac(v: SystemTimerView): void {
  if (!v.live) {
    tray?.destroy();
    tray = null;
    lastMenuKey = '';
    return;
  }
  if (!tray) {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip('KRNL0 timer');
  }
  tray.setTitle(v.observe || v.badge === 'break' ? `● ${v.time}` : v.barMode === 'paused' ? `❚❚ ${v.time}` : `● ${v.time}`, { fontType: 'monospacedDigit' });
  // Rebuild the menu only when the state changes, so an open menu isn't closed every second.
  const key = `${v.label}|${v.controls.map((c) => c.id).join(',')}|${getPocket()?.status().enabled ?? false}`;
  if (key !== lastMenuKey) {
    lastMenuKey = key;
    tray.setContextMenu(trayMenu(v));
  }
}

function render(): void {
  const v = snap ? systemTimerView(snap, Date.now()) : IDLE_VIEW;
  if (process.platform === 'win32') renderWindows(v);
  if (process.platform === 'darwin') renderMac(v);
  // Tick once a second only while something is being timed.
  if (v.live && !ticker) ticker = setInterval(render, 1000);
  if (!v.live && ticker) { clearInterval(ticker); ticker = null; }
}

export function initTaskbar(mainWindow: BrowserWindow): void {
  win = mainWindow;
  lastKey = '';
  // Overlay and thumbnail buttons follow `lastKey` (state changes only):
  // resetting it on every snapshot rebuilt them on each Todo edit (flicker).
  const off = onPocketSnapshot((s) => { snap = s; render(); });
  mainWindow.on('closed', () => {
    off();
    if (ticker) { clearInterval(ticker); ticker = null; }
    tray?.destroy();
    tray = null;
    win = null;
  });
}
