// Outline — the minute bars drawn as a technical drawing: hatched outlines for
// minutes done, an accent outline for the current minute, and a dimension
// line underneath (ADR 0009, Blueprint default). Same states as Blocks.

import type { TimerFaceProps } from './types';
import { Readout } from './Readout';

/** One bar per minute of the scale, kept between 5 and 60. */
const barsFor = (total: number) => Math.max(5, Math.min(60, Math.round(total)));

export function Outline({ m, s, elapsedPct, total = 25, running }: TimerFaceProps) {
  const TOTAL = barsFor(total);
  const minsElapsed = Math.floor((elapsedPct / 100) * TOTAL);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div data-testid="pomo-face-outline" style={{ position: 'relative' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${TOTAL}, 1fr)`,
            gap: 2,
            height: 104,
            alignItems: 'end',
          }}
        >
          {Array.from({ length: TOTAL }, (_, i) => {
            const isPast = i < minsElapsed;
            const isNow = i === minsElapsed;
            return (
              <span
                key={i}
                style={{
                  display: 'block',
                  boxSizing: 'border-box',
                  height: isPast ? '95%' : isNow ? '100%' : '22%',
                  border: `1px solid ${isNow ? 'var(--acid)' : 'var(--ink-3)'}`,
                  background: isPast
                    ? 'repeating-linear-gradient(135deg, var(--ink-3) 0 1px, transparent 1px 4px)'
                    : 'transparent',
                }}
              />
            );
          })}
        </div>
        {/* Dimension line: 0 ----- 25 MIN — in the flow, so a bigger label
            pushes the read-out down instead of drawing over it. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--face-label, 11px)', lineHeight: 1.2, color: 'var(--ink-3)' }}>
          <span>0</span>
          <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--ink-3)' }} />
          <span style={{ whiteSpace: 'nowrap' }}>{TOTAL} MIN</span>
        </div>
      </div>
      <Readout m={m} s={s} minute={minsElapsed + 1} total={TOTAL} idle={!running && elapsedPct <= 0} />
    </div>
  );
}
