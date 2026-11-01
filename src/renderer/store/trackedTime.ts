// Plan vs reality — tracked time per task, DERIVED from the pomo's recorded
// work spans (never stored on the task). The pomo observes; a span's taskId is
// only a tag saying what the time was spent on, so retagging a span moves its
// minutes to another task and deleting a span removes them.

import type { Board } from '../../shared/types';
import { selectPomoReality } from './pomoReality';

/** Seconds of tagged WORK per taskId, including the live/paused span. */
export function trackedSecondsByTask(board: Board | null, nowMs: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const seg of selectPomoReality(board, nowMs)) {
    if (seg.kind !== 'work' || seg.taskId === null) continue;
    out.set(seg.taskId, (out.get(seg.taskId) ?? 0) + (seg.endMs - seg.startMs) / 1000);
  }
  return out;
}

/** Narrow selector input: only the pomo node matters for tracked time, so
 *  components can subscribe to it alone instead of the whole board. */
export function selectPomoNode(s: { board: Board | null }): Board['nodes'][number] | undefined {
  return s.board?.nodes.find((n) => n.kind === 'pomo');
}

/** Board-shaped wrapper around a single pomo node for the selectors above. */
export function pomoOnlyBoard(pomo: Board['nodes'][number] | undefined): Board | null {
  return pomo ? ({ nodes: [pomo], edges: [] } as unknown as Board) : null;
}

/** Seconds of tagged work for one task. */
export function trackedSecondsForTask(board: Board | null, taskId: string, nowMs: number): number {
  return trackedSecondsByTask(board, nowMs).get(taskId) ?? 0;
}

export type PlanStatus = 'untracked' | 'on-track' | 'overrun';

/** Tracked vs planned: overrun means more time was spent than planned. */
export function planStatus(trackedSec: number, plannedMin: number): PlanStatus {
  if (trackedSec <= 0) return 'untracked';
  return trackedSec > plannedMin * 60 ? 'overrun' : 'on-track';
}
