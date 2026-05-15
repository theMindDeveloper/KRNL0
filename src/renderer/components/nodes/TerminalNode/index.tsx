import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { NodeProps } from '../types';
import type { TermState, TermConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { HEADER_LABEL, LIVE_BADGE_TEXT } from './constants';
import { startTerminalSession } from './session';
import { MotdBanner } from './MotdBanner';
import pkg from '../../../../../package.json';

export function TerminalNode({ node, onCommand, slotIndex = 4, slotTotal = MOTHER_TOTAL, onReorderDrop, onReorderHover, onReorderEnd, slotCentersX }: NodeProps<TermState, TermConfig>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const copySelection = () => {
    const sel = termRef.current?.getSelection() ?? '';
    if (sel) {
      void window.krnl?.clipboardWriteText(sel);
      termRef.current?.clearSelection();
    }
  };
  const pasteClipboard = async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const text = await window.krnl?.clipboardReadText();
    if (text) void window.krnl?.ptyWrite(sid, text);
  };
  const selectAll = () => termRef.current?.selectAll();

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

    // Issue #73: switch to a GPU-accelerated renderer. The default DOM
    // renderer thrashes layout when running TUI apps like `claude` (heavy
    // ANSI redraws + frequent cursor moves), causing visible lag and lost
    // keystrokes. WebGL is preferred; fall back to 2D canvas if the GL
    // context can't be created. Dynamic import keeps these browser-only
    // modules out of Node/SSR test environments.
    void (async () => {
      try {
        const { WebglAddon } = await import('@xterm/addon-webgl');
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch {
        try {
          const { CanvasAddon } = await import('@xterm/addon-canvas');
          term.loadAddon(new CanvasAddon());
        } catch {
          // last resort: stick with the DOM renderer
        }
      }
      // WebGL/Canvas addons load async via dynamic import. The initial
      // fit() ran on the DOM renderer's cell metrics; after the GPU
      // renderer is in place we have to re-fit so its canvas dimensions
      // match the container — otherwise the bottom of the node renders
      // as an unstyled black gap below the last row. Also force a
      // redraw so the new renderer paints every row immediately.
      try {
        fit.fit();
        term.refresh(0, term.rows - 1);
        const s = sessionIdRef.current;
        if (s) window.krnl?.ptyResize(s, term.cols, term.rows);
      } catch {
        // container not yet sized — the ResizeObserver below will catch it
      }
    })();

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
        setSessionId: (id) => { sessionIdRef.current = id; setActiveSessionId(id); },
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
      nodeId={node.id}
      slotIndex={slotIndex}
      slotTotal={slotTotal}
      width={MOTHER_WIDTH}
      background="var(--term-bg)"
      onReorderDrop={onReorderDrop}
      onReorderHover={onReorderHover}
      onReorderEnd={onReorderEnd}
      slotCentersX={slotCentersX}
    >
      <style>{`
        @keyframes term-live-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        .term-live-dot { animation: term-live-pulse 1.4s ease-in-out infinite; }
        /* Override global body { user-select: none } so the DOM-renderer fallback
           path can natively select text. WebGL/Canvas renderers use xterm's own
           selection logic and ignore this, but it doesn't hurt them. */
        .term-body, .term-body * { user-select: text; -webkit-user-select: text; }
      `}</style>

      <div
        onClick={focusTerm}
        style={{
          borderRadius: 5,
          overflow: 'hidden',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
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

        {/* MOTD banner — rendered as React above xterm so PowerShell/PSReadLine
            can't clear it on startup. See MotdBanner.tsx header for rationale. */}
        <MotdBanner version={pkg.version} sessionId={activeSessionId} />

        {/* xterm mount — nodrag/nopan/nowheel keep RF from consuming pointer
            events. tabIndex=-1 + nodesFocusable={false} on <ReactFlow> stop RF
            from grabbing focus from xterm's internal textarea.

            NO onKeyDownCapture — that runs in the capture phase, BEFORE the
            event reaches xterm's helper textarea, and calling stopPropagation
            there silently kills every special key (Backspace, arrows, Tab,
            Home/End, Ctrl+key combos) because xterm handles those via a
            keydown listener. Printable keys still worked because xterm reads
            those from the `input` event, which capture-phase keydown doesn't
            block. Bubble-phase onKeyDown/onKeyUp below is enough to stop
            React Flow / app-level shortcuts from intercepting our input —
            xterm has already consumed the event by then. (issue #72) */}
        <div
          ref={containerRef}
          tabIndex={-1}
          className="term-body nodrag nopan nowheel"
          // BUBBLE phase, not capture. Capture-phase stopPropagation here kills
          // xterm's own mousedown listener on the screen element (same trap as
          // onKeyDownCapture in issue #72) — and that listener is what starts
          // mouse selection. Bubble runs AFTER xterm has already seen the event,
          // so selection drags start normally while React Flow is still blocked.
          onPointerDown={(e) => {
            if (e.button === 0) { e.stopPropagation(); focusTerm(); }
          }}
          onMouseDown={(e) => {
            if (e.button === 0) { e.stopPropagation(); focusTerm(); }
          }}
          onClick={(e) => { e.stopPropagation(); focusTerm(); }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            // Ctrl+Shift+C → explicit copy (Ctrl+C alone is SIGINT, handled
            // in session.ts attachCustomKeyEventHandler).
            // Paste (Ctrl+V / Ctrl+Shift+V) is also handled in session.ts
            // at the xterm level so xterm doesn't transmit ^V to the pty.
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
              e.preventDefault();
              copySelection();
            }
          }}
          onKeyUp={(e) => e.stopPropagation()}
          style={{ width: '100%', flex: 1, minHeight: 0, background: 'var(--term-bg)', position: 'relative' }}
        />

        {menu && (
          <>
            {/* Click-away blanket */}
            <div
              onClick={() => setMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
              style={{ position: 'fixed', inset: 0, zIndex: 10 }}
            />
            <div
              className="nodrag nopan nowheel"
              style={{
                position: 'absolute',
                left: menu.x,
                top: menu.y + 30 /* offset for header height */,
                zIndex: 11,
                background: 'var(--paper)',
                border: '1px solid var(--ink-3)',
                borderRadius: 4,
                padding: 4,
                minWidth: 140,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              {[
                { label: 'Copy', action: copySelection, disabled: !termRef.current?.getSelection() },
                { label: 'Paste', action: () => void pasteClipboard(), disabled: false },
                { label: 'Select All', action: selectAll, disabled: false },
              ].map((it) => (
                <button
                  key={it.label}
                  type="button"
                  disabled={it.disabled}
                  onClick={(e) => { e.stopPropagation(); it.action(); setMenu(null); focusTerm(); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 10px',
                    background: 'transparent',
                    border: 0,
                    color: it.disabled ? 'var(--ink-3)' : 'var(--ink)',
                    cursor: it.disabled ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    borderRadius: 2,
                  }}
                  onMouseEnter={(e) => {
                    if (!it.disabled) (e.currentTarget as HTMLElement).style.background = 'var(--paper-2)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </MotherFrame>
  );
}

export default TerminalNode;
