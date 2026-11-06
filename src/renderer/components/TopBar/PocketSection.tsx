// Settings → Floating timer (Decision 37, pocket-timer.md F9, F12): the switch
// for the pocket window that shows the Pomo node while KRNL0 is minimised, and
// its look — Dial (default), Capsule or Box.
// CLI: krnl mini on|off, krnl mini look <dial|capsule|box>.

import { useEffect, useState } from 'react';
import { Switch } from '../ui/Switch';
import { POCKET_LOOKS, POCKET_LOOK_LABEL, isPocketLook, type PocketLook } from '../../../shared/pocket';

const LOOK_EMOJI: Record<PocketLook, string> = { dial: '⭕', capsule: '💊', box: '🔲' };
const LOOK_HINT: Record<PocketLook, string> = {
  dial: 'Round, with the Clock’s ticks. Hover for buttons.',
  capsule: 'A slim pill. Hover for the details.',
  box: 'The Pomo node itself, with your timer face.',
};

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
    <div data-testid="settings-pocket" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Show the Pomo over other apps while KRNL0 is minimised
        </span>
        <Switch checked={state.enabled} onChange={flip} testId="settings-pocket-switch" title="Floating timer" />
      </div>
      <div role="radiogroup" aria-label="Floating timer look" className="st-choices" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', opacity: state.enabled ? 1 : 0.5 }}>
        {POCKET_LOOKS.map((look) => (
          <button
            key={look}
            type="button"
            role="radio"
            aria-checked={state.look === look}
            data-testid={`settings-pocket-look-${look}`}
            onClick={() => pick(look)}
            className="st-choice st-choice--text"
          >
            <span className="st-choice__label">{LOOK_EMOJI[look]} {POCKET_LOOK_LABEL[look]}</span>
            <span className="st-choice__hint">{LOOK_HINT[look]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
