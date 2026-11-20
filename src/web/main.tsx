// The KRNL0 web app (Decision 51). Boot order:
//   1. Logged in? (the server only serves this page to its owner, but a session
//      can end while the page is cached) — else to /login.
//   2. This browser's copy from IndexedDB, then sync starts.
//   3. Nothing here yet: wait for the first sync. Still nothing: the first-run page.
//   4. window.krnl is the web bridge, then the same App as the desktop window.

import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
// React Flow's own styles first, the app's theme after (the desktop's order:
// there App, and with it the canvas, is imported before the theme). The other
// way round, React Flow's defaults win: a white map, white controls.
import '@xyflow/react/dist/style.css';
import '../renderer/styles/tokens.css';
import '../renderer/styles/reactflow-theme.css';
import '../renderer/styles/chassis.css';
import '../renderer/styles/window-frame.css';
import '../renderer/styles/launch.css';
import './fonts';
import './web.css';
import { SyncEngine } from '../shared/sync/engine';
import { docName } from '../shared/sync/shape';
import type { SyncStatus } from '../shared/sync/types';
import { openKv, type Kv } from './sync/kv';
import { WebHost } from './sync/host';
import { WebSyncStore } from './sync/store';
import { WebTransport } from './sync/transport';
import { createWebBridge } from './bridge';
import { FirstRun } from './FirstRun';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
const FIRST_SYNC_WAIT_MS = 12_000;

async function session(): Promise<{ csrf: string } | null> {
  const r = await fetch('/api/v1/auth/session', { credentials: 'same-origin', cache: 'no-store' });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`The server answered ${r.status}.`);
  return (await r.json()) as { csrf: string };
}

function toLogin(): void { location.replace('/login'); }

function bootDone(): void { document.getElementById('web-boot')?.remove(); }

function showError(root: Root, message: string): void {
  bootDone();
  root.render(
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--rust-deep)' }}>KRNL0 could not open</span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{message}</p>
        <button type="button" onClick={() => location.reload()} style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 20px', border: 0, borderRadius: 6, background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.1em', fontSize: 12, cursor: 'pointer' }}>TRY AGAIN</button>
      </div>
    </main>,
  );
}

/** Resolves once the first catch-up has finished (or failed), or after `ms`. */
function firstSync(engine: SyncEngine, subscribe: (cb: (s: SyncStatus) => void) => void, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    subscribe((s) => {
      if (s.lastSyncedAt !== null || ['offline', 'paused', 'update', 'signed-out'].includes(s.state)) { clearTimeout(timer); resolve(); }
    });
    if (engine.getStatus().lastSyncedAt !== null) { clearTimeout(timer); resolve(); }
  });
}

async function boot(): Promise<void> {
  const el = document.getElementById('root');
  if (!el) throw new Error('Missing #root element');
  const root = createRoot(el);

  let s: { csrf: string } | null;
  try { s = await session(); } catch (e) { showError(root, `The server could not be reached. ${e instanceof Error ? e.message : ''}`); return; }
  if (!s) { toLogin(); return; }
  let csrf = s.csrf;

  const kv: Kv = await openKv();
  const all = await kv.loadAll();
  const host = new WebHost(kv);
  host.load(all);
  const store = new WebSyncStore(kv);
  store.load(all);

  const transport = new WebTransport({
    csrf,
    appVersion: APP_VERSION,
    renewCsrf: async () => { const n = await session().catch(() => null); if (n) csrf = n.csrf; return n?.csrf ?? null; },
  });

  const statusSubs = new Set<(st: SyncStatus) => void>();
  let bridgeRef: ReturnType<typeof createWebBridge> | null = null;
  // Set while the first-run page is up: boards arriving from another device open the app.
  let onBoardsArrived: (() => void) | null = null;
  const engine = new SyncEngine({
    transport,
    host,
    store,
    onStatus: (st) => {
      for (const cb of statusSubs) cb(st);
      if (onBoardsArrived && host.hasBoards()) onBoardsArrived();
      if (bridgeRef) bridgeRef.notifyStatus({ configured: true, origin: location.origin, fingerprint: null, deviceName: 'This browser', ...st });
      if (st.state === 'signed-out') { void kv.flush().then(toLogin); }
    },
    log: (m, f) => console.info(`[sync] ${m}`, f ?? ''),
  });

  const logout = async (): Promise<void> => {
    engine.stop();
    // Nothing of the owner's stays in this browser after logging out.
    await kv.clear().catch(() => {});
    try { sessionStorage.clear(); localStorage.removeItem('krnl0-theme'); } catch { /* private window */ }
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-KRNL0-CSRF': csrf } }).catch(() => {});
    toLogin();
  };

  const bridge = createWebBridge({
    host, engine, transport, appVersion: APP_VERSION, origin: location.origin,
    flush: () => kv.flush(), reload: () => location.reload(), logout,
  });
  bridgeRef = bridge;
  window.krnl = bridge;

  engine.start();

  if (!host.hasBoards()) {
    await firstSync(engine, (cb) => statusSubs.add(cb), FIRST_SYNC_WAIT_MS);
  }

  let appShown = false;
  const renderApp = async (): Promise<void> => {
    if (appShown) return;
    appShown = true;
    onBoardsArrived = null;
    const [{ App }, log, themes, colors, budget] = await Promise.all([
      import('../renderer/App'),
      import('../renderer/store/eventLog'),
      import('../renderer/styles/dock-themes'),
      import('../renderer/store/taskColors'),
      import('../renderer/utils/frameBudget'),
    ]);
    log.installGlobalErrorCapture();
    log.installBoardSaveLogging();
    themes.installDockThemes();
    colors.installTaskColors();
    budget.installFrameBudget();
    bootDone();
    root.render(<StrictMode><App /></StrictMode>);
  };

  if (!host.hasBoards()) {
    bootDone();
    // The desktop app connects while this page is open: its boards arrive, the app opens.
    onBoardsArrived = () => { void renderApp(); };
    root.render(
      <FirstRun
        onStart={() => {
          const id = host.startFresh();
          engine.changed('boards');
          engine.changed(docName.board(id));
          void renderApp();
        }}
        onLogout={() => void logout()}
      />,
    );
    return;
  }
  await renderApp();
}

void boot().catch((e: unknown) => {
  console.error('[web] boot failed', e);
  const el = document.getElementById('root');
  if (el) showError(createRoot(el), e instanceof Error ? e.message : String(e));
});
