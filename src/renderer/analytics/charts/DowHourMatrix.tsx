// DowHourMatrix — 7 (days) × 24 (hours) heatmap of activity. Reveals when in
// the week you're actually productive at a far higher resolution than the
// existing DowBars / HourLine charts (which collapse one axis). Renders pure
// from a list of events that carry an iso timestamp.

import type { AnalyticsEvent } from '../types';
import { COLOR_LABEL, DOW_LABELS } from './common';

export interface DowHourMatrixProps {
  events: readonly AnalyticsEvent[];
  range: { start: string; end: string };
  /** Which event metric to count. */
  metric?: 'count' | 'focusMin';
  width?: number;
  height?: number;
  /** Colour ramp end. Default = acid. */
  colorMax?: string;
}

const HOUR_LABELS_SHOWN = [0, 4, 8, 12, 16, 20];

export function DowHourMatrix({
  events,
  range,
  metric = 'count',
  width = 520,
  height = 200,
  colorMax = '#c9f158',
}: DowHourMatrixProps) {
  const pad = { left: 30, right: 8, top: 8, bottom: 20 };
  const innerW = Math.max(60, width - pad.left - pad.right);
  const innerH = Math.max(60, height - pad.top - pad.bottom);
  const cellW = innerW / 24;
  const cellH = innerH / 7;

  // Bucket — Mon=0 … Sun=6, Hour=0..23
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let peak = 0;
  for (const e of events) {
    if (!e.isoTimestamp) continue;
    if (e.date < range.start || e.date > range.end) continue;
    const d = new Date(e.isoTimestamp);
    if (Number.isNaN(d.getTime())) continue;
    // getDay: Sun=0..Sat=6 → shift to Mon=0..Sun=6
    const dow = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    const add = metric === 'focusMin' ? (e.durationMin ?? 0) : 1;
    matrix[dow]![hour]! += add;
    if (matrix[dow]![hour]! > peak) peak = matrix[dow]![hour]!;
  }
  if (peak === 0) peak = 1;

  // Sparse-friendly colour ramp: anything > 0 is at least visible.
  const cellColor = (v: number): string => {
    if (v <= 0) return 'rgba(255,255,255,0.025)';
    const t = Math.min(1, v / peak);
    const alpha = 0.15 + t * 0.85;
    return `${colorMax}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
  };

  return (
    <svg
      data-testid="analytics-dow-hour-matrix"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* Cells */}
      {matrix.map((row, dow) =>
        row.map((v, h) => {
          const x = pad.left + h * cellW;
          const y = pad.top + dow * cellH;
          return (
            <rect
              key={`${dow}-${h}`}
              x={x + 0.5}
              y={y + 0.5}
              width={Math.max(0, cellW - 1)}
              height={Math.max(0, cellH - 1)}
              fill={cellColor(v)}
              stroke={v > 0 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.03)'}
              strokeWidth={0.5}
              rx={1}
            >
              <title>{`${DOW_LABELS[dow]} ${String(h).padStart(2, '0')}:00 · ${
                metric === 'focusMin' ? `${v}m` : v
              }`}</title>
            </rect>
          );
        }),
      )}

      {/* Y axis labels — Mon..Sun */}
      {DOW_LABELS.map((lbl, i) => (
        <text
          key={lbl}
          x={pad.left - 4}
          y={pad.top + i * cellH + cellH / 2 + 3}
          fontSize={8.5}
          textAnchor="end"
          fill={COLOR_LABEL}
          fontFamily="var(--font-mono)"
        >
          {lbl}
        </text>
      ))}

      {/* X axis labels — sparse hours */}
      {HOUR_LABELS_SHOWN.map((h) => (
        <text
          key={h}
          x={pad.left + h * cellW + cellW / 2}
          y={height - 6}
          fontSize={8.5}
          textAnchor="middle"
          fill={COLOR_LABEL}
          fontFamily="var(--font-mono)"
        >
          {String(h).padStart(2, '0')}
        </text>
      ))}

      {/* Peak legend */}
      <g transform={`translate(${pad.left + innerW - 72}, ${pad.top - 4})`}>
        <text x={0} y={4} fontSize={8} fill="#9aa1a8" fontFamily="var(--font-mono)">peak</text>
        <rect x={24} y={-2} width={10} height={8} fill={colorMax} opacity={0.18} rx={1} />
        <rect x={36} y={-2} width={10} height={8} fill={colorMax} opacity={0.55} rx={1} />
        <rect x={48} y={-2} width={10} height={8} fill={colorMax} opacity={1} rx={1} />
        <text x={62} y={4} fontSize={8} fill="#c8cdd3" fontFamily="var(--font-mono)">
          {peak}
        </text>
      </g>
    </svg>
  );
}
