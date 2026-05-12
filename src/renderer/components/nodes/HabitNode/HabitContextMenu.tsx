// HabitNode right-click context menu — per-habit settings.
// Rename inline, pick color from 12-token palette, pick icon from a curated
// glyph/emoji set, or delete. Positioned by the parent at the click point
// and clipped inside the node body so it does not overflow the card.

import { useEffect, useRef, useState } from 'react';
import type { Habit, HabitColor } from './types';
import { HABIT_COLORS, HABIT_ICONS } from './types';

interface Props {
  habit: Habit;
  // Position in body-local pixels (anchor under right-click).
  anchor: { x: number; y: number };
  bodyWidth: number;
  bodyHeight: number;
  onRename: (name: string) => void;
  onSetColor: (color: HabitColor) => void;
  onSetIcon: (icon: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

const MENU_WIDTH = 232;

export function HabitContextMenu({
  habit,
  anchor,
  bodyWidth,
  bodyHeight,
  onRename,
  onSetColor,
  onSetIcon,
  onDelete,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(habit.name);
  const [pickerOpen, setPickerOpen] = useState<'color' | 'icon' | null>(null);

  // Close on outside mousedown or Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  // Estimate menu height for clamp; cheap upper bound. Actual height
  // adapts; we just keep the box inside the card.
  const estHeight = pickerOpen === 'icon' ? 280 : pickerOpen === 'color' ? 200 : 168;
  const clampedX = Math.min(Math.max(0, anchor.x), Math.max(0, bodyWidth - MENU_WIDTH));
  const clampedY = Math.min(Math.max(0, anchor.y), Math.max(0, bodyHeight - estHeight));

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== habit.name) onRename(trimmed);
    setRenaming(false);
  };

  return (
    <div
      ref={ref}
      data-habit-context-menu
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'absolute',
        left: clampedX,
        top: clampedY,
        width: MENU_WIDTH,
        background: 'var(--node-bg)',
        border: '1px solid var(--paper-3)',
        borderRadius: 6,
        boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
        padding: 8,
        zIndex: 20,
        fontFamily: 'var(--font-sans)',
        maxHeight: Math.max(80, bodyHeight - 16),
        overflowY: 'auto',
      }}
    >
      {/* Header: icon + name (or rename input) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 8px' }}>
        <span
          style={{
            display: 'inline-block',
            width: 16,
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: `var(--${habit.color ?? 'acid'})`,
          }}
        >
          {habit.icon ?? '●'}
        </span>
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setDraft(habit.name);
                setRenaming(false);
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              padding: '2px 4px',
              background: 'var(--paper-2)',
              border: '1px solid var(--paper-3)',
              borderRadius: 3,
              color: 'var(--ink-2)',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
            }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              color: 'var(--ink-2)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={habit.name}
          >
            {habit.name}
          </div>
        )}
      </div>

      <MenuItem
        label="Rename"
        onClick={() => {
          setDraft(habit.name);
          setRenaming(true);
          setPickerOpen(null);
        }}
      />
      <MenuItem
        label="Color"
        trailing={
          <span
            aria-hidden
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: `var(--${habit.color ?? 'acid'})`,
              border: '1px solid var(--paper-3)',
            }}
          />
        }
        onClick={() => setPickerOpen(pickerOpen === 'color' ? null : 'color')}
      />
      {pickerOpen === 'color' && (
        <div
          data-color-grid
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 6,
            padding: '4px 6px 8px',
          }}
        >
          {HABIT_COLORS.map((c) => {
            const selected = c === habit.color;
            return (
              <button
                key={c}
                type="button"
                aria-label={`color ${c}`}
                data-color={c}
                onClick={() => {
                  onSetColor(c);
                  setPickerOpen(null);
                }}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 3,
                  background: `var(--${c})`,
                  border: selected ? '2px solid var(--paper)' : '1px solid var(--paper-3)',
                  outline: selected ? '1px solid var(--ink-3)' : 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              />
            );
          })}
        </div>
      )}

      <MenuItem
        label="Icon"
        trailing={
          <span
            aria-hidden
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--ink-3)',
              minWidth: 14,
              textAlign: 'center',
            }}
          >
            {habit.icon ?? '●'}
          </span>
        }
        onClick={() => setPickerOpen(pickerOpen === 'icon' ? null : 'icon')}
      />
      {pickerOpen === 'icon' && (
        <div
          data-icon-grid
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: 4,
            padding: '4px 6px 8px',
          }}
        >
          {HABIT_ICONS.map((g) => {
            const selected = g === habit.icon;
            return (
              <button
                key={g}
                type="button"
                aria-label={`icon ${g}`}
                data-icon={g}
                onClick={() => {
                  onSetIcon(g);
                  setPickerOpen(null);
                }}
                style={{
                  width: 22,
                  height: 22,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 3,
                  background: selected ? 'var(--paper-2)' : 'transparent',
                  border: selected ? '1px solid var(--ink-3)' : '1px solid transparent',
                  cursor: 'pointer',
                  fontSize: 13,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                {g}
              </button>
            );
          })}
          <button
            type="button"
            aria-label="clear icon"
            data-icon=""
            onClick={() => {
              onSetIcon('');
              setPickerOpen(null);
            }}
            title="clear icon"
            style={{
              gridColumn: 'span 8',
              padding: '4px',
              marginTop: 4,
              background: 'transparent',
              border: '1px dashed var(--paper-3)',
              borderRadius: 3,
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            clear
          </button>
        </div>
      )}

      <div
        style={{
          margin: '4px -8px 0',
          borderTop: '1px solid var(--paper-2)',
        }}
      />
      <MenuItem
        label="Delete"
        destructive
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </div>
  );
}

function MenuItem({
  label,
  trailing,
  destructive,
  onClick,
}: {
  label: string;
  trailing?: React.ReactNode;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '6px 6px',
        background: 'transparent',
        border: 'none',
        borderRadius: 3,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: destructive ? 'var(--rust)' : 'var(--ink-2)',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {trailing}
    </button>
  );
}
