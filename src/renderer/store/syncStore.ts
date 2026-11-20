// Sync with the owner's KRNL0 server in the window (Decision 51, server-sync.md F6).
// Main owns the state (SyncService); this store mirrors it: pulled once on
// mount, then pushed on every change. The top-bar chip and its sheet read it.

import { useEffect } from 'react';
import { create } from 'zustand';
import type { SyncDevice, SyncInfo } from '../../shared/sync/port';
import { IS_WEB } from '../platform';
import { readServerUpdate, type ServerUpdate, type ServerUpdateResult } from '../../shared/sync/serverUpdate';

interface SyncStore {
  info: SyncInfo | null;
}

export const useSyncStore = create<SyncStore>(() => ({ info: null }));

const STATES = new Set(['off', 'connecting', 'synced', 'syncing', 'offline', 'paused', 'update', 'signed-out']);

/** IPC hands us `unknown`; accept only a well-formed status. */
export function parseSyncInfo(raw: unknown): SyncInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['configured'] !== 'boolean' || typeof r['state'] !== 'string' || !STATES.has(r['state'])) return null;
  return raw as SyncInfo;
}

/** Mount once: pull the current status, then follow main's pushes. */
export function useSyncBridge(): void {
  useEffect(() => {
    const bridge = window.krnl;
    if (!bridge?.syncStatus) return;
    let live = true;
    const apply = (raw: unknown): void => { const info = parseSyncInfo(raw); if (live && info) useSyncStore.setState({ info }); };
    const off = bridge.onSyncStatus?.(apply);
    void bridge.syncStatus().then(apply).catch(() => { /* no sync service */ });
    return () => { live = false; off?.(); };
  }, []);
}

export interface ChipLook { label: string; tone: 'acid' | 'cyan' | 'amber' | 'rust' | 'quiet' }

/** The saved badge's words and colour for each state (server-sync.md F6). */
export function chipLook(info: SyncInfo | null): ChipLook {
  if (!info || !info.configured) return { label: 'saved', tone: 'acid' };
  switch (info.state) {
    case 'synced': return { label: 'saved · synced', tone: 'acid' };
    case 'syncing':
    case 'connecting': return { label: 'syncing', tone: 'cyan' };
    case 'offline': return { label: 'saved · offline', tone: 'amber' };
    case 'paused': return { label: 'sync paused', tone: 'rust' };
    case 'update': return { label: IS_WEB ? 'update needed' : 'update KRNL0', tone: 'rust' };
    case 'signed-out': return { label: 'saved · signed out', tone: 'quiet' };
    default: return { label: 'saved', tone: 'acid' };
  }
}

export function agoText(ms: number | null, now = Date.now()): string {
  if (ms === null) return 'not yet';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86_400)} d ago`;
}

export async function fetchDevices(): Promise<SyncDevice[]> {
  const raw = await window.krnl?.syncDevices?.().catch(() => []);
  return Array.isArray(raw) ? (raw as SyncDevice[]) : [];
}

type Result<T> = { ok: true } & T | { ok: false; message: string };

export async function beginConnect(address: string): Promise<Result<{ origin: string; fingerprint: string | null; serverVersion: string; encryption: string }>> {
  const raw = await window.krnl?.syncBegin?.(address);
  return (raw ?? { ok: false, message: 'Sync is not available in this window.' }) as Result<{ origin: string; fingerprint: string | null; serverVersion: string; encryption: string }>;
}

export async function finishConnect(password: string, code?: string): Promise<Result<{ info: SyncInfo }>> {
  const raw = await window.krnl?.syncFinish?.(password, code);
  return (raw ?? { ok: false, message: 'Sync is not available in this window.' }) as Result<{ info: SyncInfo }>;
}

export async function syncNow(): Promise<void> { await window.krnl?.syncRetry?.(); }
/** Disconnect (desktop) or log out (web). On the web, `unsent` > 0 means it did not, to keep changes the server lacks. */
export async function disconnectSync(force = false): Promise<{ ok: boolean; unsent: number }> {
  const r = (await window.krnl?.syncDisconnect?.(force)) as { ok?: boolean; unsent?: number } | undefined;
  return { ok: r?.ok !== false, unsent: typeof r?.unsent === 'number' ? r.unsent : 0 };
}

// ── Server updates (server-updates F1–F6, Decision 52) ─────────────────────
// The store only reads and asks; the server's own updater does the update.


interface ServerUpdateStore {
  update: ServerUpdate | null;
  /** While an update runs (or the server restarts), the page follows it. */
  following: boolean;
}

export const useServerUpdateStore = create<ServerUpdateStore>(() => ({ update: null, following: false }));

/** Reads the server's update state (`check` asks GitHub again on the server). */
export async function refreshServerUpdate(check = false): Promise<ServerUpdate | null> {
  const raw = await window.krnl?.syncServer?.(check).catch(() => null);
  // Desktop and web already normalise it (readServerUpdate); doing it twice would drop the Linux command.
  const update = raw && typeof raw === 'object' && 'channel' in raw && 'commandLinux' in raw ? (raw as ServerUpdate) : readServerUpdate(raw);
  useServerUpdateStore.setState({ update });
  return update;
}

const asResult = (raw: unknown): ServerUpdateResult => {
  const r = (raw ?? {}) as Partial<ServerUpdateResult>;
  return { ok: r.ok === true, message: typeof r.message === 'string' ? r.message : null, update: r.update ?? null };
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Follows a running update until it is done, failed or rolled back. The server
 * restarts meanwhile, so failed reads are expected; gives up after `maxMs`.
 */
export async function followServerUpdate(maxMs = 20 * 60_000, everyMs = 2000): Promise<ServerUpdate | null> {
  useServerUpdateStore.setState({ following: true });
  // The job before this request: a job is this update's once it differs (the server's own
  // timestamps, so the two clocks never have to agree).
  const before = useServerUpdateStore.getState().update?.job?.at ?? null;
  const until = Date.now() + maxMs;
  let last: ServerUpdate | null = null;
  let sawRunning = false;
  try {
    while (Date.now() < until) {
      await sleep(everyMs);
      const u = await refreshServerUpdate(false).catch(() => null);
      if (!u) continue; // restarting
      last = u;
      const state = u.job?.state ?? 'idle';
      if (state === 'running') { sawRunning = true; continue; }
      // The request is picked up within a minute (Docker) or at once (Linux); until
      // then the job shown is the last one, from before this request.
      const fresh = !!u.job && u.job.at !== before;
      if (state === 'idle' || (!sawRunning && !fresh)) continue;
      return u;
    }
    return last;
  } finally {
    useServerUpdateStore.setState({ following: false });
  }
}

/** One click (F2): sends the request with the owner's password, then follows it. */
export async function startServerUpdate(password: string, code?: string): Promise<ServerUpdateResult> {
  const r = asResult(await window.krnl?.syncServerUpdate?.(password, code).catch((e: unknown) => ({ ok: false, message: String(e) })));
  if (r.update) useServerUpdateStore.setState({ update: r.update });
  if (r.ok) void followServerUpdate();
  return r;
}

/** Update by itself at night (F6). */
export async function setServerAuto(on: boolean, password: string, code?: string): Promise<ServerUpdateResult> {
  const r = asResult(await window.krnl?.syncServerAuto?.(on, password, code).catch((e: unknown) => ({ ok: false, message: String(e) })));
  if (r.update) useServerUpdateStore.setState({ update: r.update });
  return r;
}

/** Mount once with the badge: reads the update state now, every 6 hours, and when sync connects. */
export function useServerUpdateWatch(): void {
  const configured = useSyncStore((s) => !!s.info?.configured);
  useEffect(() => {
    if (!configured) { useServerUpdateStore.setState({ update: null }); return; }
    void refreshServerUpdate(false);
    const t = setInterval(() => { void refreshServerUpdate(false); }, 6 * 3600_000);
    return () => clearInterval(t);
  }, [configured]);
}
