// ActivityStrip — ECG-style polyline summarising daily activity for the
// KRNL Dock. Pure props; no store coupling. Issue #134 §"Charts".

import type { DayBucket } from '../types';
import { COLOR_TASK, COLOR_GRID, maxOf } from './common';

export interface ActivityStripProps {
  data: readonly DayBucket[];
  /** Metric to plot. */
  metric?: 'taskCount' | 'habitCount' | 'focusMin' | 'sessions';
  width?: number;
  height?: number;
  stroke?: string;
}

export function ActivityStrip({
  data,
  metric = 'taskCount',
  width = 220,
  height = 32,
  stroke = COLOR_TASK,
}: ActivityStripProps) {
  if (data.length === 0) {
    return (
      <svg
        data-testid="analytics-activity-strip"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={COLOR_GRID}
          strokeWidth={1}
        />
      </svg>
    );
  }

  const values = data.map((d) => d[metric]);
  const yMax = Math.max(1, maxOf(values));
  const xStep = data.length > 1 ? width / (data.length - 1) : width;

  const points = values
    .map((v, i) => `${i * xStep},${height - (v / yMax) * (height - 4) - 2}`)
    .join(' ');

  return (
    <svg
      data-testid="analytics-activity-strip"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <line
        x1={0}
        y1={height - 1}
        x2={width}
        y2={height - 1}
        stroke={COLOR_GRID}
        strokeWidth={0.5}
        opacity={0.6}
      />
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
