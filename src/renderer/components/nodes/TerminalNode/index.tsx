import { useEffect, useRef, useState } from 'react';
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

  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontSize: node.config?.fontSize ?? 11.5,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: '#05040a',     // --term-bg dark
        foreground: '#d4cfc0',     // --term-fg
        cursor: '#c9f158',         // --term-acid
        cursorAccent: '#0e0d0b',
      },
      cursorBlink: true,
      scrollback: 1000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    // Boot art — written before shell connects
    term.writeln('\x1b[38;2;201;241;88m▙ krnl0 v0.2.0\x1b[0m');
    term.writeln('\x1b[2mtype \x1b[0mhelp\x1b[2m for commands\x1b[0m');
    term.writeln('');

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 460,
        background: 'var(--term-bg)',
        border: hovered ? '1px solid var(--acid)' : '1px solid var(--paper-3)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-1)',
        transition: 'border-color 0.15s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--term-bg-2)',
          padding: '7px 10px 6px',
          borderBottom: '1px solid rgba(201,241,88,0.12)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--term-acid)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          ▙ TERM
        </span>
      </div>

      {/* xterm.js mount point */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: 280 }}
      />
    </div>
  );
}

export default TerminalNode;
