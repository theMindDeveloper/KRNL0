# What changed, where to see it, and why

Written 2026-11-19, after the overnight pass. Everything here is on the branch `feat/unified-windows` (draft PR #257, on top of #253 and #251). The dev app from this worktree shows all of it; restart it with `npm run dev` if it is closed.

Nothing is merged or released. Typecheck is clean and all 2,647 tests pass (the one test that had been failing for days depended on the real date; it is fixed).

## The rule behind every change

Change the app that exists: same windows, same data, same commands, same fonts and colours. No new mode, layout or look. Each change either puts the same job in the same place, or shows less by default with the rest one step away.

I got this wrong twice before reaching it (a set of redesign drafts, then a third "Line" layout). Both are dropped. The Line layout's branch is kept and its PR #255 is closed.

## 1. One frame for every window

**What:** every window has the same header (name on the left; view switch, then buttons, on the right; 36px), the same time row (‹ date › Today; 32px) and the same footer (the add field or the main button; 44px).

**Where to see it:** look along the top row of windows in Station. The four headers are the same height, and the four bottoms sit on one line: START, add a plan, add a habit, add a plan.

| Window | What moved |
|---|---|
| Calendar | DAY / WEEK / MONTH / YEAR went from tabs at the bottom to the header. The + is gone; "add a plan" is the bottom row. |
| Clock | Two loose buttons became one switch: DAY / BIG CLOCK / WEEK. AM / PM moved into the time row. |
| Timer | START sits in the footer; "log past time" is a button beside it, not a link under it. |
| Habits, Todo | Same header; their add rows are the standard footer. |
| Analytics, Terminal | Same header size and spacing; Analytics' range buttons use the shared switch. |
| Calendar Month / Year | The same time row as the week. |

**Why this and not something else:** you asked for exactly this ("start with the canvas we already have and unify it"). The alternative I tried, a new layout, added a mode instead of removing differences. A shared frame costs no new concept: nothing to learn, only fewer exceptions.

Standard: `docs/04-visual-system/window-frame.md`.

## 2. The Calendar's top: four rows became two

**What:** the three unlabelled layer switches, the events list and the zoom are one menu button at the right end of the Calendar's header. The time row is just ‹ date › Today. The day view no longer draws a second row repeating the day's name; its recorded total sits beside the date.

**Where:** the Calendar window, top. Press the list button at the end of its header for the menu.

**Why:** you pointed at it ("too many layers on the calendar"). I first renamed the icons to words (Show, Events), which kept the row count. Moving them into one menu is the only version that actually removes rows. The cost is one more click for layers and zoom, which are changed rarely.

## 3. Right-click menus: six rows, one order, one vocabulary

**What:** every plan menu reads: what happened (Mark done / Done on Mon 16 / Not done yet) · When… · Rename · More · then Won't do and Delete. Rarer rows sit behind **More**, which opens in place with a way back.

| Menu | Before | Now |
|---|---|---|
| Todo row | 8 rows | 6 |
| Board card | 9 rows, different words ("Edit text", "Edit time") | 6, same words as the row; "When…" opens the same plan card |
| Habit | 9 rows | 6 (Color, Icon, Add note, Card on canvas are under More) |
| Repeating event | up to 8 rows | 6 |

**Where:** right-click a Todo row, a board card, a habit, a hatched repeating event on the Calendar.

**Why "More" and not just deleting rows:** every row I would have deleted is used by someone some of the time (Deadline, Tag, Show, Add next task). Hiding them one step down keeps them without making everyone read them. Why six: it is what fits without scanning, and it left exactly the rows you use daily.

Standard: `docs/04-visual-system/menus.md`.

## 4. The plan card: about half as tall

**What:**
- The month grid opens only when you press **Date**. Today / Tmrw / one more chip cover most plans.
- The When / Deadline tab bar is gone. The deadline is one row, "Add a deadline", which opens the same day picker.
- Four action buttons in a grid became one row: what happened, Won't do, Delete, and More (the timer, Show).
- The main button says **Save**. It said "Done", right next to "Not done yet": one word, two meanings.
- The close button is an X. It used the Won't-do icon.
- The Todo's card now offers Won't do too, like the Calendar's.

**Where:** click the time on a Todo row, click a block on the Calendar, or right-click a board card → When….

**Why:** this was your screenshot. The month grid was the largest thing on the card and the least used. I kept the card's order (day, time, length) because you already know it.

## 5. Todo rows: one line each

**What:** in a narrow window a row is the name, the time and the length. The tag shrinks to its coloured dot (hover for the name, click to change), and the tracked time steps aside into the tooltip and the plan card. In a wide window the full row shows.

**Where:** the Todo window at your usual window size.

**Why:** rows were wrapping onto two lines unevenly, which is what made the list hard to scan. I chose "shrink when narrow" over "always remove" so nothing is lost on a big screen.

## 6. The top bar

**What:** no breadcrumb. No DARK button (light / dark is in Settings → General). FIT only shows in the Free layout. The window toggles are the quietest control in the bar: a shown window has a lit icon and readable text, a hidden one is dim; the bright underline bars are gone.

**Where:** the top bar.

**Why:** the toggles are changed rarely, yet they were the brightest thing on screen. I kept their words (icon-only toggles would be unlabelled switches, which I removed elsewhere).

## 7. Chains keep the order; they never move a plan (you said yes)

**What:** a plan with its own time stays at that time. The plan before it in a chain no longer pushes it. A plan with no time of its own still follows the one before it.

**Where:** chain two plans that both have a time, then make the first one longer: the second stays put. They may overlap on the Calendar; the app shows that as it is.

**Why:** the pushing was the cause of your first report (plans jumping to today and tomorrow). An app that moves your plans has to be watched; one that never does can be trusted. Recorded as Decision 44.

## 8. Earlier in this work (PRs #251 and #253)

- **Welcome back** is a checklist: tick what you did (it counts on its own day), move or skip the rest. Closing it moves nothing.
- **Won't do** takes a plan off the list, the Calendar and the board, without counting it as missed. It is not Delete (which erases) and not Archive (which hides a finished card early).
- **Done on Mon 16** in the menus counts a late tick on the day it was planned.
- A tutorial, "When plans change", walks through these (Help → Tutorials).

## Your three answers

**Chains: yes.** Done (section 7).

**Canvases: yes.** This was already the case, and I was wrong to list it as open: in Easy there is one canvas and no switcher. In Advanced the switcher stays.

**Timer names: "how? what do you mean?"** The same window has five names today:

| Where | Name |
|---|---|
| Top bar toggle in Easy | RECORD |
| Window title in Easy and in Observe | TIME LOG |
| Top bar toggle in Advanced | POMO |
| Window title in Pomodoro mode | DEEP WORK · POMO.025 |
| The mode switch in Advanced | POMO / OBSERVE |

My proposal: call it **Timer** everywhere (top bar and window title), and name the two modes by what they do: **Sessions** (25-minute rounds with breaks) and **Stopwatch** (runs until you stop). I have not done it: it renames things in about twenty tutorial lines, which all need new voice clips, and you asked what I meant rather than saying yes.

## Still open

These either need a yes from you (they hide a feature) or were too risky to change unseen overnight.

| Item | Why it is open |
|---|---|
| Timer names (above) | You asked how; not a yes yet |
| Finished-cards setting → one fixed rule | You did not answer; it removes a setting |
| A board card only when you ask for one | You did not answer; it changes what the board shows |
| Analytics: 11 page icons | Two tutorials point at those icons with recorded voice. The clean fix is a named page menu; I want you to see it first |
| Clock: week dots, the "free" box, the list under the dial | I am not sure which of these you use |
| Timer in Advanced: task picker, session dots and stats at once | Same |
| "You recorded through this plan: tick it?" and naming empty time | New features; this pass was about removing, not adding |

## How it was checked

- Screenshots in Advanced and Easy at 1457 × 945 and 1920 × 1080, including the open plan card, a right-click menu and the Month view.
- A test fails if a window builds its own header or footer again, if the plan menus lose "More", or if the plan card's main button says "Done" (`tests/unit/renderer/windowFrame.test.ts`).
- Ten tutorial lines named things that moved; they are reworded and re-recorded (about 1,500 characters of ElevenLabs credit).
- I did not click through the app by hand. The buttons call the same commands as before, but please try the plan card and the menus once.

## Where everything is written down

- The frame, rows, cards and top bar: `docs/04-visual-system/window-frame.md`
- Menus: `docs/04-visual-system/menus.md`
- Your message, point by point, with status: `docs/research/simplify-checklist.md`
- Decisions 44 (chains) and 45 (the standards): `docs/03-architecture/decisions.md`
- The log: `docs/08-history/HISTORY.md`
