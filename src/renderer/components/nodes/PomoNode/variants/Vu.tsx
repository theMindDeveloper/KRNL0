// Vu — 25 segmented LED columns, one per minute, like a mixer's level meter
// (ADR 0009, Synthesizer default). Same states as Blocks: past columns are
// lit to the top, the current one glows, future ones stay dark.
// Meter colours come from tokens so a frame style can retune them.

import type { TimerFaceProps } from './types';
import { Readout } from './Readout';

const TOTAL = 25;
const SEGMENTS = 'repeating-linear-gradient(0deg, #000 0 5px, transparent 5px 7px)';
const LIT =
  'linear-gradient(0deg, var(--k-vu-low, #9be34a) 0 55%, var(--k-vu-mid, #ffd54a) 55% 80%, var(--k-vu-high, #ff6a3d) 80%)';

export function Vu({ m, s, elapsedPct }: TimerFaceProps) {
  const minsElapsed = Math.floor((elapsedPct / 100) * TOTAL);

  return (
    <div className="pomo-vu" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .pomo-vu span.now { animation: none !important; }
        }
      `}</style>
      <div
        data-testid="pomo-face-vu"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${TOTAL}, 1fr)`,
          gap: 3,
          height: 110,
          alignItems: 'end',
          padding: 8,
          background: 'var(--paper-2)',
          border: '1px solid var(--paper-3)',
          borderRadius: 4,
        }}
      >
        {Array.from({ length: TOTAL }, (_, i) => {
          const isPast = i < minsElapsed;
          const isNow = i === minsElapsed;
          return (
            <span
              key={i}
              className={isNow ? 'now' : undefined}
              style={{
                display: 'block',
                height: isPast ? '95%' : isNow ? '100%' : '18%',
                background: isPast || isNow ? LIT : 'var(--paper-3)',
                WebkitMaskImage: SEGMENTS,
                maskImage: SEGMENTS,
                boxShadow: isNow ? '0 0 8px var(--k-vu-low, #9be34a)' : undefined,
                animation: isNow ? 'pomo-blink 1.4s ease infinite' : undefined,
              }}
            />
          );
        })}
      </div>
      <Readout m={m} s={s} minute={minsElapsed + 1} total={TOTAL} />
    </div>
  );
}
