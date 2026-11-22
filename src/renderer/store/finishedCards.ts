// Finished task cards leave the canvas (docs/06-requirements/engagement.md F4–F6).
// Hiding is render-only: the task node, its Todo row, the completion ledger
// and analytics are untouched, so nothing is lost and a reopened task comes
// back. A chain or a parent with its subtasks leaves together, once every
// task in it is done.

import { create } from 'zustand';
import type { Board } from '../../shared/types';
import { droppedTaskIds } from '../../shared/droppedPlans';

export const FINISHED_POLICIES = ['overnight', 'hour', 'keep'] as const;
export type FinishedPolicy = (typeof FINISHED_POLICIES)[number];
export const isFinishedPolicy = (v: unknown): v is FinishedPolicy =>
  typeof v === 'string' && (FINISHED_POLICIES as readonly string[]).includes(v);

export const FINISHED_KEY = 'krnl0-finished-cards';
const HOUR_MS = 60 * 60 * 1000;

interface Stored { policy: FinishedPolicy; showFinished: boolean }
const DEFAULTS: Stored = { policy: 'overnight', showFinished: false };

export function parseFinished(raw: string | null): Stored {
  if (!raw) return { ...DEFAULTS };
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Stored, unknown>>;
    return {
      policy: isFinishedPolicy(v.policy) ? v.policy : DEFAULTS.policy,
      showFinished: typeof v.showFinished === 'boolean' ? v.showFinished : DEFAULTS.showFinished,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

interface FinishedStore extends Stored {
  setPolicy: (p: FinishedPolicy) => void;
  setShowFinished: (on: boolean) => void;
}

export const useFinishedCards = create<FinishedStore>((set, get) => {
  let initial = { ...DEFAULTS };
  try { initial = parseFinished(localStorage.getItem(FINISHED_KEY)); } catch { /* no storage */ }
  const save = (patch: Partial<Stored>) => {
    set(patch);
    const { policy, showFinished } = get();
    try { localStorage.setItem(FINISHED_KEY, JSON.stringify({ policy, showFinished })); } catch { /* no storage */ }
  };
  return {
    ...initial,
    setPolicy: (policy) => save({ policy }),
    setShowFinished: (showFinished) => save({ showFinished }),
  };
});

const localYMD = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Has a finished group (latest completion `doneMs`) left the board? */
export function hasLeft(policy: FinishedPolicy, doneMs: number, nowMs: number): boolean {
  if (policy === 'keep') return false;
  if (policy === 'hour') return nowMs - doneMs >= HOUR_MS;
  return localYMD(doneMs) < localYMD(nowMs);
}

type Loose = Record<string, unknown>;

/**
 * Ids of done task cards to hide now. Tasks are grouped by subtask links
 * (`parentTaskId`; connections between cards do not group them, Decision 63); a group leaves
 * only when all of it is done, timed from its last completion. A done task
 * without `completedAt` (legacy) counts as done long ago.
 */
export function finishedTaskIds(board: Pick<Board, 'nodes' | 'edges'> | null | undefined, policy: FinishedPolicy, nowMs: number): Set<string> {
  const out = new Set<string>();
  if (!board) return out;
  // task-node F22 — an archived done card leaves now, whatever its chain says.
  // F21 — so does a plan marked Won't do: it is closed, not open (Bring back
  // in the Todo or Ctrl+Z puts it back).
  const dropped = droppedTaskIds(board.nodes);
  for (const n of board.nodes) {
    if (n.kind !== 'todo.task') continue;
    const s = n.state as Loose;
    if (dropped.has(n.id) || (s['done'] === true && typeof s['archivedAt'] === 'string')) out.add(n.id);
  }
  if (policy === 'keep') return out;
  for (const g of finishedGroups(board)) {
    if (g.allDone && hasLeft(policy, g.lastMs, nowMs)) g.members.forEach((id) => out.add(id));
  }
  return out;
}

interface FinishedGroup { allDone: boolean; lastMs: number; members: string[]; open: string[] }

/** Task cards grouped by subtask links (a task and its steps leave together). */
function finishedGroups(board: Pick<Board, 'nodes' | 'edges'>): FinishedGroup[] {
  const tasks = board.nodes.filter((n) => n.kind === 'todo.task');
  if (tasks.length === 0) return [];
  const ids = new Set(tasks.map((t) => t.id));
  const parent = new Map<string, string>(tasks.map((t) => [t.id, t.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const join = (a: string, b: string) => { if (ids.has(a) && ids.has(b)) parent.set(find(a), find(b)); };
  for (const t of tasks) {
    const p = (t.state as Loose)['parentTaskId'];
    if (typeof p === 'string') join(t.id, p);
  }
  // Decision 63: connections are only drawn; they do not hold cards together.

  // A Won't-do plan is closed: it never holds its chain on the board.
  const dropped = droppedTaskIds(board.nodes);
  const groups = new Map<string, FinishedGroup>();
  for (const t of tasks) {
    const s = t.state as Loose;
    const g = groups.get(find(t.id)) ?? { allDone: true, lastMs: 0, members: [], open: [] };
    g.members.push(t.id);
    if (dropped.has(t.id)) { groups.set(find(t.id), g); continue; }
    if (s['done'] !== true) { g.allDone = false; g.open.push(t.id); }
    else {
      const at = typeof s['completedAt'] === 'string' ? Date.parse(s['completedAt']) : NaN;
      if (Number.isFinite(at)) g.lastMs = Math.max(g.lastMs, at);
    }
    groups.set(find(t.id), g);
  }
  return [...groups.values()];
}

/**
 * engagement.md F20 — done cards that would have left the board by now on
 * their own, but stay because their chain (or subtasks) is not all done.
 * Maps each such card to an open task of its group (the one holding it).
 */
export function waitingOnChain(board: Pick<Board, 'nodes' | 'edges'> | null | undefined, policy: FinishedPolicy, nowMs: number): Map<string, string> {
  const out = new Map<string, string>();
  if (!board || policy === 'keep') return out;
  const byId = new Map(board.nodes.map((n) => [n.id, n]));
  for (const g of finishedGroups(board)) {
    if (g.allDone || g.open.length === 0) continue;
    for (const id of g.members) {
      const s = byId.get(id)?.state as Loose | undefined;
      if (!s || s['done'] !== true || typeof s['archivedAt'] === 'string') continue;
      const at = typeof s['completedAt'] === 'string' ? Date.parse(s['completedAt']) : 0;
      if (hasLeft(policy, Number.isFinite(at) ? at : 0, nowMs)) out.set(id, g.open[0]!);
    }
  }
  return out;
}

/** A coarse clock for re-checking: the local day, or 5-minute steps in "hour" mode. */
export function finishedClockKey(policy: FinishedPolicy, nowMs: number): string {
  if (policy === 'keep') return 'keep';
  if (policy === 'hour') return `h${Math.floor(nowMs / (5 * 60 * 1000))}`;
  return localYMD(nowMs);
}
