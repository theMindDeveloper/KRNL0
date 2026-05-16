// HourLine — line chart over 0..23.

import type { HourBucket } from '../types';
import {
  COLOR_TASK,
  COLOR_FOCUS,
  COLOR_AXIS,
  COLOR_LABEL,
  maxOf,
} from './common';

export interface HourLineProps {
  data: readonly HourBucket[];
  metric?: 'tasks' | 'focusMin';
  width?: number;
  height?: number;
}

export function HourLine({
  data,
  metric = 'tasks',
  width = 280,
  height = 110,
}: HourLineProps) {
  const pad = { left: 20, right: 6, top: 6, bottom: 18 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const stroke = metric === 'tasks' ? COLOR_TASK : COLOR_FOCUS;
  const values = data.map((d) => d[metric]);
  const yMax = Math.max(1, maxOf(values));
  const xStep = innerW / 23;
  const points = values
    .map((v, i) => {
      const x = pad.left + i * xStep;
      const y = pad.top + innerH - (v / yMax) * innerH;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      data-testid="analytics-hour-line"
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
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.4}
        points={points}
      />
      {[0, 6, 12, 18, 23].map((h) => (
        <text
          key={h}
          x={pad.left + h * xStep}
          y={height - 5}
          fontSize={8}
          textAnchor="middle"
          fill={COLOR_LABEL}
          fontFamily="var(--font-mono)"
        >
          {String(h).padStart(2, '0')}
        </text>
      ))}
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
