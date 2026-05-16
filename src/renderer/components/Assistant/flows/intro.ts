import type { Flow, FlowStep, BoardSnapshot } from '../types';

export const introFlow: Flow = {
  id: 'intro',
  label: 'Show me around',
  description: 'A quick tour of KRNL0',
  steps: (board: BoardSnapshot): FlowStep[] => {
    const steps: FlowStep[] = [
      { kind: 'speak', clip: 'intro_01', text: 'Welcome to KRNL0. I\'m your system assistant.' },
      { kind: 'wait', ms: 300 },

      // Zoom out so the full canvas is visible
      {
        kind: 'camera',
        x: board.viewport.x,
        y: board.viewport.y,
        zoom: 0.65,
      },
      { kind: 'wait', ms: 500 },

      {
        kind: 'speak',
        clip: 'intro_02',
        text: 'This is your canvas. Tasks, habits, timers, calendars — everything lives here in one infinite workspace.',
      },
      { kind: 'wait', ms: 300 },
    ];

    // Pan to each present mother node so the user can see it as Jen narrates.
    if (board.hasPomo) {
      steps.push({ kind: 'cameraToNode', nodeKind: 'pomo', zoom: 0.9 });
      steps.push({ kind: 'wait', ms: 700 });
    }
    if (board.hasTodo) {
      steps.push({ kind: 'cameraToNode', nodeKind: 'todo', zoom: 0.9 });
      steps.push({ kind: 'wait', ms: 700 });
    }
    if (board.hasCalendar) {
      steps.push({ kind: 'cameraToNode', nodeKind: 'calendar', zoom: 0.85 });
      steps.push({ kind: 'wait', ms: 700 });
    }
    if (board.hasClock) {
      steps.push({ kind: 'cameraToNode', nodeKind: 'clock', zoom: 0.9 });
      steps.push({ kind: 'wait', ms: 700 });
    }

    // Back to a wide view for the rest of the tour
    steps.push({
      kind: 'camera',
      x: board.viewport.x,
      y: board.viewport.y,
      zoom: 0.85,
    });

    steps.push(
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
    );

    return steps;
  },
};
