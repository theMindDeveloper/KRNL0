/**
 * LayoutMenu — the top bar's layout menu (Decision 54, station-layouts.md F1).
 *
 * One button that names the layout in use; it opens a list of every layout,
 * each with a line drawing of its arrangement: Classic, Grid and Planner (the
 * Station's presets) and Free (the canvas). It replaces the Station / Free
 * switch. ⌘/Ctrl+Shift+L still flips between the Station (its last preset)
 * and Free. `krnl settings layout <name>` picks the same layouts.
 */

import { useEffect, useRef, useState } from 'react';
import { useBoardStore } from '../../store/boardStore';
import { isModalOpen } from '../../utils/keyboardTargets';
import { LineGlyph } from './LineGlyph';
import { Z } from './layers';
import { cardBox } from './addCard';
import { CLASSIC_HIDDEN, CLASSIC_SLOTS, LAYOUT_OPTIONS, freshLayout, layoutChoiceOf, presetOf, resetClassicGeometry, type LayoutChoice, type LayoutOption } from '../../../shared/stationLayouts';
import type { MotherNodeConfig } from '../../../shared/types';

const READ = 'var(--font-read)';

/** A line drawing of a layout (rectangles in a 20 × 14 box). */
export function LayoutGlyph({ rects, size = 20 }: { rects: LayoutOption['glyph']; size?: number }) {
  return (
    <svg width={size} height={(size * 14) / 20} viewBox="0 0 20 14" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {rects.map(([x, y, w, h], i) => (
        <rect key={i} x={x + 0.3} y={y + 0.3} width={Math.max(0.5, w - 0.6)} height={Math.max(0.5, h - 0.6)} rx={1.1} fill="none" stroke="currentColor" strokeWidth={1.15} />
      ))}
    </svg>
  );
}

/** Picks a layout: Free is the canvas; the others are the Station with that preset. */
export function applyLayoutChoice(choice: LayoutChoice): void {
  const { board, setLayoutMode, setLayoutGeometry } = useBoardStore.getState();
  if (!board) return;
  if (choice === 'free') {
    if (board.layoutMode !== 'canvas') setLayoutMode('canvas');
    return;
  }
  const geo = board.layoutGeometry?.station;
  // Decision 59 — a ready-made layout comes back exactly as designed every
  // time it is picked (picking the one in use resets it too); My layout
  // keeps what you left.
  if (choice !== 'classic' || presetOf(geo) !== choice || geo?.preset === undefined) {
    setLayoutGeometry({ ...board.layoutGeometry, station: freshLayout(geo, choice) });
  }
  if (board.layoutMode !== 'station') useBoardStore.getState().setLayoutMode('station');
}

/** Decisions 59–60 — Reset: Timer, Clock and Todos over a full-width Calendar; the other windows hidden, first sizes. */
export function resetMyLayout(): void {
  const { board, setLayoutGeometry, updateNode } = useBoardStore.getState();
  if (!board) return;
  for (const n of board.nodes) {
    const slot = n.isMother ? CLASSIC_SLOTS[n.kind] : undefined;
    if (!slot) continue;
    const cfg = (n.config ?? {}) as MotherNodeConfig & Record<string, unknown>;
    updateNode(n.id, { config: { ...cfg, stationSlot: slot, stationHidden: CLASSIC_HIDDEN.has(n.kind) } });
  }
  setLayoutGeometry({ ...useBoardStore.getState().board?.layoutGeometry, station: resetClassicGeometry(useBoardStore.getState().board?.layoutGeometry?.station) });
  if (useBoardStore.getState().board?.layoutMode !== 'station') useBoardStore.getState().setLayoutMode('station');
}

export function LayoutMenu() {
  const layoutMode = useBoardStore((s) => s.board?.layoutMode ?? 'canvas');
  const geo = useBoardStore((s) => s.board?.layoutGeometry?.station);
  const setLayoutMode = useBoardStore((s) => s.setLayoutMode);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const choice = layoutChoiceOf(layoutMode, geo);
  const current = LAYOUT_OPTIONS.find((o) => o.id === choice) ?? LAYOUT_OPTIONS[0]!;

  // ⌘/Ctrl+Shift+L — Station (its last preset) ↔ Free (ADR 0008 F3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !e.shiftKey) return;
      if (e.key !== 'L' && e.key !== 'l') return;
      // A chord no field or shell uses, so it also works from the terminal
      // (which holds focus at start); only a modal dialog blocks it.
      if (isModalOpen()) return;
      e.preventDefault();
      setLayoutMode(layoutMode === 'station' ? 'canvas' : 'station');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layoutMode, setLayoutMode]);

  // Close on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.('[data-testid="tour-card"]')) return;
      if (wrap.current && !wrap.current.contains(t as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const pick = (id: LayoutChoice) => {
    setOpen(false);
    applyLayoutChoice(id);
  };

  return (
    <span ref={wrap} style={{ position: 'relative', display: 'inline-flex', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        type="button"
        data-testid="layout-menu"
        data-layout={choice}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Layout: ${current.label}`}
        title="Layout: how your windows are arranged (⌘⇧L switches Station and Free)"
        onClick={() => setOpen((o) => !o)}
        className="krnl-layout-btn"
        style={{
          height: 28, padding: '0 8px 0 10px', border: 'none', borderRadius: 8, background: 'var(--paper-2)', color: 'var(--ink)',
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: READ, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: 'var(--ink-2)', display: 'inline-flex' }}><LayoutGlyph rects={current.glyph} size={18} /></span>
        <span className="krnl-layout-label">{current.label}</span>
        <span aria-hidden style={{ color: 'var(--ink-3)', display: 'inline-flex' }}><LineGlyph name="caretDown" size={11} /></span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Layouts"
          data-testid="layout-menu-list"
          className="kw-card"
          style={{ ...cardBox, width: 320, padding: 8, gap: 2, position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: Z.popover }}
        >
          {LAYOUT_OPTIONS.map((o, i) => {
            const on = o.id === choice;
            const firstOfGroup = i === 0 || LAYOUT_OPTIONS[i - 1]!.group !== o.group;
            return (
              <div key={o.id} style={{ position: 'relative', ...(firstOfGroup && i > 0 ? { borderTop: '1px solid var(--paper-3)', marginTop: 4, paddingTop: 4 } : {}) }}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  data-testid={`layout-option-${o.id}`}
                  onClick={() => pick(o.id)}
                  className="krnl-layout-option"
                  style={{
                    width: '100%', minHeight: 52, padding: '8px 10px', border: 'none', borderRadius: 10,
                    background: on ? 'var(--paper-2)' : 'transparent', color: 'var(--ink)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12, fontFamily: READ, textAlign: 'left',
                    // The top bar keeps its words on one line; a menu row wraps.
                    whiteSpace: 'normal', letterSpacing: 0, textTransform: 'none',
                  }}
                >
                  <span style={{ width: 36, height: 28, borderRadius: 7, background: on ? 'var(--paper-3)' : 'var(--paper-2)', color: on ? 'var(--ink)' : 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <LayoutGlyph rects={o.glyph} size={24} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{o.label}</span>
                    <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.35, color: 'var(--ink-3)', marginTop: 1 }}>{o.hint}</span>
                  </span>
                  {on && <span aria-hidden style={{ color: 'var(--acid-ink, var(--acid))', display: 'inline-flex', flexShrink: 0 }}><LineGlyph name="check" size={13} weight={2.4} /></span>}
                  {o.group === 'yours' && <span aria-hidden style={{ width: 54, flexShrink: 0 }} />}
                </button>
                {o.group === 'yours' && (
                  <button
                    type="button"
                    data-testid="layout-reset-mine"
                    title="Timer, Clock and Todos on top, the Calendar below"
                    onClick={(e) => { e.stopPropagation(); setOpen(false); resetMyLayout(); }}
                    style={{
                      position: 'absolute', right: 8, bottom: 14, height: 26, padding: '0 10px', border: 'none', borderRadius: 8,
                      background: 'var(--paper-3)', color: 'var(--ink-2)', fontFamily: READ, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      letterSpacing: 0, textTransform: 'none',
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
