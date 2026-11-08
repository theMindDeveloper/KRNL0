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
type HabitLite = { log?: string[]; kind?: string; exceptions?: unknown[]; endsOn?: string; perWeek?: number; rest?: string[]; amount?: { target: number } };
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
// Decision 39 — routines tour.
const routineCount = (b: Board) => habits(b).filter((h) => h.kind === 'routine').length;
const exceptionCount = (b: Board) => habits(b).reduce((n, h) => n + (h.exceptions?.length ?? 0), 0);
const endedCount = (b: Board) => habits(b).filter((h) => h.kind === 'routine' && h.endsOn).length;
const routineAdded = (now: Board, start: Board) => routineCount(now) > routineCount(start);
const routineSkipped = (now: Board, start: Board) => exceptionCount(now) > exceptionCount(start);
const routineEnded = (now: Board, start: Board) => endedCount(now) > endedCount(start);
const taskDone = (now: Board, start: Board) => doneCount(now) > doneCount(start);
// "Staying on track" tour: weekly targets, rest days, due dates, reminders.
const targetsKey = (b: Board) => habits(b).map((h) => h.perWeek ?? 0).join(',');
const restCount = (b: Board) => habits(b).reduce((n, h) => n + (h.rest?.length ?? 0), 0);
const todoItems = (b: Board) => ((b.nodes.find((n) => n.kind === 'todo' && n.isMother)?.state as { items?: Array<{ dueOn?: string }> } | undefined)?.items ?? []);
const dueKey = (b: Board) => todoItems(b).map((i) => i.dueOn ?? '').join(',');
const remindCount = (b: Board) => tasks(b).filter((n) => typeof (n.state as { remindMin?: unknown }).remindMin === 'number').length;
const targetSet = (now: Board, start: Board) => targetsKey(now) !== targetsKey(start) && habits(now).some((h) => !!h.perWeek);
const restAdded = (now: Board, start: Board) => restCount(now) > restCount(start);
const amountsKey = (b: Board) => habits(b).map((h) => h.amount?.target ?? 0).join(',');
const amountSet = (now: Board, start: Board) => amountsKey(now) !== amountsKey(start) && habits(now).some((h) => !!h.amount);
const dueSet = (now: Board, start: Board) => dueKey(now) !== dueKey(start) && todoItems(now).some((i) => !!i.dueOn);
const remindSet = (now: Board, start: Board) => remindCount(now) > remindCount(start);
const taskScheduled = (now: Board, start: Board) => scheduledCount(now) > scheduledCount(start);
// Quick add ("Gym 18:00 1h") can put the new task on the Calendar before the
// "plan it" step starts: then the newest task already being planned counts.
const newestScheduled = (now: Board) => {
  const newest = [...tasks(now)].sort((a, b) => String((b.state as { createdAt?: string }).createdAt ?? '').localeCompare(String((a.state as { createdAt?: string }).createdAt ?? '')))[0];
  return !!newest && !!(newest.state as { scheduledFor?: string }).scheduledFor;
};
const planned = (now: Board, start: Board) => taskScheduled(now, start) || newestScheduled(now);

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
      { node: 'mother-todo', target: '.todo-add', badge: 'TYPE', text: "Add something you'll do today: click **add a plan** and type it. A card shows its **day, time and length** — pick any, or just press **Enter**.", waitFor: { board: newTask }, hint: 'Waiting for a new task…' },
      { target: '[data-testid^="todo-plan-"]', node: 'mother-todo', badge: 'ITS CARD', text: 'The **calendar icon** on a row opens its **plan card**: a day (or any time), a time, how long, a deadline — and Focus, Done, Delete. Right-click → **When…** opens it too.' },
      { target: '[data-testid="task-node-root"]', badge: 'SAME TASK', text: 'That card on the board is **the same task**. Tick it here or in the list — both stay in step.' },
      { node: 'mother-calendar', also: ['mother-todo'], target: '[data-testid="calendar-grid-body"]', badge: 'PLAN IT', text: 'Now **plan it**: drag the task from the Todo onto a time today — now is fine. Or open its card and pick a time.', waitFor: { board: planned }, hint: 'Waiting for the task to land on the Calendar…' },
      { node: 'mother-clock', target: CLOCK, badge: 'CLOCK', text: 'Your plan is on the **Clock** too, around the edge. Every window shows the same day.' },
      { node: 'mother-pomo', target: '[data-testid="pomo-primary"]', badge: 'PRESS', text: 'When you start working, press **START**. The {pomo} timer records what you really do.', waitFor: { board: (now) => pomoRunning(now) }, hint: 'Waiting for START…' },
      { target: '[data-testid="pomo-break"]', badge: 'PRESS', text: 'Need a pause? **BREAK**. Your work so far is saved, and the break is timed on its own.', waitFor: { board: (now) => pomoOnBreak(now) }, hint: 'Waiting for BREAK…' },
      { target: '[data-testid="pomo-resume"]', node: 'mother-pomo', badge: 'PRESS', text: 'Back? **BACK TO WORK**.', waitFor: { board: (now) => !pomoOnBreak(now) }, hint: 'Waiting for BACK TO WORK…' },
      { target: '[data-testid="pomo-primary"]', badge: 'PRESS', text: 'Finished for now? **STOP**. Break = pause and come back; Stop = done for now, saved.', waitFor: { board: (now) => pomoStopped(now) }, hint: 'Waiting for STOP…' },
      { node: 'mother-calendar', target: CAL, badge: 'PLAN VS REAL', text: "Your recorded time sits **under the plan**. That's how you see how the day really went." },
      { node: 'mother-todo', target: `${TODO} .todo-check`, badge: 'TICK', text: 'Done with it? **Tick it.**', waitFor: { board: taskDone }, hint: 'Waiting for a tick…' },
      { node: 'mother-habit', target: '[data-testid="habit-add-input"]', badge: 'TYPE', text: 'One last thing: add a **habit** you want to keep (reading, a walk…). A card opens with **every day, any time** — press **Enter**.', waitFor: { board: habitAdded }, hint: 'Waiting for a new habit…' },
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
      { node: 'mother-todo', target: TODO, badge: 'TODO · PLANS', text: '**Todo** is your list of plans. Each one can have a **when** (a day and a time, or just a day), a **deadline**, and shows the time you really spent on it.' },
      { node: 'mother-calendar', target: CAL, badge: 'CALENDAR · PLAN', text: '**Calendar** is your plan: **drag plans onto it**, or **click empty hours** to add one. Classes and shifts are **repeating events** here. Recorded time sits next to the plan.' },
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
    summary: 'Add a plan with its day and time, tick it off',
    steps: [
      { node: 'mother-todo', target: TODO, badge: 'TODO', text: "This is your list. Let's **add a task**." },
      { target: '[data-testid="add-task-placeholder"]', badge: 'CLICK', text: 'Click **add a plan** at the bottom and type a name. A card shows its **day, time, length and deadline** — pick any of them, or just press **Enter**.', waitFor: { board: newTask }, hint: 'Waiting for a new task…' },
      { target: '[data-testid="add-task-placeholder"]', badge: 'SAY WHEN', text: 'Faster: say when as you type. **Gym tomorrow 18:00 1h** goes straight onto the Calendar; **Pay rent fri** is on Friday at any time; **by sat** gives it a deadline. The chips above the field show what Enter will do.' },
      { target: '[data-testid^="todo-plan-"]', badge: 'ITS CARD', text: 'Change it later from its **plan card**: click the **calendar icon** on the row (or right-click → **When…**). The same card opens when you click its block on the Calendar.' },
      { onlyIn: 'advanced', target: '[data-testid^="todo-tag-"]', badge: 'TAG', text: 'The **tag** (Code, Study…) groups time in Analytics. Click it to change it.' },
      { target: `${TODO} .todo-check`, badge: 'TICK', text: 'Done? **Tick the box.**', waitFor: { board: taskDone }, hint: 'Waiting for a tick…' },
      { node: 'mother-todo', target: TODO, text: 'Done tasks fold into **Done today**. The next day they leave the list — their recorded time stays in Analytics. **Untick** to reopen.' },
    ],
  },
  {
    id: 'calendar',
    title: 'Calendar — plan vs reality',
    summary: 'Drag or click to plan, any time, plan vs reality',
    steps: [
      { node: 'mother-calendar', target: CAL, badge: 'CALENDAR', text: 'The Calendar holds your **plan** (blocks) and **what really happened** (the thin track at the left of each day).' },
      { target: '[data-testid="calendar-grid-body"]', badge: 'DROP HERE', text: '**Drag a plan** from the Todo onto a time here to plan it.', waitFor: { board: taskScheduled }, hint: 'Waiting for you to drop a task on the grid…' },
      { target: '[data-testid="calendar-day-only-row"]', node: 'mother-calendar', badge: 'ANY TIME', text: 'On a day but **no set time**? Drop it in the **ANY TIME** strip under the day names. Drag it into the hours later to give it a time. A dashed **flag** there is a deadline.' },
      { target: '[data-testid="calendar-new"]', node: 'mother-calendar', badge: 'ADD HERE', text: '**Click empty hours** — or this **+** — to add something right on the Calendar: **Once** is a plan, **Repeats** is a class or a shift.' },
      { target: '[data-testid="calendar-grid-body"]', node: 'mother-calendar', badge: 'ITS CARD', text: '**Click a plan** to open its card: move it to another day or **any time**, change how long, set a deadline or a reminder, Focus, Done, Delete.' },
      { onlyIn: 'advanced', target: '[data-testid="calendar-grid-body"]', badge: 'HOW IT WENT', text: 'Once you work on it, the planned block says how it went: **"started 20m late"**, **"+30m over"**.' },
      { target: '[data-testid="calendar-reality-block"]', node: 'mother-calendar', badge: 'RECORDED', text: 'The thin track at the left of each day fills with **recorded time**. Click a filled stretch to see it; **double-click** its start or end time to fix it.' },
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
      { target: '[data-testid="habit-add-input"]', badge: 'TYPE', text: 'Click **add a habit**, type one. A card opens: **every day, any time** unless you pick days or a time. Press **Enter** to add it.', waitFor: { board: habitAdded }, hint: 'Waiting for a new habit…' },
      { target: `${HABIT} .habit-cell--today`, node: 'mother-habit', badge: 'TICK TODAY', text: "Did it today? Click **today's square**.", waitFor: { board: habitTicked }, hint: "Waiting for today's square…" },
      { node: 'mother-habit', target: HABIT, badge: 'CHANGE IT LATER', text: '**Right-click** a habit: **Days & time…** changes when (and times a week, an amount); rename, recolour or archive it below.' },
    ],
  },
  {
    id: 'routines',
    title: 'Repeating events',
    summary: 'A class or a shift on the Calendar, never ticked',
    steps: [
      { node: 'mother-calendar', target: CAL, badge: 'JUST HAPPENS', text: 'A class, a work shift, a weekly call: a **repeating event**. It sits on your Calendar every week and is never ticked or "missed". Habits are the things you tick.' },
      { node: 'mother-calendar', target: CAL, badge: 'ADD ONE', text: '**Click empty hours** (or the **+** in the header), name it **Class**, pick **Repeats** and its days, press **Enter**.', waitFor: { board: routineAdded }, hint: 'Waiting for a new repeating event…' },
      { node: 'mother-calendar', target: CAL, event: 'krnl:calendar-show-routines', badge: 'ON YOUR WEEK', text: 'It is a **hatched band** every week; your plans sit on top. The **Events** switch hides them, and the repeat button beside it lists them all.' },
      { node: 'mother-calendar', target: CAL, event: 'krnl:calendar-show-routines', badge: 'SKIP ONE', text: 'No class next time? **Click the band** and choose **Skip this one**. Only that day changes.', waitFor: { board: routineSkipped }, hint: 'Waiting for a skipped event…' },
      { node: 'mother-calendar', target: CAL, event: 'krnl:calendar-show-routines', badge: 'END, DON’T DELETE', text: 'Semester over? Click the band and choose **End after this day**: the days before stay. **Restart** is in the events list.', waitFor: { board: routineEnded }, hint: 'Waiting for an ended event… (or Skip)' },
    ],
  },
  {
    id: 'on-track',
    title: 'Staying on track',
    summary: 'Weekly targets, amounts, rest days, deadlines, reminders',
    steps: [
      { node: 'mother-habit', target: HABIT, badge: 'REAL LIFE', text: 'Not every week goes to plan. Four things keep you on track without lying to the app: **weekly targets**, **rest days**, **deadlines** and **reminders**.' },
      { node: 'mother-habit', target: HABIT, badge: 'TIMES A WEEK', text: '**Right-click** a habit, choose **Days & time…**, then **Times a week** — say **3**. Any days count, and the streak counts weeks that reach it.', waitFor: { board: targetSet }, hint: 'Waiting for a weekly target… (or Skip)' },
      { node: 'mother-habit', target: HABIT, badge: 'HOW MUCH', text: 'Some habits are an amount — **8 glasses**, **20 pages**. In **Days & time…** choose **Amount**: each click on the day adds one, and the day counts once it is reached.', waitFor: { board: amountSet }, hint: 'Waiting for an amount… (or Skip)' },
      { node: 'mother-habit', target: HABIT, badge: 'REST DAY', text: 'Sick or away? **Right-click** a habit you have not done today and choose **Rest today**. A rest day never breaks a streak — it shows as a quiet hatch.', waitFor: { board: restAdded }, hint: 'Waiting for a rest day… (or Skip)' },
      { node: 'mother-todo', target: TODO, badge: 'DEADLINE', text: 'When you do it and when it must be done can differ. **Right-click** a Todo row and choose **Deadline…** — the row shows a flag, the Calendar a dashed flag on that day in its **ANY TIME** strip, and the Clock lists it.', waitFor: { board: dueSet }, hint: 'Waiting for a deadline… (or Skip)' },
      { node: 'mother-todo', target: TODO, badge: 'REMIND ME', text: 'Want a nudge? **Right-click** a row, choose **When…**, give it a time and pick **Remind**. A notification comes before it starts, even with the window closed.', waitFor: { board: remindSet }, hint: 'Waiting for a reminder… (or Skip)' },
      { node: 'mother-todo', target: TODO, badge: "WON'T DO", text: "Not doing something any more? **Won't do** takes it off your list and the Calendar — not done and not missed. **UNDO** in the notice brings it back." },
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
      { mode: 'advanced', node: 'mother-todo', target: '[data-testid^="todo-tag-"]', badge: 'NEW IN ADVANCED', text: 'Tasks get **tags** (Code, Study…). **Right-click** a plan for **Focus on it**.' },
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
