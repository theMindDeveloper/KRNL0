import { create } from 'zustand';
import type { Board, BoardViewport, Node, Edge } from '../../shared/types';
import type { TaskState } from '../components/nodes/TaskNode/types';
import type { TodoItem, TodoState } from '../components/nodes/TodoNode/types';

const INITIAL_VIEWPORT: BoardViewport = { x: 0, y: 160, zoom: 1 };
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

// ── Task chain index (module-level memoization) ───────────────────────────────
// Keyed by nodeId → { prev, next } for edges where from.event === 'task.next'.
// The Map reference is stable when the edges array reference is unchanged,
// so Zustand's Object.is equality avoids unnecessary re-renders.
let _lastEdges: readonly Edge[] | null = null;
let _cachedChainIndex: ReadonlyMap<string, { prev: string | null; next: string | null }> =
  new Map();

function buildChainIndex(
  edges: readonly Edge[],
): ReadonlyMap<string, { prev: string | null; next: string | null }> {
  const map = new Map<string, { prev: string | null; next: string | null }>();
  for (const e of edges) {
    if (e.from.event !== 'task.next') continue;
    const fromId = e.from.nodeId;
    const toId = e.to.nodeId;
    const fromEntry = map.get(fromId) ?? { prev: null, next: null };
    map.set(fromId, { ...fromEntry, next: toId });
    const toEntry = map.get(toId) ?? { prev: null, next: null };
    map.set(toId, { ...toEntry, prev: fromId });
  }
  return map;
}

interface BoardStore {
  board: Board | null;
  viewport: BoardViewport;
  theme: 'light' | 'dark';
  selectedNodeId: string | null;
  setBoard: (board: Board) => void;
  updateNode: (id: string, patch: Partial<Node>) => void;
  addNode: (node: Node) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;
  swapMotherSlots: (idA: string, idB: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setViewport: (v: BoardViewport) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (focalScreenX: number, focalScreenY: number, factor: number) => void;
  resetViewport: () => void;
  selectNode: (id: string | null) => void;
  selectTaskChain: () => ReadonlyMap<string, { prev: string | null; next: string | null }>;
  insertSiblingTaskAfter: (taskNodeId: string, opts?: { text?: string; durationMin?: number }) => void;
}

function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export const useBoardStore = create<BoardStore>((set) => ({
  board: null,
  viewport: INITIAL_VIEWPORT,
  theme: 'light',
  selectedNodeId: null,
  selectNode: (id) => set({ selectedNodeId: id }),

  setBoard: (board) => set({ board, viewport: board.viewport }),

  updateNode: (id, patch) =>
    set((s) => {
      if (!s.board) return s;
      return {
        board: {
          ...s.board,
          nodes: s.board.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        },
      };
    }),

  addNode: (node) =>
    set((s) => {
      if (!s.board) return s;
      return { board: { ...s.board, nodes: [...s.board.nodes, node] } };
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
      return { board: { ...s.board, edges: [...s.board.edges, edge] } };
    }),

  removeEdge: (id) =>
    set((s) => {
      if (!s.board) return s;
      return { board: { ...s.board, edges: s.board.edges.filter((e) => e.id !== id) } };
    }),

  swapMotherSlots: (idA, idB) =>
    set((s) => {
      if (!s.board) return s;
      const nodeA = s.board.nodes.find((n) => n.id === idA);
      const nodeB = s.board.nodes.find((n) => n.id === idB);
      if (!nodeA || !nodeB) return s;
      const posA = nodeA.position;
      const posB = nodeB.position;
      return {
        board: {
          ...s.board,
          nodes: s.board.nodes.map((n) => {
            if (n.id === idA) return { ...n, position: posB };
            if (n.id === idB) return { ...n, position: posA };
            return n;
          }),
        },
      };
    }),

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

      // Bug 2: Walk the chain forward from taskNodeId (same layer only), collecting
      // all downstream task node ids. Add an edge from newSibling to each.
      // Do NOT remove or modify any existing edges (purely additive fork).
      const edgesArr = s.board.edges;
      const downstreamTargets: string[] = [];
      const visited = new Set<string>();
      let current: string | undefined = taskNodeId;
      const cap = s.board.nodes.length + 1;
      let steps = 0;
      while (current !== undefined && steps < cap) {
        steps++;
        const nextEdge = edgesArr.find(
          (e) => e.from.nodeId === current && e.from.event === 'task.next',
        );
        if (!nextEdge) break;
        const nextId = nextEdge.to.nodeId;
        if (visited.has(nextId)) break; // cycle guard
        // Only follow at the same layer
        const nextNode = s.board.nodes.find((n) => n.id === nextId);
        if (!nextNode || nextNode.kind !== 'todo.task') break;
        const nextTs = nextNode.state as TaskState;
        if (nextTs.layer !== sourceTaskState.layer) break;
        visited.add(nextId);
        downstreamTargets.push(nextId);
        current = nextId;
      }

      const newEdges: Edge[] = downstreamTargets.map((targetId) => ({
        id: `edge-${crypto.randomUUID()}`,
        from: { nodeId: newNodeId, event: 'task.next' },
        to: { nodeId: targetId, command: 'task.activate' },
        enabled: true,
      }));

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
        board: {
          ...s.board,
          nodes: finalNodes,
          // Additive: keep all existing edges, append the new fork edges
          edges: [...s.board.edges, ...newEdges],
        },
      };
    });

    const updated = useBoardStore.getState().board;
    if (updated) void window.krnl?.boardSave(updated);
  },
}));
