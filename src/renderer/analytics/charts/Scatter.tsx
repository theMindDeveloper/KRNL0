// Scatter — multivariate plot. X/Y are independent numeric metrics; an
// optional `r` field encodes a third variable as point radius (bubble chart).
// Used in the Insights view to surface correlations like tasks-done vs
// focus-minutes per day, sized by habit check-ins.

import { useMemo } from 'react';
import { COLOR_AXIS, COLOR_GRID, COLOR_LABEL } from './common';

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  /** Optional third dimension — point radius. Defaults to a fixed size. */
  r?: number;
  /** Tooltip label. */
  label?: string;
  color?: string;
}

export interface ScatterProps {
  data: readonly ScatterPoint[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  /** Per-axis caps. Auto-derived from data when omitted. */
  xMax?: number;
  yMax?: number;
  pointColor?: string;
}

export function Scatter({
  data,
  width = 320,
  height = 220,
  xLabel,
  yLabel,
  xMax,
  yMax,
  pointColor = 'var(--cyan)',
}: ScatterProps) {
  const pad = { left: 32, right: 12, top: 14, bottom: 28 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = Math.max(40, height - pad.top - pad.bottom);

  // Derive scales + correlation in one pass for tooltip-friendly memoization.
  const { xScale, yScale, rScale, xPeak, yPeak, correlation } = useMemo(() => {
    let xPeak = xMax ?? 1;
    let yPeak = yMax ?? 1;
    let rPeak = 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    let n = 0;
    for (const p of data) {
      if (xMax === undefined && p.x > xPeak) xPeak = p.x;
      if (yMax === undefined && p.y > yPeak) yPeak = p.y;
      if (p.r !== undefined && p.r > rPeak) rPeak = p.r;
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumXX += p.x * p.x;
      sumYY += p.y * p.y;
      n += 1;
    }
    xPeak = Math.max(1, xPeak);
    yPeak = Math.max(1, yPeak);
    // Pearson correlation — used to render a hint line + value. NaN when
    // variance is zero (all-equal axis) → treated as 0 (no relationship).
    let correlation = 0;
    if (n > 1) {
      const numer = n * sumXY - sumX * sumY;
      const denom = Math.sqrt(
        (n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY),
      );
      correlation = denom > 0 ? numer / denom : 0;
    }
    return {
      xScale: (v: number) => pad.left + (v / xPeak) * innerW,
      yScale: (v: number) => pad.top + innerH - (v / yPeak) * innerH,
      rScale: (v: number | undefined) =>
        rPeak > 0 ? 3 + (Math.max(0, v ?? 0) / rPeak) * 6 : 4,
      xPeak,
      yPeak,
      correlation,
    };
  }, [data, xMax, yMax, innerW, innerH, pad.left, pad.top]);

  // 4-step gridlines for readability
  const gridY = [0.25, 0.5, 0.75, 1].map((t) => pad.top + innerH * (1 - t));
  const gridX = [0.25, 0.5, 0.75, 1].map((t) => pad.left + innerW * t);

  return (
    <svg
      data-testid="analytics-scatter"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* Gridlines */}
      {gridY.map((y, i) => (
        <line
          key={`gy-${i}`}
          x1={pad.left}
          x2={pad.left + innerW}
          y1={y}
          y2={y}
          stroke={COLOR_GRID}
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
      ))}
      {gridX.map((x, i) => (
        <line
          key={`gx-${i}`}
          x1={x}
          x2={x}
          y1={pad.top}
          y2={pad.top + innerH}
          stroke={COLOR_GRID}
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
      ))}
      {/* Axes */}
      <line x1={pad.left} y1={pad.top + innerH} x2={pad.left + innerW} y2={pad.top + innerH} stroke={COLOR_AXIS} strokeWidth={0.6} />
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + innerH} stroke={COLOR_AXIS} strokeWidth={0.6} />

      {/* Y axis ticks (0, max) */}
      <text x={pad.left - 4} y={pad.top + innerH + 3} fontSize={8} textAnchor="end" fill={COLOR_LABEL} fontFamily="var(--font-mono)">0</text>
      <text x={pad.left - 4} y={pad.top + 7} fontSize={8} textAnchor="end" fill={COLOR_LABEL} fontFamily="var(--font-mono)">{Math.round(yPeak)}</text>

      {/* X axis ticks */}
      <text x={pad.left} y={pad.top + innerH + 14} fontSize={8} textAnchor="start" fill={COLOR_LABEL} fontFamily="var(--font-mono)">0</text>
      <text x={pad.left + innerW} y={pad.top + innerH + 14} fontSize={8} textAnchor="end" fill={COLOR_LABEL} fontFamily="var(--font-mono)">{Math.round(xPeak)}</text>

      {/* Axis labels */}
      {xLabel && (
        <text
          x={pad.left + innerW / 2}
          y={height - 6}
          fontSize={8.5}
          textAnchor="middle"
          fill={COLOR_LABEL}
          fontFamily="var(--font-mono)"
          style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={10}
          y={pad.top + innerH / 2}
          fontSize={8.5}
          textAnchor="middle"
          fill={COLOR_LABEL}
          fontFamily="var(--font-mono)"
          style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
          transform={`rotate(-90 10 ${pad.top + innerH / 2})`}
        >
          {yLabel}
        </text>
      )}

      {/* Correlation badge — top-right */}
      <g transform={`translate(${pad.left + innerW - 70}, ${pad.top - 2})`}>
        <rect x={0} y={0} width={70} height={14} rx={3} fill="rgba(20,22,24,0.7)" stroke={COLOR_GRID} />
        <text x={4} y={10} fontSize={8} fill="#9aa1a8" fontFamily="var(--font-mono)">r =</text>
        <text x={66} y={10} fontSize={8.5} textAnchor="end" fontFamily="var(--font-mono)" fontWeight={700}
          fill={Math.abs(correlation) > 0.5 ? 'var(--acid)' : '#c8cdd3'}>
          {correlation.toFixed(2)}
        </text>
      </g>

      {/* Points */}
      {data.map((p) => {
        const cx = xScale(p.x);
        const cy = yScale(p.y);
        const radius = rScale(p.r);
        return (
          <circle
            key={p.id}
            cx={cx}
            cy={cy}
            r={radius}
            fill={p.color ?? pointColor}
            fillOpacity={0.7}
            stroke={p.color ?? pointColor}
            strokeWidth={1.1}
            strokeOpacity={0.95}
          >
            <title>
              {p.label ?? p.id}
              {`\n${xLabel ?? 'x'}: ${p.x}\n${yLabel ?? 'y'}: ${p.y}${p.r !== undefined ? `\nsize: ${p.r}` : ''}`}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}
