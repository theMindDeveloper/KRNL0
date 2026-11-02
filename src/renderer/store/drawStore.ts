// Pen tool UI state (not persisted): is the pen on, which tool, colour, size.
// The strokes themselves live on board.drawings (boardStore).

import { create } from 'zustand';
import type { DrawTool } from '../../shared/types/board';

export type PenTool = DrawTool | 'eraser';

export const PEN_COLORS = ['#f4f6f8', '#c9f158', '#ff8e64', '#5ad1e6', '#b48cff', '#ffd166', '#ff5d8f', '#1a1814'] as const;

export const TOOL_SIZE: Record<DrawTool, number> = { pen: 3, marker: 7, highlighter: 18 };

interface DrawStore {
  active: boolean;
  tool: PenTool;
  color: string;
  sizeScale: number; // 0.5 / 1 / 2 — S / M / L
  setActive: (on: boolean) => void;
  toggle: () => void;
  setTool: (t: PenTool) => void;
  setColor: (c: string) => void;
  setSizeScale: (s: number) => void;
}

export const useDrawStore = create<DrawStore>((set) => ({
  active: false,
  tool: 'pen',
  color: PEN_COLORS[1],
  sizeScale: 1,
  setActive: (on) => set({ active: on }),
  toggle: () => set((s) => ({ active: !s.active })),
  setTool: (tool) => set({ tool, active: true }),
  setColor: (color) => set((s) => ({ color, tool: s.tool === 'eraser' ? 'pen' : s.tool })),
  setSizeScale: (sizeScale) => set({ sizeScale }),
}));
