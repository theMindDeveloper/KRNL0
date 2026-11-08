// HabitNode settings popover — panel-wide settings only (Decision 14 + v2.1).
// Per-habit color / icon / rename / delete moved to the right-click context
// menu (HabitContextMenu). This panel only owns view selection so the gear
// is a "settings for this node", not "settings for habits".

import { useEffect, useRef } from 'react';
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
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ink-4)',
          marginBottom: 6,
        }}
      >
        View
      </div>
      <div
        role="tablist"
        aria-label="habit view"
        style={{
          display: 'flex',
          gap: 4,
          border: '1px solid var(--paper-3)',
          borderRadius: 4,
          padding: 2,
        }}
      >
        {HABIT_VIEWS.map((v) => {
          const active = v === view;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={active}
              data-view={v}
              onClick={() => onSetView(v)}
              style={{
                flex: 1,
                padding: '4px 6px',
                background: active ? 'var(--paper-2)' : 'transparent',
                border: 'none',
                borderRadius: 3,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: active ? 'var(--ink-2)' : 'var(--ink-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              {VIEW_LABELS[v]}
            </button>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid var(--paper-2)',
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
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 6 }}>Archived</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
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
          </div>
        </div>
      )}
    </div>
  );
}
