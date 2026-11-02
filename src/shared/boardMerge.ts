// Three-way merge of whole boards — used when a renderer save arrives after
// another writer (sys CLI, the AI in the terminal) changed board.json.
//
//   base   — the board the renderer last loaded or saved
//   mine   — the renderer's board now (the user's edits on top of base)
//   theirs — board.json now (the other writer's edits on top of base)
//
// Collections (nodes, edges, drawings, canvases, completions) merge per item:
// an item the renderer changed, added or deleted since base takes the
// renderer's side; every other item takes board.json's side. So the user's
// edit and the CLI's edit both survive unless they touched the same item,
// where the user's latest action wins. Top-level fields follow the same rule.

type Item = Record<string, unknown>;
type BoardLike = Record<string, unknown>;

/** Collections merged item by item, with the field that identifies an item. */
const COLLECTION_KEYS: Readonly<Record<string, string>> = {
  nodes: 'id',
  edges: 'id',
  drawings: 'id',
  canvases: 'id',
  completions: 'taskId',
};

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

function byKey(list: unknown, key: string): Map<string, Item> {
  const map = new Map<string, Item>();
  if (!Array.isArray(list)) return map;
  for (const it of list) {
    if (typeof it === 'object' && it !== null && typeof (it as Item)[key] === 'string') {
      map.set((it as Item)[key] as string, it as Item);
    }
  }
  return map;
}

function mergeCollection(base: unknown, mine: unknown, theirs: unknown, key: string): Item[] {
  const b = byKey(base, key);
  const m = byKey(mine, key);
  const t = byKey(theirs, key);
  const out: Item[] = [];
  // board.json's order first, so the other writer's additions keep their place.
  for (const [id, theirItem] of t) {
    const mineItem = m.get(id);
    const baseItem = b.get(id);
    if (baseItem !== undefined && mineItem === undefined) continue; // the user deleted it
    if (mineItem !== undefined && (baseItem === undefined || !same(mineItem, baseItem))) {
      out.push(mineItem); // the user changed (or also added) it
    } else {
      out.push(theirItem);
    }
  }
  // Items only the user added.
  for (const [id, mineItem] of m) {
    if (!t.has(id) && !b.has(id)) out.push(mineItem);
  }
  return out;
}

export function mergeBoards(base: BoardLike, mine: BoardLike, theirs: BoardLike): BoardLike {
  const out: BoardLike = { ...theirs };
  const keys = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]);
  for (const k of keys) {
    const key = COLLECTION_KEYS[k];
    if (key !== undefined) {
      if (mine[k] === undefined && theirs[k] === undefined) continue;
      out[k] = mergeCollection(base[k], mine[k], theirs[k], key);
      continue;
    }
    // Scalars / objects: the user's value when they changed it since base.
    if (!same(mine[k], base[k])) {
      if (mine[k] === undefined) delete out[k];
      else out[k] = mine[k];
    }
  }
  return out;
}
