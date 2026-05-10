import type { NodeProps } from '../types';
import type { ImageState, ImageConfig } from './types';

export function ImageNode({ node }: NodeProps<ImageState, ImageConfig>) {
  const { state, config } = node;
  const fit = config?.fit ?? 'cover';
  const isAscii = state.src.startsWith('ascii:');
  const asciiContent = isAscii ? state.src.slice(6) : null;

  return (
    <div
      style={{
        width: 240,
        background: 'var(--node-bg)',
        border: '1px solid var(--paper-3)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(26,24,20,0.06)',
      }}
    >
      {/* Image frame */}
      <div
        style={{
          width: '100%',
          height: 160,
          background: 'linear-gradient(135deg, #2a3441 0%, #1a2030 60%, #0f1420 100%)',
          position: 'relative',
          overflow: 'hidden',
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
        }}
      >
        {isAscii ? (
          <div
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
            {asciiContent}
          </div>
        ) : state.src ? (
          <img
            src={state.src}
            alt={state.alt ?? ''}
            style={{
              width: '100%',
              height: '100%',
              objectFit: fit,
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--ink-4)',
              letterSpacing: '0.04em',
            }}
          >
            no image
          </div>
        )}
      </div>

      {/* Caption bar */}
      <div
        style={{
          padding: '8px 12px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          color: 'var(--ink-3)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: 'var(--ink-2)' }}>
          {state.caption || state.alt || 'untitled'}
        </span>
        <span style={{ color: 'var(--ink-4)' }}>img</span>
      </div>
    </div>
  );
}

export default ImageNode;
