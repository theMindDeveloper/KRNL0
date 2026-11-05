// #207 / time-log F11 — the Clock's Week view: the last 7 days as small
// static 24-hour rings (midnight at the top, recorded work as a coloured
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

const C = 50;          // ring centre (viewBox 0 0 100 100)
const R_RIM = 47;      // outer edge of the face
const R_PLAN = 45;     // planned blocks: thin arc just inside the rim
const R_BAND = 37;     // recorded work: a thick band around the day
const BAND_W = 10;
const R_NUM = 25;      // 0 / 6 / 12 / 18 — inside the band, never on a tick

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

interface Props {
  week: readonly WeekDayModel[];
  /** Day hours of "now" (only drawn on today's ring). */
  nowH: number;
  onPick: (ymd: string) => void;
}

export function ClockWeek({ week, nowH, onPick }: Props): JSX.Element {
  const weekTotal = week.reduce((s, d) => s + d.focusMin, 0);
  // Fill the panel: pick the column count that gives the biggest rings.
  const [gridRef, size] = useElementSize<HTMLDivElement>();
  const grid = bestWeekGrid(size.width, size.height, week.length || 7);
  return (
    <div data-testid="clock-week" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
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
            <svg viewBox="0 0 100 100" style={{ width: grid.ring, height: grid.ring, maxWidth: '100%', display: 'block', margin: '0 auto', flexShrink: 1, minHeight: 0 }} aria-label={`${d.label}: ${fmtMinutes(d.focusMin)} recorded`}>
              {/* face + the empty day band */}
              <circle cx={C} cy={C} r={R_RIM} fill="var(--paper-2)" stroke="var(--paper-3)" strokeWidth={0.8} />
              <circle cx={C} cy={C} r={R_BAND} fill="none" stroke="var(--paper-3)" strokeOpacity={0.6} strokeWidth={BAND_W} />
              {/* hour ticks: every hour short, every 6 h longer — outside the band */}
              {Array.from({ length: 24 }).map((_, h) => {
                const a = at24(h, R_RIM - 0.5);
                const b = at24(h, R_RIM - (h % 6 === 0 ? 4 : 2));
                return <line key={h} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--ink-4)" strokeWidth={h % 6 === 0 ? 1 : 0.6} />;
              })}
              {/* recorded work: task-coloured stretches of the band */}
              {d.spans.map((s) => (
                <path key={s.id} d={arc24(s.startH, s.endH, R_BAND)} fill="none" stroke={s.tone} strokeOpacity={s.isBreak ? 0.3 : 0.95} strokeWidth={BAND_W} strokeLinecap="butt" />
              ))}
              {/* plans: thin arc just inside the rim */}
              {d.plans.map((p) => (
                <path key={p.id} d={arc24(p.startH, p.endH, R_PLAN)} fill="none" stroke={p.tone} strokeWidth={1.6} strokeLinecap="round" opacity={0.85} />
              ))}
              {/* 0 / 6 / 12 / 18 inside the band */}
              {[0, 6, 12, 18].map((h) => {
                const q = at24(h, R_NUM);
                return <text key={h} x={q.x} y={q.y + 2.4} textAnchor="middle" fontSize={6.5} fill="var(--ink-4)" fontFamily="var(--font-mono)">{h}</text>;
              })}
              {/* now: a short rust tick across the band (today only) */}
              {d.isToday && (() => {
                const a = at24(nowH, R_RIM);
                const b = at24(nowH, R_BAND - BAND_W / 2 - 1);
                return <line data-testid="clock-week-now" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--rust, var(--ink))" strokeWidth={1.6} strokeLinecap="round" />;
              })()}
              {/* the day's focus total in the middle */}
              <text x={C} y={C + 3.5} textAnchor="middle" fontSize={d.focusMin > 0 ? 10 : 9} fontWeight={600} fill={d.focusMin > 0 ? 'var(--ink)' : 'var(--ink-4)'} fontFamily="var(--font-mono)">
                {d.focusMin > 0 ? fmtMinutes(d.focusMin) : '—'}
              </text>
            </svg>
            <span
              title={d.top ? `${d.top.name} · ${fmtMinutes(d.top.min)}` : undefined}
              style={{ fontSize: 10, color: d.top ? 'var(--ink-2)' : 'var(--ink-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}
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
