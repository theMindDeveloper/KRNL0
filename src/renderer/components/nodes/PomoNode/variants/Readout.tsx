// Readout — the "MM:SS · min N / 25" line shared by the bar-style faces added
// with the theme engine (Vu, Outline). Matches Blocks' read-out exactly so a
// frame style switching faces never loses detail (ADR 0009 F12).

export function Readout({ m, s, minute, total }: { m: string; s: string; minute: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, fontFamily: 'var(--font-mono)' }}>
      <span
        style={{
          fontSize: 32,
          letterSpacing: '-0.03em',
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {m}
        <span style={{ color: 'var(--rust)' }}>:</span>
        {s}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: 'var(--face-label, 11px)',
          color: 'var(--ink-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        min {minute} / {total}
      </span>
    </div>
  );
}
