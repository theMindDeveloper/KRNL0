// @vitest-environment jsdom
// The top-bar sync chip and the Connect sheet (server-sync.md F6, design "Sync B").
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { SyncChip } from '../../../src/renderer/components/Sync/SyncChip';
import { fingerprintGroups } from '../../../src/renderer/components/Sync/ConnectSheet';
import { agoText, chipLook, parseSyncInfo, useSyncStore } from '../../../src/renderer/store/syncStore';
import { useBoardStore } from '../../../src/renderer/store/boardStore';
import type { Board } from '../../../src/shared/types';
import type { SyncInfo } from '../../../src/shared/sync/port';

const FP = 'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';

function info(over: Partial<SyncInfo> = {}): SyncInfo {
  return {
    configured: true, origin: 'https://home.lan:8443', fingerprint: FP, deviceName: 'desk',
    state: 'synced', lastSyncedAt: Date.now(), clockOffsetMs: 0, readOnly: [], message: null, ...over,
  } as SyncInfo;
}

function setBoard(uiMode: 'easy' | 'advanced'): void {
  useBoardStore.getState().setBoard({
    version: 1, savedAt: '', viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], uiMode,
  } as unknown as Board);
}

type Bridge = Record<string, ReturnType<typeof vi.fn>>;
let bridge: Bridge;

function mount(status: SyncInfo): void {
  bridge = {
    syncStatus: vi.fn(async () => status),
    onSyncStatus: vi.fn(() => () => {}),
    syncBegin: vi.fn(async () => ({ ok: true, origin: 'https://home.lan:8443', fingerprint: FP, serverVersion: '0.2.0', encryption: 'selfsigned' })),
    syncFinish: vi.fn(async () => ({ ok: true, info: info() })),
    syncRetry: vi.fn(async () => ({ ok: true, info: info() })),
    syncDisconnect: vi.fn(async () => ({ ok: true, info: info({ configured: false, state: 'off' }) })),
    syncDevices: vi.fn(async () => [
      { id: 'd1', name: 'desk', platform: 'win32', lastSeenAt: Date.now(), current: true },
      { id: 'd2', name: 'laptop', platform: 'darwin', lastSeenAt: Date.now() - 3_600_000, current: false },
    ]),
    appOpenExternal: vi.fn(async () => undefined),
  };
  (window as unknown as { krnl: Bridge }).krnl = bridge;
}

beforeEach(() => { setBoard('advanced'); useSyncStore.setState({ info: null }); });
afterEach(() => { cleanup(); delete (window as unknown as { krnl?: Bridge }).krnl; });

describe('chip words (F6)', () => {
  it('names every state in plain words', () => {
    expect(chipLook(null).label).toBe('connect server');
    expect(chipLook(info({ configured: false, state: 'off' })).label).toBe('connect server');
    expect(chipLook(info()).label).toBe('server · synced');
    expect(chipLook(info({ state: 'syncing' })).tone).toBe('cyan');
    expect(chipLook(info({ state: 'offline' })).label).toBe('offline · changes kept');
    expect(chipLook(info({ state: 'paused' })).label).toBe('sync paused · retry');
    expect(chipLook(info({ state: 'update' })).label).toBe('update KRNL0');
    expect(chipLook(info({ state: 'signed-out' })).label).toBe('signed out · connect again');
  });

  it('accepts only a well-formed status from IPC', () => {
    expect(parseSyncInfo(null)).toBeNull();
    expect(parseSyncInfo({ configured: true, state: 'nonsense' })).toBeNull();
    expect(parseSyncInfo(info())?.state).toBe('synced');
  });

  it('says how long ago in short words', () => {
    const now = 1_000_000_000;
    expect(agoText(null, now)).toBe('not yet');
    expect(agoText(now - 2_000, now)).toBe('just now');
    expect(agoText(now - 120_000, now)).toBe('2 min ago');
  });

  it('groups the fingerprint four bytes at a time', () => {
    const g = fingerprintGroups(FP);
    expect(g).toHaveLength(8);
    expect(g[0]).toBe('AB:CD:EF:01');
  });
});

describe('SyncChip', () => {
  it('shows a quiet "connect server" chip in Easy mode too (the only way in without the terminal)', async () => {
    setBoard('easy');
    mount(info({ configured: false, state: 'off' }));
    render(<SyncChip />);
    await act(async () => {});
    expect(screen.getByTestId('sync-chip').textContent).toContain('connect server');
  });

  it('with no server, opens the Connect sheet; CONNECT waits for the fingerprint tick and a password', async () => {
    mount(info({ configured: false, state: 'off', origin: null, fingerprint: null }));
    render(<SyncChip />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId('sync-chip'));
    expect(screen.getByTestId('sync-connect-sheet')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('192.168.1.20:8443'), { target: { value: 'home.lan:8443' } });
    await act(async () => { fireEvent.click(screen.getByText('Find')); });
    expect(bridge.syncBegin).toHaveBeenCalledWith('home.lan:8443');
    expect(screen.getAllByText('AB:CD:EF:01').length).toBeGreaterThan(0);

    const connect = screen.getByText('CONNECT') as HTMLButtonElement;
    expect(connect.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'It matches my server' }));
    expect(connect.disabled).toBe(true);
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'pw-123456789' } });
    expect(connect.disabled).toBe(false);

    await act(async () => { fireEvent.click(connect); });
    expect(bridge.syncFinish).toHaveBeenCalledWith('pw-123456789', undefined);
    expect(screen.queryByTestId('sync-connect-sheet')).toBeNull();
  });

  it('shows the server\'s error in the sheet and keeps it open', async () => {
    mount(info({ configured: false, state: 'off' }));
    bridge.syncBegin = vi.fn(async () => ({ ok: false, message: 'Cannot reach https://x. Is the server running?' }));
    render(<SyncChip />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId('sync-chip'));
    fireEvent.change(screen.getByPlaceholderText('192.168.1.20:8443'), { target: { value: 'x' } });
    await act(async () => { fireEvent.click(screen.getByText('Find')); });
    expect(screen.getByRole('alert').textContent).toContain('Cannot reach');
    expect(screen.getByTestId('sync-connect-sheet')).toBeTruthy();
  });

  it('when synced, opens the status with this computer marked and Sync now', async () => {
    mount(info());
    render(<SyncChip />);
    await act(async () => {});
    expect(screen.getByTestId('sync-chip').textContent).toContain('server · synced');
    await act(async () => { fireEvent.click(screen.getByTestId('sync-chip')); });
    expect(screen.getByText('Everything is in sync')).toBeTruthy();
    expect(screen.getByText('desk (this computer)')).toBeTruthy();
    expect(screen.getByText('laptop')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText('Sync now')); });
    expect(bridge.syncRetry).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Open website'));
    expect(bridge.appOpenExternal).toHaveBeenCalledWith('https://home.lan:8443');
  });
});
