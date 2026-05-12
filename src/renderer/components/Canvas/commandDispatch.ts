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
  type PomoBreakCfg,
} from '../nodes/PomoNode/commands';
import type { PomoConfig, PomoState, EmbeddedPomoState } from '../nodes/PomoNode/types';
import { defaultEmbeddedPomo, defaultPomoConfig } from '../nodes/PomoNode/types';

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

// Read mother PomoNode's config (canonical PomoConfig). Falls back to defaults
// if the mother is missing or has stale shape — the migration in handlers.ts
// is supposed to keep this in good shape on disk.
function readMotherPomoConfig(): PomoConfig {
  const board = useBoardStore.getState().board;
  if (!board) return defaultPomoConfig();
  const mother = board.nodes.find((n) => n.kind === 'pomo' && n.isMother);
  if (!mother) return defaultPomoConfig();
  const cfg = mother.config as Partial<PomoConfig> | null;
  return {
    defaultDurationMin: cfg?.defaultDurationMin ?? 25,
    defaultBreakMin: cfg?.defaultBreakMin ?? 5,
    longBreakEvery: cfg?.longBreakEvery ?? 4,
    longBreakMin: cfg?.longBreakMin ?? 15,
  };
}

function breakCfgFromConfig(cfg: PomoConfig): PomoBreakCfg {
  return {
    breakMin: cfg.defaultBreakMin,
    longBreakMin: cfg.longBreakMin,
    longBreakEvery: cfg.longBreakEvery,
  };
}

function applyCommand(node: Node, command: string, args: Args): Node['state'] | null {
  const s = node.state as Record<string, unknown>;

  switch (node.kind) {
    case 'pomo': {
      switch (command) {
        case 'pomo.start':    return pomoStart(s as never, args as never);
        case 'pomo.cancel':   return pomoCancel(s as never);
        case 'pomo.complete': {
          const cfg = readMotherPomoConfig();
          return pomoComplete(s as unknown as PomoState, {}, undefined, breakCfgFromConfig(cfg));
        }
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
    case 'todo.task': {
      // Decision 9 Addendum (2026-05-12) — task pomo commands operate on the
      // task's embedded `state.pomo` block; reuse the mother PomoNode FSM.
      const ts = s as unknown as TaskState;
      const pomo = ts.pomo ?? defaultEmbeddedPomo(defaultPomoConfig(), ts.text);
      const motherCfg = readMotherPomoConfig();
      switch (command) {
        case 'task.startPomo': {
          const next = pomoStart(pomo, args as never);
          return { ...ts, pomo: next } as unknown as Node['state'];
        }
        case 'task.cancelPomo': {
          const next = pomoCancel(pomo);
          return { ...ts, pomo: next } as unknown as Node['state'];
        }
        case 'task.completePomo': {
          const next = pomoComplete(pomo, {}, undefined, breakCfgFromConfig(motherCfg));
          return { ...ts, pomo: next } as unknown as Node['state'];
        }
        case 'task.skipBreak': {
          const next = pomoSkipBreak(pomo);
          return { ...ts, pomo: next } as unknown as Node['state'];
        }
        case 'task.endBreak': {
          const next = pomoEndBreak(pomo);
          return { ...ts, pomo: next } as unknown as Node['state'];
        }
      }
      break;
    }
  }
  return null; // unknown command — no-op
}

// Decision 9 Addendum — mother-only config setters. These mutate
// `node.config`, not state, so they go through their own path. FSM rule:
// rejected if status === 'running' (consistent with pomoSetDuration).
function applyMotherConfigCommand(
  node: Node,
  command: string,
  args: Args,
): { config: PomoConfig } | null {
  if (node.kind !== 'pomo' || !node.isMother) return null;
  const state = node.state as PomoState;
  if (state.status === 'running') return null;
  const cfg = node.config as Partial<PomoConfig> | null;
  const current: PomoConfig = {
    defaultDurationMin: cfg?.defaultDurationMin ?? 25,
    defaultBreakMin: cfg?.defaultBreakMin ?? 5,
    longBreakEvery: cfg?.longBreakEvery ?? 4,
    longBreakMin: cfg?.longBreakMin ?? 15,
  };
  switch (command) {
    case 'pomo.setDuration': {
      const minutes = Number(args['minutes']);
      if (!Number.isFinite(minutes) || minutes <= 0) return null;
      return { config: { ...current, defaultDurationMin: minutes } };
    }
    case 'pomo.setBreak': {
      const minutes = Number(args['minutes']);
      if (!Number.isFinite(minutes) || minutes <= 0) return null;
      return { config: { ...current, defaultBreakMin: minutes } };
    }
    case 'pomo.setLongBreak': {
      const minutes = Number(args['minutes']);
      if (!Number.isFinite(minutes) || minutes <= 0) return null;
      return { config: { ...current, longBreakMin: minutes } };
    }
    case 'pomo.setLongBreakEvery': {
      const count = Number(args['count']);
      if (!Number.isFinite(count) || count < 1) return null;
      return { config: { ...current, longBreakEvery: Math.floor(count) } };
    }
  }
  return null;
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

    // ── Mother config writes (Decision 9 Addendum) — separate path ───────
    const cfgPatch = applyMotherConfigCommand(node, command, args);
    if (cfgPatch !== null) {
      updateNode(nodeId, { config: cfgPatch.config });
      const updated = useBoardStore.getState().board;
      if (updated) void window.krnl?.boardSave(updated);
      return;
    }

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

      const durationMin = 20;
      // Decision 9 Addendum — copy mother config into the new task's pomo
      // block. duration/break are value-copied; longBreakEvery and longBreakMin
      // are read live at completion time (via readMotherPomoConfig).
      const motherCfg = readMotherPomoConfig();
      const initialPomo: EmbeddedPomoState = defaultEmbeddedPomo(motherCfg, text);
      const taskState: TaskState = {
        text,
        done: false,
        ...(tag !== undefined ? { tag } : {}),
        durationMin,
        eta: `~${durationMin} min`,
        sequenceNumber: n,       // 1-based ordinal (F1)
        layer: 0,                // direct children of a mother are layer 0 (F1/NF4)
        createdAt: new Date().toISOString(),
        parentTodoId: todoNode.id,
        pomo: initialPomo,
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
