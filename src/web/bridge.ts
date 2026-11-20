// window.krnl for the web app (Decision 51): the same calls the desktop window
// makes over IPC, answered from this browser's copy (WebHost) and synced by
// the shared engine. No terminal, no assistant, no board CLI, no updater here
// (server-sync.md: the website never runs code on the server).

import { mergeBoards } from '../shared/boardMerge';
import { migrateBoard, seedBoard } from '../shared/boardMigrate';
import { docName, sameContent, stripDevice } from '../shared/sync/shape';
import { stampEntry, TimeLogInputSchema, type TimeLogEntry } from '../shared/timelog';
import { applyPrefsPatch, parseAppState, updateKind, type AppStateFile, type LaunchInfo } from '../shared/appState';
import type { Json } from '../shared/sync/types';
import type { SyncEngine } from '../shared/sync/engine';
import type { SyncDevice, SyncInfo } from '../shared/sync/port';
import { newAssetId, type BoardMeta, type WebHost } from './sync/host';
import type { WebTransport } from './sync/transport';
import type { WebSyncStore } from './sync/store';

const isObject = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  pdf: 'application/pdf',
};

export interface WebBridgeDeps {
  host: WebHost;
  engine: SyncEngine;
  /** What this browser last agreed with the server (to tell unsent changes before logging out). */
  store: WebSyncStore;
  transport: WebTransport;
  appVersion: string;
  /** Writes what is still queued for IndexedDB (before a reload). */
  flush: () => Promise<void>;
  reload: () => void;
  logout: () => Promise<void>;
  /** The server's own address, for the status sheet. */
  origin: string;
  /** A warning about this browser's own copy (none kept, a write failed), or null. */
  storageNote?: () => string | null;
}

// The app's own per-device state (What's new seen, Celebrations, milestones,
// last use): the desktop keeps it in app-state.json, this browser in localStorage.
const APP_STATE_KEY = 'krnl0-app-state';
function readAppState(): AppStateFile {
  try { return parseAppState(JSON.parse(localStorage.getItem(APP_STATE_KEY) ?? 'null') as unknown); } catch { return parseAppState(null); }
}
function writeAppState(s: AppStateFile): void {
  try { localStorage.setItem(APP_STATE_KEY, JSON.stringify(s)); } catch { /* private window: this visit only */ }
}

/** The desktop's board lookup (persistence/boards.ts resolveBoard): id or name, exact then prefix. */
function resolveBoard(boards: BoardMeta[], ref: string | undefined): BoardMeta | string {
  const r = ref?.trim();
  if (!r) return 'missing board name';
  const exact = boards.filter((b) => b.id === r || b.name.toLowerCase() === r.toLowerCase());
  if (exact.length === 1) return exact[0]!;
  const loose = boards.filter((b) => b.id.startsWith(r) || b.name.toLowerCase().startsWith(r.toLowerCase()));
  if (loose.length === 1) return loose[0]!;
  return loose.length > 1 || exact.length > 1 ? `board "${r}" is ambiguous` : `no board "${r}"`;
}

/** How long logging out waits for the last changes to reach the server. */
const LOGOUT_WAIT_MS = 5000;

/** Changes this browser holds that the server does not have yet (logging out would wipe them). */
export function unsentChanges(host: WebHost, store: WebSyncStore): number {
  let n = store.pendingTimelog().length;
  for (const name of host.localDocs()) {
    const local = host.read(name);
    if (local === null) continue;
    const base = store.getBase(name);
    const mine = stripDevice(name, host.normalize(name, local));
    if (!base || base.body === null || !sameContent(mine, base.body)) n++;
  }
  return n;
}

export function createWebBridge(d: WebBridgeDeps): KrnlBridge & { notifyStatus: () => void } {
  const { host, engine } = d;

  // Launch (Decision 38) as the desktop computes it, once per page load.
  let appState = readAppState();
  const launch: LaunchInfo = (() => {
    const now = Date.now();
    const previous = appState.lastVersion;
    const kind = updateKind(previous, d.appVersion);
    const changed = kind === 'feature' || kind === 'patch' || kind === 'downgrade';
    const lastActive = appState.lastActiveAt;
    const info: LaunchInfo = {
      version: d.appVersion,
      previousVersion: changed ? previous : null,
      kind,
      backupFile: null,
      backupDir: '',
      backups: [],
      awayMs: lastActive !== null ? Math.max(0, now - lastActive) : null,
      awayFrom: lastActive,
      simulated: false,
      system: typeof navigator !== 'undefined' ? `Web · ${navigator.platform || 'browser'}` : 'Web',
      prefs: appState,
    };
    appState = { ...appState, lastVersion: d.appVersion, lastActiveAt: now };
    writeAppState(appState);
    return info;
  })();
  // "Last in use" for Welcome back: whenever the page is left or shown again.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { appState = { ...appState, lastActiveAt: Date.now() }; writeAppState(appState); });
  }
  const boardListeners = new Set<() => void>();
  const statusListeners = new Set<(info: unknown) => void>();

  // Same guard as the desktop's board:save (ipc/handlers.ts): when sync changed
  // the open board after the page last loaded it, a save merges both onto the
  // board the page loaded, instead of putting the other device's edit back.
  let pageBase: Json | null = null;
  let stale = false;

  const notifyBoard = (): void => { for (const cb of boardListeners) cb(); };
  host.on({
    activeChanged: () => { stale = true; notifyBoard(); },
    activeSwitched: () => { void d.flush().then(d.reload); },
  });

  const activeId = (): string => {
    const id = host.activeId();
    if (!id) throw new Error('No board yet.');
    return id;
  };
  const changed = (id: string): void => engine.changed(docName.board(id));

  const info = (): SyncInfo => {
    const st = engine.getStatus();
    return {
      configured: true,
      origin: d.origin,
      fingerprint: null,
      deviceName: 'This browser',
      ...st,
      message: st.message ?? d.storageNote?.() ?? null,
    };
  };

  const bridge: KrnlBridge & { notifyStatus: () => void } = {
    notifyStatus: () => { const i = info(); for (const cb of statusListeners) cb(i); },

    // ── The board ───────────────────────────────────────────────────────
    boardLoad: async () => {
      const b = host.activeBoard();
      pageBase = b === null ? null : clone(b);
      stale = false;
      return b;
    },
    boardSave: async (data: unknown) => {
      if (!isObject(data)) return;
      const id = activeId();
      if (stale && pageBase) {
        const n = (v: Json): Record<string, Json> => migrateBoard(clone(v)) as Record<string, Json>;
        const theirs = host.activeBoard();
        if (theirs !== null) {
          host.saveBoard(id, mergeBoards(n(pageBase), n(data), n(theirs)) as Json);
          pageBase = clone(data);
          changed(id);
          notifyBoard(); // the page reloads the merged board (its boardLoad clears `stale`)
          return;
        }
      }
      host.saveBoard(id, clone(data));
      pageBase = clone(data);
      changed(id);
    },
    boardReset: async () => {
      const id = activeId();
      host.saveBoard(id, migrateBoard(seedBoard()) as Json);
      changed(id);
      const b = host.activeBoard();
      pageBase = b === null ? null : clone(b);
      stale = false;
      return b;
    },
    boardSaveViewport: async (viewport) => {
      const id = host.activeId();
      const b = id ? host.read(docName.board(id)) : null;
      if (!id || !isObject(b)) return;
      // The view is this browser's own (never uploaded): no sync needed.
      host.saveBoard(id, { ...b, viewport, savedAt: new Date().toISOString() } as Json);
    },
    onBoardChanged: (cb) => { boardListeners.add(cb); return () => { boardListeners.delete(cb); }; },

    // ── No terminal on the web ──────────────────────────────────────────
    ptyCreate: async () => { throw new Error('The terminal is only in the desktop app.'); },
    ptyWrite: async () => {},
    ptyResize: async () => {},
    ptyKill: async () => {},
    onPtyData: () => () => {},
    onPtyExit: () => () => {},

    // ── Pictures and files ──────────────────────────────────────────────
    assetWrite: async (ext, bytes) => {
      const e = ext.toLowerCase().replace(/^\./, '');
      const norm = e === 'jpeg' ? 'jpg' : e;
      const assetId = newAssetId();
      host.writeAsset(assetId, norm, bytes);
      engine.assetAdded(assetId);
      return { assetId, ext: norm };
    },
    assetRead: async (assetId) => {
      let a = host.readAsset(assetId);
      if (!a) {
        // Not here yet (large files are fetched when first shown).
        const got = await d.transport.getAsset(assetId).catch(() => null);
        if (got) { host.writeAsset(assetId, got.ext, got.bytes); a = got; }
      }
      return a ? { bytes: a.bytes, mimeType: MIME[a.ext] ?? 'application/octet-stream' } : null;
    },
    assetDelete: async (assetId) => { host.deleteFile(assetId); },

    // ── Boards ──────────────────────────────────────────────────────────
    boardsList: async () => {
      const idx = host.list();
      if (!idx) return { activeId: '', boards: [], recording: null, notice: null };
      return {
        activeId: idx.activeId,
        boards: idx.boards.map((b) => ({ ...b, active: b.id === idx.activeId, ...host.facts(b.id) })),
        recording: null,
        notice: null,
      };
    },
    boardsCreate: async (name, copyHabits) => {
      const idx = host.list();
      const trimmed = name.trim();
      if (!idx) return { ok: false, message: 'No board list yet.' };
      if (!trimmed) return { ok: false, message: 'a board needs a name' };
      if (idx.boards.some((b) => b.name.toLowerCase() === trimmed.toLowerCase())) return { ok: false, message: `there is already a board called "${trimmed}"` };
      const seed = migrateBoard(seedBoard()) as Record<string, Json>;
      const active = host.activeBoard();
      if (isObject(active)) {
        if (active.uiMode) seed.uiMode = active.uiMode;
        if (active.layoutMode) seed.layoutMode = active.layoutMode;
        if (copyHabits) {
          const habitOf = (b: Record<string, Json>): Record<string, Json> | undefined =>
            (b.nodes as Json[]).find((n): n is Record<string, Json> => isObject(n) && n.kind === 'habit' && n.isMother === true);
          const from = ((habitOf(active)?.state as { habits?: Array<Record<string, Json>> } | undefined)?.habits ?? []);
          const target = habitOf(seed);
          if (target) {
            target.state = {
              ...(isObject(target.state) ? target.state : {}),
              habits: from.filter((h) => !h.archived).map((h) => {
                const { log: _l, counts: _c, exceptions: _e, rest: _r, pauses: _p, ...keep } = h;
                void _l; void _c; void _e; void _r; void _p;
                return { ...keep, id: crypto.randomUUID(), log: [], createdAt: new Date().toISOString() };
              }),
            };
          }
        }
      }
      const id = `board-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      host.saveBoard(id, seed as Json);
      host.saveIndex({ ...idx, boards: [...idx.boards, { id, name: trimmed }] });
      engine.changed('boards');
      changed(id);
      return { ok: true, message: `created board "${trimmed}"`, board: { id, name: trimmed } };
    },
    boardsRename: async (ref, name) => {
      const idx = host.list();
      const trimmed = name.trim();
      if (!idx) return { ok: false, message: 'No board list yet.' };
      if (!trimmed) return { ok: false, message: 'a board needs a name' };
      const hit = resolveBoard(idx.boards, ref);
      if (typeof hit === 'string') return { ok: false, message: hit };
      if (idx.boards.some((b) => b.id !== hit.id && b.name.toLowerCase() === trimmed.toLowerCase())) return { ok: false, message: `there is already a board called "${trimmed}"` };
      host.saveIndex({ ...idx, boards: idx.boards.map((b) => (b.id === hit.id ? { id: hit.id, name: trimmed } : b)) });
      engine.changed('boards');
      return { ok: true, message: `renamed to "${trimmed}"`, board: { id: hit.id, name: trimmed } };
    },
    boardsDelete: async (ref) => {
      const idx = host.list();
      if (!idx) return { ok: false, message: 'No board list yet.' };
      const hit = resolveBoard(idx.boards, ref);
      if (typeof hit === 'string') return { ok: false, message: hit };
      if (hit.id === idx.activeId) return { ok: false, message: 'switch to another board first' };
      if (idx.boards.length <= 1) return { ok: false, message: 'the last board stays' };
      host.remove(docName.board(hit.id));
      engine.changed('boards');
      changed(hit.id);
      return { ok: true, message: `deleted "${hit.name}" (kept in this browser)`, board: hit };
    },
    boardsSwitch: async (ref) => {
      const idx = host.list();
      if (!idx) return { ok: false, message: 'No board list yet.' };
      const hit = resolveBoard(idx.boards, ref);
      if (typeof hit === 'string') return { ok: false, message: hit };
      if (hit.id === idx.activeId) return { ok: true, message: 'already open' };
      host.setActive(hit.id);
      try { sessionStorage.setItem('krnl0-board-switch', '1'); } catch { /* private window */ }
      await d.flush();
      d.reload();
      return { ok: true, message: `opened "${hit.name}"` };
    },
    boardsAckNotice: async () => {},

    // ── Clipboard ───────────────────────────────────────────────────────
    clipboardReadText: async () => { try { return await navigator.clipboard.readText(); } catch { return ''; } },
    clipboardWriteText: async (text) => { try { await navigator.clipboard.writeText(text); } catch { /* not allowed here */ } },

    // ── Time log ────────────────────────────────────────────────────────
    timelogAppend: async (raw) => {
      const list = Array.isArray(raw) ? raw : [raw];
      const id = host.activeId();
      if (!id) return { ok: false, written: 0 };
      const now = Date.now();
      const stamped: TimeLogEntry[] = [];
      for (const item of list) {
        const parsed = TimeLogInputSchema.safeParse(item);
        if (!parsed.success) continue;
        try { stamped.push(stampEntry(parsed.data, now)); } catch { /* invalid entry: dropped */ }
      }
      if (stamped.length > 0) {
        host.appendTimelog(id, stamped);
        engine.timelogAppended(id, stamped as unknown as Json[]);
      }
      return { ok: stamped.length === list.length, written: stamped.length };
    },
    timelogQuery: async (fromYMD) => {
      const id = host.activeId();
      return id ? host.queryTimelog(id, fromYMD) : [];
    },

    // ── App state (What's new, Celebrations, milestones) ─────────────────
    appLaunch: async () => ({ ...launch, prefs: appState }),
    appPrefsSet: async (patch) => { appState = applyPrefsPatch(appState, patch); writeAppState(appState); return appState; },

    // ── Links ───────────────────────────────────────────────────────────
    appOpenExternal: async (url) => {
      let u: URL;
      try { u = new URL(url); } catch { return { ok: false, message: 'not a link' }; }
      // Feedback by email (Help › Send feedback) opens the mail app.
      if (u.protocol === 'mailto:') { window.location.href = u.toString(); return { ok: true, message: 'opened' }; }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, message: 'only web links open' };
      window.open(u.toString(), '_blank', 'noopener,noreferrer');
      return { ok: true, message: 'opened' };
    },

    // ── Sync status (the top-bar chip) ──────────────────────────────────
    syncStatus: async () => info(),
    onSyncStatus: (cb) => { statusListeners.add(cb); return () => { statusListeners.delete(cb); }; },
    syncRetry: async () => { await engine.syncNow(); return { ok: true, info: info() }; },
    syncDevices: async (): Promise<SyncDevice[]> => {
      try {
        const r = await fetch('/api/v1/devices', { credentials: 'same-origin', cache: 'no-store' });
        if (!r.ok) return [];
        const j = (await r.json()) as { devices?: SyncDevice[] };
        return (j.devices ?? []).map((x) => ({ id: x.id, name: x.name, platform: x.platform, lastSeenAt: x.lastSeenAt, current: false }));
      } catch {
        return [];
      }
    },
    // On the web "disconnect" is logging out of this browser, which wipes its
    // copy: first send what is left (F4, F5); if the server still lacks
    // something, say how much instead of logging out (unless forced).
    syncDisconnect: async (force?: boolean) => {
      if (!force) {
        await Promise.race([
          engine.syncNow().then(() => engine.idle()),
          new Promise((r) => setTimeout(r, LOGOUT_WAIT_MS)),
        ]).catch(() => {});
        const unsent = unsentChanges(host, d.store);
        if (unsent > 0) return { ok: false, unsent };
      }
      await d.logout();
      return { ok: true };
    },
  };
  return bridge;
}
