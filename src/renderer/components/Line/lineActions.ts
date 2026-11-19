// What the Line layout does to the board. Every write goes through the same
// node commands the windows use (rule 5), so both layouts stay in step and
// `krnl` sees the same result.

import { parseQuickAdd, type QuickAdd } from '../../../shared/quickAdd';
import { addDaysYMD, localYMD } from '../../../shared/ymd';
import { historyGroup, useBoardStore } from '../../store/boardStore';
import { addPastSegment, deletePlanOfTask, habitMotherCommand, scheduleTaskAt } from '../../store/scheduleActions';
import { isEasyBoard } from '../../store/uiMode';
import type { HabitSchedule, IsoDow } from '../nodes/HabitNode/types';
import type { TodoState } from '../nodes/TodoNode/types';
import { habitsOf, pomoOf, type HabitRow } from './dayData';

type Args = Record<string, unknown>;

async function run(kind: 'pomo' | 'todo', command: string, args: Args = {}): Promise<void> {
  const b = useBoardStore.getState().board;
  const node = b?.nodes.find((n) => n.kind === kind && n.isMother) ?? b?.nodes.find((n) => n.kind === kind);
  if (!node) return;
  const { makeCommandHandler } = await import('../Canvas/commandDispatch');
  makeCommandHandler(node.id)(command, args);
}

// ── recording ───────────────────────────────────────────────────────────────

/** Start recording `label`. Already recording something else: that span is saved first. */
export async function startRecording(label: string): Promise<void> {
  const ps = pomoOf(useBoardStore.getState().board);
  const name = label.trim();
  if (ps && (ps.status === 'running' || ps.status === 'break' || ps.status === 'paused')) {
    if (ps.status === 'running' && (ps.label ?? '').trim().toLowerCase() === name.toLowerCase()) return;
    await run('pomo', 'pomo.stop');
  }
  await run('pomo', 'pomo.start', name ? { label: name, activeTaskId: null } : {});
}
export const stopRecording = (): Promise<void> => run('pomo', 'pomo.stop');
export const takeBreak = (): Promise<void> => run('pomo', 'pomo.break');
export const backToWork = (): Promise<void> => run('pomo', 'pomo.resume');

/** "That empty stretch was …": saved as recorded time, like Log time here. */
export function nameGap(startMs: number, endMs: number, label: string): string | null {
  return addPastSegment(startMs, endMs, null, label.trim());
}

// ── the one field ───────────────────────────────────────────────────────────

export interface HabitWords {
  name: string;
  schedule: HabitSchedule;
  perWeek?: number;
  amount?: { target: number; unit: string };
  /** How it will be read back: "every day", "Mon · Wed · Fri", "3 times a week". */
  says: string;
}

export type FieldIntent =
  | { kind: 'empty' }
  | { kind: 'record'; label: string }
  | { kind: 'plan'; q: QuickAdd }
  | { kind: 'habit'; habit: HabitWords }
  | { kind: 'hint'; text: string };

const DAYS: Array<[RegExp, IsoDow, string]> = [
  [/^mon/i, 1, 'Mon'], [/^tue/i, 2, 'Tue'], [/^wed/i, 3, 'Wed'], [/^thu/i, 4, 'Thu'], [/^fri/i, 5, 'Fri'], [/^sat/i, 6, 'Sat'], [/^sun/i, 7, 'Sun'],
];
const DAY_WORD = '(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*';

/** Words that make a habit: "walk daily", "gym mon wed fri", "run 3x a week", "water 8 glasses". */
export function readHabit(raw: string): HabitWords | null {
  let s = ` ${raw} `;
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(s);
    if (m) s = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`;
    return m;
  };
  const time = take(/\s(?:at\s+)?((?:[01]?\d|2[0-3]):[0-5]\d)(?=\s)/i);
  const timeOfDay = time ? time[1]!.padStart(5, '0') : undefined;
  const amountM = take(/\s(\d{1,3})\s+(glasses|glass|pages|cups|reps|km|steps)(?=\s)/i);
  const amount = amountM ? { target: Number(amountM[1]), unit: amountM[2]!.toLowerCase() } : undefined;
  const perWeekM = take(/\s([1-6])\s*(?:x|times)\s*(?:a|per)?\s*week(?=\s)/i);
  let schedule: HabitSchedule | null = null;
  let says = '';
  const withTime = <T extends HabitSchedule>(sch: T): T => (timeOfDay ? { ...sch, timeOfDay } : sch);
  if (perWeekM) {
    schedule = withTime({ kind: 'daily' });
    says = `${perWeekM[1]} times a week`;
  } else if (take(/\s(?:every\s+weekday|weekdays)(?=\s)/i)) {
    schedule = withTime({ kind: 'weekdays' });
    says = 'weekdays';
  } else if (take(/\s(?:every\s*day|daily|each\s+day)(?=\s)/i)) {
    schedule = withTime({ kind: 'daily' });
    says = 'every day';
  } else {
    const list = new RegExp(`\\s(every\\s+)?(${DAY_WORD}(?:[\\s,&]+(?:and\\s+)?${DAY_WORD})*)(?=\\s)`, 'i').exec(s);
    if (list) {
      const words = list[2]!.split(/[\s,&]+/).filter((w) => w && !/^and$/i.test(w));
      const days = [...new Set(words.map((w) => DAYS.find(([re]) => re.test(w))).filter((d): d is [RegExp, IsoDow, string] => !!d).map((d) => d[1]))].sort();
      // One day without "every" is a plan on that day, not a habit.
      if (days.length >= 2 || (list[1] && days.length === 1)) {
        s = `${s.slice(0, list.index)} ${s.slice(list.index + list[0].length)}`;
        schedule = withTime({ kind: 'weekly', days });
        says = days.map((d) => DAYS.find((x) => x[1] === d)![2]).join(' · ');
      }
    }
  }
  if (!schedule && amount) {
    schedule = withTime({ kind: 'daily' });
    says = 'every day';
  }
  if (!schedule) return null;
  const name = s.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  if (amount) says = `${amount.target} ${amount.unit}, ${says}`;
  if (timeOfDay) says = `${says} at ${timeOfDay}`;
  return { name: name.charAt(0).toUpperCase() + name.slice(1), schedule, ...(perWeekM ? { perWeek: Number(perWeekM[1]) } : {}), ...(amount ? { amount } : {}), says };
}

/** What Enter will do with the words in the field. */
export function readField(raw: string, now: Date = new Date()): FieldIntent {
  const text = raw.trim();
  if (!text) return { kind: 'empty' };
  const habit = readHabit(text);
  if (habit) return { kind: 'habit', habit };
  const q = parseQuickAdd(text, now);
  if (q.hint) return { kind: 'hint', text: q.hint };
  if (q.day || q.time || q.durationMin || q.deadline) return { kind: 'plan', q };
  return { kind: 'record', label: text };
}

/** A plan from the words, on the Calendar when they named a time (one Ctrl+Z). */
export async function addPlan(q: QuickAdd): Promise<void> {
  const easy = isEasyBoard(useBoardStore.getState().board);
  await historyGroup(async () => {
    await run('todo', 'todo.add', q.durationMin ? { text: q.text, durationMin: q.durationMin } : { text: q.text });
    const st = useBoardStore.getState().board?.nodes.find((n) => n.kind === 'todo' && n.isMother)?.state as TodoState | undefined;
    const item = [...(st?.items ?? [])].filter((i) => i.text === q.text && !i.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!item) return;
    if (q.deadline && !easy) await run('todo', 'todo.setDue', { id: item.id, dueOn: q.deadline });
    if (q.time && q.day && item.taskNodeId) await scheduleTaskAt(item.taskNodeId, `${q.day}T${q.time}`);
    else if (q.day && !q.time) await run('todo', 'todo.setOnDay', { id: item.id, onDay: q.day });
    else if (!q.day && q.deadline && easy) await run('todo', 'todo.setOnDay', { id: item.id, onDay: q.deadline });
  });
}

/** A plan with a name only: it waits under "No time yet". */
export const addPlainPlan = (text: string): Promise<void> => run('todo', 'todo.add', { text: text.trim() });

export async function addHabit(h: HabitWords): Promise<void> {
  await historyGroup(async () => {
    const before = new Set(habitsOf(useBoardStore.getState().board).map((x) => x.id));
    await habitMotherCommand('habit.add', { name: h.name, schedule: h.schedule });
    const made = habitsOf(useBoardStore.getState().board).find((x) => !before.has(x.id));
    if (!made) return;
    if (h.perWeek) await habitMotherCommand('habit.setTarget', { id: made.id, perWeek: h.perWeek });
    if (h.amount) await habitMotherCommand('habit.setAmount', { id: made.id, target: h.amount.target, unit: h.amount.unit });
  });
}

// ── habits and plans ────────────────────────────────────────────────────────

/** Tick a habit on a day. An amount habit counts one more (a full day ticks back to zero). */
export async function tickHabit(row: Pick<HabitRow, 'id'>, day: string): Promise<void> {
  if (day > localYMD(new Date())) return;
  await habitMotherCommand('habit.toggleDay', { id: row.id, date: day });
}

export const toggleItem = (itemId: string): Promise<void> => run('todo', 'todo.toggle', { id: itemId });

export type LaterChoice = 'later-today' | 'tomorrow';

/** "Later": the same plan, later today (the next full hour) or tomorrow at its own time. */
export async function movePlanLater(taskId: string, startMs: number, choice: LaterChoice, nowMs: number = Date.now()): Promise<void> {
  if (choice === 'later-today') {
    const d = new Date(nowMs);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    // Past 23:00 there is no "later today": it goes to tomorrow morning at its own time.
    if (localYMD(d) === localYMD(new Date(nowMs))) {
      await scheduleTaskAt(taskId, `${localYMD(d)}T${String(d.getHours()).padStart(2, '0')}:00`);
      return;
    }
  }
  const s = new Date(startMs);
  const hhmm = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
  await scheduleTaskAt(taskId, `${addDaysYMD(localYMD(new Date(nowMs)), 1)}T${hhmm}`);
}

export const deletePlan = (taskId: string): Promise<boolean> => deletePlanOfTask(taskId);
