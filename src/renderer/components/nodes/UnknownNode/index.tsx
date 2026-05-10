import type { NodeProps } from '../types';

// Fallback for kinds the renderer does not know about (forward/older boards,
// future plugins). Never throw — a stale board.json must still render.
export function UnknownNode({ node }: NodeProps) {
  return (
    <div
      style={{
        border: '1px dashed var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--node-bg)',
        padding: '12px 14px',
        minWidth: 200,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--ink-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      <div style={{ marginBottom: 4 }}>? UNKNOWN KIND</div>
      <div style={{ fontSize: 10, opacity: 0.8, textTransform: 'none', letterSpacing: 0 }}>
        {node.kind}
      </div>
    </div>
  );
}
