// Guided tours (#207 follow-up) — short text tutorials, one per part of the
// app. Each step says one thing, spotlights where it is (`target`, a CSS
// selector), brings the window into view (`node`, a mother node id), and
// waits for the user: a Next click, or the real action (`waitFor`).
//
// Started from the Orb ("Tutorials") or `krnl tour start <id>`.

import type { Board } from '../../../shared/types';

export type TourWait =
  | { click: string }
  | { board: (now: Board, atStart: Board) => boolean };

export interface TourStep {
  /** What the guide says (plain words, one idea). */
  text: string;
  /** Spotlight this element (CSS selector). */
  target?: string;
  /** Bring this mother window into view first (canvas: move the camera; Station: show its panel). */
  node?: string;
  /** Wait for the user to do it (else a Next button). */
  waitFor?: TourWait;
  /** Shown under the text while waiting. */
  hint?: string;
}

export interface Tour {
  id: string;
  title: string;
  summary: string;
  steps: TourStep[];
}

// ── board predicates ───────────────────────────────────────────────────────
const tasks = (b: Board) => b.nodes.filter((n) => n.kind === 'todo.task');
const pomoState = (b: Board) => b.nodes.find((n) => n.kind === 'pomo')?.state as { status?: string; history?: unknown[] } | undefined;
const habitCount = (b: Board) => ((b.nodes.find((n) => n.kind === 'habit' && n.isMother)?.state as { habits?: unknown[] } | undefined)?.habits ?? []).length;
const scheduledCount = (b: Board) => tasks(b).filter((n) => !!(n.state as { scheduledFor?: string }).scheduledFor).length;
const newTask = (now: Board, start: Board) => tasks(now).length > tasks(start).length;
const pomoRunning = (now: Board) => pomoState(now)?.status === 'running';
const pomoStopped = (now: Board, start: Board) => (pomoState(now)?.history?.length ?? 0) > (pomoState(start)?.history?.length ?? 0) && pomoState(now)?.status !== 'running';
const habitAdded = (now: Board, start: Board) => habitCount(now) > habitCount(start);
const taskScheduled = (now: Board, start: Board) => scheduledCount(now) > scheduledCount(start);

const POMO = '[data-tour="mother-pomo"]';
const TODO = '[data-tour="mother-todo"]';
const CAL = '[data-tour="mother-calendar"]';
const CLOCK = '[data-tour="mother-clock"]';
const HABIT = '[data-tour="mother-habit"]';
const ANALYTICS = '[data-tour="mother-analytics"]';
const TERM = '[data-tour="mother-term"]';
const ORB = '[aria-label^="AI assistant"]';

export const TOURS: readonly Tour[] = [
  {
    id: 'welcome',
    title: 'Welcome tour',
    summary: 'What each window is for, in one minute',
    steps: [
      { text: "Hi — I'll show you around. KRNL0 is one board with a window for each part of your day. Press Next (or Enter) to go on, Esc to stop any time." },
      { node: 'mother-pomo', target: POMO, text: 'Pomo records what you actually do. Start it when you begin, stop it when you finish — that time is what counts.' },
      { node: 'mother-todo', target: TODO, text: 'Todo is your list. Every task can have an estimate, a tag, and the time you really spent on it.' },
      { node: 'mother-calendar', target: CAL, text: 'Calendar is your plan: drag tasks onto it. Recorded time shows next to the plan, so you see how the day really went.' },
      { node: 'mother-clock', target: CLOCK, text: 'Clock shows today on a dial — the plan around the edge, what you did as coloured wedges.' },
      { node: 'mother-habit', target: HABIT, text: 'Habits are the things you want to do regularly. Tick them off each day.' },
      { node: 'mother-analytics', target: ANALYTICS, text: 'Analytics answers "where did my time go" — per day, per task, per tag.' },
      { target: ORB, text: "And this is me. Open me for more tutorials, one for each window. That's the tour!" },
    ],
  },
  {
    id: 'pomo',
    title: 'Pomo — record your time',
    summary: 'Start, pick what you do, break, stop',
    steps: [
      { node: 'mother-pomo', target: POMO, text: 'The Pomo records what you really do. Only recorded time counts as time spent.' },
      { target: '[data-testid="pomo-now"]', text: 'Here you say what you are doing: pick a task, or a category like "Code" if it is not a task.' },
      { target: '[data-testid="pomo-primary"]', text: 'Press START now.', waitFor: { board: (now) => pomoRunning(now) }, hint: 'Waiting for you to press START…' },
      { target: '[data-testid="pomo-discard"]', text: "Started by mistake? Hold the trash icon to throw the session away — nothing is saved. Don't do it now." },
      { target: '[data-testid="pomo-primary"]', text: 'Now press STOP. The session is saved and shows on the Calendar and the Clock.', waitFor: { board: pomoStopped }, hint: 'Waiting for you to press STOP…' },
      { target: '[data-testid="pomo-log-past"]', text: 'Forgot to press Start earlier? "+ log past time" adds work you did but didn\'t record.' },
    ],
  },
  {
    id: 'todo',
    title: 'Todo — your tasks',
    summary: 'Add a task, its estimate and tag',
    steps: [
      { node: 'mother-todo', target: TODO, text: 'This is your list of tasks.' },
      { target: '[data-testid="add-task-placeholder"]', text: 'Click "add task", type a name, press Enter (you can give minutes next, or just Enter again).', waitFor: { board: newTask }, hint: 'Waiting for a new task…' },
      { target: '[data-testid="todo-item-breakdown"]', text: 'The number is the estimate. Click it to change it — 0 means "no set time". Once you track time it reads "⏱ worked / planned".' },
      { target: '[data-testid^="todo-tag-"]', text: 'The tag (Code, Study…) groups time in Analytics. Click to change it.' },
      { text: 'Tick a task when it is done. Done tasks move to Done, then to the Archive — and their recorded time stays in Analytics.' },
    ],
  },
  {
    id: 'calendar',
    title: 'Calendar — plan vs reality',
    summary: 'Schedule a task, read recorded time',
    steps: [
      { node: 'mother-calendar', target: CAL, text: 'The Calendar holds your plan (outlined blocks) and what really happened (filled bands).' },
      { target: '[data-testid="calendar-grid-body"]', text: 'Drag a task from the Todo onto a time here to plan it.', waitFor: { board: taskScheduled }, hint: 'Waiting for you to drop a task on the grid…' },
      { target: '[data-testid="calendar-grid-body"]', text: 'Planned blocks tell you how it went: "started 20m late", "+30m over".' },
      { target: '[data-testid="calendar-reality-block"]', text: 'Click any recorded band to see it. Double-click its start or end time to fix it.' },
      { target: '[data-testid="calendar-grid-body"]', text: 'Right-click an empty time to "Log time here…" — for work you forgot to record.' },
    ],
  },
  {
    id: 'clock',
    title: 'Clock — today at a glance',
    summary: 'The dial, a day, the week',
    steps: [
      { node: 'mother-clock', target: CLOCK, text: 'The Clock shows today. Planned tasks run around the edge; recorded work fills the face.' },
      { target: '[data-testid="clock-dial"]', text: 'Click a coloured wedge to see that session — or right-click empty time to log time there.' },
      { target: '[data-testid="clock-week-toggle"]', text: 'Press WEEK to see your last 7 days as clocks.', waitFor: { click: '[data-testid="clock-week-toggle"]' }, hint: 'Waiting for WEEK…' },
      { target: '[data-testid="clock-week"]', text: 'Each clock is a day: morning inside, afternoon in the outer ring. Click a day to open it.' },
    ],
  },
  {
    id: 'habits',
    title: 'Habits',
    summary: 'Add a habit, tick it off',
    steps: [
      { node: 'mother-habit', target: HABIT, text: 'Habits are things you want to do regularly — reading, exercise, a weekly review.' },
      { target: `${HABIT} input[placeholder^="+ add habit"]`, text: 'Type a habit here and press Enter.', waitFor: { board: habitAdded }, hint: 'Waiting for a new habit…' },
      { target: HABIT, text: 'Click today\'s square to tick it off. Your streak grows each day you do it.' },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics — where the time went',
    summary: 'Pages, the time log, tags, plan vs actual',
    steps: [
      { node: 'mother-analytics', target: ANALYTICS, text: 'Analytics turns your recorded time into answers.' },
      { target: '[data-testid="analytics-page-nav"]', text: 'Each icon is a page: summary, activity, hours, plan vs actual, time by tag, time log…' },
      { target: '[data-testid="analytics-page-log"]', text: 'Open the Time log page.', waitFor: { click: '[data-testid="analytics-page-log"]' }, hint: 'Waiting for the Time log icon…' },
      { target: '[data-testid="time-log-heatmap"]', text: 'Every row is a task, every square a day — darker means more time. On the right: worked / planned. Below: time per tag.' },
      { target: '[data-testid="analytics-page-estimates"]', text: '"Plan vs actual" compares your estimates with the time you really spent.' },
    ],
  },
  {
    id: 'terminal',
    title: 'Terminal & AI',
    summary: 'The krnl commands and Claude Code',
    steps: [
      { node: 'mother-term', target: TERM, text: 'The Terminal runs a real shell. Everything in KRNL0 can also be done with "krnl" commands — try "krnl help".' },
      { target: ORB, text: 'Click me — the orb — to open my menu.', waitFor: { click: ORB }, hint: 'Waiting for you to click the orb…' },
      { target: '[data-testid="orb-claude-bypass"]', text: '"claude code" starts Claude Code in the terminal, ready to work on your board. It runs without asking permission for each step.' },
    ],
  },
];

export function tourById(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id);
}
