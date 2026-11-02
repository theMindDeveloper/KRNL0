// Seed this worktree's board with a week of realistic Observe-mode data for
// manual testing: tasks (planned, done, missed, future), habits with
// schedules and streaks, and pomo spans with breaks, task links, free-text
// names, categories, a midnight crossing, a pomodoro-mode day, an unnamed
// span and a live break. Edge cases on purpose.
//
// Goes through the same pure functions the app and `krnl` use (todo/task
// dispatch, habit and pomo FSMs) with an injected clock. Keeps the mother
// nodes and canvas content; replaces tasks, habits, pomo history and the
// completion ledger. Backs up board.json first.
//
// Close the app first (a running app would overwrite the file), then:
//   npm run seed:preview
// Board: $KRNL0_BOARD_DIR ?? <worktree>/.krnl0-data/board.json

import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadBoardFrom, saveBoardTo } from '../src/main/persistence/board';
import { createTodoTaskPair } from '../src/shared/dispatch/todo';
import { taskToggleMirror } from '../src/shared/dispatch/task';
import type { AnyNode, BoardShape, DispatchCtx } from '../src/shared/dispatch/types';
import { taskSetSchedule } from '../src/renderer/components/nodes/TaskNode/commands';
import { todoAddTag, todoSetItemSchedule } from '../src/renderer/components/nodes/TodoNode/commands';
import type { TodoState } from '../src/renderer/components/nodes/TodoNode/types';
import type { TaskState } from '../src/renderer/components/nodes/TaskNode/types';
import { habitAdd, habitSetIcon, habitSetSchedule, habitToggleDay, habitArchive } from '../src/renderer/components/nodes/HabitNode/commands';
import type { HabitState } from '../src/renderer/components/nodes/HabitNode/types';
import {
  pomoBreak, pomoResume, pomoSetLiveLabel, pomoSetTag, pomoStart, pomoStop, type PomoEnv,
} from '../src/renderer/components/nodes/PomoNode/commands';
import { defaultPomoState, OBSERVE_SPAN_MIN, type PomoConfig, type PomoState } from '../src/renderer/components/nodes/PomoNode/types';
import { spanTagFor } from '../src/renderer/store/spanTags';

const boardDir = process.env['KRNL0_BOARD_DIR'] ?? join(process.cwd(), '.krnl0-data');
const boardPath = join(boardDir, 'board.json');
if (!existsSync(boardPath)) throw new Error(`No board at ${boardPath} — run the app once first`);
const backup = boardPath.replace(/\.json$/, `.before-seed-${Date.now()}.json`);
copyFileSync(boardPath, backup);

const board = loadBoardFrom(boardPath) as BoardShape & Record<string, unknown>;
const node = (kind: string) => {
  const n = board.nodes.find((x) => x.kind === kind && x.isMother);
  if (!n) throw new Error(`no mother ${kind} node`);
  return n;
};

// ── clock ───────────────────────────────────────────────────────────────────
const NOW = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
/** Local time `HH:MM` on today + `day` (negative = past). */
const at = (day: number, hm: string): Date => {
  const [h, m] = hm.split(':').map(Number) as [number, number];
  const d = new Date(NOW);
  d.setDate(d.getDate() + day);
  d.setHours(h, m, 0, 0);
  return d;
};
const localIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const ymd = (d: Date) => localIso(d).slice(0, 10);
let clock = NOW.getTime();
let seq = 0;
const uuid = () => `seed-${Date.now().toString(36)}-${(++seq).toString(36)}`;
const ctxAt = (d: Date): DispatchCtx => ({ uuid, now: () => d.toISOString() });

// ── reset the data the seed owns ────────────────────────────────────────────
board.nodes = board.nodes.filter((n) => n.kind !== 'todo.task');
board.edges = board.edges.filter((e) => {
  const ids = new Set(board.nodes.map((n) => n.id));
  return ids.has(String(e['source'])) && ids.has(String(e['target']));
});
board['completions'] = [];
// The todo node object is replaced as tasks are added — always look it up.
const todo = () => node('todo');
todo().state = { ...(todo().state as TodoState), items: [] };
// A custom category the built-ins don't cover.
todo().state = todoAddTag(todo().state as TodoState, { label: 'Gaming', color: '#c07bff', keywords: ['game', 'gaming', 'steam'] });

// ── tasks ───────────────────────────────────────────────────────────────────
const tasks: Record<string, string> = {};
function task(key: string, text: string, tag: string, opts: { day?: number; at?: string; min: number; doneAt?: Date }) {
  const r = createTodoTaskPair(board, { text, tag, plannedMin: opts.min }, ctxAt(at(opts.day ?? 0, '07:00')));
  if (!r) throw new Error(`task ${text}`);
  tasks[key] = r.taskNodeId;
  if (opts.at !== undefined) {
    const when = localIso(at(opts.day ?? 0, opts.at));
    const tn = board.nodes.find((n) => n.id === r.taskNodeId) as AnyNode;
    tn.state = taskSetSchedule(tn.state as TaskState, { scheduledFor: when, scheduledDurationMin: opts.min });
    const td = todo();
    td.state = todoSetItemSchedule(td.state as TodoState, { itemId: r.todoItemId, scheduledFor: when });
  }
  if (opts.doneAt) taskToggleMirror(board, r.taskNodeId, ctxAt(opts.doneAt));
}

// Past days — done, so the completion ledger / Time-by-tag has history.
task('oop', 'Lecture notes OOP', 'study', { day: -4, at: '10:00', min: 90, doneAt: at(-4, '11:40') });
task('refactor', 'Refactor board store', 'code', { day: -3, at: '14:00', min: 180, doneAt: at(-3, '17:35') });
task('groceries', 'Grocery shopping', 'chores', { day: -2, at: '11:00', min: 45, doneAt: at(-2, '11:50') });
task('mom', 'Call mom', 'social', { day: -1, at: '19:00', min: 30, doneAt: at(-1, '19:40') });
// Today.
task('thesis', 'Thesis chapter 3 — write intro', 'writing', { at: '09:00', min: 60, doneAt: at(0, '10:20') });
task('bug', 'Fix calendar drag bug', 'code', { at: '11:00', min: 90, doneAt: at(0, '13:30') });
task('standup', 'Team standup', 'meetings', { at: '13:30', min: 15, doneAt: at(0, '13:45') });
task('gym', 'Gym', 'health', { at: '18:00', min: 60 }); // planned, skipped → reality shows YouTube instead
task('plan', 'Plan the week', 'planning', { min: 30 }); // open, unscheduled — the live one
// Future.
task('papers', 'Read papers for HTW', 'reading', { day: 1, at: '10:00', min: 120 });
task('slides', 'Demo slides', 'creative', { day: 2, at: '15:00', min: 90 });

// ── habits ──────────────────────────────────────────────────────────────────
const habitNode = node('habit');
let hs: HabitState = { ...(habitNode.state as HabitState), habits: [] };
const habitEnv = (d: Date) => ({ uuid, now: () => d.toISOString(), today: () => ymd(NOW) });
function habit(name: string, color: 'acid' | 'rust' | 'cyan' | 'plum' | 'spine', icon: string, doneDays: number[]) {
  hs = habitAdd(hs, { name, color }, habitEnv(at(-14, '08:00')));
  const id = hs.habits[hs.habits.length - 1]!.id;
  hs = habitSetIcon(hs, { id, icon });
  for (const d of doneDays) hs = habitToggleDay(hs, { id, date: ymd(at(d, '12:00')) }, habitEnv(NOW));
  return id;
}
const meditate = habit('Meditate', 'cyan', 'meditate', [0, -1, -2, -4, -5, -6, -7, -8]); // gap on day -3 breaks the streak
hs = habitSetSchedule(hs, { habitId: meditate, schedule: { kind: 'daily', timeOfDay: '07:00', durationMin: 15 } });
const run = habit('Run 5k', 'rust', 'run', [-2, -4, -7, -9]);
hs = habitSetSchedule(hs, { habitId: run, schedule: { kind: 'weekly', timeOfDay: '18:30', days: [1, 3, 5], durationMin: 45 } });
habit('Read 20 pages', 'plum', 'book', [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12]); // not today yet → grace keeps the streak
const water = habit('No sugar', 'spine', 'food', [0, -1]);
hs = habitSetSchedule(hs, { habitId: water, schedule: { kind: 'weekdays', timeOfDay: '12:00' } });
const old = habit('Duolingo', 'acid', 'study', [-20, -19, -18]);
hs = habitArchive(hs, { id: old });
habitNode.state = hs;

// ── pomo spans ──────────────────────────────────────────────────────────────
const pomoNode = node('pomo');
pomoNode.config = { ...(pomoNode.config as PomoConfig), mode: 'observe' };
let ps: PomoState = { ...defaultPomoState(), history: [] };
const env: PomoEnv = { now: () => clock, uuid };

type What = { task: string } | { label: string; tag?: string } | { unnamed: true };
type Step = { work: What; from: Date; to: Date } | { brk: true; to: Date };

/** Name what's being recorded (task link, free text + category, or nothing). */
function setWhat(w: What) {
  if ('task' in w) {
    const t = board.nodes.find((n) => n.id === tasks[w.task])!;
    ps = pomoSetTag(ps, { taskId: t.id, label: (t.state as TaskState).text });
  } else if ('label' in w) {
    ps = pomoSetLiveLabel(ps, { label: w.label, tag: spanTagFor(board as never, w.label, w.tag ?? null) });
  } else {
    ps = pomoSetTag(ps, { taskId: null });
  }
}

/** Run a day's steps through the FSM. A break follows the work before it. */
function run_(steps: Step[], opts: { durationMin?: number; leaveOpen?: boolean } = {}) {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if ('work' in s) {
      if (ps.status === 'running') { clock = s.from.getTime(); ps = pomoStop(ps, {}, env); }
      setWhat(s.work);
      clock = s.from.getTime();
      ps = ps.status === 'break' ? pomoResume(ps, {}, env) : pomoStart(ps, { durationMin: opts.durationMin ?? OBSERVE_SPAN_MIN }, env);
      clock = s.to.getTime();
      const next = steps[i + 1];
      if (next && 'brk' in next) ps = pomoBreak(ps, {}, env);
      else if (!next || 'work' in next && next.from.getTime() !== s.to.getTime()) ps = pomoStop(ps, {}, env);
    } else {
      clock = s.to.getTime();
      const next = steps[i + 1];
      if (!next && !opts.leaveOpen) ps = pomoStop(ps, {}, env);
      else if (next && 'work' in next && next.from.getTime() !== s.to.getTime()) ps = pomoStop(ps, {}, env);
    }
  }
}
const W = (work: What, d: number, from: string, to: string, toDay = d): Step => ({ work, from: at(d, from), to: at(toDay, to) });
const B = (d: number, to: string): Step => ({ brk: true, to: at(d, to) });

// Day -6: a single 3.5 h deep-work span (long span edge case).
run_([W({ label: 'deep work on parser', tag: 'code' }, -6, '14:00', '17:30')]);
// Day -5: pomodoro-mode day — four full 25-min pomodoros with breaks (counts as sessions).
run_([
  W({ task: 'oop' }, -5, '09:00', '09:25'), B(-5, '09:30'),
  W({ task: 'oop' }, -5, '09:30', '09:55'), B(-5, '10:00'),
  W({ task: 'oop' }, -5, '10:00', '10:25'), B(-5, '10:30'),
  W({ task: 'oop' }, -5, '10:30', '10:55'), B(-5, '11:10'),
], { durationMin: 25 });
// Day -4: the OOP lecture tracked against its plan, plus emails.
run_([W({ task: 'oop' }, -4, '10:05', '11:35'), W({ label: 'emails', tag: 'admin' }, -4, '16:00', '16:20')]);
// Day -3: refactor with a long lunch break in the middle, overrunning the plan.
run_([W({ task: 'refactor' }, -3, '14:10', '15:40'), B(-3, '16:05'), W({ task: 'refactor' }, -3, '16:05', '17:35')]);
// Day -2: groceries + reading, back-to-back different things with no gap.
run_([W({ task: 'groceries' }, -2, '11:05', '11:50'), W({ label: 'reading novel', tag: 'reading' }, -2, '11:50', '12:40')]);
// Day -1 → today: call mom, then gaming across midnight (custom category).
run_([W({ task: 'mom' }, -1, '19:05', '19:40'), W({ label: 'Gaming', tag: 'gaming' }, -1, '23:30', '00:40', 0)]);
// Today: plan vs reality.
run_([
  W({ label: 'emails', tag: 'admin' }, 0, '08:30', '08:50'),
  W({ task: 'thesis' }, 0, '09:05', '09:50'), B(0, '10:00'),       // on time, short break
  W({ task: 'thesis' }, 0, '10:00', '10:20'),                       // continued after the break
  W({ task: 'bug' }, 0, '11:20', '12:10'), B(0, '12:55'),           // started late, long lunch
  W({ task: 'bug' }, 0, '12:55', '13:30'),                          // overran the 12:30 plan end
  W({ unnamed: true }, 0, '14:02', '14:40'),                        // never named → "name it…"
  W({ label: 'youtube', tag: 'social' }, 0, '18:05', '18:40'),      // instead of the planned Gym
]);
// Now: working on "Plan the week" for a while, currently on a break.
const nowMin = NOW.getHours() * 60 + NOW.getMinutes();
if (nowMin > 19 * 60 + 30) {
  const startWork = new Date(NOW.getTime() - 40 * 60_000);
  const startBreak = new Date(NOW.getTime() - 8 * 60_000);
  run_([{ work: { task: 'plan' }, from: startWork, to: startBreak }, { brk: true, to: NOW }], { leaveOpen: true });
}
pomoNode.state = ps;

saveBoardTo(boardPath, { ...board, savedAt: new Date().toISOString() });
const work = ps.history.filter((r) => r.kind === 'work').length;
console.log(`seeded ${boardPath}
  backup: ${backup}
  tasks: ${Object.keys(tasks).length}, habits: ${hs.habits.length}, spans: ${ps.history.length} (${work} work), live: ${ps.status}`);
