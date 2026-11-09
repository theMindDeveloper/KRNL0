/** Windows taskbar and the macOS menu bar (launch-experience.md F10–F11): what reaches the real Electron APIs. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const trays: Array<{ titles: string[]; menus: unknown[]; destroyed: boolean }> = [];
vi.mock('electron', () => ({
  Menu: { buildFromTemplate: vi.fn((tpl: unknown) => ({ tpl })) },
  Tray: vi.fn().mockImplementation(() => {
    const t = { titles: [] as string[], menus: [] as unknown[], destroyed: false };
    trays.push(t);
    return {
      setToolTip: () => {},
      setTitle: (s: string) => { t.titles.push(s); },
      setContextMenu: (m: unknown) => { t.menus.push(m); },
      destroy: () => { t.destroyed = true; },
    };
  }),
  nativeImage: { createFromBitmap: vi.fn(() => ({ isEmpty: () => false })), createEmpty: vi.fn(() => ({})) },
}));

let pushSnapshot: (s: unknown) => void = () => {};
vi.mock('../../../src/main/pocket', () => ({
  getPocket: () => null,
  onPocketSnapshot: (cb: (s: unknown) => void) => { pushSnapshot = cb; return () => {}; },
  runPomoCommand: vi.fn(),
}));
vi.mock('../../../src/main/mainWindow', () => ({ revealMainWindow: vi.fn() }));

import { initTaskbar } from '../../../src/main/taskbar';

function fakeWindow() {
  const handlers: Record<string, () => void> = {};
  return {
    setProgressBar: vi.fn(),
    setOverlayIcon: vi.fn(),
    setThumbarButtons: vi.fn(),
    setTitle: vi.fn(),
    isDestroyed: () => false,
    on: (ev: string, fn: () => void) => { handlers[ev] = fn; },
    handlers,
  };
}

const NOW = Date.parse('2026-11-07T10:00:00Z');
const snap = (status: 'running' | 'idle' | 'paused', extra: Record<string, unknown> = {}) => ({
  nodeId: 'mother-pomo',
  state: {
    status, startedAt: status === 'idle' ? null : new Date(NOW - 5 * 60_000).toISOString(), durationMin: 25, breakMin: 5, label: '',
    sessionsCompleted: 0, activeTaskId: null, history: [], pausedAt: status === 'paused' ? new Date(NOW).toISOString() : null,
    sessionWorkSec: 0, pausedElapsedMs: 0, ...extra,
  },
  config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4 },
  easy: false, away: false, library: [], face: 'blocks', root: { attrs: {}, style: '' },
});

describe('taskbar on Windows', () => {
  const platform = process.platform;
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    return () => { Object.defineProperty(process, 'platform', { value: platform }); vi.useRealTimers(); };
  });

  it('sets the thumbnail buttons once per state, not on every snapshot (no flicker)', () => {
    const win = fakeWindow();
    initTaskbar(win as never);
    pushSnapshot(snap('running'));
    pushSnapshot(snap('running', { label: 'a todo edit changed the snapshot' }));
    pushSnapshot(snap('running', { label: 'and again' }));
    expect(win.setThumbarButtons).toHaveBeenCalledTimes(1);
    expect(win.setProgressBar).toHaveBeenCalled();
    expect(String(win.setTitle.mock.calls.at(-1)?.[0])).toMatch(/^KRNL0 · \d\d:\d\d · /);
    win.handlers['closed']?.();
  });

  it('a state change sets new buttons; stopping clears them; starting again restores them', () => {
    const win = fakeWindow();
    initTaskbar(win as never);
    pushSnapshot(snap('running'));
    pushSnapshot(snap('paused'));
    expect(win.setThumbarButtons).toHaveBeenCalledTimes(2);
    pushSnapshot(snap('idle'));
    expect(win.setThumbarButtons).toHaveBeenLastCalledWith([]);
    expect(win.setProgressBar).toHaveBeenLastCalledWith(-1);
    pushSnapshot(snap('running'));
    const last = win.setThumbarButtons.mock.calls.at(-1)?.[0] as unknown[];
    expect(last.length).toBeGreaterThan(0);
    win.handlers['closed']?.();
  });
});

describe('menu bar on macOS', () => {
  const platform = process.platform;
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    trays.length = 0;
    return () => { Object.defineProperty(process, 'platform', { value: platform }); vi.useRealTimers(); };
  });

  it('shows the time in the menu bar while timing, ticks each second, and goes away when stopped', () => {
    const win = fakeWindow();
    initTaskbar(win as never);
    pushSnapshot(snap('running'));
    expect(trays).toHaveLength(1);
    const t = trays[0]!;
    expect(t.titles.at(-1)).toMatch(/^● \d\d:\d\d$/);
    const first = t.titles.at(-1);
    vi.advanceTimersByTime(1000);
    expect(t.titles.at(-1)).not.toBe(first); // counts down every second
    // The menu holds the state line, the controls, the floating-timer switch and Open KRNL0.
    const menu = t.menus[0] as { tpl: Array<{ label?: string; type?: string }> };
    const labels = menu.tpl.filter((i) => i.label).map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['Floating timer', 'Open KRNL0']));
    expect(labels.length).toBeGreaterThanOrEqual(4);
    pushSnapshot(snap('idle'));
    expect(t.destroyed).toBe(true);
    win.handlers['closed']?.();
  });

  it('rebuilds its menu only when the state changes, so an open menu is not closed every second', () => {
    const win = fakeWindow();
    initTaskbar(win as never);
    pushSnapshot(snap('running'));
    const t = trays[0]!;
    vi.advanceTimersByTime(5000);
    expect(t.menus).toHaveLength(1);
    pushSnapshot(snap('paused'));
    expect(t.menus).toHaveLength(2);
    expect(t.titles.at(-1)).toMatch(/^❚❚ /);
    win.handlers['closed']?.();
  });
});
