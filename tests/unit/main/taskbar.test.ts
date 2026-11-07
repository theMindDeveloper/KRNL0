/** Windows taskbar (launch-experience.md F10): what reaches the real Electron window. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: vi.fn(() => ({})) },
  Tray: vi.fn(),
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
