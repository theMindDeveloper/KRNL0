/**
 * useBoardChannel — listen for `board:changed` from main and re-load the
 * board into the Zustand store. This is how sys CLI mutations reach the UI.
 */

import { useEffect } from 'react';
import { useBoardStore } from './boardStore';
import type { Board } from '../../shared/types';

export function useBoardChannel(): void {
  const setBoard = useBoardStore((s) => s.setBoard);

  useEffect(() => {
    const bridge = window.krnl;
    if (!bridge?.onBoardChanged) return;
    const unsubscribe = bridge.onBoardChanged(() => {
      void bridge.boardLoad().then((data) => {
        if (data) setBoard(data as Board);
      });
    });
    return unsubscribe;
  }, [setBoard]);
}
