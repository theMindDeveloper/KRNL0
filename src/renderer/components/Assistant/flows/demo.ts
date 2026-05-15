import type { Flow, FlowStep, BoardSnapshot } from '../types';

/**
 * Full POC demo — ~90 seconds.
 * Narrates the whole canvas, runs real krnl commands, pans the camera,
 * and demonstrates the voice assistant end-to-end.
 */
export const demoFlow: Flow = {
  id: 'demo',
  label: 'Show me everything',
  description: 'Full walkthrough — canvas, commands, voice, all of it',
  steps: (board: BoardSnapshot): FlowStep[] => {
    const { viewport: vp } = board;

    // Compute world-space center visible at the current viewport.
    // viewport.x/y are canvas-to-screen translation offsets.
    // world = (screen - translate) / zoom; use half of a typical 1280×800 window.
    const worldCenterX = Math.round((640 - vp.x) / vp.zoom);
    const worldCenterY = Math.round((400 - vp.y) / vp.zoom);

    // Text node position — offset right and down from center so it's clearly visible.
    const textX = worldCenterX + 320;
    const textY = worldCenterY - 80;

    // Camera position that shows the text node near center-left of screen.
    // screen_x = world * zoom + tx  →  tx = screen_x - world * zoom
    // We want world textX at screen 320px → tx = 320 - textX * 1
    const camToTextX = 320 - textX;
    const camToTextY = 300 - textY;

    return [
      // ── Act 1: Welcome & orient ────────────────────────────────────────────
      {
        kind: 'speak',
        clip: 'intro_01',
        text: "Welcome to KRNL0. I'm your system assistant.",
      },
      { kind: 'wait', ms: 300 },

      // Zoom out so the full board is visible
      { kind: 'camera', x: vp.x + 120, y: vp.y + 60, zoom: 0.6 },
      { kind: 'wait', ms: 700 },

      {
        kind: 'speak',
        clip: 'intro_02',
        text: "This is your canvas. Tasks, habits, timers, calendars — all in one infinite workspace.",
      },
      { kind: 'wait', ms: 200 },

      // Slow pan left across the board
      { kind: 'camera', x: vp.x - 200, y: vp.y, zoom: 0.6 },
      { kind: 'wait', ms: 900 },

      // Pan right
      { kind: 'camera', x: vp.x + 400, y: vp.y, zoom: 0.6 },
      { kind: 'wait', ms: 900 },

      // Back to center
      { kind: 'camera', x: vp.x, y: vp.y, zoom: 0.75 },

      {
        kind: 'speak',
        clip: 'intro_03',
        text: "Pan around, zoom in and out, arrange it however your brain works.",
      },
      { kind: 'wait', ms: 400 },

      // ── Act 2: Show the dock ───────────────────────────────────────────────
      { kind: 'camera', x: vp.x - 100, y: vp.y, zoom: 0.85 },
      { kind: 'wait', ms: 400 },

      {
        kind: 'speak',
        clip: 'intro_04',
        text: "The dock on the left drops new nodes onto the canvas. Right-click anywhere for a quick menu.",
      },
      { kind: 'wait', ms: 300 },

      // ── Act 3: Scan the board ──────────────────────────────────────────────
      { kind: 'camera', x: vp.x, y: vp.y, zoom: 0.65 },
      { kind: 'wait', ms: 300 },

      {
        kind: 'speak',
        clip: 'work_01',
        text: "Let me scan your board.",
      },
      { kind: 'wait', ms: 400 },

      // Wide scan — down-right
      { kind: 'camera', x: vp.x + 300, y: vp.y + 200, zoom: 0.55 },
      { kind: 'wait', ms: 1000 },

      // Scan up-left
      { kind: 'camera', x: vp.x - 200, y: vp.y - 100, zoom: 0.55 },
      { kind: 'wait', ms: 1000 },

      // Return to center
      { kind: 'camera', x: vp.x, y: vp.y, zoom: 0.75 },

      {
        kind: 'speak',
        clip: 'summary_01',
        text: "Here's what I see.",
      },
      { kind: 'wait', ms: 300 },

      ...(board.taskCount > 0
        ? ([
            {
              kind: 'speak',
              clip: 'summary_tasks',
              text: `You have open tasks on the board.`,
            } as FlowStep,
            { kind: 'wait', ms: 200 } as FlowStep,
          ])
        : []),

      ...(board.habitCount > 0
        ? ([
            {
              kind: 'speak',
              clip: 'summary_habits',
              text: "Your habit tracker is running. Keep your streak going today.",
            } as FlowStep,
            { kind: 'wait', ms: 200 } as FlowStep,
          ])
        : []),

      // ── Act 4: Run krnl commands live ─────────────────────────────────────
      {
        kind: 'speak',
        clip: 'misc_thinking',
        text: "Let me check that.",
      },
      { kind: 'wait', ms: 300 },

      { kind: 'camera', x: vp.x, y: vp.y, zoom: 1.1 },

      // Board overview command
      {
        kind: 'runCommand',
        label: 'krnl board show',
        argv: ['board', 'show'],
      },
      { kind: 'wait', ms: 600 },

      // Create a text node at the current camera center — visible immediately.
      {
        kind: 'runCommand',
        label: `krnl text add "KRNL0 is alive." --at ${textX},${textY}`,
        argv: ['text', 'add', 'KRNL0 is alive.', '--at', `${textX},${textY}`],
      },
      // Let board:changed propagate to the renderer before moving the camera.
      { kind: 'wait', ms: 800 },

      // Move camera so the new text node is visible center-left.
      { kind: 'camera', x: camToTextX, y: camToTextY, zoom: 1.2 },
      { kind: 'wait', ms: 700 },

      // Pan back to canvas center.
      { kind: 'camera', x: vp.x, y: vp.y, zoom: 0.9 },
      { kind: 'wait', ms: 500 },

      // ── Act 5: Pomo ────────────────────────────────────────────────────────
      ...(board.hasPomo
        ? ([
            {
              kind: 'speak',
              clip: 'focus_01',
              text: "Alright. Let's lock in.",
            } as FlowStep,
            { kind: 'wait', ms: 200 } as FlowStep,
            {
              kind: 'speak',
              clip: 'focus_02',
              text: "I'm starting a twenty-five minute focus timer.",
            } as FlowStep,
            {
              kind: 'runCommand',
              label: 'krnl pomo start',
              argv: ['pomo', 'start'],
            } as FlowStep,
            // Board reloads, then pomo node shows as running.
            { kind: 'wait', ms: 800 } as FlowStep,
            {
              kind: 'speak',
              clip: 'focus_04',
              text: "The timer is running. I'll let you know when the break kicks in.",
            } as FlowStep,
            { kind: 'wait', ms: 300 } as FlowStep,
          ])
        : []),

      // ── Act 6: Hand back ───────────────────────────────────────────────────
      { kind: 'camera', x: vp.x, y: vp.y, zoom: 0.7 },
      { kind: 'wait', ms: 500 },

      {
        kind: 'speak',
        clip: 'work_05',
        text: "You've got this.",
      },
      { kind: 'wait', ms: 300 },

      { kind: 'camera', x: vp.x, y: vp.y, zoom: 1 },

      {
        kind: 'speak',
        clip: 'intro_07',
        text: "Pick something from the menu and I'll walk you through it.",
      },
      { kind: 'wait', ms: 200 },

      {
        kind: 'speak',
        clip: 'misc_bye',
        text: "Got it. I'm here if you need me.",
      },
    ];
  },
};
