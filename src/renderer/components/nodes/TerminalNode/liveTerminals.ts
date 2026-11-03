// Terminals outlive their React component. Switching Station ↔ Canvas,
// hiding the terminal panel or swapping slots unmounts the TerminalNode;
// killing the shell then would drop a running command (or the AI session)
// and all its output. Instead the xterm instance, its DOM host and the PTY
// session stay here, keyed by node id, and the next mount re-attaches them.
// The renderer reloading or closing still ends them: main kills a page's
// shells on navigation / crash (handlers.ts).

import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

export interface LiveTerminal {
  term: Terminal;
  fit: FitAddon;
  /** The element xterm was opened in; moved between mounts. */
  host: HTMLDivElement;
  sessionId: string | null;
  /** A shell has run in this terminal (so "no session" means it exited). */
  everStarted: boolean;
  /** The mounted component's listener for session changes (null while detached). */
  onSession: ((id: string | null) => void) | null;
  /** The mounted component's command handler (session start / end events). */
  onCommand: (command: string, args?: Record<string, unknown>) => void;
  /** The mounted component's saved shell (`krnl term setShell`). */
  shell: () => string | undefined;
}

const live = new Map<string, LiveTerminal>();

export const getLiveTerminal = (nodeId: string): LiveTerminal | undefined => live.get(nodeId);
export const setLiveTerminal = (nodeId: string, t: LiveTerminal): void => { live.set(nodeId, t); };
