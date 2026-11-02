// CanvasSwitcher — top-bar chip + popover for free-content canvases
// (Decision 33). List / switch, add, inline rename, delete with an in-popover
// confirm. Mother nodes and their data are shared, so deleting a canvas only
// removes its free nodes and drawings. CLI twin: `krnl canvas …`.

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useBoardStore } from '../../store/boardStore';
import { Popover } from '../ui/Popover';
import { activeCanvasOf, DEFAULT_CANVAS_ID, DEFAULT_CANVAS_NAME, type CanvasMeta } from '../../../shared/canvas';

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

export function CanvasSwitcher() {
  const canvases = useBoardStore(useShallow((s) => s.board?.canvases ?? FALLBACK));
  const activeId = useBoardStore((s) => (s.board ? activeCanvasOf(s.board) : DEFAULT_CANVAS_ID));
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
        title="Canvases — free content per canvas; mothers and their data are shared"
        onClick={() => (open ? close() : setOpen(true))}
        style={{
          background: 'transparent', border: '1px solid var(--paper-3)', borderRadius: 'var(--radius)',
          padding: '3px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10.5,
          color: 'var(--ink-2, var(--ink))', letterSpacing: '0.03em', whiteSpace: 'nowrap',
          maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {active?.name ?? DEFAULT_CANVAS_NAME} <span style={{ color: 'var(--ink-4)' }}>▾</span>
      </button>
      <Popover anchor={anchor.current} open={open} onClose={close} minWidth={220}>
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
                  <span style={{ flex: 1, color: 'var(--ink-3)', fontSize: 10.5 }}>Delete “{c.name}” and its content?</span>
                  <button
                    type="button" data-testid={`canvas-delete-confirm-${c.id}`}
                    style={{ ...rowBtn, color: '#ff8e64', fontWeight: 700 }}
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
                <span style={{ width: 12, color: 'var(--acid-ink, var(--acid))' }}>{isActive ? '✓' : ''}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <button
                  type="button" title="Rename" aria-label={`Rename ${c.name}`} style={rowBtn}
                  onClick={(e) => { e.stopPropagation(); setDraft(c.name); setRenaming(c.id); }}
                >✎</button>
                {canvases.length > 1 && (
                  <button
                    type="button" title="Delete" aria-label={`Delete ${c.name}`} data-testid={`canvas-delete-${c.id}`} style={rowBtn}
                    onClick={(e) => { e.stopPropagation(); setConfirmDel(c.id); }}
                  >✕</button>
                )}
              </div>
            );
          })}
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
