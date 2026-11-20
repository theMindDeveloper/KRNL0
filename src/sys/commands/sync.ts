/**
 * `krnl sync …` (Decision 51, server-sync.md F1, F6) — connect this computer to
 * the owner's KRNL0 server and see how sync is doing. The same service as
 * Settings › Sync; runs in the app (the terminal talks to it).
 */

import type { SyncInfo, SyncPort } from '../../shared/sync/port';
import type { SysResult } from '../SysFacade';

const ago = (ms: number | null): string => {
  if (ms === null) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
};

const STATE_WORDS: Record<SyncInfo['state'], string> = {
  off: 'off',
  connecting: 'connecting',
  synced: 'synced',
  syncing: 'syncing',
  offline: 'offline — changes kept',
  paused: 'sync paused — run: krnl sync retry',
  update: 'update KRNL0 to keep syncing',
  'signed-out': 'signed out — connect again',
};

export function syncStatus(port: SyncPort, json: boolean): SysResult {
  const s = port.info();
  if (json) return { ok: true, message: JSON.stringify(s, null, 2), data: s };
  if (!s.configured) {
    return { ok: true, message: 'Sync is off. Connect a server: krnl sync connect <address>   (or Settings › Sync)', data: s };
  }
  const lines = [
    `sync: ${STATE_WORDS[s.state]}`,
    `server: ${s.origin ?? ''}`,
    `this computer: ${s.deviceName ?? ''}`,
    `last sync: ${ago(s.lastSyncedAt)}`,
  ];
  if (s.clockOffsetMs !== null && Math.abs(s.clockOffsetMs) > 5000) lines.push(`clock: off by ${Math.round(s.clockOffsetMs / 1000)} s — timers may show a different time than on other devices`);
  if (s.readOnly.length > 0) lines.push(`not syncing (saved by a newer KRNL0): ${s.readOnly.join(', ')}`);
  if (s.message) lines.push(s.message);
  return { ok: true, message: lines.join('\n'), data: s };
}

export async function syncConnect(port: SyncPort, address: string | undefined): Promise<SysResult> {
  if (!address) return { ok: false, message: 'Usage: krnl sync connect <address>   e.g. krnl sync connect 192.168.1.20:8443' };
  try {
    const r = await port.begin(address);
    const fp = r.fingerprint
      ? `\nFingerprint (compare with "krnl0 fingerprint" on the server — every character):\n  ${r.fingerprint}\n`
      : '\nThe server uses a publicly trusted certificate.\n';
    return { ok: true, message: `Found KRNL0 server ${r.serverVersion} at ${r.origin} (encryption: ${r.encryption}).${fp}\nIf it matches, pair this computer:\n  krnl sync pair --password-stdin [--code <2FA code>]`, data: r };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncPair(port: SyncPort, password: string | undefined, code: string | undefined): Promise<SysResult> {
  if (!password) return { ok: false, message: 'Usage: krnl sync pair --password-stdin [--code <2FA code>]   (the password is read from stdin)' };
  try {
    const s = await port.finish(password, code);
    return { ok: true, message: `Paired. This computer now syncs with ${s.origin ?? 'the server'}.`, data: s };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncDisconnect(port: SyncPort): Promise<SysResult> {
  await port.disconnect();
  return { ok: true, message: 'Sync is off. The boards on this computer stay as they are.' };
}

export async function syncRetry(port: SyncPort): Promise<SysResult> {
  const s = await port.retry();
  return syncStatus({ ...port, info: () => s }, false);
}

/**
 * `krnl sync server` (server-updates F8): the server's version and how it updates.
 * Updating needs the server password, so it happens in the app (saved › Update
 * server), never in the terminal.
 */
export async function syncServer(port: SyncPort, json: boolean): Promise<SysResult> {
  if (!port.info().configured) return { ok: false, message: 'Sync is off: no server to look at. Connect one: krnl sync connect <address>', data: { exitCode: 1 } };
  const u = await port.serverUpdate(true);
  if (!u) return { ok: false, message: "Can't reach the server right now. Try again when it is online.", data: { exitCode: 1 } };
  if (json) return { ok: true, message: JSON.stringify(u, null, 2), data: u };
  const lines = [
    `server: ${u.current}${u.available && u.latest ? ` — ${u.latest} is out` : ' (newest)'}`,
    `updates: ${u.channel === 'one-click' ? 'one click in the app: saved › Update server (asks for the server password)' : u.channel === 'command' ? 'run on the server once:' : 'from source (git)'}`,
  ];
  if (u.channel === 'command' && u.command) lines.push(`  ${u.command}`, ...(u.commandWindows ? [`  Windows: ${u.commandWindows}`] : []), ...(u.commandLinux ? [`  Linux without Docker: ${u.commandLinux}`] : []));
  lines.push(`at night: ${u.auto ? 'on (04:00)' : 'off'}`);
  if (u.job && u.job.state !== 'idle') lines.push(`last update: ${u.job.state}${u.job.to ? ` ${u.job.from ?? ''} → ${u.job.to}` : ''}${u.job.message ? ` — ${u.job.message}` : ''}`);
  if (u.minApp) lines.push(`needs KRNL0 ${u.minApp} or newer on your computers`);
  return { ok: true, message: lines.join('\n'), data: u };
}
