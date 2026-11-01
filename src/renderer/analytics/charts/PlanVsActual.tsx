// Plan vs actual charts — estimate vs tracked per task, planned vs worked per
// day, and the focus mix. One minutes axis per chart (never dual-axis).
//
// Palette validated with the dataviz validator on the analytics surface
// (#16181a, dark): planned #1ba3bb, tracked #c8553d, break #83a332. The
// break/tracked pair is a CVD WARN (ΔE 7.2), so break always carries a hatch
// texture and a text label as secondary encoding.

import type { DayPlanActual, TaskEstimate } from '../estimates';
import { COLOR_AXIS, COLOR_GRID, COLOR_LABEL } from './common';

export const COLOR_PLANNED = '#1ba3bb';
export const COLOR_TRACKED = '#c8553d';
export const COLOR_BREAK = '#83a332';
const COLOR_UNTAGGED = '#6b7178';

export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`;
}

export function Legend({ items }: { items: Array<{ label: string; color: string; hollow?: boolean; hatch?: boolean }> }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: COLOR_LABEL }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span
            aria-hidden
            style={{
              width: 10, height: 10, borderRadius: 2,
              background: it.hollow ? 'transparent' : it.hatch
                ? `repeating-linear-gradient(135deg, ${it.color} 0 2px, transparent 2px 4px)`
                : it.color,
              border: it.hollow ? `1.5px solid ${it.color}` : it.hatch ? `1px solid ${it.color}` : 'none',
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Estimate vs actual per task: a pair of bars on one minutes axis — planned
 * (top) and tracked (below). Tracked longer than planned is an overrun; the
 * value label turns rust.
 */
export function EstimateBars({ tasks, width, maxRows = 10 }: { tasks: readonly TaskEstimate[]; width: number; maxRows?: number }) {
  const rows = tasks.slice(0, maxRows);
  const labelW = Math.min(150, Math.max(90, width * 0.32));
  const valueW = 92;
  const rowH = 26;
  const barH = 8;
  const plotW = Math.max(40, width - labelW - valueW - 8);
  const max = Math.max(1, ...rows.map((t) => Math.max(t.plannedMin, t.trackedMin)));
  const x = (v: number) => (v / max) * plotW;
  const height = rows.length * rowH + 4;
  if (rows.length === 0) {
    return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: COLOR_AXIS, padding: 8 }}>No tracked or finished tasks in this range yet. Tag a pomo session with a task to start comparing.</div>;
  }
  return (
    <svg data-testid="analytics-estimate-bars" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {rows.map((t, i) => {
        const y = i * rowH + 4;
        const over = t.trackedMin - t.plannedMin;
        const label = t.text.length > 22 ? `${t.text.slice(0, 21)}…` : t.text;
        return (
          <g key={t.taskId}>
            <title>{`${t.text}${t.deleted ? ' (deleted)' : ''} · planned ${fmtMinutes(t.plannedMin)} · tracked ${fmtMinutes(t.trackedMin)}${t.plannedMin > 0 ? ` · ${Math.round(t.ratio * 100)}%` : ''}`}</title>
            {/* full-row hit target */}
            <rect x={0} y={y - 4} width={width} height={rowH} fill="transparent" />
            <text x={labelW - 6} y={y + barH + 3} textAnchor="end" fontSize={10} fill={COLOR_LABEL} fontFamily="var(--font-sans)" opacity={t.deleted ? 0.6 : 1}>
              {t.done ? '✓ ' : ''}{label}
            </text>
            {t.plannedMin > 0 && (
              <rect x={labelW} y={y} width={Math.max(2, x(t.plannedMin))} height={barH} rx={2} fill={COLOR_PLANNED} opacity={0.9} />
            )}
            <rect x={labelW} y={y + barH + 2} width={Math.max(t.trackedMin > 0 ? 2 : 0, x(t.trackedMin))} height={barH} rx={2} fill={COLOR_TRACKED} opacity={0.9} />
            <text x={width - 2} y={y + barH + 3} textAnchor="end" fontSize={9.5} fontFamily="var(--font-mono)" fill={over > 0 ? COLOR_TRACKED : COLOR_LABEL}>
              {fmtMinutes(t.trackedMin)} / {fmtMinutes(t.plannedMin)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Planned block minutes vs worked minutes per day (two bars per day, one axis). */
export function DailyPlanActual({ days, width, height }: { days: readonly DayPlanActual[]; width: number; height: number }) {
  const pad = { left: 30, right: 6, top: 8, bottom: 18 };
  const innerW = Math.max(20, width - pad.left - pad.right);
  const innerH = Math.max(20, height - pad.top - pad.bottom);
  const max = Math.max(30, ...days.map((d) => Math.max(d.plannedMin, d.workedMin)));
  const colW = innerW / Math.max(1, days.length);
  const barW = Math.max(1.5, Math.min(14, (colW - 4) / 2));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const labelEvery = Math.ceil(days.length / Math.max(1, Math.floor(innerW / 34)));
  const gridSteps = [0.5, 1];
  return (
    <svg data-testid="analytics-daily-plan-actual" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {gridSteps.map((g) => (
        <g key={g}>
          <line x1={pad.left} x2={pad.left + innerW} y1={y(max * g)} y2={y(max * g)} stroke={COLOR_GRID} strokeWidth={0.5} />
          <text x={pad.left - 4} y={y(max * g) + 3} textAnchor="end" fontSize={8} fill={COLOR_LABEL} fontFamily="var(--font-mono)">{fmtMinutes(max * g)}</text>
        </g>
      ))}
      <line x1={pad.left} x2={pad.left + innerW} y1={pad.top + innerH} y2={pad.top + innerH} stroke={COLOR_AXIS} strokeWidth={0.5} />
      {days.map((d, i) => {
        const cx = pad.left + i * colW + colW / 2;
        return (
          <g key={d.date}>
            <title>{`${d.date} · planned ${fmtMinutes(d.plannedMin)} · worked ${fmtMinutes(d.workedMin)}`}</title>
            <rect x={pad.left + i * colW} y={pad.top} width={colW} height={innerH} fill="transparent" />
            {d.plannedMin > 0 && (
              <rect x={cx - barW - 1} y={y(d.plannedMin)} width={barW} height={pad.top + innerH - y(d.plannedMin)} rx={Math.min(2, barW / 2)} fill={COLOR_PLANNED} opacity={0.85} />
            )}
            {d.workedMin > 0 && (
              <rect x={cx + 1} y={y(d.workedMin)} width={barW} height={pad.top + innerH - y(d.workedMin)} rx={Math.min(2, barW / 2)} fill={COLOR_TRACKED} opacity={0.9} />
            )}
            {i % labelEvery === 0 && (
              <text x={cx} y={height - 5} textAnchor="middle" fontSize={8} fill={COLOR_LABEL} fontFamily="var(--font-mono)">{d.date.slice(5)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Where the observed time went: tagged work, untagged work, breaks. */
export function FocusMix({ mix, width }: { mix: { taggedWorkMin: number; untaggedWorkMin: number; breakMin: number }; width: number }) {
  const total = mix.taggedWorkMin + mix.untaggedWorkMin + mix.breakMin;
  const segs = [
    { key: 'tagged', label: 'Work on a task', min: mix.taggedWorkMin, color: COLOR_TRACKED, hatch: false },
    { key: 'untagged', label: 'Untagged work', min: mix.untaggedWorkMin, color: COLOR_UNTAGGED, hatch: false },
    { key: 'break', label: 'Break', min: mix.breakMin, color: COLOR_BREAK, hatch: true },
  ];
  if (total <= 0) {
    return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: COLOR_AXIS, padding: 8 }}>No pomo time recorded in this range.</div>;
  }
  let cursor = 0;
  const barH = 16;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <svg data-testid="analytics-focus-mix" width={width} height={barH} viewBox={`0 0 ${width} ${barH}`}>
        <defs>
          <pattern id="mix-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
            <rect width="2" height="4" fill={COLOR_BREAK} />
          </pattern>
        </defs>
        {segs.map((s) => {
          const w = (s.min / total) * width;
          const x0 = cursor;
          cursor += w;
          if (w <= 0) return null;
          return (
            <rect key={s.key} x={x0} y={0} width={Math.max(0, w - 2)} height={barH} rx={2}
              fill={s.hatch ? 'url(#mix-hatch)' : s.color} stroke={s.hatch ? COLOR_BREAK : 'none'} strokeWidth={s.hatch ? 1 : 0}>
              <title>{`${s.label} · ${fmtMinutes(s.min)} · ${Math.round((s.min / total) * 100)}%`}</title>
            </rect>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: COLOR_LABEL }}>
        {segs.map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: s.hatch ? `repeating-linear-gradient(135deg, ${s.color} 0 2px, transparent 2px 4px)` : s.color, border: s.hatch ? `1px solid ${s.color}` : 'none' }} />
            {s.label} · {fmtMinutes(s.min)} ({Math.round((s.min / total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}
