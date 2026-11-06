// Settings › Updates extras and Celebrations (launch-experience.md F4, F9, F23):
// the board backups made before each update, recent versions, and the switch
// for milestone cards.

import { Switch } from '../ui/Switch';
import { setAppPrefs, useLaunchStore } from '../../launch/launchStore';
import { RELEASES } from '../../../shared/whatsnew';
import { BACKUPS_KEPT } from '../../../shared/appState';

const head: React.CSSProperties = { fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 };
const small: React.CSSProperties = { fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 };
const button: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
  textTransform: 'uppercase', border: '1px solid var(--paper-3)', background: 'transparent', color: 'var(--ink)', whiteSpace: 'nowrap',
};

export function BackupsSection() {
  const info = useLaunchStore((s) => s.info);
  if (!info) return null;
  const n = info.backups.length;
  return (
    <div data-testid="settings-backups" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...small, color: 'var(--ink)' }}>Board backups</div>
          <div style={{ ...small, color: 'var(--ink-3)' }}>
            a copy before every update · {n === 0 ? 'none yet' : `${n} kept`} (newest {BACKUPS_KEPT})
          </div>
        </div>
        <button type="button" style={button} onClick={() => { void window.krnl?.appBackupsOpen?.(); }} data-testid="settings-backups-open">
          Show folder
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={head}>Recent versions</span>
        {RELEASES.slice(0, 3).map((r) => (
          <div key={r.minor} style={{ display: 'flex', gap: 10, fontSize: 10.5, alignItems: 'baseline' }}>
            <span style={{ width: 40, color: info.version.startsWith(`${r.minor}.`) ? 'var(--acid-ink, var(--acid))' : 'var(--ink)', fontWeight: 700 }}>{r.minor}</span>
            <span style={{ width: 72, color: 'var(--ink-3)' }}>{r.date}</span>
            <span style={{ color: 'var(--ink-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CelebrationsSection() {
  const on = useLaunchStore((s) => s.prefs?.celebrations);
  if (on === undefined) return null;
  return (
    <div data-testid="settings-celebrations" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...small, flex: 1 }}>A card to save or share at 7, 30, 100 and 365 day streaks and 10, 100, 500 focus sessions</span>
        <Switch checked={on} onChange={(v) => { void setAppPrefs({ celebrations: v }); }} testId="settings-celebrations-switch" title="Celebrations" />
      </div>
    </div>
  );
}
