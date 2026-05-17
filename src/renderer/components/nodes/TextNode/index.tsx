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

const AUTOSAVE_MS = 400;

export function TextNode({
  node,
  selected,
  onCommand,
}: NodeProps<TextState, TextConfig>) {
  const state = node.state as TextState;
  const text = state.text ?? '';

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
      style={{
        width: '100%',
        height: '100%',
        background: 'rgba(245,241,232,0.04)',
        border: `1px ${borderStyle} var(--paper-3)`,
        borderRadius: 'var(--radius-lg, 10px)',
        boxShadow: showShadow
          ? '0 2px 0 rgba(26,24,20,.04), 0 8px 24px rgba(26,24,20,.10)'
          : 'none',
        transition: 'box-shadow 120ms ease, border-style 120ms ease',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
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
            padding: '12px 14px',
            fontFamily: 'var(--font-serif)',
            fontSize: 18,
            lineHeight: 1.35,
            color: 'var(--ink)',
            letterSpacing: '-0.005em',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div
          className="text-body"
          data-testid="text-node-body"
          onClick={enterEdit}
          style={{
            width: '100%',
            height: '100%',
            padding: '12px 14px',
            fontFamily: 'var(--font-serif)',
            fontSize: 18,
            lineHeight: 1.35,
            color: 'var(--ink)',
            letterSpacing: '-0.005em',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'auto',
            cursor: 'text',
            boxSizing: 'border-box',
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
