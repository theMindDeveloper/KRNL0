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
    term.write(data);
  });

  const cleanupExit = krnl.onPtyExit(sid, () => {
    term.write('\r\n[Process exited]\r\n');
    onCommand('term.sessionEnd', { sessionId: sid });
  });

  // F5: xterm input → pty:write
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
