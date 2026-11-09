import { create } from 'zustand';
import { saveBoard, setLiveViewportSource } from './eventLog';
import type { Board, BoardViewport, Node, Edge, LayoutMode, StationGeometry, MotherNodeConfig, CompletionRecord } from '../../shared/types';
import type { DrawStroke } from '../../shared/types/board';
import type { TaskState } from '../components/nodes/TaskNode/types';
import type { TodoItem, TodoState } from '../components/nodes/TodoNode/types';
import { recordCompletion as recordCompletionLedger, clearCompletion as clearCompletionLedger } from './completionLedger';
import { withoutTimeLog } from './timeLogPause';
import {
  activeCanvasOf,
  isSharedNode,
  isStrokeOnCanvas,
  newCanvasId,
  addCanvas as addCanvasTo,
  renameCanvas as renameCanvasIn,
  switchCanvas as switchCanvasIn,
  deleteCanvas as deleteCanvasFrom,
} from '../../shared/canvas';

/** Undo/redo restore content, not where the user is looking: keep the current
 *  canvas when the restored snapshot still has it. */
function keepActiveCanvas(snapshot: Board, current: Board): Board {
  const id = current.activeCanvasId;
  if (!id || snapshot.activeCanvasId === id || !(snapshot.canvases ?? []).some((c) => c.id === id)) return snapshot;
  return { ...snapshot, activeCanvasId: id };
}

const INITIAL_VIEWPORT: BoardViewport = { x: 0, y: 160, zoom: 1 };
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

// ── Task chain index (module-level memoization) ───────────────────────────────
// Keyed by nodeId → { prev, next } for edges where from.event === 'task.next'.
// The Map reference is stable when the edges array reference is unchanged,
// so Zustand's Object.is equality avoids unnecessary re-renders.
export interface ChainEntry {
  prev: string | null;          // first incoming (insertion order) — kept for back-compat
  next: string | null;          // first outgoing (insertion order) — kept for back-compat
  prevs: readonly string[];     // all incoming task.next sources
  nexts: readonly string[];     // all outgoing task.next targets
}

let _lastEdges: readonly Edge[] | null = null;
let _cachedChainIndex: ReadonlyMap<string, ChainEntry> = new Map();

function buildChainIndex(edges: readonly Edge[]): ReadonlyMap<string, ChainEntry> {
  const prevsMap = new Map<string, string[]>();
  const nextsMap = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from.event !== 'task.next') continue;
    const fromId = e.from.nodeId;
    const toId = e.to.nodeId;
    if (!nextsMap.has(fromId)) nextsMap.set(fromId, []);
    nextsMap.get(fromId)!.push(toId);
    if (!prevsMap.has(toId)) prevsMap.set(toId, []);
    prevsMap.get(toId)!.push(fromId);
  }
  const allIds = new Set<string>([...prevsMap.keys(), ...nextsMap.keys()]);
  const map = new Map<string, ChainEntry>();
  for (const id of allIds) {
    const prevs = prevsMap.get(id) ?? [];
    const nexts = nextsMap.get(id) ?? [];
    map.set(id, {
      prev: prevs[0] ?? null,
      next: nexts[0] ?? null,
      prevs,
      nexts,
    });
  }
  return map;
}

interface BoardStore {
  board: Board | null;
  viewport: BoardViewport;
  theme: 'light' | 'dark';
  selectedNodeId: string | null;
  // Transient UI state — which node is currently hovered. Used to bold outgoing
  // edges from the hovered mother (and any node). Stored as a primitive string
  // so Zustand's Object.is check stays stable when null→null between renders.
  hoveredNodeId: string | null;
  history: Board[];
  future: Board[];
  setBoard: (board: Board) => void;
  /** Adopt a board re-read from disk after an external (sys CLI) change.
   *  Unlike setBoard it keeps undo history and the live viewport; if the
   *  content changed, the pre-reload board becomes one undo step. */
  reloadBoard: (board: Board) => void;
  setHoveredNodeId: (id: string | null) => void;
  updateNode: (id: string, patch: Partial<Node>, opts?: { skipHistory?: boolean }) => void;
  addNode: (node: Node) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;
  swapMotherSlots: (idA: string, idB: string) => void;
  reorderMotherSlots: (motherId: string, toSlotIndex: number) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setViewport: (v: BoardViewport) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (focalScreenX: number, focalScreenY: number, factor: number) => void;
  resetViewport: () => void;
  selectNode: (id: string | null) => void;
  selectTaskChain: () => ReadonlyMap<string, ChainEntry>;
  insertSiblingTaskAfter: (taskNodeId: string, opts?: { text?: string; durationMin?: number }) => void;
  undo: () => void;
  redo: () => void;
  // #169 — completion ledger. recordCompletion/clearCompletion are upsert-by-
  // taskId and DO NOT push a history slot: they ride the same set() as the
  // toggle that triggered them (the toggle already snapshotted), so one undo
  // reverts both the done-state and the ledger entry together.
  recordCompletion: (entry: CompletionRecord) => void;
  clearCompletion: (taskId: string) => void;
  // Pen tool strokes — undoable, persisted on board.drawings.
  addStroke: (stroke: DrawStroke) => void;
  removeStrokes: (ids: readonly string[]) => void;
  /** Move strokes by a flow-space offset (one undo step for the whole batch). */
  moveStrokes: (moves: ReadonlyArray<{ id: string; dx: number; dy: number }>) => void;
  clearDrawings: () => void;
  // Destructive, non-undoable: wipe the "what I did" record — the completion
  // ledger (#169) and every pomo node's session history — leaving the live
  // board (tasks, habits, layout) untouched. Persists and clears undo/redo so a
  // stale undo can't resurrect the wiped data. Gated behind hold-to-confirm UI.
  clearFocusHistory: () => void;
  // Destructive, non-undoable: replace the entire board with a fresh canonical
  // seed (factory reset). Persists via the board:reset IPC and clears undo/redo.
  factoryReset: () => Promise<void>;
  // ADR 0008 § 2.1 / § 4.1 — layout mode and geometry actions.
  // Both persist through the same saveBoard IPC path as all other mutations.
  setLayoutMode: (mode: LayoutMode) => void;
  // Easy / Advanced UI mode — a preference, not undoable.
  setUiMode: (mode: 'easy' | 'advanced') => void;
  /** Align to grid: off (null), cards only, or everything (a preference: no undo slot). */
  setAlignGrid: (scope: 'cards' | 'all' | null) => void;
  /** Move several nodes at once — one undo step (the grid tidy). */
  moveNodes: (moves: ReadonlyArray<{ id: string; x: number; y: number }>) => void;
  setLayoutGeometry: (geom: Board['layoutGeometry']) => void;
  // Decision 33 — free-content canvases. add/rename/delete are undoable;
  // switching is navigation (no history). All persist via saveBoard.
  addCanvas: (name: string) => string | null;
  renameCanvas: (id: string, name: string) => void;
  deleteCanvas: (id: string) => boolean;
  switchCanvas: (id: string) => void;
}

const HISTORY_CAP = 50;
// Coalesce mutations into a single history entry when they happen in the same
// JS task — e.g. a multi-node drag commits `updateNode` once per node, but the
// user perceives it as one action. We push the pre-mutation board the first
// time pushHistory is called within a task, then suppress further pushes until
// the microtask queue drains.
let _coalescing = false;
// One user action that writes in several steps across awaits (Won't do =
// drop + unschedule; quick add = add + schedule + remind) is one Ctrl+Z.
let _group: { pushed: boolean } | null = null;

/** Run `fn` as one undo step, however many awaits it spans. */
export async function historyGroup<T>(fn: () => Promise<T> | T): Promise<T> {
  if (_group) return fn();
  _group = { pushed: false };
  try {
    return await fn();
  } finally {
    _group = null;
  }
}

/** Exported so bulk paths that call setState directly (cascade delete) take
 *  part in the same per-task coalescing — otherwise a delete followed by an
 *  updateNode in the same tick cost two Ctrl+Z presses. */
export function pushHistory(s: BoardStore): { history: Board[]; future: Board[] } {
  if (!s.board) return { history: s.history, future: s.future };
  if (_group) {
    if (_group.pushed) return { history: s.history, future: s.future };
    _group.pushed = true;
  } else if (_coalescing) return { history: s.history, future: s.future };
  _coalescing = true;
  queueMicrotask(() => { _coalescing = false; });
  const nextHistory = [...s.history, s.board];
  if (nextHistory.length > HISTORY_CAP) nextHistory.shift();
  return { history: nextHistory, future: [] };
}

function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export const useBoardStore = create<BoardStore>((set) => ({
  board: null,
  viewport: INITIAL_VIEWPORT,
  theme: 'light',
  selectedNodeId: null,
  hoveredNodeId: null,
  history: [],
  future: [],
  selectNode: (id) => set({ selectedNodeId: id }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),

  // Decision 35: adopting a loaded board is not a change to time-log.
  setBoard: (board) => withoutTimeLog(() => set({ board, viewport: board.viewport, history: [], future: [] })),

  // A reload adopts a CLI write main has already time-logged.
  reloadBoard: (board) => withoutTimeLog(() =>
    set((s) => {
      if (!s.board) return { board, viewport: board.viewport, history: [], future: [] };
      const same =
        JSON.stringify(s.board.nodes) === JSON.stringify(board.nodes) &&
        JSON.stringify(s.board.edges) === JSON.stringify(board.edges);
      if (same) return { board };
      return {
        board,
        history: [...s.history, s.board].slice(-HISTORY_CAP),
        future: [],
      };
    })),

  updateNode: (id, patch, opts) =>
    set((s) => {
      if (!s.board) return s;
      const existing = s.board.nodes.find((n) => n.id === id);
      // No-op guard: a click without an actual drag can emit a position commit
      // whose value equals the existing position. Don't waste a history slot.
      if (
        existing &&
        patch.position !== undefined &&
        Object.keys(patch).length === 1 &&
        existing.position.x === patch.position.x &&
        existing.position.y === patch.position.y
      ) {
        return s;
      }
      const historyPatch = opts?.skipHistory ? {} : pushHistory(s);
      return {
        ...historyPatch,
        board: {
          ...s.board,
          nodes: s.board.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        },
      };
    }),

  // Free nodes always land on the active canvas — overwriting any canvasId a
  // pasted / duplicated node carried over from its source (Decision 33).
  addNode: (node) =>
    set((s) => {
      if (!s.board) return s;
      const placed = isSharedNode(node) ? node : { ...node, canvasId: activeCanvasOf(s.board) };
      return {
        ...pushHistory(s),
        board: { ...s.board, nodes: [...s.board.nodes, placed] },
      };
    }),

  // Remove a non-mother node and any edge that references it from either
  // endpoint. Mother nodes (isMother === true) are protected — call is a
  // no-op so an accidental sys/CLI invocation can't delete pomo/todo/habit/term.
  removeNode: (id) =>
    set((s) => {
      if (!s.board) return s;
      const target = s.board.nodes.find((n) => n.id === id);
      if (!target || target.isMother) return s;
      return {
        ...pushHistory(s),
        board: {
          ...s.board,
          nodes: s.board.nodes.filter((n) => n.id !== id),
          edges: s.board.edges.filter(
            (e) => e.from.nodeId !== id && e.to.nodeId !== id,
          ),
        },
        selectedNodeId:
          s.selectedNodeId === id ? null : s.selectedNodeId,
      };
    }),

  addEdge: (edge) =>
    set((s) => {
      if (!s.board) return s;
      return {
        ...pushHistory(s),
        board: { ...s.board, edges: [...s.board.edges, edge] },
      };
    }),

  removeEdge: (id) =>
    set((s) => {
      if (!s.board) return s;
      return {
        ...pushHistory(s),
        board: { ...s.board, edges: s.board.edges.filter((e) => e.id !== id) },
      };
    }),

  swapMotherSlots: (idA, idB) =>
    set((s) => {
      if (!s.board) return s;
      const nodeA = s.board.nodes.find((n) => n.id === idA);
      const nodeB = s.board.nodes.find((n) => n.id === idB);
      if (!nodeA || !nodeB) return s;
      const posA = nodeA.position;
      const posB = nodeB.position;
      // Station-mode parity: swap config.stationSlot too so dragging a mother
      // in station mode visibly rearranges the panels (ADR 0008 § 4.2).
      const cfgA = (nodeA.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
      const cfgB = (nodeB.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
      const slotA = cfgA.stationSlot;
      const slotB = cfgB.stationSlot;
      return {
        ...pushHistory(s),
        board: {
          ...s.board,
          nodes: s.board.nodes.map((n) => {
            if (n.id === idA) return { ...n, position: posB, config: { ...cfgA, stationSlot: slotB } };
            if (n.id === idB) return { ...n, position: posA, config: { ...cfgB, stationSlot: slotA } };
            return n;
          }),
        },
      };
    }),

  // Drag-to-reorder: move motherId to the given 0-based toSlotIndex, shifting
  // other mothers to fill the gap. A single position-batch mutation so undo
  // captures the entire reorder in one history entry.
  reorderMotherSlots: (motherId, toSlotIndex) =>
    set((s) => {
      if (!s.board) return s;
      const mothers = s.board.nodes
        .filter((n) => n.isMother)
        .slice()
        .sort((a, b) => a.position.x - b.position.x);
      const fromSlot = mothers.findIndex((n) => n.id === motherId);
      if (fromSlot === -1 || fromSlot === toSlotIndex) return s;

      // Build new order by removing from old slot and inserting at new slot.
      const reordered = mothers.slice();
      const [moved] = reordered.splice(fromSlot, 1);
      if (!moved) return s;
      reordered.splice(toSlotIndex, 0, moved);

      // Collect the canonical x positions (sorted order).
      const slotXs = mothers.map((n) => n.position.x);

      // Map each mother id → its new x-position.
      const newXByNodeId = new Map<string, number>(
        reordered.map((n, i) => [n.id, slotXs[i]!])
      );

      return {
        ...pushHistory(s),
        board: {
          ...s.board,
          nodes: s.board.nodes.map((n) => {
            const newX = newXByNodeId.get(n.id);
            if (newX === undefined) return n;
            return { ...n, position: { x: newX, y: n.position.y } };
          }),
        },
      };
    }),

  undo: () =>
    set((s) => {
      if (!s.board || s.history.length === 0) return s;
      const prev = s.history[s.history.length - 1]!;
      return {
        board: keepActiveCanvas(prev, s.board),
        history: s.history.slice(0, -1),
        future: [s.board, ...s.future].slice(0, HISTORY_CAP),
      };
    }),

  redo: () =>
    set((s) => {
      if (!s.board || s.future.length === 0) return s;
      const next = s.future[0]!;
      return {
        board: keepActiveCanvas(next, s.board),
        history: [...s.history, s.board].slice(-HISTORY_CAP),
        future: s.future.slice(1),
      };
    }),

  // #169 — completion ledger writers. No pushHistory: the triggering toggle
  // already snapshotted the board, so this ledger change shares that undo slot.
  recordCompletion: (entry) =>
    set((s) => {
      if (!s.board) return s;
      return {
        board: { ...s.board, completions: recordCompletionLedger(s.board.completions, entry) },
      };
    }),

  addStroke: (stroke) =>
    set((s) => {
      if (!s.board) return s;
      const board = { ...s.board, drawings: [...(s.board.drawings ?? []), { ...stroke, canvasId: activeCanvasOf(s.board) }] };
      void saveBoard(board);
      return { ...pushHistory(s), board };
    }),

  removeStrokes: (ids) =>
    set((s) => {
      if (!s.board || ids.length === 0) return s;
      const drop = new Set(ids);
      const board = { ...s.board, drawings: (s.board.drawings ?? []).filter((d) => !drop.has(d.id)) };
      void saveBoard(board);
      return { ...pushHistory(s), board };
    }),

  moveStrokes: (moves) =>
    set((s) => {
      if (!s.board || moves.length === 0) return s;
      const by = new Map(moves.map((m) => [m.id, m]));
      const board = {
        ...s.board,
        drawings: (s.board.drawings ?? []).map((d) => {
          const m = by.get(d.id);
          if (!m || (m.dx === 0 && m.dy === 0)) return d;
          return { ...d, points: d.points.map(([x, y, p]) => [x + m.dx, y + m.dy, p] as [number, number, number]) };
        }),
      };
      void saveBoard(board);
      return { ...pushHistory(s), board };
    }),

  // Clears the active canvas's strokes only (Decision 33).
  clearDrawings: () =>
    set((s) => {
      if (!s.board) return s;
      const active = activeCanvasOf(s.board);
      const all = s.board.drawings ?? [];
      const kept = all.filter((d) => !isStrokeOnCanvas(d, active));
      if (kept.length === all.length) return s;
      const board = { ...s.board, drawings: kept };
      void saveBoard(board);
      return { ...pushHistory(s), board };
    }),

  clearCompletion: (taskId) =>
    set((s) => {
      if (!s.board) return s;
      return {
        board: { ...s.board, completions: clearCompletionLedger(s.board.completions, taskId) },
      };
    }),

  // Not time-logged (a wipe, not a correction) — see Decision 35 notes in
  // docs/06-requirements/time-log.md.
  clearFocusHistory: () => {
    withoutTimeLog(() => set((s) => {
      if (!s.board) return s;
      const { completions: _drop, ...rest } = s.board;
      void _drop;
      const cleared: Board = {
        ...(rest as Board),
        completions: [],
        completionsClearedAt: new Date().toISOString(),
        nodes: s.board.nodes.map((n) =>
          n.kind === 'pomo'
            ? { ...n, state: { ...(n.state as Record<string, unknown>), history: [] } }
            : n,
        ),
      };
      void saveBoard(cleared);
      // Non-undoable: drop both stacks so a stale snapshot can't restore the
      // wiped history.
      return { board: cleared, history: [], future: [] };
    }));
    // Decision 35 — the log keeps history, so record the wipe (views drop
    // everything before it). Lazy import: timeLog imports this store.
    void import('./timeLog').then((m) => m.logTime({ type: 'history.cleared' }));
  },

  factoryReset: async () => {
    const fresh = (await window.krnl?.boardReset?.()) as Board | undefined;
    if (!fresh) return;
    withoutTimeLog(() => set({ board: fresh, viewport: fresh.viewport, history: [], future: [] }));
  },

  // ADR 0008 § 2.1 / § 4.1 — setLayoutMode persists through the same boardSave
  // IPC path used by every other board mutation. No history slot — mode toggle
  // is not undoable (intentional; matches Decision 13 anchor-position behaviour).
  setLayoutMode: (mode) => {
    set((s) => {
      if (!s.board) return s;
      const updated: Board = { ...s.board, layoutMode: mode };
      void saveBoard(updated);
      return { board: updated };
    });
  },

  setAlignGrid: (scope) => {
    set((s) => {
      if (!s.board) return s;
      const { alignGrid: _old, ...rest } = s.board;
      void _old;
      const updated: Board = scope ? { ...rest, alignGrid: scope } : rest;
      void saveBoard(updated);
      return { board: updated };
    });
  },

  moveNodes: (moves) =>
    set((s) => {
      if (!s.board || moves.length === 0) return s;
      const by = new Map(moves.map((m) => [m.id, m]));
      const board = { ...s.board, nodes: s.board.nodes.map((n) => { const m = by.get(n.id); return m ? { ...n, position: { x: m.x, y: m.y } } : n; }) };
      void saveBoard(board);
      return { ...pushHistory(s), board };
    }),

  setUiMode: (mode) => {
    set((s) => {
      if (!s.board) return s;
      const updated: Board = { ...s.board, uiMode: mode };
      void saveBoard(updated);
      return { board: updated };
    });
  },

  // ADR 0008 § 4.1 — setLayoutGeometry persists the panel resize state.
  // Called via the react-resizable-panels onLayout callbacks in StationLayout
  // (Step 4). Not undoable — geometry is a preference, not a content mutation.
  setLayoutGeometry: (geom) => {
    set((s) => {
      if (!s.board) return s;
      // exactOptionalPropertyTypes: strip layoutGeometry from the spread when
      // the caller passes undefined (omit the key rather than setting it to undefined).
      const updated: Board = geom !== undefined
        ? { ...s.board, layoutGeometry: geom }
        : (() => {
            const { layoutGeometry: _drop, ...rest } = s.board;
            void _drop;
            return rest as Board;
          })();
      void saveBoard(updated);
      return { board: updated };
    });
  },

  addCanvas: (name) => {
    const s = useBoardStore.getState();
    if (!s.board) return null;
    const id = newCanvasId();
    // A new canvas opens immediately.
    const board = switchCanvasIn(addCanvasTo(s.board, name.trim() || 'Untitled', id), id);
    useBoardStore.setState({ ...pushHistory(s), board, selectedNodeId: null });
    void saveBoard(board);
    return id;
  },

  renameCanvas: (id, name) => {
    const s = useBoardStore.getState();
    const trimmed = name.trim();
    if (!s.board || !trimmed) return;
    const board = renameCanvasIn(s.board, id, trimmed);
    useBoardStore.setState({ ...pushHistory(s), board });
    void saveBoard(board);
  },

  deleteCanvas: (id) => {
    const s = useBoardStore.getState();
    if (!s.board) return false;
    const board = deleteCanvasFrom(s.board, id);
    if (!board) return false;
    useBoardStore.setState({ ...pushHistory(s), board, selectedNodeId: null });
    void saveBoard(board);
    return true;
  },

  switchCanvas: (id) => {
    const s = useBoardStore.getState();
    if (!s.board || activeCanvasOf(s.board) === id) return;
    const board = switchCanvasIn(s.board, id);
    if (board.activeCanvasId !== id) return;
    useBoardStore.setState({ board, selectedNodeId: null });
    void saveBoard(board);
  },

  // NOTE: `theme` in the store is no longer the authoritative source of truth for
  // the active theme. TopBar owns the live theme value (reads/writes localStorage
  // and sets data-theme on <html> directly). setTheme is kept here for backward
  // compatibility and programmatic use; callers should prefer TopBar's toggle.
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
    set({ theme });
  },

  setViewport: (v) => set({ viewport: { ...v, zoom: clampZoom(v.zoom) } }),

  panBy: (dx, dy) =>
    set((s) => ({
      viewport: { x: s.viewport.x + dx, y: s.viewport.y + dy, zoom: s.viewport.zoom },
    })),

  zoomAt: (focalScreenX, focalScreenY, factor) =>
    set((s) => {
      const { x, y, zoom } = s.viewport;
      const nextZoom = clampZoom(zoom * factor);
      if (nextZoom === zoom) return s;
      // World point under cursor before zoom: (screen - translate) / zoom.
      // After zoom we want the same world point under the cursor, so:
      //   screen = world * nextZoom + nextTranslate
      //   nextTranslate = screen - world * nextZoom
      const worldX = (focalScreenX - x) / zoom;
      const worldY = (focalScreenY - y) / zoom;
      return {
        viewport: {
          x: focalScreenX - worldX * nextZoom,
          y: focalScreenY - worldY * nextZoom,
          zoom: nextZoom,
        },
      };
    }),

  resetViewport: () => set({ viewport: INITIAL_VIEWPORT }),

  selectTaskChain: () => {
    const edges = useBoardStore.getState().board?.edges ?? [];
    if (edges === _lastEdges) return _cachedChainIndex;
    _lastEdges = edges;
    _cachedChainIndex = buildChainIndex(edges);
    return _cachedChainIndex;
  },

  // ADR 0004 §2 — UI label is "Add parallel task" since ADR 0004; internal
  // name retained for stability (replicates source's incoming + outgoing
  // edges so the new task runs concurrently with the source).
  insertSiblingTaskAfter: (taskNodeId: string, opts?: { text?: string; durationMin?: number }) => {
    set((s) => {
      if (!s.board) return s;

      const sourceNode = s.board.nodes.find((n) => n.id === taskNodeId);
      if (!sourceNode || sourceNode.kind !== 'todo.task') return s;

      const sourceTaskState = sourceNode.state as TaskState;
      const text = opts?.text ?? 'New task';
      const durationMin = opts?.durationMin ?? sourceTaskState.durationMin;
      const plannedMin = opts?.durationMin ?? sourceTaskState.plannedMin ?? sourceTaskState.durationMin;

      // Bug 3: create a new TodoItem in the parent TodoNode so the sibling
      // appears in the todo list. This is the same bidirectional-link pattern
      // used by task.addSubtask in commandDispatch.ts.
      const newItemId = crypto.randomUUID();
      const newNodeId = `task-${crypto.randomUUID()}`;

      // Build new task state — parallel fork, same layer / parentTodoId / parentTaskId
      const newTaskState: TaskState = {
        text,
        done: false,
        durationMin,
        eta: `~${plannedMin} min`,
        sequenceNumber: sourceTaskState.sequenceNumber + 1,
        layer: sourceTaskState.layer,
        createdAt: new Date().toISOString(),
        parentTodoId: sourceTaskState.parentTodoId,
        parentTaskId: sourceTaskState.parentTaskId,
        todoItemId: newItemId,
        pomoSessionsCompleted: 0,
        plannedMin,
        // Time is optional — none given → open-ended.
        ...(opts?.durationMin === undefined ? { timeOpen: true } : {}),
        secondsAccumulated: 0,
        currentSessionElapsedSec: 0,
        // #180 — Todo creates events only. A parallel sibling MUST be an event
        // or the calendar selector (which renders kind==='event' only) drops it,
        // so "2.1" never appears on the calendar/clock even after scheduling.
        kind: 'event',
      };

      const newNode: Node = {
        id: newNodeId,
        kind: 'todo.task',
        // Bug 2: position parallel to source (Y offset), not inserted in the chain
        position: { x: sourceNode.position.x, y: sourceNode.position.y + 240 },
        isMother: false,
        state: newTaskState,
        config: { showDuration: true },
      };

      // Graph twin: replicate every DIRECT task.next edge incident on the source.
      // For each X → source, add X → newSibling. For each source → Y, add newSibling → Y.
      // Purely additive — source's existing edges are untouched.
      const edgesArr = s.board.edges;
      const incomingSources: string[] = [];
      const outgoingTargets: string[] = [];
      for (const e of edgesArr) {
        if (e.from.event !== 'task.next') continue;
        if (e.to.nodeId === taskNodeId) incomingSources.push(e.from.nodeId);
        if (e.from.nodeId === taskNodeId) outgoingTargets.push(e.to.nodeId);
      }

      const newEdges: Edge[] = [
        ...incomingSources.map((srcId) => ({
          id: `edge-${crypto.randomUUID()}`,
          from: { nodeId: srcId, event: 'task.next' },
          to: { nodeId: newNodeId, command: 'task.activate' },
          enabled: true,
        })),
        ...outgoingTargets.map((tgtId) => ({
          id: `edge-${crypto.randomUUID()}`,
          from: { nodeId: newNodeId, event: 'task.next' },
          to: { nodeId: tgtId, command: 'task.activate' },
          enabled: true,
        })),
      ];

      // Bug 3: append a new TodoItem to the parent TodoNode (bidirectional link).
      const newTodoItem: TodoItem = {
        id: newItemId,
        text,
        done: false,
        createdAt: new Date().toISOString(),
        completedAt: null,
        taskNodeId: newNodeId,
      };

      const updatedNodes = s.board.nodes.map((n) => {
        if (n.id !== sourceTaskState.parentTodoId) return n;
        const todoState = n.state as TodoState;
        return {
          ...n,
          state: { ...todoState, items: [...todoState.items, newTodoItem] },
        };
      });

      // Inline renumber: find all siblings (same parentTodoId + parentTaskId),
      // sort by createdAt, assign 1-based sequenceNumber
      const allNodesWithNew = [...updatedNodes, newNode];
      const siblings = allNodesWithNew
        .filter((n) => {
          if (n.kind !== 'todo.task') return false;
          const ts = n.state as TaskState;
          return (
            ts.parentTodoId === sourceTaskState.parentTodoId &&
            ts.parentTaskId === sourceTaskState.parentTaskId
          );
        })
        .slice()
        .sort((a, b) => {
          const aTs = a.state as TaskState;
          const bTs = b.state as TaskState;
          return aTs.createdAt < bTs.createdAt ? -1 : aTs.createdAt > bTs.createdAt ? 1 : 0;
        });

      const renumberMap = new Map<string, number>();
      siblings.forEach((sib, idx) => {
        renumberMap.set(sib.id, idx + 1);
      });

      const finalNodes = allNodesWithNew.map((n) => {
        const newSeq = renumberMap.get(n.id);
        if (newSeq === undefined) return n;
        return {
          ...n,
          state: { ...(n.state as TaskState), sequenceNumber: newSeq },
        };
      });

      return {
        ...pushHistory(s),
        board: {
          ...s.board,
          nodes: finalNodes,
          // Additive: keep all existing edges, append the new fork edges
          edges: [...s.board.edges, ...newEdges],
        },
      };
    });

    const updated = useBoardStore.getState().board;
    if (updated) void saveBoard(updated);
  },
}));

// Content saves carry the live camera (see boardSaveLogging).
setLiveViewportSource(() => useBoardStore.getState().viewport);
