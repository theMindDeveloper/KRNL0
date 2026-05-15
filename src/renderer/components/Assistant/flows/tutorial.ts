import type { Flow, FlowStep, BoardSnapshot } from '../types';

const TASK_1 = 'Review notes';
const TASK_2 = 'Write the draft';
const TASK_3 = 'Send it';

// Helpers — case-insensitive substring check against current task texts.
const hasTaskWith = (snap: BoardSnapshot, needle: string): boolean =>
  snap.taskTexts.some((t) => t.toLowerCase().includes(needle.toLowerCase()));

/**
 * Interactive tutorial — AI asks the user to do things, then verifies.
 * Walks through:
 *   1. Add 3 tasks to the Todo node
 *   2. Chain them (CLI auto-runs once all 3 exist)
 *   3. Drag the head into the calendar
 *   4. Show the cascade on calendar + clock
 *
 * If the user has no Todo / Calendar / Clock node, the flow short-circuits
 * with a friendly message instead of getting stuck.
 */
export const tutorialFlow: Flow = {
  id: 'tutorial-schedule-chain',
  label: 'Tutorial: chain 3 tasks → calendar',
  description: 'Interactive walkthrough — you do, I watch and verify.',
  steps: (board: BoardSnapshot): FlowStep[] => {
    const { viewport: vp } = board;

    // ── Pre-flight: required mother nodes ──────────────────────────────────
    if (!board.hasTodo || !board.hasCalendar) {
      return [
        {
          kind: 'speak',
          clip: 'misc_not_found',
          text: "I need a Todo node and a Calendar node on your board before we can do this. Drop them from the dock first.",
        },
      ];
    }

    return [
      // ── Open ────────────────────────────────────────────────────────────
      { kind: 'speak', clip: 'tut_intro',
        text: "Let's build a tiny project together. Three tasks, chained, dropped on your calendar." },
      { kind: 'wait', ms: 400 },

      // Zoom to a wide view
      { kind: 'camera', x: vp.x, y: vp.y, zoom: 0.7 },
      { kind: 'wait', ms: 600 },

      // ── Step 1: First task ──────────────────────────────────────────────
      { kind: 'speak', clip: 'tut_find_todo',
        text: "First — find your Todo node. It's the green one. Click the plus on it to add a task." },
      { kind: 'wait', ms: 300 },

      { kind: 'speak', clip: 'tut_task_1',
        text: `Type the first one: "${TASK_1}". Then press enter.` },

      {
        kind: 'waitForBoard',
        caption: `waiting for: "${TASK_1}"`,
        predicate: (snap) => hasTaskWith(snap, TASK_1),
        timeoutMs: 60_000,
        onTimeout: { clip: 'tut_skip_ok',
          text: "No worries. We can come back to this." },
      },

      // ── Verify or bail ──────────────────────────────────────────────────
      {
        kind: 'verify',
        predicate: (snap) => hasTaskWith(snap, TASK_1),
        onPass: [
          { kind: 'speak', clip: 'tut_nice', text: "Nice." },
          { kind: 'wait', ms: 300 },

          // ── Step 2 ────────────────────────────────────────────────────
          { kind: 'speak', clip: 'tut_task_2',
            text: `Now another. "${TASK_2}".` },
          {
            kind: 'waitForBoard',
            caption: `waiting for: "${TASK_2}"`,
            predicate: (snap) => hasTaskWith(snap, TASK_2),
            timeoutMs: 60_000,
            onTimeout: { clip: 'tut_skip_ok',
              text: "No worries. We can come back to this." },
          },

          // ── Step 3 ────────────────────────────────────────────────────
          {
            kind: 'verify',
            predicate: (snap) => hasTaskWith(snap, TASK_2),
            onPass: [
              { kind: 'speak', clip: 'tut_nice', text: "Nice." },
              { kind: 'wait', ms: 300 },

              { kind: 'speak', clip: 'tut_task_3',
                text: `One more. "${TASK_3}".` },
              {
                kind: 'waitForBoard',
                caption: `waiting for: "${TASK_3}"`,
                predicate: (snap) => hasTaskWith(snap, TASK_3),
                timeoutMs: 60_000,
                onTimeout: { clip: 'tut_skip_ok',
                  text: "No worries. We can come back to this." },
              },

              // ── Chain ────────────────────────────────────────────────
              {
                kind: 'verify',
                predicate: (snap) =>
                  hasTaskWith(snap, TASK_1) &&
                  hasTaskWith(snap, TASK_2) &&
                  hasTaskWith(snap, TASK_3),
                onPass: [
                  { kind: 'speak', clip: 'tut_chain_now',
                    text: "I'll chain them now. Watch the edges." },
                  { kind: 'wait', ms: 200 },

                  {
                    kind: 'runCommand',
                    label: `krnl task chain "${TASK_1}" "${TASK_2}" "${TASK_3}"`,
                    argv: ['task', 'chain', TASK_1, TASK_2, TASK_3],
                  },
                  { kind: 'wait', ms: 800 },

                  // Verify chain landed
                  {
                    kind: 'verify',
                    predicate: (snap) => snap.chainedTaskCount >= 3,
                    onPass: [
                      { kind: 'speak', clip: 'tut_chain_done',
                        text: "See those flowing edges? The chain is live." },
                      { kind: 'wait', ms: 400 },

                      // ── Drop it ──────────────────────────────────────
                      { kind: 'speak', clip: 'tut_drop_it',
                        text: "Now grab Review notes and drop it on a calendar slot. KRNL0 will auto-place the rest." },
                      {
                        kind: 'waitForBoard',
                        caption: 'waiting for the drop…',
                        predicate: (snap) => snap.scheduledTaskCount >= 1,
                        timeoutMs: 90_000,
                        onTimeout: { clip: 'tut_still_waiting',
                          text: "Still here. Whenever you're ready." },
                      },

                      // Verify cascade triggered
                      {
                        kind: 'verify',
                        predicate: (snap) => snap.scheduledTaskCount >= 1,
                        onPass: [
                          // Pan to the calendar (rough — calendar is usually right-of-center)
                          { kind: 'camera', x: vp.x - 200, y: vp.y, zoom: 0.85 },
                          { kind: 'wait', ms: 700 },

                          { kind: 'speak', clip: 'tut_calendar_look',
                            text: "Look at your calendar. The whole chain landed in sequence." },
                          { kind: 'wait', ms: 500 },

                          // Pan to clock (usually opposite side)
                          { kind: 'camera', x: vp.x + 200, y: vp.y, zoom: 0.9 },
                          { kind: 'wait', ms: 700 },

                          { kind: 'speak', clip: 'tut_clock_look',
                            text: "Your clock shows the active task too." },
                          { kind: 'wait', ms: 500 },

                          { kind: 'camera', x: vp.x, y: vp.y, zoom: 0.75 },

                          { kind: 'speak', clip: 'tut_done',
                            text: "That's a real schedule. Made by you, in thirty seconds." },
                        ],
                        onFail: [
                          { kind: 'speak', clip: 'tut_skip_ok',
                            text: "Looks like nothing got scheduled. Try dragging again when you're ready." },
                        ],
                      },
                    ],
                    onFail: [
                      { kind: 'speak', clip: 'misc_error',
                        text: "Chain didn't land — check the terminal." },
                    ],
                  },
                ],
                onFail: [
                  { kind: 'speak', clip: 'tut_skip_ok',
                    text: "Missing one of the tasks. We can try this again later." },
                ],
              },
            ],
            onFail: [
              { kind: 'speak', clip: 'tut_skip_ok',
                text: "We can come back to this." },
            ],
          },
        ],
        onFail: [
          { kind: 'speak', clip: 'tut_skip_ok',
            text: "No worries. Run me again when you're ready." },
        ],
      },
    ];
  },
};
