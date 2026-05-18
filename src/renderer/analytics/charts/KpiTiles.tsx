// KpiTiles — dashboard-style KPI grid. Replaces the slim TotalsPanel for the
// Overview header. Each tile shows a big number, a delta vs the previous
// equal-length window, and a tiny sparkline so the user can see direction at
// a glance.
//
// Pure props — caller does the bucketing. Tile colour follows the metric
// (cyan = tasks, acid = habits, rust = focus).

import type { DayBucket, OpenCounters, Totals } from '../types';

export interface KpiTilesProps {
  totals: Totals;
  prevTotals?: Totals;
  open?: OpenCounters;
  byDay: readonly DayBucket[];
  /** Optional previous-period byDay for "best day" comparison context. */
  rangeLabel?: string;
}

interface TileSpec {
  label: string;
  value: number | string;
  unit?: string | undefined;
  delta?: number | undefined;
  hint?: string | undefined;
  spark?: readonly number[] | undefined;
  color: string;
  accent: string;
}

function sparkPath(values: readonly number[], w: number, h: number): string {
  if (values.length === 0) return '';
  const max = Math.max(1, ...values);
  if (values.length === 1) {
    const y = h - (values[0]! / max) * h;
    return `M 0 ${y} L ${w} ${y}`;
  }
  const step = w / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * (h - 2) - 1;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function deltaPct(curr: number, prev: number | undefined): number | undefined {
  if (prev === undefined || prev <= 0) return undefined;
  return ((curr - prev) / prev) * 100;
}

const tileStyle = (accent: string): React.CSSProperties => ({
  flex: '1 1 140px',
  minWidth: 130,
  background: 'linear-gradient(180deg, rgba(20,22,24,0.55) 0%, rgba(12,14,16,0.55) 100%)',
  border: '1px solid #23262a',
  borderLeft: `3px solid ${accent}`,
  borderRadius: 6,
  padding: '10px 12px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  position: 'relative',
  overflow: 'hidden',
});

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: '#9aa1a8',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const valueRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  fontFamily: 'var(--font-mono)',
};

const valueStyle: React.CSSProperties = {
  fontSize: 26,
  fontVariantNumeric: 'tabular-nums',
  color: '#f4f6f8',
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: '-0.02em',
};

const unitStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#7d848b',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const hintStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: '#7d848b',
};

function DeltaBadge({ pct }: { pct: number | undefined }) {
  if (pct === undefined) return null;
  const up = pct >= 0;
  const color = up ? 'var(--acid)' : '#ff8e64';
  const sign = up ? '▲' : '▼';
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color,
        background: up ? 'rgba(201,241,88,0.12)' : 'rgba(255,142,100,0.12)',
        border: `1px solid ${up ? 'rgba(201,241,88,0.35)' : 'rgba(255,142,100,0.35)'}`,
        padding: '1px 5px',
        borderRadius: 3,
        letterSpacing: '0.04em',
        fontWeight: 600,
      }}
    >
      {sign} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

export function KpiTiles({ totals, prevTotals, open, byDay, rangeLabel }: KpiTilesProps) {
  // Series for sparklines — last 14 entries of the visible range so each tile
  // shows a short-trend rather than the full window (keeps the lines readable
  // in 60px width).
  const tail = byDay.slice(-14);
  const sparkTasks = tail.map((d) => d.taskCount);
  const sparkHabits = tail.map((d) => d.habitCount);
  const sparkFocus = tail.map((d) => d.focusMin);
  const sparkSessions = tail.map((d) => d.sessions);

  // Peak day across full range — used for the "best day" tile.
  let peakDay: DayBucket | null = null;
  let peakScore = 0;
  for (const d of byDay) {
    const score = d.taskCount + d.habitCount + d.focusMin / 5;
    if (score > peakScore) {
      peakScore = score;
      peakDay = d;
    }
  }

  // Avg / active-day so empty days don't drag the average to zero.
  const activeDays = byDay.filter((d) => d.taskCount > 0 || d.habitCount > 0 || d.focusMin > 0).length;
  const avgTasks = activeDays > 0 ? totals.tasksDone / activeDays : 0;
  const avgFocus = activeDays > 0 ? totals.focusMin / activeDays : 0;

  const completionPct = open && open.tasksTotal > 0
    ? ((open.tasksTotal - open.tasksOpen) / open.tasksTotal) * 100
    : undefined;

  const tiles: TileSpec[] = [
    {
      label: 'Tasks done',
      value: totals.tasksDone,
      unit: '',
      delta: deltaPct(totals.tasksDone, prevTotals?.tasksDone),
      hint: rangeLabel,
      spark: sparkTasks,
      color: 'var(--cyan)',
      accent: 'var(--cyan)',
    },
    {
      label: 'Habit check-ins',
      value: totals.habitCheckins,
      unit: '',
      delta: deltaPct(totals.habitCheckins, prevTotals?.habitCheckins),
      hint: `${(activeDays > 0 ? totals.habitCheckins / activeDays : 0).toFixed(1)}/day · active`,
      spark: sparkHabits,
      color: 'var(--acid)',
      accent: 'var(--acid)',
    },
    {
      label: 'Focus minutes',
      value: totals.focusMin,
      unit: 'min',
      delta: deltaPct(totals.focusMin, prevTotals?.focusMin),
      hint: `${totals.sessions} sessions · ${avgFocus.toFixed(0)}m avg`,
      spark: sparkFocus,
      color: 'var(--rust)',
      accent: 'var(--rust)',
    },
    {
      label: 'Avg tasks/day',
      value: avgTasks.toFixed(1),
      unit: '',
      hint: `${activeDays} active days`,
      spark: sparkSessions,
      color: '#8a7bff',
      accent: '#8a7bff',
    },
    {
      label: 'Peak day',
      value: peakDay ? peakDay.date.slice(5) : '—',
      hint: peakDay
        ? `${peakDay.taskCount}t · ${peakDay.habitCount}h · ${peakDay.focusMin}m`
        : 'no peak yet',
      color: '#5dd3c5',
      accent: '#5dd3c5',
    },
    {
      label: 'Completion',
      value: completionPct !== undefined ? completionPct.toFixed(0) : '—',
      unit: completionPct !== undefined ? '%' : '',
      hint: open ? `${open.tasksOpen} open · ${open.tasksTotal} total` : undefined,
      color: '#f4d35e',
      accent: '#f4d35e',
    },
  ];

  return (
    <div
      data-testid="analytics-kpi-tiles"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        width: '100%',
      }}
    >
      {tiles.map((t) => (
        <div key={t.label} style={tileStyle(t.accent)}>
          <span style={labelStyle}>{t.label}</span>
          <div style={valueRowStyle}>
            <span style={valueStyle}>{t.value}</span>
            {t.unit && <span style={unitStyle}>{t.unit}</span>}
            <div style={{ flex: 1 }} />
            <DeltaBadge pct={t.delta} />
          </div>
          {t.hint && <span style={hintStyle}>{t.hint}</span>}
          {t.spark && t.spark.length > 1 && (
            <svg
              width={'100%'}
              height={22}
              viewBox={`0 0 100 22`}
              preserveAspectRatio="none"
              style={{ marginTop: 2, display: 'block' }}
              aria-hidden
            >
              <path
                d={sparkPath(t.spark, 100, 22)}
                fill="none"
                stroke={t.color}
                strokeWidth={1.3}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
              />
              {/* fill under */}
              <path
                d={`${sparkPath(t.spark, 100, 22)} L 100 22 L 0 22 Z`}
                fill={t.color}
                opacity={0.1}
              />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
