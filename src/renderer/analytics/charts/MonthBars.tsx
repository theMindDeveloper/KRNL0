// MonthBars — bar chart over Jan..Dec for a given year.

import type { MonthBucket } from '../types';
import {
  COLOR_TASK,
  COLOR_HABIT,
  COLOR_FOCUS,
  COLOR_AXIS,
  COLOR_LABEL,
  MONTH_LABELS,
  maxOf,
} from './common';

export interface MonthBarsProps {
  data: readonly MonthBucket[];
  metric?: 'tasks' | 'habits' | 'focusMin';
  width?: number;
  height?: number;
}

const COLOR_BY_METRIC = {
  tasks: COLOR_TASK,
  habits: COLOR_HABIT,
  focusMin: COLOR_FOCUS,
} as const;

export function MonthBars({
  data,
  metric = 'tasks',
  width = 280,
  height = 110,
}: MonthBarsProps) {
  const pad = { left: 20, right: 6, top: 6, bottom: 18 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const yMax = Math.max(1, maxOf(data.map((d) => d[metric])));
  const colW = innerW / 12;
  const barW = colW - 2;

  return (
    <svg
      data-testid="analytics-month-bars"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <line
        x1={pad.left}
        y1={pad.top + innerH}
        x2={pad.left + innerW}
        y2={pad.top + innerH}
        stroke={COLOR_AXIS}
        strokeWidth={0.5}
      />
      {data.map((d, i) => {
        const v = d[metric];
        const h = (v / yMax) * innerH;
        const x = pad.left + i * colW + 1;
        const y = pad.top + innerH - h;
        return (
          <g key={d.month}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={COLOR_BY_METRIC[metric]}
              opacity={v === 0 ? 0.2 : 0.85}
            >
              <title>{`${MONTH_LABELS[i]} · ${v}`}</title>
            </rect>
            <text
              x={x + barW / 2}
              y={height - 5}
              fontSize={8}
              textAnchor="middle"
              fill={COLOR_LABEL}
              fontFamily="var(--font-mono)"
            >
              {MONTH_LABELS[i]}
            </text>
          </g>
        );
      })}
      <text
        x={pad.left - 3}
        y={pad.top + 8}
        fontSize={8}
        textAnchor="end"
        fill={COLOR_LABEL}
        fontFamily="var(--font-mono)"
      >
        {yMax}
      </text>
    </svg>
  );
}
