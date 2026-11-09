// CalendarHeatmap — GitHub-style year contribution grid.
// Week columns × 7 rows. Cell intensity = bucket[metric] / yMax.
// Given `width`/`height` the cells grow to fill the box; month names run
// along the top (only where they fit, so labels never overlap).

import type { DayBucket } from '../types';
import { COLOR_TASK, COLOR_GRID, COLOR_LABEL, maxOf } from './common';

export interface CalendarHeatmapProps {
  data: readonly DayBucket[];
  metric?: 'taskCount' | 'habitCount' | 'focusMin' | 'sessions';
  cellSize?: number;
  gap?: number;
  baseColor?: string;
  /** Box to fill — overrides cellSize. */
  width?: number;
  height?: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LABEL_H = 16;
const DOW_W = 16;

export function CalendarHeatmap({
  data,
  metric = 'taskCount',
  cellSize: cellProp = 9,
  gap = 2,
  baseColor = COLOR_TASK,
  width: boxW,
  height: boxH,
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

  // In a box, pick how many stacked bands (1–4 runs of weeks) give the
  // biggest cells, so a tall card is filled instead of holding a thin strip.
  const BAND_GAP = 8;
  let bands = 1;
  let cellSize = cellProp;
  if (boxW && boxH) {
    let best = -1;
    for (let b = 1; b <= 4; b++) {
      const perBand = Math.ceil(totalCols / b);
      const cs = Math.min((boxW - DOW_W) / perBand - gap, (boxH - b * LABEL_H - (b - 1) * BAND_GAP) / (7 * b) - gap, 28);
      if (cs > best + 0.5) { best = cs; bands = b; }
    }
    cellSize = Math.max(3, best);
  }
  const perBand = Math.ceil(totalCols / bands);
  const step = cellSize + gap;
  const bandH = LABEL_H + 7 * step;
  const width = DOW_W + perBand * step;
  const height = bands * bandH + (bands - 1) * BAND_GAP;
  const place = (col: number) => ({
    x: DOW_W + (col % perBand) * step,
    y: Math.floor(col / perBand) * (bandH + BAND_GAP) + LABEL_H,
  });

  // First column of each month, labelled only if there's room since the last label.
  const monthLabels: Array<{ x: number; y: number; label: string }> = [];
  let lastKey = '';
  let lastX = -Infinity;
  for (const c of cells) {
    if (c.date.slice(8) !== '01' && c !== cells[0]) continue;
    const { x, y } = place(c.col);
    const key = String(y);
    if (key === lastKey && x - lastX < 26) continue;
    monthLabels.push({ x, y: y - 4, label: MONTHS[Number(c.date.slice(5, 7)) - 1] ?? '' });
    lastKey = key;
    lastX = x;
  }

  return (
    <svg
      data-testid="analytics-calendar-heatmap"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', margin: '0 auto' }}
    >
      {monthLabels.map((m) => (
        <text key={`${m.label}-${m.x}-${m.y}`} x={m.x} y={m.y} fontSize={11} fill={COLOR_LABEL} fontFamily="var(--font-mono)">
          {m.label}
        </text>
      ))}
      {Array.from({ length: bands }, (_, b) => ['M', '', 'W', '', 'F', '', ''].map((d, r) => d && step >= 8 ? (
        <text key={`${b}-${r}`} x={0} y={b * (bandH + BAND_GAP) + LABEL_H + r * step + cellSize * 0.8} fontSize={11} fill={COLOR_LABEL} fontFamily="var(--font-mono)">{d}</text>
      ) : null))}
      {cells.map((c) => {
        const intensity = c.value / yMax;
        const fill =
          c.value === 0
            ? COLOR_GRID
            : `color-mix(in oklab, ${baseColor} ${Math.round(20 + intensity * 80)}%, transparent)`;
        return (
          <rect
            key={c.date}
            x={place(c.col).x}
            y={place(c.col).y + c.row * step}
            width={cellSize}
            height={cellSize}
            rx={Math.min(3, cellSize / 4)}
            fill={fill}
          >
            <title>{`${c.date} · ${c.value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
