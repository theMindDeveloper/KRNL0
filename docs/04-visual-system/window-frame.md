# The window frame

One standard for the top and the bottom of every window (Timer, Todo, Calendar, Clock, Habits, Analytics, Terminal). The same job is always in the same place, at the same size. A window builds none of these rows itself: it uses the classes in `src/renderer/styles/window-frame.css`.

## Why

Each window used to be built on its own. Switching views sat in four different places (bottom tabs, two loose buttons, an icon switch, an icon row), adding sat in three, header heights and paddings differed from window to window, and the bottom of each window looked different. The owner could not predict where anything was.

## The rows

```
┌──────────────────────────────────────────────────────────────┐
│ ● NAME  context                          [ VIEWS ]  [ ≡ ]    │  header  36px
├──────────────────────────────────────────────────────────────┤
│ ‹  where in time  ›   [Today]                                │  time row 32px (only if it moves in time)
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  the window's own content                                    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ add a …                                               ↵      │  footer  44px (only if there is something to do)
└──────────────────────────────────────────────────────────────┘
```

| Row | Class | Size | Holds, left to right |
|---|---|---|---|
| Header | `.kw-head` | 36px, padding 0 12px | status dot (`.kw-dot`), name (`.kw-title`), context (`.kw-ctx`: a count, a week, a page name), spacer (`.kw-sp`), the view switch (`.kw-views`), buttons (`.kw-btn`), the menu or settings button last |
| Time row | `.kw-range` | 32px, padding 0 12px | earlier (`.kw-btn`), the label (`.kw-range__label`), Today (`.kw-btn`), later (`.kw-btn`); anything else that belongs to the time shown |
| Footer | `.kw-foot` | 44px, padding 0 12px | the one thing you do in this window: the add field (`.kw-add` + `.kw-kbd`), or the main button(s) (`.kw-action`, `.kw-action--primary`) |

## Rules

1. **Views go in the header, top right, as one `.kw-views` switch.** Never tabs at the bottom, never loose buttons, never an unlabelled icon row for the main views.
2. **Adding goes in the footer.** A window with a list or a grid you add to has `add a …` as its last row, with the `↵` hint. No `+` button in a header or a time row.
3. **The main button goes in the footer** (the Timer's START / STOP). Secondary actions sit beside it in the same row at the same height, never as a text link under it.
4. **One size per kind of control.** Header and time-row buttons are 22px high (`.kw-btn`); footer actions are 30px high (`.kw-action`); the view switch is 22px high.
5. **A window with nothing to add or do has no footer.** A window that does not move in time has no time row.
6. **Colour is the window's own; size and place are not.** Analytics and the Terminal keep their own header colours on top of `.kw-head`.
7. **A new control gets a slot, not a new spot.** If it does not fit a slot above, it goes in the window's menu or its content, not in the frame.

## Where each window stands

| Window | Header | Time row | Footer |
|---|---|---|---|
| Timer | name ("Timer" in every mode; "· break" while on a break); recorded spans; SESSIONS / STOPWATCH switch (Advanced); settings | — | START / BREAK / STOP, and "log past time" when idle |
| Todo | name with the open count, overdue count | — | add a plan |
| Calendar | name; DAY / WEEK / MONTH / YEAR; one menu (what it shows besides plans, repeating events, zoom) | ‹ week or day › Today; in the day view also the day's recorded total and the hour arrows | add a plan (day and week views) |
| Clock | name ("Clock"); DAY / BIG CLOCK / WEEK | ‹ day › Today (back to today and this half of the day), AM / PM | — (under the dial: only the day's list) |
| Habits | name with the week; WEEK / MONTH / YEAR; settings | — | add a habit |
| Analytics | name; totals; settings | ‹ page name › (the name opens the list of pages), then the range switch | — |
| Terminal | traffic lights, label, live badge | — | — |

## Rows inside a window

- **A list row is one line** in a narrow window: the name, when, how long. The tag shrinks to its dot and the tracked time steps aside (tooltip, plan card). The full row shows in a wide window.
- **No unlabelled switches.** A group of icon-only toggles goes into the window's menu as named rows (the Calendar's layers).
- **No repeated rows.** A row that says what another row already says is not drawn (the Calendar's day view has no day-name row: the time row names the day; the Clock has no week rings or "now" box under the dial: the WEEK view and the list say it; the Timer has one progress row, the session dots).
- **One name per window.** The header says what the top-bar toggle says: Timer, Todo, Habits, Calendar, Analytics, Clock. A window is not renamed by its mode.
- **In a narrow window the name gives way first**; the view switch and buttons stay whole.

## The top bar

Brand, the canvas switcher (Advanced), "saved", the window toggles, the layout switch, Help, Settings. A toggle carries the name its window shows: Timer, Todos, Habits, Calendar, Terminal, Analytics, Clock (no abbreviations). FIT shows only in the Free layout (Station's canvas has its own fit control). Light / dark is in Settings → General. No breadcrumb.

## Cards (the plan card)

- **Short by default.** Day chips (Today, Tmrw, one more) and **Date**; the month opens only when Date is pressed. Then time, length; a reminder once it has a time; the deadline as one row ("Add a deadline"), which opens the same day picker.
- **One action row, in the menus' order:** what happened (Mark done / Done on … / Not done yet), Won't do, Delete (the one icon-only button), and More for the rest (the timer, Show).
- **The main button says Save** (Add when adding). "Done" only ever means the plan is done.
- **The close button is an X.** No icon is used for two meanings.
- **Feedback at once.** Every button answers the press (a 3% squeeze); the card arrives from where it was opened in 140 ms; neither moves with reduced motion.
- The same card opens from the Todo row, the Calendar block and the board card's "When…".

## The status bar

Advanced: workspace, Claude, the Timer (rounds and state), the day; nodes, edges, zoom, version. Easy: the Timer's state in a word (idle, recording, break), the day, the version. The board's plumbing is not shown in Easy.

## Floating widgets

A widget tucked at a screen edge (the ambient radio) shows only its 14px tab. No part of its body may sit on top of a window.
