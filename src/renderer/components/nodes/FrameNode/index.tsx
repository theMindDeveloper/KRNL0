/**
 * FrameNode — glassy 3D-ish container that softly groups nodes whose center
 * lands inside its bounds. The frame is a regular RF child node (non-mother)
 * with L/R link handles, NodeResizer (corners + edges), and a label strip.
 *
 * Soft-group behavior is implemented in CanvasFlow's drag pipeline:
 *   - dragging a frame translates every node in `state.childIds` by the same
 *     delta on the same render tick (no store cascade during the gesture).
 *   - dragging a non-frame node and releasing it computes which frame (if any)
 *     contains its center and rewrites `state.childIds` accordingly.
 *
 * Visual: linear-gradient body for the glassy back, a left-edge highlight
 * stripe for the side reflection, an inner highlight border, and a subtle
 * outer ambient shadow. backdrop-filter blur is intentionally omitted — the
 * canvas-wide pan cost of a single full-frame backdrop filter is too high.
 * The illusion is created with gradients only, which composite cheaply.
 */

import { useEffect, useRef, useState } from 'react';
import { NodeResizer } from '@xyflow/react';
import type { NodeProps } from '../types';
import {
  type FrameState,
  type FrameConfig,
  type FrameTint,
  defaultFrameConfig,
} from './types';

// Frame chrome should fade into the background — no tinted glows, no colored
// fills. Edge is a near-neutral hairline so the container still reads as a
// region without competing with anything inside it. `tag` is the only
// remaining color cue (small label dot + accent on the resize handles).
const TINT_RGBA: Record<FrameTint, { edge: string; tag: string }> = {
  cyan:    { edge: 'rgba(212,207,192,0.18)', tag: 'var(--cyan)' },
  spine:   { edge: 'rgba(212,207,192,0.18)', tag: 'var(--spine-hot)' },
  rust:    { edge: 'rgba(212,207,192,0.18)', tag: 'var(--rust)' },
  plum:    { edge: 'rgba(212,207,192,0.18)', tag: 'var(--purple)' },
  neutral: { edge: 'rgba(212,207,192,0.18)', tag: 'var(--ink-3)' },
};

export function FrameNode({
  node,
  selected,
  onCommand,
}: NodeProps<FrameState, FrameConfig>) {
  const state = node.state as FrameState;
  const config = (node.config as FrameConfig) ?? defaultFrameConfig();
  const tint = TINT_RGBA[config.tint ?? 'neutral'];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state.label ?? '');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(state.label ?? '');
  }, [state.label, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    if (draft !== state.label) onCommand('frame.setLabel', { label: draft });
    setEditing(false);
  };

  const onResizeEnd = (
    _e: unknown,
    p: { width: number; height: number },
  ): void => {
    onCommand('frame.setSize', { width: p.width, height: p.height });
  };

  const childCount = state.childIds?.length ?? 0;

  return (
    <div
      className="krnl-frame-node"
      data-testid="frame-node-root"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        boxSizing: 'border-box',
        borderRadius: 12,
        // Quiet background: very faint vertical wash for subtle depth, nothing
        // more. Stays out of the way of whatever nodes the user puts inside.
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.012) 0%, rgba(0,0,0,0.02) 100%)',
        // Hairline neutral edge so the container reads as a region without
        // adding chroma to the canvas.
        border: `1px solid ${tint.edge}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        overflow: 'visible',
        transition: 'border-color 120ms ease',
      }}
    >
      <NodeResizer
        isVisible={selected === true}
        minWidth={160}
        minHeight={120}
        maxWidth={4000}
        maxHeight={4000}
        onResizeEnd={onResizeEnd}
        handleStyle={{
          width: 7,
          height: 7,
          background: 'var(--paper)',
          border: '1px solid var(--ink-3)',
          borderRadius: '50%',
        }}
        lineStyle={{ borderColor: 'rgba(212,207,192,0.25)', borderWidth: 1 }}
      />

      {/* Faint left-edge sheen — barely visible, just enough to suggest glass. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 10,
          bottom: 10,
          left: 0,
          width: 3,
          borderRadius: '12px 0 0 12px',
          background:
            'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Label strip — top-left tag. Click to edit. */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 14,
          right: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          userSelect: 'none',
          pointerEvents: 'auto',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: tint.tag,
            opacity: 0.7,
          }}
        />
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                setDraft(state.label ?? '');
                setEditing(false);
              }
            }}
            placeholder="frame"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--ink)',
              fontFamily: 'inherit',
              fontSize: 10,
              letterSpacing: 'inherit',
              textTransform: 'inherit',
              padding: 0,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="rename frame"
            style={{
              flex: 1,
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'inherit',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              letterSpacing: 'inherit',
              textTransform: 'inherit',
              cursor: 'text',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {state.label || 'frame'}
          </button>
        )}
        <span
          aria-hidden
          style={{ color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' }}
        >
          {childCount.toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}

export default FrameNode;
