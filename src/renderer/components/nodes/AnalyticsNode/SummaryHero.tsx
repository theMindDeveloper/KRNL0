// Overview text summary — the first thing on the Analytics Overview tab.
//
// A one-line headline, four headline figures with their change vs the
// previous period, a focus-per-day sparkline, and a few plain sentences
// (analytics/summary.ts — the same text `sys analytics summary` prints).
// Text never touches an edge: every row has an inset and ellipsizes.

import type { AnalyticsSummary } from '../../../analytics/summary';
import type { DayBucket } from '../../../analytics/types';
import { cardPlacement } from './guide';

const INSET = 12;

export function SummaryHero({ summary, byDay }: { summary: AnalyticsSummary; byDay: readonly DayBucket[] }) {
  const max = Math.max(1, ...byDay.map((d) => d.focusMin));
  const W = 100;
  const H = 28;
  const bw = byDay.length > 0 ? W / byDay.length : W;
  return (
    <section
      data-page-item
      data-testid="analytics-summary"
      style={{
        background: 'linear-gradient(135deg, var(--k-an-bg-2, #16191c) 0%, var(--k-an-bg, #101214) 100%)',
        border: '1px solid var(--k-an-line, #23262a)',
        borderRadius: 10,
        padding: `${INSET}px ${INSET + 2}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
        ...cardPlacement('summary'),
      }}
    >
      <div
        data-testid="analytics-summary-headline"
        style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 650, lineHeight: 1.3, color: 'var(--k-an-ink, #f4f6f8)' }}
      >
        {summary.headline}
      </div>

      {/* Four tiles: one row when wide, 2 × 2 when narrow (never 3 + 1). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(max(120px, calc(50% - 4px)), 1fr))', gap: 8, flexShrink: 0 }}>
        {summary.stats.map((s) => {
          const d = s.deltaPct;
          const tone = d === null ? 'var(--k-an-ink-4, #7d848b)' : d >= 0 ? 'var(--acid, #c9f158)' : 'var(--k-an-warm, #ff8e64)';
          return (
            <div
              key={s.key}
              data-testid={`analytics-summary-stat-${s.key}`}
              style={{ background: 'var(--k-an-tile, rgba(255,255,255,0.03))', border: '1px solid var(--k-an-line, #23262a)', borderRadius: 8, padding: '8px 10px', minWidth: 0 }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--k-an-ink-3, #9aa1a8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--k-an-ink, #f4f6f8)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{s.value}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: tone, whiteSpace: 'nowrap' }}>
                  {d === null ? '—' : <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: '-0.05em', marginRight: 3 }}><path d={d >= 0 ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6'} /></svg>{Math.abs(d)}%</>}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {byDay.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-label="Focus minutes per day" role="img">
          {byDay.map((d, i) => {
            const h = d.focusMin > 0 ? Math.max(1.5, (d.focusMin / max) * H) : 0.8;
            return (
              <rect
                key={d.date}
                x={i * bw + bw * 0.15}
                y={H - h}
                width={bw * 0.7}
                height={h}
                rx={0.6}
                fill={d.focusMin > 0 ? 'var(--acid, #c9f158)' : 'var(--k-an-line, #23262a)'}
                opacity={d.focusMin > 0 ? 0.85 : 1}
              >
                <title>{`${d.date}: ${d.focusMin}m focus, ${d.taskCount} tasks`}</title>
              </rect>
            );
          })}
        </svg>
      )}

      {/* The sentences take what's left; in a small window they scroll rather than being cut. */}
      <ul className="nowheel" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', paddingBottom: 10, maskImage: 'linear-gradient(to bottom, #000 calc(100% - 16px), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 16px), transparent)' }}>
        {summary.sentences.map((t) => (
          <li key={t} style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.4, color: 'var(--k-an-ink-2b, #aab0b7)' }}>
            <span aria-hidden style={{ color: 'var(--acid, #c9f158)', flexShrink: 0 }}>•</span>
            <span style={{ minWidth: 0 }}>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
