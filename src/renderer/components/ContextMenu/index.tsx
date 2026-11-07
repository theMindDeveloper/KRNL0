/**
 * ContextMenu — portal-rendered context menu.
 *
 * Renders into document.body via createPortal so it always escapes any
 * overflow:hidden ancestor. Dismisses on click-outside (capture phase) or ESC.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z } from '../ui/layers';

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Non-interactive caption row (e.g. "Focus · 09:10–09:35 · 25m"). */
  header?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onDismiss: () => void;
}

export function ContextMenu({ x, y, items, onDismiss }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Keep the menu fully on screen: flip it left / up when it would overflow.
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = menuRef.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    setPos({
      left: w && x + w > window.innerWidth - 4 ? Math.max(4, x - w) : x,
      top: h && y + h > window.innerHeight - 4 ? Math.max(4, window.innerHeight - h - 4) : y,
    });
  }, [x, y, items.length]);

  useEffect(() => {
    // Capture-phase listeners fire before any target's bubbling handlers.
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onDismiss]);

  const menu = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: Z.contextMenu,
        background: 'var(--paper)',
        border: '1px solid var(--paper-3)',
        borderRadius: 6,
        boxShadow: 'var(--shadow-1)',
        minWidth: 140,
        padding: '4px 0',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        userSelect: 'none',
      }}
    >
      {items.map((item, i) => item.header ? (
        <div
          key={i}
          role="presentation"
          style={{
            padding: '5px 14px 6px',
            fontSize: 11,
            color: 'var(--ink-3)',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 280,
            borderBottom: '1px solid var(--paper-3)',
            marginBottom: 3,
          }}
        >
          {item.label}
        </div>
      ) : (
        <button
          key={i}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            if (!item.disabled) {
              item.onSelect();
              onDismiss();
            }
          }}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            padding: '6px 14px',
            cursor: item.disabled ? 'default' : 'pointer',
            color: item.disabled
              ? 'var(--ink-4)'
              : item.danger
                ? 'var(--rust)'
                : 'var(--ink)',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            opacity: item.disabled ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!item.disabled) {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}
