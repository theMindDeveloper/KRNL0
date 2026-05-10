import type { PomoState } from './types';

interface VariantLcdProps {
  state: PomoState;
  clockText: string;
  colonAnimation: string;
}

export function VariantLcd({ state, clockText, colonAnimation }: VariantLcdProps) {
  const [mm, ss] = clockText.split(':') as [string, string];
  const isRunning = state.status === 'running';
  const isBreak = state.status === 'break';
  const phaseLabel = isBreak ? 'BREAK' : (state.label || 'DEEP WORK');

  return (
    <div data-testid="pomo-variant-lcd" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div
        style={{
          background: 'linear-gradient(180deg, #1c1a14 0%, #0c0b08 100%)',
          border: '1px solid #2a241c',
          borderRadius: 8,
          padding: '22px 18px 18px',
          position: 'relative',
          boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.04), inset 0 -2px 6px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Scanline overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.0) 0, rgba(255,255,255,0.0) 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)',
          pointerEvents: 'none',
          opacity: 0.7,
        }} />

        {/* Digits */}
        <div style={{ position: 'relative' }}>
          {/* Ghost digits (LCD inactive segments effect) */}
          <div style={{
            position: 'absolute',
            inset: 0,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 78,
            letterSpacing: '-0.06em',
            color: 'rgba(255,255,255,0.04)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 0.85,
            textAlign: 'center',
            pointerEvents: 'none',
            textShadow: 'none',
          }}>
            88:88
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 78,
            letterSpacing: '-0.06em',
            color: 'var(--rust)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 0.85,
            textAlign: 'center',
            textShadow: '0 0 4px rgba(232,122,95,0.55), 0 0 18px rgba(232,122,95,0.4)',
            position: 'relative',
          }}>
            {mm}
            <span style={{ color: 'var(--acid)', animation: colonAnimation }}>:</span>
            {ss}
          </div>
        </div>

        {/* Meta row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          color: 'var(--ink-3)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '8px 4px 0',
        }}>
          <span>
            {isRunning && (
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                background: 'var(--rust)',
                borderRadius: '50%',
                marginRight: 6,
                boxShadow: '0 0 8px var(--rust)',
                animation: 'blink 1.4s ease infinite',
                verticalAlign: '-1px',
              }} />
            )}
            {phaseLabel}
          </span>
          <span>{state.sessionsCompleted} sessions</span>
        </div>
      </div>
    </div>
  );
}
