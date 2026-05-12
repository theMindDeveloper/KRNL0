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
}

const VIEW_LABELS: Record<HabitView, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

export function HabitPopover({ view, onSetView, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
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
        width: 180,
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
          fontSize: 9,
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
                fontSize: 10.5,
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
          fontSize: 9,
          letterSpacing: '0.04em',
          lineHeight: 1.5,
        }}
      >
        Right-click a habit to rename, change color, change icon, or delete.
      </div>
    </div>
  );
}
