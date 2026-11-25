// #207 / time-log F7, F7b — correct recorded time after the fact.
//   - Edit a span's start/end ("where I actually stopped").
//   - Add a span I forgot to record.
// Pure reducers + one validation helper shared by the UI and the CLI, so both
// refuse the same things with the same words.

import type { PomoSessionRecord, PomoState } from './types';

export interface SpanTimes { startMs: number; endMs: number }

const hm = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * The live span as [start, now] (running or on a break), or [start, paused at]
 * while paused: that time is recorded on resume or stop, so it is taken
 * already. Null when idle.
 */
function liveSpan(state: PomoState, nowMs: number): SpanTimes | null {
  if ((state.status === 'running' || state.status === 'break') && state.startedAt) {
    return { startMs: Date.parse(state.startedAt), endMs: nowMs };
  }
  if (state.status === 'paused' && state.startedAt) {
    const paused = state.pausedAt ? Date.parse(state.pausedAt) : nowMs;
    return { startMs: Date.parse(state.startedAt), endMs: Number.isFinite(paused) ? paused : nowMs };
  }
  return null;
}

/**
 * Why these times can't be saved, or null when they can. `exceptId` is the
 * span being edited (it may overlap its own old times). Only work spans block
 * each other; a break may sit under work (it's grey, not counted).
 */
export function spanProblem(
  state: PomoState,
  times: SpanTimes,
  nowMs: number,
  opts: { exceptId?: string; kind?: 'work' | 'break' } = {},
): string | null {
  const { startMs, endMs } = times;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'Enter a start and an end time';
  if (endMs <= startMs) return 'The end must be after the start';
  if (endMs > nowMs + 60_000) return 'That end time is in the future';
  if (endMs - startMs > 24 * 3_600_000) return 'A session can be at most 24 hours';
  if ((opts.kind ?? 'work') !== 'work') return null;
  for (const r of state.history) {
    if (r.id === opts.exceptId || r.kind === 'break') continue;
    const s = Date.parse(r.startedAt);
    const e = Date.parse(r.endedAt);
    if (startMs < e && endMs > s) {
      return `Overlaps ${r.label ? `"${r.label}" ` : 'another session '}${hm(s)}–${hm(e)}`;
    }
  }
  const live = liveSpan(state, nowMs);
  if (live && startMs < live.endMs && endMs > live.startMs) {
    return state.status === 'paused'
      ? `Overlaps the paused session ${hm(live.startMs)}–${hm(live.endMs)}`
      : `Overlaps the session running since ${hm(live.startMs)}`;
  }
  return null;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const minutes = (startMs: number, endMs: number): number => Math.max(0, Math.round((endMs - startMs) / 60_000));

/** Move a recorded span's start and/or end. Invalid times leave the state as it is. */
export const pomoEditSegment = (
  state: PomoState,
  args: { id: string; startMs: number; endMs: number; nowMs?: number },
): PomoState => {
  const rec = state.history.find((r) => r.id === args.id);
  if (!rec) return state;
  const nowMs = args.nowMs ?? Date.now();
  if (spanProblem(state, args, nowMs, { exceptId: args.id, kind: rec.kind })) return state;
  const history = state.history
    .map((r) => (r.id === args.id
      ? { ...r, startedAt: iso(args.startMs), endedAt: iso(args.endMs), durationMin: minutes(args.startMs, args.endMs) }
      : r))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  return { ...state, history };
};

/** Record a work span after the fact. Invalid times leave the state as it is. */
export const pomoAddSegment = (
  state: PomoState,
  args: { id: string; startMs: number; endMs: number; taskId?: string | null; label?: string; tag?: string | null; nowMs?: number },
): PomoState => {
  const nowMs = args.nowMs ?? Date.now();
  if (spanProblem(state, args, nowMs)) return state;
  if (state.history.some((r) => r.id === args.id)) return state;
  const label = (args.label ?? '').trim();
  const rec: PomoSessionRecord = {
    id: args.id,
    startedAt: iso(args.startMs),
    endedAt: iso(args.endMs),
    durationMin: minutes(args.startMs, args.endMs),
    label,
    completed: false,
    taskId: args.taskId ?? null,
    kind: 'work',
    ...(!args.taskId && label && args.tag ? { tag: args.tag } : {}),
  };
  const history = [...state.history, rec].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  return { ...state, history };
};

/**
 * Turn "HH:MM" fields on a day into a span. The end belongs to the same day
 * unless it is not after the start — then it is the next morning (a session
 * that ran past midnight).
 */
export function timesFromFields(dayYMD: string, startHM: string, endHM: string): SpanTimes | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayYMD);
  const s = /^(\d{1,2}):(\d{2})$/.exec(startHM);
  const e = /^(\d{1,2}):(\d{2})$/.exec(endHM);
  if (!m || !s || !e) return null;
  const y = Number(m[1]); const mo = Number(m[2]) - 1; const d = Number(m[3]);
  const startMs = new Date(y, mo, d, Number(s[1]), Number(s[2])).getTime();
  let endMs = new Date(y, mo, d, Number(e[1]), Number(e[2])).getTime();
  // The same time is not a 24-hour session: left as is, it reads as "the end
  // must be after the start".
  if (endMs < startMs) endMs = new Date(y, mo, d + 1, Number(e[1]), Number(e[2])).getTime();
  return { startMs, endMs };
}

/** "HH:MM" of a moment. */
export const hmOf = hm;

/** Local YYYY-MM-DD of a moment. */
export function ymdOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * time-log F23 — the parts of `times` not already recorded (work spans and
 * the live session), each at least a minute. Logging past time over a
 * stretch that holds a small recorded piece fills around it instead of
 * refusing the whole stretch (owner, 2026-11-24).
 */
export function freeParts(state: PomoState, times: SpanTimes, nowMs: number): SpanTimes[] {
  const taken: SpanTimes[] = [];
  for (const r of state.history) {
    if (r.kind === 'break') continue;
    taken.push({ startMs: Date.parse(r.startedAt), endMs: Date.parse(r.endedAt) });
  }
  const live = liveSpan(state, nowMs);
  if (live) taken.push(live);
  taken.sort((a, b) => a.startMs - b.startMs);
  const out: SpanTimes[] = [];
  let cur = times.startMs;
  for (const t of taken) {
    if (t.endMs <= cur || t.startMs >= times.endMs) continue;
    if (t.startMs > cur) out.push({ startMs: cur, endMs: Math.min(t.startMs, times.endMs) });
    cur = Math.max(cur, t.endMs);
    if (cur >= times.endMs) break;
  }
  if (cur < times.endMs) out.push({ startMs: cur, endMs: times.endMs });
  return out.filter((p) => p.endMs - p.startMs >= 60_000);
}

/**
 * Record a work span after the fact, around anything already recorded in it
 * (F23): one span per free part. `problem` is set when nothing can be added
 * (the future, end before start, or all of it already recorded).
 */
export const pomoAddSegmentFilling = (
  state: PomoState,
  args: { id: string; startMs: number; endMs: number; taskId?: string | null; label?: string; tag?: string | null; nowMs?: number },
): { state: PomoState; parts: SpanTimes[]; problem: string | null } => {
  const nowMs = args.nowMs ?? Date.now();
  const problem = spanProblem(state, args, nowMs);
  if (!problem) return { state: pomoAddSegment(state, { ...args, nowMs }), parts: [{ startMs: args.startMs, endMs: args.endMs }], problem: null };
  if (!problem.startsWith('Overlaps')) return { state, parts: [], problem };
  const parts = freeParts(state, args, nowMs);
  if (parts.length === 0) return { state, parts: [], problem: 'All of that time is already recorded' };
  let next = state;
  parts.forEach((p, i) => { next = pomoAddSegment(next, { ...args, ...p, id: i === 0 ? args.id : `${args.id}-${i + 1}`, nowMs }); });
  return { state: next, parts, problem: null };
};
