// The Analytics page switcher, in the window frame's time row (window-frame.md):
// earlier, the page's name (press it for the named list of pages), later.
// It was a row of ten unlabelled icons; a page is now always named.

import { PAGES, type AnalyticsPage, type PageId } from './guide';
import { AppSelect } from '../../ui/AppSelect';

const ICONS: Record<PageId, React.ReactNode> = {
  summary: (<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>),
  activity: (<path d="M3 12h4l3-8 4 16 3-8h4" />),
  year: (<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2" /></>),
  hours: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  tags: (<><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" /></>),
  log: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M14 9v11" /><path d="M6 13h1M11 16h1M16 12h1" /></>),
  estimates: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /></>),
  insights: (<><path d="M12 3v9h9" /><path d="M20.5 15.5A9 9 0 1 1 8.5 3.7" /></>),
  spread: (<><path d="M3 20h18" /><path d="M6 20v-5M10 20V8M14 20v-9M18 20v-4" /></>),
  habits: (<path d="M12 21c-4 0-7-2.8-7-6.8 0-3.3 2.4-5.2 3.6-8.2.4 2 1.6 3.2 2.9 3.6C11 6.5 12.8 4.2 15 3c-.4 3 1.4 4.8 2.6 6.6.9 1.4 1.4 2.8 1.4 4.6 0 4-3 6.8-7 6.8z" />),
};

export function PageIcon({ page, size = 16 }: { page: PageId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[page]}
    </svg>
  );
}

const Chevron = ({ dir }: { dir: 'prev' | 'next' }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);

export function PageNav({ current, onPick, pages = PAGES }: { current: PageId; onPick: (id: PageId) => void; pages?: readonly AnalyticsPage[] }) {
  const at = Math.max(0, pages.findIndex((p) => p.id === current));
  const step = (by: number) => { const to = pages[at + by]; if (to) onPick(to.id); };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div data-testid="analytics-page-nav" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '1 1 auto' }}>
      <button type="button" className="kw-btn nodrag" data-testid="analytics-page-prev" aria-label="Previous page" title="Previous page"
        disabled={at === 0} onMouseDown={stop} onClick={(e) => { stop(e); step(-1); }}>
        <Chevron dir="prev" />
      </button>
      <AppSelect
        testId="analytics-page"
        ariaLabel="Page"
        value={pages[at]?.id ?? current}
        options={pages.map((p) => ({ value: p.id, label: p.label }))}
        onChange={(v) => onPick(v as PageId)}
        style={{
          height: 22, boxSizing: 'border-box', flex: '0 1 150px', minWidth: 0, padding: '0 8px', borderRadius: 5,
          background: 'transparent', color: 'var(--k-an-ink, #f4f6f8)',
          border: '1px solid var(--k-an-line-2, #2a2e33)', fontSize: 11, fontWeight: 600,
        }}
      />
      <button type="button" className="kw-btn nodrag" data-testid="analytics-page-next" aria-label="Next page" title="Next page"
        disabled={at >= pages.length - 1} onMouseDown={stop} onClick={(e) => { stop(e); step(1); }}>
        <Chevron dir="next" />
      </button>
    </div>
  );
}
