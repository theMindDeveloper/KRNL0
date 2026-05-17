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

import { useEffect, useRef, useState } from 'react';
import type { NodeKind } from '../../../shared/types/node';
import { DOCK_STYLES, type DockStyle } from '../ChassisLayer/useDockStyle';
import { useBoardStore } from '../../store/boardStore';

type ToolMode = 'select' | 'connect';

export interface DockProps {
  /** Called when the user clicks a node-creation button or triggers a keyboard shortcut. */
  onAddNode: (args: { kind: NodeKind; at?: { x: number; y: number } }) => void;
  /** Called when the user clicks a tool-mode button. */
  onToolChange?: (tool: ToolMode) => void;
  /** Current mother-row chassis variant. */
  dockStyle?: DockStyle;
  /** Setter for the chassis variant. */
  onDockStyleChange?: (s: DockStyle) => void;
}

const DOCK_STYLE_LABELS: Record<DockStyle, string> = {
  classic: 'Classic',
  synthesizer: 'Synthesizer',
  telemetry: 'Telemetry',
  'krnl-dock': 'KRNL Dock',
};

const DOCK_STYLE_SUB: Record<DockStyle, string> = {
  classic: 'Default frame',
  synthesizer: 'Eurorack panel',
  telemetry: 'Mission control',
  'krnl-dock': 'Rack chassis',
};

/** Mini-glyph per dock style — a tiny visual signature shown in the picker
 *  flyout. Composed inside a 24×24 viewBox so all four sit on a shared grid. */
const DOCK_STYLE_GLYPHS: Record<DockStyle, React.ReactNode> = {
  classic: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h10M7 14h6" opacity="0.7" />
    </svg>
  ),
  synthesizer: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <circle cx="7"  cy="14" r="1.6" />
      <circle cx="12" cy="14" r="1.6" />
      <circle cx="17" cy="14" r="1.6" />
      <path d="M5 8h14" opacity="0.5" />
    </svg>
  ),
  telemetry: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M4 13l3-3 3 2 4-5 3 4 3-2" />
      <circle cx="7" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  'krnl-dock': (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 8h18M3 16h18" />
      <circle cx="6" cy="6" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="6" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="6" cy="18" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="18" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
};

export function Dock({ onAddNode, onToolChange, dockStyle, onDockStyleChange }: DockProps) {
  const [activeTool, setActiveTool] = useState<ToolMode>('select');
  const [pressed, setPressedKind] = useState<NodeKind | null>(null);
  const [dockMenuOpen, setDockMenuOpen] = useState(false);
  const dockBtnRef = useRef<HTMLButtonElement>(null);

  // Analytics is a singleton — button reflects whether one is on the board.
  const analyticsOpen = useBoardStore((s) =>
    (s.board?.nodes ?? []).some((n) => n.kind === 'analytics'),
  );

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
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      // Bail when focus is inside any terminal node — xterm focus may live on
      // a hidden helper textarea, but if focus has fallen to the body the
      // tagName check above misses it. Treat anything inside .term-body /
      // .xterm as "user is typing in the terminal."
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('.term-body') || active?.closest('.xterm')) {
        return;
      }
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
      if (e.key === 'f' || e.key === 'F') {
        fireNode('frame');
        return;
      }
      if (e.key === 'a' || e.key === 'A') {
        fireNode('analytics');
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAddNode, onToolChange]);

  const btnBase: React.CSSProperties = {
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
    ...btnBase,
    // Hardcode — --ink flips to light in dark mode, which made the active
    // button render as acid-green on cream (poor contrast). The active
    // state should always be acid-on-black.
    background: '#1a1814',
    color: 'var(--acid)',
  };

  const divider: React.CSSProperties = {
    height: 1,
    background: 'var(--paper-3)',
    margin: '4px 2px',
  };

  return (
    <div
      data-testid="dock"
      style={{
        position: 'absolute',
        left: 14,
        top: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 6,
        // Theme-aware solid background. backdrop-filter blur was killing pan
        // FPS — every node moving behind the dock forced a re-blur per frame.
        background: 'var(--paper-2)',
        border: '1px solid var(--paper-3)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-1)',
        zIndex: 40,
      }}
    >
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
      </button>

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
      </button>

      {/* Analytics — A. Singleton dashboard: click to spawn, click again to hide. */}
      <button
        type="button"
        data-testid="dock-btn-analytics"
        title={analyticsOpen ? 'Hide analytics [A]' : 'Show analytics [A]'}
        aria-label={analyticsOpen ? 'Hide analytics dashboard (A)' : 'Show analytics dashboard (A)'}
        aria-pressed={analyticsOpen}
        onClick={() => fireNode('analytics')}
        style={analyticsOpen ? activeToolBtn : (pressed === 'analytics' ? { ...btnBase, background: 'var(--paper-2)', color: 'var(--ink)' } : btnBase)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M7 15l4-4 3 3 5-6" />
          <circle cx="7" cy="15" r="1" fill="currentColor" stroke="none" />
          <circle cx="11" cy="11" r="1" fill="currentColor" stroke="none" />
          <circle cx="14" cy="14" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="8" r="1" fill="currentColor" stroke="none" />
        </svg>
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
            title={`Frame style: ${DOCK_STYLE_LABELS[dockStyle]} — click to change`}
            aria-label="Pick mother-row frame style"
            aria-expanded={dockMenuOpen}
            onClick={() => setDockMenuOpen((o) => !o)}
          >
            <span className="krnl-dock-style-btn__glyph">{DOCK_STYLE_GLYPHS[dockStyle]}</span>
          </button>

          {dockMenuOpen && (
            <div
              className="dock-style-picker-flyout"
              data-testid="dock-style-picker-menu"
              role="menu"
            >
              <div className="dsp-head">
                <span className="dsp-head__dot" aria-hidden />
                <span>Frame style</span>
              </div>
              <div className="dsp-tiles">
                {DOCK_STYLES.map((s) => {
                  const isActive = s === dockStyle;
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
                      <span className="dsp-tile__glyph">{DOCK_STYLE_GLYPHS[s]}</span>
                      <span className="dsp-tile__label">{DOCK_STYLE_LABELS[s]}</span>
                      <span className="dsp-tile__sub">{DOCK_STYLE_SUB[s]}</span>
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
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
