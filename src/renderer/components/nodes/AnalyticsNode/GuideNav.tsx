// Always-visible page list beside the Analytics chart: plain text labels, the
// current page marked with an acid bar. One click opens any page. Narrow
// panels get the same labels as a wrapping row above the chart instead.

import { GUIDE } from './guide';

/** Panels narrower than this show the pages as a row above the chart. */
export const RAIL_MIN_PANEL = 460;

export function GuideNav({ current, onPick, asRow }: { current: string; onPick: (id: string) => void; asRow: boolean }) {
  return (
    <>
      <nav
        data-testid="analytics-guide-nav"
        aria-label="Analytics pages"
        style={asRow
          ? { display: 'flex', flexWrap: 'wrap', gap: 4, flexShrink: 0 }
          : { width: 104, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 2 }}
      >
        {GUIDE.map((g) => {
          const on = g.id === current;
          return (
            <button
              key={g.id}
              type="button"
              data-testid={`analytics-nav-${g.id}`}
              aria-current={on ? 'page' : undefined}
              onClick={(e) => { e.stopPropagation(); onPick(g.id); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: on ? 650 : 450,
                color: on ? 'var(--k-an-ink, #f4f6f8)' : 'var(--k-an-ink-3, #9aa1a8)',
                background: on ? 'rgba(201,241,88,0.08)' : 'transparent',
                border: 'none',
                ...(asRow
                  ? { padding: '4px 9px', borderRadius: 999, boxShadow: on ? 'inset 0 0 0 1px rgba(201,241,88,0.5)' : 'inset 0 0 0 1px var(--k-an-line, #23262a)' }
                  : { padding: '7px 10px', borderRadius: 6, borderLeft: `2px solid ${on ? 'var(--acid, #c9f158)' : 'transparent'}` }),
              }}
            >
              {g.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
