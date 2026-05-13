// TerminalNode FSM pure handlers — T20-T23.
// Each returns a DispatchResult so commandDispatch can apply them uniformly.

import type { TermState, TermConfig } from './types';

export interface TermDispatchResult {
  state?: TermState;
  config?: TermConfig;
  /** Side-effect to write to PTY (for term.clear). */
  ptyWrite?: string;
}

/** T20 — record session start */
export function termSessionStart(
  state: TermState,
  args: { sessionId: string },
): TermDispatchResult {
  return { state: { ...state, sessionId: args.sessionId } };
}

/** T20 — record session end */
export function termSessionEnd(
  state: TermState,
  _args: { sessionId: string },
): TermDispatchResult {
  return { state: { ...state, sessionId: null } };
}

/** T21 — update terminal title */
export function termSetTitle(
  state: TermState,
  args: { title: string },
): TermDispatchResult {
  return { state: { ...state, title: args.title } };
}

/** T22 — update font size */
export function termSetFontSize(
  config: TermConfig,
  args: { fontSize: number },
): TermDispatchResult {
  return { config: { ...config, fontSize: args.fontSize } };
}

/** T23 — clear screen via pty write side-effect */
export function termClear(): TermDispatchResult {
  return { ptyWrite: '\x1b[2J\x1b[H' };
}

/** T24 — set shell (persisted to config) */
export function termSetShell(
  config: TermConfig,
  args: { shell: string },
): TermDispatchResult {
  return { config: { ...config, shell: args.shell } };
}
