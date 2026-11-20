// The board menu in the top bar (Decision 49, docs/06-requirements/boards.md).
//
// A board is complete on its own: todos, habits, calendar, timer history,
// analytics, notes and drawings. The menu lists the boards with one fact each,
// makes a new one (empty, or with your habits), renames and deletes. Opening a
// board reloads the window onto it. Nothing is half-shared, so the menu needs
// no explanation.
//
// One timer at a time: if a timer is still running in another board, a chip
// beside the menu says where and for how long; pressing it opens that board.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LineGlyph } from '../ui/LineGlyph';
import { MenuIcon } from '../ui/menuIcons';
import { Z } from '../ui/layers';
import { CardClose, CardGroup, cardBox, cardHead, cardPrimary, cardTitle } from '../ui/addCard';
import { setOtherBoardRecording, BOARD_TIMER_BLOCKED_EVENT } from '../../store/boardsInfo';

const READ = 'var(--font-read)';
const DOTS = ['var(--acid)', 'var(--cyan)', 'var(--rust)', '#9c8ec4', '#d9a55a', '#5fa3a8'];

function fmtElapsed(fromISO: string, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - Date.parse(fromISO)) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const fact = (b: KrnlBoardRow): string => {
  if (b.plans === 0 && b.habits === 0) return 'nothing yet';
  const parts: string[] = [];
  if (b.plans > 0) parts.push(`${b.plans} plan${b.plans === 1 ? '' : 's'}`);
  if (b.habits > 0) parts.push(`${b.habits} habit${b.habits === 1 ? '' : 's'}`);
  return parts.join(' · ');
};

/** `quiet`: Easy mode — the menu shows only once there is more than one board. */
export function BoardSwitcher({ quiet = false }: { quiet?: boolean }) {
  const [list, setList] = useState<KrnlBoardsList | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [copyHabits, setCopyHabits] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [blocked, setBlocked] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  const refresh = useCallback(async () => {
    const l = await window.krnl?.boardsList?.();
    if (l) { setList(l); setOtherBoardRecording(l.recording ? { ...l.recording, name: l.boards.find((b) => b.id === l.recording!.boardId)?.name ?? '' } : null); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  // Close on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => { if (!open) { setAdding(false); setRenaming(null); setConfirmDel(null); setError(null); setName(''); setCopyHabits(false); } }, [open]);

  // The chip's clock, and the "stop it there first" nudge from the Timer.
  const recording = list?.recording ?? null;
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [recording]);
  useEffect(() => {
    const on = () => { setBlocked(true); window.setTimeout(() => setBlocked(false), 2600); };
    window.addEventListener(BOARD_TIMER_BLOCKED_EVENT, on);
    return () => window.removeEventListener(BOARD_TIMER_BLOCKED_EVENT, on);
  }, []);

  if (!list) return null;
  const active = list.boards.find((b) => b.active) ?? list.boards[0];
  if (!active) return null;
  const dotOf = (id: string) => DOTS[Math.max(0, list.boards.findIndex((b) => b.id === id)) % DOTS.length]!;
  const recName = recording ? list.boards.find((b) => b.id === recording.boardId)?.name ?? '' : '';

  const go = async (id: string) => {
    if (busy || id === list.activeId) { setOpen(false); return; }
    setBusy(true);
    const res = await window.krnl?.boardsSwitch?.(id);
    // The window reloads onto the board; only a failure comes back here.
    if (res && !res.ok) { setError(res.message); setBusy(false); }
  };
  const create = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    const res = await window.krnl?.boardsCreate?.(name.trim(), copyHabits);
    if (!res?.ok || !res.board) { setError(res?.message ?? 'The board could not be created'); setBusy(false); return; }
    setBusy(false);
    await go(res.board.id);
  };
  const rename = async (id: string) => {
    const res = await window.krnl?.boardsRename?.(id, renameText);
    if (res && !res.ok) { setError(res.message); return; }
    setRenaming(null); setError(null); void refresh();
  };
  const remove = async (id: string) => {
    const res = await window.krnl?.boardsDelete?.(id);
    if (res && !res.ok) { setError(res.message); return; }
    setConfirmDel(null); setError(null); void refresh();
  };

  const showMenu = !quiet || list.boards.length > 1;
  const rowBtn: React.CSSProperties = { width: 28, height: 28, flexShrink: 0, border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <span ref={wrap} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: READ }}>
      {showMenu && (
        <button
          type="button"
          data-testid="topbar-canvas-switcher"
          data-board-switcher=""
          aria-haspopup="menu"
          aria-expanded={open}
          title="Your boards: each has its own todos, habits, calendar, timer history, analytics and notes"
          onClick={() => setOpen((o) => !o)}
          style={{ height: 28, padding: '0 8px 0 10px', border: 'none', borderRadius: 8, background: 'var(--paper-2)', color: 'var(--ink)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: READ, fontSize: 13, fontWeight: 600, maxWidth: 200 }}
        >
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: dotOf(active.id), flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.name}</span>
          <span aria-hidden style={{ color: 'var(--ink-3)', display: 'inline-flex' }}><LineGlyph name="caretDown" size={11} /></span>
        </button>
      )}

      {recording && (
        <button
          type="button"
          data-testid="board-recording-chip"
          title={`The Timer is running in "${recName}". Press to open that board.`}
          onClick={() => void go(recording.boardId)}
          style={{ height: 28, padding: '0 10px', border: 'none', borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: READ, fontSize: 12.5, whiteSpace: 'nowrap', color: 'var(--ink)', background: blocked ? 'color-mix(in srgb, var(--rust) 26%, var(--paper-2))' : 'color-mix(in srgb, var(--acid) 14%, var(--paper-2))' }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: blocked ? 'var(--rust)' : 'var(--acid)', flexShrink: 0 }} />
          {blocked ? <>Stop the timer in <b style={{ fontWeight: 600 }}>{recName}</b> first</> : <>Recording in <b style={{ fontWeight: 600 }}>{recName}</b></>}
          {!blocked && <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmtElapsed(recording.startedAt, nowMs)}</span>}
        </button>
      )}

      {open && showMenu && (
        <div
          role="menu"
          data-testid="board-menu"
          className="kw-card"
          style={{ ...cardBox, width: 320, padding: 8, gap: 2, position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: Z.popover }}
        >
          {list.boards.map((b) => (
            renaming === b.id ? (
              <div key={b.id} style={{ display: 'flex', gap: 6, padding: 4 }}>
                <input
                  autoFocus
                  data-testid="board-rename-input"
                  aria-label="Board name"
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void rename(b.id); if (e.key === 'Escape') setRenaming(null); }}
                  style={{ flex: 1, minWidth: 0, height: 36, padding: '0 12px', border: 'none', borderRadius: 10, background: 'var(--paper-2)', color: 'var(--ink)', fontFamily: READ, fontSize: 13.5, fontWeight: 600, outline: 'none' }}
                />
                <button type="button" data-testid="board-rename-save" onClick={() => void rename(b.id)} style={{ ...cardPrimary(true), height: 36, padding: '0 12px' }}>Save</button>
              </div>
            ) : confirmDel === b.id ? (
              <div key={b.id} data-testid="board-delete-confirm" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 10px', minHeight: 44 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>Delete <b style={{ fontWeight: 600 }}>{b.name}</b> and everything in it?</span>
                <button type="button" data-testid="board-delete-yes" onClick={() => void remove(b.id)} style={{ height: 32, padding: '0 10px', border: 'none', borderRadius: 8, background: 'color-mix(in srgb, var(--rust) 22%, var(--paper-2))', color: 'var(--ink)', cursor: 'pointer', fontFamily: READ, fontSize: 13 }}>Delete</button>
                <button type="button" onClick={() => setConfirmDel(null)} style={{ height: 32, padding: '0 10px', border: 'none', borderRadius: 8, background: 'var(--paper-2)', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: READ, fontSize: 13 }}>Keep</button>
              </div>
            ) : (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 2, borderRadius: 10, background: b.active ? 'var(--paper-2)' : 'transparent' }}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={b.active}
                  data-testid={`board-item-${b.id}`}
                  onClick={() => void go(b.id)}
                  style={{ flex: 1, minWidth: 0, height: 44, padding: '0 6px 0 10px', border: 'none', borderRadius: 10, background: 'transparent', color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: READ, fontSize: 13.5, textAlign: 'left' }}
                >
                  <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: dotOf(b.id), flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{fact(b)}</span>
                  <span style={{ flex: 1 }} />
                  {b.active && <span aria-hidden style={{ color: 'var(--acid-ink, var(--acid))', display: 'inline-flex' }}><LineGlyph name="check" size={13} weight={2.4} /></span>}
                </button>
                <button type="button" title="Rename" aria-label={`Rename ${b.name}`} data-testid={`board-rename-${b.id}`} style={rowBtn}
                  onClick={() => { setRenaming(b.id); setRenameText(b.name); setConfirmDel(null); }}><MenuIcon name="rename" size={13} /></button>
                {!b.active && list.boards.length > 1 && (
                  <button type="button" title="Delete" aria-label={`Delete ${b.name}`} data-testid={`board-delete-${b.id}`} style={rowBtn}
                    onClick={() => { setConfirmDel(b.id); setRenaming(null); }}><LineGlyph name="close" size={11} /></button>
                )}
              </div>
            )
          ))}

          <div style={{ height: 1, background: 'var(--paper-3)', margin: '6px 4px' }} />

          {adding ? (
            <div data-testid="board-new-form" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 6 }}>
              <input
                autoFocus
                data-testid="board-new-name"
                aria-label="Name of the new board"
                placeholder="Name it"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void create(); if (e.key === 'Escape') setAdding(false); }}
                style={{ height: 40, padding: '0 14px', border: 'none', borderRadius: 12, background: 'var(--paper-2)', color: 'var(--ink)', fontFamily: READ, fontSize: 14, fontWeight: 600, outline: 'none' }}
              />
              <CardGroup>
                {([[false, 'Start empty', 'Its own todos, habits, calendar, timer and analytics. Nothing is shared with your other boards.'],
                  [true, 'Copy my habits', 'The same habits, starting from zero. Plans and history are not copied.']] as const).map(([val, label, hint]) => (
                  <button key={label} type="button" role="radio" aria-checked={copyHabits === val} data-testid={val ? 'board-new-copy' : 'board-new-empty'} onClick={() => setCopyHabits(val)}
                    style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px', border: 'none', background: 'transparent', color: 'var(--ink)', cursor: 'pointer', textAlign: 'left', fontFamily: READ }}>
                    <span aria-hidden style={{ width: 16, height: 16, boxSizing: 'border-box', borderRadius: 999, flexShrink: 0, marginTop: 2, border: `2px solid ${copyHabits === val ? 'var(--acid)' : 'var(--ink-4)'}`, background: copyHabits === val ? 'radial-gradient(var(--acid) 0 4px, transparent 5px)' : 'transparent' }} />
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'normal' }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{label}</span>
                      <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink-3)', marginTop: 2 }}>{hint}</span>
                    </span>
                  </button>
                ))}
              </CardGroup>
              <button type="button" data-testid="board-new-create" disabled={!name.trim() || busy} onClick={() => void create()} style={{ ...cardPrimary(!!name.trim() && !busy), width: '100%' }}>
                {name.trim() ? 'Create board' : 'Name it to create'}
              </button>
            </div>
          ) : (
            <button type="button" data-testid="board-new" onClick={() => { setAdding(true); setRenaming(null); setConfirmDel(null); }}
              style={{ height: 44, padding: '0 10px', border: 'none', borderRadius: 10, background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: READ, fontSize: 13.5, textAlign: 'left' }}>
              <span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--paper-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1 }}>+</span>
              New board
            </button>
          )}
          {error && <div role="alert" data-testid="board-error" style={{ margin: '4px 6px', padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--rust) 12%, transparent)', fontSize: 12.5, color: 'var(--ink)' }}>{error}</div>}
        </div>
      )}

      {list.notice && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: Z.popoverBackdrop, background: 'rgba(5,4,3,0.6)' }} />
          <div role="dialog" aria-label="Your canvases are now boards" data-testid="boards-notice" className="kw-card"
            style={{ ...cardBox, width: 420, position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: Z.popover }}>
            <div style={cardHead}>
              <span style={cardTitle}>Your canvases are now boards</span>
              <CardClose onClick={() => { void window.krnl?.boardsAckNotice?.().then(refresh); }} />
            </div>
            <span style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>Until now every canvas shared the same plans, habits and timer. From this version each one is its own board.</span>
            <CardGroup>
              <div style={{ padding: '11px 14px' }}>
                <b style={{ display: 'block', fontWeight: 600 }}>{list.notice.kept}</b>
                <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink-3)', marginTop: 2 }}>Keeps everything: all your plans, habits, calendar, recorded time and its notes.</span>
              </div>
              {list.notice.others.map((n) => (
                <div key={n} style={{ padding: '11px 14px' }}>
                  <b style={{ display: 'block', fontWeight: 600 }}>{n}</b>
                  <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink-3)', marginTop: 2 }}>Keeps its notes, images and drawings. Its todos and habits start empty.</span>
                </div>
              ))}
            </CardGroup>
            <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>A copy of your board as it was is saved beside it (board.json.before-boards-…).</span>
            <button type="button" data-testid="boards-notice-ok" onClick={() => { void window.krnl?.boardsAckNotice?.().then(refresh); }} style={{ ...cardPrimary(true), width: '100%' }}>OK</button>
          </div>
        </>,
        document.body,
      )}
    </span>
  );
}
