// Decision 64 / calendar-sync F9–F12 — two-way sync between the board and the
// "KRNL0" calendar in iCloud or Google. Pure: given what the board has, what
// the calendar has and what was matched last time, it says what to send, what
// to change on the board, and the new matching list. The host carries it out.
//
// Rules (F9–F12, Decision 53):
//   - New on the board → created in the calendar. New in the calendar → a
//     KRNL0 event (never a task).
//   - Changed on one side → the other follows. Changed on both since the last
//     sync → the calendar's version wins (both edits happened within one check).
//   - Deleted on one side and unchanged on the other → deleted there too.
//     Deleted on one side but changed on the other → the change stays (an edit
//     beats a delete): it is made again.
//   - A task's copy deleted in the calendar → the task loses its time; it stays in Todo.
//   - A repeat KRNL0 cannot store (monthly…) stays read-only (F11).

import type { ExportEvent } from './krnlIcs';
import type { LinkedEvent } from './types';

/** An event or a planned task, with the UID it has in the calendar. */
export interface MirrorItem extends ExportEvent {
  uid: string;
}

export interface LocalItem {
  /** `e:<habitId>` for an event, `t:<taskId>` for a planned task. */
  key: string;
  kind: 'event' | 'task';
  /** The habit or task id. */
  refId: string;
  item: MirrorItem;
}

export interface RemoteItem {
  uid: string;
  /** Where it lives in the calendar (CalDAV URL or Google event id). */
  ref: string;
  etag?: string;
  /** Null when KRNL0 cannot hold it (a monthly repeat, an all-day event): shown read-only. */
  item: MirrorItem | null;
  /** Its occurrences, for a read-only one. */
  readOnly: LinkedEvent[];
}

export interface MapEntry {
  /** The UID. */
  id: string;
  key: string;
  ref: string;
  etag?: string;
  /** Hashes of the board's and the calendar's version at the last sync. */
  l: string;
  r: string;
}

export type RemoteOp =
  | { op: 'put'; uid: string; item: MirrorItem; ref?: string; etag?: string }
  | { op: 'remove'; uid: string; ref: string; etag?: string };

export type LocalOp =
  | { op: 'addEvent'; uid: string; item: MirrorItem }
  | { op: 'updateEvent'; habitId: string; item: MirrorItem }
  | { op: 'deleteEvent'; habitId: string }
  | { op: 'updateTask'; taskId: string; item: MirrorItem }
  | { op: 'unscheduleTask'; taskId: string };

export interface MirrorPlan {
  remote: RemoteOp[];
  local: LocalOp[];
  /** The matching list after the plan is carried out (a new item's `ref` is filled by the host after its put). */
  map: MapEntry[];
  /** Read-only events of the calendar (F11). */
  readOnly: LinkedEvent[];
}

function isoDow(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * One text per meaning: two items that mean the same event give the same text,
 * whichever side wrote them ("weekdays" = Mon–Fri, the first day it really
 * happens, skipped days in its range, sorted lists).
 */
export function canon(it: ExportEvent): string {
  const once = !!it.endsOn && it.endsOn === it.startsOn;
  // As the readers see them: runs of spaces collapse, lengths are 5–720 minutes.
  const title = it.name.replace(/\s+/g, ' ').trim();
  const place = (it.place ?? '').replace(/\s+/g, ' ').trim();
  const len = Math.min(720, Math.max(5, Math.round(it.lengthMin)));
  if (once) return JSON.stringify({ o: 1, d: it.startsOn, at: it.at, len, t: title, p: place });
  const days = it.repeat.kind === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : it.repeat.kind === 'weekdays' ? [1, 2, 3, 4, 5] : [...new Set(it.repeat.days)].sort();
  let first = it.startsOn;
  for (let i = 0; i < 7 && !days.includes(isoDow(first)); i++) first = addDays(first, 1);
  const inRange = (d: string) => d >= first && (!it.endsOn || d <= it.endsOn) && days.includes(isoDow(d));
  const skips = [...new Set(it.skips.filter(inRange))].sort();
  const moved = it.moved.filter((m) => inRange(m.date) && m.at !== it.at && !skips.includes(m.date)).map((m) => `${m.date}@${m.at}`).sort();
  return JSON.stringify({ o: 0, days: days.join(''), first, end: it.endsOn ?? '', at: it.at, len, t: title, p: place, skips, moved });
}

/** A short hash of the canonical text (FNV-1a, 32 bit, with its length). */
export function hashItem(it: ExportEvent): string {
  const s = canon(it);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${h.toString(36)}.${s.length.toString(36)}`;
}

export function reconcile(local: readonly LocalItem[], remote: readonly RemoteItem[], map: readonly MapEntry[]): MirrorPlan {
  const L = new Map(local.map((l) => [l.item.uid, l]));
  const R = new Map(remote.map((r) => [r.uid, r]));
  const M = new Map(map.map((m) => [m.id, m]));
  const plan: MirrorPlan = { remote: [], local: [], map: [], readOnly: [] };
  const uids = new Set<string>([...L.keys(), ...R.keys(), ...M.keys()]);

  const putRemote = (l: LocalItem, r?: RemoteItem) => {
    plan.remote.push({ op: 'put', uid: l.item.uid, item: l.item, ...(r ? { ref: r.ref, ...(r.etag ? { etag: r.etag } : {}) } : {}) });
    const h = hashItem(l.item);
    plan.map.push({ id: l.item.uid, key: l.key, ref: r?.ref ?? '', l: h, r: h });
  };
  /** The calendar's version onto the board (an existing event or task, or a new event). */
  const applyLocal = (r: RemoteItem & { item: MirrorItem }, l?: LocalItem) => {
    const h = hashItem(r.item);
    if (l?.kind === 'task') plan.local.push({ op: 'updateTask', taskId: l.refId, item: r.item });
    else if (l) plan.local.push({ op: 'updateEvent', habitId: l.refId, item: r.item });
    else plan.local.push({ op: 'addEvent', uid: r.uid, item: r.item });
    plan.map.push({ id: r.uid, key: l?.key ?? `uid:${r.uid}`, ref: r.ref, ...(r.etag ? { etag: r.etag } : {}), l: h, r: h });
  };
  const keep = (m: MapEntry, r?: RemoteItem) => plan.map.push({ ...m, ...(r ? { ref: r.ref, ...(r.etag ? { etag: r.etag } : {}) } : {}) });

  for (const uid of uids) {
    const l = L.get(uid);
    const r = R.get(uid);
    const m = M.get(uid);

    // A repeat KRNL0 cannot hold: shown read-only, never touched (F11).
    if (r && !r.item) {
      if (!l) { plan.readOnly.push(...r.readOnly); continue; }
      // The board has it (it was KRNL0's before someone made it monthly): the calendar wins, read-only.
      if (l.kind === 'task') plan.local.push({ op: 'unscheduleTask', taskId: l.refId });
      else plan.local.push({ op: 'deleteEvent', habitId: l.refId });
      plan.readOnly.push(...r.readOnly);
      continue;
    }
    const rItem = r && r.item ? (r as RemoteItem & { item: MirrorItem }) : undefined;

    if (l && rItem) {
      const lh = hashItem(l.item);
      const rh = hashItem(rItem.item);
      if (lh === rh) { plan.map.push({ id: uid, key: l.key, ref: rItem.ref, ...(rItem.etag ? { etag: rItem.etag } : {}), l: lh, r: rh }); continue; }
      if (!m) { putRemote(l, rItem); continue; } // never matched: the board's version goes out
      const lc = lh !== m.l;
      const rc = rh !== m.r;
      if (rc) applyLocal(rItem, l); // the calendar changed (also when both did: it wins)
      else if (lc) putRemote(l, rItem);
      else keep(m, rItem);
      continue;
    }

    if (l && !rItem) {
      if (!m) { putRemote(l); continue; } // new on the board
      // Gone from the calendar.
      if (hashItem(l.item) !== m.l) { putRemote(l); continue; } // changed here: an edit beats a delete
      if (l.kind === 'task') plan.local.push({ op: 'unscheduleTask', taskId: l.refId });
      else plan.local.push({ op: 'deleteEvent', habitId: l.refId });
      continue;
    }

    if (!l && rItem) {
      // Made by KRNL0 (its UID ends in @krnl0) and matched with nothing: left over from an earlier
      // link (sending was off, the board was restored). It goes, never comes back as an event.
      if (!m && /@krnl0$/i.test(uid)) { plan.remote.push({ op: 'remove', uid, ref: rItem.ref, ...(rItem.etag ? { etag: rItem.etag } : {}) }); continue; }
      if (!m) { applyLocal(rItem); continue; } // new in the calendar
      // Gone from the board (deleted, done, its time taken off).
      if (hashItem(rItem.item) !== m.r) { applyLocal(rItem); continue; } // changed there: it comes back
      plan.remote.push({ op: 'remove', uid, ref: rItem.ref, ...(rItem.etag ? { etag: rItem.etag } : {}) });
      continue;
    }
    // Gone from both: forgotten.
  }
  plan.readOnly.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  return plan;
}
