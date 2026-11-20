/** `krnl sync …` (Decision 51) — the CLI face of the sync service. */
import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { SysFacade } from '../../../src/sys/SysFacade';
import type { SyncInfo, SyncPort } from '../../../src/shared/sync/port';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

const info = (over: Partial<SyncInfo> = {}): SyncInfo => ({
  configured: true, origin: 'https://192.168.1.20:8443', fingerprint: 'AB:CD', deviceName: 'MOMO-PC',
  state: 'synced', lastSyncedAt: Date.now(), clockOffsetMs: 0, readOnly: [], message: null, ...over,
});

function port(over: Partial<SyncPort> = {}): SyncPort {
  return {
    info: () => info(),
    begin: vi.fn(async () => ({ origin: 'https://192.168.1.20:8443', fingerprint: 'F5:50:35', serverVersion: '0.1.0', encryption: 'self-signed' })),
    finish: vi.fn(async () => info()),
    disconnect: vi.fn(async () => info({ configured: false, state: 'off' })),
    retry: vi.fn(async () => info()),
    ...over,
  };
}

const facade = (sync?: SyncPort) => new SysFacade({ boardPath: join(tmpdir(), 'none.json'), hasOpenRenderer: () => false, ...(sync ? { sync } : {}) });

describe('krnl sync (Decision 51)', () => {
  it('status by default, in words', async () => {
    const r = await facade(port()).run(['sync']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('sync: synced');
    expect(r.message).toContain('https://192.168.1.20:8443');
  });

  it('says how to start when not connected', async () => {
    const r = await facade(port({ info: () => info({ configured: false, state: 'off' }) })).run(['sync', 'status']);
    expect(r.message).toContain('krnl sync connect');
  });

  it('connect shows the fingerprint and the next step', async () => {
    const r = await facade(port()).run(['sync', 'connect', '192.168.1.20:8443']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('F5:50:35');
    expect(r.message).toContain('krnl sync pair --password-stdin');
  });

  it('pair passes the password and 2FA code to the service', async () => {
    const p = port();
    const r = await facade(p).run(['sync', 'pair', '--code', '482913', '--password=correct horse battery']);
    expect(r.ok).toBe(true);
    expect(p.finish).toHaveBeenCalledWith('correct horse battery', '482913');
  });

  it('refuses outside the app and without a password', async () => {
    expect((await facade().run(['sync'])).ok).toBe(false);
    expect((await facade(port()).run(['sync', 'pair'])).ok).toBe(false);
  });
});
