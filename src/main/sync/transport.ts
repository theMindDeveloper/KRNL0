// The desktop's connection to the owner's KRNL0 server (protocol 1).
// https + WebSocket; with a self-signed server the connection trusts only the
// server's own CA, pinned at pairing (requirement F1) — host names do not
// matter then, the pinned CA is the identity. Bodies are gzip-compressed.

import https from 'https';
import { gunzipSync, gzipSync } from 'zlib';
import WebSocket from 'ws';
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

export interface ServerLink {
  /** https://host:port */
  origin: string;
  token: string;
  /** The server's CA (self-signed mode), or null for a publicly trusted certificate. */
  caPem: string | null;
}

const GZIP_MIN = 1024;
const TIMEOUT_MS = 30_000;

export function tlsOptions(caPem: string | null): https.RequestOptions {
  return caPem ? { ca: caPem, checkServerIdentity: () => undefined } : {};
}

interface Reply { status: number; body: Buffer; /** X-KRNL0-Asset: <id>.<ext> */ name?: string }

/** One https request; network failures become SyncError('network'). */
export function request(origin: string, method: string, path: string, opts: { caPem: string | null; token?: string; json?: unknown; raw?: Uint8Array; headers?: Record<string, string>; insecure?: boolean }): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, origin);
    const headers: Record<string, string> = { 'Accept-Encoding': 'gzip', ...(opts.headers ?? {}) };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    let payload: Buffer | undefined;
    if (opts.json !== undefined) {
      const text = Buffer.from(JSON.stringify(opts.json), 'utf8');
      headers['Content-Type'] = 'application/json';
      if (text.length >= GZIP_MIN) { payload = gzipSync(text); headers['Content-Encoding'] = 'gzip'; } else payload = text;
    } else if (opts.raw) {
      payload = Buffer.from(opts.raw);
      headers['Content-Type'] = 'application/octet-stream';
    }
    if (payload) headers['Content-Length'] = String(payload.length);
    const req = https.request(url, {
      method,
      headers,
      timeout: TIMEOUT_MS,
      ...(opts.insecure ? { rejectUnauthorized: false } : tlsOptions(opts.caPem)),
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        let body = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') {
          try { body = gunzipSync(body); } catch { reject(new SyncError('network', 'bad compressed reply')); return; }
        }
        const name = res.headers['x-krnl0-asset'];
        resolve({ status: res.statusCode ?? 0, body, ...(typeof name === 'string' ? { name } : {}) });
      });
      res.on('error', (e) => reject(new SyncError('network', e.message)));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (e) => reject(new SyncError('network', e.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

const jsonOf = (r: Reply): Record<string, unknown> => {
  try { return JSON.parse(r.body.toString('utf8')) as Record<string, unknown>; } catch { return {}; }
};

export class NodeTransport implements SyncTransport {
  private connectionId: string | null = null;

  constructor(private readonly link: ServerLink, private readonly appVersion: string) {}

  setConnectionId(id: string | null): void { this.connectionId = id; }

  private async call(method: string, path: string, opts: { json?: unknown; raw?: Uint8Array } = {}): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (this.connectionId && method !== 'GET') headers['X-KRNL0-Connection'] = this.connectionId;
    const r = await request(this.link.origin, method, path, { caPem: this.link.caPem, token: this.link.token, headers, ...opts });
    if (r.status === 401) throw new SyncError('auth', 'This device is no longer paired.');
    if (r.status >= 500 || r.status === 429) throw new SyncError('network', `server answered ${r.status}`);
    return r;
  }

  async listDocs(): Promise<DocListing[]> {
    const r = await this.call('GET', '/api/v1/docs');
    return ((jsonOf(r).docs as Array<{ name: string; rev: number; deleted?: boolean }>) ?? []).map((d) => ({ name: d.name, rev: d.rev, deleted: !!d.deleted }));
  }

  async getDoc(name: string): Promise<RemoteDoc> {
    const r = await this.call('GET', `/api/v1/docs/${encodeURIComponent(name)}`);
    const j = jsonOf(r);
    if (r.status === 404) {
      const err = j.error as { code?: string; rev?: number } | undefined;
      return { rev: err?.rev ?? 0, body: null, deleted: err?.code === 'deleted' };
    }
    if (r.status !== 200) throw new SyncError('server', `get ${name}: ${r.status}`);
    return { rev: j.rev as number, body: j.body as Json, deleted: false };
  }

  async putDoc(name: string, baseRev: number, body: Json): Promise<PutResult> {
    const r = await this.call('PUT', `/api/v1/docs/${encodeURIComponent(name)}`, { json: { baseRev, body } });
    const j = jsonOf(r);
    if (r.status === 200) return { ok: true, rev: j.rev as number };
    const err = (j.error ?? {}) as { code?: string; rev?: number; body?: Json; deleted?: boolean; storedSchemaVersion?: number; message?: string };
    if (r.status === 409 && err.code === 'schema') return { ok: false, reason: 'schema', storedSchemaVersion: err.storedSchemaVersion ?? 0 };
    if (r.status === 409) return { ok: false, reason: 'conflict', rev: err.rev ?? 0, body: err.body ?? null, deleted: !!err.deleted };
    throw new SyncError('server', `put ${name}: ${r.status} ${err.message ?? ''}`);
  }

  async deleteDoc(name: string, baseRev: number): Promise<DeleteResult> {
    const r = await this.call('DELETE', `/api/v1/docs/${encodeURIComponent(name)}?baseRev=${baseRev}`);
    const j = jsonOf(r);
    if (r.status === 200) return { ok: true, rev: j.rev as number };
    const err = (j.error ?? {}) as { code?: string; rev?: number; body?: Json; deleted?: boolean };
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
    return (jsonOf(r).months as Record<string, Json[]>) ?? {};
  }

  async listTimelog(): Promise<Array<{ id: string; months: string[] }>> {
    const r = await this.call('GET', '/api/v1/timelog');
    return (jsonOf(r).boards as Array<{ id: string; months: string[] }>) ?? [];
  }

  async listAssets(): Promise<Array<{ id: string; ext: string; size: number }>> {
    const r = await this.call('GET', '/api/v1/assets');
    return (jsonOf(r).assets as Array<{ id: string; ext: string; size: number }>) ?? [];
  }

  async putAsset(id: string, ext: string, bytes: Uint8Array): Promise<void> {
    const r = await this.call('PUT', `/api/v1/assets/${encodeURIComponent(id)}.${encodeURIComponent(ext)}`, { raw: bytes });
    if (r.status !== 201) throw new SyncError('server', `asset ${id}: ${r.status}`);
  }

  async getAsset(id: string): Promise<{ ext: string; bytes: Uint8Array } | null> {
    const r = await this.call('GET', `/api/v1/assets/${encodeURIComponent(id)}`);
    if (r.status !== 200) return null;
    const ext = /.([a-z0-9]{1,10})$/.exec(r.name ?? '')?.[1];
    return ext ? { ext, bytes: new Uint8Array(r.body) } : null;
  }

  connect(handlers: ConnectHandlers): () => void {
    let ws: WebSocket | null = null;
    let closed = false;
    let delay = 1000;
    let retryTimer: NodeJS.Timeout | null = null;
    let pingTimer: NodeJS.Timeout | null = null;
    let lastPing = 0;

    const open = (): void => {
      if (closed) return;
      const url = this.link.origin.replace(/^https:/, 'wss:') + '/api/v1/sync';
      const sock = new WebSocket(url, { headers: { Authorization: `Bearer ${this.link.token}` }, perMessageDeflate: false, handshakeTimeout: TIMEOUT_MS, ...tlsOptions(this.link.caPem) });
      ws = sock;
      let ended = false;
      const end = (retrying: boolean, kind: 'network' | 'auth' | 'protocol', message: string): void => {
        if (ended) return;
        ended = true;
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        if (!closed) handlers.onClose({ retrying, kind, message });
        if (retrying && !closed) {
          const wait = Math.round(delay * (0.8 + Math.random() * 0.4));
          delay = Math.min(30_000, delay * 2);
          retryTimer = setTimeout(open, wait);
        }
      };
      sock.on('open', () => {
        sock.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL, client: 'desktop', version: this.appVersion }));
      });
      sock.on('message', (data) => {
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(String(data)) as Record<string, unknown>; } catch { return; }
        if (msg.type === 'hello') {
          delay = 1000;
          handlers.onOpen({ connectionId: String(msg.connectionId), serverTime: Number(msg.serverTime ?? Date.now()), receivedAt: Date.now() });
          pingTimer = setInterval(() => { lastPing = Date.now(); if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: 'ping' })); }, 25_000);
        } else if (msg.type === 'change') {
          handlers.onNotice(msg as unknown as Notice);
        } else if (msg.type === 'pong') {
          handlers.onPong?.({ serverTime: Number(msg.at), sentAt: lastPing, receivedAt: Date.now() });
        } else if (msg.type === 'error' && msg.code === 'protocol') {
          end(false, 'protocol', String(msg.message ?? 'Update KRNL0 or the server.'));
        }
      });
      sock.on('unexpected-response', (_req, res) => {
        const status = res.statusCode ?? 0;
        sock.terminate();
        if (status === 401) end(false, 'auth', 'This device is no longer paired.');
        else end(true, 'network', `server answered ${status}`);
      });
      sock.on('close', (code) => {
        if (code === 4001) end(false, 'auth', 'This device is no longer paired.');
        else if (code === 4000) end(false, 'protocol', 'Update KRNL0 or the server.');
        else end(true, 'network', 'connection closed');
      });
      sock.on('error', (e) => end(true, 'network', e.message));
    };

    open();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      try { ws?.close(1000); } catch { /* already closed */ }
    };
  }
}
