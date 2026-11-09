// App updates in the window (Decision 36, docs/06-requirements/app-updates.md).
// Main owns the state (UpdateService); this store mirrors it — pulled once on
// mount (an update can be ready before the window exists) and then pushed on
// every change. The notice bar, status bar and Settings all read from here.

import { useEffect } from 'react';
import { create } from 'zustand';
import { useBoardStore } from './boardStore';
import type { UpdateState, UpdateStatus } from '../../shared/update';

interface UpdateStore {
  state: UpdateState | null;
  /** Version whose notice the user closed with "Later" (this run only). */
  dismissed: string | null;
  /** A manual check is running (Settings button). */
  checking: boolean;
  /** The last manual check failed: shown once as a notice with Retry (automatic checks fail quietly). */
  manualError: string | null;
}

export const useUpdateStore = create<UpdateStore>(() => ({ state: null, dismissed: null, checking: false, manualError: null }));

const STATUSES: ReadonlySet<UpdateStatus> = new Set<UpdateStatus>([
  'disabled', 'idle', 'checking', 'up-to-date', 'available', 'downloading', 'ready', 'error',
]);

/** IPC hands us `unknown`; accept only a well-formed state. */
export function parseUpdateState(raw: unknown): UpdateState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['status'] !== 'string' || !STATUSES.has(r['status'] as UpdateStatus)) return null;
  if (typeof r['currentVersion'] !== 'string') return null;
  if (r['mode'] !== 'auto' && r['mode'] !== 'notify') return null;
  return raw as UpdateState;
}

function apply(raw: unknown): void {
  const state = parseUpdateState(raw);
  if (state) useUpdateStore.setState({ state });
}

/** Mount once (App): pull the current state, then follow main's pushes. */
export function useUpdateBridge(): void {
  useEffect(() => {
    const bridge = window.krnl;
    if (!bridge?.updateGetState) return;
    let live = true;
    const off = bridge.onUpdateState?.((s) => { if (live) apply(s); });
    void bridge.updateGetState().then((s) => { if (live) apply(s); }).catch(() => { /* no updater */ });
    return () => { live = false; off?.(); };
  }, []);
}

export function clearManualUpdateError(): void {
  useUpdateStore.setState({ manualError: null });
}

/** "Later": hide the notice for this version until the next launch. */
export function dismissUpdateNotice(): void {
  const v = useUpdateStore.getState().state?.latestVersion ?? null;
  useUpdateStore.setState({ dismissed: v });
}

export async function checkForUpdates(): Promise<void> {
  const bridge = window.krnl;
  if (!bridge?.updateCheck) return;
  useUpdateStore.setState({ checking: true, manualError: null });
  try {
    const raw = await bridge.updateCheck();
    apply(raw);
    const st = parseUpdateState(raw);
    if (st?.status === 'error') useUpdateStore.setState({ manualError: st.error ?? 'unknown error' });
  } catch (err) {
    useUpdateStore.setState({ manualError: err instanceof Error ? err.message : String(err) });
  } finally {
    useUpdateStore.setState({ checking: false });
  }
}

/**
 * Commit an in-progress edit and save the camera before the app quits (F7).
 * The board itself is saved on every change; text fields commit on blur, and
 * the camera is saved on a 500 ms debounce, so those two are the gap.
 */
export async function flushBeforeRestart(): Promise<void> {
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body) active.blur();
  // Let the blur handlers write their change into the store and save it.
  await new Promise((resolve) => setTimeout(resolve, 60));
  const { board, viewport } = useBoardStore.getState();
  if (board) await window.krnl?.boardSaveViewport?.(viewport);
}

export async function restartToUpdate(): Promise<void> {
  const bridge = window.krnl;
  if (!bridge?.updateInstall) return;
  await flushBeforeRestart();
  const r = await bridge.updateInstall();
  if (!r.ok) console.warn('[updater]', r.message);
}

export async function openReleasePage(): Promise<void> {
  await window.krnl?.updateOpenRelease?.();
}

export interface UpdateAction {
  label: string;
  title: string;
  run: () => Promise<void>;
}

/** The one thing to do about this state, if any: restart (auto) or download (notify). */
export function primaryUpdateAction(s: UpdateState | null): UpdateAction | null {
  if (!s) return null;
  if (s.status === 'ready') {
    return { label: 'Restart', title: `Restart KRNL0 and install ${s.latestVersion ?? 'the update'}`, run: restartToUpdate };
  }
  if (s.status === 'available' && s.mode === 'notify') {
    return { label: 'Download', title: `Open the KRNL0 ${s.latestVersion ?? ''} download page`, run: openReleasePage };
  }
  return null;
}
