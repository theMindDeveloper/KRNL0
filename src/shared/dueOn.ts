// Plans for one day with no time (Decision 40): what the Clock and Welcome back
// mention. A plan whose When is that day at any time (`onDay`), and a plan whose
// Deadline is that day (`dueOn`). Open items only; on today, missed ones first.

export interface DueItem {
  id: string;
  text: string;
  /** The day it is on (any time) or due by. */
  dueOn: string;
  overdue: boolean;
  /** 'day' = its When is this day, any time; 'deadline' = it must be done by this day. */
  kind: 'day' | 'deadline';
}

interface ItemLike { id?: unknown; text?: unknown; done?: unknown; droppedAt?: unknown; dueOn?: unknown; onDay?: unknown }

export function dueOnDay(nodes: ReadonlyArray<{ kind: string; isMother?: boolean; state?: unknown }>, day: string, today: string): DueItem[] {
  const todo = nodes.find((n) => n.kind === 'todo' && n.isMother === true);
  const items = ((todo?.state as { items?: unknown } | undefined)?.items ?? []) as ItemLike[];
  if (!Array.isArray(items)) return [];
  const out: DueItem[] = [];
  for (const it of items) {
    if (it.done === true || it.droppedAt !== undefined || typeof it.id !== 'string') continue;
    const text = typeof it.text === 'string' ? it.text : 'Untitled';
    for (const [kind, d] of [['day', it.onDay], ['deadline', it.dueOn]] as const) {
      if (typeof d !== 'string') continue;
      // Its day and its deadline are the same day: say it once.
      if (kind === 'deadline' && d === it.onDay) continue;
      const overdue = day === today && d < today;
      if (d !== day && !overdue) continue;
      out.push({ id: it.id, text, dueOn: d, overdue, kind });
    }
  }
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueOn.localeCompare(b.dueOn) || a.text.localeCompare(b.text));
}
