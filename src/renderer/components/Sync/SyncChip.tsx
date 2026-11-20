/**
 * The top-bar sync chip (Decision 51, design "Sync B"): one word for how sync
 * is doing; a click opens the status — devices, Sync now, Open website — or,
 * with no server yet, the Connect sheet.
 */

import { useEffect, useRef, useState } from 'react';
import { Popover } from '../ui/Popover';
import { useEasyMode } from '../../store/uiMode';
import { agoText, chipLook, disconnectSync, fetchDevices, syncNow, useSyncBridge, useSyncStore } from '../../store/syncStore';
import { ConnectSheet } from './ConnectSheet';
import type { SyncDevice } from '../../../shared/sync/port';

const TONE: Record<string, string> = {
  acid: 'var(--acid)',
  cyan: 'var(--cyan)',
  amber: 'var(--amber)',
  rust: 'var(--rust)',
  quiet: 'var(--ink-3)',
};

const hostOf = (origin: string | null): string => {
  try { return origin ? new URL(origin).host : ''; } catch { return origin ?? ''; }
};

export function SyncChip() {
  useSyncBridge();
  const info = useSyncStore((s) => s.info);
  const easy = useEasyMode();
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

  // Easy mode keeps the bar calm: the chip appears once a server is connected.
  if (!info || (easy && !configured)) return null;

  const onChip = (): void => {
    if (!configured || info.state === 'signed-out') setConnecting(true);
    else setOpen((v) => !v);
  };

  const headline = info.state === 'synced' ? 'Everything is in sync'
    : info.state === 'syncing' || info.state === 'connecting' ? 'Syncing…'
    : info.state === 'offline' ? 'Offline — your changes are kept'
    : info.state === 'paused' ? 'Sync paused'
    : info.state === 'update' ? 'Update KRNL0 to keep syncing'
    : 'Sync is off';

  return (
    <>
      <button
        ref={ref}
        type="button"
        data-testid="sync-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={configured ? `Sync with ${hostOf(info.origin)}` : 'Connect your KRNL0 server'}
        onClick={onChip}
        style={{
          height: 26,
          padding: '0 10px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          borderRadius: 999,
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          whiteSpace: 'nowrap',
          color: look.tone === 'quiet' ? 'var(--ink-3)' : 'var(--ink-2)',
          background: 'var(--paper-2)',
          border: `1px solid ${look.tone === 'acid' && open ? 'var(--acid)' : 'var(--paper-3)'}`,
        }}
      >
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: TONE[look.tone] }} />
        {look.label}
      </button>

      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} minWidth={340}>
        <div role="dialog" aria-label="Sync status" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--font-mono)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-2)', color: TONE[look.tone] }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {info.state === 'synced' ? <path d="M5 12.5l4.5 4.5L19 7" /> : <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" />}
              </svg>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{headline}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{hostOf(info.origin)} · last sync {agoText(info.lastSyncedAt)}</span>
            </span>
          </div>
          {info.message && <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{info.message}</span>}
          {info.clockOffsetMs !== null && Math.abs(info.clockOffsetMs) > 5000 && (
            <span style={{ fontSize: 12, color: 'var(--rust-deep)' }}>This computer's clock is off by {Math.round(info.clockOffsetMs / 1000)} s.</span>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <SheetButton disabled={busy} onClick={() => { setBusy(true); void syncNow().finally(() => setBusy(false)); }}>{busy ? 'Syncing…' : 'Sync now'}</SheetButton>
            <SheetButton onClick={() => { if (info.origin) void window.krnl?.appOpenExternal?.(info.origin); }}>Open website</SheetButton>
            <SheetButton danger onClick={() => { setOpen(false); void disconnectSync(); }}>Disconnect</SheetButton>
          </div>
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
        border: primary ? 0 : '1px solid var(--paper-3)',
        background: primary ? 'var(--btn-primary-bg)' : 'var(--paper-2)',
        color: primary ? 'var(--btn-primary-fg)' : danger ? 'var(--rust-deep)' : 'var(--ink)',
      }}
    >
      {children}
    </button>
  );
}
