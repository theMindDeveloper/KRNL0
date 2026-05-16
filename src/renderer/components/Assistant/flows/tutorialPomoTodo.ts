import type { Flow, FlowStep, BoardSnapshot } from '../types';

// Tutorial 1 — Pomodoro & Tasks.
// Walks the user through: Pomo settings → first task → bind to Pomo →
// second task → chain → drag to calendar → bonus parallel task.
// Each step plays a recorded ElevenLabs clip and waits for the user's action
// where verifiable.

const TASK_1 = 'learn machine learning';
const TASK_2 = 'go for a walk';
const TASK_3 = 'listen to music';

// The bait — rickroll, full volume.
const RICKROLL_YT_URL =
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1';

// The real background music — kept moderate so Jen stays audible.
const TUTORIAL_YT_URL = 'https://www.youtube.com/watch?v=tCfSt1TWVn4';
const TUTORIAL_YT_VOLUME = 75;

const hasTaskWith = (snap: BoardSnapshot, needle: string): boolean =>
  snap.taskTexts.some((t) => t.toLowerCase().includes(needle.toLowerCase()));

const onTimeoutWait = {
  clip: 'tut1_wait_still_here',
  text: "Still here whenever you're ready.",
};

export const tutorialPomoTodoFlow: Flow = {
  id: 'tutorial-pomo-todo',
  label: 'Tutorial: Pomodoro & Tasks',
  description: 'Pomodoro, tasks, chain, calendar, clock — the whole flow.',
  steps: (board: BoardSnapshot): FlowStep[] => {
    if (!board.hasPomo || !board.hasTodo || !board.hasCalendar || !board.hasClock) {
      return [
        {
          kind: 'speak',
          clip: 'misc_not_found',
          text: 'I need Pomodoro, Todo, Calendar, and Clock nodes on your board for this tutorial. Drop them from the dock first.',
        },
      ];
    }

    return [
      // ── Cold open: music choreography ─────────────────────────────────────
      { kind: 'speak', clip: 'tut1_00a', text: 'Hey — I know tutorials are boring.' },
      { kind: 'speak', clip: 'tut1_00b', text: "I'll try to make this one less painful." },
      { kind: 'wait', ms: 300 },

      { kind: 'speak', clip: 'tut1_00c', text: "Let's put on some music first." },
      { kind: 'radioMoveToCenter' },
      // Longer pre-roll — gives the YT IFrame API time to download
      // before we try to mount a player.
      { kind: 'wait', ms: 2500 },

      // The bait — play the rickroll at the user's current YT volume
      { kind: 'radioPlayYouTube', url: RICKROLL_YT_URL },
      // Short dwell — long enough for the user to register what's playing,
      // not so long that the joke overstays its welcome.
      { kind: 'wait', ms: 2800 },

      // Jen catches herself
      { kind: 'speak', clip: 'tut1_00d', text: 'Nah — not this. Sorry.' },
      { kind: 'wait', ms: 200 },

      // Swap in the real tutorial music. Player is already alive,
      // so the swap is near-instant via loadVideoById.
      { kind: 'radioPlayYouTube', url: TUTORIAL_YT_URL, volume: TUTORIAL_YT_VOLUME },
      { kind: 'wait', ms: 1800 },
      { kind: 'speak', clip: 'tut1_00e', text: "Okay — that's better. Let's go." },
      { kind: 'wait', ms: 400 },
      // Snap the panel to the right edge — music keeps playing, panel
      // stays clickable as a thin peek so the user can bring it back.
      { kind: 'radioSnapToEdge' },
      { kind: 'wait', ms: 400 },

      // ── Intro ─────────────────────────────────────────────────────────────
      { kind: 'speak', clip: 'tut1_01', text: "Hey again — I'm Jen, your KRNL0 assistant." },
      { kind: 'wait', ms: 300 },
      { kind: 'speak', clip: 'tut1_02', text: "In this one, I'll show you Pomodoro and tasks." },
      { kind: 'wait', ms: 400 },

      // Center on the Pomodoro node — the first thing Jen talks about
      { kind: 'cameraToNode', nodeKind: 'pomo', zoom: 0.9 },
      { kind: 'wait', ms: 700 },

      // ── Pomodoro mother node ──────────────────────────────────────────────
      { kind: 'speak', clip: 'tut1_03', text: 'Look on the left side of your board.' },
      { kind: 'speak', clip: 'tut1_04', text: "That's your Pomodoro node — it's always there." },
      { kind: 'speak', clip: 'tut1_05', text: "It works like any Pomodoro timer you've used." },
      { kind: 'wait', ms: 300 },
      { kind: 'speak', clip: 'tut1_06', text: 'See the little gear at the top corner?' },
      { kind: 'speak', clip: 'tut1_07', text: 'Click it to tweak the defaults to your style.' },
      { kind: 'wait', ms: 400 },
      { kind: 'speak', clip: 'tut1_08', text: "I know — boring. You've seen this before." },
      { kind: 'wait', ms: 300 },

      // ── The twist ─────────────────────────────────────────────────────────
      { kind: 'speak', clip: 'tut1_09', text: "Here's the twist." },
      { kind: 'speak', clip: 'tut1_10', text: 'KRNL0 wires your Pomodoro straight into your tasks.' },
      { kind: 'wait', ms: 400 },

      // Pan to the Todo node before asking the user to add a task
      { kind: 'cameraToNode', nodeKind: 'todo', zoom: 0.9 },
      { kind: 'wait', ms: 700 },

      // ── First task ────────────────────────────────────────────────────────
      { kind: 'speak', clip: 'tut1_11', text: 'Add a new task.' },
      { kind: 'speak', clip: 'tut1_12', text: 'Call it — learn machine learning.' },
      { kind: 'speak', clip: 'tut1_13', text: 'Give it sixty minutes.' },
      { kind: 'speak', clip: 'tut1_14', text: "I'm waiting." },
      {
        kind: 'waitForBoard',
        caption: `waiting for: "${TASK_1}"`,
        predicate: (snap) => hasTaskWith(snap, 'learn'),
        timeoutMs: 120_000,
        onTimeout: onTimeoutWait,
      },
      {
        kind: 'verify',
        predicate: (snap) => hasTaskWith(snap, 'learn'),
        onPass: [
          { kind: 'speak', clip: 'tut1_15', text: 'Nice. Your task just spawned its own node.' },
          { kind: 'wait', ms: 500 },

          // ── Bind to Pomodoro ──────────────────────────────────────────────
          { kind: 'speak', clip: 'tut1_16', text: "Now — let's connect it to the Pomodoro." },
          { kind: 'speak', clip: 'tut1_17', text: 'Double-click the task — either one works.' },
          // No snapshot predicate for pomo-bind yet — give the user time
          { kind: 'wait', ms: 4500 },
          { kind: 'speak', clip: 'tut1_18', text: 'See? It turned green. The Pomodoro is bound.' },
          { kind: 'speak', clip: 'tut1_19', text: 'KRNL0 just split your sixty minutes into Pomodoro sessions.' },
          { kind: 'wait', ms: 500 },

          // ── Second task ───────────────────────────────────────────────────
          { kind: 'speak', clip: 'tut1_20', text: "Let's make it more interesting." },
          { kind: 'speak', clip: 'tut1_21', text: 'Add a second task — go for a walk.' },
          { kind: 'speak', clip: 'tut1_22', text: 'Ninety minutes this time.' },
          { kind: 'speak', clip: 'tut1_23', text: "Go ahead. I'm waiting." },
          {
            kind: 'waitForBoard',
            caption: `waiting for: "${TASK_2}"`,
            predicate: (snap) => hasTaskWith(snap, 'walk'),
            timeoutMs: 120_000,
            onTimeout: onTimeoutWait,
          },
          {
            kind: 'verify',
            predicate: (snap) => hasTaskWith(snap, 'walk'),
            onPass: [
              // Explicit chain (matches existing tutorial pattern)
              {
                kind: 'runCommand',
                label: `krnl task chain "${TASK_1}" "${TASK_2}"`,
                argv: ['task', 'chain', TASK_1, TASK_2],
              },
              { kind: 'wait', ms: 700 },

              { kind: 'speak', clip: 'tut1_24', text: 'Look — a chain appeared between them.' },
              { kind: 'speak', clip: 'tut1_25', text: 'That chain is your day, as a pipeline.' },
              { kind: 'wait', ms: 600 },

              // ── Calendar & clock ──────────────────────────────────────────
              { kind: 'speak', clip: 'tut1_26', text: 'Want to see this on a calendar?' },
              { kind: 'speak', clip: 'tut1_27', text: "You've already got a calendar node and a clock node." },
              { kind: 'speak', clip: 'tut1_28', text: 'The calendar has weekly, monthly, and yearly views.' },
              { kind: 'speak', clip: 'tut1_29', text: 'Switch to weekly.' },
              { kind: 'wait', ms: 1500 },

              // Pan to the actual calendar node
              { kind: 'cameraToNode', nodeKind: 'calendar', zoom: 0.85 },
              { kind: 'wait', ms: 800 },

              { kind: 'speak', clip: 'tut1_30', text: 'Hours go down, days go across. The red line is right now.' },
              { kind: 'wait', ms: 500 },

              { kind: 'speak', clip: 'tut1_31', text: 'Drag — learn machine learning — onto today.' },
              {
                kind: 'waitForBoard',
                caption: 'waiting for the drop…',
                predicate: (snap) => snap.scheduledTaskCount >= 1,
                timeoutMs: 120_000,
                onTimeout: onTimeoutWait,
              },
              {
                kind: 'verify',
                predicate: (snap) => snap.scheduledTaskCount >= 1,
                onPass: [
                  { kind: 'speak', clip: 'tut1_32', text: 'There it is.' },
                  { kind: 'speak', clip: 'tut1_33', text: 'Both tasks landed back-to-back. KRNL0 saw the chain.' },
                  { kind: 'wait', ms: 400 },

                  // Pan to the actual clock node
                  { kind: 'cameraToNode', nodeKind: 'clock', zoom: 0.9 },
                  { kind: 'wait', ms: 800 },

                  { kind: 'speak', clip: 'tut1_34', text: 'Your day, visualized. Calendar and clock, in sync.' },
                  { kind: 'wait', ms: 500 },

                  // ── Bonus: parallel ──────────────────────────────────────
                  // Back to the Todo where the parallel task happens
                  { kind: 'cameraToNode', nodeKind: 'todo', zoom: 0.85 },
                  { kind: 'wait', ms: 700 },
                  { kind: 'speak', clip: 'tut1_35', text: 'One bonus before we wrap.' },
                  { kind: 'speak', clip: 'tut1_36', text: 'You can run tasks in parallel too.' },
                  { kind: 'speak', clip: 'tut1_37', text: 'Right-click your task and pick — add parallel task.' },
                  { kind: 'speak', clip: 'tut1_38', text: 'Call it — listen to music. Sixty minutes.' },
                  {
                    kind: 'waitForBoard',
                    caption: `waiting for: "${TASK_3}"`,
                    predicate: (snap) => hasTaskWith(snap, 'music'),
                    timeoutMs: 120_000,
                    onTimeout: onTimeoutWait,
                  },
                  {
                    kind: 'verify',
                    predicate: (snap) => hasTaskWith(snap, 'music'),
                    onPass: [
                      { kind: 'speak', clip: 'tut1_39', text: 'Two tasks, side by side. Calendar and clock auto-update.' },
                      { kind: 'wait', ms: 500 },
                    ],
                    onFail: [
                      { kind: 'speak', clip: 'tut1_skip_no_worries', text: "No worries — we can come back to this." },
                    ],
                  },

                  // ── Outro ────────────────────────────────────────────────
                  { kind: 'speak', clip: 'tut1_40', text: "That's the whole flow." },
                  { kind: 'speak', clip: 'tut1_41', text: "If you don't feel like planning, ask an AI in the terminal." },
                  { kind: 'speak', clip: 'tut1_42', text: "But that's another tutorial." },
                  { kind: 'speak', clip: 'tut1_43', text: 'For now — go build your day.' },
                ],
                onFail: [
                  { kind: 'speak', clip: 'tut1_skip_no_worries', text: "Looks like nothing got scheduled — try again later." },
                ],
              },
            ],
            onFail: [
              { kind: 'speak', clip: 'tut1_skip_no_worries', text: "No worries — we can come back to this." },
            ],
          },
        ],
        onFail: [
          { kind: 'speak', clip: 'tut1_skip_no_worries', text: "No worries — we can come back to this." },
        ],
      },
    ];
  },
};
