// First run: the board still holds only the seeded mother nodes, untouched.
import type { Board } from '../../../shared/types';

/** Nothing of the user's yet: no free nodes, todos, habits or pomo history. */
export function isFreshBoard(board: Board | null): boolean {
  if (!board) return false;
  return board.nodes.every((n) => {
    if (!n.isMother) return false;
    const st = (n.state ?? {}) as { items?: unknown[]; habits?: unknown[]; history?: unknown[] };
    return !(st.items?.length || st.habits?.length || st.history?.length);
  });
}
