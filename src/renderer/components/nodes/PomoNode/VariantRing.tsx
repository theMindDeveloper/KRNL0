import type { PomoState } from './types';

interface VariantRingProps {
  state: PomoState;
  remainingPct: number;
  clockText: string;
  colonAnimation: string;
}

export function VariantRing({ state, remainingPct, clockText, colonAnimation }: VariantRingProps) {
  const [mm, ss] = clockText.split(':') as [string, string];

  // SVG ring math
  const r = 92;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - remainingPct / 100);
  const isBreak = state.status === 'break';

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: 220, height: 220, display: 'grid', placeItems: 'center' }}>
        {/* SVG ring */}
        <svg
          style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}
          viewBox="0 0 200 200"
        >
          {/* Track */}
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="var(--paper-3)"
            strokeWidth="8"
          />
          {/* Progress */}
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke={isBreak ? 'var(--cyan)' : 'var(--rust)'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              transition: 'stroke-dashoffset 0.6s linear',
              filter: `drop-shadow(0 0 4px ${isBreak ? 'rgba(78,168,176,0.4)' : 'rgba(200,85,61,0.4)'})`,
            }}
          />
        </svg>

        {/* Center clock */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          <div style={{ fontSize: 48, fontWeight: 300, letterSpacing: '-0.04em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {mm}
            <span style={{ color: 'var(--rust)', animation: colonAnimation }}>:</span>
            {ss}
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6 }}>
            {isBreak ? 'break' : (state.label || 'deep work')}
          </div>
        </div>
      </div>
    </div>
  );
}
