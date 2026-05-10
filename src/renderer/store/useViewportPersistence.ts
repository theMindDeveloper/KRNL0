import { useEffect, useRef } from 'react';
import { useBoardStore } from './boardStore';

const DEBOUNCE_MS = 500;

// Mirrors viewport changes into board.json with a 500ms debounce so a pointer-drag
// does not thrash the disk (Decision #7).
export function useViewportPersistence(): void {
  const viewport = useBoardStore((s) => s.viewport);
  // Only depend on whether a board exists, not on its reference. Subscribing
  // to s.board re-fired this effect every drag tick (board ref churns 60fps),
  // thrashing setTimeout. The persistence target itself is fetched fresh
  // inside the effect when the debounce actually fires.
  const hasBoard = useBoardStore((s) => s.board !== null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasBoard) return;
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
  }, [viewport, hasBoard]);
}
