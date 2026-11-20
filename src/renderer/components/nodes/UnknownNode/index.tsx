import type { NodeProps } from '../types';

// A window kind this KRNL0 does not know: made by a newer KRNL0 (on another
// computer, or the server's website one version behind), or a future plugin.
// Never throw — the board must still open, and the window's data is kept as it
// is (server-updates F9), so updating KRNL0 shows it again.
export function UnknownNode({ node }: NodeProps) {
  return (
    <div
      data-testid="unknown-node"
      style={{
        border: '1px dashed var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--node-bg)',
        padding: '12px 14px',
        minWidth: 200,
        maxWidth: 260,
        fontFamily: 'var(--font-mono)',
        color: 'var(--ink-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span style={{ fontSize: 12.5 }}>Made in a newer KRNL0</span>
      <span style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.45 }}>
        Update KRNL0 to see it. It stays as it is meanwhile.
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--ink-3)', opacity: 0.7 }}>{node.kind}</span>
    </div>
  );
}
