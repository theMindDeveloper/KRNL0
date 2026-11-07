// Mac — the timer as a retro Mac desk accessory (ADR 0009, Macintosh
// default): big digits in a framed display, a filled progress bar with a
// hatched "now" cell and a 0–total minute scale, then "N of total minutes".
// Same information as Blocks; session pips and cycles render below it.

import type { TimerFaceProps } from './types';

/** Six evenly spaced scale ticks from 0 to the total. */
const scaleFor = (total: number) => [0, 1, 2, 3, 4, 5].map((i) => Math.round((total * i) / 5));

export function Mac({ m, s, elapsedPct, total = 25 }: TimerFaceProps) {
  const TOTAL = Math.max(1, Math.round(total));
  const SCALE = scaleFor(TOTAL);
  const minsElapsed = Math.min(TOTAL, Math.floor((elapsedPct / 100) * TOTAL));
  const donePct = (minsElapsed / TOTAL) * 100;
  const nowPct = 100 / TOTAL;
  const rule = 'color-mix(in srgb, var(--ink) 70%, transparent)';

  return (
    <div data-testid="pomo-face-mac" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--font-mono)' }}>
      <div
        style={{
          border: `1px solid ${rule}`,
          borderRadius: 3,
          padding: '10px 0',
          textAlign: 'center',
          fontSize: 56,
          lineHeight: 1,
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
          background: 'var(--node-bg)',
        }}
      >
        {m}:{s}
      </div>

      <div>
        <div style={{ position: 'relative', height: 14, border: `1px solid ${rule}`, background: 'var(--node-bg)' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${donePct}%`, background: 'var(--ink)' }} />
          {minsElapsed < TOTAL && (
            <div
              style={{
                position: 'absolute',
                left: `${donePct}%`,
                top: 0,
                bottom: 0,
                width: `${nowPct}%`,
                background: 'repeating-linear-gradient(135deg, var(--ink) 0 1px, transparent 1px 3px)',
              }}
            />
          )}
        </div>
        <div style={{ position: 'relative', height: 14, marginTop: 3, fontSize: 11, color: 'var(--ink-3)' }}>
          {SCALE.map((v) => (
            <span
              key={v}
              style={{
                position: 'absolute',
                left: `${(v / TOTAL) * 100}%`,
                transform: v === 0 ? 'none' : v === TOTAL ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {v === TOTAL ? `${v} min` : v}
            </span>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>
        {Math.min(TOTAL, minsElapsed + 1)} of {TOTAL} minutes
      </div>
    </div>
  );
}
