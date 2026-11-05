// Settings → Updates (Decision 36, app-updates.md F5): the version, the update
// state in plain words, and the buttons that act on it.

import { describeUpdateState } from '../../../shared/update';
import {
  checkForUpdates,
  openReleasePage,
  primaryUpdateAction,
  useUpdateStore,
} from '../../store/updateStore';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export function UpdatesSection() {
  const state = useUpdateStore((s) => s.state);
  const checking = useUpdateStore((s) => s.checking);
  const action = primaryUpdateAction(state);
  const busy = checking || state?.status === 'checking' || state?.status === 'downloading';
  const canCheck = state !== null && state.status !== 'disabled';
  const line = state ? describeUpdateState(state) : 'Updates are handled by the installed app';
  const hasRelease = state?.latestVersion !== undefined && state.releaseUrl !== undefined;

  return (
    <div data-testid="settings-updates" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
        Updates
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11 }}>
        <span style={{ fontWeight: 700 }}>KRNL0 v{state?.currentVersion ?? APP_VERSION}</span>
        <span
          data-testid="settings-updates-state"
          style={{ fontSize: 10, color: state?.status === 'error' ? 'var(--rust)' : 'var(--ink-3)', lineHeight: 1.4 }}
        >
          {line}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {action && (
          <button
            type="button"
            data-testid="settings-updates-action"
            title={action.title}
            onClick={() => { void action.run(); }}
            style={{ ...button, border: '1px solid var(--btn-primary-ring)', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)' }}
          >
            {action.label === 'Restart' ? 'Restart to update' : 'Download'}
          </button>
        )}
        <button
          type="button"
          data-testid="settings-updates-check"
          disabled={!canCheck || busy}
          onClick={() => { void checkForUpdates(); }}
          style={{ ...button, opacity: !canCheck || busy ? 0.5 : 1, cursor: !canCheck || busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Checking…' : 'Check now'}
        </button>
        {hasRelease && (
          <button type="button" data-testid="settings-updates-notes" onClick={() => { void openReleasePage(); }} style={button}>
            What&apos;s new
          </button>
        )}
      </div>
    </div>
  );
}

const button: React.CSSProperties = {
  flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase',
  border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink)',
};
