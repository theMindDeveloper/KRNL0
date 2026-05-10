import type { PomoState } from './types';

interface VariantBlocksProps {
  state: PomoState;
  remainingPct: number;
  clockText: string;
  colonAnimation: string;
}

const TOTAL_BLOCKS = 25;

export function VariantBlocks({ state, remainingPct, clockText, colonAnimation }: VariantBlocksProps) {
  const [mm, ss] = clockText.split(':') as [string, string];

  // How many blocks are "on" (filled) — remaining blocks
  const onCount = Math.round((remainingPct / 100) * TOTAL_BLOCKS);

  return (
    <div data-testid="pomo-variant-blocks" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
      {/* Block grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${TOTAL_BLOCKS}, 1fr)`,
          gap: 2,
          height: 110,
          alignItems: 'end',
          padding: 6,
          background: 'var(--paper-2)',
          border: '1px solid var(--paper-3)',
          borderRadius: 4,
        }}
      >
        {Array.from({ length: TOTAL_BLOCKS }).map((_, i) => {
          // Blocks drain from left: i < onCount means it's still "on"
          const isOn = i < onCount;
          // Current leading block (transitional) highlighted
          const isNow = i === onCount - 1 && state.status === 'running';
          return (
            <span
              key={i}
              style={{
                display: 'block',
                borderRadius: 1,
                background: isNow ? 'var(--acid)' : isOn ? 'var(--rust)' : 'var(--ink-4)',
                height: isNow ? '100%' : isOn ? '95%' : '22%',
                transition: 'background 0.2s, height 0.4s ease',
                boxShadow: isNow ? '0 0 10px var(--acid)' : 'none',
                animation: isNow ? 'blink 1.4s ease infinite' : 'none',
              }}
            />
          );
        })}
      </div>

      {/* Clock readout */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontFamily: 'var(--font-mono)' }}>
        <div style={{
          fontSize: 32,
          letterSpacing: '-0.03em',
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}>
          {mm}
          <span style={{ color: 'var(--rust)', animation: colonAnimation }}>:</span>
          {ss}
        </div>
        <div style={{
          marginLeft: 'auto',
          fontSize: 9.5,
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          {state.status === 'break' ? 'break' : (state.label || 'deep work')}
        </div>
      </div>
    </div>
  );
}
