/**
 * Updating the owner's KRNL0 server from the app (server-updates F1–F7,
 * Decision 52; the owner picked both drafts: "Update A" in the saved badge's
 * menu with one sheet, and "Update B" as a block in Settings › Updates).
 *
 * The app only reads and asks. The server's own updater installs the newest
 * signed release, with a backup first and an automatic way back.
 */

import { useEffect, useRef, useState } from 'react';
import { Z } from '../ui/layers';
import cubeDark from '../../assets/launch/cube-dark.webp';
import { SheetButton } from './SyncChip';
import { refreshServerUpdate, setServerAuto, startServerUpdate, useServerUpdateStore, useSyncStore } from '../../store/syncStore';
import { needsNewerApp, STEP_WORDS, type ServerUpdate, type ServerUpdateJob } from '../../../shared/sync/serverUpdate';
import { IS_WEB } from '../../platform';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
const DAY = 24 * 3600_000;
const ISSUES = 'https://github.com/theMindDeveloper/krnl0-server/issues/new';

const openLink = (url: string): void => {
  if (IS_WEB) window.open(url, '_blank', 'noopener');
  else void window.krnl?.appOpenExternal?.(url);
};

const recent = (job: ServerUpdateJob | null | undefined): boolean => !!job && Date.now() - Date.parse(job.at) < DAY;

/** What the badge menu and the Settings block show, from the server's update state. */
export type UpdateView = 'none' | 'available' | 'running' | 'done' | 'failed';
export function updateView(u: ServerUpdate | null, following: boolean): UpdateView {
  if (!u) return 'none';
  if (following || u.job?.state === 'running') return 'running';
  if (recent(u.job) && (u.job?.state === 'rolled-back' || u.job?.state === 'failed') && u.available) return 'failed';
  if (u.available) return 'available';
  if (recent(u.job) && u.job?.state === 'done' && u.job.to === u.current) return 'done';
  return 'none';
}

const field: React.CSSProperties = {
  height: 44, boxSizing: 'border-box', padding: '0 12px', borderRadius: 6, border: '1px solid var(--ink-4)',
  background: 'var(--paper-2)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 14, outline: 'none', minWidth: 0,
};
const cap: React.CSSProperties = { fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' };

function Check() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--acid-ink, var(--acid))" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>;
}

// ── Update A: the row in the saved badge's menu ─────────────────────────────

export function ServerUpdateRow({ onOpen }: { onOpen: () => void }) {
  const u = useServerUpdateStore((s) => s.update);
  const following = useServerUpdateStore((s) => s.following);
  const view = updateView(u, following);
  if (!u || view === 'none') return null;
  const tint = view === 'failed' ? 'var(--rust)' : view === 'done' ? 'var(--acid)' : view === 'running' ? 'var(--cyan)' : 'var(--amber)';
  const title = view === 'running' ? 'Updating your server…'
    : view === 'done' ? `Server updated to ${u.current}${u.job?.auto ? ' last night' : ''}`
    : view === 'failed' ? `Still on ${u.job?.from ?? u.current} — nothing was lost`
    : `KRNL0 server ${u.latest ?? ''} is out`;
  const sub = view === 'running' ? (u.job?.step ? STEP_WORDS[u.job.step] : 'Waiting for the server')
    : view === 'done' ? 'Everything syncs again.'
    : view === 'failed' ? (u.job?.message ?? 'The update did not finish.')
    : u.channel === 'one-click' ? `You have ${u.current} · one click, about 30 seconds` : `You have ${u.current} · one command on the server`;
  return (
    <div data-testid="server-update-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: `color-mix(in srgb, ${tint} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${tint} 35%, transparent)` }}>
      <span aria-hidden="true" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${tint} 18%, transparent)`, color: tint }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {view === 'done' ? <path d="M5 12.5l4.5 4.5L19 7" /> : view === 'running' ? <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" /> : view === 'failed' ? <path d="M12 8v5M12 16.5v.5" /> : <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />}
        </svg>
      </span>
      <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{title}</span>
        <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-2)' }}>{sub}</span>
      </span>
      {view !== 'done' && (
        <SheetButton primary={view === 'available' && u.channel === 'one-click'} onClick={onOpen}>
          {view === 'available' ? (u.channel === 'one-click' ? 'UPDATE' : 'How') : view === 'running' ? 'Show' : 'Details'}
        </SheetButton>
      )}
    </div>
  );
}

// ── The sheet: update, its steps and its result; or the command; or night updates ──

type SheetMode = 'update' | 'auto';

function useNarrow(): boolean {
  const q = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = (): void => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

function CommandBox({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={cap}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--term-bg, #0a0908)', fontSize: 12, color: 'var(--term-fg, var(--ink-2))' }}>
        <code data-testid="server-update-command" style={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere', fontFamily: 'var(--font-mono)' }}>{command}</code>
        <SheetButton onClick={() => { void navigator.clipboard?.writeText(command).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }}>{copied ? 'Copied' : 'Copy'}</SheetButton>
      </div>
    </div>
  );
}

export function ServerUpdateSheet({ onClose, mode = 'update', autoOn }: { onClose: () => void; mode?: SheetMode; autoOn?: boolean }) {
  const u = useServerUpdateStore((s) => s.update);
  const following = useServerUpdateStore((s) => s.following);
  const origin = useSyncStore((s) => s.info?.origin ?? null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const narrow = useNarrow();
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => { pwRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!u) return null;
  const view = retry ? 'available' : updateView(u, following);
  const newerApp = needsNewerApp(u, APP_VERSION);
  const host = (() => { try { return origin ? new URL(origin).host : ''; } catch { return ''; } })();

  const go = async (): Promise<void> => {
    if (!password) return;
    setBusy(true); setError(null);
    const r = mode === 'auto'
      ? await setServerAuto(!autoOn, password, code.replace(/\s/g, '') || undefined)
      : await startServerUpdate(password, code.replace(/\s/g, '') || undefined);
    setBusy(false);
    if (!r.ok) { setError(r.message ?? 'That did not work.'); return; }
    setPassword(''); setCode(''); setRetry(false);
    if (mode === 'auto') onClose();
  };

  const passwordFields = (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0, 1fr)' : 'minmax(0, 2fr) minmax(0, 1fr)', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={cap}>Your server password</span>
        <input ref={pwRef} type="password" data-testid="server-update-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go(); }} autoComplete="current-password" style={field} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={cap}>2FA code (if on)</span>
        <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go(); }} autoComplete="one-time-code" style={{ ...field, letterSpacing: '0.15em' }} />
      </label>
    </div>
  );

  let title: string;
  let body: React.ReactNode;
  let actions: React.ReactNode;

  if (mode === 'auto') {
    title = autoOn ? 'Stop night updates' : 'Update by itself at night';
    body = (
      <>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
          {autoOn ? 'Your server will wait for you to update it.' : 'At 04:00 server time, when a new version is out, your server updates itself the same way: signed releases only, a backup first, and back by itself if anything fails.'}
        </p>
        {passwordFields}
      </>
    );
    actions = <><SheetButton onClick={onClose}>Cancel</SheetButton><span style={{ flex: '1 1 auto' }} /><SheetButton primary disabled={busy || !password} onClick={() => void go()}>{busy ? 'SAVING…' : autoOn ? 'TURN OFF' : 'TURN ON'}</SheetButton></>;
  } else if (view === 'running') {
    const order = ['backup', 'download', 'verify', 'switch', 'health'] as const;
    const at = u.job?.step && (order as readonly string[]).includes(u.job.step) ? order.indexOf(u.job.step as typeof order[number]) : -1;
    title = `Updating your server${u.job?.to ? ` to ${u.job.to}` : ''}`;
    body = (
      <>
        <div data-testid="server-update-steps" style={{ display: 'flex', flexDirection: 'column', fontSize: 13.5 }}>
          {order.map((s, i) => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32, color: i <= at ? 'var(--ink)' : 'var(--ink-3)' }}>
              <span aria-hidden="true" style={{ color: i < at ? 'var(--acid-ink, var(--acid))' : i === at ? 'var(--cyan)' : 'var(--ink-3)' }}>{i < at ? '◆' : i === at ? '◇' : '○'}</span>
              {STEP_WORDS[s]}{i === at ? '…' : ''}
            </span>
          ))}
          {(u.job?.step === 'rollback' || u.job?.step === 'restore') && <span style={{ minHeight: 32, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--rust-deep, var(--rust))' }}>◇ {STEP_WORDS[u.job.step]}…</span>}
        </div>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--ink-3)' }}>Sync is paused while the server restarts. Your edits wait here and go when it is back. You can close this.</p>
      </>
    );
    actions = <><span style={{ flex: '1 1 auto' }} /><SheetButton onClick={onClose}>Hide</SheetButton></>;
  } else if (view === 'done') {
    title = `Your server runs ${u.current}`;
    body = <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>Everything syncs again. A backup from before the update is kept on the server.</p>;
    actions = <><span style={{ flex: '1 1 auto' }} /><SheetButton primary onClick={onClose}>DONE</SheetButton></>;
  } else if (view === 'failed') {
    title = u.job?.state === 'rolled-back' ? `Still on ${u.job.from ?? u.current}` : 'The update did not finish';
    body = (
      <>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{u.job?.message ?? 'Nothing was changed.'}</p>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--ink-3)' }}>Your boards are safe. You can try again later, or tell us what happened.</p>
      </>
    );
    actions = <><SheetButton onClick={() => openLink(ISSUES)}>Report it</SheetButton><span style={{ flex: '1 1 auto' }} /><SheetButton primary onClick={() => setRetry(true)}>TRY AGAIN</SheetButton></>;
  } else if (u.channel !== 'one-click') {
    title = u.available ? `Server ${u.latest ?? ''} is out` : 'Updating your server';
    body = (
      <>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{u.reason ?? 'Run this on the server.'}</p>
        {u.command && <CommandBox label={u.commandWindows ? 'Linux and Mac' : 'On the server'} command={u.command} />}
        {u.commandWindows && <CommandBox label="Windows (PowerShell)" command={u.commandWindows} />}
        {u.commandLinux && <CommandBox label="Linux without Docker" command={u.commandLinux} />}
      </>
    );
    actions = <>{u.url ? <SheetButton onClick={() => openLink(u.url!)}>What&apos;s new</SheetButton> : null}<span style={{ flex: '1 1 auto' }} /><SheetButton onClick={onClose}>Close</SheetButton></>;
  } else {
    title = 'Update your server';
    body = (
      <>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{host ? `${host} · ` : ''}{u.current} → <span style={{ color: 'var(--acid-ink, var(--acid))' }}>{u.latest}</span></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 8, background: 'var(--paper-2)' }}>
          <span style={cap}>What happens</span>
          {['Makes a backup of everything first', 'Checks it is the real release, signed on GitHub', 'Restarts: sync pauses, your edits wait here', `Goes back to ${u.current} by itself if anything fails`].map((s) => (
            <span key={s} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: 'var(--ink)' }}><Check />{s}</span>
          ))}
        </div>
        {newerApp && (
          <div data-testid="server-update-newer-app" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--amber)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Server {u.latest} needs KRNL0 {u.minApp}</span>
            <span style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink-2)' }}>This {IS_WEB ? 'page' : 'computer'} has KRNL0 {APP_VERSION}. Update KRNL0 first, or it stops syncing until you do.</span>
          </div>
        )}
        {passwordFields}
      </>
    );
    actions = (
      <>
        {u.url ? <SheetButton onClick={() => openLink(u.url!)}>What&apos;s new</SheetButton> : <SheetButton onClick={onClose}>Not now</SheetButton>}
        <span style={{ flex: '1 1 auto' }} />
        <SheetButton primary disabled={busy || !password} onClick={() => void go()}>{busy ? 'SENDING…' : newerApp ? 'UPDATE SERVER ANYWAY' : 'UPDATE SERVER'}</SheetButton>
      </>
    );
  }

  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: Z.dialog, background: 'rgba(0, 0, 0, 0.45)', display: 'flex', alignItems: narrow ? 'flex-end' : 'center', justifyContent: 'center', padding: narrow ? 0 : 24 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="server-update-title" data-testid="server-update-sheet"
        style={{ width: narrow ? '100%' : 'min(820px, 100%)', maxHeight: narrow ? '92vh' : 'calc(100vh - 48px)', display: 'flex', overflow: 'hidden', borderRadius: narrow ? '18px 18px 0 0' : 14, background: 'var(--node-bg)', border: '1px solid var(--paper-3)', boxShadow: '0 2px 0 rgba(0,0,0,.2), 0 24px 60px rgba(0,0,0,.45)', fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
        {!narrow && (
          <div aria-hidden="true" style={{ width: 240, flexShrink: 0, background: 'var(--term-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={cubeDark} alt="" style={{ width: 210, height: 210, WebkitMaskImage: 'radial-gradient(closest-side, #000 60%, transparent 100%)', maskImage: 'radial-gradient(closest-side, #000 60%, transparent 100%)' }} />
          </div>
        )}
        <div style={{ flex: '1 1 auto', minWidth: 0, padding: narrow ? '22px 20px 28px' : '26px 28px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
          <h2 id="server-update-title" style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: narrow ? 28 : 32, lineHeight: 1.05 }}>{title}</h2>
          {body}
          {error && <span role="alert" style={{ fontSize: 12.5, color: 'var(--rust-deep)' }}>{error}</span>}
          <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 6, flexWrap: 'wrap' }}>{actions}</div>
        </div>
      </div>
    </div>
  );
}

// ── Update B: the server block in Settings › Updates ────────────────────────

export function ServerUpdateCard() {
  const info = useSyncStore((s) => s.info);
  const u = useServerUpdateStore((s) => s.update);
  const following = useServerUpdateStore((s) => s.following);
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [checking, setChecking] = useState(false);
  const configured = !!info?.configured;

  useEffect(() => { if (configured) void refreshServerUpdate(false); }, [configured]);
  if (!configured) return null;

  const host = (() => { try { return info?.origin ? new URL(info.origin).host : ''; } catch { return ''; } })();
  const view = updateView(u, following);
  const row = (label: string, value: React.ReactNode) => (
    <>
      <span style={cap}>{label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--ink)', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
    </>
  );

  return (
    <div data-testid="settings-server-update" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Your KRNL0 server</span>
      {!u ? (
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Can't reach {host || 'the server'} right now.</span>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: '8px 16px', alignItems: 'center' }}>
            {row('Address', host)}
            {row('Version', <>{u.current}{u.available && u.latest ? <span style={{ color: 'var(--amber)' }}> · {u.latest} is out</span> : <span style={{ color: 'var(--ink-3)' }}> · the newest</span>}</>)}
            {row('Updates', u.channel === 'one-click' ? 'One click, from here' : u.channel === 'command' ? 'With one command on the server' : 'From the source code')}
            {view === 'running' && row('Now', u.job?.step ? STEP_WORDS[u.job.step] : 'Updating…')}
            {view === 'failed' && row('Last update', <span style={{ color: 'var(--rust-deep, var(--rust))' }}>{u.job?.message ?? 'Did not finish.'}</span>)}
            {view === 'done' && row('Last update', `${u.job?.from ?? ''} → ${u.job?.to ?? ''}${u.job?.auto ? ', last night' : ''}`)}
          </div>
          {u.channel === 'one-click' && (
            <button type="button" role="switch" aria-checked={u.auto} data-testid="settings-server-auto" onClick={() => setSheet('auto')}
              style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: 0, background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink)', fontFamily: 'var(--font-mono)', textAlign: 'left' }}>
              <span aria-hidden="true" style={{ width: 36, height: 22, borderRadius: 999, flexShrink: 0, position: 'relative', background: u.auto ? 'var(--acid)' : 'var(--paper-3)' }}>
                <span style={{ position: 'absolute', top: 3, left: u.auto ? 17 : 3, width: 16, height: 16, borderRadius: 999, background: u.auto ? 'var(--btn-primary-fg, #0a0908)' : 'var(--ink-3)', transition: 'left 120ms' }} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12.5 }}>Update by itself at night</span>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>04:00 server time, signed releases only · {u.auto ? 'on' : 'off'}</span>
              </span>
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(u.available || view === 'running' || view === 'failed') && (
              <SheetButton primary={u.channel === 'one-click' && view === 'available'} onClick={() => setSheet('update')}>
                {view === 'running' ? 'Show progress' : view === 'failed' ? 'Details' : u.channel === 'one-click' ? 'UPDATE NOW' : 'How to update'}
              </SheetButton>
            )}
            <SheetButton disabled={checking} onClick={() => { setChecking(true); void refreshServerUpdate(true).finally(() => setChecking(false)); }}>{checking ? 'Checking…' : 'Check now'}</SheetButton>
            {u.url && <SheetButton onClick={() => openLink(u.url!)}>What&apos;s new</SheetButton>}
          </div>
        </>
      )}
      {sheet && u && <ServerUpdateSheet mode={sheet} autoOn={u.auto} onClose={() => setSheet(null)} />}
    </div>
  );
}
