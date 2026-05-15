export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'running';

// ── Flow step types ────────────────────────────────────────────────────────────

export type FlowStep =
  | { kind: 'speak'; clip: string; text: string }            // play audio clip + caption
  | { kind: 'camera'; x: number; y: number; zoom: number }   // move canvas viewport
  | { kind: 'runCommand'; label: string; argv: string[] }    // show command + run via PTY
  | { kind: 'wait'; ms: number }                             // pause
  // Polls the board snapshot every 500ms until predicate true OR timeout.
  // On timeout, plays the optional speak then continues.
  | {
      kind: 'waitForBoard';
      caption: string;
      predicate: (snap: BoardSnapshot) => boolean;
      timeoutMs: number;
      onTimeout?: { clip: string; text: string };
    }
  // Inline branch — runs onPass or onFail steps based on predicate.
  | {
      kind: 'verify';
      predicate: (snap: BoardSnapshot) => boolean;
      onPass: FlowStep[];
      onFail: FlowStep[];
    };

// ── Flow definition ────────────────────────────────────────────────────────────

export type Flow = {
  id: string;
  label: string;
  description: string;
  /** Optional params from the Commander popup. */
  steps: (board: BoardSnapshot, params?: Record<string, string>) => FlowStep[];
};

// Richer snapshot — drives flow generators AND waitForBoard predicates.
export type BoardSnapshot = {
  nodeCount: number;
  taskCount: number;
  habitCount: number;
  hasPomo: boolean;
  hasTodo: boolean;
  hasCalendar: boolean;
  hasClock: boolean;
  scheduledTaskCount: number;
  chainedTaskCount: number;
  taskTexts: string[];
  firstTaskText: string | null;
  viewport: { x: number; y: number; zoom: number };
};
