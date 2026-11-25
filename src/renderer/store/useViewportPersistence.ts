import { useEffect } from 'react';
import { useBoardStore } from './boardStore';

const DEBOUNCE_MS = 500;

// Mirrors viewport changes into board.json with a 500ms debounce so a pointer-drag
// does not thrash the disk (Decision #7).
//
// A plain store subscription, not a React selector: the component that runs
// this hook is the whole canvas, and a selector on the viewport re-rendered
// all of it at the end of every pan and zoom (Decision 65).
export function useViewportPersistence(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useBoardStore.subscribe((s, prev) => {
      if (s.viewport === prev.viewport || s.board === null) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        window.krnl?.boardSaveViewport?.(useBoardStore.getState().viewport);
      }, DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer !== null) clearTimeout(timer);
    };
  }, []);
}
