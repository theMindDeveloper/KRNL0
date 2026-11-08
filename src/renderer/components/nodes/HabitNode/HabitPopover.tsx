// HabitNode settings popover — panel-wide settings only (Decision 14 + v2.1).
// Per-habit color / icon / rename / delete moved to the right-click context
// menu (HabitContextMenu). This panel only owns view selection so the gear
// is a "settings for this node", not "settings for habits". The view
// (Week · Month · Year) moved to the window's header.

import { useEffect, useRef, useState } from 'react';
import type { HabitView } from './types';
import { HABIT_VIEWS } from './types';

interface Props {
  view: HabitView;
  onSetView: (view: HabitView) => void;
  onClose: () => void;
  /** Decision 39 — routines that have ended (history kept), each with Restart. */
  ended?: ReadonlyArray<{ id: string; name: string; endsOn: string }>;
  onRestart?: (id: string) => void;
  /** Archived habits and routines (history kept): Restore, or delete for good. */
  archived?: ReadonlyArray<{ id: string; name: string; days: number }>;
  onUnarchive?: (id: string) => void;
  onDeleteForever?: (id: string) => void;
}

const VIEW_LABELS: Record<HabitView, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

export function HabitPopover({ view, onSetView, onClose, ended = [], onRestart, archived = [], onUnarchive, onDeleteForever }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // The archive can be long: shown on request, and it scrolls.
  const [showArchived, setShowArchived] = useState(false);
  void view; void onSetView; void VIEW_LABELS; void HABIT_VIEWS;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    // Escape closes it too, like every other popover.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-habit-popover
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 36,
        right: 8,
        width: 220,
        background: 'var(--node-bg)',
        border: '1px solid var(--paper-3)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        padding: 10,
        zIndex: 15,
        fontFamily: 'var(--font-sans)',
        // Never taller than the window it sits in (it was cut off at the bottom).
        maxHeight: 'calc(100% - 44px)',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
    >
      {/* Week · Month · Year moved to the window's header. */}
      <div
        style={{
          color: 'var(--ink-4)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.04em',
          lineHeight: 1.5,
        }}
      >
        Right-click a habit or routine to rename, recolour, change its icon, archive or delete it.
      </div>
      {ended.length > 0 && (
        <div data-testid="habit-ended" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--paper-2)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 6 }}>Ended routines</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 132, overflowY: 'auto' }}>
            {ended.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${r.name} · ended ${r.endsOn}`}>{r.name}</span>
                <button type="button" data-testid={`habit-restart-${r.id}`} onClick={() => onRestart?.(r.id)}
                  style={{ height: 24, padding: '0 8px', borderRadius: 6, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', fontSize: 11, cursor: 'pointer' }}>
                  Restart
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {archived.length > 0 && (
        <div data-testid="habit-archived" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--paper-2)' }}>
          <button type="button" data-testid="habit-archived-toggle" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)', marginBottom: showArchived ? 6 : 0 }}>
            <span style={{ flex: 1, textAlign: 'left' }}>Archived ({archived.length})</span>
            <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--ink-2)' }}>{showArchived ? 'Hide' : 'Show'}</span>
          </button>
          {showArchived && <div data-testid="habit-archived-list" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {archived.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${r.name} · ${r.days} days ticked`}>
                  {r.name}<span style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}> · {r.days}d</span>
                </span>
                <button type="button" data-testid={`habit-unarchive-${r.id}`} onClick={() => onUnarchive?.(r.id)}
                  style={{ height: 24, padding: '0 8px', borderRadius: 6, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink-2)', fontSize: 11, cursor: 'pointer' }}>
                  Restore
                </button>
                <button type="button" data-testid={`habit-delete-forever-${r.id}`} title="Delete for good (history too)" aria-label={`Delete ${r.name} for good`} onClick={() => onDeleteForever?.(r.id)}
                  style={{ height: 24, width: 24, padding: 0, borderRadius: 6, border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--rust)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></svg>
                </button>
              </div>
            ))}
          </div>}
        </div>
      )}
    </div>
  );
}
