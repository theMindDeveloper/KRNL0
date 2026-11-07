// @vitest-environment jsdom
/**
 * The floating timer's "What were those 25m?" card (pocket-timer.md F13):
 * picking a tag hides it at once; if KRNL0 could not take the name, the card
 * comes back instead of the name being lost silently.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { PocketApp } from '../../../src/renderer/pocket/PocketApp';

const iso = (ms: number) => new Date(ms).toISOString();

function bridge(result: { ok: boolean; message: string }) {
  const now = Date.now();
  const snapshot = {
    nodeId: 'mother-pomo',
    state: {
      status: 'break', startedAt: iso(now - 3 * 60_000), durationMin: 25, breakMin: 5, label: '', sessionsCompleted: 1, activeTaskId: null,
      pausedAt: null, sessionWorkSec: 0, pausedElapsedMs: 0,
      history: [{ id: 'w2', kind: 'work', completed: true, startedAt: iso(now - 28 * 60_000), endedAt: iso(now - 3 * 60_000), taskId: null, label: '' }],
    },
    config: { sessionMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakEvery: 4, mode: 'observe' },
    easy: false, away: false,
    library: [{ id: 'study', label: 'Study', color: 'var(--acid)' }, { id: 'code', label: 'Code', color: '#22d3ee' }],
    face: 'blocks', root: { attrs: {}, style: '' },
  };
  const pocketCommand = vi.fn(async () => result);
  (window as unknown as { krnl: unknown }).krnl = {
    pocketGet: async () => ({ snapshot, prefs: { look: 'dial', collapsed: false } }),
    onPocketSnapshot: () => () => {}, onPocketPrefs: () => () => {}, onPocketHover: () => () => {},
    pocketResize: () => {}, pocketCommand,
  };
  return pocketCommand;
}

afterEach(() => { cleanup(); delete (window as unknown as { krnl?: unknown }).krnl; });

describe('pocket: naming a span', () => {
  it('a name KRNL0 took: the card goes and stays gone', async () => {
    const cmd = bridge({ ok: true, message: 'ok' });
    render(<PocketApp />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId('pocket-ask')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText('Study')); await new Promise((r) => setTimeout(r, 20)); });
    expect(cmd).toHaveBeenCalledWith('pomo.retagSegment', { id: 'w2', taskId: null, label: 'Study', tag: 'study' });
    expect(screen.queryByTestId('pocket-ask')).toBeNull();
  });

  it('a name KRNL0 refused: the card comes back so it can be named again', async () => {
    bridge({ ok: false, message: 'KRNL0 is not open' });
    render(<PocketApp />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => { fireEvent.click(screen.getByText('Study')); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId('pocket-ask')).toBeTruthy();
  });
});
