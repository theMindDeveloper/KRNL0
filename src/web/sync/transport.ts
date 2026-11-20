// The web app's connection to its own server (protocol 1). Same routes as the
// desktop transport (src/main/sync/transport.ts), but as the logged-in browser:
// the session cookie goes along by itself (same origin), writes carry the
// CSRF token, and live changes come over a same-origin WebSocket.
//
// Some phones refuse a WebSocket to a server whose certificate they only
// accepted on the page (self-signed). Then the transport polls the document
// list instead, so the page still follows changes within a few seconds.

import {
  PROTOCOL,
  SyncError,
  type ConnectHandlers,
  type DeleteResult,
  type DocListing,
  type Json,
  type Notice,
  type PutResult,
  type RemoteDoc,
  type SyncTransport,
  type TimelogItem,
} from '../../shared/sync/types';

const TIMEOUT_MS = 30_000;
const POLL_MS = 4000;
/** Failed sockets in a row (while plain requests work) before polling takes over. */
const SOCKET_TRIES = 2;

export interface WebTransportOptions {
  /** '' for the page's own server; a full origin in tests. */
  origin?: string;
  csrf: string;
  appVersion: string;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  /** Extra headers on every request (tests pass the session cookie this way). */
  headers?: Record<string, string>;
  /** Asked when the CSRF token was refused (the session was renewed elsewhere). */
  renewCsrf?: () => Promise<string | null>;
}

type Reply = { status: number; json: () => Promise<Record<string, unknown>>; res: Response };

export class WebTransport implements SyncTransport {
  private connectionId: string | null = null;
  private csrf: string;
  private readonly origin: string;
  private readonly f: typeof fetch;

  constructor(private readonly opts: WebTransportOptions) {
    this.csrf = opts.csrf;
    this.origin = opts.origin ?? '';
    this.f = opts.fetch ?? fetch.bind(globalThis);
  }

  setConnectionId(id: string | null): void { this.connectionId = id; }

  private async call(method: string, path: string, body?: { json?: unknown; raw?: Uint8Array }, retried = false): Promise<Reply> {
    const headers: Record<string, string> = { ...(this.opts.headers ?? {}) };
    if (method !== 'GET') {
      headers['X-KRNL0-CSRF'] = this.csrf;
      if (this.connectionId) headers['X-KRNL0-Connection'] = this.connectionId;
    }
    let payload: BodyInit | null = null;
    if (body?.json !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body.json); }
    else if (body?.raw) { headers['Content-Type'] = 'application/octet-stream'; payload = body.raw as unknown as BodyInit; }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.f(this.origin + path, { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store', signal: ctl.signal });
    } catch (e) {
      throw new SyncError('network', e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) throw new SyncError('auth', 'Your session ended. Log in again.');
    if (res.status === 403 && !retried && this.opts.renewCsrf) {
      const err = await res.clone().json().catch(() => ({})) as { error?: { code?: string } };
      if (err.error?.code === 'csrf') {
        const next = await this.opts.renewCsrf();
        if (next) { this.csrf = next; return this.call(method, path, body, true); }
      }
    }
    if (res.status >= 500 || res.status === 429) throw new SyncError('network', `server answered ${res.status}`);
    return { status: res.status, res, json: () => res.json().catch(() => ({})) as Promise<Record<string, unknown>> };
  }

  /**
   * Server update routes (server-updates F1–F6). Unlike sync calls, a 401 here is a
   * wrong password, not an ended session, so statuses come back as they are.
   */
  async serverCall(method: 'GET' | 'POST' | 'PUT', path: string, json?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = { ...(this.opts.headers ?? {}) };
    if (method !== 'GET') { headers['X-KRNL0-CSRF'] = this.csrf; headers['Content-Type'] = 'application/json'; }
    const res = await this.f(this.origin + path, { method, headers, body: json === undefined ? null : JSON.stringify(json), credentials: 'same-origin', cache: 'no-store' });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { status: res.status, body };
  }

  async listDocs(): Promise<DocListing[]> {
    const r = await this.call('GET', '/api/v1/docs');
    const docs = ((await r.json()).docs as Array<{ name: string; rev: number; deleted?: boolean }>) ?? [];
    return docs.map((d) => ({ name: d.name, rev: d.rev, deleted: !!d.deleted }));
  }

  async getDoc(name: string): Promise<RemoteDoc> {
    const r = await this.call('GET', `/api/v1/docs/${encodeURIComponent(name)}`);
    const j = await r.json();
    if (r.status === 404) {
      const err = j.error as { code?: string; rev?: number } | undefined;
      return { rev: err?.rev ?? 0, body: null, deleted: err?.code === 'deleted' };
    }
    if (r.status !== 200) throw new SyncError('server', `get ${name}: ${r.status}`);
    return { rev: j.rev as number, body: j.body as Json, deleted: false };
  }

  async putDoc(name: string, baseRev: number, body: Json): Promise<PutResult> {
    const r = await this.call('PUT', `/api/v1/docs/${encodeURIComponent(name)}`, { json: { baseRev, body } });
    const j = await r.json();
    if (r.status === 200) return { ok: true, rev: j.rev as number };
    const err = (j.error ?? {}) as { code?: string; rev?: number; body?: Json; deleted?: boolean; storedSchemaVersion?: number; message?: string };
    if (r.status === 413 || (r.status === 400 && err.code === 'invalid')) throw new SyncError('refused', 'This board is too large for the server (20 MB). It stays in this browser; everything else keeps syncing.');
    if (r.status === 409 && err.code === 'schema') return { ok: false, reason: 'schema', storedSchemaVersion: err.storedSchemaVersion ?? 0 };
    if (r.status === 409) return { ok: false, reason: 'conflict', rev: err.rev ?? 0, body: err.body ?? null, deleted: !!err.deleted };
    throw new SyncError('server', `put ${name}: ${r.status} ${err.message ?? ''}`);
  }

  async deleteDoc(name: string, baseRev: number): Promise<DeleteResult> {
    const r = await this.call('DELETE', `/api/v1/docs/${encodeURIComponent(name)}?baseRev=${baseRev}`);
    const j = await r.json();
    if (r.status === 200) return { ok: true, rev: j.rev as number };
    const err = (j.error ?? {}) as { rev?: number; body?: Json; deleted?: boolean };
    if (r.status === 409) return { ok: false, reason: 'conflict', rev: err.rev ?? 0, body: err.body ?? null, deleted: !!err.deleted };
    if (r.status === 404) return { ok: false, reason: 'missing' };
    throw new SyncError('server', `delete ${name}: ${r.status}`);
  }

  async appendTimelog(boardId: string, items: TimelogItem[]): Promise<void> {
    const r = await this.call('POST', `/api/v1/timelog/${encodeURIComponent(boardId)}`, { json: { entries: items } });
    if (r.status !== 200) throw new SyncError('server', `time log: ${r.status}`);
  }

  async queryTimelog(boardId: string, fromMonth: string, toMonth: string): Promise<Record<string, Json[]>> {
    const r = await this.call('GET', `/api/v1/timelog/${encodeURIComponent(boardId)}?from=${fromMonth}&to=${toMonth}`);
    if (r.status !== 200) throw new SyncError('server', `time log: ${r.status}`);
    return ((await r.json()).months as Record<string, Json[]>) ?? {};
  }

  async listTimelog(): Promise<Array<{ id: string; months: string[] }>> {
    const r = await this.call('GET', '/api/v1/timelog');
    return ((await r.json()).boards as Array<{ id: string; months: string[] }>) ?? [];
  }

  async listAssets(): Promise<Array<{ id: string; ext: string; size: number }>> {
    const r = await this.call('GET', '/api/v1/assets');
    return ((await r.json()).assets as Array<{ id: string; ext: string; size: number }>) ?? [];
  }

  async putAsset(id: string, ext: string, bytes: Uint8Array): Promise<void> {
    const r = await this.call('PUT', `/api/v1/assets/${encodeURIComponent(id)}.${encodeURIComponent(ext)}`, { raw: bytes });
    if (r.status === 413 || r.status === 400) throw new SyncError('refused', `asset ${id}: too large for the server`);
    if (r.status !== 201) throw new SyncError('server', `asset ${id}: ${r.status}`);
  }

  async getAsset(id: string): Promise<{ ext: string; bytes: Uint8Array } | null> {
    const r = await this.call('GET', `/api/v1/assets/${encodeURIComponent(id)}`);
    if (r.status !== 200) return null;
    const ext = /\.([a-z0-9]{1,10})$/.exec(r.res.headers.get('X-KRNL0-Asset') ?? '')?.[1];
    return ext ? { ext, bytes: new Uint8Array(await r.res.arrayBuffer()) } : null;
  }

  /** Is the server there at all (public health route)? Tells a blocked socket from a server that is down. */
  async alive(): Promise<boolean> {
    try { return (await this.call('GET', '/api/v1/health')).status === 200; } catch { return false; }
  }

  connect(handlers: ConnectHandlers): () => void {
    const WS = this.opts.WebSocket ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
    let ws: WebSocket | null = null;
    let closed = false;
    let delay = 1000;
    let failedOpens = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let lastPing = 0;

    const wsUrl = (): string => {
      const base = this.origin || (typeof location !== 'undefined' ? location.origin : '');
      return base.replace(/^http/, 'ws') + '/api/v1/sync';
    };

    // ── Polling, when the socket cannot open ──────────────────────────────
    const poll = (): void => {
      let known = new Map<string, number>();
      let first = true;
      let ticks = 0;
      const tick = async (): Promise<void> => {
        if (closed) return;
        try {
          const docs = await this.listDocs();
          if (first) {
            first = false;
            handlers.onOpen({ connectionId: `poll-${Math.random().toString(36).slice(2, 10)}`, serverTime: Date.now(), receivedAt: Date.now() });
          } else if (++ticks % 15 === 0) {
            // Every minute: a full catch-up (time log, pictures).
            handlers.onOpen({ connectionId: `poll-${Math.random().toString(36).slice(2, 10)}`, serverTime: Date.now(), receivedAt: Date.now() });
          } else {
            for (const d of docs) if (known.get(d.name) !== d.rev) handlers.onNotice({ kind: 'doc', name: d.name, rev: d.rev, deleted: !!d.deleted, by: null } as Notice);
          }
          known = new Map(docs.map((d) => [d.name, d.rev]));
          delay = POLL_MS;
        } catch (e) {
          const err = e instanceof SyncError ? e : new SyncError('network', String(e));
          if (err.kind === 'auth') { handlers.onClose({ retrying: false, kind: 'auth', message: err.message }); return; }
          handlers.onClose({ retrying: true, kind: 'network', message: err.message });
          first = true;
          delay = Math.min(30_000, delay * 2);
        }
        if (!closed) pollTimer = setTimeout(() => void tick(), delay);
      };
      void tick();
    };

    // ── The live socket ───────────────────────────────────────────────────
    const open = (): void => {
      if (closed) return;
      if (!WS) { poll(); return; }
      let sock: WebSocket;
      try { sock = new WS(wsUrl()); } catch { poll(); return; }
      ws = sock;
      let opened = false;
      let ended = false;
      const end = (retrying: boolean, kind: 'network' | 'auth' | 'protocol', message: string): void => {
        if (ended) return;
        ended = true;
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        if (closed) return;
        if (!opened && retrying) {
          // Never got through: is the server there at all (then the socket is blocked)?
          failedOpens++;
          void this.alive().then((up) => {
            if (closed) return;
            if (up && failedOpens >= SOCKET_TRIES) { poll(); return; }
            handlers.onClose({ retrying: true, kind, message });
            const wait = Math.round(delay * (0.8 + Math.random() * 0.4));
            delay = Math.min(30_000, delay * 2);
            retryTimer = setTimeout(open, wait);
          });
          return;
        }
        handlers.onClose({ retrying, kind, message });
        if (retrying) {
          const wait = Math.round(delay * (0.8 + Math.random() * 0.4));
          delay = Math.min(30_000, delay * 2);
          retryTimer = setTimeout(open, wait);
        }
      };
      sock.onopen = () => {
        sock.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL, client: 'web', version: this.opts.appVersion }));
      };
      sock.onmessage = (ev: MessageEvent) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(String(ev.data)) as Record<string, unknown>; } catch { return; }
        if (msg.type === 'hello') {
          opened = true;
          failedOpens = 0;
          delay = 1000;
          handlers.onOpen({ connectionId: String(msg.connectionId), serverTime: Number(msg.serverTime ?? Date.now()), receivedAt: Date.now() });
          pingTimer = setInterval(() => {
            lastPing = Date.now();
            if (sock.readyState === 1) sock.send(JSON.stringify({ type: 'ping' }));
          }, 25_000);
        } else if (msg.type === 'change') {
          handlers.onNotice(msg as unknown as Notice);
        } else if (msg.type === 'pong') {
          handlers.onPong?.({ serverTime: Number(msg.at), sentAt: lastPing, receivedAt: Date.now() });
        } else if (msg.type === 'error' && msg.code === 'protocol') {
          // The server serves the matching website: in a browser the fix is always a reload
          // (the server's own words are for the desktop app).
          end(false, 'protocol', 'This page is from another version of your KRNL0 server. Reload the page.');
        }
      };
      sock.onclose = (ev: CloseEvent) => {
        if (ev.code === 4001) end(false, 'auth', 'Your session ended. Log in again.');
        else if (ev.code === 4000) end(false, 'protocol', 'Reload the page: the server was updated.');
        else end(true, 'network', 'connection closed');
      };
      sock.onerror = () => { /* onclose follows with the reason */ };
    };

    // A phone coming back from sleep: try again at once instead of waiting.
    const wake = (): void => {
      if (closed || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      if (ws && ws.readyState <= 1) return;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; delay = 1000; open(); }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wake);

    open();
    return () => {
      closed = true;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', wake);
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (pollTimer) clearTimeout(pollTimer);
      try { ws?.close(1000); } catch { /* already closed */ }
    };
  }
}
