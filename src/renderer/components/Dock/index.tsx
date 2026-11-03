/**
 * Dock — vertical icon-button strip.
 * Decision #13 §F, Requirements F3/F4/F8.
 *
 * New design (from frontendref LifeOS Whiteboard.html):
 *   - Select tool (V) — sets tool mode, no node creation
 *   - [divider]
 *   - Text note (N) — spawns a `text` node at canvas center
 *   - Image / ASCII (I) — spawns an `image` node at canvas center
 *   - [divider]
 *   - Connect (no shortcut) — sets connect tool mode
 */

import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { NodeKind } from '../../../shared/types/node';
import { DOCK_STYLES, type DockStyle } from '../ChassisLayer/useDockStyle';
import { DOCK_REGISTRY } from '../ChassisLayer/dockRegistry';
import { useBoardStore } from '../../store/boardStore';
import { useDrawStore } from '../../store/drawStore';
import { STICKY_COLORS, type TextLook } from '../nodes/TextNode/types';
import { shortcutBlocked } from '../../utils/keyboardTargets';

type ToolMode = 'select' | 'connect';

// The dock can be dragged by its grip and snaps to one of these places; the
// choice is remembered per machine.
export type DockAnchor = 'top' | 'middle' | 'bottom' | 'bottom-center';
const ANCHOR_KEY = 'krnl0-dock-anchor';

function readAnchor(): DockAnchor {
  try {
    const v = localStorage.getItem(ANCHOR_KEY);
    if (v === 'top' || v === 'middle' || v === 'bottom' || v === 'bottom-center') return v;
  } catch { /* storage unavailable */ }
  return 'top';
}

/** Nearest snap place for a drop point inside the canvas box. Exported for tests. */
export function anchorFor(x: number, y: number, w: number, h: number): DockAnchor {
  if (y > h * 0.72 && x > w * 0.22 && x < w * 0.78) return 'bottom-center';
  if (y < h / 3) return 'top';
  if (y < (h * 2) / 3) return 'middle';
  return 'bottom';
}

/** Faint keyboard-shortcut letter in a dock button's corner. */
function KeyHint({ k }: { k: string }) {
  return (
    <span aria-hidden style={{
      position: 'absolute', right: 3, bottom: 1, fontFamily: 'var(--font-mono)', fontSize: 8, lineHeight: 1,
      opacity: 0.38, pointerEvents: 'none', color: 'currentColor',
    }}>{k}</span>
  );
}

const SHAPE_CHOICES: Array<{ kind: 'rect' | 'ellipse' | 'diamond'; label: string; color: string; icon: React.ReactNode }> = [
  { kind: 'rect', label: 'Rectangle', color: '#a8e6ff', icon: <rect x="4" y="6" width="16" height="12" rx="2" /> },
  { kind: 'ellipse', label: 'Ellipse', color: '#b9f5a8', icon: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" /> },
  { kind: 'diamond', label: 'Diamond', color: '#d9c2ff', icon: <path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" /> },
];

const ANCHOR_STYLE: Record<DockAnchor, React.CSSProperties> = {
  top: { left: 14, top: 60 },
  middle: { left: 14, top: '50%', transform: 'translateY(-50%)' },
  bottom: { left: 14, bottom: 48 },
  'bottom-center': { left: '50%', bottom: 16, transform: 'translateX(-50%)', flexDirection: 'row' },
};

export interface DockProps {
  /** Called when the user clicks a node-creation button or triggers a keyboard shortcut. */
  onAddNode: (args: { kind: NodeKind; at?: { x: number; y: number }; look?: TextLook }) => void;
  /** Called when the user clicks a tool-mode button. */
  onToolChange?: (tool: ToolMode) => void;
  /** Current mother-row chassis variant. */
  dockStyle?: DockStyle;
  /** Setter for the chassis variant. */
  onDockStyleChange?: (s: DockStyle) => void;
}

export function Dock({ onAddNode, onToolChange, dockStyle, onDockStyleChange }: DockProps) {
  const [activeTool, setActiveTool] = useState<ToolMode>('select');
  const penActive = useDrawStore((s) => s.active);
  const togglePen = useDrawStore((s) => s.toggle);
  const [pressed, setPressedKind] = useState<NodeKind | null>(null);
  const [anchor, setAnchor] = useState<DockAnchor>(readAnchor);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  useEffect(() => {
    if (!shapeMenuOpen) return;
    const close = () => setShapeMenuOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [shapeMenuOpen]);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const horizontal = anchor === 'bottom-center';

  const onGripDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0 });
  };
  const onGripMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    setDrag({ dx: e.clientX - dragStart.current.x, dy: e.clientY - dragStart.current.y });
  };
  const onGripUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    dragStart.current = null;
    // Remember where the dock was dropped so it can glide to its snap spot.
    const from = rootRef.current?.getBoundingClientRect();
    if (from) flipFrom.current = { x: from.left, y: from.top };
    setDrag(null);
    const box = (rootRef.current?.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    if (!box) return;
    const next = anchorFor(e.clientX - box.left, e.clientY - box.top, box.width, box.height);
    setAnchor(next);
    try { localStorage.setItem(ANCHOR_KEY, next); } catch { /* ignore */ }
  };

  // FLIP: after the snap, start the dock where it was dropped (inverse
  // transform, no transition) and animate the transform away.
  const flipFrom = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!el || !from) return;
    const to = el.getBoundingClientRect();
    const dx = from.x - to.left;
    const dy = from.y - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const base = ANCHOR_STYLE[anchor].transform ?? '';
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) ${base}`;
    void el.offsetWidth; // commit the start position
    el.style.transition = 'transform 260ms cubic-bezier(.2,.8,.2,1)';
    el.style.transform = base;
  }, [anchor, drag]);
  const [dockMenuOpen, setDockMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const dockBtnRef = useRef<HTMLButtonElement>(null);

  // Compute portal position from the dock button's rect, clamped to viewport.
  // Picker is ~248px wide, ~280px tall (8 tiles). Anchor to the right of the
  // dock button, top-aligned with it but clamped so it never clips top/bottom.
  useLayoutEffect(() => {
    if (!dockMenuOpen || !dockBtnRef.current) return;
    const recompute = () => {
      const r = dockBtnRef.current!.getBoundingClientRect();
      const menuW = 248;
      const menuH = 300;
      const gap = 8;
      let left = r.right + gap;
      let top = r.top - (menuH - r.height) / 2; // vertically centered on button
      // Viewport clamps
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (left + menuW > vw - 8) left = Math.max(8, r.left - menuW - gap);
      if (top < 8) top = 8;
      if (top + menuH > vh - 8) top = Math.max(8, vh - menuH - 8);
      setMenuPos({ left, top });
    };
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [dockMenuOpen]);



  // Close picker on outside click.
  useEffect(() => {
    if (!dockMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (dockBtnRef.current && !dockBtnRef.current.contains(e.target as Node)) {
        const menu = document.querySelector('.dock-style-picker-flyout');
        if (!menu || !menu.contains(e.target as Node)) setDockMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [dockMenuOpen]);

  const handleTool = (tool: ToolMode) => {
    setActiveTool(tool);
    // Picking a pointer tool leaves the pen.
    useDrawStore.getState().setActive(false);
    onToolChange?.(tool);
  };

  const fireNode = (kind: NodeKind) => {
    setPressedKind(kind);
    onAddNode({ kind });
    setTimeout(() => setPressedKind(null), 600);
  };

  // Register keyboard shortcuts (F8)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Not while typing (fields, the terminal) and not behind a modal: N, S,
      // F… would add nodes to a board the user can't see.
      if (shortcutBlocked(e)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'v' || e.key === 'V') {
        handleTool('select');
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        fireNode('text');
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        fireNode('image');
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        onAddNode({ kind: 'text', look: { kind: 'sticky', color: STICKY_COLORS[0] } });
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        setShapeMenuOpen((o) => !o);
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        useDrawStore.getState().toggle();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        fireNode('frame');
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAddNode, onToolChange]);

  const btnBase: React.CSSProperties = {
    position: 'relative',
    width: 36,
    height: 36,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 5,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    color: 'var(--ink-2)',
    transition: 'all 0.1s',
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
  };

  const activeToolBtn: React.CSSProperties = {
    position: 'relative',
    ...btnBase,
    // Fixed dark key in every mode. Its glyph uses --accent-on-dark, never
    // --acid: light styles (Mac, Blueprint) turn --acid dark, which made
    // this black-on-black. See tokens.css "accent pairs".
    background: '#1a1814',
    color: 'var(--accent-on-dark)',
  };

  const divider: React.CSSProperties = horizontal
    ? { width: 1, alignSelf: 'stretch', background: 'var(--paper-3)', margin: '2px 4px' }
    : { height: 1, background: 'var(--paper-3)', margin: '4px 2px' };

  return (
    <div
      ref={rootRef}
      data-testid="dock"
      data-anchor={anchor}
      style={{
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        ...ANCHOR_STYLE[anchor],
        ...(drag ? {
          transform: `${ANCHOR_STYLE[anchor].transform ?? ''} translate(${drag.dx}px, ${drag.dy}px)`,
          opacity: 0.85, transition: 'none',
        } : {}),
        gap: 4,
        padding: 6,
        // Theme-aware solid background. backdrop-filter blur was killing pan
        // FPS — every node moving behind the dock forced a re-blur per frame.
        background: 'var(--paper-2)',
        border: '1px solid var(--paper-3)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-1)',
        zIndex: 40,
        pointerEvents: 'auto',
      }}
    >
      {/* Grip — drag the dock to the top, middle or bottom of the left edge,
          or to the bottom centre (lies horizontal there). */}
      <div
        data-testid="dock-grip"
        role="separator"
        aria-label="Drag to move the toolbar"
        title="Drag to move the toolbar"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        style={{
          cursor: drag ? 'grabbing' : 'grab', touchAction: 'none', display: 'grid', placeItems: 'center',
          ...(horizontal ? { width: 12, alignSelf: 'stretch' } : { height: 12, alignSelf: 'stretch' }),
          color: 'var(--ink-4)',
        }}
      >
        <svg width={horizontal ? 6 : 14} height={horizontal ? 14 : 6} viewBox={horizontal ? '0 0 6 14' : '0 0 14 6'} fill="currentColor" aria-hidden>
          {(horizontal ? [[1.5, 2], [4.5, 2], [1.5, 7], [4.5, 7], [1.5, 12], [4.5, 12]] : [[2, 1.5], [7, 1.5], [12, 1.5], [2, 4.5], [7, 4.5], [12, 4.5]]).map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1} />
          ))}
        </svg>
      </div>

      {/* Select tool — V */}
      <button
        type="button"
        data-testid="dock-btn-select"
        title="Select · V"
        aria-label="Select tool (V)"
        onClick={() => handleTool('select')}
        style={activeTool === 'select' ? activeToolBtn : btnBase}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 3l14 9-7 1-3 7L5 3z" />
        </svg>
        <KeyHint k="V" />
      </button>

      {/* Divider */}
      <div aria-hidden style={divider} />

      {/* Text note — N */}
      <button
        type="button"
        data-testid="dock-btn-text"
        title="Text note [N]"
        aria-label="Add text note (N)"
        onClick={() => fireNode('text')}
        style={pressed === 'text' ? { ...btnBase, background: 'var(--paper-2)', color: 'var(--ink)' } : btnBase}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 4h14M12 4v16M8 20h8" />
        </svg>
        <KeyHint k="N" />
      </button>

      {/* Sticky note — S. Shapes — R (rectangle; switch shape from the
          style bar on the selected node). */}
      <button
        type="button"
        data-testid="dock-btn-sticky"
        title="Sticky note [S]"
        aria-label="Add sticky note (S)"
        onClick={() => onAddNode({ kind: 'text', look: { kind: 'sticky', color: STICKY_COLORS[0] } })}
        style={btnBase}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M5 4h14v11l-5 5H5z" /><path d="M14 20v-5h5" />
        </svg>
        <KeyHint k="S" />
      </button>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="dock-btn-shape"
          title="Shape [R]"
          aria-label="Choose a shape (R)"
          aria-expanded={shapeMenuOpen}
          // Not an outside click: without this the window listener closed the
          // menu on mousedown and the click opened it again.
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setShapeMenuOpen((o) => !o)}
          style={shapeMenuOpen ? activeToolBtn : btnBase}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <rect x="3" y="4" width="11" height="9" rx="1.5" /><circle cx="16" cy="15.5" r="5" />
          </svg>
          <KeyHint k="R" />
        </button>
        {shapeMenuOpen && (
          <div
            data-testid="dock-shape-menu"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', zIndex: 50, display: 'flex', gap: 2, padding: 4, borderRadius: 10,
              background: 'var(--paper-2)', border: '1px solid var(--paper-3)', boxShadow: 'var(--shadow-1)',
              ...(horizontal ? { bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)' } : { left: 'calc(100% + 12px)', top: '50%', transform: 'translateY(-50%)' }),
            }}
          >
            {SHAPE_CHOICES.map((sh) => (
              <button
                key={sh.kind}
                type="button"
                data-testid={`dock-shape-${sh.kind}`}
                title={sh.label}
                aria-label={sh.label}
                onClick={() => { setShapeMenuOpen(false); onAddNode({ kind: 'text', look: { kind: sh.kind, color: sh.color } }); }}
                style={{ ...btnBase, width: 34, height: 34 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={`color-mix(in srgb, ${sh.color} 35%, transparent)`} stroke={sh.color} strokeWidth="1.8" strokeLinejoin="round">{sh.icon}</svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Image / ASCII — I */}
      <button
        type="button"
        data-testid="dock-btn-image"
        title="Image / ASCII [I]"
        aria-label="Add image node (I)"
        onClick={() => fireNode('image')}
        style={pressed === 'image' ? { ...btnBase, background: 'var(--paper-2)', color: 'var(--ink)' } : btnBase}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="16" rx="1" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 16l-5-5-9 9" />
        </svg>
        <KeyHint k="I" />
      </button>

      {/* Pen — P. Draw and erase on the canvas; right-click while drawing
          opens the tool wheel (tools, colours, sizes). */}
      <button
        type="button"
        data-testid="dock-btn-pen"
        title={penActive ? 'Pen on — right-click for tools, Esc to stop [P]' : 'Pen [P]'}
        aria-label="Pen tool (P)"
        aria-pressed={penActive}
        onClick={() => togglePen()}
        style={penActive ? activeToolBtn : btnBase}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" />
          <path d="M14 6l3 3" />
        </svg>
        <KeyHint k="P" />
      </button>

      {/* Frame — F. Glassy 3D container that softly groups whatever is dropped
          inside its bounds. Drag the frame and its contents move with it. */}
      <button
        type="button"
        data-testid="dock-btn-frame"
        title="Frame [F]"
        aria-label="Add frame (F)"
        onClick={() => fireNode('frame')}
        style={pressed === 'frame' ? { ...btnBase, background: 'var(--paper-2)', color: 'var(--ink)' } : btnBase}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 9h18" opacity="0.55" />
          <path d="M6 5v14" opacity="0.35" />
        </svg>
        <KeyHint k="F" />
      </button>

      {/* Mother-row chassis-style picker — opens a tile flyout. Button shows
          the active style's glyph; flyout has 4 rich tiles to switch styles. */}
      {dockStyle !== undefined && onDockStyleChange ? (
        <>
          <div aria-hidden style={divider} />
          <button
            ref={dockBtnRef}
            type="button"
            data-testid="dock-btn-dock-style"
            className={`krnl-dock-style-btn${dockStyle !== 'classic' ? ' is-armed' : ''}${dockMenuOpen ? ' is-open' : ''}`}
            title={`Frame style: ${DOCK_REGISTRY[dockStyle].label} — click to change`}
            aria-label="Pick mother-row frame style"
            aria-expanded={dockMenuOpen}
            onClick={() => setDockMenuOpen((o) => !o)}
          >
            <span className="krnl-dock-style-btn__glyph">{DOCK_REGISTRY[dockStyle].glyph}</span>
          </button>

          {dockMenuOpen && menuPos && createPortal(
            <div
              className="dock-style-picker-flyout"
              data-testid="dock-style-picker-menu"
              role="menu"
              style={{ left: menuPos.left, top: menuPos.top, bottom: 'auto' }}
            >
              <div className="dsp-head">
                <span className="dsp-head__dot" aria-hidden />
                <span>Frame style</span>
              </div>
              <div className="dsp-tiles">
                {DOCK_STYLES.map((s) => {
                  const isActive = s === dockStyle;
                  const sDef = DOCK_REGISTRY[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      className={`dsp-tile${isActive ? ' is-active' : ''}`}
                      data-testid={`dock-style-${s}`}
                      onClick={() => {
                        onDockStyleChange(s);
                        setDockMenuOpen(false);
                      }}
                    >
                      <span className="dsp-tile__glyph">{sDef.glyph}</span>
                      <span className="dsp-tile__label">{sDef.label}</span>
                      <span className="dsp-tile__sub">{sDef.sublabel}</span>
                      {isActive && (
                        <span className="dsp-tile__check" aria-hidden>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1.5 5.5l2.5 2.5L8.5 2.5" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )}
        </>
      ) : null}
    </div>
  );
}
