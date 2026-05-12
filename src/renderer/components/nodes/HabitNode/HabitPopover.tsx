// HabitNode settings popover — view toggle + per-habit color/delete list.
// Lives inside the node body (no portal). Clips with the card. F9–F13.

import { useEffect, useRef, useState } from 'react';
import type { Habit, HabitColor, HabitView } from './types';
import { HABIT_COLORS, HABIT_VIEWS } from './types';

interface Props {
  view: HabitView;
  habits: Habit[];
  onSetView: (view: HabitView) => void;
  onSetColor: (id: string, color: HabitColor) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const VIEW_LABELS: Record<HabitView, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

export function HabitPopover({
  view,
  habits,
  onSetView,
  onSetColor,
  onDelete,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [openColorId, setOpenColorId] = useState<string | null>(null);

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
        left: 8,
        right: 8,
        background: 'var(--node-bg)',
        border: '1px solid var(--paper-3)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        padding: 12,
        zIndex: 10,
        maxHeight: 280,
        overflowY: 'auto',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <SectionLabel>View</SectionLabel>
      <div
        role="tablist"
        aria-label="habit view"
        style={{
          display: 'flex',
          gap: 4,
          marginTop: 4,
          marginBottom: 12,
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

      <SectionLabel>Habits</SectionLabel>
      {habits.length === 0 ? (
        <div
          style={{
            padding: '8px 0',
            color: 'var(--ink-3)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        >
          No habits yet.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginTop: 4 }}>
          {habits.map((h) => {
            const isPickerOpen = openColorId === h.id;
            return (
              <li
                key={h.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '4px 0',
                  borderBottom: '1px solid var(--paper-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    aria-label={`color ${h.color}`}
                    data-swatch
                    onClick={() => setOpenColorId(isPickerOpen ? null : h.id)}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      background: `var(--${h.color})`,
                      border: '1px solid var(--paper-3)',
                      padding: 0,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      color: 'var(--ink-2)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={h.name}
                  >
                    {h.name}
                  </div>
                  <button
                    type="button"
                    aria-label={`delete ${h.name}`}
                    data-delete
                    onClick={() => onDelete(h.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--ink-3)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 14,
                      lineHeight: 1,
                      padding: '2px 4px',
                    }}
                  >
                    ×
                  </button>
                </div>
                {isPickerOpen && (
                  <div
                    data-color-picker
                    style={{
                      display: 'flex',
                      gap: 6,
                      paddingTop: 6,
                      paddingLeft: 22,
                      paddingBottom: 4,
                    }}
                  >
                    {HABIT_COLORS.map((c) => {
                      const selected = c === h.color;
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-label={`set color ${c}`}
                          data-color={c}
                          onClick={() => {
                            onSetColor(h.id, c);
                            setOpenColorId(null);
                          }}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            background: `var(--${c})`,
                            border: selected
                              ? '2px solid var(--paper)'
                              : '1px solid var(--paper-3)',
                            outline: selected ? '1px solid var(--ink-3)' : 'none',
                            padding: 0,
                            cursor: 'pointer',
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--ink-4)',
      }}
    >
      {children}
    </div>
  );
}
