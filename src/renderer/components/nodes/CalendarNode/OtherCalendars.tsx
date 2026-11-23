// Decision 64 / calendar-sync F1–F5 (design: "Manage A", owner 2026-11-22) —
// the Calendar's "Other calendars" card: each calendar with its switch, Add a
// calendar (paste the address, KRNL0 checks it, name and colour), Export and
// Import .ics. And the card of one event from another calendar (Look A).
//
// Every change goes through `krnl cal …` (window.krnl.sysRun), the same
// commands the terminal has (hard rule 8); the board then reloads with the
// change, so nothing here keeps its own copy of a link.

import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useOneOverlay } from '../../ui/oneOverlay';
import { Z } from '../../ui/layers';
import { Switch } from '../../ui/Switch';
import { MenuIcon, type MenuIconName } from '../../ui/menuIcons';
import { CARD_W, CardClose, CardGroup, cardAct, cardBox, cardHead, cardLabel, cardLink, cardPrimary, cardRow, cardTitle } from '../../ui/addCard';
import { useBoardStore } from '../../../store/boardStore';
import { LINK_COLORS, linkMeta, linksOf, providerLabel, type CalendarLink, type LinkColor, type LinkedEvent, type LinkProvider } from '../../../../shared/calsync/types';
import type { AccountCalendar, AccountRow } from '../../../../shared/calsync/port';

type RunResult = { ok: boolean; message: string };

async function run(argv: string[]): Promise<RunResult> {
  const sys = window.krnl?.sysRun;
  if (!sys) return { ok: false, message: 'Other calendars are added in the KRNL0 desktop app.' };
  try { return await sys(argv); } catch (err) { return { ok: false, message: err instanceof Error ? err.message : String(err) }; }
}

const canRun = () => typeof window !== 'undefined' && !!window.krnl?.sysRun;

const COLOR_NAME: Record<LinkColor, string> = { lilac: 'Lilac', amber: 'Amber', teal: 'Teal', rose: 'Rose', moss: 'Moss', sand: 'Sand' };

/** Look A — the outline, wash and text of an event from another calendar. */
export function linkedLook(color: LinkColor): { bg: string; border: string; text: string; meta: string; mark: string } {
  const col = `var(--${color})`;
  return {
    bg: `color-mix(in srgb, ${col} 6%, var(--node-bg, var(--paper)))`,
    border: `color-mix(in srgb, ${col} 78%, var(--node-bg, var(--paper)))`,
    text: `color-mix(in srgb, ${col} 26%, var(--ink))`,
    meta: `color-mix(in srgb, ${col} 30%, var(--ink-3))`,
    mark: `color-mix(in srgb, ${col} 55%, var(--ink-3))`,
  };
}

function Dot({ color, size = 10 }: { color: LinkColor; size?: number }) {
  return <span aria-hidden style={{ width: size, height: size, flexShrink: 0, borderRadius: '50%', background: `var(--${color})` }} />;
}

function ColorDots({ value, onPick }: { value: LinkColor; onPick: (c: LinkColor) => void }) {
  return (
    <span role="radiogroup" aria-label="Colour" style={{ display: 'inline-flex', gap: 6 }}>
      {LINK_COLORS.map((c) => (
        <button
          key={c} type="button" role="radio" aria-checked={value === c} aria-label={COLOR_NAME[c]} title={COLOR_NAME[c]}
          data-testid={`othercal-color-${c}`}
          onClick={() => onPick(c)}
          style={{ width: 24, height: 24, padding: 0, border: 0, borderRadius: '50%', cursor: 'pointer', background: `var(--${c})`, boxShadow: value === c ? '0 0 0 2px var(--paper-2), 0 0 0 4px var(--ink)' : 'none' }}
        />
      ))}
    </span>
  );
}

function ActButton({ icon, children, onClick, disabled, danger, testId }: { icon: MenuIconName; children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; testId?: string }) {
  return (
    <button type="button" data-testid={testId} disabled={disabled} onClick={onClick}
      style={{ ...cardAct, justifyContent: 'center', color: danger ? 'var(--rust-deep, var(--rust))' : 'var(--ink)', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}>
      <MenuIcon name={icon} size={13} />{children}
    </button>
  );
}

/** Settings › Calendars draws the same card in its page: no floating, no X. */
export const CalendarsEmbedded = createContext(false);

/** The card's X — not in Settings (the page has its own). */
function Close({ onClick }: { onClick: () => void }) {
  return useContext(CalendarsEmbedded) ? null : <CardClose onClick={onClick} />;
}

/** A card in the add-card standard, placed by the point it opened from. */
function CardFrame({ x, y, label, testId, onClose, children }: { x: number; y: number; label: string; testId: string; onClose: () => void; children: ReactNode }) {
  const embedded = useContext(CalendarsEmbedded);
  useOneOverlay(!embedded, onClose);
  useEffect(() => {
    if (embedded) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, embedded]);
  if (embedded) {
    return (
      <div data-testid={testId} role="region" aria-label={label} style={{ ...cardBox, width: '100%', maxWidth: 480, boxShadow: 'none', background: 'transparent', border: 'none', padding: 0 }}>
        {children}
      </div>
    );
  }
  const left = Math.max(8, Math.min(x, window.innerWidth - CARD_W - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - 420));
  return createPortal(
    <>
      <div onMouseDown={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: Z.popoverBackdrop }} />
      <div
        data-testid={testId} className="kw-card nodrag nowheel" data-owns-keys="true" role="dialog" aria-label={label}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ ...cardBox, position: 'fixed', left, top, zIndex: Z.popover, maxHeight: `calc(100vh - ${top + 8}px)`, overflowY: 'auto' }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

const fieldStyle = (bad = false): CSSProperties => ({
  height: 40, width: '100%', boxSizing: 'border-box', padding: '0 12px', borderRadius: 8,
  border: bad ? '2px solid var(--rust)' : '1px solid var(--control-edge, var(--ink-4))', background: 'var(--node-bg, var(--paper))',
  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', outline: 'none',
});

const noteStyle: CSSProperties = { ...cardLink, margin: 0, lineHeight: 1.45 };
/** Info rows: a fixed label at the left, the value fills the rest on one line. */
const infoLabel: CSSProperties = { flexShrink: 0, width: 56, fontFamily: 'var(--font-read)', fontSize: 13.5, color: 'var(--ink-2)' };
const infoValue: CSSProperties = { flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const sectionLabel: CSSProperties = { fontFamily: 'var(--font-read)', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginBottom: -6 };

// ── The Other calendars card (Manage A) ───────────────────────────────────

type Preview = { ok: true; url: string; name: string | null; provider: LinkProvider; count: number; next: LinkedEvent | null } | { ok: false; reason: string; message: string };
interface LiveRow { id: string; here: boolean; checkedAt?: string; okAt?: string }
interface ImportSummary { items: number; once: number; repeating: number; expanded: number; existing: number; allDay: number }

type View =
  | { kind: 'list' }
  | { kind: 'detail'; id: string }
  | { kind: 'add' }
  | { kind: 'link' }
  | { kind: 'apple'; email?: string }
  | { kind: 'caldav' }
  | { kind: 'google' }
  | { kind: 'pick'; res: ConnectOk }
  | { kind: 'import'; path: string; file: string; plan: ImportSummary };

export function OtherCalendarsCard({ x, y, onClose, startWith }: { x: number; y: number; onClose: () => void; startWith?: 'add' }) {
  const calendarLinks = useBoardStore((s) => (s.board as { calendarLinks?: unknown }).calendarLinks);
  const links = useMemo(() => linksOf({ calendarLinks }), [calendarLinks]);
  const [view, setView] = useState<View>(startWith === 'add' ? { kind: 'add' } : { kind: 'list' });
  const [live, setLive] = useState<Map<string, LiveRow>>(new Map());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const desktop = canRun();
  // A calendar removed meanwhile (the terminal, another card): back to the list.
  useEffect(() => {
    if (view.kind === 'detail' && !links.some((l) => l.id === view.id)) setView({ kind: 'list' });
  }, [view, links]);

  // This device's check times (kept off the board, NF7) and which links it runs.
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const refresh = async () => {
    const res = await run(['cal', 'links', '--json']);
    if (res.ok) {
      try {
        const rows = JSON.parse(res.message) as LiveRow[];
        setLive(new Map(rows.map((r) => [r.id, r])));
      } catch { /* not JSON: leave as is */ }
    }
    const acc = await run(['cal', 'accounts', '--json']);
    if (acc.ok) { try { setAccounts(JSON.parse(acc.message) as AccountRow[]); } catch { /* leave */ } }
  };
  /** An account's calendars (to show here, or change which), or its sign-in when it stopped working. */
  const openAccount = async (a: AccountRow) => {
    const res = (await window.krnl?.calAccountCalendars?.(a.accountId)) as ConnectRes | undefined;
    if (res?.ok) { setView({ kind: 'pick', res }); return; }
    if (res && res.reason === 'signIn') { setView(a.provider === 'google' ? { kind: 'google' } : a.provider === 'icloud' ? { kind: 'apple', email: a.account } : { kind: 'caldav' }); return; }
    setNote(res?.message ?? 'The account did not answer. Check the internet connection.');
  };
  useEffect(() => {
    if (!desktop) return undefined;
    void refresh();
    const t = setInterval(() => { void refresh(); }, 30_000);
    return () => clearInterval(t);
  }, [desktop, calendarLinks]);

  const rowOf = (l: CalendarLink): CalendarLink & { here: boolean } => {
    const r = live.get(l.id);
    return { ...l, ...(r?.checkedAt ? { checkedAt: r.checkedAt } : {}), ...(r?.okAt ? { okAt: r.okAt } : {}), here: r?.here ?? false };
  };

  const doExport = async () => {
    const path = await window.krnl?.calSaveIcs?.();
    if (!path) return;
    const res = await run(['cal', 'export', '--out', path]);
    setNote(res.ok ? res.message.replace(/^saved/, 'Saved') : res.message);
  };
  const doImport = async () => {
    const path = await window.krnl?.calPickIcs?.();
    if (!path) return;
    const res = await run(['cal', 'import', path, '--dry-run', '--json']);
    if (!res.ok) { setNote(res.message); return; }
    try {
      const plan = JSON.parse(res.message) as ImportSummary;
      setView({ kind: 'import', path, file: path.split(/[\\/]/).pop() ?? path, plan });
    } catch { setNote(res.message); }
  };

  const toList = (msg?: string) => { if (msg) setNote(msg); setView({ kind: 'list' }); };
  const toAdd = () => setView({ kind: 'add' });
  if (view.kind === 'add') {
    return <AddChooser x={x} y={y} onClose={onClose} onBack={links.length ? () => toList() : null} onPick={(k) => setView({ kind: k })} />;
  }
  if (view.kind === 'link') {
    return <AddCalendar x={x} y={y} onClose={onClose} onBack={toAdd} used={links.map((l) => l.color)} onAdded={(msg) => toList(msg)} />;
  }
  if (view.kind === 'apple') {
    return <AppleSignIn x={x} y={y} onClose={onClose} onBack={toAdd} {...(view.email ? { email: view.email } : {})} onConnected={(res) => setView({ kind: 'pick', res })} />;
  }
  if (view.kind === 'caldav') {
    return <CalDavSignIn x={x} y={y} onClose={onClose} onBack={toAdd} onConnected={(res) => setView({ kind: 'pick', res })} />;
  }
  if (view.kind === 'google') {
    return <GoogleSignIn x={x} y={y} onClose={onClose} onBack={toAdd} onConnected={(res) => setView({ kind: 'pick', res })} onUseLink={() => setView({ kind: 'link' })} />;
  }
  if (view.kind === 'pick') {
    return <CalendarPicker x={x} y={y} onClose={onClose} res={view.res} onDone={(msg) => toList(msg)} />;
  }

  if (view.kind === 'import') {
    const p = view.plan;
    const lines: Array<[string, number, boolean?]> = [
      ['One-time events', p.once],
      ['Repeating every week or day', p.repeating],
      ...(p.expanded ? [['Other repeats, added day by day', p.expanded] as [string, number]] : []),
      ...(p.existing ? [['Already on your Calendar, skipped', p.existing, true] as [string, number, boolean]] : []),
      ...(p.allDay ? [['All-day, left out', p.allDay, true] as [string, number, boolean]] : []),
    ];
    const apply = async () => {
      setBusy(true);
      const res = await run(['cal', 'import', view.path]);
      setBusy(false);
      setNote(res.ok ? `Added ${p.items} events from ${view.file}.` : res.message);
      setView({ kind: 'list' });
    };
    return (
      <CardFrame x={x} y={y} label={`Import ${view.file}`} testId="othercal-import" onClose={onClose}>
        <div style={cardHead}>
          <BackButton onClick={() => setView({ kind: 'list' })} />
          <span style={{ ...cardTitle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Import {view.file}</span>
          <Close onClick={onClose} />
        </div>
        <CardGroup>
          {lines.map(([label, n, quiet]) => (
            <div key={label} style={cardRow}>
              <span style={cardLabel}>{label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: quiet ? 'var(--ink-3)' : 'var(--ink)' }}>{n}</span>
            </div>
          ))}
        </CardGroup>
        <p style={noteStyle}>They become your own KRNL0 events: you can move and change them. Nothing goes to Todo.</p>
        <button type="button" data-testid="othercal-import-apply" disabled={busy || p.items === 0} onClick={() => { void apply(); }} style={cardPrimary(!busy && p.items > 0)}>
          {p.items === 0 ? 'Nothing new to add' : busy ? 'Adding…' : `Add ${p.items} event${p.items === 1 ? '' : 's'}`}
        </button>
      </CardFrame>
    );
  }

  if (view.kind === 'detail') {
    const l = links.find((k) => k.id === view.id);
    if (!l) return null;
    return <LinkDetail link={rowOf(l)} x={x} y={y} onClose={onClose} onBack={() => setView({ kind: 'list' })} onChecked={() => { void refresh(); }} onRemoved={(msg) => { setNote(msg); setView({ kind: 'list' }); }}
      onPick={(res) => setView({ kind: 'pick', res })} onSignInAgain={(kind, email) => setView(kind === 'google' ? { kind: 'google' } : kind === 'apple' ? { kind: 'apple', ...(email ? { email } : {}) } : { kind: 'caldav' })} />;
  }

  const now = Date.now();
  return (
    <CardFrame x={x} y={y} label="Other calendars" testId="othercal-card" onClose={onClose}>
      <div style={cardHead}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={cardTitle}>Other calendars</span>
          <span data-testid="othercal-summary" style={{ fontFamily: 'var(--font-read)', fontSize: 12, color: 'var(--ink-3)' }}>
            {links.filter((l) => l.role !== 'mirror' && l.on).length > 0
              ? `${links.filter((l) => l.role !== 'mirror' && l.on).reduce((n, l) => n + l.events.length, 0)} events this year on your Calendar`
              : accounts.length ? 'Signed in, nothing shown on this board yet' : 'Your Google, iPhone or school calendar, next to your plans'}
          </span>
        </span>
        <Close onClick={onClose} />
      </div>
      {accounts.length > 0 && (
        <>
          <span style={sectionLabel}>Signed in</span>
          <CardGroup>
            {accounts.map((a) => {
              const mine = links.filter((l) => l.accountId === a.accountId).map(rowOf);
              const last = mine.map((l) => l.okAt ?? '').sort().pop();
              const ago = last ? linkMeta({ ...mine[0]!, on: true, state: 'ok', okAt: last, role: 'read' }, now, true).split(' · ').pop() : '';
              const fresh = !a.signedOut && a.onBoard === 0 && !a.sending;
              const status = a.signedOut ? 'Sign in again'
                : fresh ? 'Not on this board yet'
                : [`${a.onBoard} shown`, ...(a.sending ? ['both ways'] : []), ...(ago ? [ago.replace(/^checked /, 'synced ')] : [])].join(' · ');
              return (
                <div key={a.accountId} data-testid={`othercal-account-${a.account}`} style={{ ...cardRow, minHeight: 64, gap: 12 }}>
                  <span aria-hidden style={{ width: 32, height: 32, flexShrink: 0, borderRadius: '50%', background: 'var(--paper)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-read)', fontSize: 14, fontWeight: 700 }}>
                    {a.provider === 'google' ? 'G' : a.provider === 'icloud' ? <MenuIcon name="event" size={15} /> : 'C'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, fontFamily: 'var(--font-read)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                      {providerLabel(a.provider)}
                      {!a.signedOut && !fresh && <span aria-label="Connected" title="Connected" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acid)', boxShadow: '0 0 0 1px var(--acid-ink, var(--ink-3))' }} />}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.account}>{a.account}</span>
                    <span style={{ fontSize: 11.5, color: a.signedOut ? 'var(--rust-deep, var(--rust))' : 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>
                  </span>
                  <button type="button" data-testid={`othercal-account-open-${a.account}`} onClick={() => { void openAccount(a); }}
                    style={{ ...cardAct, flexShrink: 0, height: 30, padding: '0 12px', fontSize: 12.5, background: fresh || a.signedOut ? 'var(--btn-primary-bg, var(--ink))' : 'var(--paper)', color: fresh || a.signedOut ? 'var(--btn-primary-fg, var(--acid))' : 'var(--ink)' }}>
                    {a.signedOut ? 'Sign in' : fresh ? 'Show here' : 'Manage'}
                  </button>
                </div>
              );
            })}
          </CardGroup>
        </>
      )}
      {links.length > 0 ? (
        <>
          <span style={sectionLabel}>On this board</span>
          <CardGroup>
            {links.map((l0) => {
              const l = rowOf(l0);
              return (
                <div key={l.id} data-testid={`othercal-row-${l.id}`} style={{ ...cardRow, minHeight: 54 }}>
                  <Dot color={l.color} />
                  <button type="button" onClick={() => setView({ kind: 'detail', id: l.id })} title="Rename, colour, check now, remove"
                    style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-read)' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                    <span style={{ fontSize: 12, color: l.state === 'unreachable' || l.state === 'notCalendar' || l.state === 'signedOut' ? 'var(--rust-deep, var(--rust))' : 'var(--ink-3)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.role === 'mirror' ? `${providerLabel(l.provider)} · your plans, both ways` : linkMeta(l, now, l.here).replace(/ · checked /, ' · synced ')}</span>
                  </button>
                  {desktop && (
                    <Switch checked={l.on} title={l.on ? `Hide ${l.name}` : `Show ${l.name}`} testId={`othercal-switch-${l.id}`} size="md"
                      onChange={(on) => { void run(['cal', 'link', 'set', l.id, on ? '--show' : '--hide']); }} />
                  )}
                </div>
              );
            })}
          </CardGroup>
          <p style={noteStyle}>KRNL0 keeps them up to date by itself. Click one to rename it, pick its colour, check it now or remove it.</p>
        </>
      ) : accounts.length === 0 ? (
        <p style={noteStyle}>Show your iPhone, Google, work or school calendar here, next to your plans, and put your KRNL0 plans on your phone.</p>
      ) : null}
      {note && <p data-testid="othercal-note" style={{ ...noteStyle, color: 'var(--ink-2)' }}>{note}</p>}
      {desktop ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" data-testid="othercal-add" onClick={() => { setNote(null); setView({ kind: 'add' }); }} style={cardPrimary(true)}>Add a calendar</button>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <ActButton icon="download" testId="othercal-export" onClick={() => { void doExport(); }}>Export .ics</ActButton>
            <ActButton icon="upload" testId="othercal-import-pick" onClick={() => { void doImport(); }}>Import .ics</ActButton>
          </div>
        </div>
      ) : (
        <p style={noteStyle}>Add other calendars in the KRNL0 desktop app.</p>
      )}
    </CardFrame>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Back" title="Back" onClick={onClick}
      style={{ width: 28, height: 28, flexShrink: 0, border: 'none', borderRadius: 8, background: 'var(--paper-2)', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <MenuIcon name="back" size={13} />
    </button>
  );
}

// ── One calendar: name, colour, check now, remove ────────────────────────

function LinkDetail({ link, x, y, onClose, onBack, onChecked, onRemoved, onPick, onSignInAgain }: { link: CalendarLink & { here: boolean }; x: number; y: number; onClose: () => void; onBack: () => void; onChecked: () => void; onRemoved: (msg: string) => void; onPick: (res: ConnectOk) => void; onSignInAgain: (kind: 'apple' | 'google' | 'caldav', email?: string) => void }) {
  const [name, setName] = useState(link.name);
  const [acctBusy, setAcctBusy] = useState(false);
  const account = link.kind !== 'ics' && link.accountId;
  const kindOf = (): 'apple' | 'google' | 'caldav' => (link.kind === 'google' ? 'google' : link.provider === 'icloud' ? 'apple' : 'caldav');
  const changeCalendars = async () => {
    if (!link.accountId) return;
    setAcctBusy(true);
    const res = (await window.krnl?.calAccountCalendars?.(link.accountId)) as ConnectRes | undefined;
    setAcctBusy(false);
    if (res?.ok) onPick(res); else if (res && res.reason === 'signIn') onSignInAgain(kindOf(), link.account); else setMsg(res?.message ?? 'The account did not answer.');
  };
  const [sure, setSure] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const saveName = () => { const n = name.trim(); if (n && n !== link.name) void run(['cal', 'link', 'set', link.id, '--name', n]); };
  return (
    <CardFrame x={x} y={y} label={link.name} testId="othercal-detail" onClose={() => { saveName(); onClose(); }}>
      <div style={cardHead}>
        <BackButton onClick={() => { saveName(); onBack(); }} />
        <Dot color={link.color} />
        <span style={{ ...cardTitle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.name}</span>
        <Close onClick={() => { saveName(); onClose(); }} />
      </div>
      <CardGroup>
        <div style={cardRow}>
          <span style={cardLabel}>Name</span>
          <input aria-label="Name" data-testid="othercal-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ width: 150, height: 30, boxSizing: 'border-box', padding: '0 10px', border: 0, borderRadius: 8, background: 'var(--paper-3)', fontFamily: 'var(--font-read)', fontSize: 13, color: 'var(--ink)', outline: 'none' }} />
        </div>
        <div style={{ ...cardRow, minHeight: 46 }}>
          <span style={cardLabel}>Colour</span>
          <ColorDots value={link.color} onPick={(c) => { void run(['cal', 'link', 'set', link.id, '--color', c]); }} />
        </div>
        <div style={cardRow}>
          <span style={cardLabel}>From</span>
          <span style={{ fontSize: 13 }}>{providerLabel(link.provider)}</span>
        </div>
        {link.account && (
          <div style={cardRow}>
            <span style={cardLabel}>Account</span>
            <span style={{ fontSize: 13, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={link.account}>{link.account}</span>
          </div>
        )}
        <div style={cardRow}>
          <span style={cardLabel}>{link.role === 'mirror' ? 'Kept in step' : 'Events this year'}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{link.role === 'mirror' ? (link.map?.length ?? 0) : link.events.length}</span>
        </div>
      </CardGroup>
      {link.role === 'mirror' && <p style={noteStyle}>Your events and planned tasks are in "{link.name}" in {providerLabel(link.provider)}. Change them on either side: the other follows within two minutes.</p>}
      {link.state === 'signedOut' && account && (
        <button type="button" data-testid="othercal-signin-again" onClick={() => onSignInAgain(kindOf(), link.account)} style={cardPrimary(true)}>Sign in again</button>
      )}
      {account && link.here && link.state !== 'signedOut' && (
        <ActButton icon="list" testId="othercal-change-cals" disabled={acctBusy} onClick={() => { void changeCalendars(); }}>{acctBusy ? 'Asking the account…' : 'Choose calendars'}</ActButton>
      )}
      <p style={noteStyle}>{msg ?? linkMeta(link, Date.now(), link.here)}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <ActButton icon="restart" testId="othercal-check" disabled={!link.here || checking} onClick={() => {
          setChecking(true);
          void run(['cal', 'sync', link.id]).then((r) => { setChecking(false); setMsg(r.ok ? 'Checked just now.' : r.message); onChecked(); });
        }}>{checking ? 'Checking…' : 'Check now'}</ActButton>
        <ActButton icon="delete" danger testId="othercal-remove" onClick={() => {
          if (!sure) { setSure(true); return; }
          void run(['cal', 'unlink', link.id]).then((r) => onRemoved(r.ok ? `Removed ${link.name}. The calendar itself is untouched.` : r.message));
        }}>{sure ? 'Remove it' : 'Remove'}</ActButton>
      </div>
      {account && link.account && (
        <button type="button" data-testid="othercal-signout" onClick={() => { void run(['cal', 'signout', link.accountId!]).then((r) => onRemoved(r.ok ? `Signed out of ${link.account}. Nothing in the account was deleted.` : r.message)); }}
          style={{ ...cardAct, justifyContent: 'center', background: 'transparent', color: 'var(--ink-3)' }}>Sign out of {link.account}</button>
      )}
    </CardFrame>
  );
}

// ── Add a calendar (F2): paste, KRNL0 checks it, name and colour ─────────

const HOWTO: Array<{ id: string; title: string; steps: ReactNode[] }> = [
  { id: 'google', title: 'From Google Calendar', steps: ['Open Google Calendar on a computer.', 'Settings, then the calendar on the left, then Integrate calendar.', <>Copy <b style={{ fontWeight: 600, color: 'var(--ink)' }}>Secret address in iCal format</b>.</>] },
  { id: 'apple', title: 'From Apple Calendar', steps: ['Open Calendar on a Mac, or icloud.com/calendar.', 'Share the calendar (the person icon next to it).', <>Turn on <b style={{ fontWeight: 600, color: 'var(--ink)' }}>Public Calendar</b> and copy the link: it starts with webcal://.</>] },
  { id: 'other', title: 'From another calendar', steps: ['Look for Subscribe, ICS or iCal in its settings.', 'Copy the address: it ends in .ics or starts with webcal://.'] },
];

function AddCalendar({ x, y, onClose, onBack, used, onAdded }: { x: number; y: number; onClose: () => void; onBack: (() => void) | null; used: LinkColor[]; onAdded: (msg: string) => void }) {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState<string | null>('google');
  const [step, setStep] = useState<'paste' | 'checking' | 'found' | 'error' | 'adding'>('paste');
  const [pre, setPre] = useState<Preview | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<LinkColor>(LINK_COLORS.find((c) => !used.includes(c)) ?? 'lilac');
  const [checkedUrl, setCheckedUrl] = useState('');

  const check = async (value = url) => {
    const v = value.trim();
    if (!v || (v === checkedUrl && step !== 'error')) return;
    setCheckedUrl(v);
    setStep('checking');
    const res = await run(['cal', 'link', 'check', v, '--json']);
    let p: Preview;
    try { p = JSON.parse(res.message) as Preview; } catch { p = { ok: false, reason: 'unreachable', message: res.message }; }
    setPre(p);
    if (p.ok) { setName(p.name ?? providerLabel(p.provider)); setStep('found'); } else setStep('error');
  };
  const add = async () => {
    if (!pre?.ok) return;
    setStep('adding');
    const res = await run(['cal', 'link', 'ics', pre.url, '--name', name.trim() || providerLabel(pre.provider), '--color', color]);
    if (res.ok) onAdded(`Added ${name.trim() || providerLabel(pre.provider)}. Its events are on the Calendar.`);
    else { setPre({ ok: false, reason: 'unreachable', message: res.message }); setStep('error'); }
  };

  const found = pre && pre.ok ? pre : null;
  const bad = step === 'error' && pre && !pre.ok ? pre : null;
  const fmtNext = (e: LinkedEvent) => {
    const d = new Date(`${e.start.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${e.title} · ${d}${e.allDay ? '' : ` ${e.start.slice(11, 16)}`}`;
  };

  return (
    <CardFrame x={x} y={y} label="Add a calendar" testId="othercal-add-card" onClose={onClose}>
      <div style={cardHead}>
        {onBack && <BackButton onClick={onBack} />}
        <span style={cardTitle}>Add a calendar</span>
        <Close onClick={onClose} />
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-read)', fontSize: 12.5, color: 'var(--ink-2)' }}>
        Calendar address
        <span style={{ position: 'relative', display: 'block' }}>
          <input
            autoFocus data-testid="othercal-url" value={url} placeholder="https://…  or  webcal://…" spellCheck={false}
            onChange={(e) => { setUrl(e.target.value); if (step !== 'checking' && step !== 'adding') setStep('paste'); }}
            onPaste={(e) => { const t = e.clipboardData.getData('text'); if (t) { e.preventDefault(); setUrl(t.trim()); void check(t); } }}
            onKeyDown={(e) => { if (e.key === 'Enter') void check(); }}
            style={{ ...fieldStyle(!!bad), paddingRight: found ? 34 : 12 }}
          />
          {found && step !== 'paste' && (
            <span role="img" aria-label="Found" style={{ position: 'absolute', right: 12, top: 13, color: 'var(--acid-ink, var(--acid))', display: 'inline-flex' }}><MenuIcon name="check" size={14} /></span>
          )}
        </span>
      </label>

      {found && step !== 'paste' ? (
        <>
          <CardGroup>
            <div style={cardRow}><span style={cardLabel}>Found</span><span style={{ fontSize: 13, fontWeight: 600 }}>{providerLabel(found.provider)} · {found.count} events</span></div>
            {found.next && <div style={cardRow}><span style={cardLabel}>Next</span><span style={{ fontSize: 13, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtNext(found.next)}</span></div>}
            <div style={cardRow}>
              <span style={cardLabel}>Name</span>
              <input aria-label="Name" data-testid="othercal-add-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
                style={{ width: 150, height: 30, boxSizing: 'border-box', padding: '0 10px', border: 0, borderRadius: 8, background: 'var(--paper-3)', fontFamily: 'var(--font-read)', fontSize: 13, color: 'var(--ink)', outline: 'none' }} />
            </div>
            <div style={{ ...cardRow, minHeight: 46 }}><span style={cardLabel}>Colour</span><ColorDots value={color} onPick={setColor} /></div>
          </CardGroup>
          <p style={noteStyle}>Its events show on the Calendar with this colour. KRNL0 looks for changes every 15 minutes.</p>
          <button type="button" data-testid="othercal-add-submit" disabled={step === 'adding'} onClick={() => { void add(); }} style={cardPrimary(step !== 'adding')}>{step === 'adding' ? 'Adding…' : 'Add calendar'}</button>
        </>
      ) : bad ? (
        <>
          <div data-testid="othercal-add-error" style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--paper-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-read)', fontSize: 13.5, fontWeight: 600, color: 'var(--rust-deep, var(--rust))' }}>
              {bad.reason === 'googleSharePage' || bad.reason === 'notCalendar' ? 'This address is not a calendar file' : bad.reason === 'notAddress' ? 'This is not a web address' : 'This address did not answer'}
            </span>
            <span style={{ fontFamily: 'var(--font-read)', fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-2)' }}>{bad.message}</span>
          </div>
          <button type="button" onClick={() => { void check(); }} style={cardPrimary(true)}>Try again</button>
        </>
      ) : (
        <>
          <CardGroup>
            {HOWTO.map((h) => (
              <div key={h.id}>
                <button type="button" aria-expanded={open === h.id} onClick={() => setOpen(open === h.id ? null : h.id)}
                  style={{ width: '100%', minHeight: 42, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 0 14px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-read)', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', textAlign: 'left' }}>
                  <span style={{ flex: 1 }}>{h.title}</span>
                  <span style={{ color: 'var(--ink-3)', display: 'inline-flex', transform: open === h.id ? 'rotate(90deg)' : 'rotate(-90deg)' }}><MenuIcon name="back" size={12} /></span>
                </button>
                {open === h.id && (
                  <ol style={{ margin: 0, padding: '0 14px 12px 32px', display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-read)', fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink-2)' }}>
                    {h.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                )}
              </div>
            ))}
          </CardGroup>
          <p style={noteStyle}>KRNL0 only reads this calendar. Keep the address to yourself: anyone who has it can see the calendar.</p>
          <button type="button" data-testid="othercal-add-check" disabled={!url.trim() || step === 'checking'} onClick={() => { void check(); }} style={cardPrimary(!!url.trim() && step !== 'checking')}>
            {step === 'checking' ? 'Checking…' : 'Add calendar'}
          </button>
        </>
      )}
    </CardFrame>
  );
}

// ── "Nothing from Gmail this week · next 19 Apr 2027" ──────────────────────

/** The first event of the shown calendars after `afterYMD` (or, if none, the last before `fromYMD`). */
export function linkedAround(links: readonly CalendarLink[], fromYMD: string, afterYMD: string): { link: CalendarLink; ev: LinkedEvent; when: 'next' | 'last' } | null {
  let next: { link: CalendarLink; ev: LinkedEvent } | null = null;
  let last: { link: CalendarLink; ev: LinkedEvent } | null = null;
  for (const link of links) {
    for (const ev of link.events) {
      const d = ev.start.slice(0, 10);
      if (d > afterYMD) { if (!next || ev.start < next.ev.start) next = { link, ev }; break; }
      if (d < fromYMD && (!last || ev.start > last.ev.start)) last = { link, ev };
    }
  }
  return next ? { ...next, when: 'next' } : last ? { ...last, when: 'last' } : null;
}

/**
 * When the week, day or month shown has no event from the other calendars:
 * one quiet line saying they are there and when the next one is (so an empty
 * view never reads as "it did not sync"). A click goes there.
 */
export function LinkedEmptyHint({ links, fromYMD, toYMD, period, onJump }: { links: readonly CalendarLink[]; fromYMD: string; toYMD: string; period: string; onJump: (ymd: string) => void }) {
  const shown = links.filter((l) => l.on && l.events.length > 0);
  if (!shown.length) return null;
  const any = shown.some((l) => l.events.some((e) => (e.allDay ? e.start <= toYMD && e.end > fromYMD : e.start.slice(0, 10) <= toYMD && e.end.slice(0, 10) >= fromYMD)));
  if (any) return null;
  const around = linkedAround(shown, fromYMD, toYMD);
  if (!around) return null;
  const names = [...new Set(shown.map((l) => l.name))];
  const from = names.length === 1 ? names[0]! : 'your other calendars';
  const day = around.ev.start.slice(0, 10);
  return (
    <button type="button" data-testid="calendar-linked-hint" className="nodrag" onClick={() => onJump(day)}
      title={`Go to ${around.ev.title}`}
      style={{ alignSelf: 'center', margin: '4px auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 999, border: 0, cursor: 'pointer',
        background: 'var(--paper-2)', color: 'var(--ink-2)', fontFamily: 'var(--font-read)', fontSize: 12, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: `var(--${around.link.color})` }} />
      Nothing from {from} {period} · {around.when === 'next' ? 'next' : 'last'}: {around.ev.title}, {dayLabel(day)}
    </button>
  );
}

// ── One event from another calendar (F3) ─────────────────────────────────

function dayLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function linkedWhen(ev: LinkedEvent): string {
  if (ev.allDay) {
    const last = new Date(`${ev.end}T00:00:00`);
    last.setDate(last.getDate() - 1);
    const lastYMD = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    return lastYMD > ev.start ? `${dayLabel(ev.start)} – ${dayLabel(lastYMD)} · all day` : `${dayLabel(ev.start)} · all day`;
  }
  const sameDay = ev.start.slice(0, 10) === ev.end.slice(0, 10);
  return sameDay
    ? `${dayLabel(ev.start.slice(0, 10))} · ${ev.start.slice(11, 16)}–${ev.end.slice(11, 16)}`
    : `${dayLabel(ev.start.slice(0, 10))} ${ev.start.slice(11, 16)} – ${dayLabel(ev.end.slice(0, 10))} ${ev.end.slice(11, 16)}`;
}

export function LinkedInfoCard({ link, ev, x, y, onClose }: { link: CalendarLink; ev: LinkedEvent; x: number; y: number; onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const desktop = canRun();
  const where = link.provider === 'google' ? 'your Google calendar' : link.provider === 'icloud' ? 'your iCloud calendar' : link.provider === 'outlook' ? 'your Outlook calendar' : 'its own calendar';
  const copy = async () => {
    const len = Math.min(720, Math.max(5, Math.round((Date.parse(`${ev.end}:00`) - Date.parse(`${ev.start}:00`)) / 60_000) || 60));
    const res = await run(['event', 'add', ev.title, '--on', ev.start.slice(0, 10), '--at', ev.start.slice(11, 16), '--for', String(len)]);
    setMsg(res.ok ? 'Copied: the copy is a KRNL0 event you can move.' : res.message);
  };
  return (
    <CardFrame x={x} y={y} label={ev.title} testId="linked-info-card" onClose={onClose}>
      <div style={cardHead}>
        <Dot color={link.color} />
        <span style={{ ...cardTitle, overflowWrap: 'anywhere' }}>{ev.title}</span>
        <Close onClick={onClose} />
      </div>
      <CardGroup>
        <div style={cardRow}><span style={infoLabel}>When</span><span style={{ ...infoValue, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{linkedWhen(ev)}</span></div>
        {ev.place && <div style={cardRow}><span style={infoLabel}>Where</span><span style={infoValue} title={ev.place}>{ev.place}</span></div>}
        <div style={{ ...cardRow, minHeight: 52 }}>
          <span style={infoLabel}>From</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ ...infoValue, maxWidth: '100%', fontWeight: 600 }} title={link.name}>{link.name}</span>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{providerLabel(link.provider)} · {link.role === 'mirror' ? 'both ways' : 'read-only'}</span>
          </span>
        </div>
      </CardGroup>
      <p style={noteStyle}>{msg ?? `This event lives in ${where}, so it changes there. A copy in KRNL0 is yours to move.`}</p>
      {desktop && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!ev.allDay && <ActButton icon="copy" testId="linked-copy" onClick={() => { void copy(); }}>Copy to KRNL0</ActButton>}
          <ActButton icon="hide" testId="linked-hide" onClick={() => { void run(['cal', 'link', 'set', link.id, '--hide']); onClose(); }}>Hide this calendar</ActButton>
        </div>
      )}
    </CardFrame>
  );
}

// ── Decision 64 P2/P4: signing in (the easy way) ─────────────────────────

type ConnectOk = { ok: true; accountId: string; account: string; provider: LinkProvider; calendars: AccountCalendar[]; sending: boolean };
type ConnectRes = ConnectOk | { ok: false; reason: string; message: string };

async function connect(kind: 'apple' | 'caldav' | 'google', a?: string, b?: string, c?: string): Promise<ConnectRes> {
  const fn = window.krnl?.calConnect;
  if (!fn) return { ok: false, reason: 'unreachable', message: 'Signing in works in the KRNL0 desktop app.' };
  try { return (await fn(kind, a, b, c)) as ConnectRes; } catch (err) { return { ok: false, reason: 'unreachable', message: err instanceof Error ? err.message : String(err) }; }
}

function ErrorBox({ title, text, testId }: { title: string; text: string; testId?: string }) {
  return (
    <div data-testid={testId} role="alert" style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--paper-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: 'var(--font-read)', fontSize: 13.5, fontWeight: 600, color: 'var(--rust-deep, var(--rust))' }}>{title}</span>
      <span style={{ fontFamily: 'var(--font-read)', fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-2)' }}>{text}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-read)', fontSize: 12.5, color: 'var(--ink-2)' }}>{label}{children}</label>;
}

const textField: CSSProperties = { ...fieldStyle(), fontFamily: 'var(--font-read)', fontSize: 13.5 };

/** The first step of Add a calendar: where the calendar is. */
function AddChooser({ x, y, onClose, onBack, onPick }: { x: number; y: number; onClose: () => void; onBack: (() => void) | null; onPick: (k: 'apple' | 'google' | 'link' | 'caldav') => void }) {
  const rows: Array<{ k: 'apple' | 'google' | 'link' | 'caldav'; title: string; sub: string; icon: MenuIconName }> = [
    { k: 'apple', title: 'Apple (iCloud)', sub: 'Your iPhone and Mac calendars, both ways', icon: 'event' },
    { k: 'google', title: 'Google', sub: 'Sign in with Google, both ways', icon: 'event' },
    { k: 'link', title: 'Calendar link', sub: 'Any .ics or webcal address, read-only', icon: 'link' },
    { k: 'caldav', title: 'Other account', sub: 'Nextcloud, Fastmail and other CalDAV', icon: 'more' },
  ];
  return (
    <CardFrame x={x} y={y} label="Add a calendar" testId="othercal-add-card" onClose={onClose}>
      <div style={cardHead}>
        {onBack && <BackButton onClick={onBack} />}
        <span style={cardTitle}>Add a calendar</span>
        <Close onClick={onClose} />
      </div>
      <CardGroup>
        {rows.map((r) => (
          <button key={r.k} type="button" data-testid={`othercal-kind-${r.k}`} onClick={() => onPick(r.k)}
            style={{ ...cardRow, width: '100%', minHeight: 56, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-read)' }}>
            <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, background: 'var(--paper)', color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><MenuIcon name={r.icon} size={15} /></span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{r.title}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.sub}</span>
            </span>
            <span style={{ color: 'var(--ink-3)', display: 'inline-flex', transform: 'rotate(180deg)' }}><MenuIcon name="back" size={12} /></span>
          </button>
        ))}
      </CardGroup>
      <p style={noteStyle}>Signing in shows your calendars here and puts your KRNL0 events and planned tasks in a calendar called KRNL0 there, kept the same both ways.</p>
    </CardFrame>
  );
}

/** F6 — iCloud: the Apple ID and an app-specific password, with Apple's page one click away. */
function AppleSignIn({ x, y, onClose, onBack, email: email0, onConnected }: { x: number; y: number; onClose: () => void; onBack: () => void; email?: string; onConnected: (r: ConnectOk) => void }) {
  const [email, setEmail] = useState(email0 ?? '');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ title: string; text: string } | null>(null);
  const looksApp = /^[a-z]{4}-?[a-z]{4}-?[a-z]{4}-?[a-z]{4}$/i.test(pw.trim().replace(/\s+/g, ''));
  const ready = /\S+@\S+\.\S+/.test(email.trim()) && pw.trim().length > 0;
  const go = async (password = pw) => {
    if (!/\S+@\S+\.\S+/.test(email.trim()) || !password.trim()) return;
    setBusy(true); setErr(null);
    const res = await connect('apple', email.trim(), password);
    setBusy(false);
    if (res.ok) onConnected(res);
    else setErr({ title: res.reason === 'notAppPassword' ? 'That is your normal password' : res.reason === 'signIn' ? 'Apple said no' : 'iCloud did not answer', text: res.message });
  };
  return (
    <CardFrame x={x} y={y} label="Sign in to iCloud" testId="othercal-apple" onClose={onClose}>
      <div style={cardHead}>
        <BackButton onClick={onBack} />
        <span style={cardTitle}>Sign in to iCloud</span>
        <Close onClick={onClose} />
      </div>
      <Field label="Apple ID email">
        <input autoFocus={!email0} data-testid="othercal-apple-email" type="email" value={email} placeholder="you@icloud.com" spellCheck={false} onChange={(e) => setEmail(e.target.value)} style={textField} />
      </Field>
      <Field label="App password">
        <input autoFocus={!!email0} data-testid="othercal-apple-password" type="password" value={pw} placeholder="abcd-efgh-ijkl-mnop" spellCheck={false} autoComplete="off"
          onChange={(e) => { setPw(e.target.value); setErr(null); }}
          onPaste={(e) => { const t = e.clipboardData.getData('text').trim(); if (t) { e.preventDefault(); setPw(t); void go(t); } }}
          onKeyDown={(e) => { if (e.key === 'Enter') void go(); }}
          style={{ ...fieldStyle(!!err), letterSpacing: '0.04em' }} />
      </Field>
      <CardGroup>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--font-read)', fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-2)' }}>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Get an app password (once, 1 minute)</span>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Open Apple's account page and sign in.</li>
            <li><b style={{ fontWeight: 600, color: 'var(--ink)' }}>Sign-In and Security</b>, then <b style={{ fontWeight: 600, color: 'var(--ink)' }}>App-Specific Passwords</b>, then <b style={{ fontWeight: 600, color: 'var(--ink)' }}>+</b>. Name it KRNL0.</li>
            <li>Copy the password Apple shows and paste it above.</li>
          </ol>
          <ActButton icon="link" testId="othercal-apple-help" onClick={() => { void window.krnl?.calAccountHelp?.('apple'); }}>Open account.apple.com</ActButton>
        </div>
      </CardGroup>
      {err ? <ErrorBox testId="othercal-apple-error" title={err.title} text={err.text} />
        : pw.trim() && !looksApp ? <p style={{ ...noteStyle, color: 'var(--rust-deep, var(--rust))' }}>An app password looks like abcd-efgh-ijkl-mnop. Your normal Apple ID password does not work here.</p>
        : <p style={noteStyle}>Apple asks for an app password so KRNL0 never sees your real one. It stays on this computer, locked, and you can delete it at account.apple.com any time.</p>}
      <button type="button" data-testid="othercal-apple-submit" disabled={!ready || busy} onClick={() => { void go(); }} style={cardPrimary(ready && !busy)}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </CardFrame>
  );
}

/** Any CalDAV server (Nextcloud, Fastmail…). */
function CalDavSignIn({ x, y, onClose, onBack, onConnected }: { x: number; y: number; onClose: () => void; onBack: () => void; onConnected: (r: ConnectOk) => void }) {
  const [server, setServer] = useState('');
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = !!server.trim() && !!user.trim() && !!pw;
  const go = async () => {
    if (!ready) return;
    setBusy(true); setErr(null);
    const res = await connect('caldav', server, user, pw);
    setBusy(false);
    if (res.ok) onConnected(res); else setErr(res.message);
  };
  return (
    <CardFrame x={x} y={y} label="Other calendar account" testId="othercal-caldav" onClose={onClose}>
      <div style={cardHead}>
        <BackButton onClick={onBack} />
        <span style={cardTitle}>Other account</span>
        <Close onClick={onClose} />
      </div>
      <Field label="Server address"><input autoFocus value={server} placeholder="https://cloud.example.org/remote.php/dav" spellCheck={false} onChange={(e) => setServer(e.target.value)} style={fieldStyle()} /></Field>
      <Field label="User name"><input value={user} spellCheck={false} onChange={(e) => setUser(e.target.value)} style={textField} /></Field>
      <Field label="Password"><input type="password" value={pw} autoComplete="off" onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go(); }} style={fieldStyle(!!err)} /></Field>
      {err ? <ErrorBox title="Could not sign in" text={err} /> : <p style={noteStyle}>Many services want an app password here too (Fastmail, Nextcloud with two-step sign-in).</p>}
      <button type="button" disabled={!ready || busy} onClick={() => { void go(); }} style={cardPrimary(ready && !busy)}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </CardFrame>
  );
}

/** F8 — Sign in with Google: the browser opens, Google sends you back. */
function GoogleSignIn({ x, y, onClose, onBack, onConnected, onUseLink }: { x: number; y: number; onClose: () => void; onBack: () => void; onConnected: (r: ConnectOk) => void; onUseLink: () => void }) {
  const [state, setState] = useState<{ k: 'waiting' } | { k: 'error'; reason: string; text: string }>({ k: 'waiting' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ k: 'waiting' });
    void connect('google').then((res) => {
      if (!live) return;
      if (res.ok) onConnected(res); else setState({ k: 'error', reason: res.reason, text: res.message });
    });
    return () => { live = false; };
  }, [attempt]);
  return (
    <CardFrame x={x} y={y} label="Sign in with Google" testId="othercal-google" onClose={onClose}>
      <div style={cardHead}>
        <BackButton onClick={onBack} />
        <span style={cardTitle}>Sign in with Google</span>
        <Close onClick={onClose} />
      </div>
      {state.k === 'waiting' ? (
        <>
          <p style={{ ...noteStyle, color: 'var(--ink-2)', fontSize: 13.5 }}>Your browser opened Google's sign-in. Choose your account and allow KRNL0 to use your calendar, then come back here.</p>
          <p style={noteStyle}>Waiting for Google…</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} style={{ ...cardAct, justifyContent: 'center' }}>Open the sign-in again</button>
        </>
      ) : (
        <>
          <ErrorBox testId="othercal-google-error" title={state.reason === 'notSetUp' ? 'Not available yet' : 'Sign-in did not finish'} text={state.text} />
          {state.reason === 'notSetUp'
            ? <button type="button" onClick={onUseLink} style={cardPrimary(true)}>Use a calendar link instead</button>
            : <button type="button" onClick={() => setAttempt((n) => n + 1)} style={cardPrimary(true)}>Try again</button>}
        </>
      )}
    </CardFrame>
  );
}

/** After signing in: which calendars to show, and whether KRNL0 goes there too (two-way). */
function CalendarPicker({ x, y, onClose, res, onDone }: { x: number; y: number; onClose: () => void; res: ConnectOk; onDone: (msg: string) => void }) {
  const [sureOut, setSureOut] = useState(false);
  const anyAdded = res.calendars.some((c) => c.added);
  const [picked, setPicked] = useState<Set<string>>(new Set(res.calendars.filter((c) => (anyAdded ? c.added : true)).map((c) => c.id)));
  const [send, setSend] = useState(anyAdded ? res.sending : true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const where = providerLabel(res.provider);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = async () => {
    setBusy(true); setErr(null);
    const r = await window.krnl?.calAddAccount?.(res.accountId, [...picked], send);
    setBusy(false);
    if (r?.ok) onDone(r.message.charAt(0).toUpperCase() + r.message.slice(1) + '.');
    else setErr(r?.message ?? 'Could not add the calendars.');
  };
  return (
    <CardFrame x={x} y={y} label="Your calendars" testId="othercal-picker" onClose={onClose}>
      <div style={cardHead}>
        <BackButton onClick={() => onDone('')} />
        <span style={{ ...cardTitle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Your calendars</span>
        <Close onClick={onClose} />
      </div>
      <p style={{ ...noteStyle, marginTop: -6 }}>{where} · {res.account}</p>
      {res.calendars.length > 0 ? (
        <CardGroup>
          {res.calendars.map((c) => (
            <button key={c.id} type="button" role="checkbox" aria-checked={picked.has(c.id)} data-testid={`othercal-pick-${c.name}`} onClick={() => toggle(c.id)}
              style={{ ...cardRow, width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-read)' }}>
              <span aria-hidden style={{ width: 18, height: 18, flexShrink: 0, boxSizing: 'border-box', borderRadius: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: picked.has(c.id) ? 'none' : '1.5px solid var(--ink-4)', background: picked.has(c.id) ? 'var(--ink)' : 'transparent', color: 'var(--acid)' }}>
                {picked.has(c.id) && <MenuIcon name="check" size={12} />}
              </span>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: c.color ?? 'var(--ink-4)' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              {c.readOnly && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>shared with you</span>}
            </button>
          ))}
        </CardGroup>
      ) : <p style={noteStyle}>This account has no calendars yet.</p>}
      <CardGroup>
        <div style={{ ...cardRow, minHeight: 58 }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'var(--font-read)' }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Put KRNL0 on your {res.provider === 'icloud' ? 'iPhone' : where} too</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>Your events and planned tasks go to a calendar called KRNL0 there; changes on either side come back.</span>
          </span>
          <Switch checked={send} onChange={setSend} testId="othercal-send" size="md" title="Two-way" />
        </div>
      </CardGroup>
      {err && <ErrorBox title="Not added" text={err} />}
      <button type="button" data-testid="othercal-picker-done" disabled={busy || (picked.size === 0 && !send)} onClick={() => { void done(); }} style={cardPrimary(!busy && (picked.size > 0 || send))}>{busy ? 'Setting it up…' : 'Done'}</button>
      <button type="button" data-testid="othercal-picker-signout"
        onClick={() => { if (!sureOut) { setSureOut(true); return; } void run(['cal', 'signout', res.accountId]).then((r) => onDone(r.ok ? `Signed out of ${res.account}. Its calendars left KRNL0; nothing in the account was deleted.` : r.message)); }}
        style={{ ...cardAct, justifyContent: 'center', background: 'transparent', color: sureOut ? 'var(--rust-deep, var(--rust))' : 'var(--ink-3)' }}>{sureOut ? `Sign out of ${res.account}?` : 'Sign out of this account'}</button>
    </CardFrame>
  );
}
