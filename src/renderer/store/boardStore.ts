import { create } from 'zustand';
import type { Board, BoardViewport, Node, Edge } from '../../shared/types';

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
}));
