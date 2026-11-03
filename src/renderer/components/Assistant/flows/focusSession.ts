import type { Flow, FlowStep, BoardSnapshot } from '../types';
import { useBoardStore } from '../../../store/boardStore';
import { isEasyBoard } from '../../../store/uiMode';

export const focusSessionFlow: Flow = {
  id: 'focus-session',
  label: 'Start a focus session',
  description: 'Starts the Pomodoro',
  steps: (board: BoardSnapshot): FlowStep[] => {
    if (!board.hasPomo) {
      return [
        { kind: 'speak', clip: 'focus_01', text: 'Alright. Let\'s lock in.' },
        { kind: 'wait', ms: 300 },
        {
          kind: 'speak',
          clip: 'focus_none',
          text: 'I don\'t see a Pomodoro timer on your board yet. Let me add one.',
        },
        { kind: 'wait', ms: 300 },
        { kind: 'runCommand', label: 'krnl pomo add', argv: ['pomo', 'add'] },
        { kind: 'wait', ms: 600 },
        {
          kind: 'speak',
          clip: 'focus_added',
          text: 'Done. Your timer is ready. Hit start when you are.',
        },
      ];
    }

    // What the start really does: Easy / observe mode tracks time until you
    // stop it; a timed pomo counts down its session length (not always 25).
    const b = useBoardStore.getState().board;
    const pomo = b?.nodes.find((n) => n.kind === 'pomo');
    const cfg = (pomo?.config ?? {}) as { sessionMin?: number; mode?: string };
    const tracking = isEasyBoard(b) || cfg.mode === 'observe';
    const minutes = cfg.sessionMin ?? 25;
    const startLine: FlowStep = tracking
      ? { kind: 'speak', clip: 'focus_02_track', text: "I'm starting the Pomodoro. It tracks your time until you stop it." }
      : minutes === 25
        ? { kind: 'speak', clip: 'focus_02', text: 'I\'m starting a twenty-five minute focus timer.' }
        : { kind: 'speak', clip: 'focus_02_n', text: `I'm starting a ${minutes}-minute focus timer.` };

    return [
      { kind: 'speak', clip: 'focus_01', text: 'Alright. Let\'s lock in.' },
      { kind: 'wait', ms: 300 },

      // Pan to the actual Pomodoro node — resolved at runtime from the board.
      { kind: 'cameraToNode', nodeKind: 'pomo', zoom: 1.0 },

      startLine,
      { kind: 'wait', ms: 300 },

      { kind: 'runCommand', label: 'krnl pomo start', argv: ['pomo', 'start'] },
      { kind: 'wait', ms: 400 },

      {
        kind: 'speak',
        clip: 'focus_03',
        text: 'Close your other tabs. This is your time.',
      },
      // (The old closing line promised a break announcement nothing makes.)
    ];
  },
};
