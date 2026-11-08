// The DAY line under the day names (draft D, "slim line"): open Todo items
// due on a day of the week shown.
// - A plan with a day but no time yet: drag it onto the grid to give it a time.
// - A plan that already has a time on another day: its deadline, marked "due"
//   (it can't be dragged from here; its block on the grid moves it).
// A plan planned on its own due day shows only its block.

export interface DayOnlyPlan {
  id: string;
  text: string;
  taskId: string | null;
  plannedMin: number;
  overdue: boolean;
  /** Set when the plan already has a time on the grid: this is only its deadline. */
  plannedOn?: string;
}

interface NodeLike { id: string; kind: string; isMother?: boolean; state?: unknown }
interface ItemLike { id: string; text: string; done: boolean; dueOn?: string; droppedAt?: string; taskNodeId: string | null }

/** `onGrid`: task id → the day (YYYY-MM-DD) it is placed on the Calendar. */
export function dayOnlyPlans(nodes: readonly NodeLike[], weekDays: readonly string[], onGrid: ReadonlyMap<string, string>, today: string): Map<string, DayOnlyPlan[]> {
  const out = new Map<string, DayOnlyPlan[]>();
  const todo = nodes.find((n) => n.kind === 'todo' && n.isMother);
  const items = ((todo?.state as { items?: ItemLike[] } | undefined)?.items ?? []);
  const days = new Set(weekDays);
  for (const it of items) {
    if (it.done || it.droppedAt || !it.dueOn || !days.has(it.dueOn)) continue;
    const plannedOn = it.taskNodeId ? onGrid.get(it.taskNodeId) : undefined;
    if (plannedOn === it.dueOn) continue;
    const task = it.taskNodeId ? nodes.find((n) => n.id === it.taskNodeId) : undefined;
    const plannedMin = (task?.state as { plannedMin?: number } | undefined)?.plannedMin ?? 25;
    const list = out.get(it.dueOn) ?? [];
    list.push({ id: it.id, text: it.text, taskId: it.taskNodeId, plannedMin, overdue: it.dueOn < today, ...(plannedOn ? { plannedOn } : {}) });
    out.set(it.dueOn, list);
  }
  return out;
}
