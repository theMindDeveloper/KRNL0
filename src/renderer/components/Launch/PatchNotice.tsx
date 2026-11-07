// "Updated to 0.11.1 · fixes and polish" (launch-experience.md F8, Update
// states 01). After a patch release there is no dialog: this small notice
// fades after 5 s and stays while the pointer is on it.

import { useEffect, useRef, useState } from 'react';
import { Z } from '../ui/layers';
import { useLaunchStore } from '../../launch/launchStore';
import { RELEASES_URL } from '../../../shared/update';
import { CloseButton } from '../ui/CloseButton';

const SHOW_MS = 5000;

export function PatchNotice() {
  const version = useLaunchStore((s) => s.patchVersion);
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = (): void => useLaunchStore.setState({ patchVersion: null });

  useEffect(() => {
    if (!version || hover) return;
    timer.current = setTimeout(close, SHOW_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [version, hover]);

  if (!version) return null;
  return (
    <div
      className="ln-toast"
      role="status"
      data-testid="patch-notice"
      style={{ zIndex: Z.notice }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span aria-hidden style={{ width: 8, height: 8, marginTop: 6, borderRadius: 999, background: 'var(--acid)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="ln-toast__title">Updated to {version}</span>
        <span className="ln-meta">fixes and polish</span>
        <div className="ln-row" style={{ marginTop: 8 }}>
          <button type="button" className="ln-btn ln-btn--xs ln-btn--line" onClick={() => { void window.krnl?.appOpenExternal?.(`${RELEASES_URL}/tag/v${version}`); close(); }}>
            What changed
          </button>
        </div>
      </div>
      <CloseButton onClick={close} label="Close" />
    </div>
  );
}
