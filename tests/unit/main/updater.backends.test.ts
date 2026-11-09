/**
 * Decision 36 — which backend a build uses (app-updates.md F8) and the
 * GitHub notify backend (F1, F3, F9, NF1), with a fake fetch.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: vi.fn(() => '0.10.0'), isPackaged: false },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  shell: { openExternal: vi.fn() },
}));

import { chooseBackend } from '../../../src/main/updater';
import { createGithubNotifyBackend, pickAutoUpdater, releasePageUrl } from '../../../src/main/updater/backends';
import type { FetchLike } from '../../../src/main/updater/backends';
import { LATEST_RELEASE_API } from '../../../src/shared/update';

describe('chooseBackend (F8)', () => {
  const packagedWin = { isPackaged: true, platform: 'win32' as const, env: {} };

  it('Windows installs update themselves', () => {
    expect(chooseBackend(packagedWin)).toEqual({ kind: 'nsis' });
  });

  it('macOS and Linux only notify', () => {
    expect(chooseBackend({ ...packagedWin, platform: 'darwin' })).toEqual({ kind: 'github' });
    expect(chooseBackend({ ...packagedWin, platform: 'linux' })).toEqual({ kind: 'github' });
  });

  it('is off in a development build', () => {
    expect(chooseBackend({ ...packagedWin, isPackaged: false })).toEqual({ kind: 'disabled', reason: 'development build' });
  });

  it('is off with an isolated data folder (worktrees, rule 10)', () => {
    expect(chooseBackend({ ...packagedWin, env: { KRNL0_USER_DATA: 'C:/tmp/wt' } })).toMatchObject({ kind: 'disabled' });
  });

  it('KRNL0_DISABLE_UPDATES=1 wins over everything', () => {
    expect(chooseBackend({ ...packagedWin, env: { KRNL0_DISABLE_UPDATES: '1', KRNL0_UPDATES: 'notify' } })).toMatchObject({ kind: 'disabled' });
  });

  it('KRNL0_UPDATES=notify forces the notify check, even in dev', () => {
    expect(chooseBackend({ isPackaged: false, platform: 'win32', env: { KRNL0_UPDATES: 'notify' } })).toEqual({ kind: 'github' });
  });
});

function fetchReturning(status: number, body: unknown): FetchLike & { calls: Array<[string, Record<string, string>]> } {
  const calls: Array<[string, Record<string, string>]> = [];
  const fn = (async (url: string, init: { headers: Record<string, string> }) => {
    calls.push([url, init.headers]);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  }) as FetchLike & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

describe('GitHub notify backend (F3)', () => {
  it('reads the latest published release, unauthenticated', async () => {
    const fetch = fetchReturning(200, { tag_name: 'v0.11.0', html_url: 'https://github.com/theMindDeveloper/KRNL0/releases/tag/v0.11.0' });
    const r = await createGithubNotifyBackend(fetch).latest();
    expect(r).toEqual({ version: '0.11.0', releaseUrl: 'https://github.com/theMindDeveloper/KRNL0/releases/tag/v0.11.0' });
    expect(fetch.calls[0]![0]).toBe(LATEST_RELEASE_API);
    expect(fetch.calls[0]![1]['User-Agent']).toBe('KRNL0-updater');
    expect(fetch.calls[0]![1]['Authorization']).toBeUndefined();
  });

  it('only links github.com release pages', async () => {
    const fetch = fetchReturning(200, { tag_name: 'v0.11.0', html_url: 'https://evil.example/x' });
    const r = await createGithubNotifyBackend(fetch).latest();
    expect(r.releaseUrl).toBe(releasePageUrl('0.11.0'));
  });

  it.each([
    [404, {}, 'no published release yet'],
    [403, {}, 'rate limit'],
    [429, {}, 'rate limit'],
    [500, {}, 'GitHub answered 500'],
    [200, { tag_name: 'v0.11.0', draft: true }, 'not published'],
    [200, { tag_name: 'v0.11.0', prerelease: true }, 'not published'],
    [200, { name: 'no tag' }, 'no tag'],
  ])('HTTP %i %j → error mentioning "%s" (F9)', async (status, body, message) => {
    await expect(createGithubNotifyBackend(fetchReturning(status, body)).latest()).rejects.toThrow(message);
  });

  it('a network failure says GitHub could not be reached', async () => {
    const fetch: FetchLike = async () => { throw new Error('ENOTFOUND'); };
    await expect(createGithubNotifyBackend(fetch).latest()).rejects.toThrow("couldn't reach GitHub (ENOTFOUND)");
  });
});

describe('electron-updater loads in either shape (the v0.10.1 / v0.11.0 update bug)', () => {
  const updater = { autoDownload: true } as unknown as Parameters<typeof pickAutoUpdater>[0];
  it('a real dynamic import: autoUpdater only on default (CommonJS getter)', () => {
    expect(pickAutoUpdater({ default: { autoUpdater: updater } })).toBe(updater);
  });
  it('a bundled require: autoUpdater as a named export', () => {
    expect(pickAutoUpdater({ autoUpdater: updater })).toBe(updater);
  });
  it('neither: a clear error, not "Cannot set properties of undefined"', () => {
    expect(() => pickAutoUpdater({ default: {} })).toThrow('electron-updater did not load');
  });
});
