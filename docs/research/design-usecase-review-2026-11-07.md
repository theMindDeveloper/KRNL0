# Design and use-case review — does each feature fit how people really plan?

**Date:** 2026-11-07 · **Trigger:** the user found that a habit like "No sugar" cannot repeat without a set time ([#217](https://github.com/theMindDeveloper/KRNL0/issues/217)). Earlier sweeps only checked that features work *as designed*; none asked whether the design fits real life. This review asks that question of every part of KRNL0, from the data model up.

**Method:** read each feature's data model (`types.ts`), its commands (UI + `krnl` CLI) and its requirements doc, and walk ordinary days through it — a student, someone with a 9-to-5, someone building habits. Each finding says what a person tries to do, what the model allows, and what that costs them. Severity: **High** = a common case cannot be expressed or loses data; **Medium** = it works but bends the user to the tool; **Low** = polish.

---

## 1. Time is mandatory where life has none (the root pattern)

The habit bug is one case of a pattern: **every plan and every routine must have a clock time.**

| # | What people do | What KRNL0 allows | Cost | Sev |
|---|---|---|---|---|
| 1.1 | "No sugar", "Read 20 pages", "Drink water" — tracked daily, done whenever | A repeating habit must have `timeOfDay` (`HabitSchedule`, ADR 0002) | Users invent a fake time; the habit then sits on the Calendar and Clock at that time and looks "missed" if not done then | **High** (#217) |
| 1.2 | "Pay rent this week", "Call mum on Sunday" — a day, no time | `scheduledFor` is a full local datetime on both `TaskState` and `TodoItem`; Month-view drop invents **09:00** (`MonthView.tsx`) | A Sunday plan becomes "Sunday 09:00", reads as *missed* at 09:01, triggers the replan prompt and Welcome back "slipped" | **High** |
| 1.3 | A whole-day thing: a trip, an exam day, a holiday | No all-day or multi-day item | Can't block a day; people fake a 24 h block | Medium |

**Direction:** make *time of day* optional everywhere, separate from *day*: `scheduledFor: "2026-11-08"` (date only) vs `"2026-11-08T14:30"`. Untimed items live in an "Anytime" row at the top of each day (Week/Day), as chips in Month, outside the Clock dial (a list under it), and never count as missed until the day is over. Habits get the same: days without a time.

## 2. Plans have no deadline, priority, or repeat

| # | What people do | What KRNL0 allows | Cost | Sev |
|---|---|---|---|---|
| 2.1 | "Tax form due Friday" — work on it any time before | Only *when I'll do it* (`scheduledFor`); no due date | The fixture already shows the hack: the deadline is in the title ("Send the tax form to Anna befo…") | **High** |
| 2.2 | Weekly review every Sunday, gym Mon/Wed/Fri as a *task* with notes and time | Only habits repeat; a task is one-off | Users re-create the same task each week, or misuse a habit (which has no duration, notes per instance, or calendar block length) | Medium |
| 2.3 | "This matters most today" | No priority / star / "top 3" | The Todo list is flat; nothing says what to do first | Medium |

## 3. Habits model only one kind of habit

| # | What people do | What KRNL0 allows | Cost | Sev |
|---|---|---|---|---|
| 3.1 | "Gym 3× a week, any days" | `daily`, `weekdays`, or fixed `weekly` days | A flexible target is impossible; fixing days makes streaks break on a good week | **High** |
| 3.2 | "8 glasses of water", "20 pages", "10k steps" | `log: string[]` — a date is done or not | No amount, no partial progress | Medium |
| 3.3 | Sick / travelling / rest day | Only a one-day "did it yesterday?" repair | A planned break kills the streak; people stop using it after one bad week | Medium |
| 3.4 | Stop a habit but keep its history | The settings popover can only **hard-delete** (F13); archive exists in the CLI only | Years of history gone with one click | **High** |
| 3.5 | "No sugar" — a habit to *avoid* | Same tick as "do" habits | Works, but the wording ("Start again today") assumes a do-habit; no "slipped" logging | Low |
| 3.6 | A Pomo session finishing ticks a habit | The edge now targets a habit **lane** (one habit each) and ticks that habit — correct. `habit-node.md` F7 still says "the first habit" | Doc only: F7 is stale and should be rewritten | Low |

## 4. Nothing reminds you

| # | What people do | What KRNL0 allows | Cost | Sev |
|---|---|---|---|---|
| 4.1 | "Remind me at 14:00 to call the dentist" | No reminders for tasks or habits; only Pomo session notifications | Plans pass silently; Welcome back catches up *after* the fact. For a day planner this is the main loop missing | **High** |
| 4.2 | Morning: "what's today?" | Day moments + Welcome back exist, but only on opening the app | If the app is not opened, nothing happens | Medium |

**Direction:** opt-in reminders per plan/habit (start, or N min before), a quiet daily "today" notification, both through the existing tray/pocket process so they work with the window closed.

## 5. Tracking time vs planning time

| # | What people do | What KRNL0 allows | Cost | Sev |
|---|---|---|---|---|
| 5.1 | Forgot to start the timer | Log-time dial and span editor exist | Good — keep | — |
| 5.2 | Track time for a plan without using Pomodoro rhythm | Observe mode covers it | Good — keep | — |
| 5.3 | See "planned 1 h, spent 1 h 40" per plan | Calendar block + Analytics plan-vs-actual | Good; the new Clock rail now shows it per day | — |
| 5.4 | Two things at once (call while walking) | One live span at a time | Acceptable — note only | Low |

## 6. Done is the only ending

| # | What people do | What KRNL0 allows | Cost | Sev |
|---|---|---|---|---|
| 6.1 | "Not doing this any more" | `done: boolean`; otherwise delete | A dropped plan either lies (done) or vanishes (delete); Analytics plan-vs-actual can't tell dropped from failed | Medium |
| 6.2 | Half done, continue tomorrow | Unschedule / replan exist | Good — keep | — |

## 7. Smaller fit issues found on the way

- **7.1** Every Todo item can spawn a task node on the canvas (Decision 20). On a real week (30+ items) the canvas fills with cards nobody arranged; consider spawning nodes only for plans with notes/sub-steps. *Medium*
- **7.2** Month-view chips show no time, so two plans on one day can't be ordered at a glance. *Low*
- **7.3** Calendar has one timezone; travellers' plans shift. *Low*

---

## Priorities (proposed order)

1. **Untimed plans and habits** (1.1, 1.2) — one model change: date-only `scheduledFor`, optional habit `timeOfDay`, an "Anytime" row. Also removes false "missed"/replan prompts.
2. **Habit archive in the UI + never hard-delete by default** (3.4) — small, prevents data loss.
3. **Reminders** (4.1) — the biggest missing loop for a planner.
4. **Flexible habit targets** (3.1) and **amounts** (3.2).
5. **Due dates** (2.1) and **repeating tasks** (2.2).
6. **Dropped state** (6.1), **rest days** (3.3); fix the stale `habit-node.md` F7 text (3.6).

Each needs an ADR (they change contracts in ADR 0001/0002/0016), a requirements doc per the repo workflow, a board migration, and matching `krnl` CLI commands.
