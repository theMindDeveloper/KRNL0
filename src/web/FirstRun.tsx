// The server has no boards yet (a fresh server, and the desktop app was not
// connected first). Starting one here would leave an extra empty board once the
// desktop app connects, so the page says how to bring the desktop's boards in,
// and offers a fresh board for someone without the desktop app.

import { useState } from 'react';
import cubeDark from '../renderer/assets/launch/cube-dark.webp';

const btn: React.CSSProperties = {
  minHeight: 44,
  padding: '0 20px',
  borderRadius: 6,
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  cursor: 'pointer',
};

export function FirstRun({ onStart, onLogout }: { onStart: () => void; onLogout: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <main
      style={{
        minHeight: '100dvh', boxSizing: 'border-box', padding: 'max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))',
        display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'var(--font-mono)',
      }}
    >
      <div style={{ width: 'min(560px, 100%)', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <img src={cubeDark} alt="" width={140} height={140} style={{ alignSelf: 'flex-start', WebkitMaskImage: 'radial-gradient(closest-side, #000 60%, transparent 100%)', maskImage: 'radial-gradient(closest-side, #000 60%, transparent 100%)' }} />
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 'clamp(32px, 7vw, 44px)', lineHeight: 1.05 }}>Your server is empty</h1>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
          Have KRNL0 on a computer? Open it, click <b style={{ color: 'var(--ink)' }}>connect server</b> in the top bar and connect this server. Your boards appear here a moment later.
        </p>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>No desktop app? Start your first board right here.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setBusy(true); onStart(); }}
            style={{ ...btn, border: 0, fontWeight: 700, letterSpacing: '0.1em', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)' }}
          >
            START A BOARD HERE
          </button>
          <button type="button" onClick={onLogout} style={{ ...btn, border: '1px solid var(--paper-3)', background: 'var(--paper-2)', color: 'var(--ink)' }}>Log out</button>
        </div>
      </div>
    </main>
  );
}
