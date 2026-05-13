/**
 * commandDispatch.ts — wires node onCommand calls to pure FSM handlers.
 *
 * Canvas passes this to every node instead of noopCommand. When a node fires
 * onCommand('pomo.start'), we find the node in the store, call the right
 * pure handler, write the new state (and/or config) back via updateNode, then
 * persist. Decision #14: some commands target config rather than state, so
 * applyCommand may return either or both.
 *
 * Decision #20 additions:
 *   - task.toggle mirrors done to linked TodoItem (and vice versa)
 *   - todo.toggle mirrors done to linked TaskNode
 *   - task.delete BFS-removes all descendant tasks + incident edges + linked TodoItem
 *   - todo.remove cascades to TaskNode + descendants
 *   - todo.clearDone cascades all done items' TaskNodes + descendants
 *   - task.startPomo finds the single pomo mother node and starts a session
 *   - todo.startPomoForItem resolves item.taskNodeId and re-dispatches task.startPomo
 *   - task.addSubtask spawns a child TaskNode one layer deeper
 *   - todo.add sets bidirectional link: taskNode.todoItemId and item.taskNodeId
 *
 * Decision #14.1 (v2.2): habit.lane child nodes route mutations to the
 * mother habit they point to.
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
  pomoSetConfig,
  pomoClearActiveTask,
} from '../nodes/PomoNode/commands';
import type { PomoConfig, PomoState } from '../nodes/PomoNode/types';
import { defaultPomoConfig } from '../nodes/PomoNode/types';

// ── Todo ──────────────────────────────────────────────────────────────
import {
  todoAdd,
  todoToggle,
  todoEdit,
  todoRemove,
  todoClearDone,
  todoLinkTask,
} from '../nodes/TodoNode/commands';
import type { TodoState } from '../nodes/TodoNode/types';

// ── Task ──────────────────────────────────────────────────────────────
import {
  taskToggle,
  taskEdit,
  taskIncrementPomo,
  taskActivate,
  taskAccumulateSeconds,
  taskSetPlannedMin,
} from '../nodes/TaskNode/commands';
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
  habitSetIcon,
  habitSetView,
} from '../nodes/HabitNode/commands';
import type { HabitState } from '../nodes/HabitNode/types';
import type { HabitLaneState } from '../nodes/HabitLaneNode/types';

// ── Text + Image ──────────────────────────────────────────────────────
import { textSetText, textSetSize } from '../nodes/TextNode/commands';
import {
  imageSetAsset,
  imageSetSize,
  imageSetAlt,
  imageClear,
} from '../nodes/ImageNode/commands';

// ── dispatch ──────────────────────────────────────────────────────────

/**
 * Decision 22 — extract minutes from free-form task text using the pattern
 * `, time: <N>` (case-insensitive, optional unit suffix). Returns null when
 * the pattern doesn't match.
 */
function parseMinutesFromText(text: string): number | null {
  const match = /,\s*time:\s*(\d+)\s*(?:min|m|minutes?)?/i.exec(text);
  if (!match || !match[1]) return null;
  const n = Number.parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

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
      const pomoCfg = (c as unknown as PomoConfig | null) ?? defaultPomoConfig();
      switch (command) {
        case 'pomo.start':    return { state: pomoStart(s as never, args as never) };
        case 'pomo.cancel':   return { state: pomoCancel(s as never) };
        case 'pomo.complete': return { state: pomoComplete(s as never, { config: pomoCfg }) };
        case 'pomo.skipBreak': return { state: pomoSkipBreak(s as never) };
        case 'pomo.endBreak': return { state: pomoEndBreak(s as never) };
        case 'pomo.setConfig': return { config: pomoSetConfig(pomoCfg, args as never) };
        case 'pomo.clearActiveTask': return { state: pomoClearActiveTask(s as never) };
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
    case 'todo.task': {
      switch (command) {
        case 'task.toggle':            return { state: taskToggle(s as never) };
        case 'task.edit':              return { state: taskEdit(s as never, args as never) };
        case 'task.incrementPomo':     return { state: taskIncrementPomo(s as never) };
        case 'task.activate':          return { state: taskActivate(s as never) };
        case 'task.accumulateSeconds': return { state: taskAccumulateSeconds(s as never, args as never) };
        case 'task.setPlannedMin':     return { state: taskSetPlannedMin(s as never, args as never) };
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
        case 'habit.setIcon':   return { state: habitSetIcon(s as never, args as never) };
        case 'habit.setView':   return { config: habitSetView(c as never, args as never) };
      }
      break;
    }
    case 'text': {
      switch (command) {
        case 'text.setText': return { state: textSetText(s as never, args as never) };
        case 'text.setSize': return { state: textSetSize(s as never, args as never) };
      }
      break;
    }
    case 'image': {
      switch (command) {
        case 'image.setAsset': return { state: imageSetAsset(s as never, args as never) };
        case 'image.setSize':  return { state: imageSetSize(s as never, args as never) };
        case 'image.setAlt':   return { state: imageSetAlt(s as never, args as never) };
        case 'image.clear':    return { state: imageClear(s as never) };
      }
      break;
    }
  }
  return null; // unknown command — no-op
}

// ── helpers ────────────────────────────────────────────────────────────────

/** BFS: collect nodeId + all descendant task node ids (by parentTaskId linkage). */
function collectDescendants(rootId: string, nodes: readonly Node[]): string[] {
  const result: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    result.push(current);
    for (const n of nodes) {
      if (n.kind === 'todo.task') {
        const ts = n.state as TaskState;
        if (ts.parentTaskId === current) {
          queue.push(n.id);
        }
      }
    }
  }
  return result;
}

/** Remove a set of node ids (and incident edges) from the store in one call. */
function removeNodeSet(ids: string[]): void {
  const { board } = useBoardStore.getState();
  if (!board) return;
  const idSet = new Set(ids);
  const { updateNode: _u, addNode: _a, addEdge: _ae } = useBoardStore.getState();
  void _u; void _a; void _ae;
  // Use the raw set method on the store to do a single atomic update.
  useBoardStore.setState((s) => {
    if (!s.board) return s;
    return {
      board: {
        ...s.board,
        nodes: s.board.nodes.filter((n) => !idSet.has(n.id)),
        edges: s.board.edges.filter(
          (e) => !idSet.has(e.from.nodeId) && !idSet.has(e.to.nodeId),
        ),
      },
    };
  });
}

/** Renumber sibling tasks (1-based by createdAt) after add/delete. */
function renumberSiblings(parentTodoId: string, parentTaskId: string | null): void {
  const { board, updateNode } = useBoardStore.getState();
  if (!board) return;
  const siblings = board.nodes
    .filter((n) => {
      if (n.kind !== 'todo.task') return false;
      const ts = n.state as TaskState;
      return ts.parentTodoId === parentTodoId && ts.parentTaskId === parentTaskId;
    })
    .slice()
    .sort((a, b) => {
      const ta = (a.state as TaskState).createdAt;
      const tb = (b.state as TaskState).createdAt;
      return ta.localeCompare(tb);
    });
  siblings.forEach((n, i) => {
    const ts = n.state as TaskState;
    if (ts.sequenceNumber !== i + 1) {
      updateNode(n.id, { state: { ...ts, sequenceNumber: i + 1 } });
    }
  });
}

/**
 * Mutate the mother habit's state via a pure handler. Returns true if the
 * mother was found and the patch persisted.
 */
function mutateMotherHabit(
  motherId: string | null,
  fn: (state: HabitState) => HabitState,
): boolean {
  const { board, updateNode } = useBoardStore.getState();
  if (!board) return false;
  const mother = motherId
    ? board.nodes.find((n) => n.id === motherId)
    : board.nodes.find((n) => n.kind === 'habit' && n.isMother);
  if (!mother || mother.kind !== 'habit') return false;
  const next = fn(mother.state as HabitState);
  updateNode(mother.id, { state: next });
  return true;
}

/** Find the mother habit node that owns a habit with the given id. */
function findMotherForHabit(habitId: string): Node | null {
  const { board } = useBoardStore.getState();
  if (!board) return null;
  for (const n of board.nodes) {
    if (n.kind !== 'habit' || !n.isMother) continue;
    const s = n.state as { habits?: Array<{ id: string }> } | null;
    if (s?.habits?.some((h) => h.id === habitId)) return n;
  }
  return null;
}

// ── Decision 22 helpers ────────────────────────────────────────────────────

/**
 * Commit any in-flight running session's elapsed time into the active task's
 * `secondsAccumulated`. Returns the elapsed seconds it committed (for callers
 * that want to attribute it to a `task.activate` audit trail).
 */
function commitElapsedToActiveTask(): number {
  const { board, updateNode } = useBoardStore.getState();
  if (!board) return 0;
  const pomoNode = board.nodes.find((n) => n.kind === 'pomo');
  if (!pomoNode) return 0;
  const ps = pomoNode.state as PomoState;
  if (ps.status !== 'running' || ps.startedAt === null) return 0;
  if (ps.activeTaskId === null) return 0;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - Date.parse(ps.startedAt)) / 1000));
  if (elapsedSec === 0) return 0;
  const taskNode = board.nodes.find((n) => n.id === ps.activeTaskId);
  if (!taskNode || taskNode.kind !== 'todo.task') return elapsedSec;
  const ts = taskNode.state as TaskState;
  updateNode(taskNode.id, {
    state: {
      ...ts,
      secondsAccumulated: (ts.secondsAccumulated ?? 0) + elapsedSec,
    },
  });
  return elapsedSec;
}

/**
 * Decision 22 §5 — activation flow: commit elapsed, swap active task, start.
 * Idempotent on the active-task: clicking the same running task is a no-op
 * (avoids resetting the timer).
 */
function activateTaskAndStart(taskNodeId: string): void {
  const { board, updateNode } = useBoardStore.getState();
  if (!board) return;
  const taskNode = board.nodes.find((n) => n.id === taskNodeId);
  if (!taskNode || taskNode.kind !== 'todo.task') return;
  const pomoNode = board.nodes.find((n) => n.kind === 'pomo');
  if (!pomoNode) return;

  const ps = pomoNode.state as PomoState;
  const taskState = taskNode.state as TaskState;
  const cfg = (pomoNode.config as PomoConfig) ?? defaultPomoConfig();

  // No-op: clicking the same task that's already running.
  if (ps.activeTaskId === taskNodeId && ps.status === 'running') {
    return;
  }

  // Step 1: commit elapsed from the previous active task, if any.
  if (ps.status === 'running' && ps.activeTaskId !== null && ps.activeTaskId !== taskNodeId) {
    commitElapsedToActiveTask();
  }

  // Step 2: cancel the in-flight session (writes a cancelled history record).
  const fresh = useBoardStore.getState().board;
  const freshPomo = fresh?.nodes.find((n) => n.id === pomoNode.id);
  let workingState = (freshPomo?.state as PomoState) ?? ps;
  if (workingState.status === 'running') {
    workingState = pomoCancel(workingState);
  } else if (workingState.status === 'break') {
    workingState = pomoSkipBreak(workingState);
  }

  // Step 3: load task settings and start. Use the task's per-session minutes
  // (defaults to pomoConfig.sessionMin via creation) so the session length
  // matches gear settings.
  const sessionMin = taskState.durationMin > 0 ? taskState.durationMin : cfg.sessionMin;
  const nextPomo = pomoStart(
    { ...workingState, activeTaskId: taskNodeId },
    {
      label: taskState.text,
      durationMin: sessionMin,
      activeTaskId: taskNodeId,
    },
  );
  updateNode(pomoNode.id, { state: nextPomo });
  const updated = useBoardStore.getState().board;
  if (updated) void window.krnl?.boardSave(updated);
}

// ── makeCommandHandler ─────────────────────────────────────────────────────

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

    // ── task.startPomo: switch the active task + start a session (Decision 22 §5)
    if (command === 'task.startPomo' || command === 'task.spawnPomo') {
      activateTaskAndStart(nodeId);
      return;
    }

    // ── todo.startPomoForItem: resolve itemId → taskNodeId → activate it ───
    if (command === 'todo.startPomoForItem') {
      const todoState = node.state as TodoState;
      const itemId = args['itemId'] as string | undefined;
      if (!itemId) return;
      const item = todoState.items.find((i) => i.id === itemId);
      if (!item?.taskNodeId) return;
      activateTaskAndStart(item.taskNodeId);
      return;
    }

    // ── task.delete: cascade-delete task + descendants + linked TodoItem ────
    if (command === 'task.delete') {
      const taskState = node.state as TaskState;
      const descendants = collectDescendants(nodeId, board.nodes);
      removeNodeSet(descendants);
      // Remove linked TodoItem
      if (taskState.todoItemId !== null) {
        const todoNode = useBoardStore
          .getState()
          .board?.nodes.find((n) => n.id === taskState.parentTodoId);
        if (todoNode) {
          const newTodoState = todoRemove(todoNode.state as TodoState, {
            id: taskState.todoItemId,
          });
          updateNode(todoNode.id, { state: newTodoState });
        }
      }
      renumberSiblings(taskState.parentTodoId, taskState.parentTaskId);
      const final = useBoardStore.getState().board;
      if (final) void window.krnl?.boardSave(final);
      return;
    }

    // ── task.addSubtask: spawn a child TaskNode one layer deeper ────────────
    if (command === 'task.addSubtask') {
      const parentTask = node.state as TaskState;
      const text = (args['text'] as string | undefined) ?? '';
      if (!text.trim()) return;

      const freshBoard = useBoardStore.getState().board;
      if (!freshBoard) return;

      // Count siblings to get sequence number
      const siblings = freshBoard.nodes.filter((n) => {
        if (n.kind !== 'todo.task') return false;
        const ts = n.state as TaskState;
        return ts.parentTodoId === parentTask.parentTodoId && ts.parentTaskId === nodeId;
      });
      const seq = siblings.length + 1;

      const childState: TaskState = {
        text: text.trim(),
        done: false,
        durationMin: parentTask.durationMin,
        eta: parentTask.eta,
        sequenceNumber: seq,
        layer: parentTask.layer + 1,
        createdAt: new Date().toISOString(),
        parentTodoId: parentTask.parentTodoId,
        parentTaskId: nodeId,
        todoItemId: null,
        pomoSessionsCompleted: 0,
        plannedMin: parentTask.plannedMin ?? parentTask.durationMin,
        secondsAccumulated: 0,
      };

      const childNode: Node = {
        id: `task-${crypto.randomUUID()}`,
        kind: 'todo.task',
        position: {
          x: node.position.x + (seq - 1) * 252,
          y: node.position.y + 160,
        },
        isMother: false,
        state: childState,
        config: { showDuration: true },
      };

      const edge: Edge = {
        id: `edge-${crypto.randomUUID()}`,
        from: { nodeId: nodeId, event: 'task.next' },
        to: { nodeId: childNode.id, command: 'task.activate' },
        enabled: true,
      };

      const { addNode, addEdge } = useBoardStore.getState();
      addNode(childNode);
      addEdge(edge);
      const updated = useBoardStore.getState().board;
      if (updated) void window.krnl?.boardSave(updated);
      return;
    }

    // ── habit.spawnLane (issued by the mother HabitNode context menu) ────
    if (node.kind === 'habit' && command === 'habit.spawnLane') {
      const habitId = args['habitId'];
      if (typeof habitId !== 'string') return;
      // Don't spawn duplicate lanes for the same habit.
      const existing = board.nodes.find(
        (n) => n.kind === 'habit.lane' && (n.state as HabitLaneState | null)?.habitId === habitId,
      );
      if (existing) return;

      const laneCount = board.nodes.filter((n) => n.kind === 'habit.lane').length;
      const position = {
        x: node.position.x + (laneCount % 3) * 300,
        y: node.position.y + 540 + Math.floor(laneCount / 3) * 160,
      };
      const lane: Node = {
        id: `habit-lane-${crypto.randomUUID()}`,
        kind: 'habit.lane',
        position,
        isMother: false,
        state: { habitId },
        config: { days: 28 },
      };
      const { addNode } = useBoardStore.getState();
      addNode(lane);
      const updated = useBoardStore.getState().board;
      if (updated) void window.krnl?.boardSave(updated);
      return;
    }

    // ── habit.lane.* — route to the mother habit referenced by the lane ─
    if (node.kind === 'habit.lane') {
      const laneState = node.state as HabitLaneState | null;
      const habitId = laneState?.habitId;
      if (!habitId) return;
      const mother = findMotherForHabit(habitId);
      if (!mother) return;

      switch (command) {
        case 'habit.lane.toggleToday': {
          mutateMotherHabit(mother.id, (s) => habitToggleDay(s, { id: habitId }));
          break;
        }
        // Edge target — same as toggleToday but idempotent.
        case 'habit.markDone': {
          mutateMotherHabit(mother.id, (s) => habitMarkDone(s, { id: habitId }));
          break;
        }
        case 'habit.lane.rename': {
          const name = args['name'];
          if (typeof name !== 'string') return;
          mutateMotherHabit(mother.id, (s) => habitRename(s, { id: habitId, name }));
          break;
        }
        case 'habit.lane.setColor': {
          const color = args['color'];
          if (typeof color !== 'string') return;
          mutateMotherHabit(mother.id, (s) => habitSetColor(s, { id: habitId, color: color as never }));
          break;
        }
        case 'habit.lane.setIcon': {
          const icon = args['icon'];
          if (typeof icon !== 'string') return;
          mutateMotherHabit(mother.id, (s) => habitSetIcon(s, { id: habitId, icon }));
          break;
        }
        case 'habit.lane.removeHabit': {
          mutateMotherHabit(mother.id, (s) => habitRemove(s, { id: habitId }));
          break;
        }
        default:
          return;
      }
      const updated = useBoardStore.getState().board;
      if (updated) void window.krnl?.boardSave(updated);
      return;
    }

    const result = applyCommand(node, command, args);
    if (result === null) return;

    // ── todo.add: spawn a child task node + bidirectional link ────────────
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

      // Count only tasks that are root tasks of THIS todo node for sequencing
      const siblingTaskNodes = fresh.nodes.filter((n) => {
        if (n.kind !== 'todo.task') return false;
        const ts = n.state as TaskState;
        return ts.parentTodoId === nodeId && ts.parentTaskId === null;
      });
      const n = siblingTaskNodes.length + 1;

      const position =
        siblingTaskNodes.length === 0
          ? { x: todoNode.position.x, y: todoNode.position.y + 420 }
          : { x: todoNode.position.x + (n - 1) * 252, y: todoNode.position.y + 420 };

      const addedItem = nextState.items[nextState.items.length - 1];
      const text = addedItem?.text ?? (args['text'] as string | undefined) ?? '';
      const tag = addedItem?.tag ?? (args['tag'] as string | undefined);
      const itemId = addedItem?.id ?? '';

      // Decision 22 — read the pomo mother's config to seed per-session minutes,
      // and pick up `plannedMin` from args (structured input) or text-parse fallback.
      const pomoMother = fresh.nodes.find((nd) => nd.kind === 'pomo');
      const cfg = (pomoMother?.config as PomoConfig | null) ?? defaultPomoConfig();
      const sessionMin = cfg.sessionMin;
      const argPlanned = args['plannedMin'];
      const parsedPlanned = typeof argPlanned === 'number' && Number.isFinite(argPlanned)
        ? Math.max(1, Math.round(argPlanned))
        : parseMinutesFromText(text) ?? sessionMin;

      const durationMin = sessionMin;
      const taskState: TaskState = {
        text,
        done: false,
        ...(tag !== undefined ? { tag } : {}),
        durationMin,
        eta: `~${parsedPlanned} min`,
        sequenceNumber: n,
        layer: 0,
        createdAt: new Date().toISOString(),
        parentTodoId: todoNode.id,
        parentTaskId: null,
        todoItemId: itemId,
        pomoSessionsCompleted: 0,
        plannedMin: parsedPlanned,
        secondsAccumulated: 0,
      };

      const taskNodeId = `task-${crypto.randomUUID()}`;
      const taskNode: Node = {
        id: taskNodeId,
        kind: 'todo.task',
        position,
        isMother: false,
        state: taskState,
        config: { showDuration: true },
      };

      const { addNode, addEdge } = useBoardStore.getState();
      addNode(taskNode);

      // Set taskNodeId on the TodoItem (bidirectional link)
      const boardAfterAdd = useBoardStore.getState().board;
      if (boardAfterAdd && itemId) {
        const todoNodeAfter = boardAfterAdd.nodes.find((nd) => nd.id === nodeId);
        if (todoNodeAfter) {
          const linkedState = todoLinkTask(todoNodeAfter.state as TodoState, {
            itemId,
            taskNodeId,
          });
          updateNode(nodeId, { state: linkedState });
        }
      }

      // Chain edge from the previous sibling
      if (siblingTaskNodes.length > 0) {
        const previousTask = siblingTaskNodes[siblingTaskNodes.length - 1];
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

    // ── todo.toggle: mirror done state to linked TaskNode ─────────────────
    if (node.kind === 'todo' && command === 'todo.toggle' && result.state !== undefined) {
      const prevState = node.state as TodoState;
      const nextState = result.state as TodoState;
      updateNode(nodeId, { state: nextState });

      const itemId = args['id'] as string | undefined;
      if (itemId) {
        const prevItem = prevState.items.find((i) => i.id === itemId);
        const nextItem = nextState.items.find((i) => i.id === itemId);
        if (prevItem && nextItem && prevItem.done !== nextItem.done && prevItem.taskNodeId) {
          const taskNode = useBoardStore
            .getState()
            .board?.nodes.find((n) => n.id === prevItem.taskNodeId);
          if (taskNode) {
            const ts = taskNode.state as TaskState;
            if (ts.done !== nextItem.done) {
              updateNode(prevItem.taskNodeId, {
                state: { ...ts, done: nextItem.done },
              });
            }
          }
        }
      }

      const updated = useBoardStore.getState().board;
      if (updated) void window.krnl?.boardSave(updated);
      return;
    }

    // ── todo.remove: cascade to linked TaskNode + descendants ─────────────
    if (node.kind === 'todo' && command === 'todo.remove' && result.state !== undefined) {
      const prevState = node.state as TodoState;
      const itemId = args['id'] as string | undefined;
      updateNode(nodeId, { state: result.state });

      if (itemId) {
        const removedItem = prevState.items.find((i) => i.id === itemId);
        if (removedItem?.taskNodeId) {
          const currentBoard = useBoardStore.getState().board;
          if (currentBoard) {
            const descendants = collectDescendants(removedItem.taskNodeId, currentBoard.nodes);
            removeNodeSet(descendants);
            const ts = currentBoard.nodes.find(
              (n) => n.id === removedItem.taskNodeId,
            )?.state as TaskState | undefined;
            if (ts) {
              renumberSiblings(ts.parentTodoId, ts.parentTaskId);
            }
          }
        }
      }

      const final = useBoardStore.getState().board;
      if (final) void window.krnl?.boardSave(final);
      return;
    }

    // ── todo.clearDone: cascade all done items' TaskNodes ─────────────────
    if (node.kind === 'todo' && command === 'todo.clearDone' && result.state !== undefined) {
      const prevState = node.state as TodoState;
      updateNode(nodeId, { state: result.state });

      const currentBoard = useBoardStore.getState().board;
      if (currentBoard) {
        const taskIds: string[] = [];
        for (const item of prevState.items) {
          if (item.done && item.taskNodeId) {
            taskIds.push(...collectDescendants(item.taskNodeId, currentBoard.nodes));
          }
        }
        if (taskIds.length > 0) {
          removeNodeSet(taskIds);
        }
      }

      const final = useBoardStore.getState().board;
      if (final) void window.krnl?.boardSave(final);
      return;
    }

    // ── task.toggle: mirror done state to linked TodoItem ─────────────────
    if (node.kind === 'todo.task' && command === 'task.toggle' && result.state !== undefined) {
      const prevTask = node.state as TaskState;
      const nextTask = result.state as TaskState;
      updateNode(nodeId, { state: nextTask });

      if (prevTask.todoItemId !== null && prevTask.done !== nextTask.done) {
        const todoNode = useBoardStore
          .getState()
          .board?.nodes.find((n) => n.id === prevTask.parentTodoId);
        if (todoNode) {
          const todoState = todoNode.state as TodoState;
          const item = todoState.items.find((i) => i.id === prevTask.todoItemId);
          if (item && item.done !== nextTask.done) {
            const newTodoState = todoToggle(todoState, { id: prevTask.todoItemId });
            updateNode(todoNode.id, { state: newTodoState });
          }
        }
      }

      const updated = useBoardStore.getState().board;
      if (updated) void window.krnl?.boardSave(updated);
      return;
    }

    // ── pomo.cancel / pomo.complete: Decision 22 §7 + F13 — accumulate seconds
    //    onto the active task, bump pomoSessionsCompleted on completion only.
    if (
      node.kind === 'pomo' &&
      (command === 'pomo.cancel' || command === 'pomo.complete') &&
      result.state !== undefined
    ) {
      const prevPomo = node.state as PomoState;
      const nextPomo = result.state as PomoState;
      // FSM was a no-op (e.g. cancel from idle, complete before deadline) — skip.
      if (prevPomo.history.length === nextPomo.history.length) {
        updateNode(nodeId, { state: nextPomo });
        const u = useBoardStore.getState().board;
        if (u) void window.krnl?.boardSave(u);
        return;
      }
      updateNode(nodeId, { state: nextPomo });

      const justCompleted = command === 'pomo.complete';
      const newest = nextPomo.history[nextPomo.history.length - 1];
      const activeTaskId = newest?.taskId ?? prevPomo.activeTaskId;
      if (newest && activeTaskId) {
        const elapsedSec = Math.max(
          0,
          Math.floor((Date.parse(newest.endedAt) - Date.parse(newest.startedAt)) / 1000),
        );
        const taskNode = useBoardStore
          .getState()
          .board?.nodes.find((n) => n.id === activeTaskId);
        if (taskNode && taskNode.kind === 'todo.task') {
          const ts = taskNode.state as TaskState;
          const patchedTask: TaskState = {
            ...ts,
            secondsAccumulated: (ts.secondsAccumulated ?? 0) + elapsedSec,
            pomoSessionsCompleted: justCompleted
              ? (ts.pomoSessionsCompleted ?? 0) + 1
              : (ts.pomoSessionsCompleted ?? 0),
          };
          updateNode(taskNode.id, { state: patchedTask });
        }
      }

      const updated = useBoardStore.getState().board;
      if (updated) void window.krnl?.boardSave(updated);
      return;
    }

    // ── All other commands ────────────────────────────────────────────────
    const patch: Partial<Node> = {};
    if (result.state !== undefined) patch.state = result.state;
    if (result.config !== undefined) patch.config = result.config;
    if (Object.keys(patch).length > 0) updateNode(nodeId, patch);

    const updatedBoard = useBoardStore.getState().board;
    if (updatedBoard) void window.krnl?.boardSave(updatedBoard);
  };
}
