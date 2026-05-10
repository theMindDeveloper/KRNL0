import { useState, useCallback } from 'react';
import type { NodeProps } from '../types';
import type { TextState, TextConfig } from './types';

export function TextNode({ node, onCommand }: NodeProps<TextState, TextConfig>) {
  const { state, config } = node;
  const [localContent, setLocalContent] = useState(state.content);
  const placeholder = config?.placeholder ?? 'Start writing…';
  const fontSize = state.fontSize ?? 18;

  const handleBlur = useCallback(() => {
    if (localContent !== state.content) {
      onCommand('text.setContent', { content: localContent });
    }
  }, [localContent, state.content, onCommand]);

  return (
    <div
      style={{
        width: 260,
        background: 'transparent',
        border: '1px dashed var(--paper-3)',
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'border-style 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderStyle = 'solid';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-1)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderStyle = 'dashed';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Node header */}
      <div
        style={{
          padding: '7px 12px 4px',
          borderBottom: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-4)', display: 'inline-block' }} />
        <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>Text</span>
      </div>

      {/* Editable text body */}
      <div style={{ padding: '4px 14px 14px' }}>
        <textarea
          value={localContent}
          placeholder={placeholder}
          onChange={(e) => setLocalContent(e.target.value)}
          onBlur={handleBlur}
          style={{
            width: '100%',
            minHeight: 80,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-serif)',
            fontSize,
            lineHeight: 1.35,
            color: 'var(--ink)',
            letterSpacing: '-0.005em',
            padding: 0,
          }}
        />
      </div>
    </div>
  );
}

export default TextNode;
