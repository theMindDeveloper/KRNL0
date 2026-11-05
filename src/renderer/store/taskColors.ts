// Keeps the task-colour assignment (utils/taskColor.ts) in step with the board:
// every task that is not archived gets its own colour. Installed once before
// React renders, so the map is updated before components read it.

import type { Board } from '../../shared/types';
import { assignTaskColors, setTaskColorAssignments } from '../utils/taskColor';
import { useBoardStore } from './boardStore';

/** Pure: the tasks that hold a colour — task nodes whose Todo row isn't archived. */
export function activeTasksForColor(board: Pick<Board, 'nodes'> | null | undefined): Array<{ id: string; createdAt?: string }> {
  if (!board) return [];
  const archived = new Set<string>();
  for (const n of board.nodes) {
    if (n.kind !== 'todo') continue;
    for (const it of ((n.state as { items?: Array<{ taskNodeId?: string | null; archivedAt?: string }> }).items ?? [])) {
      if (it.taskNodeId && it.archivedAt) archived.add(it.taskNodeId);
    }
  }
  return board.nodes
    .filter((n) => n.kind === 'todo.task' && !archived.has(n.id))
    .map((n) => {
      const createdAt = (n.state as { createdAt?: string }).createdAt;
      return createdAt ? { id: n.id, createdAt } : { id: n.id };
    });
}

let lastKey = '';

function update(board: Board | null): void {
  const tasks = activeTasksForColor(board);
  const key = tasks.map((t) => t.id).sort().join('|');
  if (key === lastKey) return;
  lastKey = key;
  setTaskColorAssignments(assignTaskColors(tasks));
}

/** Call once at renderer start. Returns an unsubscribe. */
export function installTaskColors(): () => void {
  update(useBoardStore.getState().board);
  return useBoardStore.subscribe((s) => update(s.board));
}
