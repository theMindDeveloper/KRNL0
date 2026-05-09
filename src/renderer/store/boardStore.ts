import { create } from 'zustand';
import type { Board, Node, Edge } from '../../shared/types';

interface BoardStore {
  board: Board | null;
  setBoard: (board: Board) => void;
  updateNode: (id: string, patch: Partial<Node>) => void;
  addEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  theme: 'light' | 'dark';
}

export const useBoardStore = create<BoardStore>((set) => ({
  board: null,
  theme: 'light',

  setBoard: (board) => set({ board }),

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

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
    set({ theme });
  },
}));
