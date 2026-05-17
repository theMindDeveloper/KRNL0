/**
 * ImageNode â€” drag-drop image card with real file-backed persistence.
 *
 * State references the image by `assetId` (a 26-char ULID-shaped string).
 * Bytes live at <BOARD_DIR>/assets/<assetId>.<ext> and are served via the
 * krnl-asset:// privileged protocol (Decision 21). No base64 in board.json.
 *
 * The node body is the image itself — no header, no caption row. The empty
 * placeholder opens a file picker on click; once an asset is set the card is
 * read-only. NodeResizer respects Shift for aspect-ratio-locked resize.
 */

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { NodeResizeControl } from '@xyflow/react';
import type { NodeProps } from '../types';
import type { ImageState, ImageConfig } from './types';
import { ingestImageFile } from '../../Canvas/dropImage';
import { useCornerProximity } from '../../../hooks/useCornerProximity';

export function ImageNode({
  node,
  selected,
  onCommand,
}: NodeProps<ImageState, ImageConfig>) {
  const state = node.state as ImageState;
  const { assetId } = state;

  const [hover, setHover] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Track Shift across the document so the NodeResizer's keepAspectRatio
  // prop reflects the modifier in real time. Cheap â€” only two listeners.
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

  const onResizeEnd = (
    _e: unknown,
    p: { width: number; height: number },
  ): void => {
    onCommand('image.setSize', { width: p.width, height: p.height });
  };

  const hasAsset = Boolean(assetId) && !imgFailed;

  // Proximity reveal for the corner resize handle — invisible until the
  // cursor is within ~48px of the bottom-right corner.
  const corner = useCornerProximity({ threshold: 48 });
  const showHandle = corner.near || selected === true;

  return (
    <div
      ref={corner.rootRef}
      className="krnl-image-node"
      data-testid="image-node-root"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); corner.onMouseLeave(); }}
      onMouseMove={corner.onMouseMove}
      style={{
        width: '100%',
        height: '100%',
        // overflow visible so the React Flow Handles, which RF positions a few
        // pixels outside the node bounds, don't get clipped on the left/right
        // edges. Inner image-frame clips the actual <img> bytes.
        overflow: 'visible',
        boxSizing: 'border-box',
        position: 'relative',
        boxShadow:
          hover || selected
            ? '0 2px 0 rgba(26,24,20,.04), 0 8px 24px rgba(26,24,20,.10)'
            : '0 1px 0 rgba(26,24,20,.04), 0 2px 6px rgba(26,24,20,.06)',
        borderRadius: 'var(--radius-lg, 10px)',
      }}
    >
      {/* Resize handle — single bottom-right control with the same
          diagonal-stripe glyph AnalyticsNode uses. Shift held during drag
          keeps the aspect ratio locked. */}
      <NodeResizeControl
        position="bottom-right"
        minWidth={120}
        minHeight={80}
        maxWidth={1600}
        maxHeight={1600}
        keepAspectRatio={shiftHeld}
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
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg, 10px)',
          background: hasAsset
            ? 'transparent'
            : 'rgba(255,255,255,0.02)',
          border: hasAsset ? 'none' : '1px dashed var(--paper-3)',
        }}
      >
        {hasAsset ? (
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
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <button
            type="button"
            data-testid="image-node-placeholder"
            onClick={handleReplaceClick}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'transparent',
              border: 'none',
              color: 'var(--ink-3)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              cursor: 'pointer',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            click to pick image
          </button>
        )}

      </div>
    </div>
  );
}

export default ImageNode;
