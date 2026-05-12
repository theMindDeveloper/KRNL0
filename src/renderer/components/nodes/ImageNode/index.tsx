/**
 * ImageNode — drag-drop image card with real file-backed persistence.
 *
 * State references the image by `assetId` (a 26-char ULID-shaped string).
 * Bytes live at <BOARD_DIR>/assets/<assetId>.<ext> and are served via the
 * krnl-asset:// privileged protocol (Decision 20). No base64 in board.json.
 *
 * Selectable replace control swaps the asset. NodeResizer respects Shift
 * for aspect-ratio-locked resize. Caption is the editable alt text.
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { NodeResizer } from '@xyflow/react';
import type { NodeProps } from '../types';
import type { ImageState, ImageConfig } from './types';
import { ingestImageFile } from '../../Canvas/dropImage';

const DEFAULT_PLACEHOLDER_WIDTH = 240;
const DEFAULT_PLACEHOLDER_HEIGHT = 180;

export function ImageNode({
  node,
  selected,
  onCommand,
}: NodeProps<ImageState, ImageConfig>) {
  const state = node.state as ImageState;
  const { assetId } = state;

  const width =
    state.width ??
    (assetId && state.naturalWidth
      ? Math.min(480, state.naturalWidth)
      : DEFAULT_PLACEHOLDER_WIDTH);
  const height =
    state.height ??
    (assetId && state.naturalWidth && state.naturalHeight
      ? Math.round(
          (state.naturalHeight / state.naturalWidth) *
            Math.min(480, state.naturalWidth),
        )
      : DEFAULT_PLACEHOLDER_HEIGHT);

  const [hover, setHover] = useState(false);
  const [editingAlt, setEditingAlt] = useState(false);
  const [altDraft, setAltDraft] = useState(state.alt ?? '');
  const [imgFailed, setImgFailed] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Track Shift across the document so the NodeResizer's keepAspectRatio
  // prop reflects the modifier in real time. Cheap — only two listeners.
  useEffect(() => {
    const onChange = (e: KeyboardEvent) => setShiftHeld(e.shiftKey);
    window.addEventListener('keydown', onChange);
    window.addEventListener('keyup', onChange);
    return () => {
      window.removeEventListener('keydown', onChange);
      window.removeEventListener('keyup', onChange);
    };
  }, []);

  const handleReplaceClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const result = await ingestImageFile(file);
      if (result) {
        onCommand('image.setAsset', {
          assetId: result.assetId,
          naturalWidth: result.naturalWidth,
          naturalHeight: result.naturalHeight,
          mimeType: result.mimeType,
          alt: result.alt,
        });
        setImgFailed(false);
      }
    } catch (err) {
      console.warn('[image] replace failed:', err);
    }
  };

  const commitAlt = () => {
    if (altDraft !== (state.alt ?? '')) {
      onCommand('image.setAlt', { alt: altDraft });
    }
    setEditingAlt(false);
  };

  const onResizeEnd = (
    _e: unknown,
    p: { width: number; height: number },
  ): void => {
    onCommand('image.setSize', { width: p.width, height: p.height });
  };

  return (
    <div
      className="krnl-image-node"
      data-testid="image-node-root"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width,
        background: 'var(--paper-2)',
        border: '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg, 10px)',
        overflow: 'hidden',
        boxShadow:
          hover || selected
            ? '0 2px 0 rgba(26,24,20,.04), 0 8px 24px rgba(26,24,20,.10)'
            : '0 1px 0 rgba(26,24,20,.04), 0 2px 6px rgba(26,24,20,.06)',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <NodeResizer
        isVisible={selected === true}
        minWidth={120}
        minHeight={80}
        maxWidth={1200}
        maxHeight={1200}
        keepAspectRatio={shiftHeld}
        onResizeEnd={onResizeEnd}
        handleStyle={{
          width: 8,
          height: 8,
          background: 'var(--ink-3)',
          borderRadius: 2,
          border: 'none',
        }}
        lineStyle={{ borderColor: 'var(--ink-3)' }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        data-testid="image-node-file-input"
      />

      <div
        className="image-frame"
        data-testid="image-node-frame"
        style={{
          width: '100%',
          height,
          position: 'relative',
          background:
            assetId && !imgFailed
              ? 'transparent'
              : 'linear-gradient(135deg, #2a3441 0%, #1a2030 60%, #0f1420 100%)',
          overflow: 'hidden',
        }}
      >
        {assetId && !imgFailed ? (
          <img
            data-testid="image-node-img"
            src={`krnl-asset://${assetId}`}
            alt={state.alt ?? ''}
            onError={() => setImgFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <div
            data-testid="image-node-placeholder"
            className="ascii-image"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              lineHeight: 1,
              color: 'var(--acid)',
              whiteSpace: 'pre',
              opacity: 0.85,
              letterSpacing: '-0.05em',
            }}
          >
            {`▲△  ▲  △\n   ▲▲△▲\n  ▲△▲△▲△`}
          </div>
        )}

        {selected && (
          <button
            type="button"
            onClick={handleReplaceClick}
            data-testid="image-node-replace"
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              padding: '4px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              background: 'rgba(0,0,0,0.55)',
              color: 'var(--paper)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 4,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {assetId ? 'replace' : 'pick file'}
          </button>
        )}
      </div>

      <div
        className="image-cap"
        style={{
          padding: '8px 12px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--ink-3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {editingAlt ? (
          <input
            data-testid="image-node-alt-input"
            value={altDraft}
            autoFocus
            onChange={(e) => setAltDraft(e.target.value)}
            onBlur={commitAlt}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitAlt();
              } else if (e.key === 'Escape') {
                setAltDraft(state.alt ?? '');
                setEditingAlt(false);
              }
            }}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              color: 'var(--ink-2)',
              padding: 0,
            }}
          />
        ) : (
          <span
            data-testid="image-node-caption"
            onClick={() => {
              setAltDraft(state.alt ?? '');
              setEditingAlt(true);
            }}
            style={{
              color: 'var(--ink-2)',
              cursor: 'text',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {state.alt && state.alt.length > 0 ? state.alt : 'image / ascii'}
          </span>
        )}
        {state.naturalWidth && state.naturalHeight && (
          <span style={{ color: 'var(--ink-4)' }}>
            {state.naturalWidth}×{state.naturalHeight}
          </span>
        )}
      </div>
    </div>
  );
}

export default ImageNode;
