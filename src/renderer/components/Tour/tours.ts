// Guided tours (#207 follow-up) — short tutorials, one per part of the app.
// Each step says one thing, rings where it is (`target`, a CSS selector;
// falls back to the step's window), brings the window into view (`node`),
// labels the ring (`badge`), and waits for the user: Next, or the real
// action (`waitFor`). Steps that only exist in one mode (`onlyIn`) are
// skipped in the other, so a tour never points at something that isn't there.
// `**word**` in a step's text is shown highlighted (what to look at / press);
// `{mode}` becomes the user's own mode; `{pomo}` the timer's name (Record in Easy, Pomo in Advanced).
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
  /** Of the elements matching `target`, the one whose text contains this
   *  (e.g. the task the step names). Rule: when the words name an item, the
   *  spotlight is on that item. */
  targetText?: string;
  /** Other windows the step needs on screen, e.g. the Calendar when the step
   *  says to drag a Todo row onto it. They are un-hidden too. */
  also?: string[];
  /** Wait for the user to do it (else a Next button). */
  waitFor?: TourWait;
  /** Shown under the text while waiting. */
  hint?: string;
  /** Show the app in this mode for the step (live demo; the tour puts the
   *  user's own mode back when it ends, unless they pick one in `choices`). */
  mode?: 'easy' | 'advanced';
  /** Only shown when the user is in this mode (the thing exists only there). */
  onlyIn?: 'easy' | 'advanced';
  /** A short tag on the spotlight ring, e.g. "PRESS" or "NEW IN ADVANCED". */
  badge?: string;
  /** The guide presses this for the user on entering the step (e.g. opens
   *  Settings to show where something lives); closed again on the next step. */
  press?: string;
  /** A window event fired on entering the step (e.g. `krnl:recap-show`). */
  event?: string;
  /** Buttons that end the tour by choosing a mode (replace Next). */
  choices?: ReadonlyArray<{ label: string; mode: 'easy' | 'advanced' }>;
}

export interface Tour {
  id: string;
  title: string;
  summary: string;
  steps: TourStep[];
}

/** The steps a user in `mode` sees (drops steps for the other mode). */
export function stepsFor(tour: Tour, mode: 'easy' | 'advanced'): TourStep[] {
  return tour.steps.filter((s) => !s.onlyIn || s.onlyIn === mode);
}

// ── board predicates ───────────────────────────────────────────────────────
type Item = { done?: boolean };
type HabitLite = { log?: string[] };
const tasks = (b: Board) => b.nodes.filter((n) => n.kind === 'todo.task');
const pomoState = (b: Board) => b.nodes.find((n) => n.kind === 'pomo')?.state as { status?: string; history?: unknown[] } | undefined;
const habits = (b: Board) => ((b.nodes.find((n) => n.kind === 'habit' && n.isMother)?.state as { habits?: HabitLite[] } | undefined)?.habits ?? []);
const doneCount = (b: Board) => ((b.nodes.find((n) => n.kind === 'todo' && n.isMother)?.state as { items?: Item[] } | undefined)?.items ?? []).filter((i) => i.done).length;
const ticks = (b: Board) => habits(b).reduce((n, h) => n + (h.log?.length ?? 0), 0);
const scheduledCount = (b: Board) => tasks(b).filter((n) => !!(n.state as { scheduledFor?: string }).scheduledFor).length;
const newTask = (now: Board, start: Board) => tasks(now).length > tasks(start).length;
const pomoRunning = (now: Board) => pomoState(now)?.status === 'running';
const pomoOnBreak = (now: Board) => pomoState(now)?.status === 'break';
// Stopped = back to idle (a break is not a stop). Works in both Pomo modes.
const pomoStopped = (now: Board) => {
  const st = pomoState(now)?.status;
  return st === 'idle' || st === 'done';
};
const habitAdded = (now: Board, start: Board) => habits(now).length > habits(start).length;
const habitTicked = (now: Board, start: Board) => ticks(now) !== ticks(start);
const taskDone = (now: Board, start: Board) => doneCount(now) > doneCount(start);
const taskScheduled = (now: Board, start: Board) => scheduledCount(now) > scheduledCount(start);

const POMO = '[data-tour="mother-pomo"]';
const TODO = '[data-tour="mother-todo"]';
const CAL = '[data-tour="mother-calendar"]';
const CLOCK = '[data-tour="mother-clock"]';
const HABIT = '[data-tour="mother-habit"]';
const ANALYTICS = '[data-tour="mother-analytics"]';
const TERM = '[data-tour="mother-term"]';
const ORB = '[aria-label^="AI assistant"]';
const GEAR = '[data-testid="topbar-settings"]';
const MODE = '[role="radiogroup"][aria-label="Easy or Advanced"]';

export const TOURS: readonly Tour[] = [
  // engagement.md F12 — one story through the whole loop. The orb's first
  // click on a fresh board starts it; the menu lists it first ("Start here").
  {
    id: 'first-day',
    title: 'Your first day',
    summary: 'Plan one real thing and do it — about 4 minutes',
    steps: [
      { text: "Let's plan **one real thing** and do it together. It takes about 4 minutes. **Next** (or Enter) goes on, **Esc** stops." },
      { node: 'mother-todo', target: '.todo-add', badge: 'TYPE', text: "Add something you'll do today: click **add task**, type it, press **Enter** — then pick **how long** you guess it takes (or Enter to skip).", waitFor: { board: newTask }, hint: 'Waiting for a new task…' },
      { target: '[data-testid="todo-item-breakdown"]', node: 'mother-todo', badge: 'YOUR GUESS', text: "That's your **guess**. Click it to change it any time. Once you record time it reads **worked / planned**." },
      { target: '[data-testid="task-node-root"]', badge: 'SAME TASK', text: 'That card on the board is **the same task**. Tick it here or in the list — both stay in step.' },
      { node: 'mother-calendar', also: ['mother-todo'], target: '[data-testid="calendar-grid-body"]', badge: 'PLAN IT', text: 'Now **plan it**: drag the task from the Todo onto a time today — now is fine. Not sure how? Press **PLAN** on its row and I show you.', waitFor: { board: taskScheduled }, hint: 'Waiting for the task to land on the Calendar…' },
      { node: 'mother-clock', target: CLOCK, badge: 'CLOCK', text: 'Your plan is on the **Clock** too, around the edge. Every window shows the same day.' },
      { node: 'mother-pomo', target: '[data-testid="pomo-primary"]', badge: 'PRESS', text: 'When you start working, press **START**. The {pomo} timer records what you really do.', waitFor: { board: (now) => pomoRunning(now) }, hint: 'Waiting for START…' },
      { target: '[data-testid="pomo-break"]', badge: 'PRESS', text: 'Need a pause? **BREAK**. Your work so far is saved, and the break is timed on its own.', waitFor: { board: (now) => pomoOnBreak(now) }, hint: 'Waiting for BREAK…' },
      { target: '[data-testid="pomo-resume"]', node: 'mother-pomo', badge: 'PRESS', text: 'Back? **BACK TO WORK**.', waitFor: { board: (now) => !pomoOnBreak(now) }, hint: 'Waiting for BACK TO WORK…' },
      { target: '[data-testid="pomo-primary"]', badge: 'PRESS', text: 'Finished for now? **STOP**. Break = pause and come back; Stop = done for now, saved.', waitFor: { board: (now) => pomoStopped(now) }, hint: 'Waiting for STOP…' },
      { node: 'mother-calendar', target: CAL, badge: 'PLAN VS REAL', text: "Your recorded time sits **under the plan**. That's how you see how the day really went." },
      { node: 'mother-todo', target: `${TODO} .todo-check`, badge: 'TICK', text: 'Done with it? **Tick it.**', waitFor: { board: taskDone }, hint: 'Waiting for a tick…' },
      { node: 'mother-habit', target: '[data-testid="habit-add-input"]', badge: 'TYPE', text: 'One last thing: add a **habit** you want to keep (reading, a walk…) and press **Enter**.', waitFor: { board: habitAdded }, hint: 'Waiting for a new habit…' },
      { target: `${HABIT} .habit-cell--today`, node: 'mother-habit', badge: 'TICK TODAY', text: "Did it today? Click **today's square**.", waitFor: { board: habitTicked }, hint: "Waiting for today's square…" },
      { event: 'krnl:recap-show', text: "Every evening ends like this: **what you did today**, in one card. Close it when you're ready." },
      { target: ORB, badge: 'MORE', text: "That's the whole loop. Each window has a **short tour** in my menu." },
    ],
  },
  {
    id: 'welcome',
    title: 'Welcome tour',
    summary: 'What each window is for, in one minute',
    steps: [
      { text: "Hi — I'm your guide. KRNL0 is **one board** with a window for each part of your day. Press **Next** (or Enter) to go on, **Esc** to stop any time." },
      { node: 'mother-pomo', target: POMO, badge: 'POMO · RECORD', text: '**{pomo}** records what you actually do. Start it when you begin, stop it when you finish — **only recorded time counts** as time spent.' },
      { node: 'mother-todo', target: TODO, badge: 'TODO · TASKS', text: '**Todo** is your list. Each task has an **estimate**, and shows the time you really spent on it.' },
      { node: 'mother-calendar', target: CAL, badge: 'CALENDAR · PLAN', text: '**Calendar** is your plan: **drag tasks onto it**. Recorded time sits next to the plan, so you see how the day really went.' },
      { node: 'mother-clock', target: CLOCK, badge: 'CLOCK · TODAY', text: '**Clock** shows today on a dial — the **plan around the edge**, what you did as **coloured wedges**.' },
      { node: 'mother-habit', target: HABIT, badge: 'HABITS', text: '**Habits** are the things you want to do regularly. **Tick them off** each day.' },
      { node: 'mother-analytics', target: ANALYTICS, badge: 'ANALYTICS', text: '**Analytics** answers "where did my time go" — **per day** and **per task**.' },
      { press: GEAR, target: MODE, badge: 'EASY / ADVANCED', text: "You're in **{mode}** mode. Switch here in **Settings → Mode** — Advanced connects tasks, categories and focus. The **Easy and Advanced** tour shows the difference." },
      { target: ORB, badge: 'MORE TOURS', text: 'And this is me. Open me for **a short tour of each window**.' },
    ],
  },
  {
    id: 'pomo',
    title: 'Pomo — record your time',
    summary: 'Start, take a break, stop — try it for real',
    steps: [
      { node: 'mother-pomo', target: POMO, badge: 'POMO', text: "The {pomo} timer records **what you really do**. Let's record a short session together — it takes a few seconds." },
      { onlyIn: 'advanced', target: '[data-testid="pomo-now"]', badge: 'WHAT AM I DOING', text: 'Here you say **what you are doing**: pick a task, or a category like "Code" — the time then counts toward it.' },
      { target: '[data-testid="pomo-primary"]', badge: 'PRESS', text: 'Press **START**.', waitFor: { board: (now) => pomoRunning(now) }, hint: 'Waiting for START…' },
      { target: '[data-testid="pomo-discard"]', badge: 'HOLD', text: "It's running. Started by mistake? **Hold the trash icon** and nothing is saved. Don't do it now." },
      { target: '[data-testid="pomo-break"]', badge: 'PRESS', text: 'Need a pause? Press **BREAK** — the work so far is saved, and the break is timed on its own.', waitFor: { board: (now) => pomoOnBreak(now) }, hint: 'Waiting for BREAK…' },
      { target: '[data-testid="pomo-resume"]', node: 'mother-pomo', badge: 'PRESS', text: 'Back from the break? Press **BACK TO WORK**.', waitFor: { board: (now) => !pomoOnBreak(now) }, hint: 'Waiting for BACK TO WORK…' },
      { target: '[data-testid="pomo-primary"]', badge: 'PRESS', text: 'Now press **STOP**. Your work and your break are saved and show on the **Calendar** and the **Clock**.', waitFor: { board: (now) => pomoStopped(now) }, hint: 'Waiting for STOP…' },
      { target: '[data-testid="pomo-log-past"]', badge: 'FORGOT?', text: 'Forgot to press Start earlier? **+ log past time** adds work you did but didn\'t record.' },
      { target: '[data-testid="pomo-log-toggle"]', badge: 'YOUR SESSIONS', text: 'Every recorded session is listed here — open it to **check one** or **delete a misclick**.' },
    ],
  },
  {
    id: 'todo',
    title: 'Todo — your tasks',
    summary: 'Add a task, set its time, tick it off',
    steps: [
      { node: 'mother-todo', target: TODO, badge: 'TODO', text: "This is your list. Let's **add a task**." },
      { target: '[data-testid="add-task-placeholder"]', badge: 'CLICK', text: 'Click **add task** at the bottom, type a name, press **Enter** — then type minutes, or just Enter again.', waitFor: { board: newTask }, hint: 'Waiting for a new task…' },
      { target: '[data-testid="todo-item-breakdown"]', badge: 'ESTIMATE', text: 'This is **how long you think it takes**. Click it to change it — **0** means "no set time". Once you record time it reads **⏱ worked / planned**.' },
      { onlyIn: 'advanced', target: '[data-testid^="todo-tag-"]', badge: 'TAG', text: 'The **tag** (Code, Study…) groups time in Analytics. Click it to change it.' },
      { target: `${TODO} .todo-check`, badge: 'TICK', text: 'Done? **Tick the box.**', waitFor: { board: taskDone }, hint: 'Waiting for a tick…' },
      { node: 'mother-todo', target: TODO, text: 'Done tasks fold into **Done today**. The next day they leave the list — their recorded time stays in Analytics. **Untick** to reopen.' },
    ],
  },
  {
    id: 'calendar',
    title: 'Calendar — plan vs reality',
    summary: 'Plan a task, read what really happened',
    steps: [
      { node: 'mother-calendar', target: CAL, badge: 'CALENDAR', text: 'The Calendar holds your **plan** (outlined blocks) and **what really happened** (filled bands).' },
      { target: '[data-testid="calendar-grid-body"]', badge: 'DROP HERE', text: '**Drag a task** from the Todo onto a time here to plan it.', waitFor: { board: taskScheduled }, hint: 'Waiting for you to drop a task on the grid…' },
      { onlyIn: 'advanced', target: '[data-testid="calendar-grid-body"]', badge: 'HOW IT WENT', text: 'Once you work on it, the planned block says how it went: **"started 20m late"**, **"+30m over"**.' },
      { target: '[data-testid="calendar-reality-block"]', node: 'mother-calendar', badge: 'RECORDED', text: 'Filled bands are **recorded time**. Click one to see it; **double-click** its start or end time to fix it.' },
      { target: '[data-testid="calendar-grid-body"]', badge: 'RIGHT-CLICK', text: 'Forgot to record something? **Right-click** an empty time and choose **Log time here…**' },
    ],
  },
  {
    id: 'clock',
    title: 'Clock — today at a glance',
    summary: 'The dial, a session, the week',
    steps: [
      { node: 'mother-clock', target: CLOCK, badge: 'CLOCK', text: 'The Clock shows today. **Planned tasks** run around the edge; **recorded work** fills the face.' },
      { target: '[data-testid="clock-dial"]', badge: 'CLICK · RIGHT-CLICK', text: '**Click** a coloured wedge to see that session — or **right-click** empty time to log time there.' },
      { target: '[data-testid="clock-week-toggle"]', badge: 'PRESS', text: 'Press **WEEK** to see your last 7 days as clocks.', waitFor: { click: '[data-testid="clock-week-toggle"]' }, hint: 'Waiting for WEEK…' },
      { target: '[data-testid="clock-week"]', badge: 'YOUR WEEK', text: 'Each clock is a day: **morning inside**, **afternoon in the outer ring**. Only today moves. Click a day to open it.' },
    ],
  },
  {
    id: 'habits',
    title: 'Habits',
    summary: 'Add a habit, tick it off',
    steps: [
      { node: 'mother-habit', target: HABIT, badge: 'HABITS', text: 'Habits are things you want to do **regularly** — reading, exercise, a weekly review.' },
      { target: '[data-testid="habit-add-input"]', badge: 'TYPE', text: 'Click **add habit** at the bottom, type a habit and press **Enter**.', waitFor: { board: habitAdded }, hint: 'Waiting for a new habit…' },
      { target: `${HABIT} .habit-cell--today`, node: 'mother-habit', badge: 'TICK TODAY', text: "Did it today? Click **today's square**.", waitFor: { board: habitTicked }, hint: "Waiting for today's square…" },
      { target: '[data-testid="habit-add-repeat"]', badge: 'OPTIONAL', text: '**Repeat** makes a habit a recurring event (say, gym Mon/Wed/Fri at 7:00) — it then shows on the **Calendar** and the **Clock**. **Right-click** a habit to rename, recolour or delete it.' },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics — where the time went',
    summary: 'Pages, time per task, planned vs spent',
    steps: [
      { node: 'mother-analytics', target: ANALYTICS, badge: 'ANALYTICS', text: 'Analytics turns your **recorded time** into answers.' },
      { target: '[data-testid="analytics-page-nav"]', badge: 'PAGES', text: '**Each icon is a page** — summary, activity, hours, time per task, and more. The name shows next to them.' },
      { target: '[data-testid="analytics-page-log"]', badge: 'CLICK', text: 'Open the **Time per task** page.', waitFor: { click: '[data-testid="analytics-page-log"]' }, hint: 'Waiting for the Time per task icon…' },
      { target: '[data-testid="time-log-heatmap"]', node: 'mother-analytics', badge: 'TIME PER TASK', text: '**Every row is a task** in its own colour, **every square a day** with the minutes in it. On the right: **worked / planned**. Below: time per tag.' },
      { onlyIn: 'advanced', target: '[data-testid="analytics-page-estimates"]', badge: 'PLANNED VS SPENT', text: '**Planned vs spent** puts each task\u2019s estimate next to the time you really spent.' },
      { onlyIn: 'easy', press: GEAR, target: MODE, badge: 'IN ADVANCED', text: '**Advanced** mode adds two pages: **Planned vs spent** and **Time by tag**. Switch here, in **Settings → Mode**.' },
    ],
  },
  {
    id: 'modes',
    title: 'Easy and Advanced',
    summary: 'Where to switch, and what Advanced adds — live',
    // A live demo: it shows where the switch is, then switches the app to the
    // mode each step talks about and rings what changed. The user's own mode
    // comes back at the end unless they pick one.
    steps: [
      { text: "KRNL0 has **two modes** on the same board and the same data — only what you see changes. You're in **{mode}** mode right now." },
      { press: GEAR, target: MODE, badge: 'SWITCH HERE', text: 'This is where you switch: **Settings → Mode**. **Easy** keeps it simple. **Advanced** connects tasks, categories and focus. Let me show you both.' },
      { mode: 'easy', node: 'mother-pomo', target: POMO, badge: 'EASY', text: 'In **Easy**, the timer is called **Record**: a plain **stopwatch** with Start, Break, Stop. Nothing to set up, nothing to name.' },
      { mode: 'advanced', node: 'mother-pomo', target: '[aria-label="Pomo mode"]', badge: 'NEW IN ADVANCED', text: "I've switched to **Advanced** — this switch appeared. **POMO** gives classic 25-minute sessions with breaks; **OBSERVE** keeps the stopwatch." },
      { mode: 'advanced', node: 'mother-pomo', target: '[data-testid="pomo-log-toggle"]', badge: 'MORE IN ADVANCED', text: 'Recorded sessions can be **named**: give each one a task or a category, so you know what the time was for.' },
      { mode: 'advanced', node: 'mother-todo', target: '[data-testid^="todo-tag-"]', badge: 'NEW IN ADVANCED', text: 'Tasks get **tags** (Code, Study…). **Right-click** a task for **Focus / Start pomo**.' },
      { mode: 'advanced', node: 'mother-analytics', target: '[data-testid="analytics-page-estimates"]', badge: 'NEW PAGE', text: '**Planned vs spent**: each task\u2019s estimate next to the time you really spent on it.' },
      { mode: 'advanced', node: 'mother-analytics', target: '[data-testid="analytics-page-tags"]', badge: 'NEW PAGE', text: '**Time by tag**: where your hours went — Code, Study, Health…' },
      { mode: 'easy', node: 'mother-analytics', target: '[data-testid="analytics-page-nav"]', badge: 'EASY', text: 'Back in **Easy** — those two pages are gone. The overview stays: **planned, worked, breaks, tasks done, habits**.' },
      { press: GEAR, target: MODE, badge: 'PICK ONE', text: 'Which one do you want? You can **come back here any time** — Settings → Mode.', choices: [{ label: 'Keep Easy', mode: 'easy' }, { label: 'Use Advanced', mode: 'advanced' }] },
    ],
  },
  {
    id: 'terminal',
    title: 'Terminal & AI',
    summary: 'The krnl commands and Claude Code',
    steps: [
      { node: 'mother-term', target: TERM, badge: 'TERMINAL', text: 'The Terminal runs a real shell. **Everything in KRNL0** can also be done with **krnl** commands — try **krnl help**.' },
      { target: ORB, badge: 'CLICK', text: 'Click me — **the orb** — to open my menu.', waitFor: { click: ORB }, hint: 'Waiting for you to click the orb…' },
      { target: '[data-testid="orb-claude-bypass"]', badge: 'CLAUDE CODE', text: '**claude code** starts Claude Code in the terminal, ready to work on your board. It runs **without asking permission** for each step.' },
    ],
  },
];

export function tourById(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id);
}
