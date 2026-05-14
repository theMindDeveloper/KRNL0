// TerminalNode session logic — extracted for unit-testability.
// All side-effects (pty calls, terminal writes) are injected via deps.
// MOTD is now emitted by main via pty:data before the shell prompt renders (T1).

/** Minimal Terminal surface needed by startTerminalSession. */
export interface TermSurface {
  cols: number;
  rows: number;
  write(data: string): void;
  onData(handler: (data: string) => void): { dispose(): void };
  focus(): void;
  // Optional — only the real xterm Terminal exposes these. Tests can omit.
  attachCustomKeyEventHandler?(handler: (event: KeyboardEvent) => boolean): void;
  getSelection?(): string;
  clearSelection?(): void;
  scrollToTop?(): void;
}

/** Minimal FitAddon surface. */
export interface FitSurface {
  fit(): void;
}

/** The krnl preload bridge surface (subset used by the terminal). */
export interface KrnlBridge {
  ptyCreate(cols: number, rows: number): Promise<{ sessionId: string; motd: string }>;
  ptyWrite(sessionId: string, data: string): void | Promise<void>;
  ptyResize(sessionId: string, cols: number, rows: number): void | Promise<void>;
  ptyKill(sessionId: string): void | Promise<void>;
  onPtyData(sessionId: string, callback: (data: string) => void): () => void;
  onPtyExit(sessionId: string, callback: () => void): () => void;
  // Optional in tests — only the production bridge implements clipboard.
  clipboardReadText?(): Promise<string>;
  clipboardWriteText?(text: string): Promise<void>;
}

export interface SessionDeps {
  term: TermSurface;
  fit: FitSurface;
  krnl: KrnlBridge | undefined;
  onCommand: (command: string, args?: Record<string, unknown>) => void;
  /** Set to the created session ID; callers may read this ref for resize. */
  setSessionId: (id: string | null) => void;
  /** Returns true if the session has been cancelled (unmounted). */
  isCancelled: () => boolean;
}

/**
 * Performs the one-time terminal session setup: fit, write boot lines, create pty,
 * wire data/exit handlers, wire input→ptyWrite, focus.
 *
 * Returns a cleanup function that kills the pty and removes listeners.
 * Call this inside a rAF tick after the container has real dimensions.
 */
export async function startTerminalSession(deps: SessionDeps): Promise<() => void> {
  const { term, fit, krnl, onCommand, setSessionId, isCancelled } = deps;

  if (isCancelled()) return () => undefined;

  // Defer fit + size capture until the next animation frame so the container
  // has real dimensions. Without this, term.cols/rows default to 80×24 even
  // when the actual viewport is ~50×14, and main generates a 9-row MOTD that
  // immediately scrolls into scrollback once the shell prompt arrives.
  let fitOk = false;
  try {
    fit.fit();
    fitOk = true;
  } catch {
    // container not yet sized — fall through with conservative defaults
  }

  // Use measured size when fit succeeded; otherwise use a small default that
  // forces renderMotd into its compact one-line form (T5).
  const cols = fitOk && term.cols > 0 ? term.cols : 40;
  const rows = fitOk && term.rows > 0 ? term.rows : 12;

  if (!krnl) return () => undefined;

  // F4: pty:create — returns sessionId (motd is also returned for legacy
  // callers but NOT written to xterm here). The banner now lives in React
  // (MotdBanner.tsx) above the xterm body, because PowerShell + PSReadLine
  // emit screen-clearing escape sequences during init that wipe any
  // pre-written banner. The React banner is outside the shell's reach.
  const { sessionId: sid } = await krnl.ptyCreate(cols, rows);
  void fitOk; // kept for future diagnostic logging
  if (isCancelled()) {
    krnl.ptyKill(sid);
    return () => undefined;
  }

  setSessionId(sid);
  onCommand('term.sessionStart', { sessionId: sid });

  // F5b: pty:data → xterm.write
  const cleanupData = krnl.onPtyData(sid, (data) => {
    term.write(data);
  });

  const cleanupExit = krnl.onPtyExit(sid, () => {
    term.write('\r\n[Process exited]\r\n');
    onCommand('term.sessionEnd', { sessionId: sid });
  });

  // Custom key handling — must use attachCustomKeyEventHandler (not a
  // bubble-phase React onKeyDown) because xterm processes keydown internally
  // before bubbling, and would otherwise transmit the raw control bytes
  // (^C, ^V) to the PTY before we get a chance to suppress them.
  //
  // Ctrl+C:  selection → copy. No selection → send 0x03 (SIGINT/ETX).
  // Ctrl+V / Ctrl+Shift+V: read clipboard, write to PTY (bracketed paste
  //   awareness is left to the shell).
  term.attachCustomKeyEventHandler?.((event) => {
    if (event.type !== 'keydown') return true;
    const mod = event.ctrlKey || event.metaKey;
    if (!mod || event.altKey) return true;

    const k = event.key;

    if (!event.shiftKey && (k === 'c' || k === 'C')) {
      const sel = term.getSelection?.() ?? '';
      if (sel) {
        void krnl.clipboardWriteText?.(sel);
        term.clearSelection?.();
        return false;
      }
      void krnl.ptyWrite(sid, '\x03');
      return false;
    }

    if (k === 'v' || k === 'V') {
      // Prevent xterm from emitting ^V (0x16) to the pty, then paste.
      void (async () => {
        const text = await krnl.clipboardReadText?.();
        if (text) void krnl.ptyWrite(sid, text);
      })();
      return false;
    }

    return true;
  });

  // F5: xterm input → pty:write.
  // Pass keystrokes through unchanged. Backspace = 0x7f (DEL), which is the
  // POSIX/PowerShell convention. cmd.exe wants 0x08; users on cmd.exe must
  // set KRNL0_SHELL explicitly and accept this trade-off (issue #72).
  const { dispose: disposeOnData } = term.onData((data) => {
    krnl.ptyWrite(sid, data);
  });

  // Focus immediately so the user can type
  term.focus();

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    // F4b: pty:kill on unmount
    krnl.ptyKill(sid);
    cleanupData();
    cleanupExit();
    disposeOnData();
    setSessionId(null);
  };
}
