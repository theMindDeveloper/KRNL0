// Practice during a guided tour. A tour that asks the user to do things
// (add a plan, record time, tick a habit) must not leave practice data in
// their board, their Analytics or the time log:
//
//   beginPractice()   at the start: a snapshot of the board, and the time log
//                     is paused (nothing the tour makes is logged).
//   practiceSummary() at the end: what the tour made, in words.
//   removePractice()  "Remove them": the plans, habits, recorded time, ticks
//                     and completions made during the tour are taken out —
//                     the Todo, Habits and timer go back to how they were.
//   keepPractice()    "Keep them": they stay and are logged now, as one change
//                     from the snapshot, so Analytics counts them like any other.

import type { Board, Node } from '../../shared/types';
import { useBoardStore } from './boardStore';
import { saveBoard } from './eventLog';
import { setPracticePause } from './timeLogPause';
import { logTime } from './timeLog';
import { timeLogEntriesFromBoards } from '../../shared/timelog';

let snapshot: Board | null = null;

/** Kinds made during a tour that go when the practice is removed. */
const MADE_KINDS = new Set(['todo.task', 'habit.day', 'pomo.session']);
/** Mother windows whose state goes back to the snapshot. */
const RESTORED_KINDS = new Set(['todo', 'habit', 'pomo']);

export function beginPractice(): void {
  const b = useBoardStore.getState().board;
  snapshot = b ? structuredClone(b) : null;
  setPracticePause(!!snapshot);
}

export function practiceActive(): boolean {
  return snapshot !== null;
}

type Item = { id: string; text: string; done?: boolean };
type HabitLite = { id: string; name: string; kind?: string; log?: string[] };
type PomoLite = { status?: string; history?: Array<{ id: string; durationMin?: number }> };

const mother = (b: Board, kind: string): Node | undefined => b.nodes.find((n) => n.kind === kind && n.isMother);
const itemsOf = (b: Board): Item[] => ((mother(b, 'todo')?.state as { items?: Item[] } | undefined)?.items ?? []);
const habitsOf = (b: Board): HabitLite[] => ((mother(b, 'habit')?.state as { habits?: HabitLite[] } | undefined)?.habits ?? []);
const pomoOf = (b: Board): PomoLite => (b.nodes.find((n) => n.kind === 'pomo')?.state as PomoLite | undefined) ?? {};

export interface PracticeSummary {
  /** One line per kind of thing, e.g. "2 plans: Essay, Laundry". Empty = nothing made. */
  lines: string[];
}

const list = (names: string[]): string => {
  const shown = names.slice(0, 3).map((n) => `"${n}"`).join(', ');
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
};
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What the tour made since `beginPractice`, in words. */
export function practiceSummary(now: Board | null = useBoardStore.getState().board): PracticeSummary {
  if (!snapshot || !now) return { lines: [] };
  const lines: string[] = [];
  const beforeItems = new Map(itemsOf(snapshot).map((i) => [i.id, i]));
  const newItems = itemsOf(now).filter((i) => !beforeItems.has(i.id));
  if (newItems.length) lines.push(`${plural(newItems.length, 'plan', 'plans')}: ${list(newItems.map((i) => i.text))}`);
  const ticked = itemsOf(now).filter((i) => i.done && beforeItems.has(i.id) && !beforeItems.get(i.id)!.done).length;
  if (ticked) lines.push(`${plural(ticked, 'plan', 'plans')} ticked done`);

  const beforeHabits = new Map(habitsOf(snapshot).map((h) => [h.id, h]));
  const newHabits = habitsOf(now).filter((h) => !beforeHabits.has(h.id));
  const habitsMade = newHabits.filter((h) => h.kind !== 'routine');
  const eventsMade = newHabits.filter((h) => h.kind === 'routine');
  if (habitsMade.length) lines.push(`${plural(habitsMade.length, 'habit', 'habits')}: ${list(habitsMade.map((h) => h.name))}`);
  if (eventsMade.length) lines.push(`${plural(eventsMade.length, 'repeating event', 'repeating events')}: ${list(eventsMade.map((h) => h.name))}`);
  const ticks = habitsOf(now).filter((h) => beforeHabits.has(h.id))
    .reduce((n, h) => n + Math.max(0, (h.log?.length ?? 0) - (beforeHabits.get(h.id)!.log?.length ?? 0)), 0);
  if (ticks) lines.push(`${plural(ticks, 'habit tick', 'habit ticks')}`);

  const beforeRecs = new Set((pomoOf(snapshot).history ?? []).map((r) => r.id));
  const newRecs = (pomoOf(now).history ?? []).filter((r) => !beforeRecs.has(r.id));
  const mins = newRecs.reduce((n, r) => n + (r.durationMin ?? 0), 0);
  if (newRecs.length) lines.push(`${mins < 1 ? 'under a minute' : `${mins} min`} of recorded time`);
  const st = pomoOf(now).status;
  if (st && st !== 'idle' && st !== 'done' && st !== pomoOf(snapshot).status) lines.push('the timer that is still running');

  // Anything else that changed in those windows (a deadline, a reminder, a rest day…).
  if (lines.length === 0) {
    const changed = [...RESTORED_KINDS].some((k) => JSON.stringify(mother(now, k)?.state ?? null) !== JSON.stringify(mother(snapshot!, k)?.state ?? null))
      || now.nodes.some((n) => n.kind === 'todo.task' && !snapshot!.nodes.some((o) => o.id === n.id));
    if (changed) lines.push('a few practice changes (a deadline, a reminder, a rest day…)');
  }
  return { lines };
}

/** "Remove them": back to how the Todo, Habits and timer were before the tour. */
export function removePractice(): void {
  const before = snapshot;
  const now = useBoardStore.getState().board;
  snapshot = null;
  if (!before || !now) { setPracticePause(false); return; }
  const beforeById = new Map(before.nodes.map((n) => [n.id, n]));
  const gone = new Set(now.nodes.filter((n) => MADE_KINDS.has(n.kind) && !beforeById.has(n.id)).map((n) => n.id));
  const nodes = now.nodes
    .filter((n) => !gone.has(n.id))
    .map((n) => {
      const was = beforeById.get(n.id);
      if (!was) return n;
      // Mother windows and the tasks that already existed get their old state
      // back (a practice tick, a practice schedule…); position and size stay.
      if (RESTORED_KINDS.has(n.kind) || n.kind === 'todo.task') return { ...n, state: structuredClone(was.state) };
      return n;
    });
  const edges = now.edges.filter((e) => !gone.has(e.from.nodeId) && !gone.has(e.to.nodeId));
  const next: Board = { ...now, nodes, edges };
  if (before.completions) next.completions = structuredClone(before.completions);
  else delete next.completions;
  // setBoard adopts the board without logging it, and clears undo so the
  // practice can't be brought back by Ctrl+Z.
  useBoardStore.getState().setBoard(next);
  setPracticePause(false);
  void saveBoard(next);
}

/** "Keep them": they stay, and are logged now as one change from the snapshot. */
export function keepPractice(): void {
  const before = snapshot;
  const now = useBoardStore.getState().board;
  snapshot = null;
  setPracticePause(false);
  if (!before || !now) return;
  try {
    const entries = timeLogEntriesFromBoards(before, now);
    if (entries.length > 0) logTime(entries);
  } catch (err) {
    console.warn('[tour] practice not logged:', err instanceof Error ? err.message : err);
  }
}
