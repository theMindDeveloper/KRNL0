import type { Flow, FlowStep, BoardSnapshot } from '../types';

/**
 * Session-from-Commander — runs the user's typed plan as a chained schedule.
 *
 * Expected params:
 *   label:       free-form session name (e.g. "morning routine")
 *   tasks:       newline-separated task texts (1–5 lines)
 *   startISO:    optional ISO datetime; if absent, schedules at "now+5min"
 *
 * Behaviour:
 *   1. Speak the plan back
 *   2. krnl task add for each line (auto-attaches to the first Todo node)
 *   3. krnl task chain across the new texts
 *   4. krnl task schedule on the head — cascade auto-places the rest
 *   5. Pan to the calendar to show the result
 */
export const sessionFromCommanderFlow: Flow = {
  id: 'session-from-commander',
  label: 'Plan a session (from Commander)',
  description: 'Internal: launched from the Commander popup with params.',
  steps: (board: BoardSnapshot, params): FlowStep[] => {
    const { viewport: vp } = board;
    const label   = params?.label?.trim() || 'New session';
    const raw     = params?.tasks ?? '';
    const tasks   = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);

    if (tasks.length === 0) {
      return [
        {
          kind: 'speak',
          clip: 'misc_not_found',
          text: "I didn't get any tasks for that session.",
        },
      ];
    }

    // Compute schedule start: "now + 5 minutes", rounded to next 5-min slot.
    const startISO = params?.startISO?.trim() || (() => {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5);
      now.setSeconds(0, 0);
      const ms = now.getMinutes() % 5;
      if (ms !== 0) now.setMinutes(now.getMinutes() + (5 - ms));
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    })();

    const steps: FlowStep[] = [
      { kind: 'speak', clip: 'cmd_got_it',
        text: `Got it. Setting up "${label}" — ${tasks.length} task${tasks.length !== 1 ? 's' : ''}.` },
      { kind: 'wait', ms: 400 },
    ];

    // Add each task
    for (const text of tasks) {
      steps.push({
        kind: 'runCommand',
        label: `krnl task add "${text}"`,
        argv: ['task', 'add', text],
      });
      steps.push({ kind: 'wait', ms: 400 });
    }

    // Chain them (only if 2+)
    if (tasks.length >= 2) {
      steps.push({
        kind: 'runCommand',
        label: `krnl task chain ${tasks.map((t) => `"${t}"`).join(' ')}`,
        argv: ['task', 'chain', ...tasks],
      });
      steps.push({ kind: 'wait', ms: 600 });
    }

    // Schedule the head — cascade auto-places successors via scheduleSelector
    steps.push({
      kind: 'runCommand',
      label: `krnl task schedule "${tasks[0]}" --at ${startISO}`,
      argv: ['task', 'schedule', tasks[0]!, '--at', startISO],
    });
    steps.push({ kind: 'wait', ms: 800 });

    // Verify it landed
    steps.push({
      kind: 'verify',
      predicate: (snap) => snap.scheduledTaskCount >= 1,
      onPass: [
        { kind: 'camera', x: vp.x - 200, y: vp.y, zoom: 0.85 },
        { kind: 'wait', ms: 700 },
        { kind: 'speak', clip: 'cmd_locked',
          text: `Session locked in. "${label}" starts at ${startISO}.` },
      ],
      onFail: [
        { kind: 'speak', clip: 'misc_error',
          text: "Something went wrong scheduling the session. Check the terminal." },
      ],
    });

    return steps;
  },
};
