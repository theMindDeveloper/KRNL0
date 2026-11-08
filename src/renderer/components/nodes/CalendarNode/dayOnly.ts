// Plans with a day but no time yet (draft D, "slim line"): open Todo items due
// on a day of the week shown that are not on the grid. The Calendar lists them
// under the day names; dragging one onto the grid gives it a time.

export interface DayOnlyPlan { id: string; text: string; taskId: string | null; plannedMin: number; overdue: boolean }

interface NodeLike { id: string; kind: string; isMother?: boolean; state?: unknown }
interface ItemLike { id: string; text: string; done: boolean; dueOn?: string; droppedAt?: string; taskNodeId: string | null }

export function dayOnlyPlans(nodes: readonly NodeLike[], weekDays: readonly string[], onGrid: ReadonlySet<string>, today: string): Map<string, DayOnlyPlan[]> {
  const out = new Map<string, DayOnlyPlan[]>();
  const todo = nodes.find((n) => n.kind === 'todo' && n.isMother);
  const items = ((todo?.state as { items?: ItemLike[] } | undefined)?.items ?? []);
  const days = new Set(weekDays);
  for (const it of items) {
    if (it.done || it.droppedAt || !it.dueOn || !days.has(it.dueOn)) continue;
    if (it.taskNodeId && onGrid.has(it.taskNodeId)) continue;
    const task = it.taskNodeId ? nodes.find((n) => n.id === it.taskNodeId) : undefined;
    const plannedMin = (task?.state as { plannedMin?: number } | undefined)?.plannedMin ?? 25;
    const list = out.get(it.dueOn) ?? [];
    list.push({ id: it.id, text: it.text, taskId: it.taskNodeId, plannedMin, overdue: it.dueOn < today });
    out.set(it.dueOn, list);
  }
  return out;
}
