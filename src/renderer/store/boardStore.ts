import { create } from 'zustand';
import { saveBoard } from './eventLog';
import type { Board, BoardViewport, Node, Edge, LayoutMode, StationGeometry, MotherNodeConfig, CompletionRecord } from '../../shared/types';
import type { TaskState } from '../components/nodes/TaskNode/types';
import type { TodoItem, TodoState } from '../components/nodes/TodoNode/types';
import { recordCompletion as recordCompletionLedger, clearCompletion as clearCompletionLedger } from './completionLedger';

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
  setLayoutGeometry: (geom: Board['layoutGeometry']) => void;
}

const HISTORY_CAP = 50;
// Coalesce mutations into a single history entry when they happen in the same
// JS task — e.g. a multi-node drag commits `updateNode` once per node, but the
// user perceives it as one action. We push the pre-mutation board the first
// time pushHistory is called within a task, then suppress further pushes until
// the microtask queue drains.
let _coalescing = false;

function pushHistory(s: BoardStore): { history: Board[]; future: Board[] } {
  if (!s.board) return { history: s.history, future: s.future };
  if (_coalescing) return { history: s.history, future: s.future };
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

  setBoard: (board) => set({ board, viewport: board.viewport, history: [], future: [] }),

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

  addNode: (node) =>
    set((s) => {
      if (!s.board) return s;
      return {
        ...pushHistory(s),
        board: { ...s.board, nodes: [...s.board.nodes, node] },
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
        board: prev,
        history: s.history.slice(0, -1),
        future: [s.board, ...s.future].slice(0, HISTORY_CAP),
      };
    }),

  redo: () =>
    set((s) => {
      if (!s.board || s.future.length === 0) return s;
      const next = s.future[0]!;
      return {
        board: next,
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

  clearCompletion: (taskId) =>
    set((s) => {
      if (!s.board) return s;
      return {
        board: { ...s.board, completions: clearCompletionLedger(s.board.completions, taskId) },
      };
    }),

  clearFocusHistory: () => {
    set((s) => {
      if (!s.board) return s;
      const { completions: _drop, ...rest } = s.board;
      void _drop;
      const cleared: Board = {
        ...(rest as Board),
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
    });
  },

  factoryReset: async () => {
    const fresh = (await window.krnl?.boardReset?.()) as Board | undefined;
    if (!fresh) return;
    set({ board: fresh, viewport: fresh.viewport, history: [], future: [] });
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
        secondsAccumulated: 0,
        currentSessionElapsedSec: 0,
        kind: 'focus',
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
