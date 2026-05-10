import type { PomoState } from './types';

interface VariantAsciiProps {
  state: PomoState;
  remainingPct: number;
  clockText: string;
  colonAnimation: string;
}

const BAR_WIDTH = 16;

export function VariantAscii({ state, remainingPct, clockText, colonAnimation }: VariantAsciiProps) {
  const [mm, ss] = clockText.split(':') as [string, string];
  const filledCount = Math.round((remainingPct / 100) * BAR_WIDTH);
  const filled = '█'.repeat(filledCount);
  const empty = '░'.repeat(BAR_WIDTH - filledCount);
  const isBreak = state.status === 'break';
  const phaseLabel = isBreak ? 'BREAK' : 'DEEP WORK';

  return (
    <div data-testid="pomo-variant-ascii" style={{ width: '100%' }}>
      <div
        style={{
          width: '100%',
          background: 'var(--term-bg)',
          color: 'var(--term-fg)',
          border: '1px solid #2a241c',
          borderRadius: 6,
          padding: '14px 14px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          lineHeight: 1.55,
          position: 'relative',
          boxShadow: 'inset 0 0 24px rgba(0,0,0,0.45)',
        }}
      >
        {/* Header */}
        <div style={{
          color: 'var(--term-dim)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontSize: 9.5,
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <span>krnl0 · pomo</span>
          <span style={{ color: 'var(--term-acid)' }}>● live</span>
        </div>

        {/* Big clock */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 38,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          color: 'var(--term-acid)',
          fontVariantNumeric: 'tabular-nums',
          textShadow: '0 0 12px rgba(201,241,88,0.45)',
          lineHeight: 1,
          margin: '4px 0 8px',
        }}>
          {mm}
          <span style={{ color: 'var(--term-rust)', animation: colonAnimation }}>:</span>
          {ss}
        </div>

        {/* ASCII progress bar */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          letterSpacing: '0.06em',
          whiteSpace: 'pre',
        }}>
          <span style={{ color: 'var(--term-acid)' }}>[{filled}</span>
          <span style={{ color: 'var(--term-dim)' }}>{empty}]</span>
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 9.5,
          color: 'var(--term-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          <span>{phaseLabel}</span>
          <span style={{ color: 'var(--term-rust)' }}>{Math.round(remainingPct)}%</span>
        </div>
      </div>
    </div>
  );
}
