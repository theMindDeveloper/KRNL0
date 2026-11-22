// Today on the phone (Decision 56, phone-web.md F1): everything on the
// clock today, in time order — plans with a Calendar time, repeating events
// (classes, shifts) and habits set for a time. Pure; exported for tests.

import type { Board } from '../../../shared/types';
import type { TodoItem } from '../nodes/TodoNode/types';
import { hasTimeOfDay, isDayScheduled, isRoutine, routineSpansOn, type Habit } from '../nodes/HabitNode/types';
import { eventTitleAndPlaceOf } from '../nodes/CalendarNode/eventText';
import { linksOf, partOnDay } from '../../../shared/calsync/types';

export type AgendaKind = 'plan' | 'event' | 'habit';

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  title: string;
  /** A room or place, for events (eventText.ts). */
  place: string | null;
  startMin: number;
  endMin: number;
  done: boolean;
  /** Habit colour token name (events, habits); plans take their task tone. */
  color: string | null;
  /** The task card's id, for a plan (its tone). */
  taskId: string | null;
}

export interface DayAgenda {
  items: AgendaItem[];
  /** The one going on now, or the next one still to come (never a done one). */
  focus: { item: AgendaItem; state: 'now' | 'next' } | null;
  plansToday: number;
  plansDone: number;
  openPlans: number;
}

const minOf = (iso: string): number | null => {
  const m = /T(\d\d):(\d\d)/.exec(iso);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function dayAgenda(board: Board | null, ymd: string, nowMin: number): DayAgenda {
  const items: AgendaItem[] = [];
  const nodes = board?.nodes ?? [];
  const todo = nodes.find((n) => n.isMother && n.kind === 'todo');
  const todoItems = ((todo?.state as { items?: TodoItem[] } | undefined)?.items ?? []).filter((i) => !i.archivedAt && !i.droppedAt);

  // Plans with a time today: the task card holds the time once it exists.
  const seenTasks = new Set<string>();
  for (const n of nodes) {
    if (n.kind !== 'todo.task') continue;
    const st = n.state as { text?: string; done?: boolean; scheduledFor?: string; scheduledDurationMin?: number; plannedMin?: number; archivedAt?: string; timeOpen?: boolean } | undefined;
    if (!st?.scheduledFor || st.archivedAt || st.scheduledFor.slice(0, 10) !== ymd) continue;
    const start = minOf(st.scheduledFor);
    if (start === null) continue;
    const len = Math.max(5, st.scheduledDurationMin ?? st.plannedMin ?? 25);
    seenTasks.add(n.id);
    items.push({ id: n.id, kind: 'plan', title: (st.text ?? '').trim() || 'Untitled plan', place: null, startMin: start, endMin: Math.min(24 * 60, start + len), done: !!st.done, color: null, taskId: n.id });
  }
  // A row scheduled before its card was made.
  for (const i of todoItems) {
    if (!i.scheduledFor || i.scheduledFor.slice(0, 10) !== ymd || (i.taskNodeId && seenTasks.has(i.taskNodeId))) continue;
    const start = minOf(i.scheduledFor);
    if (start === null) continue;
    items.push({ id: i.id, kind: 'plan', title: i.text.trim() || 'Untitled plan', place: null, startMin: start, endMin: Math.min(24 * 60, start + 25), done: i.done, color: null, taskId: i.taskNodeId });
  }

  // Repeating events and habits set for a time.
  for (const n of nodes) {
    if (n.kind !== 'habit') continue;
    for (const h of ((n.state as { habits?: Habit[] } | undefined)?.habits ?? [])) {
      if (h.archived) continue;
      if (isRoutine(h)) {
        for (const occ of routineSpansOn(h, ymd)) {
          if (occ.skipped) continue;
          const { title, place } = eventTitleAndPlaceOf(h);
          items.push({ id: `${h.id}${occ.spill ? ':spill' : ''}`, kind: 'event', title, place, startMin: occ.startMin, endMin: occ.endMin, done: false, color: h.color, taskId: null });
        }
      } else if (hasTimeOfDay(h) && isDayScheduled(h.schedule, ymd)) {
        const start = minOf(`T${h.schedule.timeOfDay}`)!;
        const len = Math.max(5, h.schedule.durationMin ?? 15);
        items.push({ id: h.id, kind: 'habit', title: h.name, place: null, startMin: start, endMin: Math.min(24 * 60, start + len), done: h.log.includes(ymd), color: h.color, taskId: null });
      }
    }
  }

  // Decision 64: events from other calendars (read-only), shown like events.
  for (const link of linksOf(board)) {
    if (!link.on) continue;
    for (const ev of link.events) {
      if (ev.start.slice(0, 10) > ymd) break;
      const part = partOnDay(ev, ymd);
      if (!part) continue;
      items.push({ id: `ln:${link.id}:${ev.id}`, kind: 'event', title: ev.title, place: ev.place ?? null, startMin: part.startMin, endMin: part.endMin, done: false, color: link.color, taskId: null });
    }
  }

  items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.title.localeCompare(b.title));

  const now = items.find((it) => !it.done && it.startMin <= nowMin && nowMin < it.endMin);
  const next = items.find((it) => !it.done && it.startMin > nowMin);
  const plans = items.filter((it) => it.kind === 'plan');
  return {
    items,
    focus: now ? { item: now, state: 'now' } : next ? { item: next, state: 'next' } : null,
    plansToday: plans.length,
    plansDone: plans.filter((p) => p.done).length,
    openPlans: todoItems.filter((i) => !i.done).length,
  };
}

/** "in 2 h 10 min", "in 25 min". */
export function inWords(min: number): string {
  if (min < 1) return 'now';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `in ${m} min`;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
}

/** "45 min", "1 h 30". */
export function lengthWords(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

export function hhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** The headline under the date. */
export function dayLine(a: DayAgenda): string {
  const parts: string[] = [];
  if (a.plansToday > 0) parts.push(`${a.plansDone} of ${a.plansToday} plans done`);
  const events = a.items.filter((i) => i.kind === 'event').length;
  if (events > 0) parts.push(`${events} ${events === 1 ? 'event' : 'events'}`);
  if (parts.length > 0) return parts.join(' · ');
  if (a.openPlans > 0) return `${a.openPlans} open ${a.openPlans === 1 ? 'plan' : 'plans'}, none set for today`;
  return 'Nothing planned yet';
}
