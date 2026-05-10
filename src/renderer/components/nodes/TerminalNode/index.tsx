import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { NodeProps } from '../types';
import type { TermState, TermConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { HEADER_LABEL, LIVE_BADGE_TEXT } from './constants';
import { startTerminalSession } from './session';

export function TerminalNode({ node, onCommand, slotIndex = 4, slotTotal = MOTHER_TOTAL, onMoveLeft, onMoveRight }: NodeProps<TermState, TermConfig>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
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
    let sessionCleanup: (() => void) | null = null;

    // Defer initial fit + pty creation until the container has real dimensions.
    // On absolute-positioned nodes, layout may not be measured synchronously.
    const raf = requestAnimationFrame(() => {
      startTerminalSession({
        term,
        fit,
        krnl: window.krnl,
        onCommand,
        setSessionId: (id) => { sessionIdRef.current = id; },
        isCancelled: () => cancelled,
      }).then((cleanup) => {
        if (cancelled) {
          cleanup();
        } else {
          sessionCleanup = cleanup;
        }
      });
    });

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
      sessionCleanup?.();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      sessionIdRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Defer focus to a microtask so it runs AFTER React Flow's pointer handler
  // (which can otherwise re-claim focus on the canvas). Belt-and-suspenders:
  // also focus the xterm helper textarea directly — under Electron + RF,
  // term.focus() alone sometimes does not actually focus the textarea
  // (regression after the PR #58 revert).
  const focusTerm = () => {
    queueMicrotask(() => {
      termRef.current?.focus();
      const ta = containerRef.current?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea');
      ta?.focus();
    });
  };

  return (
    <MotherFrame
      slotIndex={slotIndex}
      slotTotal={slotTotal}
      width={MOTHER_WIDTH}
      background="var(--term-bg)"
      borderColor={hovered ? 'var(--acid)' : 'var(--paper-3)'}
      onMoveLeft={onMoveLeft}
      onMoveRight={onMoveRight}
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
        {/* Header — .term-head */}
        <div
          className="term-head"
          style={{
            background: 'var(--term-bg-2)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid #2a241c',
          }}
        >
          {/* Traffic lights — .lights */}
          <div className="lights" style={{ display: 'flex', gap: 5 }}>
            <span className="light r" style={{ width: 9, height: 9, borderRadius: '50%', background: '#c8553d', display: 'inline-block' }} />
            <span className="light y" style={{ width: 9, height: 9, borderRadius: '50%', background: '#c9a455', display: 'inline-block' }} />
            <span className="light g" style={{ width: 9, height: 9, borderRadius: '50%', background: '#7ba87b', display: 'inline-block' }} />
          </div>
          {/* Centre label */}
          <span
            className="label"
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--term-dim)',
              letterSpacing: '0.04em',
            }}
          >
            {HEADER_LABEL}
          </span>
          {/* LIVE badge */}
          <div
            className="badge"
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
            {LIVE_BADGE_TEXT}
          </div>
        </div>

        {/* xterm mount — nodrag/nopan/nowheel keep RF from consuming pointer
            events. tabIndex=-1 + nodesFocusable={false} on <ReactFlow> stop RF
            from grabbing focus from xterm's internal textarea. stopPropagation
            on key events stops any bubbled handler from intercepting input. */}
        <div
          ref={containerRef}
          tabIndex={-1}
          className="term-body nodrag nopan nowheel"
          onPointerDownCapture={(e) => { e.stopPropagation(); focusTerm(); }}
          onMouseDownCapture={(e) => { e.stopPropagation(); focusTerm(); }}
          onClick={(e) => { e.stopPropagation(); focusTerm(); }}
          onKeyDownCapture={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          style={{ width: '100%', height: 280, background: 'var(--term-bg)' }}
        />
      </div>
    </MotherFrame>
  );
}

export default TerminalNode;
