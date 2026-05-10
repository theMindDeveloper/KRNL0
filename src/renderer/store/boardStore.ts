import { create } from 'zustand';
import type { Board, BoardViewport, Node, Edge } from '../../shared/types';

const INITIAL_VIEWPORT: BoardViewport = { x: 0, y: 160, zoom: 1 };
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

interface BoardStore {
  board: Board | null;
  viewport: BoardViewport;
  theme: 'light' | 'dark';
  selectedNodeId: string | null;
  setBoard: (board: Board) => void;
  updateNode: (id: string, patch: Partial<Node>) => void;
  addNode: (node: Node) => void;
  addEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setViewport: (v: BoardViewport) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (focalScreenX: number, focalScreenY: number, factor: number) => void;
  resetViewport: () => void;
  selectNode: (id: string | null) => void;
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
}));
