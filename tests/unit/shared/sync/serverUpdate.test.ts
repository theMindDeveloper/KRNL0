// @vitest-environment jsdom
// server-updates F1–F6: reading the server's update state, and following an update.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readServerUpdate, needsNewerApp, DOCKER_INSTALL } from '../../../../src/shared/sync/serverUpdate';
import { followServerUpdate, startServerUpdate, useServerUpdateStore } from '../../../../src/renderer/store/syncStore';

const base = { current: '0.1.0', latest: '0.2.0', available: true, url: 'u', checkedAt: null, enabled: true };

describe('reading the server (F1, F4, NF3)', () => {
  it('a 0.1.0 server (no channel) reads as "run the installer once", with all three commands', () => {
    const u = readServerUpdate(base)!;
    expect(u.channel).toBe('command');
    expect(u.command).toBe(DOCKER_INSTALL);
    expect(u.commandWindows).toContain('docker.ps1');
    expect(u.commandLinux).toContain('install.sh');
  });
  it('one-click with a job and the minimum app', () => {
    const u = readServerUpdate({ ...base, channel: 'one-click', minApp: '0.14.0', job: { state: 'running', step: 'download', from: '0.1.0', to: '0.2.0', message: null, at: 'x', auto: false } })!;
    expect(u.channel).toBe('one-click');
    expect(u.job?.step).toBe('download');
    expect(needsNewerApp(u, '0.13.0')).toBe(true);
    expect(needsNewerApp(u, '0.14.0')).toBe(false);
  });
  it('nothing usable reads as null, and odd values are dropped', () => {
    expect(readServerUpdate(null)).toBeNull();
    expect(readServerUpdate({ latest: '0.2.0' })).toBeNull();
    expect(readServerUpdate({ ...base, channel: 'one-click', job: { state: 'exploded' } })?.job).toBeNull();
  });
});

describe('one click, then following it (F2, F3)', () => {
  beforeEach(() => { useServerUpdateStore.setState({ update: null, following: false }); });
  it('a desktop reply keeps the Linux command (it is normalised once)', async () => {
    const { refreshServerUpdate } = await import('../../../../src/renderer/store/syncStore');
    const once = readServerUpdate(base)!;
    // @ts-expect-error a bridge for the test
    window.krnl = { syncServer: vi.fn().mockResolvedValue(once) };
    expect((await refreshServerUpdate())?.commandLinux).toContain('install.sh');
  });

  it('a wrong password comes back as a message, and nothing is followed', async () => {
    // @ts-expect-error a bridge for the test
    window.krnl = { syncServerUpdate: vi.fn().mockResolvedValue({ ok: false, message: 'Wrong password or code.', update: null }) };
    const r = await startServerUpdate('nope');
    expect(r).toMatchObject({ ok: false, message: 'Wrong password or code.' });
    expect(useServerUpdateStore.getState().following).toBe(false);
  });
  it('follows through the restart (failed reads) until the new job is done', async () => {
    // The server's clock is an hour behind this computer's: only the job's own change counts.
    const at = () => new Date(Date.now() - 3600_000).toISOString();
    useServerUpdateStore.setState({ update: readServerUpdate({ ...base, channel: 'one-click', job: { state: 'failed', step: null, from: '0.0.9', to: '0.1.0', message: 'old', at: '2020-01-01T00:00:00Z', auto: false } }) });
    const replies: unknown[] = [
      { ...base, channel: 'one-click', job: { state: 'failed', step: null, from: '0.0.9', to: '0.1.0', message: 'old', at: '2020-01-01T00:00:00Z', auto: false } }, // last time's job: ignored
      { ...base, channel: 'one-click', job: { state: 'running', step: 'switch', from: '0.1.0', to: '0.2.0', message: null, at: at(), auto: false } },
      null, // restarting
      { ...base, current: '0.2.0', available: false, channel: 'one-click', job: { state: 'done', step: null, from: '0.1.0', to: '0.2.0', message: null, at: at(), auto: false } },
    ];
    // @ts-expect-error a bridge for the test
    window.krnl = { syncServer: vi.fn().mockImplementation(async () => replies.shift() ?? null) };
    const u = await followServerUpdate(5000, 1);
    expect(u?.job?.state).toBe('done');
    expect(u?.current).toBe('0.2.0');
    expect(useServerUpdateStore.getState().following).toBe(false);
  });
  it('a rolled-back update ends the following with its reason', async () => {
    const at = new Date(Date.now() + 1000).toISOString();
    // @ts-expect-error a bridge for the test
    window.krnl = { syncServer: vi.fn().mockResolvedValue({ ...base, channel: 'one-click', job: { state: 'rolled-back', step: null, from: '0.1.0', to: '0.2.0', message: 'Your server is back on 0.1.0. Nothing was lost.', at, auto: false } }) };
    const u = await followServerUpdate(5000, 1);
    expect(u?.job?.state).toBe('rolled-back');
    expect(u?.job?.message).toMatch(/Nothing was lost/);
  });
});
