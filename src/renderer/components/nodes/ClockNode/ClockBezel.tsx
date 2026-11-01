// ClockBezel — the ring a frame style draws behind the Clock dial (ADR 0009 F6).
// Pure decoration: it sits under the task lanes and never hides a feature.
// 'none' (Classic) renders nothing, so the original dial is untouched.

import type { ClockSkin } from '../../../themes/types';

const CX = 120;
const CY = 120;

export function ClockBezel({ kind, outerR }: { kind: ClockSkin['bezel']; outerR: number }) {
  if (kind === 'none') return null;
  const r = outerR + 6;

  if (kind === 'ring') {
    return (
      <circle
        data-testid="clock-bezel"
        cx={CX} cy={CY} r={r}
        fill="var(--k-clock-bezel, var(--paper-2))"
        stroke="var(--k-clock-bezel-edge, var(--paper-3))"
        strokeWidth={1}
      />
    );
  }

  if (kind === 'metal' || kind === 'brass') {
    const id = `clock-bezel-${kind}`;
    const stops = kind === 'brass'
      ? [['0', '#e8c876'], ['0.25', '#b88a3a'], ['0.75', '#6e521c'], ['1', '#2a1f08']]
      : [['0', 'var(--k-clock-bezel-hi, #8a8478)'], ['1', 'var(--k-clock-bezel-lo, #1c1813)']];
    return (
      <g data-testid="clock-bezel">
        <defs>
          <radialGradient id={id} cx="35%" cy="28%" r="80%">
            {stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={r} fill={`url(#${id})`} />
        <circle cx={CX} cy={CY} r={r - 5} fill="var(--k-clock-bezel, var(--paper-2))" stroke="rgba(0,0,0,0.55)" />
      </g>
    );
  }

  if (kind === 'line') {
    return (
      <g data-testid="clock-bezel" fill="none" stroke="var(--k-clock-bezel-edge, var(--ink-3))">
        <circle cx={CX} cy={CY} r={r} strokeWidth={1} />
        <g strokeOpacity={0.5} strokeDasharray="8 3 2 3" strokeWidth={0.8}>
          <line x1={CX - r - 4} y1={CY} x2={CX + r + 4} y2={CY} />
          <line x1={CX} y1={CY - r - 4} x2={CX} y2={CY + r + 4} />
        </g>
      </g>
    );
  }

  // pixel — 1-bit square frame with a 50% dither, like a 1984 desk accessory.
  return (
    <g data-testid="clock-bezel">
      <defs>
        <pattern id="clock-bezel-dither" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill="var(--k-clock-hand, #000)" />
          <rect x="1" y="1" width="1" height="1" fill="var(--k-clock-hand, #000)" />
        </pattern>
      </defs>
      <rect x={CX - r} y={CY - r} width={r * 2} height={r * 2} fill="url(#clock-bezel-dither)" stroke="var(--k-clock-hand, #000)" strokeWidth={2} />
      <circle cx={CX} cy={CY} r={r - 4} fill="var(--k-clock-bezel, #fff)" stroke="var(--k-clock-hand, #000)" strokeWidth={2} />
    </g>
  );
}
