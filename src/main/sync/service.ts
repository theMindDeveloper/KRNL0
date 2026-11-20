// Sync with the owner's KRNL0 server (Decision 51, server-sync.md F1–F12).
// Owns the pairing, the stored device token (OS keychain via safeStorage, NF6)
// and the engine's lifecycle. Settings › Sync and `krnl sync` both use it.

import { X509Certificate } from 'crypto';
import { existsSync, readFileSync, rmSync } from 'fs';
import { hostname } from 'os';
import { join } from 'path';
import { writeFileAtomic } from '../persistence/board';
import { SyncEngine } from '../../shared/sync/engine';
import { PROTOCOL, type SyncStatus } from '../../shared/sync/types';
import type { SyncDevice, SyncInfo, SyncPort } from '../../shared/sync/port';
import { readServerUpdate, type ServerUpdate, type ServerUpdateResult } from '../../shared/sync/serverUpdate';
import { DesktopHost } from './host';
import { onAssetStored, onFileWritten, onTimelogAppended } from './observers';
import { FileSyncStore } from './store';
import { NodeTransport, request } from './transport';

/** What keeps a token secret on this machine (Electron safeStorage in the app). */
export interface SecretBox {
  available(): boolean;
  seal(text: string): string;
  open(sealed: string): string;
}

export interface SyncServiceDeps {
  boardDir: string;
  userDataDir: string;
  appVersion: string;
  secrets: SecretBox;
  notifyBoardChanged: () => void;
  switchToBoard: (id: string) => boolean;
  onStatus: (info: SyncInfo) => void;
  log?: (msg: string, fields?: Record<string, unknown>) => void;
}

interface SyncConfig {
  origin: string;
  fingerprint: string | null;
  caPem: string | null;
  deviceId: string;
  deviceName: string;
  sealedToken: string;
}

interface Pending { origin: string; fingerprint: string | null; caPem: string | null }

export function normalizeAddress(address: string): string {
  let a = address.trim();
  if (!/^https?:\/\//i.test(a)) a = `https://${a}`;
  const u = new URL(a);
  if (u.protocol !== 'https:') throw new Error('KRNL0 servers are always encrypted: use https://');
  return `https://${u.host}`;
}

const json = (b: Buffer): Record<string, unknown> => { try { return JSON.parse(b.toString('utf8')) as Record<string, unknown>; } catch { return {}; } };

export class SyncService implements SyncPort {
  private readonly configPath: string;
  private readonly store: FileSyncStore;
  private readonly host: DesktopHost;
  private engine: SyncEngine | null = null;
  private unsubscribe: Array<() => void> = [];
  private pending: Pending | null = null;
  private config: SyncConfig | null = null;

  constructor(private readonly deps: SyncServiceDeps) {
    this.configPath = join(deps.userDataDir, 'sync.json');
    this.store = new FileSyncStore(join(deps.boardDir, 'sync'));
    this.host = new DesktopHost({ boardDir: deps.boardDir, notifyBoardChanged: deps.notifyBoardChanged, switchToBoard: deps.switchToBoard });
    this.config = this.readConfig();
  }

  private readConfig(): SyncConfig | null {
    try { return existsSync(this.configPath) ? (JSON.parse(readFileSync(this.configPath, 'utf-8')) as SyncConfig) : null; } catch { return null; }
  }

  info(): SyncInfo {
    const status: SyncStatus = this.engine?.getStatus() ?? { state: 'off', lastSyncedAt: null, clockOffsetMs: null, readOnly: [], message: null };
    return {
      configured: this.config !== null,
      origin: this.config?.origin ?? null,
      fingerprint: this.config?.fingerprint ?? null,
      deviceName: this.config?.deviceName ?? null,
      ...status,
    };
  }

  private emit(): void { this.deps.onStatus(this.info()); }

  /** Starts syncing when a server is connected. Called at app start and after pairing. */
  start(): void {
    if (!this.config || this.engine) return;
    let token: string;
    try { token = this.deps.secrets.open(this.config.sealedToken); } catch {
      this.deps.log?.('sync: the stored key cannot be read on this account; connect again');
      return;
    }
    const transport = new NodeTransport({ origin: this.config.origin, token, caPem: this.config.caPem }, this.deps.appVersion);
    const engine = new SyncEngine({
      transport,
      host: this.host,
      store: this.store,
      onStatus: () => this.emit(),
      ...(this.deps.log ? { log: this.deps.log } : {}),
    });
    this.engine = engine;
    this.unsubscribe = [
      onFileWritten((path) => { const name = this.host.docForPath(path); if (name) engine.changed(name); }),
      onTimelogAppended((boardDir, entries) => { const id = this.host.boardIdForDir(boardDir); if (id) engine.timelogAppended(id, entries as unknown[]); }),
      onAssetStored((id) => engine.assetAdded(id)),
    ];
    engine.start();
    this.emit();
  }

  stop(): void {
    for (const u of this.unsubscribe) u();
    this.unsubscribe = [];
    this.engine?.stop();
    this.engine = null;
    this.emit();
  }

  /** Step 1: reach the server, read its fingerprint, check its CA against it. */
  async begin(address: string): Promise<{ origin: string; fingerprint: string | null; serverVersion: string; encryption: string }> {
    const origin = normalizeAddress(address);
    const health = await request(origin, 'GET', '/api/v1/health', { caPem: null, insecure: true }).catch(() => { throw new Error(`Cannot reach ${origin}. Is the server running and the address right?`); });
    const h = json(health.body);
    if (health.status !== 200 || h.name !== 'krnl0-server') throw new Error(`${origin} is not a KRNL0 server.`);
    if (h.protocol !== PROTOCOL) throw new Error(`This server speaks protocol ${String(h.protocol)}; this app speaks ${PROTOCOL}. Update the older one.`);
    if (h.appSync !== true) throw new Error('App sync is off on this server (krnl0 config set appSync on).');
    const tls = (h.tls ?? {}) as { mode?: string; fingerprint?: string | null };
    let caPem: string | null = null;
    const fingerprint = typeof tls.fingerprint === 'string' ? tls.fingerprint.toUpperCase() : null;
    if (fingerprint) {
      const ca = await request(origin, 'GET', '/ca.crt', { caPem: null, insecure: true });
      caPem = ca.body.toString('utf8');
      let fp = '';
      try { fp = new X509Certificate(caPem).fingerprint256.toUpperCase(); } catch { throw new Error('The server sent an unreadable certificate.'); }
      if (fp !== fingerprint) throw new Error('The server\'s certificate does not match its fingerprint. Do not connect.');
    }
    // From here on, only the pinned CA (or public trust) is accepted.
    const verified = await request(origin, 'GET', '/api/v1/health', { caPem }).catch((e: unknown) => {
      throw new Error(`The connection could not be verified (${e instanceof Error ? e.message : String(e)}).`);
    });
    if (verified.status !== 200) throw new Error('The connection could not be verified.');
    this.pending = { origin, fingerprint, caPem };
    return { origin, fingerprint, serverVersion: String(h.version ?? ''), encryption: String(tls.mode ?? '') };
  }

  /** Step 2 (after the owner compared the fingerprint): pair with the password. */
  async finish(password: string, code?: string): Promise<SyncInfo> {
    const p = this.pending;
    if (!p) throw new Error('Start with the server address.');
    if (!this.deps.secrets.available()) throw new Error('This computer has no keychain to keep the sync key safe, so sync cannot be turned on.');
    const name = hostname() || 'KRNL0 desktop';
    const r = await request(p.origin, 'POST', '/api/v1/devices/pair', { caPem: p.caPem, json: { password, ...(code ? { code } : {}), name, platform: process.platform } });
    const j = json(r.body);
    if (r.status !== 201) {
      const err = (j.error ?? {}) as { code?: string; message?: string };
      if (err.code === 'totp-required') throw new Error('Enter the code from your authenticator app.');
      throw new Error(err.message ?? `The server answered ${r.status}.`);
    }
    this.stop();
    this.store.clear();
    this.config = {
      origin: p.origin,
      fingerprint: p.fingerprint,
      caPem: p.caPem,
      deviceId: String(j.deviceId),
      deviceName: name,
      sealedToken: this.deps.secrets.seal(String(j.token)),
    };
    writeFileAtomic(this.configPath, JSON.stringify(this.config, null, 2));
    this.pending = null;
    this.start();
    return this.info();
  }

  /** Stops syncing and forgets the server; boards on this computer stay as they are. */
  async disconnect(): Promise<SyncInfo> {
    const cfg = this.config;
    this.stop();
    if (cfg) {
      try {
        const token = this.deps.secrets.open(cfg.sealedToken);
        await request(cfg.origin, 'DELETE', `/api/v1/devices/${encodeURIComponent(cfg.deviceId)}`, { caPem: cfg.caPem, token });
      } catch { /* offline: the owner can revoke it on the server */ }
    }
    rmSync(this.configPath, { force: true });
    this.store.clear();
    this.config = null;
    this.emit();
    return this.info();
  }

  /** The server's update state (server-updates F1). `check` asks GitHub again (at most once a minute). */
  async serverUpdate(check = false): Promise<ServerUpdate | null> {
    const cfg = this.config;
    if (!cfg) return null;
    try {
      const token = this.deps.secrets.open(cfg.sealedToken);
      const r = check
        ? await request(cfg.origin, 'POST', '/api/v1/server/update/check', { caPem: cfg.caPem, token, json: {} })
        : await request(cfg.origin, 'GET', '/api/v1/server', { caPem: cfg.caPem, token });
      if (r.status === 404 && check) return this.serverUpdate(false); // a 0.1.0 server has no check route
      if (r.status !== 200) return null;
      return readServerUpdate(json(r.body).update);
    } catch {
      return null;
    }
  }

  private async serverWrite(method: string, path: string, body: Record<string, unknown>): Promise<ServerUpdateResult> {
    const cfg = this.config;
    if (!cfg) return { ok: false, message: 'Connect your server first.', update: null };
    try {
      const token = this.deps.secrets.open(cfg.sealedToken);
      const r = await request(cfg.origin, method, path, { caPem: cfg.caPem, token, json: body });
      const j = json(r.body);
      const update = readServerUpdate(j.update ?? (j.error as Record<string, unknown> | undefined)?.update);
      if (r.status === 200 || r.status === 202) return { ok: true, message: null, update };
      if (r.status === 404) return { ok: false, message: 'This server version can not update itself yet. Run the command shown on the server once.', update };
      const err = j.error as { message?: unknown } | undefined;
      return { ok: false, message: typeof err?.message === 'string' ? err.message : `The server answered ${r.status}.`, update };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e), update: null };
    }
  }

  startServerUpdate(password: string, code?: string): Promise<ServerUpdateResult> {
    return this.serverWrite('POST', '/api/v1/server/update', { password, ...(code ? { code } : {}) });
  }

  setServerAuto(on: boolean, password: string, code?: string): Promise<ServerUpdateResult> {
    return this.serverWrite('PUT', '/api/v1/server/update/auto', { on, password, ...(code ? { code } : {}) });
  }

  async devices(): Promise<SyncDevice[]> {
    const cfg = this.config;
    if (!cfg) return [];
    try {
      const token = this.deps.secrets.open(cfg.sealedToken);
      const r = await request(cfg.origin, 'GET', '/api/v1/devices', { caPem: cfg.caPem, token });
      if (r.status !== 200) return [];
      return ((json(r.body).devices as SyncDevice[] | undefined) ?? []).map((d) => ({ id: d.id, name: d.name, platform: d.platform, lastSeenAt: d.lastSeenAt, current: d.current }));
    } catch {
      return [];
    }
  }

  async retry(): Promise<SyncInfo> {
    if (!this.engine) this.start();
    await this.engine?.syncNow();
    return this.info();
  }
}
