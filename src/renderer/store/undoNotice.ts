// "Deleted … · UNDO" — a short notice after a one-click delete, so the user
// learns it can be taken back (Ctrl+Z works too). The notice remembers the
// board before and after the delete; UNDO steps back exactly those history
// slots, and only while nothing else changed since (otherwise it would undo
// the wrong thing, so the notice goes away instead).

import { create } from 'zustand';
import { useBoardStore } from './boardStore';
import { saveBoard } from './eventLog';
import type { Board } from '../../shared/types';

export interface UndoNotice {
  id: number;
  label: string;
  before: Board;
  after: Board;
  /** Set when the change can't be stepped back through history (it ran
   *  async work): UNDO calls this instead. */
  revert?: () => void;
}

export const useUndoNotice = create<{ notice: UndoNotice | null }>(() => ({ notice: null }));

let seq = 0;

/** Run a delete and, if it changed the board, offer to undo it. */
export function undoable(label: string, run: () => void): void {
  const before = useBoardStore.getState().board;
  run();
  const after = useBoardStore.getState().board;
  if (!before || !after || before === after) return;
  useUndoNotice.setState({ notice: { id: ++seq, label, before, after } });
}

/** A notice whose UNDO runs its own reverse step (for changes with async
 *  parts, like Drop, which also takes the plan off the Calendar). */
export function revertible(label: string, revert: () => void): void {
  const board = useBoardStore.getState().board;
  if (!board) return;
  useUndoNotice.setState({ notice: { id: ++seq, label, before: board, after: board, revert } });
}

export function dismissUndoNotice(): void {
  useUndoNotice.setState({ notice: null });
}

/** Take the noticed delete back. False when that is no longer safe. */
export function undoNoticed(): boolean {
  const n = useUndoNotice.getState().notice;
  dismissUndoNotice();
  if (n?.revert) { n.revert(); return true; }
  const s = useBoardStore.getState();
  if (!n || s.board !== n.after) return false;
  const at = s.history.lastIndexOf(n.before);
  if (at < 0) return false;
  for (let k = s.history.length - at; k > 0; k--) useBoardStore.getState().undo();
  const board = useBoardStore.getState().board;
  if (board) void saveBoard(board);
  return true;
}
