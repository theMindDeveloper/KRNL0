import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { NodeProps } from '../types';
import type { TermState, TermConfig } from './types';

export function TerminalNode({ node, onCommand }: NodeProps<TermState, TermConfig>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // Holds cleanup fns for pty data/exit listeners, set after session is created
  const cleanupDataRef = useRef<(() => void) | null>(null);
  const cleanupExitRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontSize: node.config?.fontSize ?? 13,
      theme: { background: '#0d0d0d', foreground: '#e0e0e0' },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const cols = term.cols;
    const rows = term.rows;

    // Guard against React 18 strict-mode double-mount: if this effect runs
    // cleanup before the promise resolves, we skip wiring and kill the session.
    let cancelled = false;

    window.krnl?.ptyCreate(cols, rows).then((sid) => {
      if (cancelled) {
        // Session was created but we already unmounted; nothing to wire.
        return;
      }

      sessionIdRef.current = sid;
      onCommand('term.sessionStart', { sessionId: sid });

      // Stream pty output → xterm
      cleanupDataRef.current = window.krnl?.onPtyData(sid, (data) => {
        term.write(data);
      }) ?? null;

      cleanupExitRef.current = window.krnl?.onPtyExit(sid, () => {
        term.write('\r\n[Process exited]\r\n');
        onCommand('term.sessionEnd', { sessionId: sid });
      }) ?? null;

      // Stream xterm input → pty
      term.onData((data) => {
        window.krnl?.ptyWrite(sid, data);
      });
    });

    // Resize observer keeps xterm sized to its container
    const ro = new ResizeObserver(() => {
      fitRef.current?.fit();
      const t = termRef.current;
      const s = sessionIdRef.current;
      if (t && s) {
        window.krnl?.ptyResize(s, t.cols, t.rows);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      // Signal the promise to not wire up if it resolves after cleanup
      cancelled = true;

      // Unsubscribe pty data/exit listeners
      cleanupDataRef.current?.();
      cleanupExitRef.current?.();

      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      cleanupDataRef.current = null;
      cleanupExitRef.current = null;
      sessionIdRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        width: 460,
        border: '1px solid #2a241c',
        borderRadius: 'var(--radius-lg)',
        background: '#0d0d0d',
        overflow: 'hidden',
      }}
    >
      {/* macOS-style title bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          background: '#1a1a1a',
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
            color: '#666',
            textTransform: 'uppercase',
          }}
        >
          TERM · SYS
        </span>
      </div>

      {/* xterm.js mount point */}
      <div
        ref={containerRef}
        style={{ width: '100%', minHeight: 200 }}
      />
    </div>
  );
}

export default TerminalNode;
