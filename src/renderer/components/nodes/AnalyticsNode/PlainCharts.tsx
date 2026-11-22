// Plain, readable charts for Analytics (Decision 57). They replace the radar,
// the pies and the spiky lines: a comparison is a table, a split is a list of
// bars, counts per day are bars, the weekdays are seven bars with the best
// one named. One hue per chart; numbers in tabular digits; every figure has
// its unit; nothing needs a legend to be read.

import type { AnalyticsMetric } from './types';
import type { DayBucket } from '../../../analytics/types';
import type { RadarAxis } from '../../../analytics';
import './analytics.css';

export const ACCENT = 'var(--k-an-accent-ink, var(--acid-ink, var(--acid)))';

export function hm(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, '0')}m`;
}

/** A list of labelled bars, longest first: where something came from. */
export function BarList({ rows, color = ACCENT, testId, share = false }: { rows: Array<{ id: string; label: string; value: number; display?: string; note?: string }>; color?: string; testId?: string; /** Show each row's share of the whole (only where the rows add up to one whole). */ share?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (rows.length === 0 || total === 0) return <p className="an-empty">Nothing in this period yet.</p>;
  return (
    <ul className="an-barlist" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.id}>
          {/* The name on its own line (read in full at any width), the bar, then the figure. */}
          <span className="an-barlist__label">{r.label}</span>
          <span className="an-barlist__track" aria-hidden="true"><i style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} /></span>
          <span className="an-barlist__value">{r.display ?? r.value}{share && <span className="an-barlist__share"> · {Math.round((r.value / total) * 100)}%</span>}</span>
          {r.note && <span className="an-barlist__note">{r.note}</span>}
        </li>
      ))}
    </ul>
  );
}

/** This period beside the one before, one line a measure: the figure and its change ("was …" on hover). */
export function CompareTable({ axes, rangeDays }: { axes: readonly RadarAxis[]; rangeDays: number }) {
  const fmt = (a: RadarAxis, v: number): string => (a.key === 'focus' ? hm(v) : a.key === 'active' ? `${v} of ${a.max ?? rangeDays}` : String(Math.round(v)));
  return (
    <dl className="an-compare" data-testid="analytics-compare">
      {axes.map((a) => {
        const prev = a.previous;
        const diff = prev === undefined ? null : a.value - prev;
        const trend = diff === null || diff === 0 ? 'flat' : diff > 0 ? 'up' : 'down';
        const label = a.key === 'focus' ? 'Focus' : a.key === 'active' ? 'Active days' : a.key === 'streak' ? 'Longest streak' : a.key === 'habits' ? 'Habit check-ins' : a.key === 'tasks' ? 'Tasks done' : a.label;
        return (
          <div key={a.key} className="an-compare__row" title={prev === undefined ? `${label}: nothing before` : `${label}: was ${fmt(a, prev)} in the ${rangeDays} days before`}>
            <dt>{label}</dt>
            <dd className="an-compare__now">{fmt(a, a.value)}</dd>
            <dd className="an-compare__diff" data-trend={trend}>{diff === null ? 'new' : diff === 0 ? '±0' : `${diff > 0 ? '+' : '−'}${a.key === 'focus' ? hm(Math.abs(diff)) : Math.abs(Math.round(diff))}`}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** "45m", "6h": short enough for a seventh of a phone. */
const compact = (m: number): string => (m < 60 ? `${Math.round(m)}m` : `${Math.round(m / 60)}h`);

export function WeekdayBars({ values, fmt = compact, color = ACCENT, height = 160 }: { values: readonly number[]; fmt?: (n: number) => string; color?: string; height?: number }) {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = Math.max(1, ...values);
  const best = values.indexOf(Math.max(...values));
  const any = values.some((v) => v > 0);
  if (!any) return <p className="an-empty">Nothing in this period yet.</p>;
  return (
    <div className="an-weekdays" style={{ height }} data-testid="analytics-weekday-bars">
      {labels.map((l, i) => {
        const v = values[i] ?? 0;
        return (
          <div key={l} className="an-weekdays__col" data-best={i === best ? 'true' : undefined}>
            <span className="an-weekdays__value">{v > 0 ? fmt(v) : ''}</span>
            <span className="an-weekdays__bar" style={{ height: `${Math.max(v > 0 ? 3 : 1, (v / max) * 100)}%`, background: v > 0 ? (i === best ? color : `color-mix(in srgb, ${color} 55%, transparent)`) : 'var(--k-an-line, var(--paper-3))' }} />
            <span className="an-weekdays__label"><span className="an-weekdays__long">{l}</span><span className="an-weekdays__short" aria-hidden="true">{l.slice(0, 1)}</span></span>
          </div>
        );
      })}
    </div>
  );
}

const METRIC_OF: Record<AnalyticsMetric, (d: DayBucket) => number> = {
  taskCount: (d) => d.taskCount,
  habitCount: (d) => d.habitCount,
  focusMin: (d) => d.focusMin,
  sessions: (d) => d.sessions,
};

/** One bar a day for the chosen measure (a whole-number count reads as bars, not a zigzag line). */
export function DayBars({ data, metric, width, height, color }: { data: readonly DayBucket[]; metric: AnalyticsMetric; width: number; height: number; color: string }) {
  const vals = data.map(METRIC_OF[metric]);
  const max = Math.max(1, ...vals);
  const padB = 16;
  const plotH = Math.max(20, height - padB - 6);
  const bw = width / Math.max(1, vals.length);
  const gap = Math.min(3, bw * 0.25);
  const fmt = metric === 'focusMin' ? hm : (n: number) => String(n);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const lab = (ymd: string): string => `${MONTHS[Number(ymd.slice(5, 7)) - 1] ?? ''} ${Number(ymd.slice(8, 10))}`;
  const idx = vals.length >= 3 ? [0, Math.floor((vals.length - 1) / 2), vals.length - 1] : vals.map((_, i) => i);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Per day, highest ${fmt(max)}`} data-testid="analytics-day-bars">
      <line x1={0} x2={width} y1={6 + plotH} y2={6 + plotH} className="an-fpd__base" />
      <line x1={0} x2={width} y1={6} y2={6} className="an-fpd__grid" />
      <text x={width - 2} y={16} textAnchor="end" className="an-fpd__tick">{fmt(max)}</text>
      {vals.map((v, i) => {
        const h = v > 0 ? Math.max(2, (v / max) * plotH) : 0;
        return (
          <rect key={data[i]!.date} x={i * bw + gap / 2} y={6 + plotH - h} width={Math.max(1, bw - gap)} height={h} rx={Math.min(2.5, (bw - gap) / 3)} fill={color} opacity={i === vals.length - 1 ? 1 : 0.78}>
            <title>{`${lab(data[i]!.date)}: ${fmt(v)}`}</title>
          </rect>
        );
      })}
      {idx.map((i) => (
        <text key={i} x={Math.min(width - 1, Math.max(1, i * bw + bw / 2))} y={height - 2} textAnchor={i === 0 ? 'start' : i === vals.length - 1 ? 'end' : 'middle'} className="an-fpd__tick">
          {i === vals.length - 1 ? 'Today' : lab(data[i]!.date)}
        </text>
      ))}
    </svg>
  );
}

/** Twenty-four bars, midnight first; the busiest hour is named under them. */
export function HourBars({ values, fmt = (n: number) => String(Math.round(n)), color = ACCENT, height = 160 }: { values: readonly number[]; fmt?: (n: number) => string; color?: string; height?: number }) {
  const max = Math.max(1, ...values);
  const best = values.indexOf(Math.max(...values));
  if (!values.some((v) => v > 0)) return <p className="an-empty">Nothing in this period yet.</p>;
  return (
    <div className="an-hours" style={{ height }} data-testid="analytics-hour-bars">
      <div className="an-hours__bars">
        {values.map((v, h) => (
          <span key={h} className="an-hours__bar" title={`${String(h).padStart(2, '0')}:00 · ${fmt(v)}`}
            style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 2}%`, background: v > 0 ? (h === best ? color : `color-mix(in srgb, ${color} 55%, transparent)`) : 'var(--k-an-line, var(--paper-3))' }} />
        ))}
      </div>
      <div className="an-hours__axis" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      <p className="an-hours__note">Busiest around <b>{String(best).padStart(2, '0')}:00</b> · {fmt(values[best] ?? 0)}</p>
    </div>
  );
}
