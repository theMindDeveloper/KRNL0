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

import { useEffect, useState } from 'react';
import type { NodeKind } from '../../../shared/types/node';

type ToolMode = 'select' | 'connect';

export interface DockProps {
  /** Called when the user clicks a node-creation button or triggers a keyboard shortcut. */
  onAddNode: (args: { kind: NodeKind }) => void;
  /** Called when the user clicks a tool-mode button. */
  onToolChange?: (tool: ToolMode) => void;
}

export function Dock({ onAddNode, onToolChange }: DockProps) {
  const [activeTool, setActiveTool] = useState<ToolMode>('select');
  const [pressed, setPressedKind] = useState<NodeKind | null>(null);

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
    background: 'var(--ink)',
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

      {/* Divider */}
      <div aria-hidden style={divider} />

      {/* Connect tool */}
      <button
        type="button"
        data-testid="dock-btn-connect"
        title="Connect"
        aria-label="Connect tool"
        onClick={() => handleTool('connect')}
        style={activeTool === 'connect' ? activeToolBtn : btnBase}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="6" cy="12" r="2" />
          <circle cx="18" cy="12" r="2" />
          <path d="M8 12h8" />
        </svg>
      </button>
    </div>
  );
}
