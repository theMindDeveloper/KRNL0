// Decision 64 P2 — the board's side of two-way sync: its events and planned
// tasks as sync items, and the calendar's changes carried onto the board.
// Tasks change through the `krnl task` commands' own functions (they keep the
// Todo row in step); events change on the Habits window's state, as `krnl event`.

import type { Board } from '../../shared/types';
import { exportData, applyImport } from '../../sys/commands/calLinks';
import { taskEdit, taskSchedule, taskUnschedule } from '../../sys/commands/task';
import { habitRemove } from '../../renderer/components/nodes/HabitNode/commands';
import type { Habit, HabitSchedule, HabitState, IsoDow } from '../../renderer/components/nodes/HabitNode/types';
import type { LocalItem, LocalOp, MirrorItem } from '../../shared/calsync/mirror';
import { eventTitleAndPlaceOf } from '../../renderer/components/nodes/CalendarNode/eventText';

function isoDow(date: string): IsoDow {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (js === 0 ? 7 : js) as IsoDow;
}

/** Everything of the board that goes to the KRNL0 calendar: events (once or repeating) and planned tasks. */
export function localItems(board: Board): LocalItem[] {
  const { events, tasks } = exportData(board);
  const out: LocalItem[] = events.map((e) => ({ key: `e:${e.id}`, kind: 'event', refId: e.id, item: { ...e, uid: e.uid ?? `${e.id}@krnl0` } }));
  for (const t of tasks) {
    const date = t.start.slice(0, 10);
    const lengthMin = Math.min(720, Math.max(5, Math.round((Date.parse(`${t.end}:00`) - Date.parse(`${t.start}:00`)) / 60_000) || 30));
    out.push({
      key: `t:${t.id}`, kind: 'task', refId: t.id,
      item: { id: t.id, uid: t.uid ?? `${t.id}@krnl0`, name: t.title, repeat: { kind: 'weekly', days: [isoDow(date)] }, at: t.start.slice(11, 16), lengthMin, startsOn: date, endsOn: date, skips: [], moved: [] },
    });
  }
  return out;
}

const once = (it: MirrorItem) => !!it.endsOn && it.endsOn === it.startsOn;

function scheduleOf(it: MirrorItem): HabitSchedule {
  if (once(it)) return { kind: 'weekly', days: [isoDow(it.startsOn)], timeOfDay: it.at, durationMin: it.lengthMin };
  if (it.repeat.kind === 'daily') return { kind: 'daily', timeOfDay: it.at, durationMin: it.lengthMin };
  if (it.repeat.kind === 'weekdays') return { kind: 'weekdays', timeOfDay: it.at, durationMin: it.lengthMin };
  return { kind: 'weekly', days: [...it.repeat.days].sort() as IsoDow[], timeOfDay: it.at, durationMin: it.lengthMin };
}

/** One event as the calendar now has it (keeps its colour, icon, reminder, history). */
function eventFrom(h: Habit, it: MirrorItem): Habit {
  // The title as the calendar has it; a place written in the old name ("Talk – Room 4") moves to `place`.
  const tp = eventTitleAndPlaceOf(h);
  const name = it.name.trim() && it.name.trim() !== tp.title ? it.name.trim() : tp.title !== h.name.trim() ? tp.title : h.name;
  const next: Habit = { ...h, name, schedule: scheduleOf(it), startsOn: it.startsOn };
  if (tp.title !== h.name.trim() && tp.place && next.place === undefined) next.place = tp.place;
  if (it.endsOn) next.endsOn = it.endsOn; else delete next.endsOn;
  const exceptions = [
    ...it.skips.map((date) => ({ date, skip: true as const })),
    ...it.moved.filter((m) => !it.skips.includes(m.date)).map((m) => ({ date: m.date, at: m.at })),
  ];
  if (exceptions.length) next.exceptions = exceptions; else delete next.exceptions;
  // The place is the event's own field: the note (the user's own words) is never touched.
  const cur = eventTitleAndPlaceOf(h).place;
  if ((it.place?.trim() || null) !== cur) next.place = it.place?.trim() ?? '';
  return next;
}

/** Carry the event changes onto the Habits window's state (pure). */
export function applyEventOps(state: HabitState, ops: readonly LocalOp[]): HabitState {
  let st = state;
  for (const op of ops) {
    if (op.op === 'deleteEvent') st = habitRemove(st, { id: op.habitId });
    else if (op.op === 'updateEvent') st = { ...st, habits: st.habits.map((h) => (h.id === op.habitId ? eventFrom(h, op.item) : h)) };
    else if (op.op === 'addEvent') {
      const it = op.item;
      st = applyImport(st, {
        items: [once(it)
          ? { kind: 'once', uid: op.uid, name: it.name, ...(it.place ? { place: it.place } : {}), on: it.startsOn, at: it.at, lengthMin: it.lengthMin }
          : { kind: 'repeat', uid: op.uid, name: it.name, ...(it.place ? { place: it.place } : {}), schedule: it.repeat.kind === 'daily' ? { kind: 'daily' } : { kind: 'weekly', days: it.repeat.kind === 'weekdays' ? [1, 2, 3, 4, 5] : it.repeat.days }, at: it.at, lengthMin: it.lengthMin, startsOn: it.startsOn, ...(it.endsOn ? { endsOn: it.endsOn } : {}), skips: it.skips }],
        once: 0, repeating: 0, expanded: 0, existing: 0, allDay: 0,
      });
      // Its moved days too (applyImport knows only skips).
      if (!once(it) && it.moved.length) {
        st = { ...st, habits: st.habits.map((h) => (h.icsUid === op.uid ? eventFrom(h, it) : h)) };
      }
    }
  }
  return st;
}

/** Carry the task changes through the `krnl task` functions (each saves the board). */
export async function applyTaskOps(boardPath: string, ops: readonly LocalOp[], board: Board): Promise<void> {
  const ctx = { boardPath };
  for (const op of ops) {
    if (op.op === 'unscheduleTask') await taskUnschedule(ctx, op.taskId);
    else if (op.op === 'updateTask') {
      await taskSchedule(ctx, op.taskId, `${op.item.startsOn}T${op.item.at}`, op.item.lengthMin);
      const node = board.nodes.find((n) => n.id === op.taskId);
      const text = (node?.state as { text?: string } | undefined)?.text;
      if (op.item.name.trim() && text !== undefined && text !== op.item.name.trim()) await taskEdit(ctx, op.taskId, op.item.name.trim());
    }
  }
}
