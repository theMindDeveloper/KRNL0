/**
 * commandDispatch.ts — wires node onCommand calls to pure FSM handlers.
 *
 * Canvas passes this to every node instead of noopCommand. When a node fires
 * onCommand('pomo.start'), we find the node in the store, call the right
 * pure handler, write the new state back via updateNode, then persist.
 */

import { useBoardStore } from '../../store/boardStore';
import type { Node } from '@shared/types/node';

// ── Pomo ──────────────────────────────────────────────────────────────
import {
  pomoStart,
  pomoCancel,
  pomoComplete,
  pomoSkipBreak,
  pomoEndBreak,
} from '../nodes/PomoNode/commands';

// ── Todo ──────────────────────────────────────────────────────────────
import {
  todoAdd,
  todoToggle,
  todoEdit,
  todoRemove,
  todoClearDone,
} from '../nodes/TodoNode/commands';

// ── Habit ─────────────────────────────────────────────────────────────
import {
  habitAdd,
  habitToggleDay,
  habitRemove,
  habitArchive,
  habitRename,
} from '../nodes/HabitNode/commands';

// ── dispatch ──────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

function applyCommand(node: Node, command: string, args: Args): Node['state'] | null {
  const s = node.state as Record<string, unknown>;

  switch (node.kind) {
    case 'pomo': {
      switch (command) {
        case 'pomo.start':    return pomoStart(s as never, args as never);
        case 'pomo.cancel':   return pomoCancel(s as never);
        case 'pomo.complete': return pomoComplete(s as never);
        case 'pomo.skipBreak': return pomoSkipBreak(s as never);
        case 'pomo.endBreak': return pomoEndBreak(s as never);
      }
      break;
    }
    case 'todo': {
      switch (command) {
        case 'todo.add':       return todoAdd(s as never, args as never);
        case 'todo.toggle':    return todoToggle(s as never, args as never);
        case 'todo.edit':      return todoEdit(s as never, args as never);
        case 'todo.remove':    return todoRemove(s as never, args as never);
        case 'todo.clearDone': return todoClearDone(s as never);
      }
      break;
    }
    case 'habit': {
      switch (command) {
        case 'habit.add':       return habitAdd(s as never, args as never);
        case 'habit.toggleDay': return habitToggleDay(s as never, args as never);
        case 'habit.remove':    return habitRemove(s as never, args as never);
        case 'habit.archive':   return habitArchive(s as never, args as never);
        case 'habit.rename':    return habitRename(s as never, args as never);
      }
      break;
    }
  }
  return null; // unknown command — no-op
}

/**
 * Returns an onCommand handler bound to a specific node id.
 * Call once per rendered node (stable reference via useCallback with [nodeId]).
 */
export function makeCommandHandler(nodeId: string) {
  return (command: string, args: Args = {}): void => {
    const { board, updateNode } = useBoardStore.getState();
    if (!board) return;

    const node = board.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const newState = applyCommand(node, command, args);
    if (newState === null) return;

    updateNode(nodeId, { state: newState });

    // Persist to disk after every mutation (best-effort, non-blocking).
    const updated = useBoardStore.getState().board;
    if (updated) void window.krnl?.boardSave(updated);
  };
}
