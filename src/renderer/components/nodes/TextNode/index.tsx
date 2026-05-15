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
import { NodeResizer } from '@xyflow/react';
import type { NodeProps } from '../types';
import type { TextState, TextConfig } from './types';

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

  return (
    <div
      className="krnl-text-node"
      data-testid="text-node-root"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
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
      <NodeResizer
        isVisible={selected === true}
        minWidth={180}
        minHeight={80}
        maxWidth={1200}
        maxHeight={2000}
        onResizeEnd={onResizeEnd}
        handleStyle={{
          width: 8,
          height: 8,
          background: '#0e0d0b',
          border: '1.5px solid var(--acid)',
          borderRadius: '50%',
        }}
        lineStyle={{ borderColor: 'rgba(201,241,88,0.4)', borderWidth: 1 }}
      />
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
