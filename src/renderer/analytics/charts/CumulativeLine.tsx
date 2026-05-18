// CumulativeLine — running-total trajectories for three series (tasks, habits,
// focus). Unlike the daily ActivityStrip, this chart only goes up: the line
// shows how the total accumulated across the visible window. Reveals plateaus
// (flat lines = dead days) and inflection points (sudden steeper slope = a
// breakthrough day) much more clearly than per-day bars.

import { useMemo } from 'react';
import type { DayBucket } from '../types';
import {
  COLOR_AXIS,
  COLOR_FOCUS,
  COLOR_GRID,
  COLOR_HABIT,
  COLOR_LABEL,
  COLOR_TASK,
} from './common';

export interface CumulativeLineProps {
  data: readonly DayBucket[];
  width?: number;
  height?: number;
  /** Pre-compute focus/5 (so it doesn't dwarf counts). Default true. */
  scaleFocus?: boolean;
}

interface Series {
  key: string;
  label: string;
  color: string;
  cum: number[];
}

export function CumulativeLine({
  data,
  width = 480,
  height = 220,
  scaleFocus = true,
}: CumulativeLineProps) {
  const pad = { left: 36, right: 14, top: 18, bottom: 24 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = Math.max(40, height - pad.top - pad.bottom);

  const { series, peak } = useMemo(() => {
    const tasks: number[] = [];
    const habits: number[] = [];
    const focus: number[] = [];
    let tT = 0, tH = 0, tF = 0;
    for (const d of data) {
      tT += d.taskCount;
      tH += d.habitCount;
      tF += scaleFocus ? d.focusMin / 5 : d.focusMin;
      tasks.push(tT);
      habits.push(tH);
      focus.push(tF);
    }
    const series: Series[] = [
      { key: 'tasks', label: 'tasks (cum)', color: COLOR_TASK, cum: tasks },
      { key: 'habits', label: 'habits (cum)', color: COLOR_HABIT, cum: habits },
      { key: 'focus', label: scaleFocus ? 'focus ÷5 (cum)' : 'focus min (cum)', color: COLOR_FOCUS, cum: focus },
    ];
    let peak = 0;
    for (const s of series) for (const v of s.cum) if (v > peak) peak = v;
    if (peak === 0) peak = 1;
    return { series, peak };
  }, [data, scaleFocus]);

  if (data.length === 0) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <text x={width / 2} y={height / 2} fontSize={10} textAnchor="middle" fill="#7d848b" fontFamily="var(--font-mono)">
          no data
        </text>
      </svg>
    );
  }

  const xStep = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const xAt = (i: number) => pad.left + i * xStep;
  const yAt = (v: number) => pad.top + innerH - (v / peak) * innerH;

  const linePath = (cum: readonly number[]) =>
    cum.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ');

  const areaPath = (cum: readonly number[]) => {
    const top = cum.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ');
    return `${top} L ${xAt(data.length - 1).toFixed(1)} ${pad.top + innerH} L ${xAt(0).toFixed(1)} ${pad.top + innerH} Z`;
  };

  // Gridlines + tick labels
  const gridY = [0.25, 0.5, 0.75, 1].map((t) => ({ t, y: pad.top + innerH * (1 - t) }));

  const dateLabel = (i: number) => data[i]!.date.slice(5);

  return (
    <svg
      data-testid="analytics-cumulative-line"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* Y gridlines */}
      {gridY.map((g, i) => (
        <g key={i}>
          <line
            x1={pad.left}
            x2={pad.left + innerW}
            y1={g.y}
            y2={g.y}
            stroke={COLOR_GRID}
            strokeWidth={0.5}
            strokeDasharray="2 3"
          />
          <text
            x={pad.left - 4}
            y={g.y + 3}
            fontSize={8}
            textAnchor="end"
            fill={COLOR_LABEL}
            fontFamily="var(--font-mono)"
          >
            {Math.round(peak * g.t)}
          </text>
        </g>
      ))}

      {/* X axis */}
      <line
        x1={pad.left}
        x2={pad.left + innerW}
        y1={pad.top + innerH}
        y2={pad.top + innerH}
        stroke={COLOR_AXIS}
        strokeWidth={0.6}
      />

      {/* Series — area + line */}
      {series.map((s) => (
        <g key={s.key}>
          <path d={areaPath(s.cum)} fill={s.color} opacity={0.08} />
          <path
            d={linePath(s.cum)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* End-of-line value tag */}
          <text
            x={xAt(data.length - 1) - 2}
            y={yAt(s.cum[s.cum.length - 1] ?? 0) - 4}
            fontSize={8.5}
            textAnchor="end"
            fill={s.color}
            fontFamily="var(--font-mono)"
            fontWeight={700}
          >
            {Math.round(s.cum[s.cum.length - 1] ?? 0)}
          </text>
        </g>
      ))}

      {/* X tick labels — first / mid / last */}
      <text x={pad.left} y={height - 6} fontSize={8} textAnchor="start" fill={COLOR_LABEL} fontFamily="var(--font-mono)">
        {dateLabel(0)}
      </text>
      <text x={pad.left + innerW / 2} y={height - 6} fontSize={8} textAnchor="middle" fill={COLOR_LABEL} fontFamily="var(--font-mono)">
        {dateLabel(Math.floor(data.length / 2))}
      </text>
      <text x={pad.left + innerW} y={height - 6} fontSize={8} textAnchor="end" fill={COLOR_LABEL} fontFamily="var(--font-mono)">
        {dateLabel(data.length - 1)}
      </text>

      {/* Legend */}
      <g transform={`translate(${pad.left + 4}, ${pad.top - 6})`}>
        {series.map((s, i) => (
          <g key={s.key} transform={`translate(${i * 96}, 0)`}>
            <rect x={0} y={0} width={8} height={8} fill={s.color} rx={1} />
            <text x={12} y={7} fontSize={9} fill="#c8cdd3" fontFamily="var(--font-mono)">
              {s.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
