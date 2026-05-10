/**
 * ImageNode — placeholder image/ASCII card spawnable from the dock.
 * Styling mirrors the frontendref `.node.image` pattern:
 *   width 240px, framed placeholder.
 */

import type { NodeProps } from '../types';
import type { ImageState, ImageConfig } from './types';

export function ImageNode({ node }: NodeProps<ImageState, ImageConfig>) {
  const { src, alt } = (node.state as ImageState);

  return (
    <div
      style={{
        width: 240,
        minHeight: 180,
        background: 'var(--paper-2)',
        border: '1.5px solid var(--paper-3)',
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? ''}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      ) : (
        <>
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink-4)"
            strokeWidth="1.5"
          >
            <rect x="3" y="4" width="18" height="16" rx="1" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--ink-4)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            image / ascii
          </span>
        </>
      )}
    </div>
  );
}

export default ImageNode;
