import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { NodeProps } from '../types';
import type { TermState, TermConfig } from './types';
import { MotherFrame, MOTHER_WIDTH, MOTHER_TOTAL } from '../MotherFrame';
import { HEADER_LABEL, LIVE_BADGE_TEXT, TERM_CLEAR_EVENT } from './constants';
import { startTerminalSession } from './session';
import { getLiveTerminal, setLiveTerminal, type LiveTerminal } from './liveTerminals';
import { fitAndSyncPty } from './fitGuard';
import { MotdBanner } from './MotdBanner';
import { ContextMenu } from '../../ContextMenu';
import pkg from '../../../../../package.json';
import { useFrameTheme } from '../../../themes/useFrameTheme';
import { xtermFor } from '../../../themes/applyFrameTheme';

export function TerminalNode({ node, onCommand, slotIndex = 4, slotTotal = MOTHER_TOTAL }: NodeProps<TermState, TermConfig>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // The live terminal this mount shows (null while detached).
  const liveRef = useRef<LiveTerminal | null>(null);

  // The one way this component sizes xterm and the PTY (#200): fit only a
  // container big enough to be real, resize the PTY only when its size changed.
  const syncSize = () => {
    const live = liveRef.current;
    if (!live) return;
    live.ptySize = fitAndSyncPty({
      fit: live.fit,
      term: live.term,
      sessionId: live.sessionId,
      last: live.ptySize,
      resize: (id, cols, rows) => { void window.krnl?.ptyResize(id, cols, rows); },
    });
  };

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // The shell ran and is gone (exit / crash): the badge says so until Enter
  // starts a new one (session.ts).
  const hadSessionRef = useRef(false);
  const ended = activeSessionId === null && hadSessionRef.current;
  // xterm colours come from the frame-style manifest and follow live switches (ADR 0009 F8).
  const { style: frameStyle, mode: frameMode } = useFrameTheme();
  const xtermColors = xtermFor(frameStyle, frameMode);
  const xtermColorsRef = useRef(xtermColors);
  xtermColorsRef.current = xtermColors;
  useEffect(() => {
    if (termRef.current && xtermColors) termRef.current.options.theme = { ...xtermColors };
  }, [xtermColors]);

  // `krnl term setFontSize` — apply live, then refit so the PTY gets the new cols/rows.
  const fontSize = node.config?.fontSize;
  const shellRef = useRef(node.config?.shell);
  shellRef.current = node.config?.shell;
  useEffect(() => {
    const t = termRef.current;
    if (!t || fontSize === undefined || t.options.fontSize === fontSize) return;
    t.options.fontSize = fontSize;
    syncSize();
  }, [fontSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Height of the column that holds banner + xterm: a short panel gets the
  // one-line banner, not the 9-row logo. Measured on the column (not the
  // xterm body) so the banner switching size can't feed back into it.
  const [bodyHeightPx, setBodyHeightPx] = useState<number | undefined>(undefined);
  useEffect(() => {
    const column = containerRef.current?.parentElement;
    if (!column || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setBodyHeightPx(Math.round(h));
    });
    ro.observe(column);
    return () => ro.disconnect();
  }, []);

  // `krnl term clear` — clears the screen and scrollback of this terminal.
  useEffect(() => {
    const onClear = (e: Event) => {
      const id = (e as CustomEvent<{ nodeId?: string }>).detail?.nodeId;
      if (id && id !== node.id) return;
      termRef.current?.clear();
    };
    window.addEventListener(TERM_CLEAR_EVENT, onClear);
    return () => window.removeEventListener(TERM_CLEAR_EVENT, onClear);
  }, [node.id]);

  // `krnl term setTitle` — a custom title replaces the default header label.
  const customTitle = node.state?.title;
  const headerLabel = customTitle && customTitle !== 'Terminal' ? customTitle : HEADER_LABEL;

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
    if (!text) return;
    // xterm's paste (bracketed when the shell wants it), as Ctrl+V does.
    const t = termRef.current;
    if (t) t.paste(text);
    else void window.krnl?.ptyWrite(sid, text);
  };
  const selectAll = () => termRef.current?.selectAll();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Session changes reach whichever component is mounted right now.
    // No fit here: this also runs while the panel is still mid-layout (a few
    // pixels wide), which fitted the PTY to 2 columns (#200). Resizes during
    // the spawn were dropped (no id yet), so catch up on the next frame.
    let bindRaf = 0;
    const bindSession = (id: string | null) => {
      sessionIdRef.current = id;
      if (id) {
        hadSessionRef.current = true;
        cancelAnimationFrame(bindRaf);
        bindRaf = requestAnimationFrame(syncSize);
      }
      setActiveSessionId(id);
    };

    let entry = getLiveTerminal(node.id);
    let reattachRaf = 0;
    if (entry) {
      // Remount (layout switch, panel shown again, slot swap): the same shell
      // and scrollback come back — re-attach and refit to the new size.
      container.appendChild(entry.host);
      const e = entry;
      reattachRaf = requestAnimationFrame(() => {
        syncSize();
        e.term.refresh(0, e.term.rows - 1);
      });
    } else {
      const term = new Terminal({
        fontSize: node.config?.fontSize ?? 11.5,
        fontFamily: "'JetBrains Mono', monospace",
        theme: { ...(xtermColorsRef.current ?? {
          background: '#05040a',
          foreground: '#d4cfc0',
          cursor: '#c9f158',
          cursorAccent: '#0e0d0b',
        }) },
        cursorBlink: true,
        scrollback: 5000,
        // No smoothScrollDuration — the animation feels heavy on macOS
        // trackpads because each flick queues an easing tail that delays the
        // next gesture's response. Instant jumps match iTerm2 / Ghostty.
        // Larger per-tick line counts make a small two-finger swipe move the
        // buffer visibly (1 = stock = sluggish for trackpads, 3 = snappy).
        scrollSensitivity: 3,
        fastScrollSensitivity: 8,
        allowProposedApi: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      const host = document.createElement('div');
      host.style.width = '100%';
      host.style.height = '100%';
      container.appendChild(host);
      const e: LiveTerminal = { term, fit, host, sessionId: null, ptySize: null, everStarted: false, onSession: null, onCommand, shell: () => undefined };
      setLiveTerminal(node.id, e);
      entry = e;

      // Renderer choice. The DOM renderer thrashes layout under heavy TUI
      // ANSI traffic so we want a GPU-backed renderer (issue #73). The
      // earlier implementation loaded WebGL *after* term.open() and *after*
      // the initial fit(), which introduced a cols/rows drift that broke
      // TUIs:
      //
      //   1. DOM-renderer fit measures the container → cols = N₁
      //   2. PTY is spawned at cols = N₁
      //   3. WebGL addon loads ~50-100ms later, re-fits against subtly
      //      different WebGL cell metrics → cols = N₂
      //   4. ptyResize is sent. PTY now thinks cols = N₂. claude reads N₂
      //      from TIOCGWINSZ and renders assuming N₂ columns.
      //   5. Visible xterm rendering drifts a column away from what claude
      //      writes — text wraps in the middle of words ("specifically
      //      running" → "running\ns Claude"), input boxes shift, table
      //      borders collapse. (User report 2026-05-17.)
      //
      // Fix: load the renderer addon *before* term.open() and *before*
      // startTerminalSession's first fit + ptyCreate runs. One measure, one
      // PTY spawn, no drift. We use dynamic import (kept jsdom-safe — these
      // modules touch `self` at module-load and crash in node test envs) and
      // gate term.open() + session start behind the same async boundary.
      //
      // Canvas renderer is the default — fast enough for TUIs, stable under
      // Electron's BrowserView paint pipeline, avoids GL-context lifetime
      // issues when nodes go offscreen. WebGL was the prior choice but its
      // async load created the cols/rows drift this commit fixes; if it's
      // ever re-introduced as an opt-in, do it via a preload bridge flag
      // (window.krnl.config), NOT process.env — `process` is undefined in
      // the renderer context and crashes the init promise (user report
      // 2026-05-17: "process is not defined", terminal renders as black).

      const init = async () => {
        try {
          const { CanvasAddon } = await import('@xterm/addon-canvas');
          term.loadAddon(new CanvasAddon());
        } catch { /* fall through to DOM */ }
        term.open(host);
        await startTerminalSession({
          term,
          fit,
          krnl: window.krnl,
          onCommand: (command, args) => e.onCommand(command, args),
          setSessionId: (id, size) => {
            e.sessionId = id;
            e.ptySize = id && size ? { sessionId: id, ...size } : null;
            if (id) e.everStarted = true;
            e.onSession?.(id);
          },
          // The session belongs to the board, not to this mount.
          isCancelled: () => false,
          // Read at every start, so `krnl term setShell` applies to the next shell.
          shell: () => e.shell(),
        });
      };
      // Defer the renderer-load → open → session-start sequence to the next
      // animation frame so the container has real dimensions before the
      // first fit() runs. Not cancelled on unmount: under StrictMode the
      // remount has re-attached the host by the time this fires.
      requestAnimationFrame(() => { void init(); });
    }

    const live = entry;
    // EXITED survives a remount: the badge reads the terminal, not this mount.
    hadSessionRef.current = live.everStarted;
    setActiveSessionId(live.sessionId);
    live.onSession = bindSession;
    live.onCommand = onCommand;
    live.shell = () => shellRef.current;
    liveRef.current = live;
    termRef.current = live.term;
    // Theme / font changes made while detached (those effects ran first).
    if (xtermColorsRef.current) live.term.options.theme = { ...xtermColorsRef.current };
    const size = node.config?.fontSize;
    if (size !== undefined && live.term.options.fontSize !== size) live.term.options.fontSize = size;
    if (live.sessionId) bindSession(live.sessionId);

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(container);

    return () => {
      cancelAnimationFrame(reattachRaf);
      cancelAnimationFrame(bindRaf);
      ro.disconnect();
      // Detach, don't kill: the next mount picks the terminal up again.
      if (live.onSession === bindSession) live.onSession = null;
      // Only if it is still here: an overlapping newer mount may own it now.
      if (live.host.parentElement === container) live.host.remove();
      liveRef.current = null;
      termRef.current = null;
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
      position={node.position}
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
          className="term-head krnl-node-header"
          style={{
            background: 'var(--term-bg-2)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid var(--k-term-border, #2a241c)',
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
            {headerLabel}
          </span>
          {/* LIVE badge */}
          <div
            className="badge"
            data-testid="term-badge"
            title={ended ? 'The shell exited — press Enter in the terminal to start a new one' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              // The terminal is dark in every theme: use the accent that stays
              // light on dark (Macintosh light's --acid is near-black).
              color: ended ? 'var(--ink-3)' : 'var(--term-bg)',
              background: ended ? 'transparent' : 'var(--accent-on-dark)',
              border: ended ? '1px solid var(--ink-4)' : '1px solid transparent',
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
                display: ended ? 'none' : undefined,
              }}
            />
            {ended ? 'EXITED' : LIVE_BADGE_TEXT}
          </div>
        </div>

        {/* MOTD banner — rendered as React above xterm so PowerShell/PSReadLine
            can't clear it on startup. See MotdBanner.tsx header for rationale. */}
        <MotdBanner version={pkg.version} sessionId={activeSessionId} {...(bodyHeightPx !== undefined ? { bodyHeightPx } : {})} />

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
            setMenu({ x: e.clientX, y: e.clientY });
          }}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Shift+L is the app's layout toggle: let it reach the
            // window (session.ts keeps it away from the shell).
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) return;
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

        {/* The app's shared menu: portalled to <body> (MotherFrame's
            containment trapped the old click-away blanket) and kept inside
            the window, so a narrow Station panel can't clip it. */}
        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            onDismiss={() => setMenu(null)}
            items={[
              { label: 'Copy', onSelect: () => { copySelection(); focusTerm(); }, disabled: !termRef.current?.getSelection() },
              { label: 'Paste', onSelect: () => { void pasteClipboard(); focusTerm(); } },
              { label: 'Select All', onSelect: () => { selectAll(); focusTerm(); } },
            ]}
          />
        )}
      </div>
    </MotherFrame>
  );
}

export default TerminalNode;
