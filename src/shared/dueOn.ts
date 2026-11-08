// Due plans for one day (new-user review 4.3): what the Clock and Welcome back
// mention. Open items only; on today, overdue ones come first.

export interface DueItem { id: string; text: string; dueOn: string; overdue: boolean }

interface ItemLike { id?: unknown; text?: unknown; done?: unknown; droppedAt?: unknown; dueOn?: unknown }

export function dueOnDay(nodes: ReadonlyArray<{ kind: string; isMother?: boolean; state?: unknown }>, day: string, today: string): DueItem[] {
  const todo = nodes.find((n) => n.kind === 'todo' && n.isMother === true);
  const items = ((todo?.state as { items?: unknown } | undefined)?.items ?? []) as ItemLike[];
  if (!Array.isArray(items)) return [];
  const out: DueItem[] = [];
  for (const it of items) {
    if (it.done === true || it.droppedAt !== undefined || typeof it.dueOn !== 'string' || typeof it.id !== 'string') continue;
    const overdue = day === today && it.dueOn < today;
    if (it.dueOn !== day && !overdue) continue;
    out.push({ id: it.id, text: typeof it.text === 'string' ? it.text : 'Untitled', dueOn: it.dueOn, overdue });
  }
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueOn.localeCompare(b.dueOn) || a.text.localeCompare(b.text));
}
