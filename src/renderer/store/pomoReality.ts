// Issue #166 — tracked-reality selector.
//
// The Pomodoro is an OBSERVER: it draws what actually happened, live. This
// module turns the pomo mother node's recorded segment history + the in-flight
// segment into a flat list of time spans that the Clock and Calendar render as
// "reality" arcs/blocks (distinct from pre-scheduled event "plan" blocks).
//
// Pure: no React, no Date side-channel beyond the injected `nowMs`.

import type { Board } from '../../shared/types';
import type { PomoState, PomoSegmentKind, PomoSessionRecord } from '../components/nodes/PomoNode/types';

export interface RealitySegment {
  id: string;
  startMs: number;
  endMs: number;
  kind: PomoSegmentKind;
  taskId: string | null;
  label: string;
  /** True for the in-flight segment (endMs === nowMs, still growing). */
  live: boolean;
}

/** Legacy records may predate the kind discriminator → treat as work. */
function recordKind(rec: PomoSessionRecord): PomoSegmentKind {
  return rec.kind === 'break' ? 'break' : 'work';
}

/**
 * Flatten the pomo node's history + current in-flight segment into reality
 * spans. Returns [] when there is no pomo node. `nowMs` is the live cursor for
 * the in-flight span (running → work, break → break).
 */
export function selectPomoReality(board: Board | null, nowMs: number): RealitySegment[] {
  if (!board) return [];
  const pomo = board.nodes.find((n) => n.kind === 'pomo');
  if (!pomo) return [];
  const s = pomo.state as PomoState;
  const out: RealitySegment[] = [];

  const history = Array.isArray(s.history) ? s.history : [];
  for (const rec of history) {
    const startMs = Date.parse(rec.startedAt);
    const endMs = Date.parse(rec.endedAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    out.push({
      id: rec.id,
      startMs,
      endMs,
      kind: recordKind(rec),
      taskId: rec.taskId ?? null,
      label: rec.label,
      live: false,
    });
  }

  // In-flight segment: running draws a live work span, break draws a live break
  // span. Paused logs nothing (gap) — no live span.
  if ((s.status === 'running' || s.status === 'break') && s.startedAt !== null) {
    const startMs = Date.parse(s.startedAt);
    if (Number.isFinite(startMs) && nowMs > startMs) {
      out.push({
        id: 'pomo-live',
        startMs,
        endMs: nowMs,
        kind: s.status === 'break' ? 'break' : 'work',
        taskId: s.activeTaskId,
        label: s.label,
        live: true,
      });
    }
  }

  return out;
}

/** True iff the pomo node currently has a live (running or break) segment. */
export function pomoIsLive(board: Board | null): boolean {
  if (!board) return false;
  const pomo = board.nodes.find((n) => n.kind === 'pomo');
  if (!pomo) return false;
  const status = (pomo.state as PomoState).status;
  return status === 'running' || status === 'break';
}
