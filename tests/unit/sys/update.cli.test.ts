/** Decision 36 — `krnl update status|check|install|open` (app-updates.md F6). */
import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('electron', () => ({
  app: { getName: vi.fn(() => 'krnl0-test'), getAppPath: vi.fn(() => tmpdir()), on: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

import { SysFacade } from '../../../src/sys/SysFacade';
import { SysParser } from '../../../src/sys/parser';
import type { UpdateState, UpdaterPort } from '../../../src/shared/update';

const boardPath = join(tmpdir(), 'krnl0-update-cli-unused', 'board.json');

function fakeUpdater(state: UpdateState, after: UpdateState = state): UpdaterPort & { install: ReturnType<typeof vi.fn>; openRelease: ReturnType<typeof vi.fn> } {
  return {
    state: () => state,
    check: vi.fn(async () => after),
    install: vi.fn(async () => ({ ok: true, message: 'Restarting into KRNL0 0.11.0…' })),
    openRelease: vi.fn(async () => ({ ok: true, message: 'Opened https://github.com/x' })),
  };
}

const ready: UpdateState = {
  status: 'ready', currentVersion: '0.10.0', mode: 'auto', latestVersion: '0.11.0',
  releaseUrl: 'https://github.com/theMindDeveloper/KRNL0/releases/tag/v0.11.0',
};

describe('update parser', () => {
  it.each([
    [['update'], { kind: 'update', sub: 'status', json: false }],
    [['update', '--json'], { kind: 'update', sub: 'status', json: true }],
    [['update', 'status', '--json'], { kind: 'update', sub: 'status', json: true }],
    [['update', 'check'], { kind: 'update', sub: 'check', json: false }],
    [['update', 'install'], { kind: 'update', sub: 'install' }],
    [['update', 'open'], { kind: 'update', sub: 'open' }],
  ])('%j', (argv, expected) => {
    expect(SysParser.parse(argv)).toEqual(expected);
  });

  it('rejects an unknown subcommand with the valid ones', () => {
    expect(SysParser.parse(['update', 'now'])).toMatchObject({ kind: 'invalid', message: expect.stringContaining('status | check | install | open') });
  });
});

describe('update commands', () => {
  it('status prints the version, the state and the next step', async () => {
    const r = await new SysFacade({ boardPath, updater: fakeUpdater(ready) }).run(['update']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('KRNL0 v0.10.0 — KRNL0 0.11.0 is ready — restart to update');
    expect(r.message).toContain("What's new: https://github.com/theMindDeveloper/KRNL0/releases/tag/v0.11.0");
    expect(r.message).toContain('krnl update install');
  });

  it('status --json prints the bare state', async () => {
    const r = await new SysFacade({ boardPath, updater: fakeUpdater(ready) }).run(['update', 'status', '--json']);
    expect(JSON.parse(r.message!)).toEqual(ready);
  });

  it('check runs a check and reports its result', async () => {
    const upd = fakeUpdater({ ...ready, status: 'idle' }, { status: 'up-to-date', currentVersion: '0.10.0', mode: 'auto', checkedAt: Date.now() });
    const r = await new SysFacade({ boardPath, updater: upd }).run(['update', 'check']);
    expect(upd.check).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Up to date');
  });

  it('a failed check fails the command', async () => {
    const upd = fakeUpdater(ready, { status: 'error', currentVersion: '0.10.0', mode: 'notify', error: 'offline' });
    const r = await new SysFacade({ boardPath, updater: upd }).run(['update', 'check']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('offline');
  });

  it('check fails when updates are off in this build', async () => {
    const off: UpdateState = { status: 'disabled', currentVersion: '0.10.0', mode: 'notify', reason: 'development build' };
    const r = await new SysFacade({ boardPath, updater: fakeUpdater(off) }).run(['update', 'check']);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Updates are off (development build)');
  });

  it('install and open go to the running app', async () => {
    const upd = fakeUpdater(ready);
    const facade = new SysFacade({ boardPath, updater: upd });
    expect(await facade.run(['update', 'install'])).toEqual({ ok: true, message: 'Restarting into KRNL0 0.11.0…' });
    expect(await facade.run(['update', 'open'])).toEqual({ ok: true, message: 'Opened https://github.com/x' });
    expect(upd.install).toHaveBeenCalledTimes(1);
    expect(upd.openRelease).toHaveBeenCalledTimes(1);
  });

  it('without the running app it exits 2', async () => {
    const r = await new SysFacade({ boardPath }).run(['update', 'status']);
    expect(r.ok).toBe(false);
    expect(r.data).toEqual({ exitCode: 2 });
  });

  it('is listed in krnl help', async () => {
    const r = await new SysFacade({ boardPath }).run(['help', 'update']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('update check');
    expect(r.message).toContain('update install');
  });
});
