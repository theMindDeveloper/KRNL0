# Engagement: finishing, closing the day, first day

From the research in [docs/research/engagement-and-onboarding.md](../research/engagement-and-onboarding.md) (confusion points C1–C13). The designs were picked from the canvas "KRNL0 Engagement Drafts": 9B (replaced 1A's pill), 2A+2C, 3A+3B+3C, 4A, 5A+5B, 6A+6B, 7A+7C, 8A. Sounds are in [ui-sounds.md](ui-sounds.md). Voice reactions were dropped by the maintainer.

Rules from the research:
- Finishing never ends on a penalty.
- Feedback informs; it doesn't pay (no points).
- A missed day can be repaired.
- Every animation is one-shot.

## Functional Requirements

**Finish a task (C9, C11)**
- **F1** Ticking a task plays a one-shot reward on its done card: the check pops (420 ms), eight small dots burst from it, and the border glows once (900 ms), with the `done` sound. No animation under reduced motion.
- **F2** A done task shows the **done card** (design 9B "Big number"), the same 220 × 120 as an open card so links and ports stay put. It shows how long it took as the big number (or "Done" with nothing recorded), what was planned, when it was finished, and a ring for today's planned tasks done ("3 of 5 planned today", or "N done today" with no plan). Unticking restores the full card.
- **F3** A done task never shows an overrun. The card reads `PLAN 1H · TOOK 1H 28` and the calendar block reads "· took 1h 28", both in neutral ink and with no rust strip.

**Done list and finished cards (C12)**
- **F4** Finished task cards leave the canvas by themselves. Hiding is render-only: the node, its Todo row, the completion ledger and analytics are untouched. A chain (edges between task cards), or a task and its subtasks, leaves together, once every task in it is done, timed from its last completion. A legacy done task without `completedAt` counts as done long ago.
- **F5** Settings → Finished cards offers three policies. **Overnight** is the default: cards leave on the next local day. **After 1 hour** and **Keep** are the other two. A separate switch shows finished cards anyway. These settings are per install (`localStorage`), not board data.
- **F6** `sys finished status|overnight|hour|keep|show|hide` reads and sets the same settings.
- **F7** The Todo list shows only **Done today**: today's done items fold there. Done items from earlier days leave the list (the data, Analytics and `todo list --archived` keep them; `todo clear-archive` still deletes them). The "ARCHIVE DONE" button is gone, and `todo.archiveDone` stays for the CLI. The buckets are unchanged (ADR 0016).

**Close the day (C13)**
- **F8** The day recap card shows once a day: either when all of today's planned tasks are done, or from 21:00 if anything was done or recorded. It shows done count, planned done, recorded time, the top habit streak, and plan-vs-real bars, and plays the `sessionDone` sound. It never shows while a tour is running. Escape or the button closes it.
- **F9** The morning line appears on the first check of a new day: "good morning · yesterday: 4 done · 3h 10m". A day with nothing done shows "new day, let's go". A board with no history shows nothing. The line goes away with the first board change or ×.
- **F10** The Monday look-back appears on the first check on a Monday, if last week had anything. It shows the week's done count and recorded time, its best day, and one bar per day. It replaces the morning line that day.
- **F11** `sys recap [today]|yesterday|week|show` prints the same numbers. `show` opens the card.

**First day (C1–C8)**
- **F12** The "Your first day" tour has 16 steps: add + guess, the card, plan, Clock, Start, Break, Back, Stop, plan vs real, tick, habit, tick today, recap, orb. On a fresh board, the orb's first click starts it once. The orb menu lists it first, as "Start here".
- **F13** After a to-do's name, the add row asks "how long? (your guess)" with 15m / 30m / 1h / 2h chips. Typing minutes or pressing Enter to skip still works.
- **F14** An open, unplanned Todo row has a **PLAN** button. It does not open a form: it teaches the drag with one small, one-shot animation. The Todo and the Calendar are brought into view together. A ghost of the task glides once from the row onto the Calendar, the Calendar's edge pulses once, and a tiny chip beside the row says "drag it onto the Calendar". Nothing covers the Calendar, nothing dims, nothing repeats; it is gone after ~3 s or as soon as the board changes. The CLI equivalent is `task schedule`.
- **F15** In Easy mode the Pomo is named **Record** (panel toolbar and tours via `{pomo}`). (C6)

**Polish**
- **F16** Habit streak line: "▲ 6 day streak · 1 to 7 · best 12". A seal appears on reaching 7 / 30 / 100 / 365 days. The best streak is the longest run ever logged.
- **F17** When the last scheduled day before today was missed and the scheduled day before that was done, the row asks "Missed yesterday? Tick it if you did it." **I DID IT** ticks that day. **No, start fresh** hides the prompt for that day. The CLI equivalent is `habit done <id> --date`.
- **F18** The Clock draws an outer ring that closes as the day's planned blocks are ticked, shown only when there is a plan. Under the dial, one small ring per day of this week: a check when complete, dotted when nothing was planned. Clicking a day opens it.
- **F19** A missed calendar block (its time passed, not done) has a dashed outline and a **↻ REPLAN** badge in its corner at any size ("didn't happen? drag it to a new time" when the block is wide). REPLAN makes the block itself lift and hop once, with a tiny "drag to a new time" chip beside it. Nothing covers the Calendar. Right-click → Unschedule takes it off. The CLI equivalent is `task schedule` / `task unschedule`.

## Non-Functional Requirements

- **NF1** No looping animation is added (frame budget #197). Rings animate only on change.
- **NF2** Nothing is deleted by hiding, folding or recaps.
- **NF3** Every surface is reachable from the CLI (hard rule 8): `finished`, `recap`, `task schedule`, `habit done --date`, `tour start first-day`.

## Use Cases

- **UC-E1** Sam ticks "write report": the reward plays, the sound plays, and the card becomes the done card: "1h 28 of 1h planned". The next morning it's gone from the board and the Todo list; Analytics keeps it.
- **UC-E2** Sam finishes the last planned task at 17:00. The day recap appears with today's numbers.
- **UC-E3** A new user clicks the orb. "Your first day" starts and walks the whole loop.
- **UC-E4** Sam missed "gym" at 14:00, clicks REPLAN, sees how to drag it, and drags the block to 17:00.
- **UC-E5** Sam missed reading yesterday but did read. They click "I DID IT" and the streak is kept.

## User Stories

- As a user, I want finishing to feel good and the board to stay tidy, without losing what I did.
- As a user, I want my day to end with a short summary, and the next to start fresh.
- As a new user, I want one guided walk through the whole app.
- As a user, I want a missed block or day to have a way forward.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Finished cards leave the board
  Scenario: F4 overnight
    Given a task completed yesterday
    Then its card is hidden on the canvas today
  Scenario: F4 chains leave together
    Given a chain of two tasks where only the first is done
    Then neither card is hidden
  Scenario: F5 keep
    Given the policy is "keep"
    Then no card is hidden

Feature: Close the day
  Scenario: F8 recap when the plan is done
    Given today has 2 planned tasks and both are done
    Then the day recap shows once
  Scenario: F9 morning line
    Given yesterday had 4 done tasks
    Then the morning line reads "yesterday: 4 done"

Feature: Streaks that forgive
  Scenario: F17 repairable day
    Given a habit done the day before yesterday but not yesterday
    Then yesterday is offered for repair
  Scenario: F16 best streak
    Given a past run of 12 days and a current run of 3
    Then the best streak is 12

Feature: Plan by dragging
  Scenario: F14 PLAN teaches the drag
    When the user presses PLAN on a row
    Then a ghost of the task glides once onto the Calendar and a small chip says to drag it
    And nothing covers the Calendar or repeats
```

- [x] F1 · [x] F2 · [x] F3 · [x] F4 · [x] F5 · [x] F6 · [x] F7 · [x] F8 · [x] F9 · [x] F10 · [x] F11 · [x] F12 · [x] F13 · [x] F14 · [x] F15 · [x] F16 · [x] F17 · [x] F18 · [x] F19. The tests are in `tests/unit/renderer/engagement.test.ts`. The UI has not been checked by hand in the app.
