import type { Flow, FlowStep, BoardSnapshot } from '../types';

export const whatNextFlow: Flow = {
  id: 'what-next',
  label: 'What should I work on next?',
  description: 'Scans your board and suggests your next task',
  steps: (board: BoardSnapshot): FlowStep[] => {
    if (board.taskCount === 0) {
      return [
        { kind: 'speak', clip: 'work_01', text: 'Let me scan your board.' },
        { kind: 'wait', ms: 600 },
        {
          kind: 'camera',
          x: board.viewport.x,
          y: board.viewport.y,
          zoom: 0.7,
        },
        { kind: 'wait', ms: 800 },
        {
          kind: 'speak',
          clip: 'work_none',
          text: 'Your board looks clear. Nothing open right now. Maybe it\'s time to add something new.',
        },
      ];
    }

    return [
      { kind: 'speak', clip: 'work_01', text: 'Let me scan your board.' },
      { kind: 'wait', ms: 400 },

      // Zoom out to scan
      {
        kind: 'camera',
        x: board.viewport.x,
        y: board.viewport.y,
        zoom: 0.65,
      },
      { kind: 'wait', ms: 900 },

      // Scan right
      {
        kind: 'camera',
        x: board.viewport.x + 300,
        y: board.viewport.y,
        zoom: 0.65,
      },
      { kind: 'wait', ms: 600 },

      // Back to center
      {
        kind: 'camera',
        x: board.viewport.x,
        y: board.viewport.y,
        zoom: 1,
      },

      {
        kind: 'speak',
        clip: 'work_02',
        text: `Alright. I can see your open items — ${board.taskCount} task${board.taskCount !== 1 ? 's' : ''} on the board.`,
      },
      { kind: 'wait', ms: 300 },

      {
        kind: 'speak',
        clip: 'work_03',
        text: board.firstTaskText
          ? `Focus on this one first: "${board.firstTaskText}". It's open and it's been sitting.`
          : 'Based on what\'s here, pick your highest-priority open task and start there.',
      },
      { kind: 'wait', ms: 300 },

      {
        kind: 'speak',
        clip: 'work_04',
        text: 'Once that\'s done, move to the next one in the chain.',
      },
      { kind: 'wait', ms: 200 },

      { kind: 'speak', clip: 'work_05', text: 'You\'ve got this.' },
    ];
  },
};
