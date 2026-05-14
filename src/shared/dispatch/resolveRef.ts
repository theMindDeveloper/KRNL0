// Shared ID resolution for the krnl CLI surface.
// One rule for all `<ref>`-shaped arguments: accept full id, ≥4-char prefix,
// or (where natural) a text/name fallback. Returns either the resolved id or
// a structured failure that callers turn into a user-visible message.
//
// Used by every command that takes an id-shaped argument. See
// docs/06-requirements/ai-full-visibility-cli.md §2.

import type { AnyNode, AnyEdge, BoardShape } from './types';
import type { TodoState } from '../../renderer/components/nodes/TodoNode/types';
import type { TaskState } from '../../renderer/components/nodes/TaskNode/types';
import type { HabitState } from '../../renderer/components/nodes/HabitNode/types';

export type Resolved<T> =
  | { ok: true; id: T }
  | { ok: false; reason: 'not_found' | 'ambiguous'; matches?: string[] };

const MIN_PREFIX = 4;

/** Generic id resolver against an iterable of `{id, ...}`-shaped items. */
function resolveByPrefix<T extends { id: string }>(
  ref: string,
  items: readonly T[],
): Resolved<string> {
  // exact match wins
  const exact = items.find((i) => i.id === ref);
  if (exact) return { ok: true, id: exact.id };

  if (ref.length < MIN_PREFIX) {
    return { ok: false, reason: 'not_found' };
  }
  const matches = items.filter((i) => i.id.startsWith(ref));
  if (matches.length === 1 && matches[0]) return { ok: true, id: matches[0].id };
  if (matches.length > 1) {
    return { ok: false, reason: 'ambiguous', matches: matches.map((m) => m.id) };
  }
  return { ok: false, reason: 'not_found' };
}

/**
 * Resolve a node ref against board.nodes.
 * If `kind` is given, only nodes of that kind are considered.
 * Also accepts a name/text fallback for habits and todos when unambiguous.
 */
export function resolveNodeRef(
  board: BoardShape,
  ref: string,
  kind?: string,
): Resolved<string> {
  if (!ref) return { ok: false, reason: 'not_found' };
  const pool: AnyNode[] = kind
    ? board.nodes.filter((n) => n.kind === kind)
    : (board.nodes as AnyNode[]);

  const byId = resolveByPrefix(ref, pool);
  if (byId.ok) return byId;

  // Name/text fallback (case-insensitive).
  const refLower = ref.toLowerCase();
  const byText: AnyNode[] = [];
  for (const n of pool) {
    if (n.kind === 'todo.task') {
      const ts = n.state as TaskState;
      if (typeof ts.text === 'string' && ts.text.toLowerCase() === refLower) byText.push(n);
    }
  }
  if (byText.length === 1 && byText[0]) return { ok: true, id: byText[0].id };
  if (byText.length > 1) {
    return { ok: false, reason: 'ambiguous', matches: byText.map((m) => m.id) };
  }
  return byId;
}

/**
 * Resolve a TodoItem ref. Looks up `ref` as:
 *   - exact item id, OR
 *   - ≥4-char prefix of an item id, OR
 *   - case-insensitive item text match.
 * Returns the matching item's id and the TodoNode it lives on.
 */
export function resolveTodoItemRef(
  board: BoardShape,
  ref: string,
): Resolved<{ itemId: string; todoNodeId: string }> {
  if (!ref) return { ok: false, reason: 'not_found' };
  const todos = board.nodes.filter((n) => n.kind === 'todo');

  type Pair = { id: string; todoNodeId: string; text: string };
  const all: Pair[] = [];
  for (const n of todos) {
    const ts = n.state as TodoState;
    for (const item of ts.items) {
      all.push({ id: item.id, todoNodeId: n.id, text: item.text });
    }
  }

  // exact id
  const exact = all.find((p) => p.id === ref);
  if (exact) return { ok: true, id: { itemId: exact.id, todoNodeId: exact.todoNodeId } };

  // prefix
  if (ref.length >= MIN_PREFIX) {
    const matches = all.filter((p) => p.id.startsWith(ref));
    if (matches.length === 1 && matches[0]) {
      return { ok: true, id: { itemId: matches[0].id, todoNodeId: matches[0].todoNodeId } };
    }
    if (matches.length > 1) {
      return { ok: false, reason: 'ambiguous', matches: matches.map((m) => m.id) };
    }
  }

  // text fallback
  const refLower = ref.toLowerCase();
  const byText = all.filter((p) => p.text.toLowerCase() === refLower);
  if (byText.length === 1 && byText[0]) {
    return { ok: true, id: { itemId: byText[0].id, todoNodeId: byText[0].todoNodeId } };
  }
  if (byText.length > 1) {
    return { ok: false, reason: 'ambiguous', matches: byText.map((m) => m.id) };
  }

  return { ok: false, reason: 'not_found' };
}

/** Resolve a habit ref by id, id-prefix, or unique habit name. */
export function resolveHabitRef(
  board: BoardShape,
  ref: string,
): Resolved<{ habitId: string; habitNodeId: string }> {
  if (!ref) return { ok: false, reason: 'not_found' };
  const habitNodes = board.nodes.filter((n) => n.kind === 'habit');
  type Pair = { id: string; habitNodeId: string; name: string };
  const all: Pair[] = [];
  for (const n of habitNodes) {
    const hs = n.state as HabitState;
    for (const h of hs.habits) {
      all.push({ id: h.id, habitNodeId: n.id, name: h.name });
    }
  }

  const exact = all.find((p) => p.id === ref);
  if (exact) return { ok: true, id: { habitId: exact.id, habitNodeId: exact.habitNodeId } };

  if (ref.length >= MIN_PREFIX) {
    const matches = all.filter((p) => p.id.startsWith(ref));
    if (matches.length === 1 && matches[0]) {
      return { ok: true, id: { habitId: matches[0].id, habitNodeId: matches[0].habitNodeId } };
    }
    if (matches.length > 1) {
      return { ok: false, reason: 'ambiguous', matches: matches.map((m) => m.id) };
    }
  }

  const refLower = ref.toLowerCase();
  const byName = all.filter((p) => p.name.toLowerCase() === refLower);
  if (byName.length === 1 && byName[0]) {
    return { ok: true, id: { habitId: byName[0].id, habitNodeId: byName[0].habitNodeId } };
  }
  if (byName.length > 1) {
    return { ok: false, reason: 'ambiguous', matches: byName.map((m) => m.id) };
  }

  return { ok: false, reason: 'not_found' };
}

/** Resolve an edge ref against board.edges. Edges have no text fallback. */
export function resolveEdgeRef(board: BoardShape, ref: string): Resolved<string> {
  return resolveByPrefix<AnyEdge>(ref, board.edges);
}

/** Build a human-readable failure message for a Resolved<*>. */
export function resolutionError(
  what: string,
  ref: string,
  r: { ok: false; reason: 'not_found' | 'ambiguous'; matches?: string[] },
): string {
  if (r.reason === 'ambiguous' && r.matches) {
    return `Ambiguous ${what} ref "${ref}" — matches: ${r.matches.slice(0, 5).join(', ')}${r.matches.length > 5 ? ` (+${r.matches.length - 5} more)` : ''}`;
  }
  return `No ${what} matching "${ref}"`;
}
