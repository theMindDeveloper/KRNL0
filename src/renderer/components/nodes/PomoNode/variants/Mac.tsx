// Mac — the timer as a retro Mac desk accessory (ADR 0009, Macintosh
// default): big digits in a framed display, a filled progress bar with a
// hatched "now" cell and a 0–25 minute scale, then "N of 25 minutes".
// Same information as Blocks; session pips and cycles render below it.

import type { TimerFaceProps } from './types';

const TOTAL = 25;
const SCALE = [0, 5, 10, 15, 20, 25];

export function Mac({ m, s, elapsedPct }: TimerFaceProps) {
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
        <div style={{ position: 'relative', height: 14, marginTop: 3, fontSize: 9, color: 'var(--ink-3)' }}>
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
