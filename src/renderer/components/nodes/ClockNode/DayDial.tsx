// DayDial — the Clock's face, redesigned around "what now / what next".
//
// The old face was an analog clock (hands, 60 ticks, 12 numerals) with the
// data bolted around it: every parallel task added another ring outward, so
// the shape grew a rainbow of slivers and the clock competed with the data.
//
// Here the shape never grows:
//   • PLAN band (outer, fixed thickness): one annular segment per planned task
//     or habit. Parallel tasks SHARE the band — it is split into sub-bands by
//     the shared lane packer — instead of adding rings.
//   • REALITY band (inner, thin): what the pomo observed. Work is coloured by
//     the task it is tagged with (acid when untagged), breaks are hatched and
//     a pause is a gap. Click a span for times / retag / delete.
//   • One "now" needle, four hour labels, and a centre that answers the
//     question a glance at a clock is for: NOW · task · time left, or
//     NEXT · task · in N min, plus what was tracked today.

import type React from 'react';
import { packLanes } from '../../../store/laneLayout';

export interface DialTask {
  id: string;
  start: number; // hour of day (clipped to the shown half)
  end: number;
  name: string;
  colorVar: string;
  source: 'task' | 'habit';
  done: boolean;
}

export interface DialReality {
  id: string;
  startH: number;
  endH: number;
  kind: 'work' | 'break';
  colorVar: string;
  live: boolean;
}

interface Props {
  tasks: readonly DialTask[];
  reality: readonly DialReality[];
  /** 0 for the AM half, 12 for the PM half. */
  winLo: number;
  /** Current hour-of-day when "now" is inside the shown half, else null. */
  nowH: number | null;
  isToday: boolean;
  /** Hour-of-day now when the shown date is today (even if now is in the
   *  other half) — used to dim tasks that already ended. */
  todayNowH: number | null;
  trackedTodayMin: number;
  dateLabel: string;
  onRealityClick: (id: string, e: React.MouseEvent) => void;
}

const C = 120;
const PLAN_OUT = 115;
const PLAN_IN = 89;
const REAL_OUT = 84;
const REAL_IN = 77;
const NEEDLE_IN = 74;

function ang(h: number, winLo: number): number {
  return (((h - winLo) / 12) * 360 - 90) * (Math.PI / 180);
}

function pt(a: number, r: number): [number, number] {
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

/** Filled annular sector between hours [h0, h1] and radii [rIn, rOut]. */
function sector(h0: number, h1: number, rIn: number, rOut: number, winLo: number): string {
  const a0 = ang(h0, winLo);
  const a1 = ang(Math.max(h1, h0 + 0.001), winLo);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(a0, rOut);
  const [x1, y1] = pt(a1, rOut);
  const [x2, y2] = pt(a1, rIn);
  const [x3, y3] = pt(a0, rIn);
  return `M${x0},${y0} A${rOut},${rOut} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rIn},${rIn} 0 ${large} 0 ${x3},${y3} Z`;
}

function fmtClock(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const ampm = hh < 12 ? 'am' : 'pm';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return mm === 0 ? `${h12}${ampm}` : `${h12}:${String(mm).padStart(2, '0')}${ampm}`;
}

function fmtSpan(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function DayDial({ tasks, reality, winLo, nowH, isToday, todayNowH, trackedTodayMin, dateLabel, onRealityClick }: Props) {
  // Parallel tasks share the plan band: split its thickness by lane.
  const lanes = packLanes(tasks.map((t) => ({ id: t.id, start: t.start, end: t.end })));
  const bandT = PLAN_OUT - PLAN_IN;
  const GAP_DEG = 0.6;

  // Centre text: NOW / NEXT / FREE.
  const active = nowH === null ? [] : tasks.filter((t) => t.start <= nowH && nowH < t.end && !t.done);
  // NEXT only makes sense when "now" is on this dial; other days/halves get
  // a summary instead.
  const upcoming = nowH === null
    ? []
    : tasks.filter((t) => t.start > nowH && !t.done).sort((a, b) => a.start - b.start);
  const half = winLo === 0 ? 'AM' : 'PM';
  const doneCount = tasks.filter((t) => t.done).length;
  // Today, but "now" is in the other half: summarise this half instead of
  // claiming it is empty.
  const otherHalf = isToday && nowH === null;
  let kicker = isToday && !otherHalf ? 'FREE' : otherHalf ? `TODAY · ${half}` : `${dateLabel.toUpperCase()} · ${half}`;
  let title = tasks.length === 0
    ? 'Nothing planned'
    : isToday && !otherHalf ? 'Nothing planned' : `${tasks.length} planned`;
  let sub = isToday && !otherHalf
    ? 'for the rest of this half'
    : tasks.length > 0 ? `${doneCount} done · ${tasks.length - doneCount} open` : (otherHalf ? 'now is in the other half' : '');
  let kickerColor = 'var(--ink-3)';
  if (active.length > 0 && nowH !== null) {
    const a = [...active].sort((x, y) => x.end - y.end)[0]!;
    kicker = active.length > 1 ? `NOW · +${active.length - 1} parallel` : 'NOW';
    title = a.name;
    sub = `${fmtSpan((a.end - nowH) * 60)} left · until ${fmtClock(a.end)}`;
    kickerColor = 'var(--acid)';
  } else if (upcoming.length > 0) {
    const n = upcoming[0]!;
    kicker = 'NEXT';
    title = n.name;
    sub = nowH !== null ? `in ${fmtSpan((n.start - nowH) * 60)} · ${fmtClock(n.start)}` : fmtClock(n.start);
    kickerColor = 'var(--cyan)';
  }

  return (
    <svg viewBox="0 0 240 240" style={{ width: '100%', height: '100%', display: 'block' }} data-testid="clock-day-dial">
      <defs>
        <pattern id="dial-break-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.2" height="3" fill="var(--ink-3)" />
        </pattern>
      </defs>

      {/* Band backgrounds */}
      <circle cx={C} cy={C} r={(PLAN_IN + PLAN_OUT) / 2} fill="none" stroke="var(--paper-3)" strokeWidth={bandT} opacity={0.32} />
      <circle cx={C} cy={C} r={(REAL_IN + REAL_OUT) / 2} fill="none" stroke="var(--paper-3)" strokeWidth={REAL_OUT - REAL_IN} opacity={0.22} />

      {/* Hour ticks (in the gap between bands) + four labels */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = ang(winLo + i, winLo);
        const [x0, y0] = pt(a, REAL_OUT + 1.5);
        const [x1, y1] = pt(a, PLAN_IN - 1);
        return <line key={`t${i}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--ink-4)" strokeWidth={i % 3 === 0 ? 1.4 : 0.7} />;
      })}
      {[0, 3, 6, 9].map((i) => {
        const [x, y] = pt(ang(winLo + i, winLo), 66);
        const hourOfDay = winLo + i;
        const label = hourOfDay % 12 === 0 ? 12 : hourOfDay % 12;
        return (
          <text key={`l${i}`} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={8.5} fill="var(--ink-4)">
            {label}
          </text>
        );
      })}

      {/* PLAN band */}
      {tasks.map((t) => {
        const p = lanes.get(t.id) ?? { lane: 0, laneCount: 1, span: 1 };
        const sub = bandT / p.laneCount;
        const rOut = PLAN_OUT - p.lane * sub;
        const rIn = rOut - sub * p.span + (p.laneCount > 1 ? 1 : 0);
        const ended = todayNowH !== null && t.end <= todayNowH;
        const isActive = nowH !== null && t.start <= nowH && nowH < t.end;
        const gap = (GAP_DEG / 360) * 12;
        return (
          <path
            key={t.id}
            data-testid="clock-plan-arc"
            d={sector(t.start + gap, t.end - gap, rIn, rOut, winLo)}
            fill={t.colorVar}
            opacity={t.done ? 0.3 : ended ? 0.5 : isActive ? 1 : 0.85}
            stroke={isActive ? 'var(--ink)' : 'none'}
            strokeWidth={isActive ? 0.8 : 0}
          >
            <title>{`${t.name}${t.source === 'habit' ? ' (habit)' : ''} · ${fmtClock(t.start)}–${fmtClock(t.end)}${t.done ? ' · done' : ''}`}</title>
          </path>
        );
      })}

      {/* REALITY band */}
      {reality.map((r) => (
        <path
          key={`r-${r.id}`}
          data-testid="clock-reality-arc"
          data-reality-kind={r.kind}
          data-reality-live={r.live ? 'true' : undefined}
          d={sector(r.startH, r.endH, REAL_IN, REAL_OUT, winLo)}
          fill={r.kind === 'work' ? r.colorVar : 'url(#dial-break-hatch)'}
          opacity={r.live ? 1 : 0.9}
          style={{ cursor: 'pointer' }}
          onClick={(e) => onRealityClick(r.id, e)}
          onContextMenu={(e) => { e.preventDefault(); onRealityClick(r.id, e); }}
        >
          <title>{`${r.kind === 'work' ? 'Focus' : 'Break'} · ${fmtClock(r.startH)}–${r.live ? 'now' : fmtClock(r.endH)}`}</title>
        </path>
      ))}

      {/* NOW needle */}
      {nowH !== null && (() => {
        const a = ang(nowH, winLo);
        const [x0, y0] = pt(a, NEEDLE_IN);
        const [x1, y1] = pt(a, PLAN_OUT + 3);
        return (
          <g data-testid="clock-now-needle">
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--rust)" strokeWidth={2} strokeLinecap="round" />
            <circle cx={x1} cy={y1} r={2.6} fill="var(--rust)" />
          </g>
        );
      })()}

      {/* Centre: what now / what next */}
      <g data-testid="clock-dial-centre" style={{ pointerEvents: 'none' }}>
        <text x={C} y={C - 22} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={8.5} letterSpacing="1.2" fill={kickerColor}>
          {kicker}
        </text>
        <text x={C} y={C - 4} textAnchor="middle" fontFamily="var(--font-sans)" fontSize={14} fontWeight={700} fill="var(--ink)">
          {truncate(title, 18)}
        </text>
        <text x={C} y={C + 12} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="var(--ink-3)">
          {sub}
        </text>
        <text x={C} y={C + 32} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={8} fill="var(--ink-4)">
          {`tracked today ${fmtSpan(trackedTodayMin)}`}
        </text>
      </g>
    </svg>
  );
}
