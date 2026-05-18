// StackedArea — multi-series area chart that stacks tasks / habits / focus
// per day. Lets the user see the daily mix at a glance: if focus min
// dominates the area, you're in a deep-work week; if habit checkins do, the
// day was lifestyle-heavy.

import type { DayBucket } from '../types';
import { COLOR_AXIS, COLOR_FOCUS, COLOR_HABIT, COLOR_TASK, COLOR_LABEL } from './common';

export interface StackedAreaProps {
  data: readonly DayBucket[];
  width?: number;
  height?: number;
}

export function StackedArea({ data, width = 480, height = 140 }: StackedAreaProps) {
  const pad = { left: 26, right: 8, top: 10, bottom: 22 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = Math.max(40, height - pad.top - pad.bottom);

  if (data.length === 0) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <text x={width / 2} y={height / 2} fontSize={10} textAnchor="middle" fill="#7d848b" fontFamily="var(--font-mono)">
          no data
        </text>
      </svg>
    );
  }

  // Pre-compute stacked totals so the y-axis caps at the heaviest day.
  let stackMax = 0;
  for (const d of data) {
    const sum = d.taskCount + d.habitCount + d.focusMin / 5; // focusMin scaled down so it doesn't dwarf counts
    if (sum > stackMax) stackMax = sum;
  }
  stackMax = Math.max(1, stackMax);

  const xStep = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const xAt = (i: number) => pad.left + i * xStep;
  const yAt = (cum: number) => pad.top + innerH - (cum / stackMax) * innerH;

  // Build cumulative-stack series — base + task + habit + focus(/5)
  const seriesDefs: Array<{
    key: 'taskCount' | 'habitCount' | 'focusMin';
    color: string;
    label: string;
    scale: number;
  }> = [
    { key: 'taskCount', color: COLOR_TASK, label: 'tasks', scale: 1 },
    { key: 'habitCount', color: COLOR_HABIT, label: 'habits', scale: 1 },
    { key: 'focusMin', color: COLOR_FOCUS, label: 'focus (÷5)', scale: 1 / 5 },
  ];

  const cumByIndex = data.map(() => 0);
  const paths = seriesDefs.map((sd) => {
    const upper: string[] = [];
    const lower: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!;
      const lowerY = yAt(cumByIndex[i]!);
      const val = d[sd.key] * sd.scale;
      const upperY = yAt(cumByIndex[i]! + val);
      upper.push(`${i === 0 ? 'M' : 'L'} ${xAt(i)} ${upperY}`);
      lower.unshift(`L ${xAt(i)} ${lowerY}`);
      cumByIndex[i] = cumByIndex[i]! + val;
    }
    const d = `${upper.join(' ')} ${lower.join(' ')} Z`;
    return { ...sd, d };
  });

  // X axis labels — first / mid / last date
  const dateLabel = (i: number) => {
    const d = data[i]!.date;
    return d.slice(5); // MM-DD
  };

  return (
    <svg
      data-testid="analytics-stacked-area"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* baseline */}
      <line
        x1={pad.left}
        x2={pad.left + innerW}
        y1={pad.top + innerH}
        y2={pad.top + innerH}
        stroke={COLOR_AXIS}
        strokeWidth={0.5}
      />
      {/* areas (paint base-to-top so later series overlay correctly) */}
      {paths.map((p) => (
        <path key={p.key} d={p.d} fill={p.color} fillOpacity={0.55} stroke={p.color} strokeWidth={0.8} strokeOpacity={0.9}>
          <title>{p.label}</title>
        </path>
      ))}

      {/* x-axis tick labels */}
      {data.length > 0 && (
        <>
          <text x={pad.left} y={height - 6} fontSize={8} textAnchor="start" fill={COLOR_LABEL} fontFamily="var(--font-mono)">
            {dateLabel(0)}
          </text>
          <text x={pad.left + innerW / 2} y={height - 6} fontSize={8} textAnchor="middle" fill={COLOR_LABEL} fontFamily="var(--font-mono)">
            {dateLabel(Math.floor(data.length / 2))}
          </text>
          <text x={pad.left + innerW} y={height - 6} fontSize={8} textAnchor="end" fill={COLOR_LABEL} fontFamily="var(--font-mono)">
            {dateLabel(data.length - 1)}
          </text>
        </>
      )}

      {/* y-axis peak label */}
      <text x={pad.left - 3} y={pad.top + 6} fontSize={8} textAnchor="end" fill={COLOR_LABEL} fontFamily="var(--font-mono)">
        {Math.round(stackMax)}
      </text>

      {/* legend strip — top-right */}
      <g transform={`translate(${pad.left + innerW - 8}, ${pad.top + 2})`}>
        {seriesDefs.map((sd, i) => (
          <g key={sd.key} transform={`translate(${-i * 64}, 0)`}>
            <rect x={-58} y={0} width={6} height={6} fill={sd.color} fillOpacity={0.8} />
            <text x={-48} y={6} fontSize={8} fill="#c8cdd3" fontFamily="var(--font-mono)" textAnchor="start">
              {sd.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
