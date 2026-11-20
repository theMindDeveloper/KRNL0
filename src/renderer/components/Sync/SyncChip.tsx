/**
 * The top bar's "● saved" badge, which also tells how sync is doing
 * (Decision 51). One place for "is my work safe": saved on this device, and,
 * with a KRNL0 server connected, synced with it. A click opens the details —
 * devices, Sync now, Open website / Log out — or, with no server yet, says
 * the board is saved here and offers to connect one (the one way in without
 * the terminal, Easy mode included).
 */

import { useEffect, useRef, useState } from 'react';
import { Popover } from '../ui/Popover';
import { agoText, chipLook, disconnectSync, fetchDevices, syncNow, useSyncBridge, useSyncStore } from '../../store/syncStore';
import { ConnectSheet } from './ConnectSheet';
import { IS_WEB } from '../../platform';
import type { SyncDevice } from '../../../shared/sync/port';

const TONE: Record<string, string> = {
  acid: 'var(--acid-ink, var(--acid))',
  cyan: 'var(--cyan)',
  amber: 'var(--amber)',
  rust: 'var(--rust-deep, var(--rust))',
  quiet: 'var(--ink-3)',
};

const SAVED_TITLE = 'Your board saves itself as you go — there is nothing to save by hand.';

const hostOf = (origin: string | null): string => {
  try { return origin ? new URL(origin).host : ''; } catch { return origin ?? ''; }
};

const badgeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.04em',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  marginRight: 10,
};

export function SaveSyncBadge() {
  useSyncBridge();
  const info = useSyncStore((s) => s.info);
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<SyncDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const look = chipLook(info);
  const configured = !!info?.configured;

  useEffect(() => {
    if (open && configured) void fetchDevices().then(setDevices);
  }, [open, configured]);

  // No sync service in this window (tests, old builds): the plain badge.
  if (!info) {
    return (
      <span data-testid="topbar-live-badge" className="krnl-live-badge" title={SAVED_TITLE} style={{ ...badgeStyle, color: TONE.acid }}>
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor' }} />
        saved
      </span>
    );
  }

  const title = !configured ? SAVED_TITLE
    : look.tone === 'acid' ? `Saved, and synced with ${hostOf(info.origin)}.`
    : `${look.label} — click for details`;

  const headline = !configured ? 'Saved on this computer'
    : info.state === 'synced' ? 'Everything is saved and in sync'
    : info.state === 'syncing' || info.state === 'connecting' ? 'Syncing…'
    : info.state === 'offline' ? 'Offline — your changes are kept here'
    : info.state === 'paused' ? 'Sync paused'
    : info.state === 'update' ? 'Update KRNL0 to keep syncing'
    : info.state === 'signed-out' ? 'Signed out of the server'
    : 'Sync is off';

  return (
    <>
      <button
        ref={ref}
        type="button"
        data-testid="topbar-live-badge"
        className={look.tone === 'acid' ? 'krnl-live-badge' : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((v) => !v)}
        style={{ ...badgeStyle, color: TONE[look.tone], height: 26, padding: '0 6px', margin: '0 4px 0 -6px', border: 0, borderRadius: 6, background: open ? 'var(--paper-3)' : 'transparent', cursor: 'pointer' }}
      >
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor' }} />
        {look.label}
      </button>

      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} minWidth={340}>
        <div role="dialog" aria-label="Saving and sync" data-testid="sync-status" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--font-mono)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-2)', color: TONE[look.tone] }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {look.tone === 'acid' ? <path d="M5 12.5l4.5 4.5L19 7" /> : <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />}
              </svg>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{headline}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                {configured ? `${hostOf(info.origin)} · last sync ${agoText(info.lastSyncedAt)}` : 'Your board saves itself as you go.'}
              </span>
            </span>
          </div>

          {!configured && (
            <>
              <span style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
                Connect your own KRNL0 server to have your boards on your other computers and on your phone.
              </span>
              <SheetButton primary onClick={() => { setOpen(false); setConnecting(true); }}>CONNECT SERVER</SheetButton>
            </>
          )}

          {configured && (
            <>
              {info.message && <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{info.message}</span>}
              {info.clockOffsetMs !== null && Math.abs(info.clockOffsetMs) > 5000 && (
                <span style={{ fontSize: 12, color: 'var(--rust-deep)' }}>This device's clock is off by {Math.round(info.clockOffsetMs / 1000)} s.</span>
              )}
              {devices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {devices.map((d) => (
                    <span key={d.id} style={{ minHeight: 32, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8, fontSize: 12.5, color: 'var(--ink)', background: d.current ? 'var(--acid-faint)' : 'transparent' }}>
                      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: Date.now() - d.lastSeenAt < 10 * 60_000 ? 'var(--acid)' : 'var(--ink-3)' }} />
                      <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}{d.current ? ' (this computer)' : ''}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{agoText(d.lastSeenAt)}</span>
                    </span>
                  ))}
                </div>
              )}
              {info.state === 'signed-out' && !IS_WEB ? (
                <SheetButton primary onClick={() => { setOpen(false); setConnecting(true); }}>CONNECT AGAIN</SheetButton>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${IS_WEB ? 2 : 3}, minmax(0, 1fr))`, gap: 8 }}>
                  <SheetButton disabled={busy} onClick={() => { setBusy(true); void syncNow().finally(() => setBusy(false)); }}>{busy ? 'Syncing…' : 'Sync now'}</SheetButton>
                  {!IS_WEB && <SheetButton onClick={() => { if (info.origin) void window.krnl?.appOpenExternal?.(info.origin); }}>Open website</SheetButton>}
                  <SheetButton danger onClick={() => { setOpen(false); void disconnectSync(); }}>{IS_WEB ? 'Log out' : 'Disconnect'}</SheetButton>
                </div>
              )}
            </>
          )}
        </div>
      </Popover>

      {connecting && <ConnectSheet onClose={() => setConnecting(false)} />}
    </>
  );
}

export function SheetButton({ children, onClick, disabled, danger, primary }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 38,
        padding: '0 12px',
        borderRadius: 6,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'var(--font-mono)',
        fontSize: primary ? 11.5 : 12,
        fontWeight: primary ? 700 : 400,
        letterSpacing: primary ? '0.1em' : 0,
        whiteSpace: 'nowrap',
        border: primary ? 0 : '1px solid var(--paper-3)',
        background: primary ? 'var(--btn-primary-bg)' : 'var(--paper-2)',
        color: primary ? 'var(--btn-primary-fg)' : danger ? 'var(--rust-deep)' : 'var(--ink)',
      }}
    >
      {children}
    </button>
  );
}
