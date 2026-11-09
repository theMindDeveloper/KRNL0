// Examples for a tour on an empty board. A tour that shows where to look
// (the Clock's edge, the recorded track, a card on the board) points at
// nothing when the user has not made anything yet. Before such a tour starts,
// the things it shows and the board lacks are added as clearly named
// examples ("Example: …"), and they always go when the tour ends, whatever
// the user picks for their own practice. They are added while the practice
// pause is on (tourPractice.ts), so the time log never sees them.

import type { Board, Node } from '../../shared/types';
import { useBoardStore } from './boardStore';
import { saveBoard } from './eventLog';
import { addPastSegment, addPlanAt, habitMotherCommand } from './scheduleActions';

import type { ExampleKind } from '../components/Tour/tours';
export type { ExampleKind };

export const EXAMPLE_PLAN = 'Example: Read chapter 3';
export const EXAMPLE_HABIT = 'Example: Walk';
export const EXAMPLE_EVENT = 'Example: Class';

interface Added { itemIds: string[]; taskIds: string[]; segIds: string[]; habitIds: string[] }
let added: Added | null = null;

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mother = (b: Board, kind: string): Node | undefined => b.nodes.find((n) => n.kind === kind && n.isMother);
type Item = { id: string; text: string; taskNodeId?: string | null; done?: boolean };
type HabitLite = { id: string; name: string; kind?: string };
type Seg = { id: string; startedAt?: string; endedAt?: string };
const itemsOf = (b: Board): Item[] => ((mother(b, 'todo')?.state as { items?: Item[] } | undefined)?.items ?? []);
const habitsOf = (b: Board): HabitLite[] => ((mother(b, 'habit')?.state as { habits?: HabitLite[] } | undefined)?.habits ?? []);
// Recorded time lives in the timer's history (spanEdit.ts pomoAddSegment).
const segsOf = (b: Board): Seg[] => ((b.nodes.find((n) => n.kind === 'pomo')?.state as { history?: Seg[] } | undefined)?.history ?? []);

/** What the board already has: a plan on today, time recorded today, a habit, a repeating event. */
export function missingExamples(board: Board, want: readonly ExampleKind[], now = new Date()): ExampleKind[] {
  const today = ymd(now);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const has: Record<ExampleKind, boolean> = {
    plan: board.nodes.some((n) => n.kind === 'todo.task' && String((n.state as { scheduledFor?: string }).scheduledFor ?? '').startsWith(today)),
    recorded: segsOf(board).some((s) => Date.parse(s.endedAt ?? '') > startOfDay),
    habit: habitsOf(board).some((h) => h.kind !== 'routine'),
    event: habitsOf(board).some((h) => h.kind === 'routine'),
  };
  return want.filter((k) => !has[k]);
}

/** Adds the examples a tour needs that the board lacks. Returns what was added. */
export async function addExamples(want: readonly ExampleKind[], easy: boolean, now = new Date()): Promise<ExampleKind[]> {
  const st = useBoardStore.getState();
  const b0 = st.board;
  if (!b0) return [];
  const need = missingExamples(b0, want, now);
  if (need.length === 0) return [];
  const before = { items: new Set(itemsOf(b0).map((i) => i.id)), habits: new Set(habitsOf(b0).map((h) => h.id)), segs: new Set(segsOf(b0).map((s) => s.id)) };
  const a: Added = added ?? { itemIds: [], taskIds: [], segIds: [], habitIds: [] };
  const today = ymd(now);
  // The plan: today, the next full hour (it shows on the Clock's edge and the Calendar).
  let planTask: string | null = null;
  if (need.includes('plan') || need.includes('recorded')) {
    const h = Math.min(21, now.getHours() + 1);
    if (need.includes('plan')) await addPlanAt(EXAMPLE_PLAN, today, `${String(h).padStart(2, '0')}:00`, 45);
    const item = itemsOf(useBoardStore.getState().board!).find((i) => !before.items.has(i.id) && i.text === EXAMPLE_PLAN);
    if (item) { a.itemIds.push(item.id); if (item.taskNodeId) { a.taskIds.push(item.taskNodeId); planTask = item.taskNodeId; } }
  }
  // Recorded time: 40 minutes that ended 10 minutes ago (inside today).
  if (need.includes('recorded')) {
    const end = now.getTime() - 10 * 60_000;
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const start = Math.max(dayStart + 60_000, end - 40 * 60_000);
    if (end - start >= 5 * 60_000) addPastSegment(start, end, easy ? null : planTask, easy ? 'Example' : '');
    const seg = segsOf(useBoardStore.getState().board!).find((s) => !before.segs.has(s.id));
    if (seg) a.segIds.push(seg.id);
  }
  if (need.includes('habit')) {
    await habitMotherCommand('habit.add', { name: EXAMPLE_HABIT, schedule: { kind: 'daily' } });
    const h = habitsOf(useBoardStore.getState().board!).find((x) => !before.habits.has(x.id) && x.name === EXAMPLE_HABIT);
    if (h) {
      a.habitIds.push(h.id);
      // A few days done this week, so the card shows a streak.
      for (let d = 1; d <= 3; d++) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
        await habitMotherCommand('habit.toggleDay', { id: h.id, date: ymd(day) });
      }
    }
  }
  if (need.includes('event')) {
    const dow = ((now.getDay() + 6) % 7) + 1;
    const next = ((dow + 1 - 1) % 7) + 1;
    await habitMotherCommand('habit.add', { name: EXAMPLE_EVENT, kind: 'routine', schedule: { kind: 'weekly', days: [next], timeOfDay: '17:00', durationMin: 90 } });
    const h = habitsOf(useBoardStore.getState().board!).find((x) => !before.habits.has(x.id) && x.name === EXAMPLE_EVENT);
    if (h) a.habitIds.push(h.id);
  }
  added = a;
  return need;
}

export function examplesActive(): boolean {
  return !!added && (added.itemIds.length + added.segIds.length + added.habitIds.length) > 0;
}

/** The board without the examples (and their cards). Pure, for tests. */
export function withoutExamples(board: Board, ex: Added): Board {
  const habitIds = new Set(ex.habitIds);
  const gone = new Set(ex.taskIds);
  for (const n of board.nodes) {
    if (n.kind === 'habit.lane' && habitIds.has(String((n.state as { habitId?: string } | null)?.habitId ?? ''))) gone.add(n.id);
  }
  const items = new Set(ex.itemIds);
  const segs = new Set(ex.segIds);
  const nodes = board.nodes.filter((n) => !gone.has(n.id)).map((n) => {
    const s = n.state as Record<string, unknown> | null;
    if (n.isMother && n.kind === 'todo' && Array.isArray(s?.items)) return { ...n, state: { ...s, items: (s!.items as Item[]).filter((i) => !items.has(i.id)) } };
    if (n.isMother && n.kind === 'habit' && Array.isArray(s?.habits)) return { ...n, state: { ...s, habits: (s!.habits as HabitLite[]).filter((h) => !habitIds.has(h.id)) } };
    if (n.kind === 'pomo' && Array.isArray(s?.history)) return { ...n, state: { ...s, history: (s!.history as Seg[]).filter((x) => !segs.has(x.id)) } };
    return n;
  });
  const edges = board.edges.filter((e) => !gone.has(e.from.nodeId) && !gone.has(e.to.nodeId));
  return { ...board, nodes, edges };
}

/** Takes the examples out (at the tour's end, before the practice question). */
export function removeExamples(): void {
  const ex = added;
  added = null;
  const b = useBoardStore.getState().board;
  if (!ex || !b) return;
  const next = withoutExamples(b, ex);
  useBoardStore.getState().setBoard(next);
  void saveBoard(next);
}
