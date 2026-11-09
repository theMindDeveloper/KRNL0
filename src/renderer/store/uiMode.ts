// Easy / Advanced UI mode (docs/06-requirements/easy-mode.md). The single gate
// for the renderer: Easy hides the links between features (span naming,
// categories, task links, focus, retag) and shows plan and reality by time
// only. Board data is identical in both modes; absent = advanced.

import { useBoardStore } from './boardStore';
import { setStationEasy } from '../components/Station/stationVisibility';

type WithMode = { uiMode?: 'easy' | 'advanced' } | null | undefined;

export const isEasyBoard = (board: WithMode): boolean => board?.uiMode === 'easy';

/** True in Easy mode. Components gate on this, never on the board field. */
export const useEasyMode = (): boolean => useBoardStore((s) => isEasyBoard(s.board));

// The mode on the page itself (`<html data-ui-mode>`) for CSS-only gates
// (easy-mode D24: no connection dots), and the Station terminal rule (D23).
// Runs inside the store's set(), before React renders the change.
let lastEasy: boolean | null = null;
function applyMode(board: WithMode): void {
  const easy = isEasyBoard(board);
  if (easy === lastEasy) return;
  lastEasy = easy;
  setStationEasy(easy);
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-ui-mode', easy ? 'easy' : 'advanced');
}
// (Guarded: some tests replace the store with a plain hook.)
if (typeof useBoardStore.getState === 'function' && typeof useBoardStore.subscribe === 'function') {
  applyMode(useBoardStore.getState().board);
  useBoardStore.subscribe((s) => applyMode(s.board));
}
