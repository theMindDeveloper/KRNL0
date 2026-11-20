/**
 * Connect your KRNL0 server (Decision 51, server-sync.md F1, design "Sync B"):
 * address → the server's fingerprint to compare with `krnl0 fingerprint` →
 * "It matches my server" → password (+ 2FA code) → Connect.
 */

import { useEffect, useRef, useState } from 'react';
import { Z } from '../ui/layers';
import cubeDark from '../../assets/launch/cube-dark.webp';
import { beginConnect, finishConnect } from '../../store/syncStore';
import { SheetButton } from './SyncChip';

type Found = { origin: string; fingerprint: string | null; serverVersion: string; encryption: string };

const field: React.CSSProperties = {
  height: 44,
  boxSizing: 'border-box',
  padding: '0 12px',
  borderRadius: 6,
  border: '1px solid var(--ink-4)',
  background: 'var(--paper-2)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-mono)',
  fontSize: 14,
  outline: 'none',
  minWidth: 0,
};
const cap: React.CSSProperties = { fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' };

/** "AB:CD:…" in groups of four bytes, so it is easy to compare line by line. */
export function fingerprintGroups(fp: string): string[] {
  const bytes = fp.split(':');
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 4) out.push(bytes.slice(i, i + 4).join(':'));
  return out;
}

export function ConnectSheet({ onClose }: { onClose: () => void }) {
  const [address, setAddress] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [matches, setMatches] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  useEffect(() => { addressRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const find = async (): Promise<void> => {
    if (!address.trim()) return;
    setBusy(true); setError(null); setFound(null); setMatches(false);
    const r = await beginConnect(address.trim());
    setBusy(false);
    if (r.ok) { setFound(r); if (!r.fingerprint) setMatches(true); } else setError(r.message);
  };

  const connect = async (): Promise<void> => {
    if (!found || !matches || !password) return;
    setBusy(true); setError(null);
    const r = await finishConnect(password, code.replace(/\s/g, '') || undefined);
    setBusy(false);
    if (r.ok) onClose(); else setError(r.message);
  };

  const canConnect = !!found && matches && password.length > 0 && !busy;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: Z.dialog, background: 'rgba(0, 0, 0, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-connect-title"
        data-testid="sync-connect-sheet"
        style={{ width: 'min(820px, 100%)', maxHeight: 'calc(100vh - 48px)', display: 'flex', overflow: 'hidden', borderRadius: 14, background: 'var(--node-bg)', border: '1px solid var(--paper-3)', boxShadow: '0 2px 0 rgba(0,0,0,.2), 0 24px 60px rgba(0,0,0,.45)', fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}
      >
        <div aria-hidden="true" style={{ width: 260, flexShrink: 0, background: 'var(--term-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={cubeDark} alt="" style={{ width: 230, height: 230, WebkitMaskImage: 'radial-gradient(closest-side, #000 60%, transparent 100%)', maskImage: 'radial-gradient(closest-side, #000 60%, transparent 100%)' }} />
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); void (found ? connect() : find()); }}
          style={{ flex: '1 1 auto', minWidth: 0, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}
        >
          <h2 id="sync-connect-title" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 32, lineHeight: 1.05 }}>Connect your KRNL0 server</h2>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>Your boards on every computer and in your phone's browser. Zoom, window sizes, which board is open and the terminal stay on this computer.</p>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={cap}>Address</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <input ref={addressRef} value={address} onChange={(e) => { setAddress(e.target.value); setFound(null); setMatches(false); }} placeholder="192.168.1.20:8443" autoComplete="off" spellCheck={false} style={{ ...field, flex: '1 1 auto' }} />
              {!found && <SheetButton disabled={busy || !address.trim()} onClick={() => void find()}>{busy ? 'Looking…' : 'Find'}</SheetButton>}
            </span>
            {found && <span style={{ fontSize: 11.5, color: 'var(--acid-ink)' }}>Found KRNL0 server {found.serverVersion} · {found.encryption}</span>}
          </label>

          {found?.fingerprint && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 8, background: 'var(--paper-2)' }}>
              <span style={cap}>Fingerprint — compare with “krnl0 fingerprint” on the server</span>
              <span style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '4px 16px', fontSize: 13.5, letterSpacing: '0.05em' }}>
                {fingerprintGroups(found.fingerprint).map((g, i) => <span key={i}>{g}</span>)}
              </span>
              <button type="button" role="checkbox" aria-checked={matches} onClick={() => setMatches((m) => !m)} style={{ alignSelf: 'flex-start', minHeight: 32, display: 'inline-flex', alignItems: 'center', gap: 10, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 13 }}>
                <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: matches ? '1px solid var(--acid)' : '1.5px solid var(--ink-3)', background: matches ? 'var(--acid)' : 'transparent', color: 'var(--ink-on-bright)' }}>
                  {matches && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
                </span>
                It matches my server
              </button>
            </div>
          )}

          {found && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={cap}>Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={field} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={cap}>2FA code (if on)</span>
                <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" style={{ ...field, letterSpacing: '0.15em' }} />
              </label>
            </div>
          )}

          {error && <span role="alert" style={{ fontSize: 12.5, color: 'var(--rust-deep)' }}>{error}</span>}

          <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 6 }}>
            <SheetButton onClick={onClose}>Cancel</SheetButton>
            <span style={{ flex: '1 1 auto' }} />
            {found && <SheetButton primary disabled={!canConnect} onClick={() => void connect()}>{busy ? 'CONNECTING…' : 'CONNECT'}</SheetButton>}
          </div>
        </form>
      </div>
    </div>
  );
}
