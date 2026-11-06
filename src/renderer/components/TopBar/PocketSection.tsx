// Settings → Floating timer (Decision 37, pocket-timer.md F9, F12): the switch
// for the pocket window that shows the Pomo node while KRNL0 is minimised, and
// its look — Dial (default), Capsule or Box.
// CLI: krnl mini on|off, krnl mini look <dial|capsule|box>.

import { useEffect, useState } from 'react';
import { Switch } from '../ui/Switch';
import { POCKET_LOOKS, POCKET_LOOK_LABEL, isPocketLook, type PocketLook } from '../../../shared/pocket';

function read(v: unknown): { enabled: boolean; look: PocketLook } | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as { enabled?: unknown; look?: unknown };
  if (typeof r.enabled !== 'boolean') return null;
  return { enabled: r.enabled, look: isPocketLook(r.look) ? r.look : 'dial' };
}

export function PocketSection() {
  const [state, setState] = useState<{ enabled: boolean; look: PocketLook } | null>(null);

  useEffect(() => {
    void window.krnl?.pocketSettingsGet?.().then((s) => setState(read(s)));
  }, []);

  // No pocket outside Electron (browser preview): nothing to switch.
  if (state === null) return null;

  const flip = (next: boolean): void => {
    setState({ ...state, enabled: next });
    void window.krnl?.pocketSettingsSet?.(next).then((r) => { if (!r.ok) setState((s) => (s ? { ...s, enabled: !next } : s)); });
  };
  const pick = (look: PocketLook): void => {
    const before = state.look;
    setState({ ...state, look });
    void window.krnl?.pocketLookSet?.(look).then((r) => { if (!r.ok) setState((s) => (s ? { ...s, look: before } : s)); });
  };

  return (
    <div data-testid="settings-pocket" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 9.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
        Floating timer
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 10.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
          Show the Pomo over other apps while KRNL0 is minimised
        </span>
        <Switch checked={state.enabled} onChange={flip} testId="settings-pocket-switch" title="Floating timer" />
      </div>
      <div role="radiogroup" aria-label="Floating timer look" style={{ display: 'flex', gap: 6, opacity: state.enabled ? 1 : 0.5 }}>
        {POCKET_LOOKS.map((look) => (
          <button
            key={look}
            type="button"
            role="radio"
            aria-checked={state.look === look}
            data-testid={`settings-pocket-look-${look}`}
            onClick={() => pick(look)}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10.5,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              border: `1px solid ${state.look === look ? 'var(--acid)' : 'var(--paper-3)'}`,
              background: state.look === look ? 'color-mix(in srgb, var(--acid) 14%, transparent)' : 'transparent',
              color: 'var(--ink)',
            }}
          >
            {POCKET_LOOK_LABEL[look]}
          </button>
        ))}
      </div>
    </div>
  );
}
