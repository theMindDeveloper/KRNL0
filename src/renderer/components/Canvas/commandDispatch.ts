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
 *
 * Decision #22.1: loadTaskIntoPomo, checkpointActiveTaskElapsed, pause/resume,
 * per-task session checkpoint, extended task.toggle and task.delete cascades.
 */

import { useBoardStore } from '../../store/boardStore';
import { emit, saveBoard } from '../../store/eventLog';

/** Dispatch `krnl:ensure-visible` so CanvasFlow can pan the camera if the
 *  spawned rect sits outside the current viewport. No-op outside a browser
 *  (test environments) and in station mode (CanvasFlow's listener gates). */
function notifySpawnVisible(rect: { x: number; y: number; width: number; height: number }) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('krnl:ensure-visible', { detail: rect }));
}

// Standard task card footprint — kept in sync with INITIAL_DIMS_BY_KIND in
// rfAdapters.tsx so the camera-ensure rect matches what RF will measure.
const TASK_RECT = { width: 220, height: 120 } as const;
import type { Node } from '@shared/types/node';
import type { Edge } from '@shared/types/edge';
import {
  deleteTaskCascade,
  collectDescendants,
  stampCompletedAt,
} from '../../../shared/dispatch/task';
import type { BoardShape } from '../../../shared/dispatch/types';

// ── Pomo ──────────────────────────────────────────────────────────────
import {
  pomoStart,
  pomoPause,
  pomoResume,
  pomoCancel,
  pomoComplete,
  pomoSkipBreak,
  pomoEndBreak,
  pomoBreak,
  pomoExtend,
  pomoStop,
  pomoSetConfig,
  pomoSetFace,
  pomoClearActiveTask,
  pomoDevSeedSegment,
  pomoDevClearSeeded,
} from '../nodes/PomoNode/commands';
import type { PomoConfig, PomoState, TimerFace } from '../nodes/PomoNode/types';
import { defaultPomoConfig } from '../nodes/PomoNode/types';
import { computeCurrentSessionMin } from '../nodes/PomoNode/pomoRules';

// ── Todo ──────────────────────────────────────────────────────────────
import {
  todoAdd,
  todoToggle,
  todoEdit,
  todoRemove,
  todoClearDone,
  todoLinkTask,
  todoSetItemSchedule,
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
  taskSetCurrentSessionElapsedSec,
  taskClearCurrentSessionElapsedSec,
  taskSetDuration,
  taskSetSchedule,
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
  habitSetNote,
  habitSetView,
  habitSetSchedule,
} from '../nodes/HabitNode/commands';
import type { HabitState } from '../nodes/HabitNode/types';
import type { HabitSchedule } from '../nodes/HabitNode/types';
import type { HabitLaneState } from '../nodes/HabitLaneNode/types';

// ── Calendar ──────────────────────────────────────────────────────────
import {
  calendarSetView,
  calendarSelectDate,
  calendarSetAnchor,
  calendarSetZoom,
} from '../nodes/CalendarNode/commands';
import type { CalendarConfig, CalendarState } from '../nodes/CalendarNode/types';

// ── Clock ─────────────────────────────────────────────────────────────
import {
  clockLinkTodo,
  clockSetViewWindow,
  clockSetSelectedDate,
  clockAdvanceDay,
  clockGoToday,
} from '../nodes/ClockNode/commands';
import type { ClockState } from '../nodes/ClockNode/types';

// ── Frame ─────────────────────────────────────────────────────────────
import {
  frameSetLabel,
  frameSetSize,
  frameSetChildren,
  frameSetTint,
} from '../nodes/FrameNode/commands';

// ── Text + Image ──────────────────────────────────────────────────────
import { textSetText, textSetSize } from '../nodes/TextNode/commands';
import {
  imageSetAsset,
  imageSetSize,
  imageSetAlt,
  imageClear,
} from '../nodes/ImageNode/commands';

// ── Terminal ──────────────────────────────────────────────────────────
import {
  termSessionStart,
  termSessionEnd,
  termSetTitle,
  termSetFontSize,
  termClear,
  termSetShell,
} from '../nodes/TerminalNode/commands';
import type { TermState, TermConfig } from '../nodes/TerminalNode/types';

// ── Analytics (Issue #134) ────────────────────────────────────────────
import {
  analyticsSetView,
  analyticsSetRangeDays,
  analyticsSetMetric,
  analyticsSetYear,
  analyticsSetSize,
  analyticsToggleCardHidden,
  analyticsTogglePinCard,
  analyticsSetSettingsOpen,
  analyticsResetCardLayout,
} from '../nodes/AnalyticsNode/commands';

// ── dispatch ──────────────────────────────────────────────────────────

/**
 * Decision 22 / 22.2 — extract minutes from free-form task text.
 *
 * Priority:
 *   1. Trailing suffix: "25m", "25 min", "25 minutes" (whitespace-anchored, end-of-string).
 *      When matched, the suffix is stripped from the returned strippedText so the
 *      saved item text is clean (e.g. "groceries 25m" → "groceries").
 *   2. Legacy inline pattern: ", time: 25" — kept for back-compat (Decision 22 §6).
 *      strippedText is the original text (no stripping for legacy form).
 *   3. Neither matches → plannedMin: null, strippedText unchanged.
 */
export function parseMinutesFromText(text: string): { plannedMin: number | null; strippedText: string } {
  // 1. Trailing suffix: " 25m" / "25 min" / "25 minutes"
  const trailing = /\s+(\d+)\s*(?:min|minutes?|m)\s*$/i.exec(text);
  if (trailing && trailing[1]) {
    const n = Number.parseInt(trailing[1], 10);
    if (Number.isFinite(n) && n > 0) {
      return { plannedMin: n, strippedText: text.slice(0, trailing.index).trimEnd() };
    }
  }
  // 2. Legacy: ", time: 25"
  const legacy = /,\s*time:\s*(\d+)\s*(?:min|m|minutes?)?/i.exec(text);
  if (legacy && legacy[1]) {
    const n = Number.parseInt(legacy[1], 10);
    if (Number.isFinite(n) && n > 0) return { plannedMin: n, strippedText: text };
  }
  return { plannedMin: null, strippedText: text };
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
        case 'pomo.pause':    return { state: pomoPause(s as never) };
        case 'pomo.resume':   return { state: pomoResume(s as never) };
        case 'pomo.cancel':   return { state: pomoCancel(s as never) };
        case 'pomo.complete': {
          // Detect if the active task is an event-kind task; if so, signal
          // skipBreak so the FSM transitions straight to 'done' (no break).
          const ps = s as unknown as PomoState;
          let skipBreak = false;
          if (ps.activeTaskId !== null) {
            const board = useBoardStore.getState().board;
            const activeTask = board?.nodes.find((n) => n.id === ps.activeTaskId);
            if (activeTask && (activeTask.state as TaskState).kind === 'event') {
              skipBreak = true;
            }
          }
          return { state: pomoComplete(s as never, { config: pomoCfg, skipBreak }) };
        }
        case 'pomo.skipBreak': return { state: pomoSkipBreak(s as never) };
        case 'pomo.endBreak': return { state: pomoEndBreak(s as never) };
        // Issue #166 — observer-model verbs.
        case 'pomo.break':    return { state: pomoBreak(s as never) };
        case 'pomo.extend':   return { state: pomoExtend(s as never) };
        case 'pomo.stop':     return { state: pomoStop(s as never) };
        case 'pomo.setConfig': return { config: pomoSetConfig(pomoCfg, args as never) };
        case 'pomo.setFace':   return { config: pomoSetFace(pomoCfg, args as { face: TimerFace }) };
        case 'pomo.clearActiveTask': return { state: pomoClearActiveTask(s as never, pomoCfg) };
        // DEV-only (#180 viz testing) — seed/clear synthetic reality segments.
        case 'pomo.devSeedSegment': return { state: pomoDevSeedSegment(s as never, args as never) };
        case 'pomo.devClearSeeded': return { state: pomoDevClearSeeded(s as never) };
      }
      break;
    }
    case 'todo': {
      switch (command) {
        case 'todo.add':            return { state: todoAdd(s as never, args as never) };
        case 'todo.toggle':         return { state: todoToggle(s as never, args as never) };
        case 'todo.edit':           return { state: todoEdit(s as never, args as never) };
        case 'todo.remove':         return { state: todoRemove(s as never, args as never) };
        case 'todo.clearDone':      return { state: todoClearDone(s as never) };
        // ADR 0001 — calendar integration: set/clear schedule on a TodoItem
        // (for items that haven't yet spawned a TaskNode).
        case 'task.setSchedule':    return { state: todoSetItemSchedule(s as never, args as never) };
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
        case 'task.setCurrentSessionElapsedSec':
          return { state: taskSetCurrentSessionElapsedSec(s as never, args as never) };
        case 'task.clearCurrentSessionElapsedSec':
          return { state: taskClearCurrentSessionElapsedSec(s as never) };
        case 'task.setDuration':       return { state: taskSetDuration(s as never, args as never) };
        // ADR 0001 — calendar integration: set/clear schedule on a task.
        case 'task.setSchedule':       return { state: taskSetSchedule(s as never, args as never) };
      }
      break;
    }
    case 'habit': {
      switch (command) {
        case 'habit.add':         return { state: habitAdd(s as never, args as never) };
        case 'habit.toggleDay':   return { state: habitToggleDay(s as never, args as never) };
        case 'habit.markDone':    return { state: habitMarkDone(s as never, args as never) };
        case 'habit.remove':      return { state: habitRemove(s as never, args as never) };
        case 'habit.archive':     return { state: habitArchive(s as never, args as never) };
        case 'habit.rename':      return { state: habitRename(s as never, args as never) };
        case 'habit.setColor':    return { state: habitSetColor(s as never, args as never) };
        case 'habit.setIcon':     return { state: habitSetIcon(s as never, args as never) };
        case 'habit.setNote':     return { state: habitSetNote(s as never, args as never) };
        case 'habit.setView':     return { config: habitSetView(c as never, args as never) };
        // ADR 0002 §5 — set/clear schedule on a habit.
        case 'habit.setSchedule': return { state: habitSetSchedule(s as never, args as never) };
      }
      break;
    }
    // ADR 0001 — CalendarNode command handlers.
    case 'calendar': {
      const calState = s as unknown as CalendarState;
      const calConfig = c as unknown as CalendarConfig;
      switch (command) {
        case 'calendar.setView':
          return { config: calendarSetView(calConfig, args as never) };
        case 'calendar.selectDate':
          return { state: calendarSelectDate(calState, args as never) };
        case 'calendar.setAnchor':
          return { state: calendarSetAnchor(calState, args as never) };
        case 'calendar.setZoom':
          return { state: calendarSetZoom(calState, args as never) };
        // calendar.schedule: cross-node router (handled in makeCommandHandler).
        // applyCommand returns null here so the router path intercepts it and
        // dispatches task.setSchedule to the target task node.
      }
      break;
    }
    case 'clock': {
      const clockState = s as unknown as ClockState;
      switch (command) {
        case 'clock.linkTodo':
          return { state: clockLinkTodo(clockState, args as never) };
        case 'clock.setViewWindow':
          return { state: clockSetViewWindow(clockState, args as never) };
        // ADR 0004 §3.2 — day-selector commands.
        case 'clock.setSelectedDate':
          return { state: clockSetSelectedDate(clockState, args as never) };
        case 'clock.advanceDay':
          return { state: clockAdvanceDay(clockState, args as never) };
        case 'clock.goToday':
          return { state: clockGoToday(clockState) };
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
    case 'frame': {
      switch (command) {
        case 'frame.setLabel':    return { state: frameSetLabel(s as never, args as never) };
        case 'frame.setSize':     return { state: frameSetSize(s as never, args as never) };
        case 'frame.setChildren': return { state: frameSetChildren(s as never, args as never) };
        case 'frame.setTint':     return { config: frameSetTint(c as never, args as never) };
      }
      break;
    }
    // Issue #134 — AnalyticsNode commands. Pure FSM, no side effects.
    case 'analytics': {
      switch (command) {
        case 'analytics.setView':           return { state: analyticsSetView(s as never, args as never) };
        case 'analytics.setRangeDays':      return { state: analyticsSetRangeDays(s as never, args as never) };
        case 'analytics.setMetric':         return { state: analyticsSetMetric(s as never, args as never) };
        case 'analytics.setYear':           return { state: analyticsSetYear(s as never, args as never) };
        case 'analytics.setSize':           return { state: analyticsSetSize(s as never, args as never) };
        case 'analytics.toggleCardHidden':  return { state: analyticsToggleCardHidden(s as never, args as never) };
        case 'analytics.togglePinCard':     return { state: analyticsTogglePinCard(s as never, args as never) };
        case 'analytics.setSettingsOpen':   return { state: analyticsSetSettingsOpen(s as never, args as never) };
        case 'analytics.resetCardLayout':   return { state: analyticsResetCardLayout(s as never) };
      }
      break;
    }
    case 'terminal': {
      // T20: term.sessionStart / term.sessionEnd — update TermState.sessionId.
      // T21: term.setTitle — update TermState.title.
      // T22: term.setFontSize — update TermConfig.fontSize.
      // T23: term.clear — side-effect written to PTY by the node's makeCommandHandler.
      // T24: term.setShell — update TermConfig.shell.
      const termState = s as unknown as TermState;
      const termCfg = c as unknown as TermConfig;
      switch (command) {
        case 'term.sessionStart': {
          const res = termSessionStart(termState, args as { sessionId: string });
          return { state: res.state as Node['state'] };
        }
        case 'term.sessionEnd': {
          const res = termSessionEnd(termState, args as { sessionId: string });
          return { state: res.state as Node['state'] };
        }
        case 'term.setTitle': {
          const res = termSetTitle(termState, args as { title: string });
          return { state: res.state as Node['state'] };
        }
        case 'term.setFontSize': {
          const res = termSetFontSize(termCfg, args as { fontSize: number });
          return { config: res.config as Node['config'] };
        }
        case 'term.clear': {
          // T23: ptyWrite side-effect — handled via cli:dispatch in Phase 2.
          void termClear;
          return null;
        }
        case 'term.setShell': {
          const res = termSetShell(termCfg, args as { shell: string });
          return { config: res.config as Node['config'] };
        }
      }
      break;
    }
  }
  return null; // unknown command — no-op
}

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * #169 — sync the completion ledger from a task node's CURRENT state. Upserts
 * an entry when the task is done (with completedAt), clears it when undone.
 * Keyed by task id and idempotent, so it is safe to call from every site that
 * flips a task's done-state (task.toggle, todo.toggle mirror, CLI) without
 * double-counting. Reads the freshest node from the store by id so callers can
 * invoke it right after updateNode.
 */
function syncCompletionLedger(taskNodeId: string): void {
  const { board, recordCompletion, clearCompletion } = useBoardStore.getState();
  const taskNode = board?.nodes.find((n) => n.id === taskNodeId);
  if (!taskNode || taskNode.kind !== 'todo.task') return;
  const ts = taskNode.state as TaskState;
  if (ts.done && ts.completedAt) {
    recordCompletion({
      taskId: taskNodeId,
      text: ts.text,
      plannedMin: ts.plannedMin ?? ts.durationMin ?? 25,
      completedAt: ts.completedAt,
    });
  } else {
    clearCompletion(taskNodeId);
  }
}


/** Remove a set of node ids (and incident edges) from the store in one call. */
function removeNodeSet(ids: string[], opts?: { skipHistory?: boolean }): void {
  const { board } = useBoardStore.getState();
  if (!board) return;
  const idSet = new Set(ids);
  // Use the raw set method on the store to do a single atomic update.
  // #170 — push ONE history slot (pre-mutation board) so the delete is
  // undoable. The store's removeNode pushes history, but these bulk/cascade
  // paths bypass it and previously pushed nothing → undo couldn't restore.
  // skipHistory: when the caller already pushed a slot this action (e.g.
  // todo.remove updateNode'd the list first), ride that slot so one undo
  // reverts the whole thing instead of taking two presses.
  useBoardStore.setState((s) => {
    if (!s.board) return s;
    const historyPatch = opts?.skipHistory
      ? {}
      : { history: [...s.history, s.board].slice(-DELETE_HISTORY_CAP), future: [] };
    return {
      ...historyPatch,
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

// Mirrors boardStore's HISTORY_CAP (not exported). Bulk-delete pushes one slot.
const DELETE_HISTORY_CAP = 50;

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
 * Cascade-delete one or more TaskNodes plus all their descendants.
 * Delegates to the shared deleteTaskCascade pure function (shared/dispatch/task.ts)
 * and applies the result to the Zustand store in one atomic setState call.
 * Handles pomo cancel, TodoItem removal, and sibling renumber via the shared module.
 */
export function deleteTaskNodesCascade(taskIds: string[]): void {
  const storeState = useBoardStore.getState();
  if (!storeState.board) return;

  // Shallow-clone nodes/edges so deleteTaskCascade can mutate them safely.
  // Cast to AnyNode[] — Node<unknown,unknown> is structurally AnyNode-compatible but
  // lacks the index signature; we widen here at the boundary.
  const workingBoard: BoardShape = {
    ...storeState.board,
    nodes: storeState.board.nodes as unknown as BoardShape['nodes'],
    edges: [...storeState.board.edges],
  };

  // Track which ids have been consumed so that descendant ids passed in the
  // bulk taskIds array don't produce spurious no-op calls on the next iteration.
  const processed = new Set<string>();
  for (const taskId of taskIds) {
    if (processed.has(taskId)) continue;
    // Collect descendants BEFORE cascade so we can mark them processed.
    const descendants = collectDescendants(taskId, workingBoard.nodes);
    const result = deleteTaskCascade(workingBoard, taskId);
    if (result.removedCount === 0) continue;
    for (const id of descendants) processed.add(id);
  }

  if (processed.size === 0) return;

  // Apply the fully-mutated workingBoard back to the Zustand store in one
  // atomic setState so the entire cascade is one undo step.
  // #170 — push ONE history slot (pre-mutation board) so the cascade is
  // undoable. Previously this pushed nothing, so undo could not restore a
  // deleted task (the comment claimed "one undo step" but recorded zero).
  useBoardStore.setState((s) => {
    if (!s.board) return s;
    return {
      history: [...s.history, s.board].slice(-DELETE_HISTORY_CAP),
      future: [],
      board: {
        ...s.board,
        nodes: workingBoard.nodes as Node[],
        edges: workingBoard.edges,
      },
    };
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

/**
 * Remove every `habit.lane` node that points at the given habitId.
 * Used after a habit is deleted (from either the mother right-click menu
 * or via a lane's "delete habit" action) so the canvas doesn't leak
 * orphan lane placeholders.
 *
 * removeNode in the board store already no-ops on mother nodes, so this
 * is safe to call even if a future lane definition isMother flips.
 */
function removeAllLanesForHabit(habitId: string): void {
  const { board, removeNode } = useBoardStore.getState();
  if (!board) return;
  const orphans = board.nodes.filter(
    (n) =>
      n.kind === 'habit.lane' &&
      (n.state as { habitId?: string } | null)?.habitId === habitId,
  );
  for (const lane of orphans) removeNode(lane.id);
}

// ── Decision 22.1 helpers ──────────────────────────────────────────────────

const toIso = (ms: number): string => new Date(ms).toISOString();

/**
 * Write the in-flight running session's elapsed time into the active task's
 * `currentSessionElapsedSec` (checkpoint only — NOT secondsAccumulated).
 * Returns the elapsed seconds written (0 if nothing was written).
 */
function checkpointActiveTaskElapsed(): number {
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
  updateNode(
    taskNode.id,
    { state: taskSetCurrentSessionElapsedSec(ts, { seconds: elapsedSec }) },
    { skipHistory: true },
  );
  return elapsedSec;
}

/**
 * Decision 22.1 §4 — unified activation helper.
 * Loads a task into the pomo with optional auto-start.
 *
 * autoStart=true   → FSM becomes 'running' with offset startedAt honouring checkpoint.
 * autoStart=false  → FSM becomes 'paused' with pausedElapsedMs = checkpoint.
 * protectRunning=true → if a DIFFERENT task is currently running, no-op. Used by
 *   passive click-driven loads (task body click, todo-row click) so that the
 *   user can click around to select / connect / move tasks without disturbing
 *   the live session. Explicit START / Start-pomo paths pass protectRunning=false
 *   to force-switch.
 *
 * Idempotent guards:
 *   - same task + running → no-op (B6).
 *   - same task + paused  → no-op (avoids silently resetting checkpoint).
 */
function loadTaskIntoPomo(
  taskNodeId: string,
  opts: { autoStart: boolean; protectRunning?: boolean },
): void {
  const { board, updateNode } = useBoardStore.getState();
  if (!board) return;

  const taskNode = board.nodes.find((n) => n.id === taskNodeId);
  if (!taskNode || taskNode.kind !== 'todo.task') return;

  const pomoNode = board.nodes.find((n) => n.kind === 'pomo');
  if (!pomoNode) return;

  const ps = pomoNode.state as PomoState;
  const cfg = (pomoNode.config as PomoConfig | null) ?? defaultPomoConfig();

  // Idempotent guard: same task already running or paused — do nothing.
  if (
    ps.activeTaskId === taskNodeId &&
    (ps.status === 'running' || ps.status === 'paused')
  ) {
    return;
  }

  // Protect-running guard: a different task is currently RUNNING and the caller
  // is a passive load (click/selection). Refuse to disturb the live session.
  if (
    opts.protectRunning === true &&
    ps.activeTaskId !== null &&
    ps.activeTaskId !== taskNodeId &&
    ps.status === 'running'
  ) {
    return;
  }

  // Step 3: checkpoint the prior active task's elapsed before we cancel.
  if (ps.activeTaskId !== null && ps.activeTaskId !== taskNodeId) {
    if (ps.status === 'running') {
      checkpointActiveTaskElapsed();
    } else if (ps.status === 'paused') {
      // Paused: derive elapsed from pausedElapsedMs rather than wall-clock.
      const priorTaskNode = useBoardStore
        .getState()
        .board?.nodes.find((n) => n.id === ps.activeTaskId);
      if (priorTaskNode && priorTaskNode.kind === 'todo.task') {
        const elapsedSec = Math.floor(ps.pausedElapsedMs / 1000);
        if (elapsedSec > 0) {
          const priorTs = priorTaskNode.state as TaskState;
          updateNode(
            priorTaskNode.id,
            { state: taskSetCurrentSessionElapsedSec(priorTs, { seconds: elapsedSec }) },
            { skipHistory: true },
          );
        }
      }
    }
  }

  // Step 4: cancel/skip-break the in-flight FSM so it's clean for the new load.
  const freshBoard = useBoardStore.getState().board;
  const freshPomo = freshBoard?.nodes.find((n) => n.id === pomoNode.id);
  let workingState = (freshPomo?.state as PomoState | undefined) ?? ps;
  if (workingState.status === 'running' || workingState.status === 'paused') {
    workingState = pomoCancel(workingState);
  } else if (workingState.status === 'break') {
    workingState = pomoSkipBreak(workingState);
  }

  // Issue #166 — events are pre-scheduled calendar blocks, not timer-controlled.
  // Only focus tasks can be loaded into the pomo timer.
  const taskState = taskNode.state as TaskState;
  if (taskState.kind === 'event') return;

  // Step 5: compute current session minutes for focus tasks.
  const completed = taskState.pomoSessionsCompleted ?? 0;
  const currentSessionMin = computeCurrentSessionMin(taskState.plannedMin, completed, cfg);

  // Step 6: read the checkpoint (in-flight elapsed) from the new task.
  const checkpointMs = (taskState.currentSessionElapsedSec ?? 0) * 1000;

  // Step 7: build the next PomoState.
  const now = Date.now();
  let nextPomoState: PomoState;
  if (opts.autoStart) {
    nextPomoState = {
      ...workingState,
      activeTaskId: taskNodeId,
      label: taskState.text,
      durationMin: currentSessionMin,
      status: 'running',
      startedAt: toIso(now - checkpointMs),
      pausedAt: null,
      pausedElapsedMs: 0,
    };
  } else {
    nextPomoState = {
      ...workingState,
      activeTaskId: taskNodeId,
      label: taskState.text,
      durationMin: currentSessionMin,
      status: 'paused',
      startedAt: toIso(now - checkpointMs),
      pausedAt: toIso(now),
      pausedElapsedMs: checkpointMs,
    };
  }

  // Step 8: persist. Pomo-load is selection-driven, not a user edit — skip
  // history so Ctrl+Z doesn't undo "I clicked on this task to see its timer".
  updateNode(pomoNode.id, { state: nextPomoState }, { skipHistory: true });
  const updated = useBoardStore.getState().board;
  if (updated) void saveBoard(updated);
}

// ── makeCommandHandler ─────────────────────────────────────────────────────────

/**
 * Returns an onCommand handler bound to a specific node id.
 * Call once per rendered node (stable reference via useCallback with [nodeId]).
 */
/** Short id for log lines — keeps text under the 120-char cap. */
function shortId(id: string): string {
  return id.startsWith('mother-') ? id : id.slice(0, 10);
}

export function makeCommandHandler(nodeId: string) {
  return (command: string, args: Args = {}): void => {
    try {
      _dispatch(nodeId, command, args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit('sys.error', `dispatch '${command}' on ${shortId(nodeId)} failed: ${msg}`, {
        severity: 'err',
        refId: nodeId,
      });
      throw err;
    }
  };
}

function _dispatch(nodeId: string, command: string, args: Args): void {
  {
    const { board, updateNode } = useBoardStore.getState();
    if (!board) return;

    const node = board.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // ── task.startPomo / task.spawnPomo: auto-start (Decision 22 §5, legacy path)
    // If this task is already loaded-paused (the new click-to-load flow), START
    // means RESUME — transition straight to running, preserving the checkpoint.
    // loadTaskIntoPomo's idempotent guard would otherwise no-op the same-task
    // paused case.
    if (command === 'task.startPomo' || command === 'task.spawnPomo') {
      const pomoNode = board.nodes.find((n) => n.kind === 'pomo');
      if (pomoNode) {
        const ps = pomoNode.state as PomoState;
        if (ps.activeTaskId === nodeId && ps.status === 'paused') {
          updateNode(pomoNode.id, { state: pomoResume(ps) });
          const updated = useBoardStore.getState().board;
          if (updated) void saveBoard(updated);
          return;
        }
      }
      loadTaskIntoPomo(nodeId, { autoStart: true });
      emit('pomo.start', `pomo session started for task ${shortId(nodeId)}`, { refId: nodeId });
      return;
    }

    // ── task.loadIntoPomo: toggle-load this task into pomo ────────────────
    // Passive (double-click / todo-row click driven). Toggle semantics:
    //   - If THIS task is already loaded (any FSM status) → unload, cancel any
    //     in-flight session (or skip break), snap pomo back to defaults, and
    //     clear the task's in-flight checkpoint so the next load starts fresh.
    //   - Otherwise → load (autoStart=false), protect a different running
    //     session so accidental clicks don't disturb live work.
    if (command === 'task.loadIntoPomo') {
      const pomoNode = board.nodes.find((n) => n.kind === 'pomo');
      if (pomoNode) {
        const ps = pomoNode.state as PomoState;
        if (ps.activeTaskId === nodeId) {
          const cfg = (pomoNode.config as PomoConfig | null) ?? defaultPomoConfig();
          let next = ps;
          // pomoCancel handles running/paused; pomoSkipBreak handles break.
          // Without the break branch, status would stay 'break' after unload
          // and the break timer would keep ticking on a phantom session.
          if (next.status === 'running' || next.status === 'paused') {
            next = pomoCancel(next);
          } else if (next.status === 'break') {
            next = pomoSkipBreak(next);
          }
          next = pomoClearActiveTask(next, cfg);
          updateNode(pomoNode.id, { state: next });

          // Wipe the task's in-flight checkpoint — the session was abandoned.
          // Without this, re-loading the task later would resume from a stale
          // currentSessionElapsedSec, contradicting the "snap to defaults" UX.
          const freshTask = useBoardStore
            .getState()
            .board?.nodes.find((n) => n.id === nodeId);
          if (freshTask && freshTask.kind === 'todo.task') {
            const ts = freshTask.state as TaskState;
            if ((ts.currentSessionElapsedSec ?? 0) > 0) {
              updateNode(
                nodeId,
                { state: taskClearCurrentSessionElapsedSec(ts) },
                { skipHistory: true },
              );
            }
          }

          const updated = useBoardStore.getState().board;
          if (updated) void saveBoard(updated);
          emit('pomo.stop', `task ${shortId(nodeId)} unloaded from pomo`, { refId: nodeId });
          return;
        }
      }
      loadTaskIntoPomo(nodeId, { autoStart: false, protectRunning: true });
      return;
    }

    // ── task.pausePomo: pause the live session for this task ─────────────
    // The TaskNode's per-task PAUSE button (previously labelled STOP) is a
    // shortcut to the parent PomoNode's PAUSE — it suspends the timer but
    // keeps the task loaded as the active task, so START can resume from
    // the same elapsed checkpoint. To fully abandon a session, the user
    // presses RESET on the PomoNode (which dispatches pomo.cancel).
    //
    // We also mirror the pomo's new pausedElapsedMs into the task's
    // currentSessionElapsedSec so the corner timer on the TaskNode reads
    // the correct frozen value immediately on pause — without this, the
    // corner timer shows a stale checkpoint until the user clicks another
    // task and the load-task-into-pomo path writes the checkpoint.
    if (command === 'task.pausePomo') {
      const freshBoard = useBoardStore.getState().board;
      if (!freshBoard) return;
      const pomoNode = freshBoard.nodes.find((n) => n.kind === 'pomo');
      if (!pomoNode) return;
      const ps = pomoNode.state as PomoState;
      // No-op unless this task is the running active one.
      if (ps.activeTaskId !== nodeId) return;
      if (ps.status !== 'running') return;
      const pausedState = pomoPause(ps);
      updateNode(pomoNode.id, { state: pausedState });

      // Mirror pausedElapsedMs into the task's checkpoint so the corner timer
      // shows the correct frozen value as soon as PAUSE fires.
      const taskNode = useBoardStore
        .getState()
        .board?.nodes.find((n) => n.id === nodeId);
      if (taskNode && taskNode.kind === 'todo.task') {
        const ts = taskNode.state as TaskState;
        updateNode(nodeId, {
          state: taskSetCurrentSessionElapsedSec(ts, {
            seconds: Math.floor(pausedState.pausedElapsedMs / 1000),
          }),
        });
      }

      const saved = useBoardStore.getState().board;
      if (saved) void saveBoard(saved);
      emit('pomo.stop', `pomo paused for task ${shortId(nodeId)}`, { severity: 'info', refId: nodeId });
      return;
    }

    // ── task.toggleKind: flip 'focus' ↔ 'event' (Decision 28 §5) ──────────
    // Clean handoff rule: if toggling focus→event and the pomo is currently
    // running this task, cancel the pomo first (preserving pomo history) and
    // clear the activeTaskId so the FSM is in a clean idle state.
    // pomoSessionsCompleted and secondsAccumulated are intentionally preserved
    // so toggling back to focus resumes from the same checkpoint.
    if (command === 'task.toggleKind') {
      if (node.kind !== 'todo.task') return;
      const ts = node.state as TaskState;
      const newKind = ts.kind === 'focus' ? 'event' : 'focus';

      // If this task is currently loaded in the pomo and a session is in-flight,
      // cancel it so the partial run is recorded; then re-load with the new
      // kind's settings (single big session for event, per-session for focus).
      const freshBoard = useBoardStore.getState().board;
      const pomoNode = freshBoard?.nodes.find((n) => n.kind === 'pomo');
      const wasActive = pomoNode
        ? (pomoNode.state as PomoState).activeTaskId === nodeId
        : false;
      if (pomoNode && wasActive) {
        const ps = pomoNode.state as PomoState;
        if (ps.status === 'running' || ps.status === 'paused') {
          updateNode(pomoNode.id, { state: pomoCancel(ps) });
        } else if (ps.status === 'break') {
          updateNode(pomoNode.id, { state: pomoSkipBreak(ps) });
        }
      }

      updateNode(nodeId, { state: { ...ts, kind: newKind } });

      // Issue #166: events are not timer-controlled — when toggling focus→event,
      // unload the task from pomo (clear activeTaskId, snap to defaults).
      // When toggling event→focus, optionally re-load (autoStart=false).
      if (wasActive) {
        if (newKind === 'event') {
          const cfg2 = (pomoNode?.config as PomoConfig | null) ?? defaultPomoConfig();
          const freshPomo2 = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'pomo');
          if (freshPomo2) {
            updateNode(freshPomo2.id, { state: pomoClearActiveTask(freshPomo2.state as PomoState, cfg2) });
          }
        } else {
          loadTaskIntoPomo(nodeId, { autoStart: false });
        }
      }

      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      emit('task.toggleKind', `task ${shortId(nodeId)} kind flipped to ${newKind}`, { refId: nodeId });
      return;
    }

    // ── task.setNote: write a free-form note onto the task state ───────────
    if (command === 'task.setNote') {
      if (node.kind !== 'todo.task') return;
      const raw = args['note'];
      const note = typeof raw === 'string' ? raw : '';
      const ts = node.state as TaskState;
      const trimmed = note.trim();
      const nextState = trimmed.length > 0
        ? { ...ts, note: trimmed }
        : (() => { const { note: _drop, ...rest } = ts; return rest as TaskState; })();
      updateNode(nodeId, { state: nextState });
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      return;
    }

    // ── todo.startPomoForItem: resolve itemId → taskNodeId → auto-start ───
    if (command === 'todo.startPomoForItem') {
      const todoState = node.state as TodoState;
      const itemId = args['itemId'] as string | undefined;
      if (!itemId) return;
      const item = todoState.items.find((i) => i.id === itemId);
      if (!item?.taskNodeId) return;
      loadTaskIntoPomo(item.taskNodeId, { autoStart: true });
      return;
    }

    // ── todo.setItemPlannedMin: resolve itemId → taskNodeId → update its
    //    plannedMin. Mirrors todo.startPomoForItem's lookup pattern so the
    //    TodoNode row context menu can edit time without reaching across
    //    into the task node directly. No-op when the item has no task node
    //    yet (the row menu disables this item in that case).
    if (command === 'todo.setItemPlannedMin') {
      const todoState = node.state as TodoState;
      const itemId = args['itemId'] as string | undefined;
      const minutes = args['minutes'];
      if (!itemId || typeof minutes !== 'number' || !Number.isFinite(minutes)) return;
      const item = todoState.items.find((i) => i.id === itemId);
      if (!item?.taskNodeId) return;
      const taskNode = useBoardStore.getState().board?.nodes.find(
        (n) => n.id === item.taskNodeId,
      );
      if (!taskNode || taskNode.kind !== 'todo.task') return;
      const nextTaskState = taskSetPlannedMin(taskNode.state as never, { minutes });
      updateNode(taskNode.id, { state: nextTaskState });
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      return;
    }

    // ── todo.loadTaskForItem: resolve itemId → taskNodeId → LOAD ONLY ─────
    // Single-clicking a TodoItem row refreshes the pomo with the task's saved
    // state (label, durationMin, checkpoint elapsed) without auto-starting.
    // The user must press START on the pomo to begin the session.
    // Passive click — protect a different running session.
    if (command === 'todo.loadTaskForItem') {
      const todoState = node.state as TodoState;
      const itemId = args['itemId'] as string | undefined;
      if (!itemId) return;
      const item = todoState.items.find((i) => i.id === itemId);
      if (!item?.taskNodeId) return;
      loadTaskIntoPomo(item.taskNodeId, { autoStart: false, protectRunning: true });
      return;
    }

    // ── task.delete: cascade-delete task + descendants + linked TodoItems ───
    if (command === 'task.delete') {
      deleteTaskNodesCascade([nodeId]);
      const final = useBoardStore.getState().board;
      if (final) void saveBoard(final);
      emit('task.deleted', `task ${shortId(nodeId)} deleted`, { severity: 'warn', refId: nodeId });
      return;
    }

    // ── task.addSubtask: spawn a child TaskNode one layer deeper ────────────
    // Decision 22.2 Fix 4: backfills a TodoItem on the parent TodoNode so the
    // subtask is visible in the todo list (bidirectional linkage invariant).
    // Bug 4: accepts optional durationMin arg from the two-phase inline input.
    if (command === 'task.addSubtask') {
      const parentTask = node.state as TaskState;
      const text = (args['text'] as string | undefined) ?? '';
      if (!text.trim()) return;

      // Bug 4: use explicit durationMin arg if provided, fall back to parent's value.
      const argDuration = args['durationMin'];
      const childDurationMin =
        typeof argDuration === 'number' && Number.isFinite(argDuration) && argDuration >= 1
          ? Math.round(argDuration)
          : parentTask.durationMin;
      const childPlannedMin =
        typeof argDuration === 'number' && Number.isFinite(argDuration) && argDuration >= 1
          ? Math.round(argDuration)
          : (parentTask.plannedMin ?? parentTask.durationMin);

      const freshBoard = useBoardStore.getState().board;
      if (!freshBoard) return;

      // Count siblings to get sequence number
      const siblings = freshBoard.nodes.filter((n) => {
        if (n.kind !== 'todo.task') return false;
        const ts = n.state as TaskState;
        return ts.parentTodoId === parentTask.parentTodoId && ts.parentTaskId === nodeId;
      });
      const seq = siblings.length + 1;

      const childNodeId = `task-${crypto.randomUUID()}`;

      // Step 1: resolve the parent TodoNode and append a new TodoItem.
      const todoNode = freshBoard.nodes.find((n) => n.id === parentTask.parentTodoId);
      const prevTodoState = todoNode ? (todoNode.state as TodoState) : null;
      let newTodoState: TodoState | null = null;
      let itemId: string = '';
      if (prevTodoState) {
        newTodoState = todoAdd(prevTodoState, { text: text.trim() });
        // The new item is always the last one.
        const newItem = newTodoState.items[newTodoState.items.length - 1];
        if (newItem) {
          itemId = newItem.id;
          // Step 5: set taskNodeId on the item (bidirectional link).
          newTodoState = todoLinkTask(newTodoState, { itemId, taskNodeId: childNodeId });
        }
        if (todoNode) {
          updateNode(todoNode.id, { state: newTodoState });
        }
      }

      const childState: TaskState = {
        text: text.trim(),
        done: false,
        durationMin: childDurationMin,
        eta: `~${childPlannedMin} min`,
        sequenceNumber: seq,
        layer: parentTask.layer + 1,
        createdAt: new Date().toISOString(),
        parentTodoId: parentTask.parentTodoId,
        parentTaskId: nodeId,
        todoItemId: itemId !== '' ? itemId : null,
        pomoSessionsCompleted: 0,
        plannedMin: childPlannedMin,
        secondsAccumulated: 0,
        currentSessionElapsedSec: 0,
        // #180 — Todo is the planner; it only creates EVENTS. Focus/pomo tasks
        // no longer exist on the Todo path. Pomo observes independently.
        kind: 'event',
      };

      const childNode: Node = {
        id: childNodeId,
        kind: 'todo.task',
        // Mirror CLI spacing constants (src/sys/layout.ts TASK_STEP_X = 300,
        // TASK_H + GAP_Y ≈ 200 for layer-down). Previously 252 / 160 which
        // produced visibly cramped chains.
        position: {
          x: node.position.x + (seq - 1) * 300,
          y: node.position.y + 200,
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
      if (updated) void saveBoard(updated);
      emit('task.created', `subtask ${shortId(childNodeId)} added under ${shortId(nodeId)}`, { refId: childNodeId });
      notifySpawnVisible({ x: childNode.position.x, y: childNode.position.y, ...TASK_RECT });
      return;
    }

    // ── task.addNext: spawn a sequential successor at the same chain level ──
    // ADR 0004 §2 — sibling-level task (parentTaskId = source.parentTaskId,
    // NOT source.id). One task.next edge from source. Bidirectional mirror:
    // append a TodoItem on the parent TodoNode, identical to task.addSubtask's
    // tail. Position offset is one card width to the right (horizontal flow).
    if (command === 'task.addNext') {
      if (node.kind !== 'todo.task') return;
      const sourceTask = node.state as TaskState;
      const text = (args['text'] as string | undefined) ?? '';
      if (!text.trim()) return;

      const argDuration = args['durationMin'];
      const newDurationMin =
        typeof argDuration === 'number' && Number.isFinite(argDuration) && argDuration >= 1
          ? Math.round(argDuration)
          : sourceTask.durationMin;
      const newPlannedMin =
        typeof argDuration === 'number' && Number.isFinite(argDuration) && argDuration >= 1
          ? Math.round(argDuration)
          : (sourceTask.plannedMin ?? sourceTask.durationMin);

      const freshBoard = useBoardStore.getState().board;
      if (!freshBoard) return;

      // Sequence number among tasks sharing the same (parentTodoId, parentTaskId).
      const siblings = freshBoard.nodes.filter((n) => {
        if (n.kind !== 'todo.task') return false;
        const ts = n.state as TaskState;
        return (
          ts.parentTodoId === sourceTask.parentTodoId &&
          ts.parentTaskId === sourceTask.parentTaskId
        );
      });
      const seq = siblings.length + 1;

      const newNodeId = `task-${crypto.randomUUID()}`;

      // Append a TodoItem on the parent TodoNode (bidirectional invariant).
      const todoNode = freshBoard.nodes.find((n) => n.id === sourceTask.parentTodoId);
      let itemId = '';
      if (todoNode && todoNode.kind === 'todo') {
        const prevTodoState = todoNode.state as TodoState;
        let newTodoState = todoAdd(prevTodoState, { text: text.trim() });
        const newItem = newTodoState.items[newTodoState.items.length - 1];
        if (newItem) {
          itemId = newItem.id;
          newTodoState = todoLinkTask(newTodoState, { itemId, taskNodeId: newNodeId });
        }
        updateNode(todoNode.id, { state: newTodoState });
      }

      const newState: TaskState = {
        text: text.trim(),
        done: false,
        durationMin: newDurationMin,
        eta: `~${newPlannedMin} min`,
        sequenceNumber: seq,
        layer: sourceTask.layer,
        createdAt: new Date().toISOString(),
        parentTodoId: sourceTask.parentTodoId,
        parentTaskId: sourceTask.parentTaskId,
        todoItemId: itemId !== '' ? itemId : null,
        pomoSessionsCompleted: 0,
        plannedMin: newPlannedMin,
        secondsAccumulated: 0,
        currentSessionElapsedSec: 0,
        // #180 — Todo creates EVENTS only.
        kind: 'event',
      };

      const newNode: Node = {
        id: newNodeId,
        kind: 'todo.task',
        // ADR 0004 §2 — one card width to the right, same y.
        position: { x: node.position.x + 252, y: node.position.y },
        isMother: false,
        state: newState,
        config: { showDuration: true },
      };

      const edge: Edge = {
        id: `edge-${crypto.randomUUID()}`,
        from: { nodeId: nodeId, event: 'task.next' },
        to: { nodeId: newNode.id, command: 'task.activate' },
        enabled: true,
      };

      const { addNode, addEdge } = useBoardStore.getState();
      addNode(newNode);
      addEdge(edge);
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      emit('task.created', `next task ${shortId(newNodeId)} after ${shortId(nodeId)}`, { refId: newNodeId });
      notifySpawnVisible({ x: newNode.position.x, y: newNode.position.y, ...TASK_RECT });
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

      // Spawn habit lanes in their own Y band, well below the typical task
      // chain band (motherY + 760 .. ~+1100). HABIT_LANE_OFFSET_Y is in
      // src/sys/layout.ts. Previously this was motherY + 540 which collided
      // with task chains spawning at motherY + 580 — habit lanes and tasks
      // fought for the same horizontal strip (user report 2026-05-17).
      const laneCount = board.nodes.filter((n) => n.kind === 'habit.lane').length;
      const HABIT_LANE_OFFSET_Y = 1300; // mirror of src/sys/layout.ts constant
      const position = {
        x: node.position.x + (laneCount % 3) * 300,
        y: node.position.y + HABIT_LANE_OFFSET_Y + Math.floor(laneCount / 3) * 160,
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
      if (updated) void saveBoard(updated);
      emit('node.added', `habit.lane spawned for habit ${habitId.slice(0, 8)}`, { refId: lane.id });
      return;
    }

    // ── habit.unpinLane (Decision 29 §4) — remove habit.lane node(s) for a habit ─
    // Issued by cli:dispatch from `habit unpin <ref>`. Renderer-required.
    if (node.kind === 'habit' && command === 'habit.unpinLane') {
      const habitId = args['habitId'];
      if (typeof habitId !== 'string') return;
      const currentBoard = useBoardStore.getState().board;
      if (!currentBoard) return;
      const lanes = currentBoard.nodes.filter(
        (n) => n.kind === 'habit.lane' && (n.state as HabitLaneState | null)?.habitId === habitId,
      );
      if (lanes.length === 0) {
        // Will be surfaced as error by the cli dispatch return path — but commandDispatch
        // cannot return values here. The useCliDispatch handler catches this.
        return;
      }
      const { removeNode } = useBoardStore.getState();
      for (const lane of lanes) {
        removeNode(lane.id);
        emit('node.removed', `habit.lane removed for habit ${habitId.slice(0, 8)}`, { refId: lane.id });
      }
      const finalBoard = useBoardStore.getState().board;
      if (finalBoard) void saveBoard(finalBoard);
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
          emit('habit.checkin', `habit ${habitId.slice(0, 8)} toggled (lane)`, { refId: habitId });
          break;
        }
        // Edge target — same as toggleToday but idempotent.
        case 'habit.markDone': {
          mutateMotherHabit(mother.id, (s) => habitMarkDone(s, { id: habitId }));
          emit('habit.checkin', `habit ${habitId.slice(0, 8)} marked done`, { refId: habitId });
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
        case 'habit.lane.setNote': {
          const note = args['note'];
          if (typeof note !== 'string') return;
          mutateMotherHabit(mother.id, (s) => habitSetNote(s, { id: habitId, note }));
          break;
        }
        case 'habit.lane.removeHabit': {
          mutateMotherHabit(mother.id, (s) => habitRemove(s, { id: habitId }));
          // Also remove every lane node that referenced this habit — the
          // habit is gone, an orphaned "habit removed — delete this lane"
          // placeholder is just busywork for the user.
          removeAllLanesForHabit(habitId);
          break;
        }
        default:
          return;
      }
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      return;
    }

    // ── calendar.selectDate: cross-node mirror — sync every clock's day ──
    // Follow-up to ADR 0004 §3.1. The ADR keeps Clock and Calendar
    // independent by *default* — but user feedback (2026-05-17) was that
    // when they click a day in the month view they expect the clock to
    // hop to that day's schedule without a second click. We honour that:
    // calendar.selectDate now also broadcasts the new YYYY-MM-DD to every
    // clock node on the board. Clocks can still be moved independently
    // via their own ← / → / picker controls — the sync only fires on
    // explicit calendar clicks, not on every render.
    if (node.kind === 'calendar' && command === 'calendar.selectDate') {
      const sel = applyCommand(node, command, args);
      if (sel?.state !== undefined) {
        updateNode(nodeId, { state: sel.state });
      }
      const date = (args as { date?: unknown }).date;
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const fresh = useBoardStore.getState().board;
        if (fresh) {
          for (const cn of fresh.nodes) {
            if (cn.kind !== 'clock') continue;
            const cs = cn.state as ClockState;
            if (cs.selectedDate !== date) {
              updateNode(cn.id, { state: { ...cs, selectedDate: date } });
            }
          }
        }
      }
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      return;
    }

    // ── calendar.activateTask: cross-node router — fire task.activate on target ─
    // Slice 3: clicking a scheduled task block in WeekView should activate the
    // task (light up its chain). The block lives inside CalendarNode, so
    // onCommand is bound to the calendar id — a plain task.activate dispatch
    // would no-op. This router looks up the target task and applies taskActivate.
    if (node.kind === 'calendar' && command === 'calendar.activateTask') {
      const actArgs = args as { taskId?: string };
      if (!actArgs.taskId) return;
      const currentBoard = useBoardStore.getState().board;
      if (!currentBoard) return;
      const targetTask = currentBoard.nodes.find((n) => n.id === actArgs.taskId);
      if (!targetTask || targetTask.kind !== 'todo.task') return;
      const nextTaskState = taskActivate(targetTask.state as TaskState);
      updateNode(actArgs.taskId, { state: nextTaskState });
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      return;
    }

    // ── calendar.schedule: cross-node router — dispatch task.setSchedule to target ─
    // ADR 0005: anchors are independent fixpoints; no chain-wide clearing.
    if (node.kind === 'calendar' && command === 'calendar.schedule') {
      const scheduleArgs = args as {
        taskId: string;
        scheduledFor: string;
        scheduledDurationMin?: number;
      };
      if (!scheduleArgs.taskId || !scheduleArgs.scheduledFor) return;
      const currentBoard = useBoardStore.getState().board;
      if (!currentBoard) return;
      const targetTask = currentBoard.nodes.find((n) => n.id === scheduleArgs.taskId);
      if (!targetTask || targetTask.kind !== 'todo.task') return;
      const prevTask = targetTask.state as TaskState;

      const schedPatch: { scheduledFor: string | null; scheduledDurationMin?: number } = {
        scheduledFor: scheduleArgs.scheduledFor,
      };
      if (typeof scheduleArgs.scheduledDurationMin === 'number') {
        schedPatch.scheduledDurationMin = scheduleArgs.scheduledDurationMin;
      }
      const nextTaskState = taskSetSchedule(prevTask, schedPatch);
      updateNode(scheduleArgs.taskId, { state: nextTaskState });
      // Mirror to linked TodoItem.
      if (prevTask.todoItemId !== null && prevTask.parentTodoId) {
        const freshBoard = useBoardStore.getState().board;
        const todoNode = freshBoard?.nodes.find((n) => n.id === prevTask.parentTodoId);
        if (todoNode && todoNode.kind === 'todo') {
          const newTodoState = todoSetItemSchedule(todoNode.state as TodoState, {
            itemId: prevTask.todoItemId,
            scheduledFor: scheduleArgs.scheduledFor,
          });
          updateNode(todoNode.id, { state: newTodoState });
        }
      }
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      return;
    }

    // ── calendar.scheduleHabit: cross-node router — dispatch habit.setSchedule to habit mother ─
    // ADR 0002 §5: calendar.scheduleHabit looks up the habit mother by habitMotherId
    // and dispatches habit.setSchedule. The calendar node does NOT mutate habit state directly.
    if (node.kind === 'calendar' && command === 'calendar.scheduleHabit') {
      const schedArgs = args as {
        habitId?: string;
        habitMotherId?: string;
        schedule?: HabitSchedule;
      };
      if (!schedArgs.habitId || !schedArgs.habitMotherId || !schedArgs.schedule) return;
      const currentBoard = useBoardStore.getState().board;
      if (!currentBoard) return;
      const habitMother = currentBoard.nodes.find((n) => n.id === schedArgs.habitMotherId);
      if (!habitMother || habitMother.kind !== 'habit') return;
      const nextHabitState = habitSetSchedule(habitMother.state as HabitState, {
        habitId: schedArgs.habitId,
        schedule: schedArgs.schedule,
      });
      updateNode(habitMother.id, { state: nextHabitState });
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      return;
    }

    // ── todo.add pre-processing: strip trailing-suffix minutes from the text
    //    before todoAdd runs, so the stored TodoItem.text is already clean.
    //    Decision 22.2 Fix 3: dispatcher is the single source of truth for parsing.
    let effectiveArgs = args;
    if (node.kind === 'todo' && command === 'todo.add') {
      const rawText = (args['text'] as string | undefined) ?? '';
      const { plannedMin: parsedMin, strippedText } = parseMinutesFromText(rawText);
      // Two-phase input sends `durationMin`; map it to `plannedMin` if no
      // trailing suffix overrode it. Trailing suffix still takes precedence.
      const argDuration = args['durationMin'];
      const durationAsPlanned =
        typeof argDuration === 'number' && Number.isFinite(argDuration) && argDuration >= 1
          ? Math.max(1, Math.round(argDuration))
          : null;
      const effectivePlanned = parsedMin ?? durationAsPlanned;
      if (strippedText !== rawText || effectivePlanned !== null) {
        effectiveArgs = {
          ...args,
          text: strippedText,
          ...(effectivePlanned !== null ? { plannedMin: effectivePlanned } : {}),
        };
      }
    }

    const result = applyCommand(node, command, effectiveArgs);
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

      // Spawn rule: if siblings exist, place right next to the most recently
      // added one (chronological tail). If no siblings yet, drop the first
      // task below the parent mother (540px tall + 40px gap).
      let position: { x: number; y: number };
      if (siblingTaskNodes.length === 0) {
        position = { x: todoNode.position.x, y: todoNode.position.y + 580 };
      } else {
        const last = siblingTaskNodes
          .slice()
          .sort((a, b) =>
            (a.state as TaskState).createdAt.localeCompare((b.state as TaskState).createdAt),
          )
          .at(-1)!;
        position = { x: last.position.x + 252, y: last.position.y };
      }

      const addedItem = nextState.items[nextState.items.length - 1];
      // Use stripped text from the item (todoAdd already received the stripped text).
      const text = addedItem?.text ?? (effectiveArgs['text'] as string | undefined) ?? '';
      const tag = addedItem?.tag ?? (effectiveArgs['tag'] as string | undefined);
      const itemId = addedItem?.id ?? '';

      // Decision 22 / 22.2 — read the pomo mother's config to seed per-session minutes.
      // Argument precedence: explicit args.plannedMin > trailing/legacy suffix parse > sessionMin.
      const pomoMother = fresh.nodes.find((nd) => nd.kind === 'pomo');
      const cfg = (pomoMother?.config as PomoConfig | null) ?? defaultPomoConfig();
      const sessionMin = cfg.sessionMin;
      const argPlanned = effectiveArgs['plannedMin'];
      const parsedPlanned = typeof argPlanned === 'number' && Number.isFinite(argPlanned)
        ? Math.max(1, Math.round(argPlanned as number))
        : sessionMin;

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
        currentSessionElapsedSec: 0,
        // #180 — Todo creates EVENTS only.
        kind: 'event',
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
      if (finalBoard) void saveBoard(finalBoard);
      emit('task.created', `task ${shortId(taskNodeId)} added via todo`, { refId: taskNodeId });
      notifySpawnVisible({ x: position.x, y: position.y, ...TASK_RECT });
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
              // Issue #134 — stamp completedAt on the mirrored TaskNode too.
              const mirrored = stampCompletedAt(
                ts,
                { ...ts, done: nextItem.done },
                { uuid: () => crypto.randomUUID(), now: () => new Date().toISOString() },
              );
              updateNode(prevItem.taskNodeId, { state: mirrored });
              // #169 — keep the completion ledger in sync with the mirrored node.
              syncCompletionLedger(prevItem.taskNodeId);
            }
          }
        }
      }

      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
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
            const descendants = collectDescendants(
              removedItem.taskNodeId,
              currentBoard.nodes as unknown as BoardShape['nodes'],
            );
            // updateNode above already pushed a history slot for this action.
            removeNodeSet(descendants, { skipHistory: true });
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
      if (final) void saveBoard(final);
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
            taskIds.push(...collectDescendants(
              item.taskNodeId,
              currentBoard.nodes as unknown as BoardShape['nodes'],
            ));
          }
        }
        if (taskIds.length > 0) {
          // updateNode above already pushed a history slot for this action.
          removeNodeSet(taskIds, { skipHistory: true });
        }
      }

      const final = useBoardStore.getState().board;
      if (final) void saveBoard(final);
      return;
    }

    // ── task.toggle: mirror done state to linked TodoItem (+ pomo cancel if active)
    if (node.kind === 'todo.task' && command === 'task.toggle' && result.state !== undefined) {
      const prevTask = node.state as TaskState;
      // Issue #134 — stamp completedAt at the call site (pure fsmTaskToggle has no clock).
      const nextTask = stampCompletedAt(prevTask, result.state as TaskState, {
        uuid: () => crypto.randomUUID(),
        now: () => new Date().toISOString(),
      });
      updateNode(nodeId, { state: nextTask });
      if (prevTask.done !== nextTask.done) {
        emit('task.completed', `task ${shortId(nodeId)} ${nextTask.done ? 'completed' : 'reopened'}`, {
          refId: nodeId,
        });
        // #169 — record/clear the durable completion (survives node deletion).
        syncCompletionLedger(nodeId);
      }

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

      // Bug #3: if task is now done AND it's the active pomo task, cancel the session.
      // We bypass the pomo.cancel dispatcher branch (which writes secondsAccumulated),
      // so do the same commit inline so the in-flight elapsed time is not lost.
      if (nextTask.done === true) {
        const freshBoard = useBoardStore.getState().board;
        const pomoNode = freshBoard?.nodes.find((n) => n.kind === 'pomo');
        if (pomoNode) {
          const ps = pomoNode.state as PomoState;
          if (ps.activeTaskId === nodeId && ps.status !== 'idle') {
            const pomoCfg = (pomoNode.config as PomoConfig | null) ?? defaultPomoConfig();
            // pomoCancel covers running/paused; pomoSkipBreak covers break.
            // Without skipBreak, marking a task done mid-break would orphan
            // the break timer (status stays 'break' with no active task).
            let cancelledState = ps;
            if (ps.status === 'running' || ps.status === 'paused') {
              cancelledState = pomoCancel(cancelledState);
            } else if (ps.status === 'break') {
              cancelledState = pomoSkipBreak(cancelledState);
            }
            // Pass config so durationMin/breakMin snap back to user defaults
            // (matches task-delete and task.loadIntoPomo toggle-off paths).
            cancelledState = pomoClearActiveTask(cancelledState, pomoCfg);
            updateNode(pomoNode.id, { state: cancelledState });

            // Commit the just-cancelled session's elapsed time into the task.
            const newest = cancelledState.history[cancelledState.history.length - 1];
            if (newest) {
              const elapsedSec = Math.max(
                0,
                Math.floor((Date.parse(newest.endedAt) - Date.parse(newest.startedAt)) / 1000),
              );
              const freshTask = useBoardStore
                .getState()
                .board?.nodes.find((n) => n.id === nodeId);
              if (freshTask && freshTask.kind === 'todo.task') {
                const ts = freshTask.state as TaskState;
                updateNode(nodeId, {
                  state: {
                    ...ts,
                    secondsAccumulated: (ts.secondsAccumulated ?? 0) + elapsedSec,
                    currentSessionElapsedSec: 0,
                  },
                });
              }
            }
          }
        }
      }

      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      return;
    }

    // ── task.setSchedule (on todo.task): bidirectional mirror to linked TodoItem ─
    // ADR 0001: same cascade pattern as task.toggle.
    // ADR 0005: anchors are independent fixpoints; no chain-wide clearing.
    if (node.kind === 'todo.task' && command === 'task.setSchedule' && result.state !== undefined) {
      const prevTask = node.state as TaskState;
      const schedArgs = args as { scheduledFor: string | null; scheduledDurationMin?: number };

      updateNode(nodeId, { state: result.state });
      // Mirror scheduledFor to the linked TodoItem if one exists.
      if (prevTask.todoItemId !== null && prevTask.parentTodoId) {
        const currentBoard = useBoardStore.getState().board;
        if (currentBoard) {
          const todoNode = currentBoard.nodes.find((n) => n.id === prevTask.parentTodoId);
          if (todoNode && todoNode.kind === 'todo') {
            const newTodoState = todoSetItemSchedule(todoNode.state as TodoState, {
              itemId: prevTask.todoItemId,
              scheduledFor: schedArgs.scheduledFor ?? null,
            });
            updateNode(todoNode.id, { state: newTodoState });
          }
        }
      }
      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      return;
    }

    // ── pomo.cancel / pomo.complete: Decision 22 §7 + F13 — credit seconds
    //    onto the active task ONLY on completion (not cancel — RESET means
    //    abandoned), bump pomoSessionsCompleted on completion only, and
    //    always clear currentSessionElapsedSec (no-double-count invariant).
    //
    //    User-facing rule (per Decision 22.3): RESET on the PomoNode discards
    //    the in-flight time. If the user wants to preserve elapsed mid-session
    //    they press PAUSE instead. Marking a task done while running still
    //    credits the time — that's handled by the task.toggle cascade above.
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
        if (u) void saveBoard(u);
        return;
      }
      updateNode(nodeId, { state: nextPomo });
      if (command === 'pomo.complete') {
        emit('pomo.complete', `pomo session ${nextPomo.sessionsCompleted} completed`);
      } else {
        emit('pomo.stop', `pomo session cancelled`, { severity: 'warn' });
      }

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
            // Only completed sessions credit elapsed. Cancel = abandoned.
            secondsAccumulated: justCompleted
              ? (ts.secondsAccumulated ?? 0) + elapsedSec
              : (ts.secondsAccumulated ?? 0),
            pomoSessionsCompleted: justCompleted
              ? (ts.pomoSessionsCompleted ?? 0) + 1
              : (ts.pomoSessionsCompleted ?? 0),
            // Always clear the checkpoint — the session is over either way.
            currentSessionElapsedSec: 0,
          };
          updateNode(taskNode.id, { state: patchedTask });
        }
      }

      const updated = useBoardStore.getState().board;
      if (updated) void saveBoard(updated);
      return;
    }

    // ── Generic per-command emits for commands handled via the simple
    //    applyCommand fall-through. Keeps log coverage broad without
    //    requiring an emit on every dedicated branch above.
    if (command === 'pomo.start' && node.kind === 'pomo' && result.state !== undefined) {
      const activeId = (result.state as PomoState).activeTaskId;
      emit('pomo.start', `pomo session started`, activeId ? { refId: activeId } : {});
    } else if (command === 'habit.toggleDay' && node.kind === 'habit') {
      const habitId = typeof args['id'] === 'string' ? args['id'] : '';
      emit('habit.checkin', `habit ${habitId.slice(0, 8)} toggled`, habitId ? { refId: habitId } : {});
    } else if (command === 'habit.markDone' && node.kind === 'habit') {
      const habitId = typeof args['id'] === 'string' ? args['id'] : '';
      emit('habit.checkin', `habit ${habitId.slice(0, 8)} marked done`, habitId ? { refId: habitId } : {});
    } else if (command === 'habit.add' && node.kind === 'habit') {
      emit('habit.created', `habit added on ${shortId(nodeId)}`);
    } else if (command === 'habit.remove' && node.kind === 'habit') {
      const habitId = typeof args['id'] === 'string' ? args['id'] : '';
      emit('habit.deleted', `habit ${habitId.slice(0, 8)} removed`, { severity: 'warn' });
      // Auto-clean any lane nodes that referenced this habit so the user
      // doesn't see the "habit removed — delete this lane" orphan card.
      if (habitId) removeAllLanesForHabit(habitId);
    } else if (command === 'frame.setSize' && node.kind === 'frame') {
      emit('frame.resized', `frame ${shortId(nodeId)} resized`, { refId: nodeId });
    }

    // ── All other commands ────────────────────────────────────────────────
    const patch: Partial<Node> = {};
    if (result.state !== undefined) patch.state = result.state;
    if (result.config !== undefined) patch.config = result.config;
    if (Object.keys(patch).length > 0) updateNode(nodeId, patch);

    const updatedBoard = useBoardStore.getState().board;
    if (updatedBoard) void saveBoard(updatedBoard);
  };
}
