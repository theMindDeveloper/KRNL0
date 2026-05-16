export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'running';

// ── Flow step types ────────────────────────────────────────────────────────────

export type FlowStep =
  | { kind: 'speak'; clip: string; text: string }            // play audio clip + caption
  | { kind: 'camera'; x: number; y: number; zoom: number }   // move canvas viewport (absolute)
  // Center the camera on a known mother node — position resolved at runtime
  // from the live snapshot, so it follows the node if the user has moved it.
  | {
      kind: 'cameraToNode';
      nodeKind: 'pomo' | 'todo' | 'calendar' | 'clock';
      zoom?: number;
    }
  | { kind: 'runCommand'; label: string; argv: string[] }    // show command + run via PTY
  | { kind: 'wait'; ms: number }                             // pause
  // AmbientRadio remote control — drives the on-screen music widget.
  // The radio listens for matching CustomEvents on the window.
  | { kind: 'radioMoveToCenter' }
  | { kind: 'radioAddLayer';    layer: 'dark'|'rain'|'fire'|'synth'|'white'|'brown'|'yt' }
  | { kind: 'radioRemoveLayer'; layer: 'dark'|'rain'|'fire'|'synth'|'white'|'brown'|'yt' }
  // volume is the YT layer volume 0–100 (defaults to whatever the user has)
  | { kind: 'radioPlayYouTube'; url: string; volume?: number }
  // Stops all audio and closes the radio panel (same as the close button).
  | { kind: 'radioHide' }
  // Snap the radio panel to the right edge — a thin peek remains clickable.
  | { kind: 'radioSnapToEdge' }
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
  // Positions of the four mother nodes when present — used by cameraToNode
  // so the orb can pan to the actual node instead of guessing offsets.
  nodePositions: {
    pomo?: { x: number; y: number };
    todo?: { x: number; y: number };
    calendar?: { x: number; y: number };
    clock?: { x: number; y: number };
  };
};
