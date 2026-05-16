import type { Flow, FlowStep, BoardSnapshot } from '../types';

export const focusSessionFlow: Flow = {
  id: 'focus-session',
  label: 'Start a focus session',
  description: 'Fires up a 25-minute Pomodoro timer',
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

    return [
      { kind: 'speak', clip: 'focus_01', text: 'Alright. Let\'s lock in.' },
      { kind: 'wait', ms: 300 },

      // Pan to the actual Pomodoro node — resolved at runtime from the board.
      { kind: 'cameraToNode', nodeKind: 'pomo', zoom: 1.0 },

      {
        kind: 'speak',
        clip: 'focus_02',
        text: 'I\'m starting a twenty-five minute focus timer.',
      },
      { kind: 'wait', ms: 300 },

      { kind: 'runCommand', label: 'krnl pomo start', argv: ['pomo', 'start'] },
      { kind: 'wait', ms: 400 },

      {
        kind: 'speak',
        clip: 'focus_03',
        text: 'Close your other tabs. This is your time.',
      },
      { kind: 'wait', ms: 300 },

      {
        kind: 'speak',
        clip: 'focus_04',
        text: 'The timer is running. I\'ll let you know when the break kicks in.',
      },
    ];
  },
};
