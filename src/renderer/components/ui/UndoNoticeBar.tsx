// The "Deleted … · UNDO" bar (store/undoNotice.ts). Bottom centre, a few
// seconds, gone as soon as the board changes in any other way.

import { useEffect } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { dismissUndoNotice, undoNoticed, useUndoNotice } from '../../store/undoNotice';
import { Z } from './layers';

const SHOW_MS = 6000;

export function UndoNoticeBar() {
  const notice = useUndoNotice((s) => s.notice);
  const board = useBoardStore((s) => s.board);
  // A revert notice runs its own reverse step, which is safe on any board.
  const stale = notice !== null && !notice.revert && board !== notice.after;

  useEffect(() => {
    if (!notice) return;
    if (stale) { dismissUndoNotice(); return; }
    const t = setTimeout(dismissUndoNotice, SHOW_MS);
    return () => clearTimeout(t);
  }, [notice, stale]);

  if (!notice || stale) return null;
  return (
    <div
      role="status"
      data-testid="undo-notice"
      style={{
        position: 'fixed', left: '50%', bottom: 40, transform: 'translateX(-50%)', zIndex: Z.notice,
        display: 'flex', alignItems: 'center', gap: 12, maxWidth: 'calc(100vw - 32px)',
        padding: '7px 8px 7px 14px', borderRadius: 8,
        background: 'var(--paper)', border: '1px solid var(--paper-3)', boxShadow: 'var(--shadow-1)',
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)',
      }}
    >
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notice.label}</span>
      <button
        type="button"
        data-testid="undo-notice-undo"
        title="Undo (Ctrl+Z)"
        onClick={() => undoNoticed()}
        style={{
          flexShrink: 0, height: 24, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
          border: '1px solid var(--btn-primary-ring)',
          background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)',
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
        }}
      >
        UNDO
      </button>
    </div>
  );
}
