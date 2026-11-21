// What this browser last agreed with the server (the engine's SyncStore), in
// memory and in IndexedDB: base:<doc>, pending-tl, flag:<key>, stamps:<doc>, clock.

import type { DocBase, Json, Stamps, SyncStore } from '../../shared/sync/types';
import type { Kv } from './kv';

type Pending = { boardId: string; month: string; entry: Json };
const idOf = (e: Json): string | undefined => (typeof e === 'object' && e !== null ? (e as { id?: string }).id : undefined);
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class WebSyncStore implements SyncStore {
  private bases = new Map<string, DocBase>();
  private pending: Pending[] = [];
  private flags = new Set<string>();
  private stamps = new Map<string, Stamps>();
  private clock: number | null = null;

  constructor(private readonly kv: Kv) {}

  load(all: Map<string, unknown>): void {
    for (const [k, v] of all) {
      if (k.startsWith('base:') && typeof v === 'object' && v !== null) this.bases.set(k.slice(5), v as DocBase);
      else if (k === 'pending-tl' && Array.isArray(v)) this.pending = v as Pending[];
      else if (k.startsWith('flag:') && v === true) this.flags.add(k.slice(5));
      else if (k.startsWith('stamps:') && typeof v === 'object' && v !== null) this.stamps.set(k.slice(7), v as Stamps);
      else if (k === 'clock' && typeof v === 'number' && Number.isFinite(v)) this.clock = v;
    }
  }

  getBase(name: string): DocBase | null {
    const b = this.bases.get(name);
    return b ? copy(b) : null;
  }

  setBase(name: string, base: DocBase | null): void {
    if (base) { this.bases.set(name, copy(base)); this.kv.set(`base:${name}`, this.bases.get(name)); }
    else { this.bases.delete(name); this.kv.del(`base:${name}`); }
  }

  pendingTimelog(): Pending[] { return [...this.pending]; }

  addPendingTimelog(items: Pending[]): void {
    const have = new Set(this.pending.map((p) => idOf(p.entry)));
    for (const it of items) {
      const id = idOf(it.entry);
      if (id && !have.has(id)) { this.pending.push(it); have.add(id); }
    }
    this.kv.set('pending-tl', this.pending);
  }

  dropPendingTimelog(ids: Set<string>): void {
    this.pending = this.pending.filter((p) => !ids.has(idOf(p.entry) ?? ''));
    this.kv.set('pending-tl', this.pending);
  }

  flag(key: string): boolean { return this.flags.has(key); }

  setFlag(key: string, on: boolean): void {
    if (on) { this.flags.add(key); this.kv.set(`flag:${key}`, true); }
    else { this.flags.delete(key); this.kv.del(`flag:${key}`); }
  }

  getStamps(name: string): Stamps | null {
    const s = this.stamps.get(name);
    return s ? { ...s } : null;
  }

  setStamps(name: string, stamps: Stamps | null): void {
    if (stamps && Object.keys(stamps).length > 0) { this.stamps.set(name, { ...stamps }); this.kv.set(`stamps:${name}`, this.stamps.get(name)); }
    else { this.stamps.delete(name); this.kv.del(`stamps:${name}`); }
  }

  clockOffset(): number | null { return this.clock; }

  setClockOffset(ms: number): void {
    if (this.clock !== null && Math.abs(this.clock - ms) < 500) return;
    this.clock = ms;
    this.kv.set('clock', ms);
  }
}
