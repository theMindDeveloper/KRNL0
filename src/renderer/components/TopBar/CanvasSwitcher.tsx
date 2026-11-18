// CanvasSwitcher — top-bar chip + popover for free-content canvases
// (Decision 33). List / switch, add, inline rename, delete with an in-popover
// confirm. Mother nodes and their data are shared, so deleting a canvas only
// removes its free nodes and drawings. CLI twin: `krnl canvas …`.

import { LineGlyph } from '../ui/LineGlyph';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBoardStore } from '../../store/boardStore';
import { Popover } from '../ui/Popover';
import { activeCanvasOf, DEFAULT_CANVAS_ID, DEFAULT_CANVAS_NAME, isSharedNode, type CanvasMeta } from '../../../shared/canvas';
import type { Board } from '../../../shared/types';

/** How long a row click waits for a second click before closing the list. */
const DBLCLICK_MS = 250;

const FALLBACK: CanvasMeta[] = [{ id: DEFAULT_CANVAS_ID, name: DEFAULT_CANVAS_NAME }];

const rowBtn: CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-3)',
  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 5px', borderRadius: 5, lineHeight: 1,
};

const input: CSSProperties = {
  flex: 1, minWidth: 0, background: 'var(--paper-2)', color: 'var(--ink)',
  border: '1px solid var(--paper-3)', borderRadius: 6, padding: '4px 7px',
  fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
};

/** canvases F9 — what is on each canvas, in words ("3 notes, 2 images", "empty"). */
export function canvasContents(board: Pick<Board, 'nodes'> & { drawings?: ReadonlyArray<{ canvasId?: string }> } | null | undefined, ids: readonly string[], activeId: string): Record<string, string> {
  const notes: Record<string, number> = {};
  const images: Record<string, number> = {};
  const other: Record<string, number> = {};
  const strokes: Record<string, number> = {};
  for (const n of board?.nodes ?? []) {
    if (isSharedNode(n)) continue;
    const c = (n as { canvasId?: string }).canvasId ?? activeId;
    const bucket = n.kind === 'text' ? notes : n.kind === 'image' || n.kind === 'media' ? images : other;
    bucket[c] = (bucket[c] ?? 0) + 1;
  }
  for (const d of board?.drawings ?? []) { const c = d.canvasId ?? activeId; strokes[c] = (strokes[c] ?? 0) + 1; }
  const word = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const out: Record<string, string> = {};
  for (const id of ids) {
    const parts = [
      notes[id] ? word(notes[id]!, 'note', 'notes') : '',
      images[id] ? word(images[id]!, 'image', 'images') : '',
      other[id] ? word(other[id]!, 'item', 'items') : '',
      strokes[id] ? 'drawing' : '',
    ].filter(Boolean);
    out[id] = parts.length ? parts.slice(0, 2).join(', ') : 'empty';
  }
  return out;
}

export function CanvasSwitcher() {
  const canvases = useBoardStore(useShallow((s) => s.board?.canvases ?? FALLBACK));
  const activeId = useBoardStore((s) => (s.board ? activeCanvasOf(s.board) : DEFAULT_CANVAS_ID));
  const contents = useBoardStore(useShallow((s) => canvasContents(s.board, canvases.map((c) => c.id), activeId)));
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const active = canvases.find((c) => c.id === activeId) ?? canvases[0];
  const close = () => { setOpen(false); setRenaming(null); setConfirmDel(null); setAdding(false); };
  const store = () => useBoardStore.getState();

  const commitRename = () => {
    if (renaming && draft.trim()) store().renameCanvas(renaming, draft);
    setRenaming(null);
  };
  const commitAdd = () => {
    if (draft.trim()) { store().addCanvas(draft); close(); }
    else setAdding(false);
  };
  const keys = (commit: () => void, cancel: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        data-testid="topbar-canvas-switcher"
        className="krnl-topbar-btn"
        title="Canvases: notes, images and drawings are per canvas; plans, calendar, habits and timer are on every canvas"
        onClick={() => (open ? close() : setOpen(true))}
        style={{
          background: 'transparent', border: '1px solid var(--paper-3)', borderRadius: 'var(--radius)',
          padding: '3px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--ink-2, var(--ink))', letterSpacing: '0.03em', whiteSpace: 'nowrap',
          maxWidth: 180, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{active?.name ?? DEFAULT_CANVAS_NAME}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: 'var(--ink-3)', flexShrink: 0 }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <Popover anchor={anchor.current} open={open} onClose={close} minWidth={260}>
        <div data-testid="canvas-switcher-list" style={{ display: 'flex', flexDirection: 'column', gap: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {canvases.map((c) => {
            const isActive = c.id === activeId;
            if (renaming === c.id) {
              return (
                <div key={c.id} style={{ display: 'flex', gap: 4, padding: 3 }}>
                  <input
                    autoFocus value={draft} style={input} aria-label="Canvas name" data-own-escape
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={keys(commitRename, () => setRenaming(null))}
                    onBlur={commitRename}
                  />
                </div>
              );
            }
            if (confirmDel === c.id) {
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px' }}>
                  <span style={{ flex: 1, color: 'var(--ink-3)', fontSize: 11 }}>Delete “{c.name}” and its content?</span>
                  <button
                    type="button" data-testid={`canvas-delete-confirm-${c.id}`}
                    style={{ ...rowBtn, color: 'var(--rust)', fontWeight: 700 }}
                    onClick={() => { store().deleteCanvas(c.id); setConfirmDel(null); }}
                  >Delete</button>
                  <button type="button" style={rowBtn} onClick={() => setConfirmDel(null)}>Cancel</button>
                </div>
              );
            }
            return (
              <div
                key={c.id}
                data-testid={`canvas-row-${c.id}`}
                className="krnl-canvas-row"
                // Switch at once; close a beat later so a double-click can
                // still arrive and rename instead (canvases F5).
                onClick={() => {
                  store().switchCanvas(c.id);
                  if (closeTimer.current) clearTimeout(closeTimer.current);
                  closeTimer.current = setTimeout(close, DBLCLICK_MS);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
                  setDraft(c.name);
                  setRenaming(c.id);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderRadius: 6, cursor: 'pointer',
                  background: isActive ? 'color-mix(in srgb, var(--acid) 12%, transparent)' : 'transparent',
                  color: 'var(--ink)', fontWeight: isActive ? 700 : 400,
                }}
              >
                <span style={{ width: 12, color: 'var(--acid-ink, var(--acid))' }}>{isActive ? <LineGlyph name="check" size={11} /> : null}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span data-testid={`canvas-contents-${c.id}`} style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 10.5, whiteSpace: 'nowrap' }}>{contents[c.id]}</span>
                <button
                  type="button" title="Rename" aria-label={`Rename ${c.name}`} style={rowBtn}
                  onClick={(e) => { e.stopPropagation(); setDraft(c.name); setRenaming(c.id); }}
                >✎</button>
                {canvases.length > 1 && (
                  <button
                    type="button" title="Delete" aria-label={`Delete ${c.name}`} data-testid={`canvas-delete-${c.id}`} style={rowBtn}
                    onClick={(e) => { e.stopPropagation(); setConfirmDel(c.id); }}
                  ><LineGlyph name="close" size={10} /></button>
                )}
              </div>
            );
          })}
          {/* canvases F9 — said, not discovered: what every canvas shares. */}
          <div data-testid="canvas-shared-note" style={{ margin: '6px 2px 2px', padding: '8px 9px', borderRadius: 6, background: 'var(--paper-2)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10.5, lineHeight: 1.45 }}>
            <span><span style={{ color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>On every canvas</span><br /><span style={{ color: 'var(--ink)' }}>plans, calendar, habits, timer</span></span>
            <span><span style={{ color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Only on this one</span><br /><span style={{ color: 'var(--ink)' }}>notes, images, drawings</span></span>
          </div>
          <div style={{ borderTop: '1px solid var(--paper-3)', margin: '3px 2px' }} />
          {adding ? (
            <div style={{ display: 'flex', gap: 4, padding: 3 }}>
              <input
                autoFocus value={draft} placeholder="Canvas name" style={input} aria-label="New canvas name" data-own-escape
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={keys(commitAdd, () => setAdding(false))}
              />
              <button type="button" style={{ ...rowBtn, color: 'var(--ink)' }} onClick={commitAdd}>Add</button>
            </div>
          ) : (
            <button
              type="button" data-testid="canvas-add"
              onClick={() => { setDraft(''); setAdding(true); }}
              style={{ ...rowBtn, textAlign: 'left', padding: '6px 6px', fontSize: 11 }}
            >+ New canvas</button>
          )}
        </div>
      </Popover>
    </>
  );
}
