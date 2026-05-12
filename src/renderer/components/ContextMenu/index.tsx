/**
 * ContextMenu — portal-rendered context menu.
 *
 * Renders into document.body via createPortal so it always escapes any
 * overflow:hidden ancestor. Dismisses on click-outside (capture phase) or ESC.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onDismiss: () => void;
}

export function ContextMenu({ x, y, items, onDismiss }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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
        left: x,
        top: y,
        zIndex: 9999,
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
      {items.map((item, i) => (
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
