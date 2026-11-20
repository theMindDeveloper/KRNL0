# Simplifying KRNL0: the owner's message, point by point

The owner's message of 2026-11-19, split into what it asks, with what is done and what is still open. This is the list to hold the work to. Rule for all of it: change the app that exists (same windows, same data, same commands); no new mode, layout or look.

Status words: **Done**, **Partly**, **Open**, **Needs your decision** (it removes or hides a feature).

## 1. "The structure at the top and at the bottom is not unified"

| What | Status |
|---|---|
| One header for every window: name left, view switch and buttons right, 36px | Done |
| One time row: ‹ date › Today, 32px | Done (Calendar week/day, Clock) |
| One footer: the add field or the main button, 44px | Done (Timer, Todo, Habits, Calendar) |
| Calendar's Month and Year views use the same time row | Done |
| Analytics: its row of page icons is the standard time row: ‹ page name › (the name opens a list), then the range | Done |

Standard: `docs/04-visual-system/window-frame.md`. A test fails if a window builds its own header or footer again.

## 2. "Buttons are in different places on different nodes"

| What | Status |
|---|---|
| Views always in the header (Calendar's bottom tabs and the Clock's two loose buttons moved) | Done |
| Adding always in the footer (the Calendar's + moved; "log past time" is a button beside START) | Done |
| One size per kind of button (22px in headers, 30px in footers) | Done |
| The Calendar's top is two rows like every window: its layer switches, the events list and the zoom are one menu in the header; the day view has no extra day-name row | Done |
| The plan card: short by default, one action row, Save instead of a second Done; the event card shares its feedback | Done |

## 3. "Too much on screen; information overload"

| What | Status |
|---|---|
| Todo rows: one line each in a narrow window (name, when, length; tag as a dot) | Done |
| Top bar: breadcrumb, FIT (in Station) and the DARK button removed; the window toggles are the quietest control (lit icon when shown, no underline bars) | Done |
| Clock: AM / PM folded into the time row (one row less) | Done |
| Analytics: the ten page icons are one named list; the page name is shown once; the streak chip left the header | Done |
| Clock: the week dots and the "free" box are gone (the WEEK view and the list say it); the window is named Clock | Done |
| Timer in Advanced: one progress row (the session dots; today's rounds are in its tooltip); the header no longer repeats the session length | Done |
| The board: a card for every plan, drawn again beside the Todo and the Calendar | Needs your decision (5.5) |

## 4. "Right-click menus"

| What | Status |
|---|---|
| Six rows at most; the rest behind **More** | Done (plan row, plan card, habit) |
| Same order and same words in every plan menu ("Rename", "When…", "Mark done") | Done |
| Repeating-event menu on the Calendar: six rows, More | Done |
| Menus on empty Calendar hours and on a recorded span | Already short (two or three rows); unchanged |

Standard: `docs/04-visual-system/menus.md`.

## 5. "Are there features that cause more problems than freedom?"

My answer, feature by feature. None of these is changed yet: each one hides or removes something, so each waits for a yes.

| # | Feature | Problem | Proposal | Status |
|---|---|---|---|---|
| 5.1 | Chains that push later plans | Caused the "tasks moved to today and tomorrow" bug; hard to predict | Keep the order (the wire), stop the automatic pushing | **Done** (you said yes; Decision 44) |
| 5.2 | Several canvases | They share all plans, so a "new canvas" looks like a copy | One canvas by default; more only in Advanced | **Already so**: Easy has one canvas and no switcher (easy-mode D24). I was wrong to list it as open |
| 5.3 | Finished-cards setting (overnight / 1 hour / keep) | A setting for something the app can decide | One rule: gone the next morning; Archive stays in the menu | Needs your decision |
| 5.4 | Three names for one timer (Record / Pomo / Observe) | Three words to learn for one window | One name, **Timer**; its two ways of working are **Sessions** and **Stopwatch** | **Done** (you asked what I meant; this is it, and it is a rename only: one commit to undo) |
| 5.5 | A board card for every plan | The same plan is in the Todo, on the Calendar, on the Clock and on the board | A plan gets a board card only when you ask for one | Needs your decision |
| 5.6 | Deadline next to When | Two dates per plan | Kept, but behind More (done) | Done |
| 5.7 | Tags | Extra work per plan | Kept; the row shows a dot, the name is one hover away (done) | Done |

## 6. "If I want to study, what would I use?"

The daily loop is three things: **record** what you do (Observe: study, gaming, breaks), **plan** a few things with a time so they show on the Calendar and the Clock, **tick** them. Everything else (tags, deadlines, chains, canvases, analytics pages beyond the summary, the terminal) is secondary and should never be in the way of those three.

| What | Status |
|---|---|
| The three are reachable without a menu: START in the Timer's footer, "add a plan" in the Todo's and the Calendar's footer, the checkbox on the row | Done |
| Naming what you record in one tap (Study / Gaming / Break) in Easy too | Open |

## 7. "Not doing it, going to sleep, skipping: how should the app react?"

| Rule | Status |
|---|---|
| The app never moves a plan by itself | Done (PR #251) |
| A plan whose time passed: **Done on <day>** counts it on its day; **Won't do** closes it without a miss and takes it off the board | Done (PR #253) |
| After a day or more away: one checklist (Welcome back) to tick, move or skip; closing it moves nothing | Done (PR #253) |
| Stopping the timer and going to sleep needs no step. A plan left open stays on its day and waits for one answer (its row, its menu, or Welcome back) | Done |
| You recorded through a plan: offer to tick it (one tap), never silently | Open |
| A long stretch with nothing recorded: one optional question, "what was it?" | Open |

## 8. "Things should be where I expect them"

| What | Status |
|---|---|
| The rules are written down (frame, rows, top bar, menus) so a new control gets a slot, not a new spot | Done |
| A test guards the frame | Done |
| A test guards the menus and the plan card | Done |

## What was tried and dropped

A separate "Line" layout (2026-11-19): rejected the same day. It added a third mode instead of unifying the windows. Its branch `feat/line-layout` is kept; its PR #255 is closed.
