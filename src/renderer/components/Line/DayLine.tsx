// The day as a line: PLAN above REAL, hours left to right, a hand for now.
// Used at three sizes (Today, a Week row, the dock above the Board).

import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';
import { LineGlyph } from '../ui/LineGlyph';
import { fmtClock, fmtDur, type DayData, type GapMark, type PlanMark } from './dayData';

/** Cards opened from a mark, hosted once by the layout. */
export interface LineUi {
  openPlan: (mark: PlanMark, at: { x: number; y: number }) => void;
  openGap: (gap: GapMark, at: { x: number; y: number }) => void;
}
export const LineUiContext = createContext<LineUi>({ openPlan: () => {}, openGap: () => {} });

export interface LineRange { h0: number; h1: number }

/** 06–24 by default; earlier when something on these days starts before six. */
export function rangeFor(days: readonly DayData[]): LineRange {
  let h0 = 6;
  for (const d of days) {
    for (const m of [...d.plans, ...d.real]) {
      const h = Math.floor((m.startMs - d.d0) / 3_600_000);
      if (h < h0) h0 = h;
    }
  }
  return { h0: Math.max(0, h0), h1: 24 };
}

const HOUR = 3_600_000;

/** Rows for plans that overlap (parallel plans), so none hides another. */
export function planRows(plans: readonly PlanMark[]): { row: Map<string, number>; rows: number } {
  const ends: number[] = [];
  const row = new Map<string, number>();
  for (const p of plans) {
    let r = ends.findIndex((e) => e <= p.startMs);
    if (r === -1) { r = ends.length; ends.push(p.endMs); } else ends[r] = p.endMs;
    row.set(p.id, r);
  }
  return { row, rows: Math.max(1, ends.length) };
}

export interface Ghost { startMs: number; endMs: number; text: string }

interface Props {
  data: DayData;
  nowMs: number;
  range: LineRange;
  size?: 'full' | 'compact' | 'dock';
  scale?: boolean;
  /** What sits left of the lanes instead of PLAN / REAL (a Week row's day). */
  gutter?: ReactNode;
  ghost?: Ghost | null;
}

export function DayLine({ data, nowMs, range, size = 'full', scale = true, gutter, ghost = null }: Props) {
  const ui = useContext(LineUiContext);
  const span = (range.h1 - range.h0) * HOUR;
  const t0 = data.d0 + range.h0 * HOUR;
  const left = (ms: number): number => Math.min(100, Math.max(0, ((ms - t0) / span) * 100));
  const box = (a: number, b: number): { left: string; width: string } => ({ left: `${left(a)}%`, width: `max(3px, calc(${left(b) - left(a)}% - 2px))` });
  const hours: number[] = [];
  for (let h = range.h0; h <= range.h1; h++) hours.push(h);
  // Rows only at full size; the small lines let parallel plans overlap
  // instead of thinning them to hairlines.
  const laid = planRows(data.plans);
  const rows = size === 'full' ? laid.rows : 1;
  const row = size === 'full' ? laid.row : new Map<string, number>();
  const isToday = nowMs >= data.d0 && nowMs < data.d1;
  const at = (e: MouseEvent): { x: number; y: number } => ({ x: e.clientX, y: e.clientY });
  const label = size !== 'compact';
  // Names on the small dock only when no two plans overlap (overlapping names are unreadable).
  const planLabel = label && (size === 'full' || laid.rows === 1);

  return (
    <div className={`kl-line${size === 'compact' ? ' kl-line--compact' : size === 'dock' ? ' kl-line--dock' : ''}`} data-testid={`line-day-${data.day}`}>
      {scale && (
        <div className="kl-scale" aria-hidden>
          {hours.map((h) => <span key={h} style={{ left: `${left(data.d0 + h * HOUR)}%` }}>{String(h).padStart(2, '0')}</span>)}
        </div>
      )}
      <div className="kl-lanes">
        {gutter !== undefined && <div className="kl-gutter" style={{ left: -64, top: 0, bottom: 0 }}>{gutter}</div>}
        {/* Parallel plans get a row each, and the lane grows so every name stays readable. */}
        <div className="kl-lane kl-lane--plan" style={size === 'full' && rows > 2 ? { height: rows * 24 } : undefined}>
          {gutter === undefined && <span className="kl-gutter" style={{ left: -64, top: 0, bottom: 0 }}>PLAN</span>}
          {hours.map((h) => <span key={h} className="kl-grid" style={{ left: `${left(data.d0 + h * HOUR)}%` }} />)}
          {data.plans.map((p) => {
            const r = row.get(p.id) ?? 0;
            const cls = p.kind === 'event' ? 'event' : p.state;
            const title = `${p.text} · ${fmtClock(p.startMs)} – ${fmtClock(p.endMs)}${p.kind === 'event' ? ' · repeats' : p.state === 'missed' ? ' · its time passed' : p.state === 'covered' ? ` · recorded ${fmtDur(p.recordedMs)}` : ''}`;
            return (
              <button
                key={p.id}
                type="button"
                className={`kl-pb kl-pb--${cls}`}
                data-testid={`line-plan-${p.id}`}
                data-state={cls}
                title={title}
                style={{ ...box(p.startMs, p.endMs), top: `${(r / rows) * 100}%`, height: `${100 / rows}%` }}
                onClick={(e) => { if (p.kind === 'plan') ui.openPlan(p, at(e)); }}
              >
                {planLabel && (p.state === 'done' || p.state === 'covered') && <LineGlyph name="check" size={11} weight={2.8} />}
                {planLabel && p.text}
              </button>
            );
          })}
          {ghost && <div className="kl-pb kl-pb--ghost" data-testid="line-ghost" style={{ ...box(ghost.startMs, ghost.endMs), top: 0, height: '100%' }}>{ghost.text}</div>}
        </div>
        <div className="kl-lane kl-lane--real">
          {gutter === undefined && <span className="kl-gutter" style={{ left: -64, top: 0, bottom: 0 }}>REAL</span>}
          {hours.map((h) => <span key={h} className="kl-grid" style={{ left: `${left(data.d0 + h * HOUR)}%` }} />)}
          {data.real.map((r) => (
            <div
              key={r.id}
              className={`kl-rb${r.live ? ' kl-rb--live' : ''}`}
              data-testid={`line-real-${r.id}`}
              title={`${r.label} · ${fmtClock(r.startMs)} – ${fmtClock(r.endMs)} · ${fmtDur(r.endMs - r.startMs)}`}
              style={{ ...box(r.startMs, r.endMs), top: 0, height: '100%', background: r.color }}
            >
              {label ? `${r.label} ${fmtDur(r.endMs - r.startMs)}` : r.label}
            </div>
          ))}
          {data.gaps.map((g) => (
            <button
              key={g.startMs}
              type="button"
              className="kl-gap"
              data-testid="line-gap"
              title={`${fmtClock(g.startMs)} – ${fmtClock(g.endMs)} · ${fmtDur(g.endMs - g.startMs)} with nothing recorded. Click to say what it was.`}
              style={{ ...box(g.startMs, g.endMs), top: 0, height: '100%' }}
              onClick={(e) => ui.openGap(g, at(e))}
            >
              {label ? `? ${fmtDur(g.endMs - g.startMs)}` : ''}
            </button>
          ))}
        </div>
        {isToday && left(nowMs) > 0 && left(nowMs) < 100 && (
          <div className="kl-nowc" data-testid="line-now" style={{ left: `${left(nowMs)}%` }}>{size === 'full' && <span>{fmtClock(nowMs)}</span>}</div>
        )}
      </div>
    </div>
  );
}
