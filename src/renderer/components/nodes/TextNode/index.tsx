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

// Sticky notes are handwritten (Caveat, via Fontsource — loaded on demand).
const STICKY_FONT = "'Caveat', 'Segoe Print', 'Comic Sans MS', cursive";
let stickyFontLoaded = false;
function loadStickyFont(): void {
  if (stickyFontLoaded) return;
  stickyFontLoaded = true;
  void import('@fontsource/caveat/500.css').catch(() => { stickyFontLoaded = false; });
}

// Fine paper grain (SVG noise) for sticky notes.
const PAPER_GRAIN = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.07 0'/></filter><rect width='120' height='120' filter='url(#n)'/></svg>")}")`;

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
  if (isSticky) loadStickyFont();
  const isShape = look.kind === 'rect' || look.kind === 'ellipse' || look.kind === 'diamond';
  // Padding that keeps text inside the shape's inscribed box (a diamond's is
  // the middle 50%, an ellipse's roughly the middle 70%).
  const shapePad = look.kind === 'diamond' ? '25%' : look.kind === 'ellipse' ? '15%' : '12px 14px';
  const shapeFill = `color-mix(in srgb, ${lookColor} 42%, var(--paper))`;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [hover, setHover] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Text at the moment editing began. The 400 ms autosave may already have
  // written part of the edit, so Escape restores this, not the live text.
  const originalRef = useRef(text);
  const cancellingRef = useRef(false);
  // Text taller than the box fades out at the bottom, so "there is more" is
  // visible without opening the note.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || editing) return;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, editing]);

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
    originalRef.current = text;
    cancellingRef.current = false;
    setDraft(text);
    setEditing(true);
  };

  const commit = () => {
    // The textarea blurs as it unmounts after Escape; that blur must not
    // re-save the abandoned draft.
    if (cancellingRef.current) return;
    if (draft !== text) onCommand('text.setText', { text: draft });
    setEditing(false);
  };

  const cancel = () => {
    cancellingRef.current = true;
    const original = originalRef.current;
    if (text !== original) onCommand('text.setText', { text: original });
    setDraft(original);
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
          // Paper note. ONE `background` shorthand (colour last): mixing the
          // shorthand with backgroundColor let a re-render drop the paper
          // colour, leaving the lines on black.
          background: [
            'linear-gradient(90deg, transparent 29px, rgba(214,72,72,0.45) 29px, rgba(214,72,72,0.45) 30.5px, transparent 30.5px) 0 0',
            'repeating-linear-gradient(180deg, transparent 0 27px, rgba(60,90,140,0.13) 27px 28px) 0 10px',
            'linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0) 40%) 0 0',
            `${PAPER_GRAIN} 0 0`,
            lookColor,
          ].join(', '),
          border: 'none', borderRadius: '2px 2px 14px 2px',
          boxShadow: selected
            ? '0 0 0 2px var(--acid), 0 14px 26px rgba(0,0,0,0.38)'
            : '0 1px 1px rgba(0,0,0,0.12), 0 6px 10px rgba(0,0,0,0.16), 0 16px 28px rgba(0,0,0,0.26)',
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
      {isSticky && (
        // Folded corner.
        <span aria-hidden style={{
          position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, pointerEvents: 'none',
          background: 'linear-gradient(135deg, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.05) 45%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.15) 100%)',
          borderTopLeftRadius: 6, borderBottomRightRadius: 14,
        }} />
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
          // nodrag: selecting text with the mouse must not move the note;
          // nowheel: the wheel scrolls a long note instead of zooming.
          className="text-body nodrag nowheel"
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
            padding: isShape ? 0 : isSticky ? '6px 14px 10px 40px' : '12px 14px',
            fontFamily: isSticky ? STICKY_FONT : isShape ? 'var(--font-sans)' : 'var(--font-serif)',
            fontSize: isSticky ? 21 : isShape ? 16 : 18,
            lineHeight: isSticky ? '28px' : 1.35,
            color: isSticky ? '#2a2620' : 'var(--ink)',
            textAlign: isShape ? 'center' : 'left',
            letterSpacing: '-0.005em',
            boxSizing: 'border-box',
            position: 'relative',
            // Shapes size to their lines; a long note scrolls while editing
            // instead of hiding what is past the box.
            overflow: isShape ? 'hidden' : 'auto',
            ...(isShape ? { height: `${Math.max(1, draft.split('\n').length) * 1.35}em`, maxHeight: '100%' } : {}),
          }}
        />
        </div>
      ) : (
        <div
          className="text-body"
          ref={bodyRef}
          data-testid="text-node-body"
          data-overflowing={overflowing || undefined}
          onClick={enterEdit}
          // Keyboard: Tab to the note, Enter (or F2) to edit it.
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'F2') {
              e.preventDefault();
              e.stopPropagation();
              enterEdit();
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            padding: isShape ? shapePad : isSticky ? '6px 14px 10px 40px' : '12px 14px',
            fontFamily: isSticky ? STICKY_FONT : isShape ? 'var(--font-sans)' : 'var(--font-serif)',
            fontSize: isSticky ? 21 : isShape ? 16 : 18,
            fontWeight: isSticky || isShape ? 500 : undefined,
            lineHeight: isSticky ? '28px' : 1.35,
            color: isSticky ? '#2a2620' : 'var(--ink)',
            letterSpacing: '-0.005em',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'hidden',
            cursor: 'text',
            boxSizing: 'border-box',
            position: 'relative',
            ...(isShape ? { display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' } : {}),
            ...(overflowing ? {
              maskImage: 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent)',
            } : {}),
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
