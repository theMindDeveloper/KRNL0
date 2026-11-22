/**
 * Decision 63 (owner, 2026-11-22: the task being moved on the Clock was "too
 * slow and too stuttery") — what is carried on the Calendar, drawn on the
 * Clock by one small arc of its own. It follows the ghost at once and glides
 * from step to step like the ghost does (90 ms, from where it is drawn now),
 * so the Clock window itself is not drawn again on every step: it changes only
 * when a drag starts (the original steps back) and when it lands.
 */
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { calendarGhost, subscribeCalendarGhost } from '../CalendarNode/DropGhost';
import { packLanes } from '../../../store/laneLayout';
import { arcPath } from './dialGeometry';
import { carriedClockId, withCarried, type ClockHalf, type TaskEntry } from './dayModel';

/** The ghost glides between slots in 90 ms (reactflow-theme.css): the same here. */
export const CARRIED_GLIDE_MS = 90;

interface Props {
  /** The day's plans as the Clock draws them (the carried one is found and moved here). */
  planned: TaskEntry[];
  ymd: string;
  half: ClockHalf;
  /** Lane geometry of the dial: lane 0's radius, the step between lanes, the arc's width. */
  baseR: number;
  laneStep: number;
  stroke: number;
}

interface Shown { s: number; e: number; r: number }

function reducedMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-motion') === 'reduced') return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ClockCarriedArc({ planned, ymd, half, baseR, laneStep, stroke }: Props): JSX.Element | null {
  const g = useSyncExternalStore(subscribeCalendarGhost, calendarGhost, calendarGhost);
  // Where it goes: the ghost's time on this day and half, in the lane it
  // takes among the day's other plans (the same packing the Clock uses).
  const target = useMemo(() => {
    const id = carriedClockId(g);
    if (!id) return null;
    const withG = withCarried(planned, g, ymd, half);
    const t = withG.find((x) => x.id === id);
    if (!t) return null;
    const lane = packLanes(withG.map((x) => ({ id: x.id, start: x.start, end: x.end }))).get(t.id)?.lane ?? 0;
    return { s: t.start, e: t.end, r: baseR + lane * laneStep, tone: t.colorVar, routine: t.routine === true };
  }, [g, planned, ymd, half, baseR, laneStep]);

  const outer = useRef<SVGPathElement>(null);
  const inner = useRef<SVGPathElement>(null);
  const shown = useRef<Shown | null>(null);
  const frame = useRef(0);
  const s = target?.s;
  const e = target?.e;
  const r = target?.r;
  useLayoutEffect(() => {
    cancelAnimationFrame(frame.current);
    if (s === undefined || e === undefined || r === undefined) { shown.current = null; return; }
    // The path's `d` is written here only (never by React), so a glide is
    // never undone by a render.
    const draw = (v: Shown) => {
      const d = arcPath(v.s, v.e, v.r);
      outer.current?.setAttribute('d', d);
      inner.current?.setAttribute('d', d);
    };
    const to: Shown = { s, e, r };
    const from = shown.current;
    if (!from || reducedMotion() || typeof requestAnimationFrame !== 'function') { shown.current = to; draw(to); return; }
    // From where it is drawn now (a glide caught halfway goes on from there).
    const t0 = performance.now();
    // One clock for the start and the frames (a frame's own time stamp can be
    // on another base, which threw the arc backwards round the dial).
    const step = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - t0) / CARRIED_GLIDE_MS));
      const q = 1 - Math.pow(1 - k, 4);
      const v = { s: from.s + (to.s - from.s) * q, e: from.e + (to.e - from.e) * q, r: from.r + (to.r - from.r) * q };
      shown.current = v;
      draw(v);
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [s, e, r, target?.routine]);

  if (!target) return null;
  return (
    <g data-testid="clock-carried-arc-group" pointerEvents="none" style={{ animation: 'cal-drop-in 120ms ease-out' }}>
      <path ref={outer} data-testid="clock-carried-arc" fill="none" stroke={target.tone} strokeWidth={stroke} strokeLinecap="round" opacity={0.95} />
      {/* A repeating event is an outline on the Clock (Decision 39). */}
      {target.routine && <path ref={inner} fill="none" stroke="var(--k-clock-face, var(--node-bg))" strokeWidth={Math.max(1, stroke - 3)} strokeLinecap="round" />}
    </g>
  );
}
