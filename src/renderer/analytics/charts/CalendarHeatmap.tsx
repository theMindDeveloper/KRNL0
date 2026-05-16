// CalendarHeatmap — GitHub-style year contribution grid.
// 53 cols × 7 rows. Cell intensity = bucket[metric] / yMax.

import type { DayBucket } from '../types';
import { COLOR_TASK, COLOR_GRID, COLOR_LABEL, maxOf } from './common';

export interface CalendarHeatmapProps {
  data: readonly DayBucket[];
  metric?: 'taskCount' | 'habitCount' | 'focusMin' | 'sessions';
  cellSize?: number;
  gap?: number;
  baseColor?: string;
}

export function CalendarHeatmap({
  data,
  metric = 'taskCount',
  cellSize = 9,
  gap = 2,
  baseColor = COLOR_TASK,
}: CalendarHeatmapProps) {
  const yMax = Math.max(1, maxOf(data.map((d) => d[metric])));

  // Lay out by ISO week. The first cell's day-of-week (Mon=0..Sun=6) shifts
  // the column anchor so the grid aligns with weekdays.
  const cells: { col: number; row: number; date: string; value: number }[] = [];
  let col = 0;
  for (let i = 0; i < data.length; i++) {
    const d = data[i]!;
    const dt = new Date(d.date + 'T00:00:00');
    const row = (dt.getDay() + 6) % 7;
    if (i > 0 && row === 0) col += 1;
    cells.push({ col, row, date: d.date, value: d[metric] });
  }

  const totalCols = (cells[cells.length - 1]?.col ?? 0) + 1;
  const width = totalCols * (cellSize + gap);
  const height = 7 * (cellSize + gap);

  return (
    <svg
      data-testid="analytics-calendar-heatmap"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {cells.map((c) => {
        const intensity = c.value / yMax;
        const fill =
          c.value === 0
            ? COLOR_GRID
            : `color-mix(in oklab, ${baseColor} ${Math.round(20 + intensity * 80)}%, transparent)`;
        return (
          <rect
            key={c.date}
            x={c.col * (cellSize + gap)}
            y={c.row * (cellSize + gap)}
            width={cellSize}
            height={cellSize}
            rx={1.5}
            fill={fill}
          >
            <title>{`${c.date} · ${c.value}`}</title>
          </rect>
        );
      })}
      <text
        x={0}
        y={height + 10}
        fontSize={8}
        fill={COLOR_LABEL}
        fontFamily="var(--font-mono)"
      >
        {data[0]?.date ?? ''}
      </text>
      <text
        x={width}
        y={height + 10}
        fontSize={8}
        fill={COLOR_LABEL}
        textAnchor="end"
        fontFamily="var(--font-mono)"
      >
        {data[data.length - 1]?.date ?? ''}
      </text>
    </svg>
  );
}
