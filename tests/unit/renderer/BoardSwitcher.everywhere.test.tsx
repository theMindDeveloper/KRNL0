// @vitest-environment jsdom
// The board menu in Easy and Advanced alike, and a list that follows sync
// (boards.md F1, owner 2026-11-21): a board made on the website or another
// device must always be reachable.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { BoardSwitcher } from '../../../src/renderer/components/TopBar/BoardSwitcher';

type Row = { id: string; name: string; active: boolean; plans: number; habits: number };
const listOf = (rows: Row[]) => ({ activeId: rows.find((r) => r.active)?.id ?? '', boards: rows, recording: null, notice: null });
const row = (id: string, name: string, active = false): Row => ({ id, name, active, plans: 0, habits: 0 });

let syncCb: ((info: unknown) => void) | null = null;
function mount(first: Row[]) {
  let current = listOf(first);
  const bridge = {
    boardsList: vi.fn(async () => current),
    onSyncStatus: vi.fn((cb: (info: unknown) => void) => { syncCb = cb; return () => { syncCb = null; }; }),
    onBoardChanged: vi.fn(() => () => {}),
  };
  (window as unknown as { krnl: typeof bridge }).krnl = bridge;
  return { bridge, set: (rows: Row[]) => { current = listOf(rows); } };
}

afterEach(() => { cleanup(); delete (window as unknown as { krnl?: unknown }).krnl; syncCb = null; });

describe('the board menu everywhere', () => {
  it('shows with a single board (Easy mode too: there is no hidden case any more)', async () => {
    mount([row('b1', 'Board', true)]);
    await act(async () => { render(<BoardSwitcher />); });
    expect(screen.getByTestId('topbar-canvas-switcher').textContent).toContain('Board');
  });

  it('a board that arrives by sync appears without reloading', async () => {
    const { set } = mount([row('b1', 'Board', true)]);
    await act(async () => { render(<BoardSwitcher />); });
    // The desktop connects; the server's list now has its boards too, and this one was renamed there.
    set([row('b1', 'Home', true), row('main', 'Main'), row('new', 'new')]);
    await act(async () => { syncCb?.({ state: 'synced' }); });
    expect(screen.getByTestId('topbar-canvas-switcher').textContent).toContain('Home');
    fireEvent.click(screen.getByTestId('topbar-canvas-switcher'));
    await act(async () => {});
    for (const id of ['b1', 'main', 'new']) expect(screen.getByTestId(`board-item-${id}`)).toBeTruthy();
  });
});
