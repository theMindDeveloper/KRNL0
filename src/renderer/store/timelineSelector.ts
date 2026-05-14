// Decision 24 — Unified Task Timeline Selector
// Single source of truth for "linked todo's plan as time."
// Pure function, no side effects, no React hooks.
// Memoized via reference identity on (nodes, edges, pomoConfig) — same pattern
// as _lastEdges / selectTaskChain in boardStore.ts.

import type { Board, Edge, Node } from '../../shared/types';
import type { TaskState } from '../components/nodes/TaskNode/types';
import type { PomoConfig } from '../components/nodes/PomoNode/types';
import { defaultPomoConfig } from '../components/nodes/PomoNode/types';

// ── Public types ──────────────────────────────────────────────────────────────

export type ColorToken = 'rose' | 'sky' | 'mint' | 'amber' | 'violet';

const COLORS: readonly ColorToken[] = ['rose', 'sky', 'mint', 'amber', 'violet'];

export type TimelineSegment =
  | {
      kind: 'task';
      taskId: string;
      startMin: number;
      endMin: number;
      colorToken: ColorToken;
      done: boolean;
      parallelGroupId: string | null;
    }
  | {
      kind: 'break';
      breakId: string;
      startMin: number;
      endMin: number;
      breakKind: 'short' | 'long';
      afterTaskId: string;
    };

export interface ParallelGroup {
  groupId: string;
  taskIds: readonly string[];
  startMin: number;
  endMin: number;
}

export interface Timeline {
  todoId: string;
  segments: readonly TimelineSegment[];
  parallelGroups: ReadonlyMap<string, ParallelGroup>;
  totalMin: number;
  pomoSourceNodeId: string | null;
  /** Date.now() at computation time — for debug only, NOT a memo key. */
  computedAt: number;
}

// ── Module-level memo ─────────────────────────────────────────────────────────
// Reference identity on (nodes, edges, cfg). Zustand's set(...) always
// replaces the nodes/edges array reference, so reference-identity is a
// sufficient invalidation key with zero bookkeeping.

let _cacheKey: { nodes: unknown; edges: unknown; cfg: unknown } | null = null;
let _cache: ReadonlyMap<string, Timeline> = new Map();

export function selectTimelines(board: Board | null): ReadonlyMap<string, Timeline> {
  if (!board) return _cache; // last good cache; safe (null board ⇒ no consumers)
  const pomo = board.nodes.find((n) => n.kind === 'pomo') ?? null;
  const cfg = (pomo?.config as PomoConfig | null) ?? null;
  if (
    _cacheKey !== null &&
    _cacheKey.nodes === board.nodes &&
    _cacheKey.edges === board.edges &&
    _cacheKey.cfg === cfg
  ) {
    return _cache;
  }
  _cacheKey = { nodes: board.nodes, edges: board.edges, cfg };
  _cache = buildAll(board.nodes, board.edges, cfg ?? defaultPomoConfig(), pomo?.id ?? null);
  return _cache;
}

export function selectTimeline(board: Board | null, todoId: string): Timeline | null {
  return selectTimelines(board).get(todoId) ?? null;
}

// ── Internals ─────────────────────────────────────────────────────────────────

function clampPlanned(plannedMin: number | undefined): number {
  return Math.max(1, plannedMin ?? 25);
}

// Chain index: for task.next edges only. Maps nodeId → { prevs, nexts }.
// This is a local copy of the buildChainIndex structure from boardStore.ts,
// adapted to the Timeline's needs. Kept independent (no cross-import between
// modules per hard rule #2).
interface ChainEntry {
  prevs: readonly string[];
  nexts: readonly string[];
}

function buildChainIndex(edges: readonly Edge[]): Map<string, ChainEntry> {
  const prevsMap = new Map<string, string[]>();
  const nextsMap = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from.event !== 'task.next') continue;
    const fromId = e.from.nodeId;
    const toId = e.to.nodeId;
    if (!nextsMap.has(fromId)) nextsMap.set(fromId, []);
    nextsMap.get(fromId)!.push(toId);
    if (!prevsMap.has(toId)) prevsMap.set(toId, []);
    prevsMap.get(toId)!.push(fromId);
  }
  const allIds = new Set<string>([...prevsMap.keys(), ...nextsMap.keys()]);
  const map = new Map<string, ChainEntry>();
  for (const id of allIds) {
    map.set(id, {
      prevs: prevsMap.get(id) ?? [],
      nexts: nextsMap.get(id) ?? [],
    });
  }
  return map;
}

// Discriminated walk unit — either a single sequential task, or a parallel group.
type WalkUnit =
  | { kind: 'task'; taskId: string; plannedMin: number; done: boolean }
  | {
      kind: 'group';
      groupId: string;
      branches: Array<{ taskId: string; plannedMin: number; done: boolean }>;
      /** last task in the group (for break's afterTaskId — first branch's last task) */
      sentinelTaskId: string;
    };

/**
 * Walk the task chain for a single todo, producing an ordered list of WalkUnits.
 *
 * Roots: tasks with parentTodoId === todoId AND parentTaskId === null AND no
 * incoming task.next edge from another task in this todo set.
 *
 * Multiple disconnected roots (no inter-root task.next edges) are concatenated
 * in ascending sequenceNumber order. Each root spawns its own linear walk; if
 * two roots share task.next targets, the visited-set ensures no double-counting.
 *
 * Convergence (prevs.length > 1): a node is emitted the first time it is
 * encountered; the second visit is a no-op via the visited set.
 *
 * Cycle defence: the visited set terminates any cycle.
 */
function walkChain(
  todoId: string,
  nodes: readonly Node[],
  chainIndex: Map<string, ChainEntry>,
): WalkUnit[] {
  // Build set of all task node ids belonging to this todo (root and subtask).
  const allTodoTaskIds = new Set<string>();
  const taskNodesMap = new Map<string, TaskState>();

  for (const n of nodes) {
    if (n.kind !== 'todo.task') continue;
    const ts = n.state as TaskState;
    if (ts.parentTodoId !== todoId) continue;
    allTodoTaskIds.add(n.id);
    taskNodesMap.set(n.id, ts);
  }

  // Root tasks: parentTaskId === null AND no incoming task.next from within this todo
  const rootTaskIds = [...allTodoTaskIds]
    .filter((id) => {
      const ts = taskNodesMap.get(id);
      if (!ts || ts.parentTaskId !== null) return false; // skip subtasks
      const entry = chainIndex.get(id);
      if (!entry) return true; // no edges → root
      // Root if none of its prevs are also in this todo's task set
      return !entry.prevs.some((prevId) => allTodoTaskIds.has(prevId));
    })
    .sort((a, b) => {
      const aSeq = taskNodesMap.get(a)?.sequenceNumber ?? 0;
      const bSeq = taskNodesMap.get(b)?.sequenceNumber ?? 0;
      return aSeq - bSeq;
    });

  const units: WalkUnit[] = [];
  const visited = new Set<string>();

  // BFS-style walk from a given task id
  function walk(startId: string): void {
    let currentIds: string[] = [startId];

    while (currentIds.length > 0) {
      // Filter already-visited (handles convergence)
      currentIds = currentIds.filter((id) => !visited.has(id));
      if (currentIds.length === 0) break;

      if (currentIds.length === 1) {
        // Sequential step
        const id = currentIds[0]!;
        const ts = taskNodesMap.get(id);
        if (!ts || ts.parentTaskId !== null) {
          // Subtask or unknown — skip, do not emit, but check nexts
          visited.add(id);
          const entry = chainIndex.get(id);
          currentIds = (entry?.nexts ?? []).filter((nid) => allTodoTaskIds.has(nid));
          continue;
        }
        visited.add(id);
        units.push({
          kind: 'task',
          taskId: id,
          plannedMin: clampPlanned(ts.plannedMin),
          done: ts.done,
        });
        const entry = chainIndex.get(id);
        const nexts = (entry?.nexts ?? []).filter((nid) => allTodoTaskIds.has(nid));
        if (nexts.length === 0) {
          break;
        } else if (nexts.length === 1) {
          currentIds = nexts;
        } else {
          // Fork — parallel group
          const groupId = `pg-${id}`;
          type BranchEntry = { taskId: string; plannedMin: number; done: boolean };
          const branches: BranchEntry[] = nexts
            .filter((nid) => !visited.has(nid))
            .map((nid) => {
              const branchTs = taskNodesMap.get(nid);
              return {
                taskId: nid,
                plannedMin: branchTs ? clampPlanned(branchTs.plannedMin) : 1,
                done: branchTs?.done ?? false,
              };
            });

          // Mark all branch members visited
          for (const b of branches) {
            visited.add(b.taskId);
          }

          const sentinelTaskId = branches[0]?.taskId ?? id;

          units.push({
            kind: 'group',
            groupId,
            branches,
            sentinelTaskId,
          });

          // Find convergence: nodes that ALL branches flow into (intersection of nexts)
          const branchNextSets = branches.map((b) => {
            const bEntry = chainIndex.get(b.taskId);
            return new Set((bEntry?.nexts ?? []).filter((nid) => allTodoTaskIds.has(nid)));
          });

          if (branchNextSets.length === 0) {
            break;
          }

          // Find shared targets (convergence points) — present in all branch next-sets
          const [firstSet, ...restSets] = branchNextSets;
          const convergenceIds = firstSet
            ? [...firstSet].filter((nid) => restSets.every((s) => s.has(nid)))
            : [];

          if (convergenceIds.length === 0) {
            break;
          }

          currentIds = convergenceIds;
        }
      } else {
        // Multiple parallel starts (unusual — means a convergence was found
        // but there are multiple convergence targets, or the caller passed
        // multiple disconnected roots). Walk each independently.
        for (const id of currentIds) {
          walk(id);
        }
        break;
      }
    }
  }

  for (const rootId of rootTaskIds) {
    walk(rootId);
  }

  return units;
}

function buildAll(
  nodes: readonly Node[],
  edges: readonly Edge[],
  cfg: PomoConfig,
  pomoSourceNodeId: string | null,
): ReadonlyMap<string, Timeline> {
  const chainIndex = buildChainIndex(edges);

  // Find all todo node ids
  const todoIds = nodes
    .filter((n) => n.kind === 'todo')
    .map((n) => n.id);

  const result = new Map<string, Timeline>();

  for (const todoId of todoIds) {
    const units = walkChain(todoId, nodes, chainIndex);
    const segments: TimelineSegment[] = [];
    const parallelGroups = new Map<string, ParallelGroup>();

    let cursor = 0;
    let breakCounter = 0;
    let colorIndex = 0;

    for (const unit of units) {
      if (unit.kind === 'task') {
        const start = cursor;
        const end = cursor + unit.plannedMin;
        const colorToken = COLORS[colorIndex % COLORS.length] ?? 'rose';
        colorIndex += 1;

        segments.push({
          kind: 'task',
          taskId: unit.taskId,
          startMin: start,
          endMin: end,
          colorToken,
          done: unit.done,
          parallelGroupId: null,
        });

        cursor = end;
      } else {
        // Parallel group
        const groupStart = cursor;
        const groupEnd =
          groupStart + Math.max(...unit.branches.map((b) => b.plannedMin));

        const groupTaskIds: string[] = [];
        for (const branch of unit.branches) {
          const colorToken = COLORS[colorIndex % COLORS.length] ?? 'rose';
          colorIndex += 1;

          segments.push({
            kind: 'task',
            taskId: branch.taskId,
            startMin: groupStart,
            endMin: groupStart + branch.plannedMin,
            colorToken,
            done: branch.done,
            parallelGroupId: unit.groupId,
          });

          groupTaskIds.push(branch.taskId);
        }

        parallelGroups.set(unit.groupId, {
          groupId: unit.groupId,
          taskIds: groupTaskIds,
          startMin: groupStart,
          endMin: groupEnd,
        });

        cursor = groupEnd;
      }

      // Insert break after each unit (task or group = 1 counter unit).
      // Q5: (counter + 1) % longBreakEvery === 0 → long, else short.
      // Note: selector emits a trailing break after the last unit; ClockNode
      // strips it at render time (see Decision 24 Q5). Calendar (v2) may keep it.
      breakCounter += 1;
      const isLong = breakCounter % cfg.longBreakEvery === 0;
      const breakLen = isLong ? cfg.longBreakMin : cfg.shortBreakMin;

      const afterTaskId =
        unit.kind === 'task' ? unit.taskId : unit.sentinelTaskId;

      segments.push({
        kind: 'break',
        breakId: `break-${afterTaskId}`,
        startMin: cursor,
        endMin: cursor + breakLen,
        breakKind: isLong ? 'long' : 'short',
        afterTaskId,
      });

      cursor += breakLen;
    }

    result.set(todoId, {
      todoId,
      segments,
      parallelGroups,
      totalMin: cursor,
      pomoSourceNodeId,
      computedAt: Date.now(),
    });
  }

  return result;
}
