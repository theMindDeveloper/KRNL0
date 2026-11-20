// Sync with the owner's KRNL0 server in the window (Decision 51, server-sync.md F6).
// Main owns the state (SyncService); this store mirrors it: pulled once on
// mount, then pushed on every change. The top-bar chip and its sheet read it.

import { useEffect } from 'react';
import { create } from 'zustand';
import type { SyncDevice, SyncInfo } from '../../shared/sync/port';

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
    case 'update': return { label: 'update KRNL0', tone: 'rust' };
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
