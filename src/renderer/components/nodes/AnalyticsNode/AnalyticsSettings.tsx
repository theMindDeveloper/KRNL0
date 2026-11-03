// Analytics settings — a full-window view (opened by the gear). One card per
// page with its icon and a switch per chart, plus a footer for reset and the
// history wipe. Cards size to their content (compact rows, up to 3 columns);
// if the window is still too short they go onto pages — never cut off.

import { HoldButton } from '../../ui/HoldButton';
import { PagedView } from '../../ui/PagedView';
import { useBoardStore } from '../../../store/boardStore';
import { PAGES, cardsOfPage } from './guide';
import { PageIcon } from './PageNav';
import { ANALYTICS_CARD_LABELS, type AnalyticsCardId } from './types';
import { SwitchVisual } from '../../ui/Switch';

interface Props {
  hiddenCards: readonly AnalyticsCardId[];
  onToggleHidden: (id: AnalyticsCardId) => void;
  onReset: () => void;
  onClose: () => void;
}

export function AnalyticsSettings({ hiddenCards, onToggleHidden, onReset, onClose }: Props) {
  const pages = PAGES.filter((p) => p.id !== 'summary');
  const total = pages.reduce((n, p) => n + cardsOfPage(p.id).length, 0);
  const shown = pages.reduce((n, p) => n + cardsOfPage(p.id).filter((id) => !hiddenCards.includes(id)).length, 0);

  return (
    <div
      data-testid="analytics-settings"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 10,
        padding: '10px 14px 12px', boxSizing: 'border-box', overflow: 'hidden', background: 'var(--k-an-bg, #101214)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 650, color: 'var(--k-an-ink, #f4f6f8)' }}>Analytics settings</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--k-an-ink-3, #9aa1a8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Charts on each page · {shown} of {total} shown
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" data-testid="analytics-settings-done" onClick={onClose} style={doneBtn}>Done</button>
      </div>

      <PagedView
        testId="analytics-settings-pages"
        itemSelector="[data-settings-card]"
        style={{ flex: 1 }}
        contentStyle={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', alignItems: 'start', gap: 8 }}
      >
        {pages.map((p) => (
          <section key={p.id} data-settings-card style={pageCard}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={iconChip}><PageIcon page={p.id} size={14} /></span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 650, color: 'var(--k-an-ink, #f4f6f8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
            </header>
            {cardsOfPage(p.id).map((id) => {
              const on = !hiddenCards.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  data-testid={`analytics-setting-${id}`}
                  title={ANALYTICS_CARD_LABELS[id]}
                  onClick={() => onToggleHidden(id)}
                  style={row}
                >
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on ? 'var(--k-an-ink-1, #eef1f4)' : 'var(--k-an-ink-4, #7d848b)' }}>
                    {ANALYTICS_CARD_LABELS[id]}
                  </span>
                  <SwitchVisual on={on} offTrack="var(--k-an-line-2, #2a2e33)" />
                </button>
              );
            })}
          </section>
        ))}
      </PagedView>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--k-an-line, #23262a)' }}>
        <button type="button" data-testid="analytics-reset-layout" onClick={onReset} style={ghostBtn}>Show all charts</button>
        <div style={{ flex: 1 }} />
        <span title="Erases completed-task records and pomo sessions. Habits are kept." style={{ display: 'inline-flex' }}>
          <HoldButton
            testId="analytics-clear-history"
            label="Clear focus history"
            holdingLabel="Hold to wipe…"
            onConfirm={() => useBoardStore.getState().clearFocusHistory()}
            style={{ padding: '6px 10px', fontSize: 11 }}
          />
        </span>
      </div>
    </div>
  );
}

const pageCard: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0,
  padding: '8px 10px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid var(--k-an-line, #23262a)',
};
const iconChip: React.CSSProperties = {
  width: 24, height: 24, flexShrink: 0, borderRadius: 7, display: 'grid', placeItems: 'center',
  background: 'rgba(201,241,88,0.12)', color: 'var(--acid, #c9f158)',
};
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '4px 2px', borderRadius: 6,
  background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 11.5,
};
const doneBtn: React.CSSProperties = {
  padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--acid, #c9f158)',
  color: 'var(--k-an-on-accent, #0e1012)', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 650,
};
const ghostBtn: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 7, cursor: 'pointer', background: 'transparent',
  border: '1px solid var(--k-an-line-2, #2a2e33)', color: 'var(--k-an-ink-1, #eef1f4)', fontFamily: 'var(--font-sans)', fontSize: 11.5,
};
