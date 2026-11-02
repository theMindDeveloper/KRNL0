// ADR Decision 33 â€” multiple canvases in one board.json.
//
// Only free content is canvas-scoped (text, image, media, frame, drawings and
// the edges between them). Mothers and their data kinds (tasks, habit lanes,
// ...) are shared: they carry no canvasId and show on every canvas, so
// analytics, the completion ledger and pomo history never split per canvas.
//
// Pure helpers over a loosely-typed board so the migration (main process), the
// sys CLI and the renderer store all share one implementation.

export const DEFAULT_CANVAS_ID = 'canvas-main';
export const DEFAULT_CANVAS_NAME = 'Main';

export interface CanvasMeta {
  id: string;
  name: string;
}

/** Child kinds that are mother-node data â€” never belong to a canvas. */
export const SHARED_KINDS: ReadonlySet<string> = new Set(['todo.task', 'habit.lane', 'habit.day', 'pomo.session']);

interface NodeLike { id: string; kind: string; isMother?: boolean; canvasId?: string }
interface EdgeLike { from: { nodeId: string }; to: { nodeId: string } }
interface StrokeLike { id: string; canvasId?: string }

export interface CanvasBoardLike<N extends NodeLike = NodeLike, E extends EdgeLike = EdgeLike, S extends StrokeLike = StrokeLike> {
  nodes: N[];
  edges: E[];
  drawings?: S[];
  canvases?: CanvasMeta[];
  activeCanvasId?: string;
}

export function isSharedNode(n: { kind: string; isMother?: boolean }): boolean {
  return n.isMother === true || SHARED_KINDS.has(n.kind);
}

export function activeCanvasOf(board: { canvases?: CanvasMeta[]; activeCanvasId?: string }): string {
  const list = board.canvases ?? [];
  if (board.activeCanvasId && list.some((c) => c.id === board.activeCanvasId)) return board.activeCanvasId;
  return list[0]?.id ?? DEFAULT_CANVAS_ID;
}

/** Shared nodes are on every canvas; free nodes only on their own. A free node
 *  with no canvasId (not yet stamped) counts as the active canvas. */
export function isOnCanvas(n: NodeLike, canvasId: string): boolean {
  return isSharedNode(n) || (n.canvasId ?? canvasId) === canvasId;
}

export function isStrokeOnCanvas(s: StrokeLike, canvasId: string): boolean {
  return (s.canvasId ?? canvasId) === canvasId;
}

/** Ids of every node visible on `canvasId`. */
export function visibleNodeIds(nodes: readonly NodeLike[], canvasId: string): Set<string> {
  return new Set(nodes.filter((n) => isOnCanvas(n, canvasId)).map((n) => n.id));
}

/** Edges visible on a canvas: both endpoints must be visible there. */
export function edgesOnCanvas<E extends EdgeLike>(edges: readonly E[], visible: ReadonlySet<string>): E[] {
  return edges.filter((e) => visible.has(e.from.nodeId) && visible.has(e.to.nodeId));
}

/**
 * Ensure a board has a canvas list and every free node / stroke a valid
 * canvasId. Missing or unknown ids land on the active canvas (legacy content â†’
 * the default canvas; CLI-created nodes â†’ wherever the user is). Shared nodes
 * have any stray canvasId removed. Idempotent; returns a new board.
 */
export function normalizeCanvases<B extends CanvasBoardLike>(board: B): B {
  const canvases = board.canvases && board.canvases.length > 0
    ? board.canvases
    : [{ id: DEFAULT_CANVAS_ID, name: DEFAULT_CANVAS_NAME }];
  const active = activeCanvasOf({ canvases, ...(board.activeCanvasId ? { activeCanvasId: board.activeCanvasId } : {}) });
  const known = new Set(canvases.map((c) => c.id));
  const nodes = board.nodes.map((n) => {
    if (isSharedNode(n)) {
      if (n.canvasId === undefined) return n;
      const { canvasId: _drop, ...rest } = n;
      void _drop;
      return rest as typeof n;
    }
    return n.canvasId && known.has(n.canvasId) ? n : { ...n, canvasId: active };
  });
  const out = { ...board, canvases, activeCanvasId: active, nodes } as B;
  if (board.drawings) {
    out.drawings = board.drawings.map((s) => (s.canvasId && known.has(s.canvasId) ? s : { ...s, canvasId: active }));
  }
  return out;
}

export function newCanvasId(): string {
  return `canvas-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function addCanvas<B extends CanvasBoardLike>(board: B, name: string, id: string = newCanvasId()): B {
  const b = normalizeCanvases(board);
  return { ...b, canvases: [...(b.canvases ?? []), { id, name }] };
}

export function renameCanvas<B extends CanvasBoardLike>(board: B, id: string, name: string): B {
  const b = normalizeCanvases(board);
  return { ...b, canvases: (b.canvases ?? []).map((c) => (c.id === id ? { ...c, name } : c)) };
}

/** Switch the active canvas. Unknown ids are a no-op. Stamps first so any
 *  unstamped free node stays on the canvas it was created on. */
export function switchCanvas<B extends CanvasBoardLike>(board: B, id: string): B {
  const b = normalizeCanvases(board);
  if (!(b.canvases ?? []).some((c) => c.id === id)) return b;
  return { ...b, activeCanvasId: id };
}

/**
 * Delete a canvas with its free nodes, its strokes and any edge touching a
 * removed node. Shared nodes (mothers, tasks, habit lanes) and board-level
 * data (completions, pomo history) are untouched. The last canvas cannot be
 * deleted â€” returns null.
 */
export function deleteCanvas<B extends CanvasBoardLike>(board: B, id: string): B | null {
  const b = normalizeCanvases(board);
  const list = b.canvases ?? [];
  if (list.length <= 1 || !list.some((c) => c.id === id)) return null;
  const removed = new Set(b.nodes.filter((n) => !isSharedNode(n) && n.canvasId === id).map((n) => n.id));
  const canvases = list.filter((c) => c.id !== id);
  const out = {
    ...b,
    canvases,
    activeCanvasId: b.activeCanvasId === id ? canvases[0]!.id : b.activeCanvasId,
    nodes: b.nodes.filter((n) => !removed.has(n.id)),
    edges: b.edges.filter((e) => !removed.has(e.from.nodeId) && !removed.has(e.to.nodeId)),
  } as B;
  if (b.drawings) out.drawings = b.drawings.filter((s) => s.canvasId !== id);
  return out;
}

/** Resolve a user reference: exact id, then case-insensitive name, then id prefix. */
export function resolveCanvas(canvases: readonly CanvasMeta[], ref: string): CanvasMeta | 'ambiguous' | null {
  const exact = canvases.find((c) => c.id === ref);
  if (exact) return exact;
  const lower = ref.toLowerCase();
  const byName = canvases.filter((c) => c.name.toLowerCase() === lower);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) return 'ambiguous';
  const byPrefix = canvases.filter((c) => c.id.startsWith(ref));
  if (byPrefix.length === 1) return byPrefix[0]!;
  return byPrefix.length > 1 ? 'ambiguous' : null;
}
