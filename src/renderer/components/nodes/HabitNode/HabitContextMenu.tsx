// HabitNode right-click context menu — per-habit settings.
// Rename inline, pick color from 12-token palette, pick icon from a curated
// glyph/emoji set, or delete.
//
// v2.3 — Rendered via React Portal at document.body so subpixel positioning
// is not inherited from the React Flow node's CSS transform. Anchor is
// viewport (client) coords. Position is rounded → crisp text, no blur on
// nested sub-pickers (color/icon grid).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MenuIcon, type MenuIconName } from '../../ui/menuIcons';
import type { Habit, HabitColor } from './types';
import { HABIT_COLORS } from './types';
import { HabitIcon, HABIT_ICON_IDS, habitIconId } from './HabitIcon';
import { Z } from '../../ui/layers';

interface Props {
  habit: Habit;
  // Viewport (clientX/clientY) coords of the right-click point.
  anchor: { x: number; y: number };
  onRename: (name: string) => void;
  onSetColor: (color: HabitColor) => void;
  onSetIcon: (icon: string) => void;
  onSetNote: (note: string) => void;
  onDelete: () => void;
  /** Hide it but keep its history; it comes back from the node's settings. */
  onArchive?: () => void;
  onClose: () => void;
  // v2.2 — only the parent HabitNode passes this; the lane's own menu omits
  // it (the lane node itself can't pin another lane to its own habit).
  onPinAsLane?: () => void;
  // True when a lane already exists for this habit; disables the pin item.
  laneExists?: boolean;
  // Only a lane's own menu passes this: remove the lane, keep the habit.
  onUnpinLane?: () => void;
  /** Decision 39 — routine / habit actions (Edit repeat, Skip next, End, Turn into …). */
  extraItems?: ReadonlyArray<{ label: string; onClick: () => void; testId?: string; icon?: MenuIconName; hint?: string }>;
}

const MENU_WIDTH = 232;

export function HabitContextMenu({
  habit,
  anchor,
  onRename,
  onSetColor,
  onSetIcon,
  onSetNote,
  onDelete,
  onArchive,
  onClose,
  onPinAsLane,
  laneExists,
  onUnpinLane,
  extraItems,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);
  // Escape unmounts the input, and its blur would commit the typed draft.
  const cancelledRef = useRef(false);
  const [draft, setDraft] = useState(habit.name);
  const [pickerOpen, setPickerOpen] = useState<'color' | 'icon' | 'note' | null>(null);
  // Inline note draft — window.prompt() is blocked in Electron renderer.
  const [noteDraft, setNoteDraft] = useState(habit.note ?? '');

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

  // Estimate menu height for viewport clamp; cheap upper bound.
  const estHeight =
    pickerOpen === 'icon'
      ? 280
      : pickerOpen === 'color'
        ? 200
        : pickerOpen === 'note'
          ? 260
          : 168;
  // Clamp against viewport — Math.round prevents fractional positioning
  // (root cause of nested-panel text blur).
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const clampedX = Math.round(Math.min(Math.max(0, anchor.x), Math.max(0, vw - MENU_WIDTH)));
  // The real height once drawn (routine items and pickers make it taller than
  // any fixed guess): a menu opened low on the screen moves up to fit.
  const [measured, setMeasured] = useState(0);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    if (h && Math.abs(h - measured) > 1) setMeasured(h);
  });
  const height = Math.min(Math.max(estHeight, measured), vh - 16);
  const clampedY = Math.round(Math.min(Math.max(8, anchor.y), Math.max(8, vh - height - 8)));

  const commitRename = () => {
    if (cancelledRef.current) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== habit.name) onRename(trimmed);
    setRenaming(false);
  };

  const menu = (
    <div
      ref={ref}
      data-habit-context-menu
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        width: MENU_WIDTH,
        maxHeight: vh - 16,
        overflowY: 'auto',
        boxSizing: 'border-box',
        // Same shell as the shared ContextMenu.
        background: 'var(--paper)',
        border: '1px solid var(--paper-3)',
        borderRadius: 6,
        boxShadow: 'var(--shadow-1)',
        padding: 8,
        zIndex: Z.contextMenu,
        fontFamily: 'var(--font-sans)',
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
          <HabitIcon icon={habit.icon} size={13} fallback="●" />
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
                cancelledRef.current = true;
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

      {/* Decision 40 — what you change most often first: days & time, rest today. */}
      {extraItems && extraItems.length > 0 && (
        <>
          {extraItems.map((it) => (
            <MenuItem key={it.label} label={it.label} {...(it.icon ? { icon: it.icon } : {})} {...(it.hint ? { trailing: <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{it.hint}</span> } : {})} {...(it.testId ? { testId: it.testId } : {})} onClick={() => { it.onClick(); onClose(); }} />
          ))}
          <div style={{ margin: '4px -8px 4px', borderTop: '1px solid var(--paper-2)' }} />
        </>
      )}
      <MenuItem
        label="Rename"
        icon="rename"
        onClick={() => {
          setDraft(habit.name);
          cancelledRef.current = false;
          setRenaming(true);
          setPickerOpen(null);
        }}
      />
      <MenuItem
        label="Color"
        icon="color"
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
        icon="icon"
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
            <HabitIcon icon={habit.icon} size={13} fallback="●" />
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
          {HABIT_ICON_IDS.map((g) => {
            const selected = g === habitIconId(habit.icon);
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
                  color: selected ? 'var(--ink)' : 'var(--ink-2)',
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                <HabitIcon icon={g} size={14} />
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
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            clear
          </button>
        </div>
      )}

      <MenuItem
        label={habit.note && habit.note.length > 0 ? 'Edit note' : 'Add note'}
        icon="note"
        onClick={() => {
          if (pickerOpen === 'note') {
            setPickerOpen(null);
          } else {
            setNoteDraft(habit.note ?? '');
            setPickerOpen('note');
          }
        }}
      />
      {pickerOpen === 'note' && (
        <div
          data-note-editor
          style={{ padding: '4px 6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <textarea
            value={noteDraft}
            autoFocus
            placeholder="note…"
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              // Don't let Enter inside the textarea bubble up to other handlers,
              // and let the global Escape handler close the menu (acts as cancel).
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSetNote(noteDraft.trim());
                onClose();
              }
            }}
            rows={4}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: 70,
              padding: '6px 8px',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              lineHeight: 1.4,
              color: 'var(--ink-2)',
              background: 'var(--paper-2)',
              border: '1px solid var(--paper-3)',
              borderRadius: 3,
              outline: 'none',
              caretColor: 'var(--acid)',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setPickerOpen(null)}
              style={{
                padding: '3px 8px',
                background: 'transparent',
                border: '1px dashed var(--paper-3)',
                borderRadius: 3,
                color: 'var(--ink-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSetNote(noteDraft.trim());
                onClose();
              }}
              style={{
                padding: '3px 10px',
                background: 'var(--paper-2)',
                border: '1px solid var(--acid)',
                borderRadius: 3,
                color: 'var(--acid-ink, var(--acid))',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              save
            </button>
          </div>
        </div>
      )}


      {onUnpinLane && (
        <>
          <div style={{ margin: '4px -8px 0', borderTop: '1px solid var(--paper-2)' }} />
          <MenuItem
            label="Remove canvas card"
            icon="canvas"
            onClick={() => { onUnpinLane(); onClose(); }}
          />
        </>
      )}

      {onPinAsLane && (
        <>
          <div
            style={{
              margin: '4px -8px 0',
              borderTop: '1px solid var(--paper-2)',
            }}
          />
          <MenuItem
            label={laneExists ? 'Card is on the canvas' : 'Card on canvas'}
            icon="canvas"
            disabled={laneExists === true}
            onClick={() => {
              if (laneExists) return;
              onPinAsLane();
              onClose();
            }}
          />
        </>
      )}

      <div
        style={{
          margin: '4px -8px 0',
          borderTop: '1px solid var(--paper-2)',
        }}
      />
      {onArchive && (
        <MenuItem
          label="Archive"
          icon="archive"
          trailing={<span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>keeps history</span>}
          onClick={() => {
            onArchive();
            onClose();
          }}
        />
      )}
      <MenuItem
        label="Delete"
        icon="delete"
        destructive
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </div>
  );

  // Render via portal so we escape the React Flow node's CSS transform
  // (which is the cause of the nested-panel blur).
  if (typeof document === 'undefined') return null;
  return createPortal(menu, document.body);
}

function MenuItem({
  label,
  icon,
  trailing,
  destructive,
  disabled,
  onClick,
  testId,
}: {
  label: string;
  icon?: MenuIconName;
  trailing?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '6px 6px',
        background: 'transparent',
        border: 'none',
        borderRadius: 3,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: disabled
          ? 'var(--ink-4)'
          : destructive
            ? 'var(--rust)'
            : 'var(--ink-2)',
        textAlign: 'left',
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <span aria-hidden style={{ width: 14, display: 'inline-flex', flexShrink: 0, color: destructive ? 'var(--rust)' : 'var(--ink-3)' }}>{icon && <MenuIcon name={icon} />}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {trailing}
    </button>
  );
}
