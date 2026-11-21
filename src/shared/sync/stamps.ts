// When each value of a synced document was last changed (Decision 53,
// server-sync.md F21). A stamp is [t, h]: the moment of the change in server
// time and a fingerprint of the value it describes; [t, h, 1] when the device
// had never measured its clock (kept, never trusted). Paths are the merge's own
// (boardMerge pathKey / pathId), so a stamp names exactly what a clash is about.
//
// The table travels with the document as `syncStamps` and never reaches
// board.json. A stamp whose fingerprint no longer matches its value (an older
// KRNL0 changed the value and left the table as it was) means nothing.

import { idKey, isSetList, pathId, pathKey } from '../boardMerge';
import { hashText, stableStringify } from './shape';
import type { Json, Stamps } from './types';

export type { Stamps };
export type Stamp = Stamps[string];

/** The top-level key of a synced document that holds its stamps. */
export const STAMPS_KEY = 'syncStamps';
/** Older stamps are dropped: a clash between edits further apart than this keeps the server's version. */
export const STAMP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Two changes closer than this are a tie (clock measurements are not finer): the server's version stays. */
export const CLASH_MIN_GAP_MS = 3000;

const GONE = '-';

const isObject = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A short fingerprint of a value; "-" for no value (deleted). */
export function fingerprint(v: Json): string {
  return v === undefined ? GONE : hashText(stableStringify(v));
}

/**
 * Calls `visit` for every place in `before` and `after` that the merge treats
 * as one value: it walks into objects and into id lists by id, the way
 * mergeValue does; anything else (a primitive, a set or another list, an item
 * only one side has) is one value.
 */
function walk(before: Json, after: Json, path: string, visit: (path: string, before: Json, after: Json) => void): void {
  if (isObject(before) && isObject(after)) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) walk(before[k], after[k], pathKey(path, k), visit);
    return;
  }
  if (Array.isArray(before) && Array.isArray(after) && !(isSetList(before) && isSetList(after))) {
    const key = idKey(before, after);
    if (key) {
      const items = (l: Json[]) => new Map(l.map((it) => [String((it as Record<string, Json>)[key]), it] as const));
      const b = items(before);
      const a = items(after);
      for (const id of new Set([...b.keys(), ...a.keys()])) walk(b.get(id), a.get(id), pathId(path, id), visit);
      return;
    }
  }
  visit(path, before, after);
}

/** The value at a stamp path, or undefined. */
export function valueAt(body: Json, path: string): Json {
  if (path === '') return body;
  let cur: Json = body;
  for (const seg of path.slice(1).split('/')) {
    if (seg.startsWith('#')) {
      if (!Array.isArray(cur)) return undefined;
      const id = decodeURIComponent(seg.slice(1));
      cur = cur.find((it) => isObject(it) && (it.id === id || it.taskId === id));
    } else {
      if (!isObject(cur)) return undefined;
      cur = cur[decodeURIComponent(seg)];
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

const parentOf = (path: string): string | null => (path === '' ? null : path.slice(0, path.lastIndexOf('/')));

/**
 * Stamps what this device changed since `base`: every value whose stamp no
 * longer matches it, and every value that differs from the base and has none.
 * Returns the same table when nothing changed.
 */
export function noteEdits(stamps: Stamps, base: Json, local: Json, at: number, trusted: boolean): Stamps {
  let next: Stamps | null = null;
  walk(base, local, '', (path, before, after) => {
    const h = fingerprint(after);
    const s = (next ?? stamps)[path];
    if (s ? s[1] === h : fingerprint(before) === h) return;
    next ??= { ...stamps };
    next[path] = trusted ? [at, h] : [at, h, 1];
  });
  return next ?? stamps;
}

/**
 * When the value at `path` in `body` was changed: its own stamp, or the
 * nearest enclosing one (an item added as a whole), if it still matches.
 * Null when unknown or untrusted.
 */
export function changedAt(stamps: Stamps, body: Json, path: string): number | null {
  for (let p: string | null = path; p !== null; p = parentOf(p)) {
    const s = stamps[p];
    if (s && s[1] === fingerprint(valueAt(body, p))) return s.length === 2 ? s[0] : null;
  }
  return null;
}

/**
 * The merge's resolver for sync: the later change wins when both are known
 * and more than CLASH_MIN_GAP_MS apart; otherwise the server's version stays.
 */
export function latestWins(
  mine: { stamps: Stamps; body: Json },
  theirs: { stamps: Stamps; body: Json },
  minGapMs = CLASH_MIN_GAP_MS,
): (path: string) => 'mine' | 'theirs' {
  return (path) => {
    const a = changedAt(mine.stamps, mine.body, path);
    const b = changedAt(theirs.stamps, theirs.body, path);
    return a !== null && b !== null && a - b > minGapMs ? 'mine' : 'theirs';
  };
}

/**
 * The stamps that describe `body`, from any number of tables: the ones whose
 * fingerprint matches its value now (the latest when two do), none older than
 * STAMP_MAX_AGE_MS before `now`.
 */
export function stampsFor(body: Json, now: number, ...tables: Stamps[]): Stamps {
  const out: Stamps = {};
  const oldest = now - STAMP_MAX_AGE_MS;
  const checked = new Map<string, string>();
  for (const table of tables) {
    for (const [path, s] of Object.entries(table)) {
      if (s[0] < oldest) continue;
      const cur = out[path];
      if (cur && cur[0] >= s[0]) continue;
      let h = checked.get(path);
      if (h === undefined) { h = fingerprint(valueAt(body, path)); checked.set(path, h); }
      if (s[1] === h) out[path] = s;
    }
  }
  return out;
}

const isStamp = (v: Json): v is Stamp =>
  Array.isArray(v) && (v.length === 2 || (v.length === 3 && v[2] === 1)) && typeof v[0] === 'number' && Number.isFinite(v[0]) && typeof v[1] === 'string';

/** A document from the server or the disk, without its stamp table, and the table (only well-formed entries). */
export function splitStamps(body: Json): { body: Json; stamps: Stamps } {
  if (!isObject(body) || !(STAMPS_KEY in body)) return { body, stamps: {} };
  const { [STAMPS_KEY]: raw, ...rest } = body;
  const stamps: Stamps = {};
  if (isObject(raw)) for (const [path, s] of Object.entries(raw)) if (isStamp(s)) stamps[path] = s;
  return { body: rest, stamps };
}

/** The document as it is uploaded: with its stamp table, when it has one. */
export function withStamps(body: Json, stamps: Stamps): Json {
  if (!isObject(body) || Object.keys(stamps).length === 0) return body;
  return { ...body, [STAMPS_KEY]: stamps };
}
