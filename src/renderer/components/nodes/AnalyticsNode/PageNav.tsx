// Compact page switcher for the Analytics toolbar: one icon button per page
// (line icons, 16px), the active one filled. Hover shows the page name; the
// current page's name is printed next to the icons.

import { PAGES, type AnalyticsPage, type PageId } from './guide';

const ICONS: Record<PageId, React.ReactNode> = {
  summary: (<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>),
  activity: (<path d="M3 12h4l3-8 4 16 3-8h4" />),
  year: (<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2" /></>),
  hours: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  tags: (<><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" /></>),
  log: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M14 9v11" /><path d="M6 13h1M11 16h1M16 12h1" /></>),
  estimates: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /></>),
  insights: (<><path d="M12 3v9h9" /><path d="M20.5 15.5A9 9 0 1 1 8.5 3.7" /></>),
  habits: (<path d="M12 21c-4 0-7-2.8-7-6.8 0-3.3 2.4-5.2 3.6-8.2.4 2 1.6 3.2 2.9 3.6C11 6.5 12.8 4.2 15 3c-.4 3 1.4 4.8 2.6 6.6.9 1.4 1.4 2.8 1.4 4.6 0 4-3 6.8-7 6.8z" />),
};

export function PageIcon({ page, size = 16 }: { page: PageId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[page]}
    </svg>
  );
}

export function PageNav({ current, onPick, pages = PAGES }: { current: PageId; onPick: (id: PageId) => void; pages?: readonly AnalyticsPage[] }) {
  const label = pages.find((p) => p.id === current)?.label ?? '';
  return (
    <div data-testid="analytics-page-nav" style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      {pages.map((p) => {
        const on = p.id === current;
        return (
          <button
            key={p.id}
            type="button"
            data-testid={`analytics-page-${p.id}`}
            aria-label={p.label}
            aria-current={on ? 'page' : undefined}
            title={p.label}
            onClick={(e) => { e.stopPropagation(); onPick(p.id); }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', padding: 0,
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: on ? 'var(--acid, #c9f158)' : 'transparent',
              color: on ? 'var(--k-an-on-accent, #0e1012)' : 'var(--k-an-ink-3, #9aa1a8)',
              transition: 'background 120ms, color 120ms',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS[p.id]}
            </svg>
          </button>
        );
      })}
      <span
        data-testid="analytics-page-label"
        style={{ marginLeft: 8, fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: 'var(--k-an-ink, #f4f6f8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
      >
        {label}
      </span>
    </div>
  );
}
