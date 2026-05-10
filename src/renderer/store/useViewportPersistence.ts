import { useEffect, useRef } from 'react';
import type { BoardViewport } from '../../shared/types';
import { useBoardStore } from './boardStore';

const DEBOUNCE_MS = 500;

interface KrnlBridge {
  boardSaveViewport?: (v: BoardViewport) => void | Promise<void>;
}
declare global {
  interface Window {
    krnl?: KrnlBridge;
  }
}

// Mirrors viewport changes into board.json with a 500ms debounce so a pointer-drag
// does not thrash the disk (Decision #7).
export function useViewportPersistence(): void {
  const viewport = useBoardStore((s) => s.viewport);
  const board = useBoardStore((s) => s.board);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!board) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      window.krnl?.boardSaveViewport?.(viewport);
      timer.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [viewport, board]);
}
