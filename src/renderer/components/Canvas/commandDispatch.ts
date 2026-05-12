/**
 * commandDispatch.ts — wires node onCommand calls to pure FSM handlers.
 *
 * Canvas passes this to every node instead of noopCommand. When a node fires
 * onCommand('pomo.start'), we find the node in the store, call the right
 * pure handler, write the new state (and/or config) back via updateNode, then
 * persist. Decision #14: some commands target config rather than state, so
 * applyCommand may return either or both.
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
  habitMarkDone,
  habitRemove,
  habitArchive,
  habitRename,
  habitSetColor,
  habitSetView,
} from '../nodes/HabitNode/commands';

// ── dispatch ──────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

interface DispatchResult {
  state?: Node['state'];
  config?: Node['config'];
}

function applyCommand(node: Node, command: string, args: Args): DispatchResult | null {
  const s = node.state as Record<string, unknown>;
  const c = node.config as Record<string, unknown>;

  switch (node.kind) {
    case 'pomo': {
      switch (command) {
        case 'pomo.start':    return { state: pomoStart(s as never, args as never) };
        case 'pomo.cancel':   return { state: pomoCancel(s as never) };
        case 'pomo.complete': return { state: pomoComplete(s as never) };
        case 'pomo.skipBreak': return { state: pomoSkipBreak(s as never) };
        case 'pomo.endBreak': return { state: pomoEndBreak(s as never) };
      }
      break;
    }
    case 'todo': {
      switch (command) {
        case 'todo.add':       return { state: todoAdd(s as never, args as never) };
        case 'todo.toggle':    return { state: todoToggle(s as never, args as never) };
        case 'todo.edit':      return { state: todoEdit(s as never, args as never) };
        case 'todo.remove':    return { state: todoRemove(s as never, args as never) };
        case 'todo.clearDone': return { state: todoClearDone(s as never) };
      }
      break;
    }
    case 'habit': {
      switch (command) {
        case 'habit.add':       return { state: habitAdd(s as never, args as never) };
        case 'habit.toggleDay': return { state: habitToggleDay(s as never, args as never) };
        case 'habit.markDone':  return { state: habitMarkDone(s as never, args as never) };
        case 'habit.remove':    return { state: habitRemove(s as never, args as never) };
        case 'habit.archive':   return { state: habitArchive(s as never, args as never) };
        case 'habit.rename':    return { state: habitRename(s as never, args as never) };
        case 'habit.setColor':  return { state: habitSetColor(s as never, args as never) };
        case 'habit.setView':   return { config: habitSetView(c as never, args as never) };
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

    const result = applyCommand(node, command, args);
    if (result === null) return;

    // ── todo.add: also spawn a child task node + connecting edge ─────────
    if (node.kind === 'todo' && command === 'todo.add' && result.state !== undefined) {
      const prevState = node.state as TodoState;
      const nextState = result.state as TodoState;

      // Guard: no spawn if todoAdd was a no-op (empty text)
      if (nextState.items.length === prevState.items.length) {
        updateNode(nodeId, { state: result.state });
        return;
      }

      updateNode(nodeId, { state: result.state });

      const fresh = useBoardStore.getState().board;
      if (!fresh) return;

      const todoNode = fresh.nodes.find((n) => n.id === nodeId);
      if (!todoNode) return;

      const existingTaskNodes = fresh.nodes.filter((n) => n.kind === 'todo.task');
      const currentTaskCount = existingTaskNodes.length;
      const n = currentTaskCount + 1;

      const position =
        currentTaskCount === 0
          ? { x: todoNode.position.x, y: todoNode.position.y + 420 }
          : { x: todoNode.position.x + (n - 1) * 252, y: todoNode.position.y + 420 };

      const addedItem = nextState.items[nextState.items.length - 1];
      const text = addedItem?.text ?? (args['text'] as string | undefined) ?? '';
      const tag = addedItem?.tag ?? (args['tag'] as string | undefined);

      const durationMin = 20;
      const taskState: TaskState = {
        text,
        done: false,
        ...(tag !== undefined ? { tag } : {}),
        durationMin,
        eta: `~${durationMin} min`,
        sequenceNumber: n,
        layer: 0,
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

      const finalBoard = useBoardStore.getState().board;
      if (finalBoard) void window.krnl?.boardSave(finalBoard);
      return;
    }

    // ── All other commands ────────────────────────────────────────────────
    const patch: Partial<Node> = {};
    if (result.state !== undefined) patch.state = result.state;
    if (result.config !== undefined) patch.config = result.config;
    if (Object.keys(patch).length > 0) updateNode(nodeId, patch);

    const updated = useBoardStore.getState().board;
    if (updated) void window.krnl?.boardSave(updated);
  };
}
