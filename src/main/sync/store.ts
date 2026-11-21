// What this device last agreed with the server, on disk (sync.md "Where the base lives").
//   <board dir>/sync/base/<doc>.json     { rev, body }
//   <board dir>/sync/pending-timelog.json
//   <board dir>/sync/flags.json
//   <board dir>/sync/stamps/<doc>.json   when each value was last changed (Decision 53)
//   <board dir>/sync/clock.json          the last measured offset to the server's clock
// Atomic writes (temp + rename), so a crash never leaves a torn base.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { DocBase, Json, Stamps, SyncStore } from '../../shared/sync/types';

const fileOf = (name: string): string => encodeURIComponent(name);

function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  writeFileSync(tmp, text, 'utf-8');
  renameSync(tmp, path);
}

function readJson<T>(path: string, fallback: T): T {
  try { return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf-8')) as T) : fallback; } catch { return fallback; }
}

export class FileSyncStore implements SyncStore {
  private readonly baseDir: string;
  private readonly pendingPath: string;
  private readonly flagsPath: string;
  private bases = new Map<string, DocBase | null>();
  private pending: Array<{ boardId: string; month: string; entry: Json }> | null = null;
  private flags: Record<string, boolean> | null = null;
  private readonly stampDir: string;
  private readonly clockPath: string;
  private stamps = new Map<string, Stamps | null>();
  private clock: number | null | undefined = undefined;

  constructor(readonly dir: string) {
    this.baseDir = join(dir, 'base');
    this.stampDir = join(dir, 'stamps');
    this.clockPath = join(dir, 'clock.json');
    this.pendingPath = join(dir, 'pending-timelog.json');
    this.flagsPath = join(dir, 'flags.json');
    mkdirSync(this.baseDir, { recursive: true });
  }

  getBase(name: string): DocBase | null {
    if (!this.bases.has(name)) this.bases.set(name, readJson<DocBase | null>(join(this.baseDir, `${fileOf(name)}.json`), null));
    const b = this.bases.get(name) ?? null;
    return b ? (JSON.parse(JSON.stringify(b)) as DocBase) : null;
  }

  setBase(name: string, base: DocBase | null): void {
    const path = join(this.baseDir, `${fileOf(name)}.json`);
    if (base) writeAtomic(path, JSON.stringify(base));
    else rmSync(path, { force: true });
    this.bases.set(name, base ? (JSON.parse(JSON.stringify(base)) as DocBase) : null);
  }

  pendingTimelog(): Array<{ boardId: string; month: string; entry: Json }> {
    if (!this.pending) this.pending = readJson(this.pendingPath, []);
    return [...this.pending];
  }

  addPendingTimelog(items: Array<{ boardId: string; month: string; entry: Json }>): void {
    const list = this.pendingTimelog();
    const ids = new Set(list.map((p) => (p.entry as { id?: string }).id));
    for (const it of items) {
      const id = (it.entry as { id?: string }).id;
      if (id && ids.has(id)) continue;
      if (id) ids.add(id);
      list.push(it);
    }
    this.pending = list;
    writeAtomic(this.pendingPath, JSON.stringify(list));
  }

  dropPendingTimelog(ids: Set<string>): void {
    this.pending = this.pendingTimelog().filter((p) => !ids.has((p.entry as { id?: string }).id ?? ''));
    writeAtomic(this.pendingPath, JSON.stringify(this.pending));
  }

  flag(key: string): boolean {
    if (!this.flags) this.flags = readJson<Record<string, boolean>>(this.flagsPath, {});
    return this.flags[key] === true;
  }

  setFlag(key: string, on: boolean): void {
    this.flag(key);
    this.flags = { ...this.flags, [key]: on };
    writeAtomic(this.flagsPath, JSON.stringify(this.flags));
  }

  getStamps(name: string): Stamps | null {
    if (!this.stamps.has(name)) this.stamps.set(name, readJson<Stamps | null>(join(this.stampDir, `${fileOf(name)}.json`), null));
    const s = this.stamps.get(name) ?? null;
    return s ? { ...s } : null;
  }

  setStamps(name: string, stamps: Stamps | null): void {
    const path = join(this.stampDir, `${fileOf(name)}.json`);
    if (stamps && Object.keys(stamps).length > 0) { mkdirSync(this.stampDir, { recursive: true }); writeAtomic(path, JSON.stringify(stamps)); }
    else rmSync(path, { force: true });
    this.stamps.set(name, stamps ? { ...stamps } : null);
  }

  clockOffset(): number | null {
    if (this.clock === undefined) {
      const v = readJson<{ offsetMs?: unknown }>(this.clockPath, {}).offsetMs;
      this.clock = typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    return this.clock;
  }

  setClockOffset(ms: number): void {
    // Measured every half minute: written only when it moved noticeably.
    const prev = this.clockOffset();
    if (prev !== null && Math.abs(prev - ms) < 500) return;
    this.clock = ms;
    writeAtomic(this.clockPath, JSON.stringify({ offsetMs: ms }));
  }

  /** Forget everything (disconnect). Local boards are untouched. */
  clear(): void {
    for (const f of existsSync(this.baseDir) ? readdirSync(this.baseDir) : []) rmSync(join(this.baseDir, f), { force: true });
    rmSync(this.stampDir, { recursive: true, force: true });
    rmSync(this.pendingPath, { force: true });
    rmSync(this.flagsPath, { force: true });
    rmSync(this.clockPath, { force: true });
    this.bases.clear();
    this.stamps.clear();
    this.pending = null;
    this.flags = null;
    this.clock = undefined;
  }
}
