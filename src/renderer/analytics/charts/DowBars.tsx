// DowBars — bar chart over Mon..Sun.

import type { DowBucket } from '../types';
import {
  COLOR_TASK,
  COLOR_HABIT,
  COLOR_FOCUS,
  COLOR_AXIS,
  COLOR_LABEL,
  DOW_LABELS,
  maxOf,
} from './common';

export interface DowBarsProps {
  data: readonly DowBucket[];
  metric?: 'tasks' | 'habits' | 'focusMin';
  width?: number;
  height?: number;
}

const COLOR_BY_METRIC = {
  tasks: COLOR_TASK,
  habits: COLOR_HABIT,
  focusMin: COLOR_FOCUS,
} as const;

export function DowBars({
  data,
  metric = 'tasks',
  width = 280,
  height = 110,
}: DowBarsProps) {
  const pad = { left: 20, right: 6, top: 6, bottom: 18 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const yMax = Math.max(1, maxOf(data.map((d) => d[metric])));
  const barW = innerW / 7 - 2;

  return (
    <svg
      data-testid="analytics-dow-bars"
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
        const x = pad.left + i * (innerW / 7) + 1;
        const y = pad.top + innerH - h;
        return (
          <g key={d.dow}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={COLOR_BY_METRIC[metric]}
              opacity={v === 0 ? 0.2 : 0.85}
            >
              <title>{`${DOW_LABELS[i]} · ${v}`}</title>
            </rect>
            <text
              x={x + barW / 2}
              y={height - 5}
              fontSize={9}
              textAnchor="middle"
              fill={COLOR_LABEL}
              fontFamily="var(--font-mono)"
            >
              {DOW_LABELS[i]}
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
