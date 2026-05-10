/**
 * Dock — vertical icon-button strip for node-kind creation.
 * Decision #13 §F, Requirements F3/F4/F8.
 *
 * Phase 6: wire dock to create child node kinds (pomo.session / todo.task /
 * habit.day) once those node bodies exist. For now onClick fires a console.log
 * and calls onAddNode({ kind }) so callers and tests can spy on intent.
 */

import { useEffect, useState } from 'react';
import type { NodeKind } from '../../../shared/types/node';

export interface DockProps {
  /** Active node kind (highlights the corresponding button). */
  activeKind?: NodeKind | null;
  /** Called when the user clicks a dock button or triggers a keyboard shortcut. */
  onAddNode: (args: { kind: NodeKind }) => void;
}

interface DockButton {
  kind: NodeKind;
  label: string;
  icon: string;
  shortcut: string;
}

const DOCK_BUTTONS: DockButton[] = [
  { kind: 'pomo',  label: 'Pomodoro',  icon: '◎', shortcut: 'P' },
  { kind: 'todo',  label: 'Todo',      icon: '☐', shortcut: 'T' },
  { kind: 'habit', label: 'Habit',     icon: '◈', shortcut: 'H' },
  { kind: 'term',  label: 'Terminal',  icon: '>_', shortcut: 'X' },
];

export function Dock({ activeKind, onAddNode }: DockProps) {
  // Transient visual feedback when a button is clicked / shortcut fires.
  const [pressed, setPressed] = useState<NodeKind | null>(null);
  const fire = (kind: NodeKind) => {
    setPressed(kind);
    onAddNode({ kind });
    setTimeout(() => setPressed(null), 600);
  };

  // Register keyboard shortcuts (F8).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      for (const btn of DOCK_BUTTONS) {
        if (e.key === btn.shortcut || e.key === btn.shortcut.toLowerCase()) {
          fire(btn.kind);
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAddNode]);

  return (
    <div
      data-testid="dock"
      style={{
        position: 'absolute',
        left: 14,
        top: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        zIndex: 50,
      }}
    >
      {DOCK_BUTTONS.map(({ kind, label, icon, shortcut }) => {
        const isActive = kind === activeKind || kind === pressed;
        return (
          <button
            key={kind}
            type="button"
            data-testid={`dock-btn-${kind}`}
            title={`${label} [${shortcut}]`}
            aria-label={`Add ${label} node (${shortcut})`}
            onClick={() => fire(kind)}
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isActive ? 'var(--acid)' : 'var(--paper-2)',
              border: `1px solid ${isActive ? 'var(--acid)' : 'var(--paper-3)'}`,
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: isActive ? 'var(--ink)' : 'var(--ink-3)',
              transition: 'background 0.12s ease, border-color 0.12s ease, color 0.12s ease',
            }}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
