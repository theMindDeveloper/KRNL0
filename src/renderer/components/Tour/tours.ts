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

/** Examples a tour can add to an empty board (store/tourExamples.ts). */
export type ExampleKind = 'plan' | 'recorded' | 'habit' | 'event';

export type TourWait =
  | { click: string }
  | { board: (now: Board, atStart: Board) => boolean };

export interface TourStep {
  /** What the guide says (plain words, one idea). */
  text: string;
  /** The recorded voice's script (tourVoice.ts): the same idea written to be
   *  heard, in plain words — button names as words ("Escape", not "Esc"). No
   *  mood tags, no "[Brief pause]", no trailing "...": they make the voice
   *  drop at the end of a line (owner, 2026-11-09). Absent = the text, cleaned up. */
  say?: string;
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
  /** Only shown when the timer works this way: the stopwatch (Easy's Record,
   *  Advanced's OBSERVE) or Pomodoro sessions (Advanced's POMO) — their
   *  buttons differ (Back to work vs End break). */
  timer?: 'stopwatch' | 'pomo';
  /** A short tag on the spotlight ring, e.g. "PRESS" or "NEW IN ADVANCED". */
  badge?: string;
  /** The guide presses this for the user on entering the step (e.g. opens
   *  Settings to show where something lives); closed again on the next step. */
  press?: string;
  /** A window event fired on entering the step (e.g. `krnl:recap-show`). */
  event?: string;
  /** Buttons that end the tour by choosing a mode (replace Next). */
  choices?: ReadonlyArray<{ label: string; mode: 'easy' | 'advanced' }>;
  /** A second ring, e.g. where to drag FROM when `target` is where to drop. */
  from?: string;
  /** The second ring's tag ("FROM HERE"). */
  fromBadge?: string;
  /** Open the Calendar on today and scroll it to now (a drag step that must land today). */
  today?: boolean;
  /** Said under the text when the user did it, but not the way the step needs
   *  (dropped on another day). Null = nothing to say. */
  nudge?: (now: Board, atStart: Board) => string | null;
  /** A second button that ends this tour and starts another ("Show me Advanced"). */
  then?: { label: string; tour: string };
}

export interface Tour {
  id: string;
  title: string;
  summary: string;
  steps: TourStep[];
  /** A tour about something only one mode has (the Terminal: Advanced). */
  onlyIn?: 'easy' | 'advanced';
  /** What it shows that a new board doesn't have yet: added as examples
   *  when missing, removed when the tour ends (tourExamples.ts). */
  examples?: ExampleKind[];
}

/** The tours listed in a mode (menus); `krnl tour start` can still run any. */
export function toursIn(mode: 'easy' | 'advanced'): Tour[] {
  return TOURS.filter((t) => !t.onlyIn || t.onlyIn === mode);
}

/** The steps a user in `mode` sees (drops steps for the other mode, and for
 *  the other way the timer works). */
export function stepsFor(tour: Tour, mode: 'easy' | 'advanced', timer: 'stopwatch' | 'pomo' = 'stopwatch'): TourStep[] {
  return tour.steps.filter((s) => (!s.onlyIn || s.onlyIn === mode) && (!s.timer || s.timer === timer));
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
const noteAdded = (now: Board, start: Board) => now.nodes.filter((n) => n.kind === 'text').length > start.nodes.filter((n) => n.kind === 'text').length;
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
// The first-day plan must land TODAY, so the Clock (today only) shows it next.
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sched = (n: { state: unknown }) => String((n.state as { scheduledFor?: string }).scheduledFor ?? '');
/** Tasks planned (or moved) since the step began. */
const replanned = (now: Board, start: Board) => {
  const was = new Map(tasks(start).map((n) => [n.id, sched(n)]));
  return tasks(now).filter((n) => sched(n) && was.get(n.id) !== sched(n));
};
const plannedToday = (now: Board, start: Board) => {
  const today = ymd(new Date());
  if (replanned(now, start).some((n) => sched(n).startsWith(today))) return true;
  // Quick add ("Essay 16:00") already put the newest one on today.
  const newest = [...tasks(now)].sort((a, b) => String((b.state as { createdAt?: string }).createdAt ?? '').localeCompare(String((a.state as { createdAt?: string }).createdAt ?? '')))[0];
  return !!newest && sched(newest).startsWith(today) && tasks(start).some((n) => n.id === newest.id);
};
const notToday = (now: Board, start: Board): string | null => {
  const today = ymd(new Date());
  const off = replanned(now, start).find((n) => !sched(n).startsWith(today));
  if (!off) return null;
  const d = new Date(sched(off));
  const day = Number.isNaN(d.getTime()) ? 'another day' : d.toLocaleDateString('en-GB', { weekday: 'long' });
  return `That landed on ${day}. The Clock only shows today, so drag it onto today (the highlighted column), later than now.`;
};

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
      { say: "Hi! Let's plan one real thing and actually do it, together. It takes about four minutes. Press Next or Enter to go on, and Escape whenever you want to stop.", text: "Let's plan **one real thing** and do it together. It takes about 4 minutes. **Next** (or Enter) goes on, **Esc** stops." },
      { say: "First, add something you'll do today. Click \"add a plan\" and type it. A small card shows its day, its time and how long it takes. Pick any of them if you like, then press Enter to add it.", node: 'mother-todo', target: '.todo-add', badge: 'TYPE', text: "Add something you'll do today: click **add a plan** and type it. A card shows its **day, time and length** — pick any if you like, then press **Enter** to add it.", waitFor: { board: newTask }, hint: 'Waiting for a new task…' },
      { onlyIn: 'advanced', say: "See the little calendar icon on the row? It opens the plan card, with the day, the time and how long it takes. Once it has a time, you can add a reminder too. You can also right-click the row and choose \"When\".", target: '[data-testid^="todo-plan-"]', node: 'mother-todo', badge: 'ITS CARD', text: 'The **calendar icon** on a row opens its **plan card**: a day (or any time), a time and how long. Once it has a time, you can add a **reminder**. Right-click → **When…** opens it too.' },
      { onlyIn: 'easy', say: "See the little calendar icon on the row? It opens the plan card, with the day, the time and how long it takes. You can also right-click the row and choose \"When\".", target: '[data-testid^="todo-plan-"]', node: 'mother-todo', badge: 'ITS CARD', text: 'The **calendar icon** on a row opens its **plan card**: a day (or any time), a time and how long. Right-click → **When…** opens it too.' },
      { say: "And that card on the board is the very same task! Tick it here or in the list, and they always stay in step.", target: '[data-testid="task-node-root"]', badge: 'SAME TASK', text: 'That card on the board is **the same task**. Tick it here or in the list — both stay in step.' },
      { say: "Now let's plan it! Drag the task from your To-do list onto today in the Calendar, at a time later than now. Or open its card and pick a time today.", node: 'mother-calendar', also: ['mother-todo'], today: true, target: '[data-testid="week-col-{today}"]', badge: 'TO TODAY', from: TODO, fromBadge: 'FROM HERE', text: 'Now **plan it**: drag the task from the **Todo** onto **today** in the Calendar, at a time later than now. Or open its card and pick a time today.', waitFor: { board: plannedToday }, nudge: notToday, hint: 'Waiting for the task to land on today…' },
      { say: "There it is, on the Clock too, around the edge. Every window shows the same day.", node: 'mother-clock', target: CLOCK, badge: 'CLOCK', text: 'Your plan is on the **Clock** too, around the edge. Every window shows the same day.' },
      { say: "When you start working, press \"Start\". The {pomo} timer records what you really do.", node: 'mother-pomo', target: '[data-testid="pomo-primary"]', badge: 'PRESS', text: 'When you start working, press **START**. The {pomo} timer records what you really do.', waitFor: { board: (now) => pomoRunning(now) }, hint: 'Waiting for START…' },
      { timer: 'stopwatch', say: "Need a pause? Press \"Break\". Your work so far is saved, and the break is timed on its own.", target: '[data-testid="pomo-break"]', badge: 'PRESS', text: 'Need a pause? **BREAK**. Your work so far is saved, and the break is timed on its own.', waitFor: { board: (now) => pomoOnBreak(now) }, hint: 'Waiting for BREAK…' },
      { timer: 'stopwatch', say: "Back already? Press \"Back to work\"!", target: '[data-testid="pomo-resume"]', node: 'mother-pomo', badge: 'PRESS', text: 'Back? **BACK TO WORK**.', waitFor: { board: (now) => !pomoOnBreak(now) }, hint: 'Waiting for BACK TO WORK…' },
      { timer: 'stopwatch', say: "Finished for now? Press \"Stop\". Break means you pause and come back. Stop means you're done for now, and it's saved.", target: '[data-testid="pomo-primary"]', badge: 'PRESS', text: 'Finished for now? **STOP**. Break = pause and come back; Stop = done for now, saved.', waitFor: { board: (now) => pomoStopped(now) }, hint: 'Waiting for STOP…' },
      { timer: 'pomo', say: "Need a pause? Press the break button, the cup next to Pause. Your work so far is saved, and the break is timed on its own.", target: '[data-testid="pomo-break"]', node: 'mother-pomo', badge: 'PRESS', text: 'Need a pause? Press the **break** button (the cup next to PAUSE). Your work so far is saved, and the break is timed on its own.', waitFor: { board: (now) => pomoOnBreak(now) }, hint: 'Waiting for the break…' },
      { timer: 'pomo', say: "Back already? Press \"End break\". The break is saved, and the timer waits for your next session.", target: '[data-testid="pomo-primary"]', node: 'mother-pomo', badge: 'PRESS', text: 'Back? **END BREAK** saves the break; the timer waits for your next session. The **■** button stops a session any time.', waitFor: { board: (now) => !pomoOnBreak(now) }, hint: 'Waiting for END BREAK…' },
      { say: "Look at the Calendar. Your recorded time sits right next to the plan, in the thin strip at the left of today. That's how you see how the day really went.", node: 'mother-calendar', target: CAL, badge: 'PLAN VS REAL', text: "Your recorded time sits **next to the plan**, in the thin strip at the left of today. That's how you see how the day really went." },
      { say: "Done with it? Then tick it off, right there in the list!", node: 'mother-todo', target: `${TODO} .todo-check`, badge: 'TICK', text: 'Done with it? **Tick it.**', waitFor: { board: taskDone }, hint: 'Waiting for a tick…' },
      { say: "One last thing! Add a habit you want to keep, like reading or a walk. A card opens with every day, at any time. Press Enter to add it.", node: 'mother-habit', target: '[data-testid="habit-add-input"]', badge: 'TYPE', text: 'One last thing: add a **habit** you want to keep (reading, a walk…). A card opens with **every day, any time** — press **Enter** to add it.', waitFor: { board: habitAdded }, hint: 'Waiting for a new habit…' },
      { say: "Did it today? Then click today's square!", target: `${HABIT} .habit-cell--today`, node: 'mother-habit', badge: 'TICK TODAY', text: "Did it today? Click **today's square**.", waitFor: { board: habitTicked }, hint: "Waiting for today's square…" },
      { say: "Every evening ends like this: what you did today, in one card. Close it whenever you're ready.", event: 'krnl:recap-show', target: '[data-testid="day-recap"]', badge: 'YOUR DAY', text: "Every evening ends like this: **what you did today**, in one card. Close it when you're ready." },
      // Easy first; Advanced once Easy feels easy (easy-mode.md, first run).
      { event: 'krnl:day-moment-close', say: "You're in Easy mode: plan it, do it, see how it went. Give it a few days. When it feels easy, try Advanced! It adds tags and time by tag, focus sessions, naming what you recorded, planned versus spent, deadlines and reminders, weekly goals, and the terminal and AI. You can switch here any time: Settings, then Mode.", onlyIn: 'easy', press: GEAR, target: MODE, badge: 'LATER: ADVANCED', text: "You're in **Easy** mode: plan it, do it, see how it went. Give it a few days. When it feels easy, try **Advanced**: tags and time by tag, focus sessions, naming what you recorded, planned vs spent, deadlines and reminders, weekly goals, the terminal and AI. Switch here any time: **Settings → Mode**.", then: { label: 'See Advanced', tour: 'modes' } },
      { event: 'krnl:day-moment-close', say: "And that's the whole loop! Every window has its own short tour. You'll find them all in my menu.", target: ORB, badge: 'MORE', text: "That's the whole loop. Each window has a **short tour** in my menu." },
    ],
  },
  {
    id: 'welcome',
    examples: ['plan', 'recorded', 'habit'],
    title: 'Welcome tour',
    summary: 'What each window is for, in one minute',
    steps: [
      { say: "Hi, I'm your guide! This app is one board, with a window for each part of your day. Press Next or Enter to go on, and Escape to stop at any time.", text: "Hi — I'm your guide. KRNL0 is **one board** with a window for each part of your day. Press **Next** (or Enter) to go on, **Esc** to stop any time." },
      { say: "The {pomo} timer records what you actually do. Start it when you begin, and stop it when you finish. Only recorded time counts as time spent.", node: 'mother-pomo', target: POMO, badge: '{pomo}', text: '**{pomo}** records what you actually do. Start it when you begin, stop it when you finish — **only recorded time counts** as time spent.' },
      { say: "To-do is your list of plans. Each one can have a when, a day and a time or just a day. It can have a deadline, and it shows the time you really spent on it.", onlyIn: 'advanced', node: 'mother-todo', target: TODO, badge: 'TODO · PLANS', text: '**Todo** is your list of plans. Each one can have a **when** (a day and a time, or just a day), a **deadline**, and shows the time you really spent on it.' },
      { say: "To-do is your list of plans. Each one can have a when: a day and a time, or just a day.", onlyIn: 'easy', node: 'mother-todo', target: TODO, badge: 'TODO · PLANS', text: '**Todo** is your list of plans. Each one can have a **when**: a day and a time, or just a day.' },
      { say: "The Calendar is your plan. Drag plans onto it, or double-click empty hours to add one. Classes and shifts live here as repeating events, and your recorded time sits right next to the plan.", node: 'mother-calendar', target: CAL, badge: 'CALENDAR · PLAN', text: '**Calendar** is your plan: **drag plans onto it**, or **double-click empty hours** to add one. Classes and shifts are **repeating events** here. Recorded time sits next to the plan.' },
      { say: "The Clock shows today on a dial: the plan around the edge, and what you did as coloured wedges.", node: 'mother-clock', target: CLOCK, badge: 'CLOCK · TODAY', text: '**Clock** shows today on a dial — the **plan around the edge**, what you did as **coloured wedges**.' },
      { say: "Habits are the things you want to do regularly. Tick them off each day!", node: 'mother-habit', target: HABIT, badge: 'HABITS', text: '**Habits** are the things you want to do regularly. **Tick them off** each day.' },
      { say: "Analytics answers one question: where did my time go? Per day, and per task.", onlyIn: 'advanced', node: 'mother-analytics', target: ANALYTICS, badge: 'ANALYTICS', text: '**Analytics** answers "where did my time go" — **per day** and **per task**.' },
      { say: "Analytics answers one question: where did my time go? Per day, and per hour.", onlyIn: 'easy', node: 'mother-analytics', target: ANALYTICS, badge: 'ANALYTICS', text: '**Analytics** answers "where did my time go" — **per day** and **per hour**.' },
      { say: "The Terminal runs a real shell. Every part of the app has a kernel command, and Claude Code can work on your board from here.", onlyIn: 'advanced', node: 'mother-term', target: TERM, badge: 'TERMINAL', text: 'The **Terminal** runs a real shell. Every part of KRNL0 has a **krnl** command, and **Claude Code** can work on your board from here.' },
      { say: "You're in {mode} mode. You can switch here: Settings, then Mode. Advanced connects tasks, categories and focus, and the Easy and Advanced tour shows you the difference.", press: GEAR, target: MODE, badge: 'EASY / ADVANCED', text: "You're in **{mode}** mode. Switch here in **Settings → Mode** — Advanced connects tasks, categories and focus. The **Easy and Advanced** tour shows the difference." },
      { say: "And this is me! Ask me anything. I answer with Claude Code, and I can change your board for you. My menu also has a short tour of each window.", target: ORB, badge: 'ASK ME', text: 'And this is me. **Ask me anything**: I answer with Claude Code and can change your board for you. My menu also has **a short tour of each window**.' },
    ],
  },
  {
    id: 'pomo',
    title: '{pomo} — your timer',
    summary: 'Start, take a break, stop — try it for real',
    steps: [
      { say: "The {pomo} timer records what you really do. Let's record a short session together. It only takes a few seconds!", node: 'mother-pomo', target: POMO, badge: 'POMO', text: "The {pomo} timer records **what you really do**. Let's record a short session together — it takes a few seconds." },
      { say: "Here you say what you're doing. Pick a task, or a category like Code, and the time counts toward it.", onlyIn: 'advanced', timer: 'stopwatch', target: '[data-testid="pomo-now"]', badge: 'WHAT AM I DOING', text: 'Here you say **what you are doing**: pick a task, or a category like "Code" — the time then counts toward it.' },
      { say: "Pick which task this session is for, and its time counts toward that task. It's optional.", onlyIn: 'advanced', timer: 'pomo', target: '[data-testid="pomo-tag-select"]', badge: 'WHICH TASK', text: 'Pick **which task** the session is for — its time then counts toward that task. Optional.' },
      { say: "Press \"Start\"!", target: '[data-testid="pomo-primary"]', badge: 'PRESS', text: 'Press **START**.', waitFor: { board: (now) => pomoRunning(now) }, hint: 'Waiting for START…' },
      { say: "It's running! Started it by mistake? Hold the trash icon, and nothing is saved. Don't do it now, though.", timer: 'stopwatch', target: '[data-testid="pomo-discard"]', badge: 'HOLD', text: "It's running. Started by mistake? **Hold the trash icon** and nothing is saved. Don't do it now." },
      { say: "Need a pause? Press \"Break\". The work so far is saved, and the break is timed on its own.", timer: 'stopwatch', target: '[data-testid="pomo-break"]', badge: 'PRESS', text: 'Need a pause? Press **BREAK** — the work so far is saved, and the break is timed on its own.', waitFor: { board: (now) => pomoOnBreak(now) }, hint: 'Waiting for BREAK…' },
      { say: "Back from the break? Press \"Back to work\"!", timer: 'stopwatch', target: '[data-testid="pomo-resume"]', node: 'mother-pomo', badge: 'PRESS', text: 'Back from the break? Press **BACK TO WORK**.', waitFor: { board: (now) => !pomoOnBreak(now) }, hint: 'Waiting for BACK TO WORK…' },
      { say: "Now press \"Stop\". Your work and your break are saved, and they show on the Calendar and the Clock.", timer: 'stopwatch', target: '[data-testid="pomo-primary"]', badge: 'PRESS', text: 'Now press **STOP**. Your work and your break are saved and show on the **Calendar** and the **Clock**.', waitFor: { board: (now) => pomoStopped(now) }, hint: 'Waiting for STOP…' },
      { say: "Need a pause? Press the break button, the cup next to Pause. The work so far is saved, and the break is timed on its own.", timer: 'pomo', target: '[data-testid="pomo-break"]', node: 'mother-pomo', badge: 'PRESS', text: 'Need a pause? Press the **break** button (the cup next to PAUSE) — the work so far is saved, and the break is timed on its own.', waitFor: { board: (now) => pomoOnBreak(now) }, hint: 'Waiting for the break…' },
      { say: "Back? Press \"End break\". Work and break are saved, and show on the Calendar and the Clock. The square button stops a session at any time, and Pause holds it.", timer: 'pomo', target: '[data-testid="pomo-primary"]', node: 'mother-pomo', badge: 'PRESS', text: 'Back? Press **END BREAK**. Work and break are saved and show on the **Calendar** and the **Clock**. **■** stops a session any time; **PAUSE** holds it.', waitFor: { board: (now) => !pomoOnBreak(now) }, hint: 'Waiting for END BREAK…' },
      { say: "Forgot to press Start earlier? No problem! Right-click an empty time on the Calendar, and choose \"Log time here\".", node: 'mother-calendar', target: '[data-testid="calendar-grid-body"]', badge: 'FORGOT?', text: 'Forgot to press Start earlier? **Right-click** an empty time on the **Calendar** and choose **Log time here…** to add work you did but didn\'t record.' },
      { say: "Every recorded session is listed here. Open it to check one, or to delete a misclick.", target: '[data-testid="pomo-log-toggle"]', badge: 'YOUR SESSIONS', text: 'Every recorded session is listed here — open it to **check one** or **delete a misclick**.' },
    ],
  },
  {
    id: 'todo',
    title: 'Todo — your tasks',
    summary: 'Add a plan with its day and time, tick it off',
    steps: [
      { say: "This is your list. Let's add a task!", node: 'mother-todo', target: TODO, badge: 'TODO', text: "This is your list. Let's **add a task**." },
      { say: "Click \"add a plan\" at the bottom, and type a name. A card shows its day, time and length. Pick any if you like, then press Enter to add it.", target: '[data-testid="add-task-placeholder"]', badge: 'CLICK', text: 'Click **add a plan** at the bottom and type a name. A card shows its **day, time and length** — pick any if you like, then press **Enter** to add it.', waitFor: { board: newTask }, hint: 'Waiting for a new task…' },
      { say: "Faster: say when as you type. \"Gym tomorrow at six in the evening, one hour\" goes straight onto the Calendar. \"Pay rent Friday\" lands on Friday, at any time. And \"by Saturday\" gives it a deadline. The card above the field shows what Enter will do.", onlyIn: 'advanced', target: '[data-testid="add-task-placeholder"]', badge: 'SAY WHEN', text: 'Faster: say when as you type. **Gym tomorrow 18:00 1h** goes straight onto the Calendar; **Pay rent fri** is on Friday at any time; **by sat** gives it a deadline. The card above the field shows what Enter will do.' },
      { say: "Faster: say when as you type. \"Gym tomorrow at six in the evening, one hour\" goes straight onto the Calendar, and \"Pay rent Friday\" lands on Friday, at any time. The card above the field shows what Enter will do.", onlyIn: 'easy', target: '[data-testid="add-task-placeholder"]', badge: 'SAY WHEN', text: 'Faster: say when as you type. **Gym tomorrow 18:00 1h** goes straight onto the Calendar; **Pay rent fri** is on Friday at any time. The card above the field shows what Enter will do.' },
      { say: "Change it later from its plan card: click the calendar icon on the row, or right-click, then \"When\". The same card opens when you click its block on the Calendar.", target: '[data-testid^="todo-plan-"]', badge: 'ITS CARD', text: 'Change it later from its **plan card**: click the **calendar icon** on the row (or right-click → **When…**). The same card opens when you click its block on the Calendar.' },
      { say: "The tag, like Code or Study, groups your time in Analytics. Click it to change it.", onlyIn: 'advanced', target: '[data-testid^="todo-tag-"]', badge: 'TAG', text: 'The **tag** (Code, Study…) groups time in Analytics. Click it to change it.' },
      { say: "Done? Then tick the little box on its row!", target: `${TODO} .todo-check`, badge: 'TICK', text: 'Done? **Tick the box.**', waitFor: { board: taskDone }, hint: 'Waiting for a tick…' },
      { say: "Done tasks fold into \"Done today\". The next day they leave the list, and their recorded time stays in Analytics. Untick one to reopen it.", node: 'mother-todo', target: TODO, text: 'Done tasks fold into **Done today**. The next day they leave the list — their recorded time stays in Analytics. **Untick** to reopen.' },
    ],
  },
  {
    id: 'calendar',
    examples: ['plan', 'recorded'],
    title: 'Calendar — plan vs reality',
    summary: 'Drag or click to plan, any time, plan vs reality',
    steps: [
      { say: "The Calendar holds your plan, the blocks, and what really happened: the thin track at the left of each day.", node: 'mother-calendar', target: CAL, badge: 'CALENDAR', text: 'The Calendar holds your **plan** (blocks) and **what really happened** (the thin track at the left of each day).' },
      { say: "Drag a plan from the To-do onto a time here, to plan it.", target: '[data-testid="calendar-grid-body"]', node: 'mother-calendar', also: ['mother-todo'], from: TODO, fromBadge: 'FROM HERE', badge: 'DROP HERE', text: '**Drag a plan** from the **Todo** onto a time here to plan it.', waitFor: { board: taskScheduled }, hint: 'Waiting for you to drop a task on the grid…' },
      { say: "On a day, but no set time? Drop it in the \"any time\" strip under the day names, and drag it into the hours later to give it a time. A dashed flag there is a deadline.", onlyIn: 'advanced', target: '[data-testid="calendar-day-only-row"]', node: 'mother-calendar', badge: 'ANY TIME', text: 'On a day but **no set time**? Drop it in the **ANY TIME** strip under the day names. Drag it into the hours later to give it a time. A dashed **flag** there is a deadline.' },
      { say: "On a day, but no set time? Drop it in the \"any time\" strip under the day names, and drag it into the hours later to give it a time.", onlyIn: 'easy', target: '[data-testid="calendar-day-only-row"]', node: 'mother-calendar', badge: 'ANY TIME', text: 'On a day but **no set time**? Drop it in the **ANY TIME** strip under the day names. Drag it into the hours later to give it a time.' },
      { say: "Double-click empty hours, or press this plus, to add a plan right on the Calendar. Switch it to \"Repeats\" for a class or a shift that comes back every week.", target: '[data-testid="calendar-new"]', node: 'mother-calendar', badge: 'ADD HERE', text: '**Double-click empty hours** — or this **+** — to add a plan right on the Calendar. Switch it to **Repeats** for a class or a shift that comes back every week.' },
      { onlyIn: 'advanced', say: "Click a plan to open its card. Move it to another day or to any time, change how long it takes, set a reminder, mark it done, or delete it.", target: '[data-testid="calendar-grid-body"]', node: 'mother-calendar', badge: 'ITS CARD', text: '**Click a plan** to open its card: move it to another day or **any time**, change how long, set a reminder, mark it done or delete it.' },
      { onlyIn: 'easy', say: "Click a plan to open its card. Move it to another day or to any time, change how long it takes, mark it done, or delete it.", target: '[data-testid="calendar-grid-body"]', node: 'mother-calendar', badge: 'ITS CARD', text: '**Click a plan** to open its card: move it to another day or **any time**, change how long, mark it done or delete it.' },
      { say: "Once you work on it, the planned block tells you how it went: \"started twenty minutes late\", or \"thirty minutes over\".", onlyIn: 'advanced', target: '[data-testid="calendar-grid-body"]', badge: 'HOW IT WENT', text: 'Once you work on it, the planned block says how it went: **"started 20m late"**, **"+30m over"**.' },
      { say: "The thin track at the left of each day fills with recorded time. Click a filled stretch to see it, and double-click its start or end time to fix it.", target: '[data-testid="calendar-reality-block"]', node: 'mother-calendar', badge: 'RECORDED', text: 'The thin track at the left of each day fills with **recorded time**. Click a filled stretch to see it; **double-click** its start or end time to fix it.' },
      { say: "Forgot to record something? Right-click an empty time, and choose \"Log time here\".", target: '[data-testid="calendar-grid-body"]', badge: 'RIGHT-CLICK', text: 'Forgot to record something? **Right-click** an empty time and choose **Log time here…**' },
    ],
  },
  {
    id: 'clock',
    examples: ['plan', 'recorded'],
    title: 'Clock — today at a glance',
    summary: 'The dial, a session, the week',
    steps: [
      { say: "The Clock shows today. Planned tasks run around the edge, and recorded work fills the face.", node: 'mother-clock', target: CLOCK, badge: 'CLOCK', text: 'The Clock shows today. **Planned tasks** run around the edge; **recorded work** fills the face.' },
      { say: "Click a coloured wedge to see that session, or right-click empty time to log time there.", target: '[data-testid="clock-dial"]', badge: 'CLICK · RIGHT-CLICK', text: '**Click** a coloured wedge to see that session — or **right-click** empty time to log time there.' },
      { say: "Press \"Week\" to see your last seven days as clocks!", target: '[data-testid="clock-week-toggle"]', badge: 'PRESS', text: 'Press **WEEK** to see your last 7 days as clocks.', waitFor: { click: '[data-testid="clock-week-toggle"]' }, hint: 'Waiting for WEEK…' },
      { say: "Each clock is a day: the morning inside, the afternoon in the outer ring. Only today moves. Click a day to open it.", target: '[data-testid="clock-week"]', badge: 'YOUR WEEK', text: 'Each clock is a day: **morning inside**, **afternoon in the outer ring**. Only today moves. Click a day to open it.' },
    ],
  },
  {
    id: 'habits',
    title: 'Habits',
    summary: 'Add a habit, tick it off',
    steps: [
      { say: "Habits are the things you want to do regularly, like reading, exercise or a weekly review.", node: 'mother-habit', target: HABIT, badge: 'HABITS', text: 'Habits are things you want to do **regularly** — reading, exercise, a weekly review.' },
      { say: "Click \"add a habit\" and type one. A card opens: every day, at any time, unless you pick days or a time. Press Enter to add it.", onlyIn: 'easy', target: '[data-testid="habit-add-input"]', badge: 'TYPE', text: 'Click **add a habit**, type one. A card opens: **every day, any time** unless you pick days or a time. Press **Enter** to add it.', waitFor: { board: habitAdded }, hint: 'Waiting for a new habit…' },
      { say: "Click \"add a habit\" and type one. A card opens: every day, at any time, unless you pick days, times a week, a time, or a goal, like eight glasses. Press Enter to add it.", onlyIn: 'advanced', target: '[data-testid="habit-add-input"]', badge: 'TYPE', text: 'Click **add a habit**, type one. A card opens: **every day, any time** unless you pick days, **times a week**, a time or a **goal** (8 glasses). Press **Enter** to add it.', waitFor: { board: habitAdded }, hint: 'Waiting for a new habit…' },
      { say: "Did it today? Then click today's square!", target: `${HABIT} .habit-cell--today`, node: 'mother-habit', badge: 'TICK TODAY', text: "Did it today? Click **today's square**.", waitFor: { board: habitTicked }, hint: "Waiting for today's square…" },
      { say: "Your habit also has a card on the board. It shows the week, and today's square is the button. Click it to tick today!", target: '[data-card="habit"]', badge: 'ON THE BOARD', text: 'Your habit also has a **card on the board**: its week, and **today’s square is the button**. Click it to tick today.' },
      { say: "Right-click a habit. \"Days and time\" changes when it happens, and \"Rest today\" keeps your streak on a sick day. Below, you can rename, recolour or archive it.", node: 'mother-habit', target: HABIT, badge: 'CHANGE IT LATER', text: '**Right-click** a habit: **Days & time…** changes its days and time; **Rest today** keeps a streak on a sick day; rename, recolour or archive it below.' },
    ],
  },
  {
    id: 'routines',
    title: 'Repeating events',
    summary: 'A class or a shift on the Calendar, never ticked',
    steps: [
      { say: "A class, a work shift, a weekly call: that's a repeating event. It sits on your Calendar every week, and it's never ticked or missed. Habits are the things you tick.", node: 'mother-calendar', target: CAL, badge: 'JUST HAPPENS', text: 'A class, a work shift, a weekly call: a **repeating event**. It sits on your Calendar every week and is never ticked or "missed". Habits are the things you tick.' },
      { say: "Press the plus in the Calendar's header, or double-click empty hours, and pick \"Repeats\". Name it Class, pick its days and time, and press Enter.", node: 'mother-calendar', target: '[data-testid="calendar-new"]', badge: 'ADD ONE', text: 'Press the **+** in the Calendar\'s header (or double-click empty hours) and pick **Repeats**. Name it **Class**, pick its days and time, press **Enter**.', waitFor: { board: routineAdded }, hint: 'Waiting for a new repeating event…' },
      { say: "It has a card on the board too! It's never ticked: its page shows the next date, with \"Skip this one\", and \"Show\" on the Calendar.", target: '[data-card="event"]', badge: 'ON THE BOARD', text: 'It has a **card on the board** too. It is never ticked: its page shows the **next date**, with **Skip this one** and **Show** on the Calendar.' },
      { say: "On the Calendar it's a hatched band, every week, with your plans on top. The \"Events\" switch hides them, and the list button in the header shows them all.", onlyIn: 'advanced', node: 'mother-calendar', target: CAL, event: 'krnl:calendar-show-routines', badge: 'ON YOUR WEEK', text: 'It is a **hatched band** every week; your plans sit on top. The **Events** switch hides them, and the **list** button in the header shows them all.' },
      { say: "On the Calendar it's a hatched band, every week, with your plans on top. The list button in the header shows all your repeating events.", onlyIn: 'easy', node: 'mother-calendar', target: CAL, event: 'krnl:calendar-show-routines', badge: 'ON YOUR WEEK', text: 'It is a **hatched band** every week; your plans sit on top. The **list** button in the header shows all your repeating events.' },
      { say: "No class next time? Click the band, and choose \"Skip this one\". Only that day changes.", node: 'mother-calendar', target: CAL, event: 'krnl:calendar-show-routines', badge: 'SKIP ONE', text: 'No class next time? **Click the band** and choose **Skip this one**. Only that day changes.', waitFor: { board: routineSkipped }, hint: 'Waiting for a skipped event…' },
      { say: "Semester over? Click the band and choose \"End after this day\". The days before it stay, and \"Restart\" is in the events list.", node: 'mother-calendar', target: CAL, event: 'krnl:calendar-show-routines', badge: 'END, DON’T DELETE', text: 'Semester over? Click the band and choose **End after this day**: the days before stay. **Restart** is in the events list.', waitFor: { board: routineEnded }, hint: 'Waiting for an ended event… (or Skip)' },
    ],
  },
  {
    id: 'on-track',
    examples: ['plan', 'habit'],
    title: 'Staying on track',
    summary: 'Weekly targets, amounts, rest days, deadlines, reminders',
    steps: [
      { say: "Not every week goes to plan, and that's fine! Four things keep you on track without lying to the app: weekly targets, rest days, deadlines and reminders.", onlyIn: 'advanced', node: 'mother-habit', target: HABIT, badge: 'REAL LIFE', text: 'Not every week goes to plan. Four things keep you on track without lying to the app: **weekly targets**, **rest days**, **deadlines** and **reminders**.' },
      { say: "Not every week goes to plan, and that's fine! Two things keep you on track without lying to the app: rest days, and \"Won't do\".", onlyIn: 'easy', node: 'mother-habit', target: HABIT, badge: 'REAL LIFE', text: 'Not every week goes to plan. Two things keep you on track without lying to the app: **rest days** and **Won\u2019t do**.' },
      { say: "Right-click a habit, choose \"Days and time\", then \"Times a week\", say three. Any days count, and the streak counts the weeks that reach it.", onlyIn: 'advanced', node: 'mother-habit', target: HABIT, badge: 'TIMES A WEEK', text: '**Right-click** a habit, choose **Days & time…**, then **Times a week** — say **3**. Any days count, and the streak counts weeks that reach it.', waitFor: { board: targetSet }, hint: 'Waiting for a weekly target… (or Skip)' },
      { say: "Some habits are an amount, like eight glasses or twenty pages. In \"Days and time\", set a goal. Each click on the day adds one, and the day counts once the goal is reached.", onlyIn: 'advanced', node: 'mother-habit', target: HABIT, badge: 'HOW MUCH', text: 'Some habits are an amount — **8 glasses**, **20 pages**. In **Days & time…** set a **Goal**: each click on the day adds one, and the day counts once the goal is reached.', waitFor: { board: amountSet }, hint: 'Waiting for an amount… (or Skip)' },
      { say: "Sick or away? Right-click a habit you haven't done today, and choose \"Rest today\". A rest day never breaks a streak. It shows as a quiet hatch.", node: 'mother-habit', target: HABIT, badge: 'REST DAY', text: 'Sick or away? **Right-click** a habit you have not done today and choose **Rest today**. A rest day never breaks a streak — it shows as a quiet hatch.', waitFor: { board: restAdded }, hint: 'Waiting for a rest day… (or Skip)' },
      { say: "When you do something and when it must be done can differ. Right-click a To-do row and choose \"Deadline\". The row shows a flag, the Calendar a dashed flag on that day, and the Clock lists it.", onlyIn: 'advanced', node: 'mother-todo', target: TODO, badge: 'DEADLINE', text: 'When you do it and when it must be done can differ. **Right-click** a Todo row and choose **Deadline…** — the row shows a flag, the Calendar a dashed flag on that day in its **ANY TIME** strip, and the Clock lists it.', waitFor: { board: dueSet }, hint: 'Waiting for a deadline… (or Skip)' },
      { onlyIn: 'advanced', say: "Want a nudge? Right-click a row, choose \"When\", give it a time, and set a reminder. A notification comes before it starts, even with the window closed!", node: 'mother-todo', target: TODO, badge: 'REMIND ME', text: 'Want a nudge? **Right-click** a row, choose **When…**, give it a time and set a **Reminder**. A notification comes before it starts, even with the window closed.', waitFor: { board: remindSet }, hint: 'Waiting for a reminder… (or Skip)' },
      { say: "Not doing something any more? \"Won't do\" takes it off your list and the Calendar: not done, and not missed. \"Undo\", in the notice, brings it back.", node: 'mother-todo', target: TODO, badge: "WON'T DO", text: "Not doing something any more? **Won't do** takes it off your list and the Calendar — not done and not missed. **UNDO** in the notice brings it back." },
    ],
  },
  {
    id: 'analytics',
    examples: ['plan', 'recorded'],
    title: 'Analytics — where the time went',
    summary: 'Pages, time per task, planned vs spent',
    steps: [
      { say: "Analytics turns your recorded time into answers!", node: 'mother-analytics', target: ANALYTICS, badge: 'ANALYTICS', text: 'Analytics turns your **recorded time** into answers.' },
      { say: "Each icon is a page: summary, activity, hours, time per task, and more. The name shows next to them.", onlyIn: 'advanced', target: '[data-testid="analytics-page-nav"]', badge: 'PAGES', text: '**Each icon is a page** — summary, activity, hours, time per task, and more. The name shows next to them.' },
      { say: "Each icon is a page: summary, activity, hours, and more. The name shows next to them.", onlyIn: 'easy', target: '[data-testid="analytics-page-nav"]', badge: 'PAGES', text: '**Each icon is a page** — summary, activity, hours, and more. The name shows next to them.' },
      { say: "Open the \"Time per task\" page.", onlyIn: 'advanced', target: '[data-testid="analytics-page-log"]', badge: 'CLICK', text: 'Open the **Time per task** page.', waitFor: { click: '[data-testid="analytics-page-log"]' }, hint: 'Waiting for the Time per task icon…' },
      { say: "Every row is a task, in its own colour, and every square is a day, with the minutes in it. On the right: worked, over planned. Below: time per tag.", onlyIn: 'advanced', target: '[data-testid="time-log-heatmap"]', node: 'mother-analytics', badge: 'TIME PER TASK', text: '**Every row is a task** in its own colour, **every square a day** with the minutes in it. On the right: **worked / planned**. Below: time per tag.' },
      { say: "\"Planned versus spent\" puts each task's estimate next to the time you really spent.", onlyIn: 'advanced', target: '[data-testid="analytics-page-estimates"]', badge: 'PLANNED VS SPENT', text: '**Planned vs spent** puts each task\u2019s estimate next to the time you really spent.' },
      { say: "Open the \"Hours\" page.", onlyIn: 'easy', target: '[data-testid="analytics-page-hours"]', badge: 'CLICK', text: 'Open the **Hours** page.', waitFor: { click: '[data-testid="analytics-page-hours"]' }, hint: 'Waiting for the Hours icon…' },
      { say: "Every row is a day of the week, and every column an hour. The stronger the colour, the more you recorded then. It shows when you usually work.", onlyIn: 'easy', target: '[data-card-id="overview.dowHour"]', node: 'mother-analytics', badge: 'HOURS', text: '**Every row is a day of the week**, every column an hour: the stronger the colour, the more you recorded then. It shows **when** you usually work.' },
      { say: "Advanced mode adds three pages: \"Planned versus spent\", \"Time by tag\" and \"Time per task\". You can switch here: Settings, then Mode.", onlyIn: 'easy', press: GEAR, target: MODE, badge: 'IN ADVANCED', text: '**Advanced** mode adds three pages: **Planned vs spent**, **Time by tag** and **Time per task**. Switch here, in **Settings → Mode**.' },
    ],
  },
  {
    id: 'modes',
    examples: ['plan', 'recorded'],
    title: 'Easy and Advanced',
    summary: 'Where to switch, and what Advanced adds — live',
    // A live demo: it shows where the switch is, then switches the app to the
    // mode each step talks about and rings what changed. The user's own mode
    // comes back at the end unless they pick one.
    steps: [
      { say: "The app has two modes, on the same board, with the same data. Only what you see changes. You're in {mode} mode right now.", text: "KRNL0 has **two modes** on the same board and the same data — only what you see changes. You're in **{mode}** mode right now." },
      { say: "This is where you switch: Settings, then Mode. Easy keeps it simple. Advanced connects tasks, categories and focus. Let me show you both!", press: GEAR, target: MODE, badge: 'SWITCH HERE', text: 'This is where you switch: **Settings → Mode**. **Easy** keeps it simple. **Advanced** connects tasks, categories and focus. Let me show you both.' },
      { say: "In Easy, the timer is called Record: a plain stopwatch, with Start, Break and Stop. Nothing to set up, nothing to name.", mode: 'easy', node: 'mother-pomo', target: POMO, badge: 'EASY', text: 'In **Easy**, the timer is called **Record**: a plain **stopwatch** with Start, Break, Stop. Nothing to set up, nothing to name.' },
      { say: "I've switched to Advanced, and this switch appeared! Pomo gives you classic twenty-five minute sessions with breaks. Observe keeps the stopwatch.", mode: 'advanced', node: 'mother-pomo', target: '[aria-label="Pomo mode"]', badge: 'NEW IN ADVANCED', text: "I've switched to **Advanced** — this switch appeared. **POMO** gives classic 25-minute sessions with breaks; **OBSERVE** keeps the stopwatch." },
      { say: "Recorded sessions can be named. Give each one a task or a category, so you know what the time was for.", mode: 'advanced', node: 'mother-pomo', target: '[data-testid="pomo-log-toggle"]', badge: 'MORE IN ADVANCED', text: 'Recorded sessions can be **named**: give each one a task or a category, so you know what the time was for.' },
      { say: "Tasks get tags, like Code or Study. And right-click a plan for \"Focus on it\".", mode: 'advanced', node: 'mother-todo', target: '[data-testid^="todo-tag-"]', badge: 'NEW IN ADVANCED', text: 'Tasks get **tags** (Code, Study…). **Right-click** a plan for **Focus on it**.' },
      { say: "Plans get deadlines, like \"by Friday\", and reminders. And cards can be chained. A card's \"Add next\" plans what comes after, and wires show the order.", mode: 'advanced', target: '[data-testid="task-node-root"]', badge: 'NEW IN ADVANCED', text: 'Plans get **deadlines** ("by Friday") and **reminders**, and cards can be **chained**: a card\'s **Add next** plans what comes after, and wires show the order.' },
      { say: "The Calendar gets layers: show or hide recorded time, habits and events, and a zoom for the hours.", mode: 'advanced', node: 'mother-calendar', target: '[data-testid="week-legend"]', badge: 'NEW IN ADVANCED', text: 'The Calendar gets **layers** — show or hide recorded time, habits and events — and a zoom for the hours.' },
      { say: "And the board grows: several canvases, frames to group cards, the Terminal with Claude Code, and weekly targets and goals for your habits!", mode: 'advanced', target: '[data-testid="topbar-canvas-switcher"]', badge: 'NEW IN ADVANCED', text: 'And the board grows: **several canvases**, **frames** to group cards, the **Terminal** with Claude Code, and weekly targets and goals for habits.' },
      { say: "\"Planned versus spent\": each task's estimate, next to the time you really spent on it.", mode: 'advanced', node: 'mother-analytics', target: '[data-testid="analytics-page-estimates"]', badge: 'NEW PAGE', text: '**Planned vs spent**: each task\u2019s estimate next to the time you really spent on it.' },
      { say: "\"Time by tag\": where your hours went. Code, study, health, and more.", mode: 'advanced', node: 'mother-analytics', target: '[data-testid="analytics-page-tags"]', badge: 'NEW PAGE', text: '**Time by tag**: where your hours went — Code, Study, Health…' },
      { say: "Back in Easy, those pages are gone. The overview stays: planned, worked, breaks, tasks done, and habits.", mode: 'easy', node: 'mother-analytics', target: '[data-testid="analytics-page-nav"]', badge: 'EASY', text: 'Back in **Easy** — those pages are gone. The overview stays: **planned, worked, breaks, tasks done, habits**.' },
      { say: "So, which one do you want? You can come back here any time: Settings, then Mode.", press: GEAR, target: MODE, badge: 'PICK ONE', text: 'Which one do you want? You can **come back here any time** — Settings → Mode.', choices: [{ label: 'Keep Easy', mode: 'easy' }, { label: 'Use Advanced', mode: 'advanced' }] },
    ],
  },
  {
    id: 'board',
    examples: ['plan', 'habit', 'event'],
    title: 'The board',
    summary: 'Cards, notes, Show, and lining things up',
    steps: [
      { say: "This is your board. Every plan, habit and repeating event has a card here, and you can put your own notes and pictures around them.", target: '.react-flow', badge: 'YOUR BOARD', text: 'This is your **board**. Every plan, habit and repeating event has a **card** here, and you can put your own notes and pictures around them.' },
      { say: "The toolbar adds things: a text note, a sticky note, a shape, an image, and the pen.", onlyIn: 'easy', target: '[data-testid="dock"]', badge: 'TOOLBAR', text: 'The **toolbar** adds things: a **text** note, a **sticky note**, a shape, an **image** and the **pen**.' },
      { say: "The toolbar adds things: a text note, a sticky note, a shape, an image, the pen, and a frame to group cards.", onlyIn: 'advanced', target: '[data-testid="dock"]', badge: 'TOOLBAR', text: 'The **toolbar** adds things: a **text** note, a **sticky note**, a shape, an **image**, the **pen** and a **frame** to group cards.' },
      { say: "Add a sticky note: press this, or the S key, then type on it.", target: '[data-testid="dock-btn-sticky"]', badge: 'PRESS', text: 'Add a **sticky note**: press this (or the key **S**), then type on it.', waitFor: { board: noteAdded }, hint: 'Waiting for a sticky note…' },
      { say: "Right-click a plan's card and choose \"Show\". It lights up here and on the Calendar, so you always find it. Plans with a day have it.", target: '[data-testid="task-node-root"]', badge: 'SHOW', text: '**Right-click** a plan’s card and choose **Show** (plans with a day have it): it lights up here and on the Calendar, so you always find it.' },
      { say: "Habits and repeating events have cards too. On a habit, today's square ticks it. An event shows its next date, with \"Skip this one\" and \"Show\".", target: '[data-card="habit"], [data-card="event"]', badge: 'HABITS & EVENTS', text: 'Habits and repeating events have cards too. On a habit, **today’s square** ticks it; an event shows its **next date**, with **Skip this one** and **Show**.' },
      { say: "Want things to line up? Settings, Canvas, \"Align to grid\". What you move settles into a neat spot, never on top of something. Cards only, or everything.", press: GEAR, target: '[data-testid="settings-align-grid"]', badge: 'LINE UP', text: 'Want things to line up? **Settings → Canvas → Align to grid**: what you move settles into a neat spot, never on top of something. **Cards only**, or **Everything**.' },
      { say: "Need more room? Make another canvas here, one per project. Your windows are the same on every canvas.", onlyIn: 'advanced', target: '[data-testid="topbar-canvas-switcher"]', badge: 'MORE ROOM', text: 'Need more room? Make **another canvas** here, one per project. Your windows are the same on every canvas.' },
      { say: "Drag from the dot on a card's side to another card, to put plans in order. The wire shows what comes next.", onlyIn: 'advanced', target: '[data-testid="task-node-root"]', badge: 'IN ORDER', text: '**Drag from the dot** on a card’s side to another card to put plans **in order**: the wire shows what comes next.' },
      { say: "That's the board! Ask me to show something, add a note, or tidy up. I can change it for you.", target: ORB, badge: 'ASK ME', text: 'That’s the board. **Ask me** to show something, add a note or tidy up: I can change it for you.' },
    ],
  },
  {
    id: 'terminal',
    onlyIn: 'advanced',
    title: 'Terminal & AI',
    summary: 'The krnl commands and Claude Code',
    steps: [
      { say: "The Terminal runs a real shell. Everything in the app can also be done with kernel commands. Try \"kernel help\"!", node: 'mother-term', target: TERM, badge: 'TERMINAL', text: 'The Terminal runs a real shell. **Everything in KRNL0** can also be done with **krnl** commands — try **krnl help**.' },
      { say: "Click me, the orb, to open my menu.", target: ORB, badge: 'CLICK', text: 'Click me — **the orb** — to open my menu.', waitFor: { click: ORB }, hint: 'Waiting for you to click the orb…' },
      { say: "\"Claude code\" starts Claude Code in the terminal, ready to work on your board. It runs without asking permission for each step.", target: '[data-testid="orb-claude-bypass"]', badge: 'CLAUDE CODE', text: '**claude code** starts Claude Code in the terminal, ready to work on your board. It runs **without asking permission** for each step.' },
    ],
  },
];

export function tourById(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id);
}
