// Three-way merge of whole boards — used when a renderer save arrives after
// another writer (sys CLI, the AI in the terminal) changed board.json.
//
//   base   — the board the renderer last loaded or saved
//   mine   — the renderer's board now (the user's edits on top of base)
//   theirs — board.json now (the other writer's edits on top of base)
//
// The merge recurses: objects merge field by field, and arrays of items with
// an id (nodes, edges, strokes, canvases, the completion ledger, and inside a
// node's state the Todo rows, pomo spans, habits…) merge item by item. A side
// that left a value as it was in base takes the other side's value, so edits
// to different things both survive — the user ticking a row while
// `krnl task add` appends one keeps both rows. Only when both sides changed
// the very same value does board.json win: the CLI already reported success,
// and the user's version stays one undo step away (reloadBoard keeps it).
// Arrays of plain values without repeats (habit logs, keywords) merge as sets.
// The caller puts all three boards through the same load-time migrations
// first, so a value the loader only reshaped (added defaults, key order)
// never reads as an edit.

type Json = unknown;

const same = (a: Json, b: Json): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

const isObject = (v: Json): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The field that identifies the items of an array, if every item has one. */
function idKey(...lists: Json[]): string | null {
  for (const key of ['id', 'taskId']) {
    const ok = lists.every((l) => Array.isArray(l) && l.every((it) => isObject(it) && typeof it[key] === 'string'));
    if (ok) return key;
  }
  return null;
}

function byKey(list: Json, key: string): Map<string, Json> {
  const map = new Map<string, Json>();
  if (Array.isArray(list)) for (const it of list) map.set((it as Record<string, string>)[key]!, it);
  return map;
}

/** Did the items both lists share with base change their relative order? */
function reordered(list: Map<string, Json>, base: Map<string, Json>): boolean {
  const a = [...list.keys()].filter((id) => base.has(id));
  const b = [...base.keys()].filter((id) => list.has(id));
  return a.some((id, i) => id !== b[i]);
}

function mergeList(base: Json, mine: Json[], theirs: Json[], key: string): Json[] {
  const b = byKey(base, key);
  const m = byKey(mine, key);
  const t = byKey(theirs, key);
  // Order: board.json's, so the other writer's additions keep their place —
  // unless only the user reordered (a drag in a list), then the user's.
  const [first, second] = reordered(m, b) && !reordered(t, b) ? [m, t] : [t, m];
  const out: Json[] = [];
  const seen = new Set<string>();
  for (const id of [...first.keys(), ...second.keys()]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const mineItem = m.get(id);
    const theirItem = t.get(id);
    const baseItem = b.get(id);
    if (mineItem !== undefined && theirItem !== undefined) {
      out.push(mergeValue(baseItem, mineItem, theirItem));
    } else if (theirItem !== undefined) {
      // The user deleted it: gone, unless the file changed it meanwhile (a
      // conflict — the file wins). Not in base either: new from the file.
      if (baseItem === undefined || !same(theirItem, baseItem)) out.push(theirItem);
    } else if (baseItem === undefined) {
      // Only the user added it (an item the file deleted stays deleted).
      out.push(mineItem);
    }
  }
  return out;
}

const isPrimitive = (v: Json): boolean => v === null || ['string', 'number', 'boolean'].includes(typeof v);

/**
 * Arrays of plain values (a habit's log of dates, tag keywords) merge as
 * sets: keep what neither side removed, add what either side added. A tick
 * from the UI and one from `krnl habit done … --date` both survive.
 */
function mergeSet(base: Json[], mine: Json[], theirs: Json[]): Json[] {
  const inBase = new Set(base);
  const removed = new Set([
    ...base.filter((v) => !mine.includes(v)),
    ...base.filter((v) => !theirs.includes(v)),
  ]);
  const out: Json[] = [];
  for (const v of [...theirs, ...mine]) {
    if (out.includes(v)) continue;
    if (inBase.has(v) && removed.has(v)) continue;
    out.push(v);
  }
  return out;
}

export function mergeValue(base: Json, mine: Json, theirs: Json): Json {
  if (same(mine, base)) return theirs;
  if (same(theirs, base) || same(mine, theirs)) return mine;
  // Both sides changed it.
  if (isObject(mine) && isObject(theirs)) {
    const b = isObject(base) ? base : {};
    const out: Record<string, Json> = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(mine), ...Object.keys(theirs)])) {
      const v = mergeValue(b[k], mine[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const key = idKey(mine, theirs, Array.isArray(base) ? base : []);
    if (key) return mergeList(base, mine, theirs, key);
    const b = Array.isArray(base) ? base : [];
    // Only lists that are sets already: a list with repeats (coordinates, a
    // sequence) has an order and multiplicity a set merge would destroy.
    const isSet = (l: Json[]): boolean => l.every(isPrimitive) && new Set(l).size === l.length;
    if ([b, mine, theirs].every(isSet)) return mergeSet(b, mine, theirs);
  }
  // The same value changed on both sides: board.json wins.
  return theirs;
}

export function mergeBoards(
  base: Record<string, Json>,
  mine: Record<string, Json>,
  theirs: Record<string, Json>,
): Record<string, Json> {
  return mergeValue(base, mine, theirs) as Record<string, Json>;
}
