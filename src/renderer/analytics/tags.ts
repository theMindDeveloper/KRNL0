// ADR 0016 — where the time went, by tag. Pure: board JSON + range + clock in,
// numbers out (the AnalyticsNode "Time" view and `sys analytics show --view
// tags` share it).
//
// Time = recorded work only (Decision 31), booked on the days it was worked
// (#207, time-log F6) — open tasks and category-only sessions included.
// Counts = tasks finished in range, from the completion ledger (#169), so
// deleted/archived tasks still count. Untagged text is classified on the fly.

import type { Board } from '../../shared/types';
import type { CompletionRecord } from '../../shared/types/board';
import type { TodoState } from '../components/nodes/TodoNode/types';
import { classifyTask, mergeTagLibrary, tagDisplay } from '../../shared/tags/classify';
import { tagExamples } from '../components/nodes/TodoNode/commands';
import { selectPomoReality } from '../store/pomoReality';
import { eachDay, isoToYMD, splitMinutesByLocalDay } from './dateRange';
import type { RangeArg } from './types';

export const UNTAGGED_ID = 'other';

export interface TagSlice {
  id: string;
  label: string;
  color: string;
  count: number;
  minutes: number;
  /** Share of all minutes in range, 0..1. */
  share: number;
}

export interface TagDay {
  date: string;
  /** tag id → minutes completed that day. */
  minutes: Record<string, number>;
}

export interface TagBreakdown {
  tags: TagSlice[];
  days: TagDay[];
  totalMin: number;
  totalCount: number;
}

export function computeTagBreakdown(board: Board, range: RangeArg, nowMs: number): TagBreakdown {
  const ledger = (board.completions ?? []) as CompletionRecord[];
  const todo = board.nodes.find((n) => n.kind === 'todo' && n.isMother) ?? board.nodes.find((n) => n.kind === 'todo');
  const todoState = todo?.state as TodoState | undefined;
  const library = mergeTagLibrary(todoState?.tagLibrary);
  const examples = todoState ? tagExamples(todoState) : [];

  // A task's tag: its Todo row's tag, else the completion record's, else
  // classified from its text.
  const itemTag = new Map<string, string>();
  for (const it of todoState?.items ?? []) if (it.taskNodeId && it.tag) itemTag.set(it.taskNodeId, it.tag);
  const ledgerTag = new Map<string, string>();
  for (const c of ledger) if (c.tag) ledgerTag.set(c.taskId, c.tag);
  const taskText = new Map<string, string>();
  for (const n of board.nodes) if (n.kind === 'todo.task') taskText.set(n.id, String((n.state as { text?: string }).text ?? ''));
  const tagOfTask = (taskId: string, label: string): string =>
    itemTag.get(taskId) ?? ledgerTag.get(taskId) ?? classifyTask(taskText.get(taskId) || label, library, examples) ?? UNTAGGED_ID;

  const days = new Map<string, Record<string, number>>(eachDay(range).map((d) => [d, {}]));
  const slices = new Map<string, TagSlice>();
  const display = (raw: string): { id: string; label: string; color: string } => (raw === UNTAGGED_ID
    ? { id: UNTAGGED_ID, label: 'Other', color: 'var(--ink-4)' }
    : tagDisplay(library, raw));
  let totalMin = 0;
  let totalCount = 0;

  // #207 / time-log F6 — time spent = recorded work only, booked on the days
  // it was worked (split at midnight). Open tasks count; a session tracked as
  // just a category ("Code") counts under that category.
  for (const seg of selectPomoReality(board, nowMs)) {
    if (seg.kind === 'break') continue;
    const raw = seg.taskId
      ? tagOfTask(seg.taskId, seg.label)
      : seg.tag ?? (seg.label ? classifyTask(seg.label, library, examples) ?? UNTAGGED_ID : UNTAGGED_ID);
    const disp = display(raw);
    const minutes = (seg.endMs - seg.startMs) / 60_000;
    for (const part of splitMinutesByLocalDay(seg.startMs, seg.endMs, minutes)) {
      const day = days.get(part.date);
      if (!day) continue;
      const m = part.min;
      const slice = slices.get(disp.id) ?? { ...disp, count: 0, minutes: 0, share: 0 };
      slice.minutes += m;
      slices.set(disp.id, slice);
      day[disp.id] = (day[disp.id] ?? 0) + m;
      totalMin += m;
    }
  }

  // Tasks finished in range, per tag (counts only — time comes from above).
  for (const c of ledger) {
    if (!c.completedAt) continue;
    if (!days.has(isoToYMD(c.completedAt))) continue;
    const disp = display(c.tag ?? itemTag.get(c.taskId) ?? classifyTask(c.text, library, examples) ?? UNTAGGED_ID);
    const slice = slices.get(disp.id) ?? { ...disp, count: 0, minutes: 0, share: 0 };
    slice.count += 1;
    slices.set(disp.id, slice);
    totalCount += 1;
  }

  const round = (m: number): number => Math.round(m);
  const tags = [...slices.values()]
    .map((sl) => ({ ...sl, minutes: round(sl.minutes), share: totalMin > 0 ? sl.minutes / totalMin : 0 }))
    .sort((x, y) => y.minutes - x.minutes || y.count - x.count);
  return {
    tags,
    days: [...days.entries()].map(([date, minutes]) => ({ date, minutes: Object.fromEntries(Object.entries(minutes).map(([k, v]) => [k, round(v)])) })),
    totalMin: round(totalMin),
    totalCount,
  };
}
