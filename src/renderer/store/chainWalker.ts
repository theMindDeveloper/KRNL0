// ADR 0003 §2 + design-pattern 6.10 — "Shared pure-function helper extracted from selector".
//
// Pure-function chain-walking helpers extracted from timelineSelector.ts so the
// new scheduleSelector.ts can reuse the exact same fork/convergence semantics.
//
// This module emits no memoized values — it is a pure helper used BY selectors.
// Both timelineSelector and scheduleSelector import from here. The rule
// "no cross-import between selector modules" is preserved because this is not
// a selector. See ADR 0003 §2 + design-pattern 6.10 for the rationale.

import type { Edge, Node } from '../../shared/types';
import type { TaskState } from '../components/nodes/TaskNode/types';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ChainEntry {
  prevs: readonly string[];
  nexts: readonly string[];
}

// Discriminated walk unit — either a single sequential task, or a parallel group.
export type WalkUnit =
  | { kind: 'task'; taskId: string; plannedMin: number; done: boolean }
  | {
      kind: 'group';
      groupId: string;
      branches: Array<BranchEntry>;
      /** last task in the group (for break's afterTaskId — first branch's last task) */
      sentinelTaskId: string;
    };

export interface BranchEntry {
  taskId: string;
  plannedMin: number;
  done: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampPlanned(plannedMin: number | undefined): number {
  return Math.max(1, plannedMin ?? 25);
}

/**
 * Build a chain index from task.next edges.
 * Maps nodeId → { prevs, nexts } where prevs/nexts list connected nodes via
 * task.next edges only. Other edge events are ignored.
 */
export function buildChainIndex(edges: readonly Edge[]): Map<string, ChainEntry> {
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

/**
 * Walk the task chain for a single todo, producing an ordered list of WalkUnits.
 *
 * Roots: tasks with parentTodoId === todoId AND parentTaskId === null AND no
 * incoming task.next edge from another task in this todo set.
 *
 * Multi-root convergence: if multiple root tasks all point to the same shared
 * next target, they are treated as a parallel group before their shared successor.
 * Unconnected roots are concatenated in ascending sequenceNumber order.
 *
 * Fork (nexts.length > 1): emits a parallel group. Branches with a shared
 * successor (intersection of all branch nexts) resume sequentially at that
 * successor. Branches with no shared successor (non-rejoin fork) are walked
 * independently and appended sequentially — one unit per branch tail.
 *
 * Convergence (prevs.length > 1): the visited set ensures each node is emitted
 * at most once; second-visit is a no-op.
 *
 * Cycle defence: the visited set terminates any cycle.
 *
 * Subtasks (parentTaskId !== null) are never emitted as segments (rolled into
 * parent's plannedMin per Decision 24 Q1).
 */
export function walkChain(
  todoId: string,
  nodes: readonly Node[],
  chainIndex: Map<string, ChainEntry>,
): WalkUnit[] {
  // Build lookup maps for tasks in this todo
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
      return !entry.prevs.some((prevId) => allTodoTaskIds.has(prevId));
    })
    .sort((a, b) => {
      const aSeq = taskNodesMap.get(a)?.sequenceNumber ?? 0;
      const bSeq = taskNodesMap.get(b)?.sequenceNumber ?? 0;
      return aSeq - bSeq;
    });

  const units: WalkUnit[] = [];
  const visited = new Set<string>();

  function getBranchEntry(id: string): BranchEntry {
    const ts = taskNodesMap.get(id);
    return {
      taskId: id,
      plannedMin: ts ? clampPlanned(ts.plannedMin) : 1,
      done: ts?.done ?? false,
    };
  }

  function nextsOf(id: string): string[] {
    return (chainIndex.get(id)?.nexts ?? []).filter((nid) => allTodoTaskIds.has(nid));
  }

  /**
   * Walk a set of frontier IDs. If multiple IDs are provided they are treated as
   * members of an already-formed parallel group (their groupId is passed in).
   * Returns the set of IDs to continue walking from after this group resolves.
   *
   * Single-ID front: sequential step. Multi-ID front: parallel group step.
   */
  function walkFront(frontIds: string[], groupId: string | null): string[] {
    // Filter already-visited
    const unvisited = frontIds.filter((id) => !visited.has(id));
    if (unvisited.length === 0) return [];

    if (unvisited.length === 1) {
      const id = unvisited[0]!;
      const ts = taskNodesMap.get(id);

      if (!ts || ts.parentTaskId !== null) {
        // Subtask or unknown — mark visited, follow nexts
        visited.add(id);
        return nextsOf(id);
      }

      visited.add(id);
      units.push({
        kind: 'task',
        taskId: id,
        plannedMin: clampPlanned(ts.plannedMin),
        done: ts.done,
      });
      return nextsOf(id);
    }

    // Multiple unvisited IDs → parallel group
    const gid = groupId ?? `pg-${unvisited.join('-')}`;
    const branches: BranchEntry[] = unvisited
      .filter((id) => {
        // Only include root tasks (not subtasks) as branches
        const ts = taskNodesMap.get(id);
        return ts?.parentTaskId === null;
      })
      .map(getBranchEntry);

    for (const b of branches) {
      visited.add(b.taskId);
    }

    if (branches.length === 0) return [];

    const sentinelTaskId = branches[0]!.taskId;
    units.push({ kind: 'group', groupId: gid, branches, sentinelTaskId });

    // Find convergence: intersection of each branch's nexts
    const branchNextSets = branches.map((b) => new Set(nextsOf(b.taskId)));
    const [firstSet, ...restSets] = branchNextSets;
    const convergenceIds = firstSet
      ? [...firstSet].filter((nid) => restSets.every((s) => s.has(nid)))
      : [];

    if (convergenceIds.length > 0) {
      return convergenceIds;
    }

    // Non-rejoin fork: walk each branch's tail independently, appending units.
    // Branches that diverge without a shared successor are walked in sequence.
    for (const b of branches) {
      let front = nextsOf(b.taskId);
      while (front.length > 0) {
        front = walkFront(front, null);
      }
    }
    return [];
  }

  // Detect multi-root convergence: if multiple roots share a common next target,
  // emit them as a parallel group before that target.
  // Group roots by their shared next-set. Roots with identical nexts are parallel.
  const processedRoots = new Set<string>();

  function processRoots(ids: string[]): void {
    // Group by shared first-level nexts (roots that all point to the same targets)
    // Simple heuristic: roots whose nexts intersect with each other's nexts.
    // We group roots whose nexts form a non-empty shared set with at least one other root.
    const nextsPerRoot = new Map<string, Set<string>>();
    for (const id of ids) {
      nextsPerRoot.set(id, new Set(nextsOf(id)));
    }

    // Find groups of roots that all share at least one common next
    const grouped: Array<string[]> = [];
    const assignedToGroup = new Set<string>();

    for (const id of ids) {
      if (assignedToGroup.has(id)) continue;
      const myNexts = nextsPerRoot.get(id) ?? new Set<string>();
      if (myNexts.size === 0) {
        // Isolated root — sequential unit
        grouped.push([id]);
        assignedToGroup.add(id);
        continue;
      }
      // Find other unassigned roots that share at least one next with this root
      const peers = ids.filter(
        (other) =>
          other !== id &&
          !assignedToGroup.has(other) &&
          [...(nextsPerRoot.get(other) ?? new Set<string>())].some((n) => myNexts.has(n)),
      );
      if (peers.length === 0) {
        grouped.push([id]);
        assignedToGroup.add(id);
      } else {
        const group = [id, ...peers];
        for (const g of group) assignedToGroup.add(g);
        grouped.push(group);
      }
    }

    for (const group of grouped) {
      if (processedRoots.has(group[0]!)) continue;
      for (const id of group) processedRoots.add(id);

      let front: string[] = group;
      // For a multi-root group, use a stable groupId
      const gid = group.length > 1 ? `pg-roots-${group.join('-')}` : null;
      while (front.length > 0) {
        front = walkFront(front, gid);
      }
    }
  }

  processRoots(rootTaskIds);

  return units;
}
