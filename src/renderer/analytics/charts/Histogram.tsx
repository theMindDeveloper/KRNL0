// Histogram — distribution of a numeric series, binned into N buckets.
// Used in the Insights view to show the shape of daily focus-minute load: are
// most days light (right-skewed)? Or bimodal (off-day / deep-day)? Reveals
// shape rather than magnitude — complements the trend lines.

import { useMemo } from 'react';
import { COLOR_AXIS, COLOR_GRID, COLOR_LABEL } from './common';

export interface HistogramProps {
  values: readonly number[];
  /** Number of buckets. Defaults to 10. */
  bins?: number;
  width?: number;
  height?: number;
  color?: string;
  xLabel?: string;
}

export function Histogram({
  values,
  bins = 10,
  width = 320,
  height = 200,
  color = 'var(--cyan)',
  xLabel,
}: HistogramProps) {
  const pad = { left: 28, right: 10, top: 14, bottom: 28 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = Math.max(40, height - pad.top - pad.bottom);

  const { buckets, edges, mean, median, max, peakBucket } = useMemo(() => {
    const nonZero = values.filter((v) => v > 0);
    if (nonZero.length === 0) {
      return { buckets: [] as number[], edges: [] as number[], mean: 0, median: 0, max: 0, peakBucket: 0 };
    }
    let max = 0;
    for (const v of nonZero) if (v > max) max = v;
    const bucketSize = max / bins;
    const counts: number[] = Array(bins).fill(0);
    for (const v of nonZero) {
      const idx = Math.min(bins - 1, Math.floor(v / bucketSize));
      counts[idx]! += 1;
    }
    const edges: number[] = Array.from({ length: bins + 1 }, (_, i) => i * bucketSize);
    const sum = nonZero.reduce((a, b) => a + b, 0);
    const mean = sum / nonZero.length;
    const sorted = [...nonZero].sort((a, b) => a - b);
    const median = sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]!
      : ((sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2);
    let peakBucket = 0;
    for (const c of counts) if (c > peakBucket) peakBucket = c;
    return { buckets: counts, edges, mean, median, max, peakBucket };
  }, [values, bins]);

  if (buckets.length === 0) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <text x={width / 2} y={height / 2} fontSize={10} textAnchor="middle" fill="#7d848b" fontFamily="var(--font-mono)">
          no data
        </text>
      </svg>
    );
  }

  const barW = innerW / bins;
  const yPeak = Math.max(1, peakBucket);

  const xAt = (v: number) => pad.left + (v / max) * innerW;

  return (
    <svg
      data-testid="analytics-histogram"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* Y baseline */}
      <line
        x1={pad.left}
        x2={pad.left + innerW}
        y1={pad.top + innerH}
        y2={pad.top + innerH}
        stroke={COLOR_AXIS}
        strokeWidth={0.6}
      />

      {/* Bars */}
      {buckets.map((count, i) => {
        const h = (count / yPeak) * innerH;
        const x = pad.left + i * barW;
        const y = pad.top + innerH - h;
        return (
          <g key={i}>
            <rect
              x={x + 0.5}
              y={y}
              width={Math.max(0, barW - 1)}
              height={h}
              fill={color}
              opacity={count > 0 ? 0.7 : 0.1}
            >
              <title>{`${edges[i]?.toFixed(0)}–${edges[i + 1]?.toFixed(0)} · ${count} days`}</title>
            </rect>
            {count > 0 && h > 12 && (
              <text
                x={x + barW / 2}
                y={y - 3}
                fontSize={7.5}
                textAnchor="middle"
                fill="#c8cdd3"
                fontFamily="var(--font-mono)"
              >
                {count}
              </text>
            )}
          </g>
        );
      })}

      {/* Mean line */}
      <line
        x1={xAt(mean)}
        x2={xAt(mean)}
        y1={pad.top}
        y2={pad.top + innerH}
        stroke="var(--acid)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <text
        x={xAt(mean)}
        y={pad.top + 8}
        fontSize={8}
        textAnchor="middle"
        fill="var(--acid)"
        fontFamily="var(--font-mono)"
        fontWeight={700}
      >
        μ {mean.toFixed(0)}
      </text>

      {/* Median tick — below the bars */}
      <line
        x1={xAt(median)}
        x2={xAt(median)}
        y1={pad.top + innerH}
        y2={pad.top + innerH + 4}
        stroke="#8a7bff"
        strokeWidth={1.4}
      />
      <text
        x={xAt(median)}
        y={pad.top + innerH + 14}
        fontSize={8}
        textAnchor="middle"
        fill="#8a7bff"
        fontFamily="var(--font-mono)"
      >
        med {median.toFixed(0)}
      </text>

      {/* X-axis range labels */}
      <text
        x={pad.left}
        y={height - 4}
        fontSize={8}
        textAnchor="start"
        fill={COLOR_LABEL}
        fontFamily="var(--font-mono)"
      >
        0
      </text>
      <text
        x={pad.left + innerW}
        y={height - 4}
        fontSize={8}
        textAnchor="end"
        fill={COLOR_LABEL}
        fontFamily="var(--font-mono)"
      >
        {Math.round(max)}
      </text>

      {/* X axis label */}
      {xLabel && (
        <text
          x={pad.left + innerW / 2}
          y={height - 4}
          fontSize={8.5}
          textAnchor="middle"
          fill={COLOR_LABEL}
          fontFamily="var(--font-mono)"
          style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          {xLabel}
        </text>
      )}

      {/* Right-side gridline ticks */}
      {[0.25, 0.5, 0.75, 1].map((t) => {
        const y = pad.top + innerH * (1 - t);
        return (
          <g key={t}>
            <line
              x1={pad.left}
              x2={pad.left + innerW}
              y1={y}
              y2={y}
              stroke={COLOR_GRID}
              strokeWidth={0.5}
              strokeDasharray="2 3"
              opacity={0.5}
            />
            <text
              x={pad.left - 3}
              y={y + 3}
              fontSize={7.5}
              textAnchor="end"
              fill={COLOR_LABEL}
              fontFamily="var(--font-mono)"
            >
              {Math.round(yPeak * t)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
