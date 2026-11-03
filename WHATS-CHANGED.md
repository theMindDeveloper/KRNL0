# What changed — a tour for checking it out

Everything below is on the branch `TMD/autonomous-app-improvement-5e64b2` (110 commits). Nothing is pushed or merged. Run `npm run dev` in this folder: it uses its own board, so your real board is safe. **Close and reopen the app once before you start**, so the terminal changes start fresh.

Each item says what you'll notice and, where it helps, how to try it.

---

## Your data is safer

- **A change you make while the AI or the CLI edits the board is no longer thrown away.** If you tick a Todo while `krnl task add` runs, both survive. A node you delete stays deleted, a list you reorder stays in your order, and habit ticks made at the same moment from the app and the CLI are both kept.
- **"Add parallel task" on a task card is saved.** It used to exist only in memory, so the next CLI command or quitting the app lost it.
- **A board file that can't be read no longer opens as an empty board.** You get a "board not loaded" screen with **Try again**, and the file is backed up first.
- **Only one KRNL0 window runs.** Opening the app a second time brings the first window to the front instead of starting a second app that would overwrite the board.

## Undo you can see

- **One-click deletes show a "Deleted … · UNDO" bar** for a few seconds. This covers the ✕ on a Todo row, the Todo row menu, the Archive **CLEAR** button, deleting a habit, a task card's Delete, and the canvas Delete key and menu. UNDO brings back everything the delete took with it, such as a task's chain. *Try:* delete a Todo row, then click UNDO.

## Typing and keys

- **Escape cancels an edit.** This applies when renaming a Todo row, a frame label or a habit, and when editing a Todo's minutes. Before, Escape quietly saved what you'd typed.
- **Shortcuts no longer fire behind a dialog.** With Settings open, pressing N, S, F, R or P does nothing.
- **Settings closes with Escape.**
- **Holding Space to talk to the Orb no longer takes over a focused button.** Space on a checkbox or radio button presses it, as it should.
- **Delete / Backspace removes the selected notes, images, frames and tasks**, not only drawings. It only acts when the canvas has focus, so it can't delete a note you can't see while you're typing in a Todo panel.
- **Notes work from the keyboard.** Tab to a note and press Enter (or F2) to edit it. Enter also works on a note you selected by clicking.
- **Ctrl+Shift+L (Station ↔ Canvas) works from inside the terminal too.**

## Terminal

- **The terminal survives a layout switch.** Ctrl+Shift+L, hiding the terminal panel and swapping panel slots used to kill whatever was running, the AI included, and wipe the output. *Try:* start something long, press Ctrl+Shift+L twice, and it's still running.
- **Typing `exit` no longer leaves a dead black box.** The badge says **EXITED**, and pressing Enter starts a new shell.
- **If the shell can't start, the terminal says why** in red. Enter tries again.
- **Paste works properly.** Ctrl+V and right-click Paste put text in once, and pasting several lines no longer runs them one by one.
- **On a Mac, Cmd+C only copies.** It no longer interrupts a running command.
- **`krnl term setShell` now applies** to the next shell you start. It used to be saved and then ignored.
- **A short terminal panel shows a one-line banner** instead of the big logo.
- **The terminal's right-click menu matches the rest of the app.** It closes when you click elsewhere and isn't cut off in narrow panels.

## Pomodoro

- **Time when the app couldn't see you.** If the laptop slept or the app was closed while a session ran, you get "AWAY 18:02–09:14 — count that time?" with **COUNT IT** or **STOP AT 18:02**, instead of 15 hours being booked as work. From the CLI: `krnl pomo stop --at 18:02`.
- **Easy mode has no stray links.** START never links a session to a task, and the gear that opened an empty panel is gone.
- **The status bar counts sessions to your real long break**, not always "/4".

## Calendar

- **Month view takes drops.** Drag a Todo row, a task card or another month chip onto a day. A task with a time keeps that time; a new one starts at 09:00.
- **Clicking a day in month view** makes the week and day views open on it. Double-click opens the day.
- **Month view habit dots** show up to six habits per day, and "+N" counts the hidden ones correctly. Days before you created a habit get no dot, and the calendar's "show habits" setting is respected.
- **Today moves at midnight** in the month and week views if you leave the app open overnight.
- **Dragging and resizing blocks lands on the time under the cursor when the canvas is zoomed out.**
- **The day view's red "now" dot sits in the right place.**
- **Tasks inside a day are listed earliest first**, so "+N" hides the latest ones rather than the first.

## Tasks and Todo

- **Tasks without a duration say "no set time"** instead of a made-up "~25 min", and never show "OVER".
- **Opening "Edit time" and leaving it unchanged changes nothing.** Before, it turned a no-duration task into a fixed 25-minute one.
- **Renaming a Todo row renames its task card**, its calendar block and the Pomodoro label, and the other way round.
- **The Todo minutes field rejects "2.5"** (it used to read it as 2), and leaving an invalid value no longer leaves a red box stuck open.
- **Open Todo items are never hidden** by the 50-item display limit.
- **Todo row text shows a text cursor.** A single click never did anything, so the pointing-hand cursor promised an action that didn't exist. "Start pomo" is in the row's right-click menu.

## Habits

- **Habit lanes (the pinned habit cards) behave:**
  - They roll over at midnight.
  - You can't tick a day the habit isn't scheduled on.
  - The 7-day strip matches what you can tick.
  - Lane numbers count up (#01, #02) instead of random digits like "#4821".
- **New: "Unpin lane (keep the habit)"** in a lane's menu. Before, the lane menu could only delete the whole habit and its history.
- **Removing or archiving a habit, from the app or the CLI, removes its lanes too.**
- **The "add habit" field:** Escape clears it, and a half-set repeat (weekly with no days) is never dropped silently. It tells you what's missing.

## Notes, images, frames

- **Selecting text in a note or a frame label no longer drags the note around.**
- **Long notes fade out at the bottom** when there's more text than fits, and they scroll while you edit.
- **An image you pick that can't be used says why on the card**, for example the wrong format or over 25 MB. BMP, TIFF and HEIC files dropped on the canvas become file cards.
- **A task moved on one canvas leaves its frames on the other canvases too.**

## Analytics

- **Hiding a chart card in Settings no longer breaks the pages.** Before, every page after it showed half of two pages.
- **The summary says "the last 7 days"** instead of "this week": the range is a rolling 7 days, not the calendar week.
- **Archiving a habit keeps its past check-ins in the totals.**
- **Work that spans midnight counts on the right day and hour** on every chart.
- **Plan vs actual shows "+N more"** when not all tasks fit.
- **The weekday chart has seven different colours.**
- **Opening a view from the CLI** (`krnl analytics show --view …`) jumps to that page.
- **Removed:** the little ☆ / − buttons on each card. They only showed up under the settings panel, which covers the cards, and pinning never moved anything. Hiding cards is still in Settings.

## Station layout

- **Panel sizes come back** after a reload or a layout switch. That covers the row height, the top columns and each bottom panel.
- **The clock stays exactly as wide as the calendar above it.**
- **In a window narrower than 1024 px**, the fallback canvas now shows the Pomo, Todo, Habit and other main windows. They used to vanish.

## The Orb assistant and Commander

- **Commander sessions work with real task names.** Typing "review notes" used to create a task called "review", and Commander then always said "Something went wrong". Commands also finish at once instead of waiting 5 seconds each.
- **Commander checks your input before it starts.** A start time it can't understand turns red, and `10:00` means today. It allows at most 5 tasks, and says so.
- **"Session locked in" only appears when your session really got its time.**
- **A brand-new board greets you with an introduction and points you to the tour**, instead of "welcome back".
- **The tutorial matches the app.** It no longer teaches the removed double-click on a task. Its "wait until you do it" steps don't pass early because of tasks you already had. Stopping the tutorial also stops its music.
- **The focus session says what starting really does**, including in Easy mode, and no longer promises a break announcement that never comes.
- **The Orb's chat panel and captions open toward free space**, so they don't go off-screen when the Orb is at the top or right. The Orb can't be parked under the top bar, where it couldn't be clicked.
- **Chatting can't start a timer by accident.** Typing "a" or "start" used to launch a focus session. A flow now starts only when you name it.
- **The quick-action buttons stay** after your first message.
- **The chat hint names the real shortcut** (hold Space).

## Themes: Pro light, and "Paper"

- **Pro now has a light mode.** Pick Pro, switch to ☀ Light, and you stay on Pro: light-grey panels, dark graphite text, the same lime accent. It used to jump to the old default style.
- **"Classic" is now called "Paper"** (cream & lime). It's the same look under a new name. Anything that saved "classic" still works.

## Looks the same in every theme

*Try:* switch Settings → frame style to **Macintosh light**, **Blueprint** and **Submarine**, and look around.

- **Readable everywhere:**
  - A done Todo checkbox.
  - Error text on video and PDF cards.
  - The Commander hints.
  - The Analytics tiles and switches.
  - The Settings and Habit buttons.
  - The Orb and Commander panels.
  - The task check mark.
- **Accents follow the theme.** The pie menu, the pen wheel, a running task's glow and the Pomo glows use each theme's own colour instead of always lime.
- **Menus, popups and cards match.** The canvas right-click menu, the habit menu, the calendar task popup and media cards use the same shape, colour and shadow as the rest of the app.
- **One close button (✕) everywhere, and one style of on/off switch.**
- **The Analytics window header** gets each theme's header style, like the other windows. For example, the Macintosh title bar and the Submarine module number.
- **Dropdowns always appear on top of Settings.**

## Small fixes

- **Double-click a canvas name in the top bar to rename it.** Escape cancels only the rename.
- **The Dock's shape button closes its own menu.**
- **CLI `frame add` places the frame in the middle of what you see.**
- **Dev only:** editing the Pomo, Clock, Task and Calendar code updates the running app in place instead of reloading the whole page.

## New CLI commands

For the AI in the terminal, since every app feature should have one:

| Command | What it does |
|---|---|
| `krnl settings layout station\|canvas` | Switch the layout |
| `krnl radio list \| status \| play rain \| remove rain \| stop \| volume 40` | Control the Ambient Radio |
| `krnl text look <id> --sticky \| --shape ellipse \| --note \| --color #ffb3c7` | Change a note's look |
| `krnl analytics cards \| hide <card> \| unhide <card> \| reset-cards` | Choose which chart cards show |
| `krnl analytics clear-history --yes` | Delete all recorded focus history (cannot be undone, so it needs `--yes`) |
| `krnl clock half am\|pm` | Choose which half of the day the clock shows |
| `krnl cal zoom 1-6` | Set the calendar's hour height |
| `krnl media resize <id> --w N --h N` | Resize a media card |
| `krnl media page <id> 3` | Show a page of a PDF card |
| `krnl draw stroke --points "0,0 100,50 200,0" --tool arrow` | Draw on the canvas |
| `krnl pomo stop --at 18:02` | Stop a session at an earlier time |

Commands that already existed are stricter:
- IDs printed in a list can always be typed back.
- A bad date is refused instead of silently doing nothing.
- An ambiguous name lists its matches.

**Factory reset deliberately stays app-only.** It wipes the board.

---

## Worth a look on screen first

1. The terminal keeps running through Ctrl+Shift+L, and `exit` then Enter starts a new shell.
2. Ctrl+V of three lines in the terminal pastes them once.
3. Escape while renaming a Todo row keeps the old name.
4. Delete a Todo row, then click UNDO.
5. Drag a Todo row onto a day in month view.
6. Commander: a session with multi-word task names, then check that it lands on the calendar.
7. Switch to Macintosh light and check the done checkboxes, the menus and the Analytics window.

Once you've confirmed fixes work, tell me which ones and I'll add them to `docs/Challenges.md` (rule 9).
