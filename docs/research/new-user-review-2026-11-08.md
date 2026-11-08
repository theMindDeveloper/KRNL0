# New-user review — what someone meets on day one, and where the app's logic lets them down

**Date:** 2026-11-08 · **Branch:** `experiment/new-user-review` (from `feat/routines`) · **Method:** opened the app on a brand-new board (the new `?fixture=fresh` preview: mother nodes only, nothing in them) at 1440 × 900, read every node as someone who has never seen KRNL0, then walked the everyday use cases (add a plan, give it a time, repeat things, miss a day, stop doing something, get reminded) through the model and the `krnl` CLI. Each finding says what the person sees or tries, what happens, and why it matters. **Fixed here** = changed on this branch; **Proposed** = needs a design pick or a contract change first.

Companion to [design-usecase-review-2026-11-07.md](design-usecase-review-2026-11-07.md) — most of that list is now built on `feat/routines` (weekly targets, rest days, archive/restore, due dates, dropped, reminders).

---

## 1. First screen (fresh board)

| # | What a new user sees | Why it hurts | Status |
|---|---|---|---|
| 1.1 | Two buttons say **CANVAS** side by side in the top bar: one shows/hides the canvas panel, the other switches the whole layout | Same word, two meanings, one click apart; the layout one looks like a duplicate | **Fixed here** — the layout toggle now reads **Station / Free**, tooltip "Station: windows in fixed places · Free: put anything anywhere" |
| 1.2 | Analytics greets with **streak 0d** | A zero streak on day one reads as failure before anything happened | **Fixed here** — the chip appears once there is a streak |
| 1.3 | Todo says only *No todos yet* (Habits already explains itself) | Nothing says what to type, or that a plan gets its time by dragging it onto the Calendar | **Fixed here** — "Nothing planned yet. Type something you want to get done below and press Enter, then drag it onto the Calendar to give it a time." |
| 1.4 | Analytics on an empty board: three of the four cards in the open view say what to do, but **Planned vs worked** draws bare axes ("30m / 15m") | Empty axes read as a broken chart. (A first read of the page text suggested a wall of ~15 empty charts — that text included the views not on screen; only one view shows at a time.) | **Fixed here** — it says "Nothing planned on the Calendar or worked in this range yet. Plan a task on the Calendar and run a pomo on it to compare." |
| 1.5 | The Calendar opens on the hours around *now* — at 4 am that is 02:00–03:30, an empty night | A new user sees an empty strip, not their day | **Fixed here** — before 06:00, with nothing planned within 3 h of now, it opens on the week's first plan or 08:00 (a night owl with plans at 3 am still opens near now) |
| 1.6 | Recorded / Habits / Routines layer chips are icon-only circles in a narrow slot | Three unlabeled toggles; their meaning is in tooltips only | **Fixed here (part)** — the week label next to them read "Nove…" in that slot; it now reads "Nov 2" when narrow. The chips keep their tooltips and get labels from 470 px up (unchanged) |
| 1.8 | The Pomo before Start: the first of 25 minute bars lit and "MIN 1 / 25" | Reads as already running; a new user wonders if the timer started | **Fixed here** — before Start no bar is lit and it says "25 min session"; running and paused show the minute as before (Blocks, Vu and Outline faces) |
| 1.9 | Analytics' toolbar is ten icons; the header said "· 3 SOURCES" | Nothing on screen named the page you were on | **Fixed here** — the header shows the open page ("Planned vs spent", "Habits"…); the source count moved to its tooltip |
| 1.10 | Switching to **Free** fits all six windows side by side at ~34% | No text can be read; it looks like a strip of thumbnails | **Fixed here** — Free starts where reading starts: the first four windows from the left, at a readable size (~52%); FIT and the minimap show everything. The first fit of a fresh canvas never goes below 55% either |
| 1.11 | The Pomo's two modes read **POMO / OBSERVE**, and its header **DEEP WORK · POMO.025** | "Observe" does not say "a stopwatch with no session length"; "POMO.025" is a code, not a word. The tooltips explain both | **Proposed** — rename for everyone (e.g. *Sessions / Free timer*) and drop the code from the header; a naming decision, so not changed here |
| 1.7 | Top bar path `~/krnl0 / canvas / Main` and a green **live** dot | Developer breadcrumb; "live" means nothing to most people (marketing is for everyone) | **Fixed here** — the badge now says **saved** ("Your board saves itself as you go — there is nothing to save by hand"), which is true and what a new user wants to know; the path keeps its look and gains a tooltip (it already hides below 1380 px) |

## 2. Adding things — does the app do what was asked?

| # | Use case | What happened | Status |
|---|---|---|---|
| 2.1 | Type a habit, press Enter | It was added with settings nobody chose; the Repeat button was the only way to say what it was | **Fixed on `feat/routines`** — Enter asks "Do you want to tick it off?" (habit / routine), then only that kind's questions |
| 2.2 | Add "Gym" when "Gym" already exists | Silently a second Gym; every `krnl habit … Gym` is then ambiguous | **Fixed here** — the card says "You already have one called Gym. This adds a second; a different name keeps them apart." |
| 2.3 | A night shift: routine 23:00 for 2 h | The card said "→ 01:00" but the Calendar cut it at 24:00 (`routineOccurrence` clamps to the day) — what you see is not what you asked | **Fixed here** — routines now run past midnight for real: the Calendar draws the night's part on its day and the rest at the top of the next ("Night shift · from last night"), the Clock too; skip / move / end act on the night it started; the card says "Fri 22:00–06:00 next day". A *timed habit* past midnight is still refused with the reason (a habit is ticked on one day) |
| 2.5 | Type a plan the way you say it: "Call mom tomorrow at 5pm" | Stored as that literal text — no time, no day; the field said "task → spawns a node…" | **Fixed here** — quick add reads the day, time and length from the words, shows "Call mom → tomorrow 17:00" under the field before Enter, puts it on the Calendar (a day without a time becomes a due day); the placeholder now reads "What do you want to get done? (e.g. Gym tomorrow 18:00 1h)"; Todo tour step added |
| 2.4 | "Pay rent on Sunday" — a day, no time | A plan needed a clock time (review 1.2) | **Built here (draft D, on due days)** — a plan with a day and no time is a due day ("Pay rent sunday" in quick add, or Due date…); the Calendar lists the week's ones in one slim **DAY** line under the day names, only when the week has one, overdue in rust; drag one into the hours to give it a time and it leaves the line. No scheduler change. Draft D was not picked on `feat/routines` — this branch made the call |

## 3. Keeping going — streaks, misses, stopping

| # | Use case | What happened | Status |
|---|---|---|---|
| 3.1 | Sick for two days | The streak reset; "did it yesterday?" offered only yes (a lie) or no | **Fixed on `feat/routines`** — **Rest day** answer, menu item and `habit rest` |
| 3.2 | "Gym 3× a week, any days" | Not expressible; fixed days broke the streak on a good week | **Fixed on `feat/routines`** — weekly targets, streak in weeks |
| 3.3 | Stop a habit, keep its history | Only hard delete in the UI; archived habits could never come back | **Fixed on `feat/routines`** — Archive (keeps history), Restore, `habit unarchive` |
| 3.4 | "Not doing this any more" (a plan) | Either done (a lie in analytics) or deleted | **Fixed on `feat/routines`** — Drop (to the Archive as *dropped*, off the Calendar) |

## 4. Being reminded

| # | Use case | What happened | Status |
|---|---|---|---|
| 4.1 | "Remind me before the dentist call" | No reminders at all | **Fixed on `feat/routines`** — Remind me… (at start … 1 h before), system notification from the main process |
| 4.2 | "Remind me before class" (a routine) | Routines could not remind | **Fixed here** — routine menu **Remind me…** (same picker), a notification before each time it happens, never on a skipped day; `krnl routine remind <id|name> <minutes|off>` |
| 4.3 | "Something is due today" | The due chip showed only in the Todo row | **Fixed here** — a **DUE** line under the Clock's list for the day you are viewing, overdue first in rust (it wraps; nothing is hidden), and a **Due** section in Welcome back (a missed deadline opens it on its own; something merely due today rides along) |

## 5. Smaller logic notes

- **5.0** The habit menu said "Pin as lane" / "Unpin lane" — internal words. **Fixed here:** "Put a card on the canvas" / "Already on the canvas" / "Remove its canvas card (keep the habit)".

- **5.1** Weekly-target habits show their week count only in the Week view; Month / Year still show a day badge. *Low* — use the week streak there too.
- **5.2** Habit amounts ("8 glasses") — **built here**: Amount a day…, each click adds one, the day counts once reached.
- **5.3** Repeating *plans* — **built here**: row menu **Repeat…** (every day, weekdays, every <its weekday>); ticking one off brings the next (same name, length, tag; same time on its next day, or due that day; never a backlog of past days); `krnl todo repeat`, and `todo check` does the same.
- **5.4** Naming tracked time freely ("Gaming") already works: the span picker's **+ Add category** makes a custom category in one step, and `krnl pomo retag <seg> --text "…"` names one span. Kept as is; the user wanted to discuss it.

---

## Changed on this branch

First screen: Station / **Free** layout toggle · no "streak 0d" · an empty Todo says what to do · the Calendar opens on the day, not the night · "Planned vs worked" says when it is empty · the Pomo says "25 min session" before Start · the top bar says **saved** · the narrow Calendar says "Nov 2" · Analytics names the open page · plain words ("window", "canvas card") instead of "mother", "node", "lane".

Adding and planning: **quick add** ("Gym tomorrow 18:00 1h" → on the Calendar; "Pay rent friday" → due; "at 3" is 3 pm), also in `krnl todo add` · a second "Gym" is said · **a day, no time**: the Calendar's DAY line (draft D on due days) · **repeating plans** (Repeat…, the next one appears when you tick one off) · **due** in the Clock and in Welcome back.

Habits and routines: **amounts** ("8 glasses a day") · **night shifts** (a routine past midnight draws its rest on the next day; a timed habit past midnight is refused with the reason) · routine **reminders** · Edit repeat… says why Save is off.

Tours: Staying on track (weekly targets, amounts, rest days, due dates, repeats, reminders, drop) and the Todo tour's quick-add step — both run end to end in the preview. Keyboard: the new pickers take focus.

Second pass: **Free** opens on the first four windows at a readable size · a busy Todo row still fits · the Month view and Calendar pills show amounts and rest days · "Did it yesterday? Yes" fills an amount habit's day · an optional amount while adding a habit · quick add reads "every day / weekday / sunday" · **Analytics streaks agree with the Habit node** (its own copy ignored rest days and targets — fixed on `feat/routines` too) · `krnl todo list` / `habit list` show what the rows show · the in-app assistant's instructions know every new command.

Third pass: quick add reads **time ranges** ("14:00-15:30"), **"in 2 hours"** as a start time and **dates** ("15.11", "Nov 20th", "the 15th") · the Month view shows the DAY chips too · Help lists every **tutorial** · the first-day tour waits for the right things · Welcome back counts **weekly-target habits in weeks** · a routine running past midnight says "now" on the night shift · the next copy of a repeating plan keeps its reminder and kind.

Logic fixes: **Drop offers UNDO** (and puts the Calendar time back) · Habit **Archive offers UNDO** · **dropping a repeating plan skips it** ("Skip this time") instead of silently ending the series, in the app and in `todo drop` · **a missed day no longer ends a repeating plan**: the next copy is made on open and at midnight, the missed one stays · the Staying-on-track tour no longer points at an Archive the Todo never shows · quick add won't half-read "every monday and thursday" (says to use a routine) · Welcome back leaves out missed copies of repeating plans · "Rest today" only on a day not done · Repeat… on a plan with no day gives it its first day · a **weekly target lets any day be ticked** (fixed days used to block it) · typing an archived habit's name offers **Restore it instead** · quick add reads "noon" · a repeating plan with no Calendar time can't lose its day ("No due date" is not offered; Repeat… → Off ends it) · the year view agrees with the week row on weekly-target days · a board round-trip test proves every new field survives a load.

Structure: one home for local-date helpers (`shared/ymd.ts`) · the habit target / amount popovers in their own file.

Preview: `?fixture=fresh` opens the board a new user gets.

## Proposed order for what is left

1. Pick between this branch's draft D (built) and E for `feat/routines`.
2. Name the Pomo's modes for everyone (1.11).

