// Finished task cards leave the canvas (docs/06-requirements/engagement.md F4–F6).
// Hiding is render-only: the task node, its Todo row, the completion ledger
// and analytics are untouched, so nothing is lost and a reopened task comes
// back. A chain or a parent with its subtasks leaves together, once every
// task in it is done.

import { create } from 'zustand';
import type { Board } from '../../shared/types';

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
 * (`parentTaskId`) and by edges between task cards (chains); a group leaves
 * only when all of it is done, timed from its last completion. A done task
 * without `completedAt` (legacy) counts as done long ago.
 */
export function finishedTaskIds(board: Pick<Board, 'nodes' | 'edges'> | null | undefined, policy: FinishedPolicy, nowMs: number): Set<string> {
  const out = new Set<string>();
  if (!board || policy === 'keep') return out;
  const tasks = board.nodes.filter((n) => n.kind === 'todo.task');
  if (tasks.length === 0) return out;
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
  for (const e of board.edges ?? []) join(e.from.nodeId, e.to.nodeId);

  const groups = new Map<string, { allDone: boolean; lastMs: number; members: string[] }>();
  for (const t of tasks) {
    const s = t.state as Loose;
    const g = groups.get(find(t.id)) ?? { allDone: true, lastMs: 0, members: [] };
    g.members.push(t.id);
    if (s['done'] !== true) g.allDone = false;
    else {
      const at = typeof s['completedAt'] === 'string' ? Date.parse(s['completedAt']) : NaN;
      if (Number.isFinite(at)) g.lastMs = Math.max(g.lastMs, at);
    }
    groups.set(find(t.id), g);
  }
  for (const g of groups.values()) {
    if (g.allDone && hasLeft(policy, g.lastMs, nowMs)) g.members.forEach((id) => out.add(id));
  }
  return out;
}

/** A coarse clock for re-checking: the local day, or 5-minute steps in "hour" mode. */
export function finishedClockKey(policy: FinishedPolicy, nowMs: number): string {
  if (policy === 'keep') return 'keep';
  if (policy === 'hour') return `h${Math.floor(nowMs / (5 * 60 * 1000))}`;
  return localYMD(nowMs);
}
