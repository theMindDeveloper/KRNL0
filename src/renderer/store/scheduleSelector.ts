// ADR 0005 — Multi-anchor cascade scheduling selector.
//
// Single source of truth for "where does each task land on the wall clock?".
// Each anchor (task with scheduledFor set) is an independent fixpoint.
// The selector walks a chain's connected component and uses every anchor it
// encounters as the new cursor; gaps between anchors auto-derive from the
// previous unit's plannedMin. Predecessor tasks (before the first anchor in a
// component) are skipped.
//
// Supersedes the ADR 0003 "earliest anchor wins" model. Multiple anchors per
// chain are now correct by design, not a migration target.
//
// Decision 28 §4: the selector is now break-aware for focus tasks.
// - For kind === 'focus': cursor advance = effectiveMin (work + breaks),
//   so the next task starts after breaks complete.
//   scheduledDurationMin on a focus task is a WORK-TIME override; the total
//   block height = work-time + breaks derived from that work time.
// - For kind === 'event': cursor advance = plannedMin (no breaks).
//   scheduledDurationMin on an event task is a TOTAL-TIME override (no breaks).
//
// Memoized at module level on (board.nodes, board.edges, pomoConfig) by
// reference identity. Config edits create a new node array (immutable updates)
// so reference identity is sufficient and cheap.

import type { Board, Node } from '../../shared/types';
import type { TaskState } from '../components/nodes/TaskNode/types';
import type { TaskKind } from '../components/nodes/TaskNode/types';
import type { PomoConfig } from '../components/nodes/PomoNode/types';
import { defaultPomoConfig } from '../components/nodes/PomoNode/types';
import { buildChainIndex, walkChain, type WalkUnit } from './chainWalker';
import { breakdownPomoTime, type PomoBreakdown } from './pomoSchedule';

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * A single placed task with its break breakdown.
 *
 * `breakdown` semantics:
 *   - null when kind === 'event' (no pomo decomposition).
 *   - non-null when kind === 'focus'. If the task has only one session
 *     (plannedMin ≤ sessionMin), breakdown.breakMin === 0 and
 *     breakdown.segments has length 1 — renderers must not emit tail/sub-arc
 *     DOM when breakMin === 0.
 *
 * `scheduledDurationMin` override semantics:
 *   - Under kind === 'focus': work-time override. Effective block height =
 *     workMin + breakMin (total wall-clock consumption includes breaks).
 *   - Under kind === 'event': total-time override, no break expansion.
 *
 * Renderers (WeekView, ClockNode) consume `breakdown` directly — they MUST NOT
 * recompute breakdownPomoTime. This is enforced by code review, not types.
 */
export interface ScheduledTaskPlacement {
  taskId: string;
  /** ISO 8601 local datetime "YYYY-MM-DDTHH:MM" */
  startISO: string;
  /** startISO + effectiveMin (focus) or plannedMin/override (event). */
  endISO: string;
  /** The task whose scheduledFor produced this chain's placement. */
  anchorTaskId: string;
  parallelGroupId: string | null;
  /** ADR 0004 §4.2 — 0-based index of this branch within its parallel group.
   *  Null iff parallelGroupId is null. Stability guarantee: whatever order
   *  `chainWalker.walkChain` emits for `unit.branches` IS the canonical order
   *  for this index. (As of writing, that order is the unvisited-set order
   *  determined by `nextsOf(...)` traversal; treat it as opaque — the
   *  contract is "matches walkChain's branch enumeration," not a sort key.) */
  parallelBranchIndex: number | null;
  /** True iff this placement is the chain's anchor (taskId === anchorTaskId). */
  isAnchor: boolean;
  /** Mirror of task.kind for renderer convenience. */
  kind: TaskKind;
  /** Null iff kind === 'event'. Non-null for focus tasks (may have breakMin=0). */
  breakdown: PomoBreakdown | null;
}

export interface ScheduleResult {
  placements: ReadonlyMap<string, ScheduledTaskPlacement>;
  computedAt: number;
}

// ── Memoization ───────────────────────────────────────────────────────────────

let _cacheKey: { nodes: unknown; edges: unknown; pomoConfig: unknown } | null = null;
let _cache: ScheduleResult = { placements: new Map(), computedAt: 0 };

export function selectSchedule(board: Board | null): ScheduleResult {
  if (!board) return _cache;

  // Locate PomoNode for config (board invariant: at most one).
  const pomoNode = board.nodes.find((n) => n.kind === 'pomo');
  const pomoConfig: PomoConfig =
    (pomoNode?.config as PomoConfig | null | undefined) ?? defaultPomoConfig();

  if (
    _cacheKey !== null &&
    _cacheKey.nodes === board.nodes &&
    _cacheKey.edges === board.edges &&
    _cacheKey.pomoConfig === pomoConfig
  ) {
    return _cache;
  }
  _cacheKey = { nodes: board.nodes, edges: board.edges, pomoConfig };
  _cache = build(board, pomoConfig);
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

/**
 * Compute effective block minutes, cursor advance, and breakdown for a task placement.
 *
 * For kind==='event':
 *   - effectiveMin (endISO) = scheduledDurationMin override (if set on anchor) or plannedMin.
 *   - cursorAdvanceMin = plannedMin (cursor always advances by work time, not visual override).
 *     This preserves the ADR 0003 §3.7 rule: successor start uses plannedMin, not override.
 *   - breakdown = null.
 *
 * For kind==='focus':
 *   - effectiveMin = workMin + breakMin (from breakdownPomoTime).
 *   - cursorAdvanceMin = effectiveMin (next task starts after this task's breaks complete).
 *   - scheduledDurationMin is a WORK-TIME override; total block = work + breaks.
 *   - breakdown = the PomoBreakdown.
 */
function computeEffective(
  ts: TaskState,
  isAnchor: boolean,
  cfg: PomoConfig,
): { effectiveMin: number; cursorAdvanceMin: number; breakdown: PomoBreakdown | null } {
  const kind = ts.kind ?? 'focus';
  const plannedMin = clampPlanned(ts.plannedMin);

  if (kind === 'event') {
    // effectiveMin is used for endISO (visual block height).
    // cursorAdvanceMin is always plannedMin — successor starts after work time, not visual override.
    const effectiveMin = isAnchor
      ? clampPlanned(ts.scheduledDurationMin ?? plannedMin)
      : plannedMin;
    return { effectiveMin, cursorAdvanceMin: plannedMin, breakdown: null };
  }

  // kind === 'focus'
  // Work-time override: if scheduledDurationMin set on anchor, that is the
  // work budget; total block expands by adding breaks on top.
  const workBudget = isAnchor
    ? clampPlanned(ts.scheduledDurationMin ?? plannedMin)
    : plannedMin;

  const completed = ts.pomoSessionsCompleted ?? 0;
  const secondsAccumulated = ts.secondsAccumulated ?? 0;
  // remainingMin = workBudget minus already-accumulated work (in minutes).
  const remainingMin = Math.max(0, workBudget - Math.floor(secondsAccumulated / 60));
  const breakdown = breakdownPomoTime(remainingMin, completed, cfg);
  const effectiveMin = Math.max(1, breakdown.effectiveMin);

  // For focus tasks, cursor advances by effectiveMin (work + breaks).
  return { effectiveMin, cursorAdvanceMin: effectiveMin, breakdown };
}

function build(board: Board, cfg: PomoConfig): ScheduleResult {
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

  // For each todo that has ≥1 anchor, walk units once and emit placements
  // for every connected component that contains ≥1 anchored task.
  // ADR 0005: each anchor is an independent fixpoint — no "earliest wins."
  for (const [todoId, anchorIds] of todoIdToAnchors) {
    const scope = todoIdToTaskIds.get(todoId);
    if (!scope || scope.size === 0) continue;

    const units = walkChain(todoId, board.nodes, chainIndex);

    // Discover all distinct connected components that contain at least one
    // anchor. Deduplicate by sorted chainKey so we don't process the same
    // component twice when it has multiple anchors.
    const chainsSeen = new Set<string>();
    const componentByChainKey = new Map<string, Set<string>>();
    const anchorsByChainKey = new Map<string, string[]>();

    for (const anchorId of anchorIds) {
      const component = connectedComponent(anchorId, chainIndex, scope);
      const chainKey = [...component].sort().join('|') || anchorId;
      if (!chainsSeen.has(chainKey)) {
        chainsSeen.add(chainKey);
        componentByChainKey.set(chainKey, component);
        anchorsByChainKey.set(chainKey, []);
      }
      anchorsByChainKey.get(chainKey)!.push(anchorId);
    }

    // Process each component that has ≥1 anchor.
    for (const [chainKey, chainComponent] of componentByChainKey) {
      const _anchorsInComponent = anchorsByChainKey.get(chainKey)!;
      void _anchorsInComponent; // used implicitly via taskInfoById below

      // Walk units in order, maintaining cursor (ISO string or null) and
      // cursorAnchorId (the anchor that last pushed the cursor).
      // ADR 0005 §"Selector rules": predecessor tasks (before first anchor)
      // are skipped; each explicit anchor resets the cursor to scheduledFor.
      let cursor: string | null = null;
      let cursorAnchorId: string | null = null;

      for (const unit of units) {
        if (unit.kind === 'task') {
          // Only emit tasks in this component.
          if (!chainComponent.has(unit.taskId)) continue;
          const info = taskInfoById.get(unit.taskId);
          if (!info) continue;
          const ts = info.taskState;
          const isAnchor =
            typeof ts.scheduledFor === 'string' && ts.scheduledFor.length > 0;
          const taskKind: TaskKind = ts.kind ?? 'focus';

          if (isAnchor) {
            // Explicit anchor: reset cursor to scheduledFor.
            cursor = ts.scheduledFor as string;
            cursorAnchorId = unit.taskId;

            const { effectiveMin, cursorAdvanceMin, breakdown } = computeEffective(ts, true, cfg);
            placements.set(unit.taskId, {
              taskId: unit.taskId,
              startISO: cursor,
              endISO: addMinutesISO(cursor, effectiveMin),
              anchorTaskId: unit.taskId,
              parallelGroupId: null,
              parallelBranchIndex: null,
              isAnchor: true,
              kind: taskKind,
              breakdown,
            });
            // cursorAdvanceMin: for focus = effectiveMin (includes breaks),
            // for event = plannedMin (ADR 0003 §3.7 — cursor advances by work time only).
            cursor = addMinutesISO(cursor, cursorAdvanceMin);
          } else if (cursor !== null && cursorAnchorId !== null) {
            // Derived: emit at current cursor.
            const { effectiveMin, cursorAdvanceMin, breakdown } = computeEffective(ts, false, cfg);
            placements.set(unit.taskId, {
              taskId: unit.taskId,
              startISO: cursor,
              endISO: addMinutesISO(cursor, effectiveMin),
              anchorTaskId: cursorAnchorId,
              parallelGroupId: null,
              parallelBranchIndex: null,
              isAnchor: false,
              kind: taskKind,
              breakdown,
            });
            cursor = addMinutesISO(cursor, cursorAdvanceMin);
          }
          // else: predecessor of first anchor — skip.
        } else {
          // Parallel group — filter branches to those in this component.
          const branchesInComponent = unit.branches
            .map((b, idx) => ({ branch: b, idx }))
            .filter(({ branch }) => chainComponent.has(branch.taskId));

          if (branchesInComponent.length === 0) continue;

          // Group start: earliest scheduledFor among anchored branches in this
          // component, else cursor. (ADR 0005 §"Selector rules" step 4.)
          // If no anchored branch and cursor is null, skip the group.
          let groupStart: string | null = null;
          let groupAnchorId: string | null = null;

          for (const { branch } of branchesInComponent) {
            const ts = taskInfoById.get(branch.taskId)?.taskState;
            if (!ts) continue;
            if (typeof ts.scheduledFor === 'string' && ts.scheduledFor.length > 0) {
              if (groupStart === null || ts.scheduledFor < groupStart) {
                groupStart = ts.scheduledFor;
                groupAnchorId = branch.taskId;
              }
            }
          }

          if (groupStart === null) {
            // No anchored branches — fall back to cursor.
            if (cursor === null) continue; // skip entire group (pre-first-anchor)
            groupStart = cursor;
            groupAnchorId = cursorAnchorId; // carries over from last sequential anchor
          }

          // Emit each branch.
          let maxEffectiveMin = 0;
          for (const { branch, idx } of branchesInComponent) {
            const ts = taskInfoById.get(branch.taskId)?.taskState;
            const isBranchAnchor =
              ts !== undefined &&
              typeof ts.scheduledFor === 'string' &&
              ts.scheduledFor.length > 0;
            const branchStart = isBranchAnchor ? (ts!.scheduledFor as string) : groupStart!;
            const branchAnchorId = isBranchAnchor
              ? branch.taskId
              : (groupAnchorId ?? cursorAnchorId ?? branch.taskId);
            const taskKind: TaskKind = ts?.kind ?? 'focus';

            let effectiveMin: number;
            let cursorAdvanceMin: number;
            let breakdown: PomoBreakdown | null;
            if (ts) {
              const computed = computeEffective(ts, isBranchAnchor, cfg);
              effectiveMin = computed.effectiveMin;
              cursorAdvanceMin = computed.cursorAdvanceMin;
              breakdown = computed.breakdown;
            } else {
              // Fallback: no task state available.
              effectiveMin = clampPlanned(branch.plannedMin);
              cursorAdvanceMin = effectiveMin;
              breakdown = null;
            }

            placements.set(branch.taskId, {
              taskId: branch.taskId,
              startISO: branchStart,
              endISO: addMinutesISO(branchStart, effectiveMin),
              anchorTaskId: branchAnchorId,
              parallelGroupId: unit.groupId,
              parallelBranchIndex: idx,
              isAnchor: isBranchAnchor,
              kind: taskKind,
              breakdown,
            });
            if (cursorAdvanceMin > maxEffectiveMin) maxEffectiveMin = cursorAdvanceMin;
          }

          // Advance cursor by max(branch.cursorAdvanceMin) from groupStart.
          // cursorAnchorId after the group = anchor that determined groupStart.
          // (ADR 0005: if no anchored branch in group, cursorAnchorId carries over.)
          cursor = addMinutesISO(groupStart!, maxEffectiveMin);
          if (groupAnchorId !== null) cursorAnchorId = groupAnchorId;
        }
      }
    }
  }

  return { placements, computedAt: Date.now() };
}

// Re-export WalkUnit for callers that need the chain-walk shape directly.
export type { WalkUnit };
