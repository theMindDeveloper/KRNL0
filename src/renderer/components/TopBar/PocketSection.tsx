// Settings → Floating timer (Decision 37, pocket-timer.md F9): the switch for
// the pocket window that shows the Pomo node while KRNL0 is minimised.
// CLI: krnl mini on|off.

import { useEffect, useState } from 'react';
import { Switch } from '../ui/Switch';

function readEnabled(v: unknown): boolean | null {
  return typeof v === 'object' && v !== null && typeof (v as { enabled?: unknown }).enabled === 'boolean'
    ? (v as { enabled: boolean }).enabled
    : null;
}

export function PocketSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    void window.krnl?.pocketSettingsGet?.().then((s) => setEnabled(readEnabled(s)));
  }, []);

  // No pocket outside Electron (browser preview): nothing to switch.
  if (enabled === null) return null;

  const flip = (next: boolean): void => {
    setEnabled(next);
    void window.krnl?.pocketSettingsSet?.(next).then((r) => { if (!r.ok) setEnabled(!next); });
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
        <Switch checked={enabled} onChange={flip} testId="settings-pocket-switch" title="Floating timer" />
      </div>
    </div>
  );
}
