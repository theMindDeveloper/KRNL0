// Easy / Advanced UI mode (docs/06-requirements/easy-mode.md). The single gate
// for the renderer: Easy hides the links between features (span naming,
// categories, task links, focus, retag) and shows plan and reality by time
// only. Board data is identical in both modes; absent = advanced.

import { useBoardStore } from './boardStore';

type WithMode = { uiMode?: 'easy' | 'advanced' } | null | undefined;

export const isEasyBoard = (board: WithMode): boolean => board?.uiMode === 'easy';

/** True in Easy mode. Components gate on this, never on the board field. */
export const useEasyMode = (): boolean => useBoardStore((s) => isEasyBoard(s.board));
