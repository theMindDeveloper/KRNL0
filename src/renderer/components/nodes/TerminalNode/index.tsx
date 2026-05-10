import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { NodeProps } from '../types';
import type { TermState, TermConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';

const SLOT_INDEX = 4;

export function TerminalNode({ node, onCommand }: NodeProps<TermState, TermConfig>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
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
        background: '#05040a',
        foreground: '#d4cfc0',
        cursor: '#c9f158',
        cursorAccent: '#0e0d0b',
      },
      cursorBlink: true,
      scrollback: 1000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    termRef.current = term;
    fitRef.current = fit;

    let cancelled = false;

    // Defer initial fit + pty creation until the container has real dimensions.
    // On absolute-positioned nodes, layout may not be measured synchronously.
    const startSession = () => {
      if (cancelled) return;
      try { fit.fit(); } catch { /* container not yet sized */ }
      const cols = term.cols || 80;
      const rows = term.rows || 24;

      // Boot art before pty connects
      term.write('\x1b[38;2;201;241;88m▙ krnl0 · v0.2.0 · claude code attached · tmux session "main"\x1b[0m\r\n');
      term.write('\x1b[2m─────────────────────────────────────────────\x1b[0m\r\n');

      window.krnl?.ptyCreate(cols, rows).then((sid) => {
        if (cancelled) return;
        sessionIdRef.current = sid;
        onCommand('term.sessionStart', { sessionId: sid });

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

        // Focus the terminal so the user can type immediately
        term.focus();
      });
    };

    // Wait one rAF tick for layout, then session-start
    const raf = requestAnimationFrame(startSession);

    const ro = new ResizeObserver(() => {
      try { fitRef.current?.fit(); } catch { /* ignore */ }
      const t = termRef.current;
      const s = sessionIdRef.current;
      if (t && s) window.krnl?.ptyResize(s, t.cols, t.rows);
    });
    ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
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

  const focusTerm = () => termRef.current?.focus();

  return (
    <MotherFrame
      slotIndex={SLOT_INDEX}
      slotTotal={MOTHER_TOTAL}
      width={MOTHER_WIDTH}
      background="var(--term-bg)"
      borderColor={hovered ? 'var(--acid)' : 'var(--paper-3)'}
    >
      <style>{`
        @keyframes term-live-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .term-live-dot { animation: term-live-pulse 1.4s ease-in-out infinite; }
      `}</style>

      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={focusTerm}
        style={{ borderRadius: 5, overflow: 'hidden' }}
      >
        {/* Header */}
        <div
          style={{
            background: 'var(--term-bg-2)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid #2a241c',
          }}
        >
          {/* Traffic lights */}
          <div style={{ display: 'flex', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#c8553d' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#c9a455' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#7ba87b' }} />
          </div>
          {/* Center label */}
          <span
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--term-dim)',
              letterSpacing: '0.04em',
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
              fontSize: 9,
              color: 'var(--term-bg)',
              background: 'var(--acid)',
              padding: '2px 6px',
              borderRadius: 3,
              fontWeight: 600,
              letterSpacing: '0.03em',
            }}
          >
            <span
              className="term-live-dot"
              style={{
                width: 4, height: 4, borderRadius: '50%',
                background: 'var(--term-bg)', flexShrink: 0,
              }}
            />
            LIVE
          </div>
        </div>

        {/* xterm mount — clicking anywhere in here focuses the terminal */}
        <div
          ref={containerRef}
          onPointerDown={(e) => { e.stopPropagation(); focusTerm(); }}
          onClick={(e) => { e.stopPropagation(); focusTerm(); }}
          style={{ width: '100%', height: 280, background: 'var(--term-bg)' }}
        />
      </div>
    </MotherFrame>
  );
}

export default TerminalNode;
