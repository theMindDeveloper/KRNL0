// Today's Observe spans (work and breaks), clipped to the local day, plus the
// live one — shared by the node's day strip, the pocket dial's day ring and
// the capsule card.

import type { PomoState } from './types';
import type { TagDef } from '../../../../shared/tags/classify';
import { spanTone } from '../../../store/spanTags';

export interface DaySpan { id: string; start: number; end: number; break: boolean; color: string }

export interface DaySpans {
  /** Local midnight, epoch ms. */
  d0: number;
  spans: DaySpan[];
  workMs: number;
  breakMs: number;
  workSpans: number;
  /** The live span is running or on a break. */
  live: boolean;
}

const DAY = 86_400_000;

export function todaySpans(state: PomoState, library: readonly TagDef[], nowMs: number, plain = false): DaySpans {
  const dayStart = new Date(nowMs);
  dayStart.setHours(0, 0, 0, 0);
  const d0 = dayStart.getTime();
  const spans: DaySpan[] = [];
  for (const r of state.history) {
    const start = Math.max(d0, Date.parse(r.startedAt));
    const end = Math.min(d0 + DAY, Date.parse(r.endedAt));
    if (!(end > start)) continue;
    spans.push({ id: r.id, start, end, break: r.kind === 'break', color: spanTone(library, r, plain) });
  }
  const live = (state.status === 'running' || state.status === 'break') && state.startedAt !== null;
  if (live) {
    const start = Math.max(d0, Date.parse(state.startedAt as string));
    if (nowMs > start) {
      spans.push({
        id: 'live', start, end: nowMs, break: state.status === 'break',
        color: spanTone(library, { kind: 'work', taskId: state.activeTaskId, tag: state.tag ?? null }, plain),
      });
    }
  }
  let workMs = 0;
  let breakMs = 0;
  let workSpans = 0;
  for (const s of spans) {
    if (s.break) breakMs += s.end - s.start;
    else { workMs += s.end - s.start; workSpans++; }
  }
  return { d0, spans, workMs, breakMs, workSpans, live };
}

/** "3h 15m" / "42m". */
export function fmtMin(ms: number): string {
  const min = Math.floor(ms / 60_000);
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}
