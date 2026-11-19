# What changed, where to see it, and why

Written 2026-11-19, after the overnight pass. Everything here is on the branch `feat/unified-windows` (draft PR #257, on top of #253 and #251). The dev app from this worktree shows all of it; restart it with `npm run dev` if it is closed.

Nothing is merged or released. Typecheck is clean and all 2,663 tests pass (the one test that had been failing for days depended on the real date; it is fixed).

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
| Timer | START sits in the footer; "log past time" is a button beside it, not a link under it. One name (section 9). |
| Habits, Todo | Same header; their add rows are the standard footer. |
| Analytics | Same header; its icon row is the standard time row (section 10). |
| Terminal | Same header size and spacing. |
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

## 9. The Timer has one name

**What:** the same window had five names. It is now **Timer** everywhere, and its two ways of working are named by what they do.

| Where | Before | Now |
|---|---|---|
| Top bar toggle, Easy | RECORD | TIMER |
| Top bar toggle, Advanced | POMO | TIMER |
| Window title, Easy and stopwatch | TIME LOG | TIMER |
| Window title, sessions | DEEP WORK · POMO.025 | TIMER |
| The switch in Advanced | POMO / OBSERVE | SESSIONS / STOPWATCH |
| Status bar | POMO 0/4 | TIMER 0/4 |
| Floating timer, Settings, tutorials | Pomo, Time log, Observe | Timer, Sessions, Stopwatch |

**Where:** the top bar, the Timer window's header, Settings → the floating timer, the bottom status bar.

**Why this and not something else:** you asked "how? what do you mean?". This is what I meant, built so you can see it instead of reading a proposal. I chose "Timer" because it is the word you already use for it, and "Sessions / Stopwatch" because each says what happens when you press START (rounds with breaks, or it runs until you stop). I did not keep "Pomo" as the window's name because in Easy it is not a Pomodoro at all. It is words only: the `krnl pomo …` commands and your saved board are untouched, and it is one commit, so it is undone in one step if you prefer the old names.

## 10. Analytics: a named list of pages instead of ten icons

**What:** the row of ten unlabelled icons is the same time row every window has: ‹ page name ›, then the range (7D / 30D / 90D / 365D). Press the name for the list of pages; the arrows step through them. The page name is shown once (it was in the header and again beside the icons). The streak chip left the header (the Summary page shows it).

**Where:** the Analytics window, the row under its header.

**Why:** ten icons you have to hover to read are exactly the "unlabelled switches" the standard forbids, and you sent a screenshot of this row. I considered keeping the icons with labels (too wide for the window) and a tab bar (ten tabs do not fit either). A list with names fits any width and reads at once. The cost: jumping to a far page is two clicks instead of one.

## 11. Clock: the dial and the day's list, nothing else

**What:** the row of seven small week rings and the "now / free · 9:08am" box under the dial are gone. The window is named **Clock** (it said "Today · Schedule", which matched neither the top bar nor the other windows).

**Where:** the Clock window. The dial is larger because it gets the room.

**Why:** both rows repeated something. The week is one press away (WEEK in the header) and the outer ring of the dial already closes as you tick the day's plans. The box showed the running plan, which the list right under it also marks; when nothing was running it showed the time, on a clock. I kept the list because it is the only place in the Clock where you read plan names.

## 12. Timer in Advanced: one progress row

**What:** there were two counters above the task picker (a "cycles today" strip with diamonds and a bar, and the session dots). Now there are only the session dots with "session 2 / 4"; today's totals are in their tooltip. The header no longer repeats the session length (the face shows 25:00).

**Where:** the Timer window in Advanced, Sessions, at a larger window size (in a small window both were already hidden).

**Why:** two ways of counting the same sessions made you work out which was which. I kept the dots because they answer the question you have while working ("how far to the long break?").

## 13. A second walk through the app as a user

I went through Advanced and Easy again, window by window, and fixed what stood out.

| What | Where to see it | Why |
|---|---|---|
| The top bar says **Todos, Habits, Calendar, Terminal** (it said TODO, HABIT, CAL, TERM) | The top bar | The toggle and the window it opens had different names. One name per thing, and no abbreviations to decode |
| The tucked music widget shows only its small tab | The right edge of the screen, beside the Calendar | A strip of it, with cut-off text, sat on top of the Calendar's last column and its menu button |
| Easy: the bottom bar shows the Timer's state, the day and the version | The bottom bar in Easy | Workspace path, Claude, nodes, edges and zoom mean nothing when you are planning a day. Advanced keeps them |
| Easy: the bottom bar says "idle / recording / break" (it said "0/4 · idle") | Same | There are no rounds to count in Easy |
| Clock: **Today** also returns to the current half of the day; the separate **Now** button is gone | The Clock's time row | Two buttons that both mean "take me back to now" |
| Analytics: "Focus 6h 15m" in the header (it said 375M); the summary says "sessions" (it said "pomodoros") | The Analytics header and Summary page | The same number was written two ways in one window; "pomodoro" was the last old timer word on screen |

**Update:** you picked option A from three drafts, so this is now done (section 14). Before: on the Calendar's week view in a small window, a block shows only the first letter of its plan. That is a rule the Calendar already has for narrow columns (the name is in the tooltip and in the Day view), and changing how blocks are named is a design question for you, not a tidy-up.

## 14. Calendar week in a small window: blocks say their name

**What:** a plan alone in a narrow day column shows its name, in small type, wrapped down the block ("Study / math"). It showed one letter ("S"). A short block shows the first line of its name; plans at the same time are still slim letter bars.

**Where:** the Calendar, WEEK, at the Station size (about 360 px wide). In a wide Calendar nothing changes.

**Why this and not something else:** you chose it from three drafts (row 10 of the design board). The other two were a wider column for today, and three days instead of seven. This one moves nothing and adds nothing to press. Its cost, which the draft showed: the text is 10 px, the smallest in the app, and a long word breaks in the middle ("Physic / s").

## 15. The three add cards are one card

**What:** the card that adds a plan (Todo), the card that adds a plan or event (Calendar) and the card that adds a habit had three sets of sizes. They now share one layout.

| | Before (Todo / Calendar / Habit) | Now, all three |
|---|---|---|
| Width | 300 / 330 / 330 | 330 |
| Padding and gap between rows | 10 and 8 / 14 and 12 / 14 and 12 | 14 and 12 |
| Name | 13.5 px / 15 px / 15 px | 15 px |
| Close button | X / a crossed circle / a crossed circle | X |
| Rows | icons / labels (56 px) / labels (48 px) | labels (64 px): TIME, LENGTH, GOAL, DEADLINE |
| Control height | 24 to 34 px, mixed | 30 px (the time field was 34) |
| Length | three separate boxes / one control | one control |
| "Any time" | solid lime / (none) / tinted | tinted |
| Main button | small, at the right / full width / full width | full width, 34 px ("No day" sits left of it in the plan card) |

**Where:** type a name in Todo's "add a plan"; press + in the Calendar; type a name in "add a habit". The plan card that opens from "When…" changed the same way.

**Why this and not something else:** you sent the three side by side and asked for the gaps and sizes to be one. I took the Calendar and Habit card as the standard because two of three already agreed, and moved the Todo card to it. The sizes live in one file, so a fourth card cannot drift. One rule came out of it: a day you pick is solid lime, an option you switch on is tinted.

## 16. The cards, redesigned to be read (your pick A)

**What:** you said the cards were still ugly and unreadable after section 15, and you were right: I had made them the same size and kept the look. They are now a different design. A card is the name, then one filled block with a line per setting (Time, Length, Deadline on the left; what it is set to on the right), then one big button. There are no outlined boxes. Words are in a reading font; only times stay in the code font. Labels are normal words, not small capitals.

**Where:** type a name in Todo's "add a plan"; click a plan's block on the Calendar (the same card, with Mark done / Won't do / Delete); press + in the Calendar; type a name in "add a habit"; "Log past time" in the Timer.

**The day line:** you did not like the first version (a "Day" line that repeated "Today" and wrapped onto two rows). It is one line of four choices: Today, Tomorrow, one more day, Date. Always visible, one press. Press the chosen day again to clear it.

**Why this and not the other two drafts:** B (questions with big answers) was the tallest and pushed deadline and reminder behind "More"; C (one sentence) hides that the words can be pressed. A is the layout people already know from phone settings.

**Costs:** the plan card is about 30 px taller. "Won't do" shows as an icon when the first button needs the room ("Done on Mon 16"). The reading font is loaded from the web like the app's other fonts; offline it falls back to the system font.

## 17. The Timer is a clock first (your pick A)

**What:** not running, the Timer showed three tiles saying 0m, 0m, 0, two picker rows, and an empty lower half. Now: the time, large and centred; "Not running" under it; today as one line ("2h 35m recorded · 15m break") over the day strip; and, when a plan is due now, one card with its name and **Start on it**. The content sits in the middle of the window at any height, in Sessions too.

**Where:** the Timer window. Switch to STOPWATCH to see the face; make the window taller to see it stay centred.

**Why:** a timer should show the time first. The tiles repeated Analytics and were zeros most of the day. Two rows that both ask "what are you doing?" became one: the plan card, with "pick something else" for the list.

**Different from the draft:** today's line sits above the plan card (in the draft it was below), because the strip belongs to the face. In Sessions the face itself (the blocks) is unchanged.

## Your three answers

**Chains: yes.** Done (section 7).

**Canvases: yes.** This was already the case, and I was wrong to list it as open: in Easy there is one canvas and no switcher. In Advanced the switcher stays.

**Timer names: "how? what do you mean?"** Done as section 9, so you can judge it on screen.

## Not done, and why

These are the only things from our conversation that I left. None of them is a fix for something broken: each one removes a feature or adds a new one, and you never said yes to them.

| Item | Why I left it |
|---|---|
| Finished-cards setting → one fixed rule | It removes a setting you may be using; you did not answer |
| A board card only when you ask for one | It changes what your board shows for every plan; you did not answer |
| "You recorded through this plan: tick it?" | A new feature. This whole pass was about removing and unifying |
| Naming empty time afterwards ("what was it?") | Same |
| One-tap names (Study / Gaming / Break) in Easy | Same; it adds a row to the simplest mode |

If you want any of them, say which and I will draft it first.

## How it was checked

- Typecheck: 0 errors. Tests: all pass, including the guards below.
- Screenshots of the demo board in Advanced and Easy at 1457 × 945 and 1920 × 1080, including the open plan card, a right-click menu, the Month view and the Analytics page list.
- Guard tests fail if a window builds its own header or footer again, if the plan menus lose "More", if the plan card's main button says "Done", if the Timer gets a second name, if Analytics goes back to an icon row, or if the Clock grows a second summary under the dial (`tests/unit/renderer/windowFrame.test.ts`).
- Every tutorial line that named something that moved is reworded and re-recorded in the same voice (about 2,900 characters of ElevenLabs credit in total). The "Analytics" tutorial now asks you to open a page from the list.
- **Not checked:** I did not click through the running app by hand, and I did not play the changed tutorials inside the app. The buttons call the same commands as before. Please try, once: the plan card, a right-click menu, the Analytics page list, and the Analytics tutorial (Help → Tutorials).

## Where everything is written down

- The frame, rows, cards and top bar: `docs/04-visual-system/window-frame.md`
- Menus: `docs/04-visual-system/menus.md`
- Your message, point by point, with status: `docs/research/simplify-checklist.md`
- Decisions 44 (chains), 45 (the standards) and 46 (one name per window): `docs/03-architecture/decisions.md`
- The log: `docs/08-history/HISTORY.md`
