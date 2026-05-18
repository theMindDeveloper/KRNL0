// Radar — 4–8 axis polar chart. Used in the Insights view to compare a few
// summary metrics on the same shape. Optional `previous` series overlays a
// faint outline so the user can see drift vs. the prior window.
//
// Pure SVG. Axis values are normalised independently — each axis has its own
// max, so a single dominant axis doesn't crush the others to zero.

import { COLOR_GRID, COLOR_LABEL } from './common';

export interface RadarAxis {
  key: string;
  label: string;
  value: number;
  /** Optional axis-specific max. When omitted, the axis is auto-scaled. */
  max?: number;
  /** Optional comparison value (rendered as a fainter polygon). */
  previous?: number;
}

export interface RadarProps {
  axes: readonly RadarAxis[];
  width?: number;
  height?: number;
  color?: string;
  prevColor?: string;
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export function Radar({
  axes,
  width = 280,
  height = 260,
  color = 'var(--acid)',
  prevColor = 'rgba(138,123,255,0.7)',
}: RadarProps) {
  const cx = width / 2;
  const cy = height / 2 + 6; // shift down to leave room for label at top
  const r = Math.min(width, height) / 2 - 36;

  const n = axes.length;
  if (n < 3) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <text x={cx} y={cy} fontSize={10} textAnchor="middle" fill="#7d848b" fontFamily="var(--font-mono)">
          need at least 3 axes
        </text>
      </svg>
    );
  }

  // Per-axis max. Caller can pin one; otherwise default to value itself or
  // any previous comparison (so the current polygon never spills out).
  const norms = axes.map((a) => {
    const m = a.max ?? Math.max(a.value, a.previous ?? 0, 1);
    return { value: a.value / m, previous: (a.previous ?? 0) / m, axisMax: m };
  });

  const step = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2; // North

  const pointAt = (i: number, t: number) =>
    polar(cx, cy, r * t, startAngle + i * step);

  const polygon = (key: 'value' | 'previous') =>
    norms.map((nz, i) => {
      const p = pointAt(i, nz[key]);
      return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }).join(' ') + ' Z';

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      data-testid="analytics-radar"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* Concentric rings */}
      {rings.map((t) => {
        const path = axes.map((_, i) => {
          const p = pointAt(i, t);
          return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
        }).join(' ') + ' Z';
        return (
          <path
            key={t}
            d={path}
            fill="none"
            stroke={COLOR_GRID}
            strokeWidth={0.5}
            strokeDasharray={t === 1 ? undefined : '2 3'}
            opacity={t === 1 ? 0.65 : 0.45}
          />
        );
      })}

      {/* Axis spokes + labels */}
      {axes.map((a, i) => {
        const tip = pointAt(i, 1);
        const labelP = pointAt(i, 1.18);
        return (
          <g key={a.key}>
            <line
              x1={cx}
              y1={cy}
              x2={tip.x}
              y2={tip.y}
              stroke={COLOR_GRID}
              strokeWidth={0.5}
              opacity={0.7}
            />
            <text
              x={labelP.x}
              y={labelP.y + 3}
              fontSize={9}
              textAnchor="middle"
              fill={COLOR_LABEL}
              fontFamily="var(--font-mono)"
              style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              {a.label}
            </text>
            <text
              x={labelP.x}
              y={labelP.y + 13}
              fontSize={8}
              textAnchor="middle"
              fill="#7d848b"
              fontFamily="var(--font-mono)"
            >
              {Math.round(a.value)}
            </text>
          </g>
        );
      })}

      {/* Previous-period outline (only when at least one axis has comparison) */}
      {norms.some((n) => n.previous > 0) && (
        <path
          d={polygon('previous')}
          fill={prevColor}
          fillOpacity={0.08}
          stroke={prevColor}
          strokeWidth={1.1}
          strokeDasharray="3 3"
        />
      )}

      {/* Current polygon */}
      <path
        d={polygon('value')}
        fill={color}
        fillOpacity={0.18}
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />

      {/* Vertex dots */}
      {norms.map((nz, i) => {
        const p = pointAt(i, nz.value);
        return (
          <circle
            key={`v-${i}`}
            cx={p.x}
            cy={p.y}
            r={2.6}
            fill={color}
            stroke="#0e1012"
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
