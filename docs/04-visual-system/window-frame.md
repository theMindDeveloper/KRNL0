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

**The Timer is a clock first** (owner pick A, 2026-11-19). The stopwatch face is the time, large and centred; its state in words under it (Not running, Recording, On break); then today as one line over the day strip ("2h 35m recorded · 15m break"). There are no total tiles. The face sits in the middle of the room the window has, in both modes. When a plan is due now and the Timer is not running, its card (the plan's name and **Start on it**) is the one choice shown; "pick something else" hides it and the picker line comes back.
| Todo | name with the open count, overdue count | — | add a plan |
| Calendar | name; DAY / WEEK / MONTH / YEAR; one menu (what it shows besides plans, repeating events, zoom) | ‹ week or day › Today; in the day view also the day's recorded total and the hour arrows | add a plan (day and week views) |
| Clock | name ("Clock"); DAY / BIG CLOCK / WEEK | ‹ day › Today (back to today and this half of the day), AM / PM | — (under the dial: only the day's list) |
| Habits | name with the week; WEEK / MONTH / YEAR; settings | — | add a habit |
| Analytics | name; totals as plain words; settings | the page icons (one each, the current page named beside them), then the range switch; the range moves to a second line in a narrow window | — |
| Terminal | traffic lights, label, live badge | — | — |

## Rows inside a window

- **A list row is one line** in a narrow window: the name, when, how long. The tag shrinks to its dot and the tracked time steps aside (tooltip, plan card). The full row shows in a wide window.
- **No unlabelled switches.** A group of icon-only toggles goes into the window's menu as named rows (the Calendar's layers).
- **No repeated rows.** A row that says what another row already says is not drawn (the Calendar's day view has no day-name row: the time row names the day; the Clock has no week rings or "now" box under the dial: the WEEK view and the list say it; the Timer has one progress row, the session dots).
- **One name per window.** The header says what the top-bar toggle says: Timer, Todo, Habits, Calendar, Analytics, Clock. A window is not renamed by its mode.
- **In a narrow window the name gives way first**; the view switch and buttons stay whole.

## The top bar

Brand, the canvas switcher (Advanced), "saved", the window toggles, the layout switch, Help, Settings. A toggle carries the name its window shows: Timer, Todos, Habits, Calendar, Terminal, Analytics, Clock (no abbreviations). FIT shows only in the Free layout (Station's canvas has its own fit control). Light / dark is in Settings → General. No breadcrumb.

## Cards (the plan card, the Calendar card, the habit card, Log time)

**One design for every card that adds or edits one thing** (`ui/addCard.tsx`; owner pick A of three drafts, 2026-11-19): the plan card (Todo's add card and "When…"), the Calendar's "New here" card, the habit card and "Log time you didn't record".

**A card is a list you read.** The name with an X, then one filled block with a line per setting (its name on the left, what it is set to on the right), then one main button across the card.

| Part | Rule |
|---|---|
| Box | 330 px wide, 16 px padding, 14 px between parts, 14 px corner |
| Top line | the name (17 px, semibold, reading font), then the X in a 28 px filled square |
| The block | one filled block (`--paper-2`, 12 px corner), a hairline between lines. **No outlined boxes anywhere on a card** |
| A line | 42 px: the setting's name in sentence case on the left (Time, Length, Deadline; never small capitals), its value or control at the right |
| The day line (plan card) | the first line of the block: at most three days and **Date**, equal widths, always visible, one press. The chosen day is solid lime. Days are named in full (Tomorrow, not Tmrw). A date that is none of the three shows on Date. Pressing the chosen day again clears it |
| Controls in a line | 30 px tall, filled one shade lighter (`--paper-3`), 8 px corner: the option pill, the two stepper buttons around a value, the time field, the select |
| Chosen | a day you pick is solid lime; an option you switch on (Any time, Tick) is tinted lime; a two-way switch (Once / Repeats) lifts the chosen side |
| Type | words in the reading font (`--font-read`); times and numbers in the code font |
| Things you can do | one row of filled buttons, 36 px; the long "Done on Mon 16" label keeps its room (Won't do then shows as its icon) |
| Footer | the main button across the card, 40 px. A quiet second action (No day) sits to its left, only when there is a day to clear |

A card does not set its own width, padding, gap, control height or button size.

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

## Alignment (2026-11-20)

- Every control in a header or time row is 22 px tall and centred on one line, the label included. No rule may make one segment of a switch taller than the switch.
- A window's body fills the window in both layouts: the footer is always at the bottom edge, never with empty space under it.
- **Today** is the same button in every window (the Clock's is no longer wider, bolder or filled).
- A range on a card is written "15:30 – 17:30": the field, then the other end at the same size.
- Popups that open from a plan (the Clock's plan popup, the "what are you doing" list) follow the card rules: reading font, sentence case, filled buttons, no outlined boxes.
- **Calendar, Year:** the months always fit with 12 px clear at each side; an empty day is one clear shade above the window; the time row is ‹ year Today ›; one line under the months names the two colours.

## The window standard (owner pick, 2026-11-20; Decision 48)

Every window's top and bottom are built from the same parts in the same order. The sizes and the look are set once, in the last block of `styles/window-frame.css`.

**Header (40 px):**
1. The window's dot, then **the name** in normal letters (Timer, not TIMER), 13.5 px semibold, reading font.
2. **One short fact** after it when there is one, as plain words: `18` and `3 overdue` (Todos), `Week 47` (Habits), `Recording` / `Break` / `Paused` (Timer). No pills.
3. **The view switch**, the same control everywhere: a quiet filled bar (28 px), 24 px segments, the chosen view lifted one shade. Not outlined, not lime. Words in normal letters; AM / PM stay capitals.
4. **At most two icon buttons** at the far right, 28 px, no outline. Settings is the last one.

**Time row (36 px), when a window moves through time:** earlier at the left edge, later at the right edge, the label and **Today** in the middle; a second switch (AM / PM, the range) sits before the right arrow. Arrow buttons are filled; Today is a small filled chip.

**Footer (48 px):** a bar at the bottom edge with a line above it. It holds the add field (Todos, Habits, Calendar; reading font, 13.5 px, with a filled ↵ key) or the main button (Timer). Other actions sit in the same row as quiet filled buttons, 34 px. No second row. **No underlined text links, anywhere.**

**Edges:** 16 px at the left, 12 px at the right, 8 px between parts.

The "01 · spine · 05" badge that sat over a window's header in the Free layout is no longer drawn.

## Timer A: one face (owner pick and corrections, 2026-11-20)

- **Both modes are the same screen.** The time (64 px, code font, always at full brightness), one row under it with what you are on, then today.
- **Two layers, not three.** There is no line of words under the time. The state is said in the header beside the name: Recording (lime, with a lime dot), Break, Paused. The time never dims.
- **The row under the time:** one rounded button with what you are on ("What are you doing?", "No task", or the name). In Sessions the four session dots sit to its left. A plan that is due now is the same rounded button with the plan's name and "planned now"; × brings the normal button back. There is no Planned now card.
- **Today:** "Today" and "2h 35m recorded" on one line (the breaks and span count are in its tooltip), over a 10 px day strip.
- **The clock face setting:** Standard is this face. The other faces (Blocks, LCD, Vapor, …) are still a choice in settings, and a frame style may still name its own.
- **Footer:** the standard bar. Buttons in normal letters: Start, Start session, Continue …, Pause, Break, Stop, New, Log past time.
- **Settings:** one filled block, a line per setting with "− 25 min +"; the faces as a grid of filled buttons; Cancel and Save in the standard footer.
