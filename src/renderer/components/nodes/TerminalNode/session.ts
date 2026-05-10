// TerminalNode session logic — extracted for unit-testability.
// All side-effects (pty calls, terminal writes) are injected via deps.

import { BOOT_LINE_ASCII, BOOT_LINE_SEPARATOR } from './constants';

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
}

/** Minimal FitAddon surface. */
export interface FitSurface {
  fit(): void;
}

/** The krnl preload bridge surface (subset used by the terminal). */
export interface KrnlBridge {
  ptyCreate(cols: number, rows: number): Promise<string>;
  ptyWrite(sessionId: string, data: string): void | Promise<void>;
  ptyResize(sessionId: string, cols: number, rows: number): void | Promise<void>;
  ptyKill(sessionId: string): void | Promise<void>;
  onPtyData(sessionId: string, callback: (data: string) => void): () => void;
  onPtyExit(sessionId: string, callback: () => void): () => void;
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

  try {
    fit.fit();
  } catch {
    // container not yet sized — ignore
  }

  const cols = term.cols || 80;
  const rows = term.rows || 24;

  // F2: write boot lines
  term.write(BOOT_LINE_ASCII);
  term.write(BOOT_LINE_SEPARATOR);

  if (!krnl) return () => undefined;

  // F4: pty:create
  const sid = await krnl.ptyCreate(cols, rows);
  if (isCancelled()) {
    krnl.ptyKill(sid);
    return () => undefined;
  }

  setSessionId(sid);
  onCommand('term.sessionStart', { sessionId: sid });

  // F5b: pty:data → xterm.write
  const cleanupData = krnl.onPtyData(sid, (data) => {
    // DEBUG #72 — log shell→renderer traffic so we can diagnose Backspace
    // behavior. Remove once issue #72 is resolved.
    // eslint-disable-next-line no-console
    console.log('[KRNL0 ←pty]', JSON.stringify(data).slice(0, 200));
    term.write(data);
  });

  const cleanupExit = krnl.onPtyExit(sid, () => {
    term.write('\r\n[Process exited]\r\n');
    onCommand('term.sessionEnd', { sessionId: sid });
  });

  // Issue #75: Ctrl+C must always reach the PTY. With a selection, copy to
  // clipboard. Without a selection, send 0x03 (SIGINT/ETX) so the running
  // process is interrupted. We do this via attachCustomKeyEventHandler so
  // we don't rely on xterm's variable default behaviour, which can drop
  // 0x03 under Electron when the helper textarea loses focus mid-press.
  term.attachCustomKeyEventHandler?.((event) => {
    if (event.type !== 'keydown') return true;
    const isCtrlC =
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      !event.altKey &&
      (event.key === 'c' || event.key === 'C');
    if (!isCtrlC) return true;

    const sel = term.getSelection?.() ?? '';
    if (sel) {
      // Copy and let the PTY keep running.
      try { void navigator.clipboard.writeText(sel); } catch { /* ignore */ }
      term.clearSelection?.();
      return false;
    }
    // No selection — interrupt the running process.
    void krnl.ptyWrite(sid, '\x03');
    return false;
  });

  // F5: xterm input → pty:write.
  // Pass keystrokes through unchanged. Backspace = 0x7f (DEL), which is the
  // POSIX/PowerShell convention. cmd.exe wants 0x08; users on cmd.exe must
  // set KRNL0_SHELL explicitly and accept this trade-off (issue #72).
  const { dispose: disposeOnData } = term.onData((data) => {
    // DEBUG #72 — log every byte the renderer is sending to the PTY so we
    // can diagnose Backspace. Each char is logged as a hex code. Remove
    // once issue #72 is resolved.
    // eslint-disable-next-line no-console
    console.log(
      '[KRNL0 →pty]',
      JSON.stringify(data),
      [...data].map((c) => '0x' + c.charCodeAt(0).toString(16)).join(' '),
    );
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
