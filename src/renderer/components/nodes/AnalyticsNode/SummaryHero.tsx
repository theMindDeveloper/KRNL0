// The Summary page of Analytics (Decision 57): it answers "how did my time
// go in this period?" in one look.
//
//   - the headline sentence, set large in the reading font;
//   - four figures in one divided band (label over value), each with its
//     change in words against the period before ("+7 on the 30 days before"),
//     never a percentage off a near-empty baseline;
//   - Focus per day as a real chart: gridlines with hour labels, dates under
//     it, the average as a dashed line and stated in words, today marked;
//   - the plain sentences (analytics/summary.ts — the same text
//     `sys analytics summary` prints).
// One hue (the accent) for the data; everything else is ink and paper, so it
// follows the light and dark themes and every frame style.

import type { AnalyticsSummary } from '../../../analytics/summary';
import type { DayBucket } from '../../../analytics/types';
import { useElementSize } from '../../../analytics';
import { cardPlacement } from './guide';
import './analytics.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function hm(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, '0')}m`;
}

const dayLabel = (ymd: string): string => `${MONTHS[Number(ymd.slice(5, 7)) - 1] ?? ''} ${Number(ymd.slice(8, 10))}`;

/** Days grouped into weeks when a range is too long for a bar a day. */
export function focusBars(byDay: readonly DayBucket[]): Array<{ key: string; from: string; to: string; min: number }> {
  if (byDay.length <= 62) return byDay.map((d) => ({ key: d.date, from: d.date, to: d.date, min: d.focusMin }));
  const out: Array<{ key: string; from: string; to: string; min: number }> = [];
  for (let i = 0; i < byDay.length; i += 7) {
    const week = byDay.slice(i, i + 7);
    out.push({ key: week[0]!.date, from: week[0]!.date, to: week[week.length - 1]!.date, min: week.reduce((a, d) => a + d.focusMin, 0) });
  }
  return out;
}

/** A round hour step so the tallest bar sits under three gridlines or fewer. */
export function hourStep(maxMin: number): number {
  for (const step of [15, 30, 60, 120, 180, 240, 360, 480, 720, 1440, 2880]) if (maxMin <= step * 3) return step;
  return Math.ceil(maxMin / 3 / 1440) * 1440;
}

function FocusPerDay({ byDay }: { byDay: readonly DayBucket[] }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const bars = focusBars(byDay);
  const weekly = bars.length !== byDay.length;
  const active = byDay.filter((d) => d.focusMin > 0);
  const avg = active.length > 0 ? active.reduce((a, d) => a + d.focusMin, 0) / byDay.length : 0;
  const max = Math.max(1, ...bars.map((b) => b.min));
  const step = hourStep(max);
  const top = Math.ceil(max / step) * step;
  const W = Math.max(160, size.width || 320);
  const H = Math.max(80, size.height || 120);
  const padR = 34;
  const padB = 18;
  const plotW = W - padR;
  const plotH = H - padB - 4;
  const y = (m: number): number => 4 + plotH - (m / top) * plotH;
  const bw = plotW / Math.max(1, bars.length);
  const gap = Math.min(4, bw * 0.28);
  const ticks: number[] = [];
  for (let t = step; t <= top; t += step) ticks.push(t);
  const xLabels = bars.length >= 3 ? [0, Math.floor((bars.length - 1) / 2), bars.length - 1] : bars.map((_, i) => i);
  const avgDay = weekly ? avg * 7 : avg;

  return (
    <figure className="an-fpd" data-testid="analytics-focus-per-day">
      <figcaption className="an-fpd__head">
        <span className="an-fpd__title">Focus per {weekly ? 'week' : 'day'}</span>
        {avg > 0 && <span className="an-fpd__note" data-testid="analytics-focus-average">average {hm(avgDay)} a {weekly ? 'week' : 'day'}</span>}
      </figcaption>
      <div ref={ref} className="an-fpd__plot">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Focus per ${weekly ? 'week' : 'day'}: average ${hm(avgDay)}`}>
          {/* Gridlines: the baseline solid, round hours faint, labelled on the right. */}
          <line x1={0} x2={plotW} y1={y(0)} y2={y(0)} className="an-fpd__base" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={plotW} y1={y(t)} y2={y(t)} className="an-fpd__grid" />
              <text x={W - 2} y={y(t) + 3.5} textAnchor="end" className="an-fpd__tick">{hm(t)}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            const h = b.min > 0 ? Math.max(2, y(0) - y(b.min)) : 0;
            const last = i === bars.length - 1;
            return (
              <rect key={b.key} x={i * bw + gap / 2} y={y(0) - h} width={Math.max(1, bw - gap)} height={h} rx={Math.min(3, (bw - gap) / 3)}
                className={last ? 'an-fpd__bar an-fpd__bar--now' : 'an-fpd__bar'}>
                <title>{`${b.from === b.to ? dayLabel(b.from) : `${dayLabel(b.from)} – ${dayLabel(b.to)}`}: ${hm(b.min)} focus`}</title>
              </rect>
            );
          })}
          {avgDay > 0 && <line x1={0} x2={plotW} y1={y(avgDay)} y2={y(avgDay)} className="an-fpd__avg" />}
          {xLabels.map((i) => (
            <text key={i} x={Math.min(plotW - 1, Math.max(1, i * bw + bw / 2))} y={H - 3} textAnchor={i === 0 ? 'start' : i === bars.length - 1 ? 'end' : 'middle'} className="an-fpd__tick">
              {i === bars.length - 1 && !weekly ? 'Today' : dayLabel(bars[i]!.from)}
            </text>
          ))}
        </svg>
      </div>
    </figure>
  );
}

export function SummaryHero({ summary, byDay, rangeDays = 30 }: { summary: AnalyticsSummary; byDay: readonly DayBucket[]; rangeDays?: number }) {
  return (
    <section data-page-item data-page-start data-testid="analytics-summary" className="an-summary" style={cardPlacement('summary')}>
      <h3 data-testid="analytics-summary-headline" className="an-summary__headline">{summary.headline}</h3>

      {/* Four figures in one band, divided by hairlines (2 × 2 when narrow). */}
      <dl className="an-kpis">
        {summary.stats.map((s) => {
          const change = s.change ?? null;
          const zero = s.value === '0' || s.value === '0m';
          const words = change === null ? (zero ? 'none yet' : 'new this period') : change === '±0' ? `same as the ${rangeDays} days before` : `${change} on the ${rangeDays} days before`;
          const trend = change === null || change === '±0' ? 'flat' : change.startsWith('+') ? 'up' : 'down';
          return (
            <div key={s.key} className="an-kpi" data-testid={`analytics-summary-stat-${s.key}`}>
              <dt>{s.label}</dt>
              <dd className="an-kpi__value">{s.value}</dd>
              <dd className="an-kpi__delta" data-trend={trend}>{words}</dd>
            </div>
          );
        })}
      </dl>

      {byDay.length > 1 && <FocusPerDay byDay={byDay} />}

      {/* The sentences take what's left; in a small window they scroll rather than being cut. */}
      <ul className="an-summary__notes nowheel">
        {summary.sentences.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </section>
  );
}
