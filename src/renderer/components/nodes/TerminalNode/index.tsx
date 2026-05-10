import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { NodeProps } from '../types';
import type { TermState, TermConfig } from './types';

const SLOT_INDEX = 4;
const SLOT_TOTAL = 4;

const slotTagStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  marginBottom: 6,
  paddingLeft: 2,
};

const cornerStyle = (corner: 'tl' | 'tr' | 'bl' | 'br'): React.CSSProperties => {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 8,
    height: 8,
    opacity: 0.35,
    pointerEvents: 'none',
  };
  if (corner === 'tl') return { ...base, top: -1, left: -1, borderTop: '1px solid var(--ink-3)', borderLeft: '1px solid var(--ink-3)' };
  if (corner === 'tr') return { ...base, top: -1, right: -1, borderTop: '1px solid var(--ink-3)', borderRight: '1px solid var(--ink-3)' };
  if (corner === 'bl') return { ...base, bottom: -1, left: -1, borderBottom: '1px solid var(--ink-3)', borderLeft: '1px solid var(--ink-3)' };
  return { ...base, bottom: -1, right: -1, borderBottom: '1px solid var(--ink-3)', borderRight: '1px solid var(--ink-3)' };
};

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
    term.write('\x1b[38;2;201;241;88m▙ krnl0 · v0.2.0 · claude code attached · tmux session "main"\x1b[0m\r\n');
    term.write('\x1b[2m─────────────────────────────────────────────\x1b[0m\r\n');
    term.write('\r\n');

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
    <div style={{ position: 'relative' }}>
      <style>{`
        @keyframes term-live-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .term-live-dot {
          animation: term-live-pulse 1.4s ease-in-out infinite;
        }
      `}</style>

      {/* Slot tag above the card */}
      <div style={slotTagStyle}>04 · SPINE · 04</div>

      {/* Outer card */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          width: 320,
          background: 'var(--term-bg)',
          border: hovered ? '1px solid var(--acid)' : '1px solid var(--paper-3)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-1)',
          transition: 'border-color 0.15s ease',
        }}
      >
        {/* Corner brackets */}
        <span style={cornerStyle('tl')} />
        <span style={cornerStyle('tr')} />
        <span style={cornerStyle('bl')} />
        <span style={cornerStyle('br')} />

        {/* Header with traffic lights + label + LIVE badge */}
        <div
          style={{
            background: 'var(--term-bg-2)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Traffic lights */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840', display: 'inline-block' }} />
          </div>

          {/* Center label */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--ink-3)',
              letterSpacing: '0.02em',
            }}
          >
            claude-code · ~/krnl0 · zsh
          </span>

          {/* LIVE badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 8.5,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: 'var(--acid)',
              border: '1px solid var(--acid)',
              borderRadius: 3,
              padding: '2px 6px',
              background: 'transparent',
            }}
          >
            <span
              className="term-live-dot"
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'var(--acid)',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            LIVE
          </div>
        </div>

        {/* xterm.js mount point — click anywhere to focus the terminal */}
        <div
          ref={containerRef}
          onPointerDown={(e) => { e.stopPropagation(); termRef.current?.focus(); }}
          onClick={(e) => { e.stopPropagation(); termRef.current?.focus(); }}
          style={{ width: '100%', height: 280, background: 'var(--term-bg)' }}
        />
      </div>
    </div>
  );
}

export default TerminalNode;
