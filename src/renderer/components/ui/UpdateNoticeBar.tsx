// "KRNL0 0.11.0 is ready — Restart · Later" (Decision 36, app-updates.md F2/F3).
// Bottom right, above the status bar, so it never covers the undo notice in
// the centre. Stays until the user acts: an update isn't time-critical, and
// "Later" still installs it on quit (Windows).

import { dismissUpdateNotice, openReleasePage, primaryUpdateAction, useUpdateStore } from '../../store/updateStore';
import { Z } from './layers';

export function UpdateNoticeBar() {
  const state = useUpdateStore((s) => s.state);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const action = primaryUpdateAction(state);
  if (!state || !action || dismissed === state.latestVersion) return null;

  const text = state.status === 'ready'
    ? `KRNL0 ${state.latestVersion ?? ''} is ready`
    : `KRNL0 ${state.latestVersion ?? ''} is out`;

  return (
    <div
      role="status"
      data-testid="update-notice"
      style={{
        position: 'fixed', right: 16, bottom: 40, zIndex: Z.notice,
        display: 'flex', alignItems: 'center', gap: 8, maxWidth: 'calc(100vw - 32px)',
        padding: '7px 8px 7px 14px', borderRadius: 8,
        background: 'var(--paper)', border: '1px solid var(--paper-3)', boxShadow: 'var(--shadow-1)',
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)',
      }}
    >
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 4 }}>
        {text}
      </span>
      <button type="button" data-testid="update-notice-notes" onClick={() => { void openReleasePage(); }} style={ghostButton} title="Open the release notes">
        What&apos;s new
      </button>
      <button type="button" data-testid="update-notice-later" onClick={dismissUpdateNotice} style={ghostButton} title={state.status === 'ready' ? 'Hide — it installs when you quit KRNL0' : 'Hide until next launch'}>
        Later
      </button>
      <button
        type="button"
        data-testid="update-notice-action"
        title={action.title}
        onClick={() => { void action.run(); }}
        style={{
          flexShrink: 0, height: 24, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
          border: '1px solid var(--btn-primary-ring)',
          background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)',
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        {action.label}
      </button>
    </div>
  );
}

const ghostButton: React.CSSProperties = {
  flexShrink: 0, height: 24, padding: '0 8px', borderRadius: 6, cursor: 'pointer',
  border: '1px solid transparent', background: 'transparent', color: 'var(--ink-3)',
  fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em',
};
