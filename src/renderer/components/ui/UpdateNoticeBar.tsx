// Update notices, bottom right above the status bar (Decision 36, app-updates.md
// F2/F3; launch designs "Update states" 03, 04, 06):
//   03 ready (Windows)     "KRNL0 0.11.1 is ready" · Later · Restart now
//   04 available (Mac)     "KRNL0 0.11.1 is out"   · Skip version · Download
//   06 couldn't check      only after "Check now"  · Retry
// A ready update waits until no Pomo session is running before it shows, so
// it never interrupts focus. "Later" still installs it on quit (Windows).

import {
  checkForUpdates,
  clearManualUpdateError,
  dismissUpdateNotice,
  primaryUpdateAction,
  useUpdateStore,
} from '../../store/updateStore';
import { useBoardStore } from '../../store/boardStore';
import { setAppPrefs, useLaunchStore } from '../../launch/launchStore';
import { CloseButton } from './CloseButton';
import { Z } from './layers';

function usePomoRunning(): boolean {
  return useBoardStore((s) => {
    const pomo = s.board?.nodes.find((n) => n.kind === 'pomo' && n.isMother);
    const status = (pomo?.state as { status?: string } | undefined)?.status;
    return status === 'running' || status === 'paused';
  });
}

export function UpdateNoticeBar() {
  const state = useUpdateStore((s) => s.state);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const manualError = useUpdateStore((s) => s.manualError);
  const checking = useUpdateStore((s) => s.checking);
  const skipped = useLaunchStore((s) => s.prefs?.skippedVersion ?? null);
  const busy = usePomoRunning();
  const action = primaryUpdateAction(state);

  if (manualError !== null) {
    return (
      <div role="status" data-testid="update-notice-error" className="ln-toast" style={{ zIndex: Z.notice }}>
        <span aria-hidden style={{ width: 8, height: 8, marginTop: 6, borderRadius: 999, background: 'var(--rust)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="ln-toast__title">Couldn&apos;t reach GitHub</span>
          <span className="ln-meta">trying again in 4 h · {manualError}</span>
          <div className="ln-row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="ln-btn ln-btn--xs ln-btn--line" disabled={checking} onClick={() => { void checkForUpdates(); }}>
              {checking ? 'Checking…' : 'Retry'}
            </button>
          </div>
        </div>
        <CloseButton onClick={clearManualUpdateError} label="Close" />
      </div>
    );
  }

  if (!state || !action || dismissed === state.latestVersion) return null;
  const ready = state.status === 'ready';
  if (ready && busy) return null;
  if (!ready && skipped !== null && skipped === state.latestVersion) return null;

  return (
    <div role="status" data-testid="update-notice" className="ln-toast" style={{ zIndex: Z.notice }}>
      <span aria-hidden style={{ width: 8, height: 8, marginTop: 6, borderRadius: 999, background: 'var(--acid)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="ln-toast__title">{ready ? `KRNL0 ${state.latestVersion ?? ''} is ready` : `KRNL0 ${state.latestVersion ?? ''} is out`}</span>
        <span className="ln-meta">
          {ready
            ? 'Installs when you quit, or restart now. Takes about 10 seconds.'
            : 'Download it and open it over this one. Your board stays put.'}
        </span>
        <div className="ln-row" style={{ marginTop: 8, gap: 4, justifyContent: 'flex-end' }}>
          {ready ? (
            <button type="button" data-testid="update-notice-later" className="ln-btn ln-btn--xs" onClick={dismissUpdateNotice} title="Hide — it installs when you quit KRNL0">
              Later
            </button>
          ) : (
            <button
              type="button"
              data-testid="update-notice-later"
              className="ln-btn ln-btn--xs"
              title="Don't tell me about this version again"
              onClick={() => { dismissUpdateNotice(); void setAppPrefs({ skippedVersion: state.latestVersion ?? null }); }}
            >
              Skip version
            </button>
          )}
          <button type="button" data-testid="update-notice-action" className="ln-btn ln-btn--xs ln-btn--primary" title={action.title} onClick={() => { void action.run(); }}>
            {ready ? 'Restart now' : action.label}
          </button>
        </div>
      </div>
    </div>
  );
}
