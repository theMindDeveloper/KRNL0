// #207 — log time on a 24-hour ring (midnight at the top, like the Clock's
// week rings). The day's recorded sessions are grey stretches of the band;
// the selection is the bright stretch. Drag either end handle to adjust it,
// or press on the band and drag to draw a new one (15-min snap). Sessions
// over noon work — the whole day is one ring — and dragging stops at "now".
// The middle shows the result.

import { useMemo, useRef } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { selectPomoReality } from '../../store/pomoReality';
import { ymdOf } from '../nodes/PomoNode/spanEdit';

const C = 70;
const R = 54;         // band centre
const BAND = 14;
const SNAP_MIN = 15;
const DAY = 1440;

const toMin = (hm: string): number => { const [h, m] = hm.split(':').map(Number) as [number, number]; return h * 60 + m; };
export const toHM = (min: number): string => { const m = ((Math.round(min) % DAY) + DAY) % DAY; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const ang = (min: number): number => (min / DAY) * Math.PI * 2 - Math.PI / 2;
const at = (min: number, r: number): { x: number; y: number } => ({ x: C + r * Math.cos(ang(min)), y: C + r * Math.sin(ang(min)) });
function arc(a: number, b: number, r: number): string {
  const span = Math.max(1, Math.min(DAY - 0.5, b - a));
  const p = at(a, r);
  const q = at(a + span, r);
  return `M ${p.x} ${p.y} A ${r} ${r} 0 ${span > DAY / 2 ? 1 : 0} 1 ${q.x} ${q.y}`;
}
const dur = (m: number): string => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

export interface DaySpanMin { startMin: number; endMin: number }

/** Recorded work on `dayYMD` in minutes of the day (clipped to the day). */
export function workSpansOfDay(segs: ReadonlyArray<{ startMs: number; endMs: number; kind: string }>, dayYMD: string): DaySpanMin[] {
  const [y, mo, d] = dayYMD.split('-').map(Number) as [number, number, number];
  const dayStart = new Date(y, mo - 1, d).getTime();
  const dayEnd = new Date(y, mo - 1, d + 1).getTime();
  return segs
    .filter((s) => s.kind === 'work' && s.endMs > dayStart && s.startMs < dayEnd)
    .map((s) => ({ startMin: (Math.max(s.startMs, dayStart) - dayStart) / 60_000, endMin: (Math.min(s.endMs, dayEnd) - dayStart) / 60_000 }))
    .sort((a, b) => a.startMin - b.startMin);
}

/** Empty stretches ≥ 10 min between recorded sessions (and up to now, today). */
export function gapsOfDay(spans: readonly DaySpanMin[], nowMin: number | null): DaySpanMin[] {
  const out: DaySpanMin[] = [];
  for (let i = 1; i < spans.length; i++) {
    const a = spans[i - 1]!.endMin;
    const b = spans[i]!.startMin;
    if (b - a >= 10) out.push({ startMin: a, endMin: b });
  }
  const last = spans[spans.length - 1];
  if (last && nowMin !== null && nowMin - last.endMin >= 10) out.push({ startMin: last.endMin, endMin: nowMin });
  return out;
}

const chip: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 8px', borderRadius: 5, cursor: 'pointer',
  border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', whiteSpace: 'nowrap',
};

function useDay(dayYMD: string): { spans: DaySpanMin[]; nowMin: number | null } {
  const board = useBoardStore((s) => s.board);
  const spans = useMemo(() => workSpansOfDay(selectPomoReality(board, Date.now()), dayYMD), [board, dayYMD]);
  const now = new Date();
  return { spans, nowMin: dayYMD === ymdOf(Date.now()) ? now.getHours() * 60 + now.getMinutes() : null };
}

/** The ring (top of the Log time popover). */
export function LogTimeDial({ dayYMD, startHM, endHM, onChange }: {
  dayYMD: string;
  startHM: string;
  endHM: string;
  onChange: (startHM: string, endHM: string) => void;
}): JSX.Element {
  const { spans, nowMin } = useDay(dayYMD);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ mode: 'start' | 'end' | 'new'; anchor: number } | null>(null);
  const cap = nowMin ?? DAY; // never past now (today)

  const a = toMin(startHM);
  const bRaw = toMin(endHM);
  const b = bRaw <= a ? bRaw + DAY : bRaw;
  const minAt = (e: React.PointerEvent): number => {
    const r = svgRef.current!.getBoundingClientRect();
    const t = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    const m = ((((t + Math.PI / 2) / (Math.PI * 2)) * DAY) % DAY + DAY) % DAY;
    return Math.min(cap, Math.round(m / SNAP_MIN) * SNAP_MIN);
  };
  const near = (m: number, target: number): boolean => Math.min(Math.abs(m - target), DAY - Math.abs(m - target)) <= 25;
  const set = (lo: number, hi: number): void => {
    const h = Math.min(cap, hi === lo ? lo + SNAP_MIN : hi);
    onChange(toHM(Math.min(lo, h - 5)), toHM(h));
  };
  const hS = at(a, R);
  const hE = at(Math.min(b, DAY - 0.5), R);

  return (
    <svg
      ref={svgRef}
      data-testid="log-time-dial"
      viewBox="0 0 140 140"
      width={176}
      height={176}
      style={{ touchAction: 'none', cursor: 'pointer', display: 'block', margin: '0 auto' }}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        const m = minAt(e);
        if (near(m, a)) drag.current = { mode: 'start', anchor: b % DAY };
        else if (near(m, b % DAY)) drag.current = { mode: 'end', anchor: a };
        else { drag.current = { mode: 'new', anchor: m }; set(m, m + SNAP_MIN); }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const m = minAt(e);
        if (d.mode === 'start') set(Math.min(m, d.anchor), Math.max(m, d.anchor));
        else if (d.mode === 'end') set(Math.min(m, d.anchor), Math.max(m, d.anchor));
        else set(Math.min(d.anchor, m), Math.max(d.anchor, m));
      }}
      onPointerUp={() => { drag.current = null; }}
    >
      <title>Drag an end to adjust · press elsewhere on the ring to draw a new stretch</title>
      <circle cx={C} cy={C} r={R + BAND / 2 + 4} fill="var(--paper-2)" stroke="var(--paper-3)" strokeWidth={0.8} />
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--paper-3)" strokeOpacity={0.7} strokeWidth={BAND} />
      {Array.from({ length: 24 }).map((_, h) => {
        const p = at(h * 60, R + BAND / 2 + 3.5);
        const q = at(h * 60, R + BAND / 2 + (h % 6 === 0 ? 0 : 1.5));
        return <line key={h} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--ink-4)" strokeWidth={h % 6 === 0 ? 1.1 : 0.6} />;
      })}
      {[0, 6, 12, 18].map((h) => { const p = at(h * 60, R - BAND / 2 - 8); return <text key={h} x={p.x} y={p.y + 3} textAnchor="middle" fontSize={8} fill="var(--ink-4)" fontFamily="var(--font-mono)">{h}</text>; })}
      {spans.map((s, i) => <path key={i} d={arc(s.startMin, s.endMin, R)} fill="none" stroke="var(--ink-3)" strokeOpacity={0.6} strokeWidth={BAND} />)}
      <path data-testid="log-time-dial-selection" d={arc(a, Math.min(b, DAY - 0.5), R)} fill="none" stroke="var(--acid)" strokeWidth={BAND} strokeOpacity={0.9} />
      {nowMin !== null && (() => { const p = at(nowMin, R + BAND / 2 + 4); const q = at(nowMin, R - BAND / 2 - 1); return <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--rust)" strokeWidth={1.6} strokeLinecap="round" />; })()}
      <circle data-testid="log-time-dial-start" cx={hS.x} cy={hS.y} r={5.5} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.4} style={{ cursor: 'grab' }} />
      <circle data-testid="log-time-dial-end" cx={hE.x} cy={hE.y} r={5.5} fill="var(--ink)" stroke="var(--paper)" strokeWidth={1.4} style={{ cursor: 'grab' }} />
      <text x={C} y={C - 2} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink)" fontFamily="var(--font-mono)">{startHM}–{endHM}</text>
      <text x={C} y={C + 12} textAnchor="middle" fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-mono)">{dur(Math.max(0, b - a))}</text>
    </svg>
  );
}

/** Quick fill chips under the ring: last 30m / 1h (today) and the day's gaps. */
export function LogTimeQuickFill({ dayYMD, onChange }: { dayYMD: string; onChange: (startHM: string, endHM: string) => void }): JSX.Element | null {
  const { spans, nowMin } = useDay(dayYMD);
  const gaps = gapsOfDay(spans, nowMin).slice(-3);
  if (nowMin === null && gaps.length === 0) return null;
  return (
    <div data-testid="log-time-quick" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
      {nowMin !== null && [30, 60].map((m) => (
        <button key={m} type="button" data-testid={`log-time-last-${m}`} style={chip}
          onClick={() => { const end = Math.floor(nowMin / 5) * 5; onChange(toHM(end - m), toHM(end)); }}>
          last {m === 60 ? '1h' : `${m}m`}
        </button>
      ))}
      {gaps.map((g) => (
        <button key={g.startMin} type="button" data-testid="log-time-gap" style={chip} title="Fill the gap between two sessions"
          onClick={() => onChange(toHM(g.startMin), toHM(g.endMin))}>
          gap {toHM(g.startMin)}–{toHM(g.endMin)}
        </button>
      ))}
    </div>
  );
}
