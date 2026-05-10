/**
 * TextNode — minimal text note card spawnable from the dock.
 * Styling mirrors the frontendref `.node.text` pattern:
 *   width 260px, transparent background, dashed border, pre-wrap content.
 */

import type { NodeProps } from '../types';
import type { TextState, TextConfig } from './types';

export function TextNode({ node }: NodeProps<TextState, TextConfig>) {
  const text = (node.state as TextState).text ?? '';

  return (
    <div
      style={{
        width: 260,
        minHeight: 120,
        background: 'rgba(245,241,232,0.06)',
        border: '1.5px dashed var(--paper-3)',
        borderRadius: 6,
        padding: '12px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        color: 'var(--ink)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      {text || (
        <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>
          empty note...
        </span>
      )}
    </div>
  );
}

export default TextNode;
