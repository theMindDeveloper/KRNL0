/**
 * Decision 36 — UpdateService, the update state machine (app-updates.md
 * F1, F2, F3, F7, F8, F9; NF3). Backend and timers are fakes.
 */
import { describe, it, expect, vi } from 'vitest';
import { UpdateService } from '../../../src/main/updater/UpdateService';
import type { ReleaseInfo, UpdateBackend, UpdateServiceOptions } from '../../../src/main/updater/UpdateService';
import type { UpdateState } from '../../../src/shared/update';
import { CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, RELEASES_URL } from '../../../src/shared/update';

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** A backend whose answers the test controls. */
function fakeBackend(mode: 'auto' | 'notify', latest: () => Promise<ReleaseInfo>) {
  const downloads: Array<{ progress: (p: number) => void; done: Deferred<void> }> = [];
  const quitAndInstall = vi.fn();
  const backend: UpdateBackend = {
    mode,
    latest: vi.fn(latest),
    ...(mode === 'auto'
      ? {
          download: vi.fn((progress: (p: number) => void) => {
            const done = deferred<void>();
            downloads.push({ progress, done });
            return done.promise;
          }),
          quitAndInstall,
        }
      : {}),
  };
  return { backend, downloads, quitAndInstall };
}

/** Manual timers: run them on demand. */
function fakeTimers() {
  const pending: Array<{ fn: () => void; ms: number; repeat: boolean; id: number }> = [];
  let seq = 0;
  return {
    pending,
    setTimeout: (fn: () => void, ms: number) => { const id = ++seq; pending.push({ fn, ms, repeat: false, id }); return id; },
    setInterval: (fn: () => void, ms: number) => { const id = ++seq; pending.push({ fn, ms, repeat: true, id }); return id; },
    clearTimer: (id: unknown) => { const i = pending.findIndex((t) => t.id === id); if (i >= 0) pending.splice(i, 1); },
    runOnce: (ms: number) => {
      for (const t of [...pending].filter((p) => p.ms === ms)) {
        if (!t.repeat) pending.splice(pending.indexOf(t), 1);
        t.fn();
      }
    },
  };
}

function makeService(backend: UpdateBackend | null, extra: Partial<UpdateServiceOptions> = {}) {
  const timers = fakeTimers();
  const openExternal = vi.fn(async () => {});
  const service = new UpdateService({
    currentVersion: '0.10.0',
    backend,
    openExternal,
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    clearTimer: timers.clearTimer,
    now: () => 1000,
    log: () => {},
    ...extra,
  });
  const seen: UpdateState[] = [];
  service.subscribe((s) => seen.push(s));
  return { service, timers, openExternal, seen };
}

const release = (version: string): ReleaseInfo => ({ version, releaseUrl: `${RELEASES_URL}/tag/v${version}` });

describe('UpdateService — checks (F1)', () => {
  it('reports up-to-date when GitHub has the same version', async () => {
    const { backend } = fakeBackend('auto', async () => release('0.10.0'));
    const { service } = makeService(backend);
    const s = await service.check();
    expect(s.status).toBe('up-to-date');
    expect(s.checkedAt).toBe(1000);
    expect(backend.download).not.toHaveBeenCalled();
  });

  it('never offers an older version', async () => {
    const { backend } = fakeBackend('notify', async () => release('0.9.9'));
    const { service } = makeService(backend);
    expect((await service.check()).status).toBe('up-to-date');
  });

  it('accepts a v-prefixed tag', async () => {
    const { backend } = fakeBackend('notify', async () => ({ version: 'v0.10.1', releaseUrl: 'x' }));
    const { service } = makeService(backend);
    const s = await service.check();
    expect(s.status).toBe('available');
    expect(s.latestVersion).toBe('0.10.1');
  });

  it('shares one check between concurrent callers', async () => {
    const gate = deferred<ReleaseInfo>();
    const { backend } = fakeBackend('notify', () => gate.promise);
    const { service } = makeService(backend);
    const a = service.check();
    const b = service.check();
    expect(service.state().status).toBe('checking');
    gate.resolve(release('0.10.1'));
    const [sa, sb] = await Promise.all([a, b]);
    expect(backend.latest).toHaveBeenCalledTimes(1);
    expect(sa.status).toBe('available');
    expect(sb).toEqual(sa);
  });

  it('schedules the first check after start and then every 4 h', async () => {
    const { backend } = fakeBackend('notify', async () => release('0.10.0'));
    const { service, timers } = makeService(backend);
    service.start();
    expect(timers.pending.map((t) => [t.ms, t.repeat])).toEqual([[FIRST_CHECK_DELAY_MS, false], [CHECK_INTERVAL_MS, true]]);
    timers.runOnce(FIRST_CHECK_DELAY_MS);
    await flush();
    expect(backend.latest).toHaveBeenCalledTimes(1);
    timers.runOnce(CHECK_INTERVAL_MS);
    await flush();
    expect(backend.latest).toHaveBeenCalledTimes(2);
    service.stop();
    expect(timers.pending).toHaveLength(0);
  });
});

describe('UpdateService — Windows auto-install (F2)', () => {
  it('downloads a newer version, reports progress, then is ready', async () => {
    const { backend, downloads } = fakeBackend('auto', async () => release('0.11.0'));
    const { service, seen } = makeService(backend);
    const s = await service.check();
    expect(s.status).toBe('downloading');
    expect(s.latestVersion).toBe('0.11.0');

    downloads[0]!.progress(12.4);
    downloads[0]!.progress(12.9); // same whole percent: no new event
    downloads[0]!.progress(55);
    expect(seen.filter((x) => x.status === 'downloading').map((x) => x.percent)).toEqual([0, 12, 55]);

    downloads[0]!.done.resolve();
    await flush();
    expect(service.state()).toMatchObject({ status: 'ready', latestVersion: '0.11.0', releaseUrl: `${RELEASES_URL}/tag/v0.11.0` });
  });

  it('does not download the same ready update twice', async () => {
    const { backend, downloads } = fakeBackend('auto', async () => release('0.11.0'));
    const { service } = makeService(backend);
    await service.check();
    downloads[0]!.done.resolve();
    await flush();
    const again = await service.check();
    expect(again.status).toBe('ready');
    expect(backend.download).toHaveBeenCalledTimes(1);
  });

  it('does not start a second check while downloading', async () => {
    const { backend } = fakeBackend('auto', async () => release('0.11.0'));
    const { service } = makeService(backend);
    await service.check();
    const s = await service.check();
    expect(s.status).toBe('downloading');
    expect(backend.latest).toHaveBeenCalledTimes(1);
  });

  it('a failed download becomes an error, and the next check retries it', async () => {
    const { backend, downloads } = fakeBackend('auto', async () => release('0.11.0'));
    const { service } = makeService(backend);
    await service.check();
    downloads[0]!.done.reject(new Error('sha512 checksum mismatch'));
    await flush();
    expect(service.state()).toMatchObject({ status: 'error', error: 'download failed: sha512 checksum mismatch' });
    await service.check();
    expect(backend.download).toHaveBeenCalledTimes(2);
  });
});

describe('UpdateService — notify only (F3)', () => {
  it('reports the release page and downloads nothing', async () => {
    const { backend } = fakeBackend('notify', async () => release('0.11.0'));
    const { service } = makeService(backend);
    const s = await service.check();
    expect(s).toMatchObject({ status: 'available', mode: 'notify', latestVersion: '0.11.0', releaseUrl: `${RELEASES_URL}/tag/v0.11.0` });
  });

  it('install opens the download page', async () => {
    const { backend } = fakeBackend('notify', async () => release('0.11.0'));
    const { service, openExternal } = makeService(backend);
    await service.check();
    const r = await service.install();
    expect(r.ok).toBe(true);
    expect(openExternal).toHaveBeenCalledWith(`${RELEASES_URL}/tag/v0.11.0`);
  });

  it('openRelease falls back to the releases list before a version is known', async () => {
    const { backend } = fakeBackend('notify', async () => release('0.10.0'));
    const { service, openExternal } = makeService(backend);
    await service.openRelease();
    expect(openExternal).toHaveBeenCalledWith(RELEASES_URL);
  });
});

describe('UpdateService — install (F7)', () => {
  it('saves first, replies, and only then quits', async () => {
    const { backend, downloads, quitAndInstall } = fakeBackend('auto', async () => release('0.11.0'));
    const order: string[] = [];
    const { service, timers } = makeService(backend, {
      beforeInstall: async () => { order.push('flush'); },
      installDelayMs: 1200,
    });
    quitAndInstall.mockImplementation(() => order.push('quit'));
    await service.check();
    downloads[0]!.done.resolve();
    await flush();

    const r = await service.install();
    order.push('reply');
    expect(r).toEqual({ ok: true, message: 'Restarting into KRNL0 0.11.0…' });
    expect(quitAndInstall).not.toHaveBeenCalled();
    timers.runOnce(1200);
    expect(order).toEqual(['flush', 'reply', 'quit']);
  });

  it('still installs when saving fails (the board is saved on every change)', async () => {
    const { backend, downloads, quitAndInstall } = fakeBackend('auto', async () => release('0.11.0'));
    const { service, timers } = makeService(backend, {
      beforeInstall: async () => { throw new Error('window gone'); },
      installDelayMs: 5,
    });
    await service.check();
    downloads[0]!.done.resolve();
    await flush();
    expect((await service.install()).ok).toBe(true);
    timers.runOnce(5);
    expect(quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('refuses when nothing is ready', async () => {
    const { backend, quitAndInstall } = fakeBackend('auto', async () => release('0.10.0'));
    const { service } = makeService(backend);
    await service.check();
    const r = await service.install();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('up-to-date');
    expect(quitAndInstall).not.toHaveBeenCalled();
  });
});

describe('UpdateService — disabled (F8) and offline (F9)', () => {
  it('is disabled without a backend and never checks', async () => {
    const { service, timers } = makeService(null, { disabledReason: 'development build' });
    expect(service.state()).toMatchObject({ status: 'disabled', reason: 'development build' });
    service.start();
    expect(timers.pending).toHaveLength(0);
    expect((await service.check()).status).toBe('disabled');
  });

  it('a failed check is an error state with a one-line message', async () => {
    const { backend } = fakeBackend('notify', async () => { throw new Error('getaddrinfo ENOTFOUND api.github.com\n    at stack…'); });
    const { service } = makeService(backend);
    const s = await service.check();
    expect(s).toMatchObject({ status: 'error', error: 'getaddrinfo ENOTFOUND api.github.com', checkedAt: 1000 });
  });

  it('a failed check keeps an update that is already ready', async () => {
    let online = true;
    const { backend, downloads } = fakeBackend('auto', async () => {
      if (!online) throw new Error('offline');
      return release('0.11.0');
    });
    const { service } = makeService(backend);
    await service.check();
    downloads[0]!.done.resolve();
    await flush();
    online = false;
    expect((await service.check()).status).toBe('ready');
  });
});

describe('UpdateService — a restart that does not happen (audit 2026-11-09)', () => {
  it('an install that fails later is an error, not "Already restarting" for good', async () => {
    const { backend, downloads, quitAndInstall } = fakeBackend('auto', async () => release('0.11.0'));
    const { service, timers } = makeService(backend, { installDelayMs: 5, installWatchdogMs: 50 });
    quitAndInstall.mockImplementation(() => Promise.reject(new Error('installer missing')));
    await service.check();
    downloads[0]!.done.resolve();
    await flush();
    expect((await service.install()).ok).toBe(true);
    timers.runOnce(5);
    await flush();
    expect(service.state().status).toBe('error');
  });

  it('the app never quit: after a while it is an error and can be tried again', async () => {
    const { backend, downloads } = fakeBackend('auto', async () => release('0.11.0'));
    const { service, timers } = makeService(backend, { installDelayMs: 5, installWatchdogMs: 50 });
    await service.check();
    downloads[0]!.done.resolve();
    await flush();
    await service.install();
    timers.runOnce(5);
    timers.runOnce(50);
    expect(service.state().status).toBe('error');
  });
});
