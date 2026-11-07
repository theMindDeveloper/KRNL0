// #207 / time-log F11 — the Clock's Week view: the last 7 days as small
// copies of the main clock face (morning inside, afternoon in the ring) (midnight at the top, recorded work as a coloured
// band, the day's total in the middle). Drawn once per render from the recorded spans and the
// plan; no hover handlers, no second hand, no CSS animation (frame budget,
// #197). Only today's ring carries a "now" tick, refreshed by the Clock's
// existing 30-second tick. Clicking a day opens it in the normal Clock.

import type { TagDef } from '../../../../shared/tags/classify';
import type { RealitySegment } from '../../../store/pomoReality';
import { spanTone } from '../../../store/spanTags';
import {
  lastNDays, ymdToDate, summarizeDay, fmtMinutes, planForDay,
  type TaskInfo, type ScheduledHabit,
} from './dayModel';
import type { ScheduledTaskPlacement } from '../../../store/scheduleSelector';
import { wallHoursFromDayStart } from './wallHours';
import { useElementSize } from '../../../analytics/useElementSize';
import { CX, CY, R_FACE, pt, sectorPath } from './dialGeometry';
import { ClockBezel } from './ClockBezel';
import { useFrameTheme } from '../../../themes/useFrameTheme';
import type { ClockSkin } from '../../../themes/types';

const C = 50;          // 24-h ring helpers (wedge24 / arc24) — viewBox 0 0 100 100

/** 0h at the top, clockwise, a whole day around the ring. */
function rad24(h: number): number {
  return (h / 24) * Math.PI * 2 - Math.PI / 2;
}
function at24(h: number, r: number): { x: number; y: number } {
  const a = rad24(h);
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
}
/** Pie wedge from the centre between two day hours (0–24). */
export function wedge24(startH: number, endH: number, r: number): string {
  const span = Math.max(0.05, Math.min(24, endH - startH));
  if (span >= 23.99) return `M ${C} ${C - r} A ${r} ${r} 0 1 1 ${C - 0.01} ${C - r} Z`;
  const a = at24(startH, r);
  const b = at24(startH + span, r);
  return `M ${C} ${C} L ${a.x} ${a.y} A ${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${b.x} ${b.y} Z`;
}
/** Thin arc between two day hours. */
export function arc24(startH: number, endH: number, r: number): string {
  const span = Math.max(0.05, Math.min(23.99, endH - startH));
  const a = at24(startH, r);
  const b = at24(startH + span, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export interface WeekDayModel {
  ymd: string;
  label: string;
  isToday: boolean;
  /** Recorded spans clipped to the day, in day hours. */
  spans: Array<{ id: string; startH: number; endH: number; tone: string; isBreak: boolean }>;
  plans: Array<{ id: string; startH: number; endH: number; tone: string }>;
  focusMin: number;
  top: { name: string; min: number; tone: string } | null;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Pure: the 7-day model (oldest first, today last). */
export function buildWeek(
  today: string,
  segs: readonly RealitySegment[],
  placements: Iterable<ScheduledTaskPlacement> | null,
  taskInfo: ReadonlyMap<string, TaskInfo>,
  habits: readonly ScheduledHabit[],
  library: readonly TagDef[],
  plain: boolean,
): WeekDayModel[] {
  const placementList = placements ? Array.from(placements) : [];
  return lastNDays(today, 7).slice().sort().map((ymd) => {
    const d = ymdToDate(ymd);
    const spans: WeekDayModel['spans'] = [];
    for (const seg of segs) {
      const s = wallHoursFromDayStart(seg.startMs, ymd);
      const e = wallHoursFromDayStart(seg.endMs, ymd);
      if (!(e > s) || e <= 0 || s >= 24) continue;
      spans.push({
        id: seg.id,
        startH: Math.max(0, s),
        endH: Math.min(24, e),
        tone: spanTone(library, seg, plain),
        isBreak: seg.kind === 'break',
      });
    }
    const plans = [0, 1].flatMap((half) =>
      planForDay(placementList, taskInfo, habits, ymd, half as 0 | 1)
        .map((t) => ({ id: `${t.id}-${half}`, startH: t.start, endH: t.end, tone: t.colorVar })),
    );
    const sum = summarizeDay(segs, ymd, taskInfo, library, plain);
    return {
      ymd,
      label: `${DOW[d.getDay()]} ${d.getDate()}`,
      isToday: ymd === today,
      spans,
      plans,
      focusMin: sum.focusMin,
      top: sum.top,
    };
  });
}

const GAP = 10;
/** Label row above and the top-task row below each ring, plus tile padding and gaps. */
const TILE_CHROME_H = 58;
const TILE_PAD_W = 22;

/**
 * Columns that make the 7 rings as big as possible in a W×H box (rings are
 * square; each tile adds TILE_CHROME_H of text). Wide panel → one row; tall
 * panel → 2–4 columns.
 */
export function bestWeekGrid(width: number, height: number, n = 7): { cols: number; ring: number } {
  let best = { cols: Math.min(n, 4), ring: 40 };
  if (width <= 0 || height <= 0) return best;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const tileW = (width - GAP * (cols - 1)) / cols;
    const tileH = (height - GAP * (rows - 1)) / rows;
    const ring = Math.floor(Math.min(tileW - TILE_PAD_W, tileH - TILE_CHROME_H));
    if (ring > best.ring) best = { cols, ring };
  }
  return best;
}

// ── A small copy of the main Clock face ─────────────────────────────────────
// Same bezel, 60 ticks, numerals 1–12 (12 in rust), hands and hub as the main
// dial (and the same frame-style tokens). A day has 24 h but the face 12, so
// the morning fills the inner disc and the afternoon the outer ring.

const R_TICK_OUT = 84;
const R_TICK_IN = 76;
const R_TICK_IN_MAJ = 72;
const R_NUM = 60;
const R_AM = 46;            // morning: inner disc
const R_PM_IN = 49;         // afternoon: ring between the disc and the ticks
const R_PM_OUT = 70;
const NUMERALS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/** Ring sector between two hours of a 12-h face, from radius rIn to rOut. */
export function ringSector(startH: number, endH: number, rIn: number, rOut: number): string {
  const span = Math.max(0.05, Math.min(11.99, endH - startH));
  const large = span > 6 ? 1 : 0;
  const o1 = pt(startH, rOut); const o2 = pt(startH + span, rOut);
  const i2 = pt(startH + span, rIn); const i1 = pt(startH, rIn);
  return `M ${o1.x} ${o1.y} A ${rOut} ${rOut} 0 ${large} 1 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${rIn} ${rIn} 0 ${large} 0 ${i1.x} ${i1.y} Z`;
}

function MiniHand({ kind, back, len, width }: { kind: 'line' | 'sword' | 'block'; back: number; len: number; width: number }): JSX.Element {
  const color = 'var(--k-clock-hand, var(--ink))';
  if (kind === 'sword') {
    const w = width * 1.4;
    return <path d={`M ${CX - back} ${CY} L ${CX} ${CY - w} L ${CX + len} ${CY} L ${CX} ${CY + w} Z`} fill={color} />;
  }
  return <line x1={CX - back} y1={CY} x2={CX + len} y2={CY} stroke={color} strokeWidth={kind === 'block' ? width * 2 : width} strokeLinecap={kind === 'block' ? 'butt' : 'round'} />;
}

function MiniClock({ day, size, live, skin }: { day: WeekDayModel; size: number; live: boolean; skin: ClockSkin }): JSX.Element {
  const now = new Date();
  const hourAng = ((now.getHours() % 12) + now.getMinutes() / 60) * 30;
  const minAng = now.getMinutes() * 6 + now.getSeconds() * 0.1;
  return (
    <svg viewBox="0 0 240 240" style={{ width: size, height: size, maxWidth: '100%', display: 'block', margin: '0 auto', overflow: 'visible' }}
      aria-label={`${day.label}: ${fmtMinutes(day.focusMin)} recorded`}>
      <title>{`${day.label} — inner: morning (0–12) · outer ring: afternoon (12–24)`}</title>
      <ClockBezel kind={skin.bezel} outerR={R_FACE + 2} />
      <circle cx={CX} cy={CY} r={R_FACE} fill="var(--k-clock-face, var(--node-bg))" stroke="var(--k-clock-tick-minor, var(--paper-3))" strokeWidth={0.8} />
      {/* recorded work — morning inside, afternoon in the ring */}
      {day.spans.flatMap((sp) => {
        const parts: JSX.Element[] = [];
        const op = sp.isBreak ? 0.25 : 0.7;
        if (sp.startH < 12) parts.push(<path key={`${sp.id}-am`} d={sectorPath(sp.startH, Math.min(12, sp.endH), R_AM)} fill={sp.tone} fillOpacity={op} />);
        if (sp.endH > 12) parts.push(<path key={`${sp.id}-pm`} d={ringSector(Math.max(12, sp.startH) - 12, sp.endH - 12, R_PM_IN, R_PM_OUT)} fill={sp.tone} fillOpacity={op} />);
        return parts;
      })}
      <circle cx={CX} cy={CY} r={(R_AM + R_PM_IN) / 2} fill="none" stroke="var(--k-clock-tick-minor, var(--paper-3))" strokeWidth={0.6} strokeDasharray="2 3" />
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const isHour = i % 5 === 0;
        const r1 = isHour ? R_TICK_IN_MAJ : R_TICK_IN;
        return <line key={i} x1={CX + r1 * Math.cos(a)} y1={CY + r1 * Math.sin(a)} x2={CX + R_TICK_OUT * Math.cos(a)} y2={CY + R_TICK_OUT * Math.sin(a)}
          stroke={isHour ? 'var(--k-clock-tick-major, var(--ink-2))' : 'var(--k-clock-tick-minor, var(--ink-3))'} strokeWidth={isHour ? 1.5 : 0.8} />;
      })}
      {NUMERALS.map((n) => {
        const q = pt(n, R_NUM);
        return <text key={n} x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" fontFamily="var(--k-clock-font, var(--font-mono))"
          fontSize={13} fontWeight={n === 12 ? 700 : 600} fill={n === 12 ? 'var(--rust)' : 'var(--k-clock-num, var(--ink-2))'}>{n}</text>;
      })}
      {/* readout window: the day's focus total */}
      {skin.readoutWindow && <rect x={CX - 26} y={CY + 22} width={52} height={15} rx={2} fill="var(--k-clock-face, var(--node-bg))" stroke="var(--k-clock-tick-minor, var(--paper-3))" strokeWidth={0.8} />}
      <text x={CX} y={CY + 30} textAnchor="middle" dominantBaseline="central" fontFamily="var(--k-clock-font, var(--font-mono))" fontSize={10} letterSpacing="0.8"
        fill={day.focusMin > 0 ? 'var(--k-clock-readout, var(--ink-2))' : 'var(--ink-4)'}>
        {day.focusMin > 0 ? fmtMinutes(day.focusMin) : '—'}
      </text>
      {live && (
        <>
          <g transform={`rotate(${hourAng - 90} ${CX} ${CY})`}><MiniHand kind={skin.hand} back={8} len={38} width={3.2} /></g>
          <g transform={`rotate(${minAng - 90} ${CX} ${CY})`}><MiniHand kind={skin.hand} back={10} len={56} width={2} /></g>
          <g data-testid="clock-week-second" style={{ transformOrigin: `${CX}px ${CY}px`, animation: 'clock-sec-sweep 60s linear infinite', animationDelay: `-${now.getSeconds()}s` }}>
            <line x1={CX - 14} y1={CY} x2={CX + 62} y2={CY} stroke="var(--rust)" strokeWidth={1} strokeLinecap="round" opacity={0.9} />
            <circle cx={CX + 60} cy={CY} r={2} fill="var(--rust)" />
          </g>
        </>
      )}
      <circle cx={CX} cy={CY} r={live ? 5 : 3} fill="var(--k-clock-hand, var(--ink))" />
      {live && <circle cx={CX} cy={CY} r={1.6} fill="var(--acid)" />}
    </svg>
  );
}

interface Props {
  week: readonly WeekDayModel[];
  /** Day hours of "now" (only drawn on today's ring). */
  nowH: number;
  onPick: (ymd: string) => void;
}

export function ClockWeek({ week, nowH: _nowH, onPick }: Props): JSX.Element {
  // The same frame style as the main dial (bezel, hands, colours).
  const skin = useFrameTheme().manifest.components.clock;
  const weekTotal = week.reduce((s, d) => s + d.focusMin, 0);
  // Fill the panel: pick the column count that gives the biggest rings.
  const [gridRef, size] = useElementSize<HTMLDivElement>();
  const grid = bestWeekGrid(size.width, size.height, week.length || 7);
  return (
    <div data-testid="clock-week" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
        <span>Last 7 days</span>
        <span data-testid="clock-week-total" style={{ color: 'var(--ink-2)' }}>{fmtMinutes(weekTotal)} focus</span>
      </div>
      <div
        ref={gridRef}
        data-testid="clock-week-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${Math.ceil((week.length || 7) / grid.cols)}, minmax(0, 1fr))`,
          gap: GAP,
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {week.map((d) => (
          <button
            key={d.ymd}
            type="button"
            data-testid={`clock-week-day-${d.ymd}`}
            title={`Open ${d.label} in the clock`}
            onClick={(e) => { e.stopPropagation(); onPick(d.ymd); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between', gap: 6,
              padding: '8px 10px', borderRadius: 10, cursor: 'pointer', minWidth: 0, minHeight: 0,
              background: d.isToday ? 'var(--paper-2)' : 'transparent',
              border: `1px solid ${d.isToday ? 'var(--ink-3)' : 'var(--paper-3)'}`,
              color: 'var(--ink)', fontFamily: 'var(--font-mono)', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: grid.ring > 120 ? 11.5 : 10.5, letterSpacing: '0.04em', color: d.isToday ? 'var(--ink)' : 'var(--ink-2)', fontWeight: d.isToday ? 600 : 400, whiteSpace: 'nowrap' }}>
              {d.isToday ? 'Today' : d.label}
            </span>
            <MiniClock day={d} size={grid.ring} live={d.isToday} skin={skin} />
            <span
              title={d.top ? `${d.top.name} · ${fmtMinutes(d.top.min)}` : undefined}
              style={{ fontSize: 11, color: d.top ? 'var(--ink-2)' : 'var(--ink-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {d.top && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: d.top.tone, flexShrink: 0 }} />}
              {d.top ? d.top.name : 'nothing recorded'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
