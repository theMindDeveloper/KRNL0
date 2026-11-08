// The ANY TIME strip under the day names (Decision 40). Two kinds of mark:
// - a plan whose When is a day with no time (`onDay`): a solid chip, dragged
//   into the hours to give it a time;
// - a plan's Deadline (`dueOn`): a dashed flag on that day. A plan planned
//   (with a time) on its own deadline day shows only its block.

export interface DayOnlyPlan {
  id: string;
  text: string;
  taskId: string | null;
  plannedMin: number;
  /** Its day (or deadline) is before today and it is not done. */
  overdue: boolean;
  /** 'plan' = its When is this day, any time; 'deadline' = it must be done by this day. */
  kind: 'plan' | 'deadline';
  /** For a deadline whose plan has a time: the day it is planned on. */
  plannedOn?: string;
}

interface NodeLike { id: string; kind: string; isMother?: boolean; state?: unknown }
interface ItemLike { id: string; text: string; done: boolean; dueOn?: string; onDay?: string; droppedAt?: string; taskNodeId: string | null }

/** `onGrid`: task id → the day (YYYY-MM-DD) it is placed on the Calendar. Deadlines first in each day. */
export function dayOnlyPlans(nodes: readonly NodeLike[], weekDays: readonly string[], onGrid: ReadonlyMap<string, string>, today: string): Map<string, DayOnlyPlan[]> {
  const out = new Map<string, DayOnlyPlan[]>();
  const todo = nodes.find((n) => n.kind === 'todo' && n.isMother);
  const items = ((todo?.state as { items?: ItemLike[] } | undefined)?.items ?? []);
  const days = new Set(weekDays);
  const push = (day: string, p: DayOnlyPlan) => { const l = out.get(day) ?? []; l.push(p); out.set(day, l); };
  for (const it of items) {
    if (it.done || it.droppedAt) continue;
    const plannedOn = it.taskNodeId ? onGrid.get(it.taskNodeId) : undefined;
    const task = it.taskNodeId ? nodes.find((n) => n.id === it.taskNodeId) : undefined;
    const plannedMin = (task?.state as { plannedMin?: number } | undefined)?.plannedMin ?? 25;
    if (it.onDay && !plannedOn && days.has(it.onDay)) {
      push(it.onDay, { id: it.id, text: it.text, taskId: it.taskNodeId, plannedMin, overdue: it.onDay < today, kind: 'plan' });
    }
    if (it.dueOn && days.has(it.dueOn) && plannedOn !== it.dueOn && it.onDay !== it.dueOn) {
      push(it.dueOn, { id: it.id, text: it.text, taskId: it.taskNodeId, plannedMin, overdue: it.dueOn < today, kind: 'deadline', ...(plannedOn ? { plannedOn } : {}) });
    }
  }
  for (const l of out.values()) l.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'deadline' ? -1 : 1));
  return out;
}
