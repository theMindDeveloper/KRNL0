/**
 * TextNode — editable, resizable, connectable text-note card.
 *
 * Click → edit. Debounced 400 ms autosave. Escape cancels.
 * NodeResizer becomes visible when `selected`. State.width/height persist;
 * absent values render with defaults (260 × 120).
 *
 * Style follows LifeOS Whiteboard `.node.text`: transparent bg, dashed border
 * at rest, solid on hover, body uses Instrument Serif at 18 px.
 */

import { useEffect, useRef, useState } from 'react';
import { NodeResizeControl } from '@xyflow/react';
import type { NodeProps } from '../types';
import type { TextState, TextConfig } from './types';
import { useCornerProximity } from '../../../hooks/useCornerProximity';
import { LookBar } from './LookBar';
import { STICKY_COLORS, type TextLook } from './types';

const AUTOSAVE_MS = 400;

export function TextNode({
  node,
  selected,
  onCommand,
}: NodeProps<TextState, TextConfig>) {
  const state = node.state as TextState;
  const text = state.text ?? '';
  // Brainstorming look: plain note, coloured sticky, or a shape.
  const look: TextLook = state.look ?? { kind: 'note' };
  const lookColor = look.color ?? (look.kind === 'sticky' ? STICKY_COLORS[0] : '#a8e6ff');
  const isSticky = look.kind === 'sticky';
  const isShape = look.kind === 'rect' || look.kind === 'ellipse' || look.kind === 'diamond';
  // Padding that keeps text inside the shape's inscribed box (a diamond's is
  // the middle 50%, an ellipse's roughly the middle 70%).
  const shapePad = look.kind === 'diamond' ? '25%' : look.kind === 'ellipse' ? '15%' : '12px 14px';
  const shapeFill = `color-mix(in srgb, ${lookColor} 42%, var(--paper))`;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [hover, setHover] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep draft in sync if the upstream state.text changes while NOT editing.
  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  // Debounced autosave while editing.
  useEffect(() => {
    if (!editing) return;
    if (draft === text) return;
    const t = setTimeout(() => {
      onCommand('text.setText', { text: draft });
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, editing, text, onCommand]);

  // Focus textarea on enter-edit; caret at end.
  useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editing]);

  const enterEdit = () => {
    if (editing) return;
    setDraft(text);
    setEditing(true);
  };

  const commit = () => {
    if (draft !== text) onCommand('text.setText', { text: draft });
    setEditing(false);
  };

  const cancel = () => {
    setDraft(text);
    setEditing(false);
  };

  const onResizeEnd = (
    _e: unknown,
    p: { width: number; height: number },
  ): void => {
    onCommand('text.setSize', { width: p.width, height: p.height });
  };

  const borderStyle = hover || editing ? 'solid' : 'dashed';
  const showShadow = hover || editing;

  // Proximity reveal for the corner resize handle — invisible until the
  // cursor is within ~48px of the bottom-right corner.
  const corner = useCornerProximity({ threshold: 48 });
  const showHandle = corner.near || selected === true;

  return (
    <div
      ref={corner.rootRef}
      className="krnl-text-node"
      data-testid="text-node-root"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); corner.onMouseLeave(); }}
      onMouseMove={corner.onMouseMove}
      data-look={look.kind}
      style={{
        width: '100%',
        height: '100%',
        background: 'rgba(245,241,232,0.04)',
        border: `1px ${borderStyle} var(--paper-3)`,
        borderRadius: 'var(--radius-lg, 10px)',
        boxShadow: showShadow
          ? '0 2px 0 rgba(26,24,20,.04), 0 8px 24px rgba(26,24,20,.10)'
          : 'none',
        transition: 'box-shadow 120ms ease, border-style 120ms ease, background 160ms ease',
        position: 'relative',
        boxSizing: 'border-box',
        ...(isSticky ? {
          background: lookColor, border: 'none', borderRadius: 4,
          boxShadow: selected ? '0 0 0 2px var(--acid), 0 10px 22px rgba(0,0,0,0.35)' : '0 10px 22px rgba(0,0,0,0.32), 0 1px 0 rgba(0,0,0,0.1)',
        } : {}),
        ...(look.kind === 'rect' || look.kind === 'ellipse' ? {
          background: shapeFill,
          border: `2px solid ${lookColor}`,
          borderRadius: look.kind === 'ellipse' ? '50%' : 12,
          boxShadow: selected ? '0 0 0 2px var(--acid)' : 'none',
        } : {}),
        ...(look.kind === 'diamond' ? { background: 'transparent', border: 'none', boxShadow: 'none' } : {}),
      }}
    >
      {look.kind === 'diamond' && (
        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <polygon points="50,1 99,50 50,99 1,50" fill={shapeFill} stroke={selected ? 'var(--acid)' : lookColor} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {selected && <LookBar look={look} onChange={(next) => onCommand('text.setLook', next)} />}
      {/* Resize handle — single bottom-right control with a diagonal-stripe
          glyph. Matches AnalyticsNode for visual consistency; cleaner than
          the 4-corner + 4-side NodeResizer chrome that selected text nodes
          used to grow. */}
      <NodeResizeControl
        position="bottom-right"
        minWidth={180}
        minHeight={80}
        maxWidth={1200}
        maxHeight={2000}
        onResizeEnd={onResizeEnd}
        style={{
          background: 'transparent',
          border: 'none',
          width: 18,
          height: 18,
          right: 2,
          bottom: 2,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          style={{
            position: 'absolute',
            right: 2,
            bottom: 2,
            cursor: 'nwse-resize',
            color: '#7d848b',
            pointerEvents: 'none',
            opacity: showHandle ? 1 : 0,
            transition: 'opacity 140ms ease',
          }}
          aria-hidden
        >
          <path d="M13 5L5 13M13 9L9 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </NodeResizeControl>
      {editing ? (
        <div style={isShape ? { position: 'absolute', inset: 0, padding: shapePad, boxSizing: 'border-box', display: 'flex', alignItems: 'center' } : { width: '100%', height: '100%' }}>
        <textarea
          ref={taRef}
          className="text-body"
          data-testid="text-node-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: 'transparent',
            padding: isShape ? 0 : '12px 14px',
            fontFamily: isSticky || isShape ? 'var(--font-sans)' : 'var(--font-serif)',
            fontSize: isSticky || isShape ? 16 : 18,
            lineHeight: 1.35,
            color: isSticky ? '#1a1814' : 'var(--ink)',
            textAlign: isShape ? 'center' : 'left',
            letterSpacing: '-0.005em',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden',
            ...(isShape ? { height: `${Math.max(1, draft.split('\n').length) * 1.35}em`, maxHeight: '100%' } : {}),
          }}
        />
        </div>
      ) : (
        <div
          className="text-body"
          data-testid="text-node-body"
          onClick={enterEdit}
          style={{
            width: '100%',
            height: '100%',
            padding: isShape ? shapePad : '12px 14px',
            fontFamily: isSticky || isShape ? 'var(--font-sans)' : 'var(--font-serif)',
            fontSize: isSticky || isShape ? 16 : 18,
            fontWeight: isSticky || isShape ? 500 : undefined,
            lineHeight: 1.35,
            color: isSticky ? '#1a1814' : 'var(--ink)',
            letterSpacing: '-0.005em',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'hidden',
            cursor: 'text',
            boxSizing: 'border-box',
            position: 'relative',
            ...(isShape ? { display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' } : {}),
          }}
        >
          {text || (
            <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>
              write...
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default TextNode;
