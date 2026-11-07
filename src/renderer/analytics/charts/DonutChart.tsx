// DonutChart — proportional ring (or pie when innerRatio=0). SVG-only, zero
// dependencies. Renders a slice per slice, a centered total, and a legend
// below. Used for source-mix, sessions split by day-of-week, etc.
//
// The chart auto-sizes to its container via the parent's measured width
// (passed in via the `size` prop); aspect is fixed at width:height = 1:1.05
// so the legend has room.

import { useId } from 'react';
import { fitArcLabel, fitCircleLabel } from './common';

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: readonly DonutSlice[];
  /** 0 → pie chart; 0.55 default → donut. */
  innerRatio?: number;
  /** Centered headline label (e.g. total or "n sessions"). */
  centerPrimary?: string;
  centerSecondary?: string;
  size?: number;
  showLegend?: boolean;
  /** Optional formatter for slice tooltips. */
  formatValue?: (value: number) => string;
}

const DEFAULT_PALETTE = [
  'var(--cyan)',
  'var(--acid)',
  'var(--rust)',
  '#8a7bff',
  'var(--k-an-warm, #ff8e64)',
  '#5dd3c5',
  '#d18bff',
  '#f4d35e',
];

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  const largeArc = sweep > Math.PI ? 1 : 0;
  const o0 = polar(cx, cy, rOuter, startAngle);
  const o1 = polar(cx, cy, rOuter, endAngle);
  if (rInner <= 0) {
    return [
      `M ${cx} ${cy}`,
      `L ${o0.x} ${o0.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${o1.x} ${o1.y}`,
      'Z',
    ].join(' ');
  }
  const i0 = polar(cx, cy, rInner, endAngle);
  const i1 = polar(cx, cy, rInner, startAngle);
  return [
    `M ${o0.x} ${o0.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${o1.x} ${o1.y}`,
    `L ${i0.x} ${i0.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

export function DonutChart({
  data,
  innerRatio = 0.55,
  centerPrimary,
  centerSecondary,
  size = 200,
  showLegend = true,
  formatValue,
}: DonutChartProps) {
  const uid = useId();
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const W = size;
  const chartH = size;
  const cx = W / 2;
  const cy = chartH / 2;
  const rOuter = Math.min(W, chartH) / 2 - 6;
  const rInner = innerRatio > 0 ? rOuter * innerRatio : 0;

  // Empty state — render a thin grey ring so the card doesn't collapse.
  if (total <= 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <svg width={W} height={chartH} viewBox={`0 0 ${W} ${chartH}`} role="img" aria-label="No data">
          <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="var(--k-an-line-2, #2a2e33)" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={rOuter - 4} fill="none" stroke="var(--k-an-bg-2b, #1a1d20)" strokeWidth={1} strokeDasharray="3 5" />
          <text x={cx} y={cy + 4} fontSize={11} textAnchor="middle" fill="var(--k-an-ink-4, #7d848b)" fontFamily="var(--font-mono)">
            no data
          </text>
        </svg>
      </div>
    );
  }

  // Build slices in two passes so we can render hover halos behind every slice.
  let acc = -Math.PI / 2; // start at 12 o'clock
  const slices = data
    .filter((d) => d.value > 0)
    .map((d, i) => {
      const start = acc;
      const sweep = (d.value / total) * Math.PI * 2;
      const end = start + sweep;
      acc = end;
      const color = d.color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]!;
      const path = arcPath(cx, cy, rOuter, rInner, start, end);
      const pct = (d.value / total) * 100;
      // Text containment rule (charts/common.ts): the % label is shrunk until
      // it sits wholly inside its slice, or dropped (the legend still has it).
      const fit = fitArcLabel({ text: `${Math.round(pct)}%`, rOuter, rInner, start, end, maxFont: 12 });
      const pctLabel = fit ? { x: cx + fit.x, y: cy + fit.y, fontSize: fit.fontSize } : null;
      return { ...d, color, path, pct, pctLabel, start, end };
    });

  // Centre text obeys the same containment rule against the donut hole.
  const primaryFont = centerPrimary && rInner > 0
    ? fitCircleLabel(centerPrimary, rInner, Math.max(14, Math.round(rInner * 0.4)), centerSecondary ? 6 : 0, -0.02)
    : null;
  const secondaryFont = centerSecondary && rInner > 0
    ? fitCircleLabel(centerSecondary.toUpperCase(), rInner, 9, 14, 0.1)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg
        data-testid="analytics-donut-chart"
        width={W}
        height={chartH}
        viewBox={`0 0 ${W} ${chartH}`}
        role="img"
        aria-label={`Donut chart with ${slices.length} slices`}
        style={{ display: 'block' }}
      >
        <defs>
          {slices.map((sl) => (
            <linearGradient
              key={sl.id}
              id={`${uid}-grad-${sl.id}`}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor={sl.color} stopOpacity="0.95" />
              <stop offset="100%" stopColor={sl.color} stopOpacity="0.65" />
            </linearGradient>
          ))}
        </defs>
        {slices.map((sl) => (
          <path
            key={sl.id}
            d={sl.path}
            fill={`url(#${uid}-grad-${sl.id})`}
            stroke="var(--k-an-bg, #0e1012)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            style={{ transition: 'opacity 120ms' }}
          >
            <title>{`${sl.label} · ${formatValue ? formatValue(sl.value) : sl.value} (${sl.pct.toFixed(1)}%)`}</title>
          </path>
        ))}
        {/* Slice percentage labels — only where they fit inside the slice */}
        {slices.map((sl) =>
          sl.pctLabel ? (
            <text
              key={`${sl.id}-label`}
              data-testid="donut-slice-label"
              x={sl.pctLabel.x}
              y={sl.pctLabel.y}
              fontSize={sl.pctLabel.fontSize}
              dominantBaseline="central"
              textAnchor="middle"
              fill="#ffffff"
              fontFamily="var(--font-mono)"
              fontWeight={700}
              style={{ paintOrder: 'stroke', stroke: 'rgba(8,10,12,0.85)', strokeWidth: 2.4, strokeLinejoin: 'round' }}
            >
              {Math.round(sl.pct)}%
            </text>
          ) : null,
        )}
        {/* Center label (donut only) */}
        {rInner > 0 && (
          <>
            {centerPrimary && primaryFont !== null && (
              <text
                data-testid="donut-center-primary"
                x={cx}
                y={cy + (centerSecondary ? -6 : 0)}
                dominantBaseline="central"
                fontSize={primaryFont}
                textAnchor="middle"
                fill="var(--k-an-ink, #f4f6f8)"
                fontFamily="var(--font-mono)"
                fontWeight={600}
                style={{ letterSpacing: '-0.02em' }}
              >
                {centerPrimary}
              </text>
            )}
            {centerSecondary && secondaryFont !== null && (
              <text
                x={cx}
                y={cy + 14}
                dominantBaseline="central"
                fontSize={secondaryFont}
                textAnchor="middle"
                fill="var(--k-an-ink-3, #9aa1a8)"
                fontFamily="var(--font-mono)"
                style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
              >
                {centerSecondary}
              </text>
            )}
          </>
        )}
      </svg>

      {showLegend && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px 10px',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--k-an-ink-2, #c8cdd3)',
          }}
        >
          {slices.map((sl) => (
            <span key={sl.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: sl.color,
                  boxShadow: '0 0 4px rgba(0,0,0,0.4)',
                  display: 'inline-block',
                }}
              />
              <span style={{ color: 'var(--k-an-ink-2, #c8cdd3)' }}>{sl.label}</span>
              <span style={{ color: 'var(--k-an-ink-4, #7d848b)' }}>
                · {formatValue ? formatValue(sl.value) : sl.value}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
