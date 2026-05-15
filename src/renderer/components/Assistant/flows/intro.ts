import type { Flow, FlowStep, BoardSnapshot } from '../types';

export const introFlow: Flow = {
  id: 'intro',
  label: 'Show me around',
  description: 'A quick tour of KRNL0',
  steps: (board: BoardSnapshot): FlowStep[] => [
    { kind: 'speak', clip: 'intro_01', text: 'Welcome to KRNL0. I\'m your system assistant.' },
    { kind: 'wait', ms: 400 },

    // Zoom out so the full canvas is visible
    {
      kind: 'camera',
      x: board.viewport.x,
      y: board.viewport.y,
      zoom: 0.75,
    },

    {
      kind: 'speak',
      clip: 'intro_02',
      text: 'This is your canvas. Tasks, habits, timers, calendars — everything lives here in one infinite workspace.',
    },
    { kind: 'wait', ms: 300 },

    // Pan right to show more of the canvas
    {
      kind: 'camera',
      x: board.viewport.x + 200,
      y: board.viewport.y,
      zoom: 0.75,
    },
    { kind: 'wait', ms: 600 },

    // Pan back to center
    {
      kind: 'camera',
      x: board.viewport.x,
      y: board.viewport.y,
      zoom: 1,
    },

    {
      kind: 'speak',
      clip: 'intro_03',
      text: 'Pan by middle-clicking and dragging. Pinch to zoom. Arrange it however your brain works.',
    },
    { kind: 'wait', ms: 300 },

    {
      kind: 'speak',
      clip: 'intro_04',
      text: 'The dock on the left drops new nodes onto the canvas. Or right-click anywhere for a quick menu.',
    },
    { kind: 'wait', ms: 300 },

    {
      kind: 'speak',
      clip: 'intro_05',
      text: 'You can also control everything from your terminal. Just type krnl and the command.',
    },
    { kind: 'wait', ms: 300 },

    {
      kind: 'speak',
      clip: 'intro_06',
      text: 'Down here in the corner — that\'s me. Click me anytime, or hold Space to talk.',
    },
    { kind: 'wait', ms: 300 },

    {
      kind: 'speak',
      clip: 'intro_07',
      text: 'Pick something from the menu and I\'ll walk you through it.',
    },
  ],
};
