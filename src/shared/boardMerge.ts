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

function mergeList(base: Json, mine: Json[], theirs: Json[], key: string): Json[] {
  const b = byKey(base, key);
  const m = byKey(mine, key);
  const t = byKey(theirs, key);
  const out: Json[] = [];
  // board.json's order first, so the other writer's additions keep their place.
  for (const [id, theirItem] of t) {
    const mineItem = m.get(id);
    const baseItem = b.get(id);
    if (mineItem === undefined) {
      // The user deleted it: gone, unless the file changed it meanwhile (a
      // conflict — the file wins). Not in base either: new from the file.
      if (baseItem !== undefined && same(theirItem, baseItem)) continue;
      out.push(theirItem);
      continue;
    }
    out.push(mergeValue(baseItem, mineItem, theirItem));
  }
  // Items only the user added (an item the file deleted stays deleted).
  for (const [id, mineItem] of m) {
    if (!t.has(id) && !b.has(id)) out.push(mineItem);
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
