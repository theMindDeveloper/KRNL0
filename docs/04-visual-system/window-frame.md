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
| Timer | name, session code; POMO / OBSERVE switch (Advanced); recorded spans, settings | — | START / BREAK / STOP, and "log past time" when idle |
| Todo | name with the open count, overdue count | — | add a plan |
| Calendar | name; DAY / WEEK / MONTH / YEAR | ‹ week › layers (Advanced), repeating events, Today, zoom (Advanced) | add a plan (day and week views) |
| Clock | name; DAY / BIG CLOCK / WEEK | ‹ day › Today, Now | — |
| Habits | name with the week; WEEK / MONTH / YEAR; settings | — | add a habit |
| Analytics | name, page; totals; settings | (its own page row and range presets: not converted yet) | — |
| Terminal | traffic lights, label, live badge | — | — |

## Not converted yet

- The Analytics page row (icons) and its 7d / 30d / 90d presets are still its own rows.
- The Calendar's Month and Year views keep their own month/year arrows.
- The Clock's AM / PM switch sits under its time row.
- Popups and cards (the plan card, the event card) have their own layout; a standard for cards is a separate step.
