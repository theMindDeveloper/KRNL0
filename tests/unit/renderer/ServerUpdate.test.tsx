// @vitest-environment jsdom
// Updating the server from the app (server-updates F1–F7; the owner's pick:
// draft A in the saved badge's menu, draft B in Settings › Updates).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { SaveSyncBadge } from '../../../src/renderer/components/Sync/SyncChip';
import { ServerUpdateCard, updateView } from '../../../src/renderer/components/Sync/ServerUpdate';
import { useServerUpdateStore, useSyncStore } from '../../../src/renderer/store/syncStore';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import { readServerUpdate, type ServerUpdate } from '../../../src/shared/sync/serverUpdate';
import type { Board } from '../../../src/shared/types';
import type { SyncInfo } from '../../../src/shared/sync/port';

const info: SyncInfo = { configured: true, origin: 'https://home.lan:8443', fingerprint: null, deviceName: 'desk', state: 'synced', lastSyncedAt: Date.now(), clockOffsetMs: 0, readOnly: [], message: null } as SyncInfo;
const raw = (over: Record<string, unknown> = {}) => ({ current: '0.2.0', latest: '0.2.1', available: true, url: 'https://example.test/notes', channel: 'one-click', auto: false, minApp: null, ...over });

type Bridge = Record<string, ReturnType<typeof vi.fn>>;
let bridge: Bridge;
function mount(update: ServerUpdate | null): void {
  bridge = {
    syncStatus: vi.fn(async () => info),
    onSyncStatus: vi.fn(() => () => {}),
    syncDevices: vi.fn(async () => []),
    syncServer: vi.fn(async () => update),
    syncServerUpdate: vi.fn(async () => ({ ok: true, message: null, update: readServerUpdate(raw({ job: { state: 'running', step: 'download', from: '0.2.0', to: '0.2.1', message: null, at: new Date().toISOString(), auto: false } })) })),
    syncServerAuto: vi.fn(async () => ({ ok: true, message: null, update: readServerUpdate(raw({ auto: true })) })),
    appOpenExternal: vi.fn(async () => undefined),
  };
  (window as unknown as { krnl: Bridge }).krnl = bridge;
  useSyncStore.setState({ info });
  useServerUpdateStore.setState({ update, following: false });
}

beforeEach(() => {
  useBoardStore.getState().setBoard({ version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], uiMode: 'advanced' } as unknown as Board);
});
afterEach(() => { cleanup(); delete (window as unknown as { krnl?: Bridge }).krnl; vi.useRealTimers(); });

describe('what the app shows (F1, F3)', () => {
  it('available, running, done today, failed today, or nothing', () => {
    const now = new Date().toISOString();
    expect(updateView(readServerUpdate(raw()), false)).toBe('available');
    expect(updateView(readServerUpdate(raw({ available: false })), false)).toBe('none');
    expect(updateView(readServerUpdate(raw()), true)).toBe('running');
    expect(updateView(readServerUpdate(raw({ available: false, current: '0.2.1', job: { state: 'done', step: null, from: '0.2.0', to: '0.2.1', message: null, at: now, auto: true } })), false)).toBe('done');
    expect(updateView(readServerUpdate(raw({ job: { state: 'rolled-back', step: null, from: '0.2.0', to: '0.2.1', message: 'back', at: now, auto: false } })), false)).toBe('failed');
    expect(updateView(null, false)).toBe('none');
  });
});

describe('draft A: the saved badge (F1, F2, F7)', () => {
  it('a small dot on the badge; the menu says what is out; UPDATE asks for the password and sends it', async () => {
    mount(readServerUpdate(raw()));
    await act(async () => { render(<SaveSyncBadge />); });
    expect(screen.getByTestId('server-update-pip')).toBeTruthy();
    fireEvent.click(screen.getByTestId('topbar-live-badge'));
    expect(screen.getByTestId('server-update-row').textContent).toContain('KRNL0 server 0.2.1 is out');
    fireEvent.click(screen.getByText('UPDATE'));
    const sheet = screen.getByTestId('server-update-sheet');
    expect(sheet.textContent).toContain('0.2.0 → 0.2.1');
    expect(sheet.textContent).toContain('Goes back to 0.2.0 by itself');
    const send = screen.getByText('UPDATE SERVER') as HTMLButtonElement;
    expect(send.disabled).toBe(true); // no password, no update
    fireEvent.change(screen.getByTestId('server-update-password'), { target: { value: 'my password' } });
    await act(async () => { fireEvent.click(screen.getByText('UPDATE SERVER')); });
    expect(bridge.syncServerUpdate).toHaveBeenCalledWith('my password', undefined);
    // Then the steps, while it runs.
    expect(screen.getByTestId('server-update-steps').textContent).toContain('Downloading');
  });
  it('a wrong password shows the server’s words and keeps the sheet', async () => {
    mount(readServerUpdate(raw()));
    bridge.syncServerUpdate = vi.fn(async () => ({ ok: false, message: 'Wrong password or code.', update: null }));
    await act(async () => { render(<SaveSyncBadge />); });
    fireEvent.click(screen.getByTestId('topbar-live-badge'));
    fireEvent.click(screen.getByText('UPDATE'));
    fireEvent.change(screen.getByTestId('server-update-password'), { target: { value: 'nope' } });
    await act(async () => { fireEvent.click(screen.getByText('UPDATE SERVER')); });
    expect(screen.getByRole('alert').textContent).toBe('Wrong password or code.');
  });
  it('a server that can not update itself: the commands to copy, no password (F4)', async () => {
    mount(readServerUpdate({ current: '0.1.0', latest: '0.2.1', available: true, url: null }));
    await act(async () => { render(<SaveSyncBadge />); });
    fireEvent.click(screen.getByTestId('topbar-live-badge'));
    fireEvent.click(screen.getByText('How'));
    const commands = screen.getAllByTestId('server-update-command').map((c) => c.textContent ?? '');
    expect(commands.some((c) => c.includes('docker.sh'))).toBe(true);
    expect(commands.some((c) => c.includes('docker.ps1'))).toBe(true);
    expect(commands.some((c) => c.includes('install.sh'))).toBe(true);
    expect(screen.queryByTestId('server-update-password')).toBeNull();
  });
  it('a server that needs a newer KRNL0 says so first, and still allows it (F5)', async () => {
    mount(readServerUpdate(raw({ minApp: '9.0.0' })));
    await act(async () => { render(<SaveSyncBadge />); });
    fireEvent.click(screen.getByTestId('topbar-live-badge'));
    fireEvent.click(screen.getByText('UPDATE'));
    expect(screen.getByTestId('server-update-newer-app').textContent).toContain('needs KRNL0 9.0.0');
    expect(screen.getByText('UPDATE SERVER ANYWAY')).toBeTruthy();
  });
  it('up to date: no dot and no row', async () => {
    mount(readServerUpdate(raw({ available: false })));
    await act(async () => { render(<SaveSyncBadge />); });
    expect(screen.queryByTestId('server-update-pip')).toBeNull();
    fireEvent.click(screen.getByTestId('topbar-live-badge'));
    expect(screen.queryByTestId('server-update-row')).toBeNull();
  });
});

describe('draft B: Settings › Updates (F1, F6)', () => {
  it('the server’s version, how it updates, and the night switch with the password', async () => {
    mount(readServerUpdate(raw()));
    await act(async () => { render(<ServerUpdateCard />); });
    const card = screen.getByTestId('settings-server-update');
    expect(card.textContent).toContain('home.lan:8443');
    expect(card.textContent).toContain('0.2.1 is out');
    expect(card.textContent).toContain('One click, from here');
    fireEvent.click(screen.getByTestId('settings-server-auto'));
    expect(screen.getByTestId('server-update-sheet').textContent).toContain('Update by itself at night');
    fireEvent.change(screen.getByTestId('server-update-password'), { target: { value: 'my password' } });
    await act(async () => { fireEvent.click(screen.getByText('TURN ON')); });
    expect(bridge.syncServerAuto).toHaveBeenCalledWith(true, 'my password', undefined);
  });
});
