// ADR 0016 — where the time went, by tag. Pure: board JSON + range + clock in,
// numbers out (the AnalyticsNode "Time" view and `sys analytics show --view
// tags` share it).
//
// Source: the completion ledger (#169), so deleted/archived/cleared tasks
// still count. Minutes per task = pomo work actually tracked against it when
// there is any, else its planned minutes. Ledger entries written before tags
// existed are classified from their text on the fly.

import type { Board } from '../../shared/types';
import type { CompletionRecord } from '../../shared/types/board';
import type { TodoState } from '../components/nodes/TodoNode/types';
import { classifyTask, mergeTagLibrary, tagDisplay } from '../../shared/tags/classify';
import { tagExamples } from '../components/nodes/TodoNode/commands';
import { selectPomoReality } from '../store/pomoReality';
import { eachDay, isoToYMD } from './dateRange';
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

  const tracked = new Map<string, number>();
  const freeSpans: Array<{ date: string; tag: string; minutes: number }> = [];
  for (const seg of selectPomoReality(board, nowMs)) {
    if (seg.kind === 'break') continue;
    const minutes = (seg.endMs - seg.startMs) / 60_000;
    if (seg.taskId) tracked.set(seg.taskId, (tracked.get(seg.taskId) ?? 0) + minutes);
    // Observe mode — free-text spans ("emails") count by their own tag.
    else if (seg.label) freeSpans.push({ date: isoToYMD(new Date(seg.startMs).toISOString()), tag: seg.tag ?? UNTAGGED_ID, minutes });
  }

  const days = new Map<string, Record<string, number>>(eachDay(range).map((d) => [d, {}]));
  const slices = new Map<string, TagSlice>();
  let totalMin = 0;
  let totalCount = 0;

  for (const f of freeSpans) {
    const day = days.get(f.date);
    if (!day) continue;
    const disp = f.tag === UNTAGGED_ID
      ? { id: UNTAGGED_ID, label: 'Other', color: 'var(--ink-4)' }
      : tagDisplay(library, f.tag);
    const minutes = Math.round(f.minutes);
    const slice = slices.get(disp.id) ?? { ...disp, count: 0, minutes: 0, share: 0 };
    slice.minutes += minutes;
    slices.set(disp.id, slice);
    day[disp.id] = (day[disp.id] ?? 0) + minutes;
    totalMin += minutes;
  }

  for (const c of ledger) {
    if (!c.completedAt) continue;
    const date = isoToYMD(c.completedAt);
    const day = days.get(date);
    if (!day) continue;
    const raw = c.tag ?? classifyTask(c.text, library, examples) ?? UNTAGGED_ID;
    const disp = raw === UNTAGGED_ID
      ? { id: UNTAGGED_ID, label: 'Other', color: 'var(--ink-4)' }
      : tagDisplay(library, raw);
    const t = tracked.get(c.taskId);
    const minutes = Math.round(t !== undefined && t > 0 ? t : c.plannedMin);
    const slice = slices.get(disp.id) ?? { ...disp, count: 0, minutes: 0, share: 0 };
    slice.count += 1;
    slice.minutes += minutes;
    slices.set(disp.id, slice);
    day[disp.id] = (day[disp.id] ?? 0) + minutes;
    totalMin += minutes;
    totalCount += 1;
  }

  const tags = [...slices.values()]
    .map((s) => ({ ...s, share: totalMin > 0 ? s.minutes / totalMin : 0 }))
    .sort((a, b) => b.minutes - a.minutes || b.count - a.count);
  return {
    tags,
    days: [...days.entries()].map(([date, minutes]) => ({ date, minutes })),
    totalMin,
    totalCount,
  };
}
