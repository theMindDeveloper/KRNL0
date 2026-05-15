import type { Flow, FlowStep, BoardSnapshot } from '../types';

export const summarizeFlow: Flow = {
  id: 'summarize',
  label: 'Summarize my board',
  description: 'Quick overview of everything on your canvas',
  steps: (board: BoardSnapshot): FlowStep[] => {
    const steps: FlowStep[] = [
      { kind: 'speak', clip: 'summary_01', text: 'Here\'s what I see.' },
      { kind: 'wait', ms: 300 },

      // Zoom out for the overview
      {
        kind: 'camera',
        x: board.viewport.x,
        y: board.viewport.y,
        zoom: 0.55,
      },
      { kind: 'wait', ms: 700 },
    ];

    if (board.taskCount > 0) {
      steps.push({
        kind: 'speak',
        clip: 'summary_tasks',
        text: `You have ${board.taskCount} task${board.taskCount !== 1 ? 's' : ''} on the board.`,
      });
      steps.push({ kind: 'wait', ms: 200 });
    }

    if (board.habitCount > 0) {
      steps.push({
        kind: 'speak',
        clip: 'summary_habits',
        text: 'Your habit tracker is running. Keep your streak going today.',
      });
      steps.push({ kind: 'wait', ms: 200 });
    }

    if (board.hasPomo) {
      steps.push({
        kind: 'speak',
        clip: 'summary_pomo',
        text: 'There\'s a Pomodoro timer on the board. Use it to stay in focus blocks.',
      });
      steps.push({ kind: 'wait', ms: 200 });
    }

    if (board.nodeCount === 0) {
      steps.push({
        kind: 'speak',
        clip: 'summary_clean',
        text: 'The board is empty. Clean slate.',
      });
    }

    // Zoom back in
    steps.push({
      kind: 'camera',
      x: board.viewport.x,
      y: board.viewport.y,
      zoom: board.viewport.zoom,
    });

    steps.push({
      kind: 'speak',
      clip: 'summary_done',
      text: 'That\'s the overview. Anything you want to dig into?',
    });

    return steps;
  },
};
