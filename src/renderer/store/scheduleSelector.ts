// ADR 0003 §3 — Cascade scheduling selector.
//
// Single source of truth for "where does each task land on the wall clock?".
// Given a board, produces a Map<taskId, ScheduledTaskPlacement> by:
//   1. Finding chains (connected components of task.next edges within a todo).
//   2. For each chain, locating its anchor (a task with scheduledFor set).
//      Invariant (ADR 0003 §1): at most one anchor per chain. If a corrupt
//      board violates this, the earliest scheduledFor wins and a dev warn
//      fires.
//   3. Walking the todo via chainWalker.walkChain, truncating to the anchor's
//      WalkUnit and onward.
//   4. Computing startISO/endISO by accumulating plannedMin (breaks invisible).
//
// Memoized at module level on (board.nodes, board.edges) reference identity,
// same pattern as selectTimelines.

import type { Board, Node } from '../../shared/types';
import type { TaskState } from '../components/nodes/TaskNode/types';
import { buildChainIndex, walkChain, type WalkUnit } from './chainWalker';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ScheduledTaskPlacement {
  taskId: string;
  /** ISO 8601 local datetime "YYYY-MM-DDTHH:MM" */
  startISO: string;
  /** startISO + scheduledDurationMin (anchor only) or plannedMin (successors). */
  endISO: string;
  /** The task whose scheduledFor produced this chain's placement. */
  anchorTaskId: string;
  parallelGroupId: string | null;
  /** True iff this placement is the chain's anchor (taskId === anchorTaskId). */
  isAnchor: boolean;
}

export interface ScheduleResult {
  placements: ReadonlyMap<string, ScheduledTaskPlacement>;
  computedAt: number;
}

// ── Memoization ───────────────────────────────────────────────────────────────

let _cacheKey: { nodes: unknown; edges: unknown } | null = null;
let _cache: ScheduleResult = { placements: new Map(), computedAt: 0 };

export function selectSchedule(board: Board | null): ScheduleResult {
  if (!board) return _cache;
  if (
    _cacheKey !== null &&
    _cacheKey.nodes === board.nodes &&
    _cacheKey.edges === board.edges
  ) {
    return _cache;
  }
  _cacheKey = { nodes: board.nodes, edges: board.edges };
  _cache = build(board);
  return _cache;
}

/**
 * Convenience helper for calendar views: returns the subset of placements
 * whose [startISO, endISO) interval intersects [fromISO, toISO).
 *
 * fromISO inclusive, toISO exclusive. Memoization is on the underlying
 * selectSchedule only — the range filter itself is cheap.
 */
export function selectScheduledTasksForRange(
  board: Board | null,
  fromISO: string,
  toISO: string,
): readonly ScheduledTaskPlacement[] {
  const { placements } = selectSchedule(board);
  const out: ScheduledTaskPlacement[] = [];
  for (const p of placements.values()) {
    // Intersection: p.endISO > fromISO AND p.startISO < toISO.
    // ISO 8601 local-datetime strings are lexicographically orderable.
    if (p.endISO > fromISO && p.startISO < toISO) {
      out.push(p);
    }
  }
  return out;
}

// ── Internals ─────────────────────────────────────────────────────────────────

function clampPlanned(plannedMin: number | undefined): number {
  return Math.max(1, plannedMin ?? 25);
}

/**
 * Add `min` minutes to an ISO 8601 local datetime string ("YYYY-MM-DDTHH:MM"),
 * returning a string of the same shape. Uses local Date arithmetic.
 *
 * Robust to whatever shape `scheduledFor` was written in (the writer permits
 * "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS"); we re-emit as "YYYY-MM-DDTHH:MM"
 * for consistency with the writer's pattern in WeekView.
 */
function addMinutesISO(isoLocal: string, min: number): string {
  // Parse the ISO local string via Date (which interprets without 'Z' as local).
  const d = new Date(isoLocal);
  if (Number.isNaN(d.getTime())) return isoLocal;
  d.setMinutes(d.getMinutes() + min);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da}T${hh}:${mm}`;
}

/**
 * Build the set of task IDs reachable from `seed` via task.next edges
 * (treated as undirected for connectivity). Restricted to ids in `scope`.
 */
function connectedComponent(
  seed: string,
  chainIndex: Map<string, { prevs: readonly string[]; nexts: readonly string[] }>,
  scope: Set<string>,
): Set<string> {
  const out = new Set<string>();
  const stack = [seed];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    if (!scope.has(id)) continue;
    out.add(id);
    const entry = chainIndex.get(id);
    if (!entry) continue;
    for (const nxt of entry.nexts) if (!out.has(nxt) && scope.has(nxt)) stack.push(nxt);
    for (const prv of entry.prevs) if (!out.has(prv) && scope.has(prv)) stack.push(prv);
  }
  return out;
}

interface TaskInfo {
  taskState: TaskState;
  todoId: string;
}

function build(board: Board): ScheduleResult {
  const placements = new Map<string, ScheduledTaskPlacement>();

  const chainIndex = buildChainIndex(board.edges);

  // Index task nodes by id with their todo membership.
  const taskInfoById = new Map<string, TaskInfo>();
  // Group task ids by parentTodoId for chain scoping.
  const todoIdToTaskIds = new Map<string, Set<string>>();
  // Group anchored tasks by todo for the per-todo loop below.
  const todoIdToAnchors = new Map<string, string[]>();

  for (const n of board.nodes) {
    if (n.kind !== 'todo.task') continue;
    const ts = n.state as TaskState;
    // Subtasks (parentTaskId !== null) are never placed — walkChain already
    // omits them and we never anchor a chain to a subtask either.
    if (ts.parentTaskId !== null) continue;
    taskInfoById.set(n.id, { taskState: ts, todoId: ts.parentTodoId });
    if (!todoIdToTaskIds.has(ts.parentTodoId)) {
      todoIdToTaskIds.set(ts.parentTodoId, new Set());
    }
    todoIdToTaskIds.get(ts.parentTodoId)!.add(n.id);
    if (typeof ts.scheduledFor === 'string' && ts.scheduledFor.length > 0) {
      if (!todoIdToAnchors.has(ts.parentTodoId)) {
        todoIdToAnchors.set(ts.parentTodoId, []);
      }
      todoIdToAnchors.get(ts.parentTodoId)!.push(n.id);
    }
  }

  // For each todo, walk once and remember the unit ordering. Then for each
  // anchored chain in that todo, slice the walk from the anchor's unit
  // forward and emit placements.
  for (const [todoId, anchorIds] of todoIdToAnchors) {
    const scope = todoIdToTaskIds.get(todoId);
    if (!scope || scope.size === 0) continue;

    const units = walkChain(todoId, board.nodes, chainIndex);

    // Index: taskId → unit index (group members all map to the same unit index).
    const unitIndexByTaskId = new Map<string, number>();
    units.forEach((u, i) => {
      if (u.kind === 'task') {
        unitIndexByTaskId.set(u.taskId, i);
      } else {
        for (const b of u.branches) unitIndexByTaskId.set(b.taskId, i);
      }
    });

    // Group anchors by their chain (connected component within this todo).
    // Per ADR 0003 §1 invariant, at most one anchor per chain. Defence-in-depth:
    // if multiple, earliest wins; dev warn.
    const chainsSeen = new Set<string>(); // representative task id
    const anchorByChain = new Map<string, string>(); // chainKey → anchor taskId

    // Sort anchors so the "earliest" choice when colliding is deterministic.
    const anchorsSorted = [...anchorIds].sort((a, b) => {
      const ta = taskInfoById.get(a)?.taskState.scheduledFor ?? '';
      const tb = taskInfoById.get(b)?.taskState.scheduledFor ?? '';
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });

    for (const anchorId of anchorsSorted) {
      const component = connectedComponent(anchorId, chainIndex, scope);
      // chainKey: sorted concatenation of component ids (stable).
      const chainKey = [...component].sort().join('|') || anchorId;
      if (chainsSeen.has(chainKey)) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn(
            `[scheduleSelector] Multiple anchors in chain (todo=${todoId}). ` +
            `Earliest wins; ignoring anchor ${anchorId}. ` +
            `This violates ADR 0003 §1 — load-time migration should heal it.`,
          );
        }
        continue;
      }
      chainsSeen.add(chainKey);
      anchorByChain.set(chainKey, anchorId);
    }

    // For each (chainKey, anchor), slice the walk starting at the anchor's
    // unit, then accumulate startISO/endISO.
    for (const [, anchorTaskId] of anchorByChain) {
      const anchorInfo = taskInfoById.get(anchorTaskId);
      if (!anchorInfo) continue;
      const anchorISO = anchorInfo.taskState.scheduledFor;
      if (typeof anchorISO !== 'string' || anchorISO.length === 0) continue;

      const startIdx = unitIndexByTaskId.get(anchorTaskId);
      if (startIdx === undefined) continue;

      // Determine chain scope (only emit placements for tasks in this chain's
      // connected component). Predecessors of the anchor (units < startIdx)
      // are dropped by construction; this scope check additionally prevents
      // bleeding into a different chain within the same todo.
      const chainComponent = connectedComponent(anchorTaskId, chainIndex, scope);

      let cursorMin = 0;
      for (let i = startIdx; i < units.length; i++) {
        const unit = units[i]!;
        if (unit.kind === 'task') {
          if (!chainComponent.has(unit.taskId)) {
            // Different chain within the same todo — stop emitting for this anchor.
            break;
          }
          const isAnchor = unit.taskId === anchorTaskId;
          // ADR 0003 §3.7 — duration override applies only on the anchor's
          // own block; successors use their own plannedMin.
          const ts = taskInfoById.get(unit.taskId)?.taskState;
          const durMin = isAnchor
            ? clampPlanned(ts?.scheduledDurationMin ?? ts?.plannedMin)
            : unit.plannedMin;
          const startISO = addMinutesISO(anchorISO, cursorMin);
          const endISO = addMinutesISO(anchorISO, cursorMin + durMin);
          placements.set(unit.taskId, {
            taskId: unit.taskId,
            startISO,
            endISO,
            anchorTaskId,
            parallelGroupId: null,
            isAnchor,
          });
          cursorMin += unit.plannedMin;
        } else {
          // Parallel group — all branches share startISO. Group cumulative
          // cost = max(branch.plannedMin) (ADR 0003 §3.5).
          // Only emit branches that belong to this chain's component.
          const groupStartISO = addMinutesISO(anchorISO, cursorMin);
          for (const branch of unit.branches) {
            if (!chainComponent.has(branch.taskId)) continue;
            const isAnchor = branch.taskId === anchorTaskId;
            const ts = taskInfoById.get(branch.taskId)?.taskState;
            const durMin = isAnchor
              ? clampPlanned(ts?.scheduledDurationMin ?? ts?.plannedMin)
              : branch.plannedMin;
            const endISO = addMinutesISO(anchorISO, cursorMin + durMin);
            placements.set(branch.taskId, {
              taskId: branch.taskId,
              startISO: groupStartISO,
              endISO,
              anchorTaskId,
              parallelGroupId: unit.groupId,
              isAnchor,
            });
          }
          cursorMin += Math.max(...unit.branches.map((b) => b.plannedMin));
        }
        // Note: breaks are invisible to the calendar (ADR 0003 §3.6) — we
        // already skip them because walkChain emits task/group units only;
        // break segments live in timelineSelector's buildAll, not here.
      }
    }
  }

  return { placements, computedAt: Date.now() };
}

// Re-export WalkUnit for callers that need the chain-walk shape directly.
export type { WalkUnit };
