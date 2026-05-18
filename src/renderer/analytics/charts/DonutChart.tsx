// DonutChart — proportional ring (or pie when innerRatio=0). SVG-only, zero
// dependencies. Renders a slice per slice, a centered total, and a legend
// below. Used for source-mix, sessions split by day-of-week, etc.
//
// The chart auto-sizes to its container via the parent's measured width
// (passed in via the `size` prop); aspect is fixed at width:height = 1:1.05
// so the legend has room.

import { useId } from 'react';

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
  '#ff8e64',
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
          <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="#2a2e33" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={rOuter - 4} fill="none" stroke="#1a1d20" strokeWidth={1} strokeDasharray="3 5" />
          <text x={cx} y={cy + 4} fontSize={10} textAnchor="middle" fill="#7d848b" fontFamily="var(--font-mono)">
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
      const mid = start + sweep / 2;
      const labelR = (rOuter + rInner) / 2;
      const labelPos = polar(cx, cy, labelR, mid);
      const pct = (d.value / total) * 100;
      return { ...d, color, path, pct, labelPos, start, end };
    });

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
            stroke="#0e1012"
            strokeWidth={1.5}
            strokeLinejoin="round"
            style={{ transition: 'opacity 120ms' }}
          >
            <title>{`${sl.label} · ${formatValue ? formatValue(sl.value) : sl.value} (${sl.pct.toFixed(1)}%)`}</title>
          </path>
        ))}
        {/* Slice percentage labels — only when slice is wide enough to fit */}
        {slices.map((sl) =>
          sl.pct >= 8 ? (
            <text
              key={`${sl.id}-label`}
              x={sl.labelPos.x}
              y={sl.labelPos.y + 3}
              fontSize={10}
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
            {centerPrimary && (
              <text
                x={cx}
                y={cy + (centerSecondary ? -2 : 5)}
                fontSize={Math.max(14, Math.round(rInner * 0.4))}
                textAnchor="middle"
                fill="#f4f6f8"
                fontFamily="var(--font-mono)"
                fontWeight={600}
                style={{ letterSpacing: '-0.02em' }}
              >
                {centerPrimary}
              </text>
            )}
            {centerSecondary && (
              <text
                x={cx}
                y={cy + 14}
                fontSize={9}
                textAnchor="middle"
                fill="#9aa1a8"
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
            fontSize: 9.5,
            color: '#c8cdd3',
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
              <span style={{ color: '#c8cdd3' }}>{sl.label}</span>
              <span style={{ color: '#7d848b' }}>
                · {formatValue ? formatValue(sl.value) : sl.value}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
