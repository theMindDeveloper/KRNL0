// Plans marked "Won't do" (TodoItem.droppedAt). The flag lives on the Todo
// row; readers that work from task nodes (Calendar, Analytics, the timer's
// task list) use this so a dropped plan never looks open or planned.

interface NodeLike { kind: string; isMother?: boolean; state?: unknown }

export function droppedTaskIds(nodes: readonly NodeLike[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const n of nodes ?? []) {
    if (n.kind !== 'todo') continue;
    const items = (n.state as { items?: unknown } | null | undefined)?.items;
    if (!Array.isArray(items)) continue;
    for (const it of items as Array<{ droppedAt?: unknown; taskNodeId?: unknown }>) {
      if (it && it.droppedAt !== undefined && typeof it.taskNodeId === 'string') out.add(it.taskNodeId);
    }
  }
  return out;
}
