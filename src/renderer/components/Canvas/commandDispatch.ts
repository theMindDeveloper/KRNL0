/**
 * commandDispatch.ts — wires node onCommand calls to pure FSM handlers.
 *
 * Canvas passes this to every node instead of noopCommand. When a node fires
 * onCommand('pomo.start'), we find the node in the store, call the right
 * pure handler, write the new state back via updateNode, then persist.
 */

import { useBoardStore } from '../../store/boardStore';
import type { Node } from '@shared/types/node';
import type { Edge } from '@shared/types/edge';

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
import type { TodoState } from '../nodes/TodoNode/types';
import type { TaskState } from '../nodes/TaskNode/types';

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

    // ── todo.add: also spawn a child task node + connecting edge ─────────
    if (node.kind === 'todo' && command === 'todo.add') {
      const prevState = node.state as TodoState;
      const nextState = newState as TodoState;

      // Guard: no spawn if todoAdd was a no-op (empty text)
      if (nextState.items.length === prevState.items.length) {
        // Still apply state (it's a no-op reference, but updateNode is safe)
        updateNode(nodeId, { state: newState });
        return;
      }

      // Apply todo state first
      updateNode(nodeId, { state: newState });

      // Re-read fresh board state after mutation
      const fresh = useBoardStore.getState().board;
      if (!fresh) return;

      const todoNode = fresh.nodes.find((n) => n.id === nodeId);
      if (!todoNode) return;

      const existingTaskNodes = fresh.nodes.filter((n) => n.kind === 'todo.task');
      const currentTaskCount = existingTaskNodes.length;
      const n = currentTaskCount + 1;

      // Compute position
      const position =
        currentTaskCount === 0
          ? { x: todoNode.position.x, y: todoNode.position.y + 420 }
          : { x: todoNode.position.x + (n - 1) * 252, y: todoNode.position.y + 420 };

      // Retrieve the text and tag from the newly added item (last in insertion order)
      const addedItem = nextState.items[nextState.items.length - 1];
      const text = addedItem?.text ?? (args['text'] as string | undefined) ?? '';
      const tag = addedItem?.tag ?? (args['tag'] as string | undefined);

      const taskState: TaskState = {
        text,
        done: false,
        ...(tag !== undefined ? { tag } : {}),
        durationMin: 20,
        createdAt: new Date().toISOString(),
        parentTodoId: todoNode.id,
      };

      const taskNode: Node = {
        id: `task-${crypto.randomUUID()}`,
        kind: 'todo.task',
        position,
        isMother: false,
        state: taskState,
        config: { showDuration: true },
      };

      const { addNode, addEdge } = useBoardStore.getState();
      addNode(taskNode);

      // Edge: ONLY chain previous task → this task. First task has no inbound
      // edge — todo mother is config, not a task source.
      if (currentTaskCount > 0) {
        const previousTask = existingTaskNodes[existingTaskNodes.length - 1];
        if (previousTask) {
          const edge: Edge = {
            id: `edge-${crypto.randomUUID()}`,
            from: { nodeId: previousTask.id, event: 'task.next' },
            to: { nodeId: taskNode.id, command: 'task.activate' },
            enabled: true,
          };
          addEdge(edge);
        }
      }

      // Single persist that captures all three mutations
      const finalBoard = useBoardStore.getState().board;
      if (finalBoard) void window.krnl?.boardSave(finalBoard);
      return;
    }

    // ── All other commands ────────────────────────────────────────────────
    updateNode(nodeId, { state: newState });

    // Persist to disk after every mutation (best-effort, non-blocking).
    const updated = useBoardStore.getState().board;
    if (updated) void window.krnl?.boardSave(updated);
  };
}
