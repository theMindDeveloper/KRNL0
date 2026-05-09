import { useEffect, useRef } from 'react';

// TODO (Week 4): embed real xterm.js terminal with node-pty via IPC
// The terminal node is always dark, regardless of the active theme

export function TerminalNode() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // TODO (Week 4): mount Terminal from @xterm/xterm here
    // Connect to main process via IPC for PTY I/O
  }, []);

  return (
    <div
      style={{
        width: 480,
        border: '1px solid #333',
        borderRadius: 'var(--node-radius)',
        background: 'var(--term-bg)',
        overflow: 'hidden',
      }}
    >
      {/* macOS three-light titlebar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e', display: 'block' }} />
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840', display: 'block' }} />
        <span
          style={{
            marginLeft: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#555',
            textTransform: 'uppercase',
          }}
        >
          TERM · SYS
        </span>
      </div>

      {/* Terminal body */}
      <div
        ref={containerRef}
        style={{ padding: '12px', minHeight: 200 }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--acid)',
            lineHeight: 1.6,
          }}
        >
          {/* ASCII boot art */}
          <pre style={{ margin: 0, color: 'var(--acid)' }}>
{`▙ krnl0 v0.1.0
──────────────────
Type 'help' for commands.
`}
          </pre>
          <span style={{ color: '#555' }}>$ </span>
          <span style={{ color: 'var(--acid)' }}>_</span>
        </div>
      </div>
    </div>
  );
}
