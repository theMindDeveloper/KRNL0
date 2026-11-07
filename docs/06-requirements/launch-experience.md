# Launch experience — splash, What's new, updates, welcome back, feedback, milestones

Status: implemented on `feat/pocket-pomo` (with the pocket timer, [pocket-timer.md](pocket-timer.md)).
Architecture: Decision 38 in [decisions.md](../03-architecture/decisions.md). Designs: the "KRNL0 launch designs" Claude Design canvas (Splash A + D, What's new A, Update states, Mac menu bar and Windows taskbar, Send feedback, Milestone cards, Welcome back).

Everything here is about the moments around using KRNL0: opening it, after an update, after time away, when something goes wrong, when something goes right. None of it changes the board by itself.

## Functional Requirements

**Splash**
- **F1** A splash card paints the moment the window opens, before any script loads (plain HTML in `index.html`). It shows the lit cube, the KRNL0 wordmark, a checklist and a 30-segment progress bar. The pocket timer window never shows it.
- **F2** The checklist is honest: `board.json`, then what is on the board (`5 mothers · 12 nodes · 2 wires`), then `canvas`. After an update the kicker reads `Updated · 0.10.1 → 0.11.0`, the cube opens up and a `backup saved` line comes first.
- **F3** It fades out as soon as the canvas has painted the board — no added delay. It is removed at once when the board can't be read (the error stays visible) and after 15 s at the latest. Only a simulated launch (previews) holds it for 2.6 s.

**Board backup**
- **F4** When the running version differs from the last one that opened this board (or an existing board has no app-state file yet), `board.json` is copied to `<board folder>/backups/board-v<previous>-before-v<current>.json` before anything can load or save the board. An existing copy is never overwritten; the newest 3 are kept. Settings › Updates shows the count and a **Show folder** button; `krnl app backups` lists them.

**What's new**
- **F5** After a feature release (major.minor changed) a What's new box opens once, after the splash. Closing it in any way marks that release as seen. Patch releases never open it.
- **F6** At most three highlights. Each has a picture, a kicker, a caption, a headline and a body; `01–03` switch between them; **Next** / **Done**, **Later**, **Show me** (goes to the feature: the Pomo node, or Send feedback) and a **full release notes** link.
- **F7** The notes ship inside the app (`src/shared/whatsnew.ts`), keyed by major.minor. Help › What's new reopens them; `krnl whatsnew` prints them; `krnl whatsnew show` opens the box.
- **F8** After a patch release a small notice says `Updated to 0.11.1 · fixes and polish` with **What changed** (the GitHub release). It fades after 5 s and stays while the pointer is on it.

**Update states**
- **F9** Downloading shows `↓ 0.11.1 ▬ 64%` in the status bar, never a popup. "Ready" says `Installs when you quit, or restart now` with **Later** / **Restart now**, and waits until no Pomo session runs before showing. On Mac/Linux "is out" offers **Skip version** / **Download**; a skipped version is never announced again. A failed **Check now** shows `Couldn't reach GitHub · trying again in 4 h` with **Retry**; automatic checks still fail quietly. Settings lists the recent versions.

**Time at a glance**
- **F10** Windows, while the Pomo runs: a progress bar on the taskbar icon (yellow when paused), a badge on breaks and in Observe (no bar — Observe has no target), and the node's own controls as buttons in the taskbar preview (Pause / Break / Stop …). The window title carries the time.
- **F11** macOS, while the Pomo runs: the time in the menu bar (`● 15:42`, `● 1:12:08 ↑` in Observe, `● break 04:12`, `❚❚` when paused). Its menu has the node's controls, a **Floating timer** checkbox and **Open KRNL0**. Nothing is in the menu bar while idle.

**Welcome back**
- **F12** After 2 or more days without using KRNL0, a Welcome back dialog opens once on launch (after What's new, if both apply) — only when something slipped.
- **F13** It lists tasks whose planned day is before today and that are not done. Tasks chained after one (`task.next`) are listed under it as `follows the task above`; only the first task of a chain gets buttons, and the rest move with it.
- **F14** Buttons: **Move all to today**, and per task **Today**, **Tomorrow**, **Unplan** (takes it off the calendar; the task stays). Moves keep the time of day. Nothing moves by itself; every change goes through the task node's own command.
- **F15** Habits: a broken streak is said plainly with the best run (`best 12 · start again today`); a running one says `▲ 6 · still going`. `krnl catchup [--json]` prints the same; `krnl catchup show` opens the dialog even when nothing slipped.

**Help and feedback**
- **F16** A **?** button in the top bar opens Help: What's new, Take the tour, Catch up (opens Welcome back any time), Share a milestone (a card for the longest streak, or the focus sessions), Send feedback, Copy diagnostics, Source on GitHub, Check for updates, Board backups, and the version.
- **F17** Send feedback: what it is (Something's broken / An idea / A question / Something I love), a short title, a description, and two switches — app version and system, recent errors (with **view**). It says the board, tasks and notes are never added.
- **F18** **Continue on GitHub** opens a filled-in GitHub issue in the browser; nothing is sent from the app. The link stays under 7,500 characters (oldest error lines go first, then the description is shortened). **Copy diagnostics** copies the version, system and errors. **Send by email** opens the user's mail app with the same report addressed to the maintainer (theminddevlab@gmail.com), for people without a GitHub account; the link stays under 1,900 characters.
- **F19** `krnl feedback "title" [--kind bug|idea|question|love]` opens the dialog with the title filled in; with `--link` or without a window it prints the GitHub link.

**Milestones**
- **F20** When a habit streak reaches 7, 30, 100 or 365, or the focus sessions reach 10, 100 or 500, a small card appears bottom right — each milestone once, and only while Celebrations is on. A count that jumps past a milestone (a repaired day, logged past time) still gets its card if it is within 3 days / 5 sessions of it; an older, longer streak does not replay past milestones.
- **F21** The card is a 1080 × 1080 image: a cream "paper" card with the habit name for streaks, the dark LCD card for sessions. Only a habit name and numbers — never tasks or times of day.
- **F22** **Save image** saves the PNG, **Copy** puts it on the clipboard, **Not now** closes it.
- **F23** Settings › Celebrations turns cards off; `krnl app celebrations on|off`. `krnl share list` shows streaks, sessions and the next milestone; `krnl share streak ["habit"]` / `krnl share sessions` open a card for the current numbers.

**App status, repository**
- **F24** `krnl app status [--json]`: version, the version it updated from, backups, time away before this launch, Celebrations, What's new seen.
- **F25** The repository has issue forms (Something's broken, An idea), CONTRIBUTING, SECURITY and CODE_OF_CONDUCT.

**Pomo node**
- **F26** The Observe day strip draws work as rounded segments with a clean gap between them, breaks as a thin line through the gap, and a small "now" marker — no hatching. The pocket timer shows the same strip.
- **F27** Moving slipped tasks to **today** (Move all, Bring all, Today) never lands on a time already past: those tasks line up from the next quarter hour after now, in their old order, each as long as its plan (`landingTimes`); times still ahead today keep their time; Tomorrow keeps every time. Otherwise a task brought back at 19:00 for 09:00 would read "Missed" the moment it lands.

## Non-Functional Requirements

- **NF1** The splash never makes start-up slower: it is removed on the first painted frame with a board.
- **NF2** `app-state.json` lives in `userData` and never holds board data. Malformed content falls back to defaults.
- **NF3** Nothing in this feature talks to the network. Feedback and release links open in the user's browser and only go to `github.com/theMindDeveloper/KRNL0` (main refuses other URLs).
- **NF4** Every rule is pure and tested: update kind, backup naming and pruning, What's new once-per-release, catch-up, milestones, the feedback link, the taskbar view, the CLI parser.
- **NF5** Previews without a real update: `KRNL0_SIMULATE_UPDATE=feature|patch` and `KRNL0_SIMULATE_AWAY_DAYS=<n>` fake the launch info (and make a real backup copy).

## Use Cases

- **UC-L1** Maya updates from 0.10.1 to 0.11.0. The splash says `Updated · 0.10.1 → 0.11.0 · backup saved`, the board opens, What's new shows three highlights; she clicks Show me on the floating timer and the canvas goes to the Pomo node.
- **UC-L2** Jon comes back after a long weekend. Welcome back lists two tasks from Friday; he presses Move all to today and Plan today.
- **UC-L3** Sam hits a bug, opens Help › Send feedback, writes two lines and presses Continue on GitHub; the issue opens filled in, and Sam posts it.
- **UC-L4** Ana ticks Morning run for the 30th day in a row; a card appears and she saves the image for her story.
- **UC-L5** A user works in another app; the Windows taskbar icon shows the session filling up, and they pause it from the taskbar preview.

## User Stories

- As a user, I want to see that KRNL0 is starting, so I don't click it twice.
- As a user, I want my board copied before an update touches it, so an update can never lose my work.
- As a user, I want to learn what a new version does without reading release notes on GitHub.
- As a user coming back after days away, I want a short list of what slipped and one-click fixes, without anything moving by itself.
- As a user, I want to report a bug from the app without hunting for my version number.
- As a user, I want a small celebration for a long streak that I can share if I want to.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Splash (F1–F3)
  Scenario: Board opens normally
    Given KRNL0 starts
    Then the splash shows "board.json" waiting
    When the board loads
    Then it shows the mother, node and wire counts
    And it fades out once the canvas has painted
  Scenario: The board can't be read
    When loading the board fails
    Then the splash is removed and the error is visible

Feature: Board backup (F4)
  Scenario: Version changed
    Given app-state.json says the last version was 0.10.1
    And KRNL0 0.11.0 starts
    Then backups/board-v0.10.1-before-v0.11.0.json exists before the board loads
    And only the newest 3 backups are kept

Feature: What's new (F5–F8)
  Scenario: Feature update
    Given the last version was 0.10.1 and this is 0.11.0
    When the board is on screen
    Then What's new for 0.11 opens once
    And closing it means it never opens again for 0.11
  Scenario: Patch update
    Given the last version was 0.11.0 and this is 0.11.1
    Then no dialog opens
    And "Updated to 0.11.1" shows and fades after 5 s

Feature: Update states (F9)
  Scenario: Ready while focusing
    Given an update is ready and a Pomo session runs
    Then the ready notice waits until the session ends
  Scenario: Manual check fails
    When the user presses Check now and GitHub can't be reached
    Then "Couldn't reach GitHub" shows with Retry

Feature: Welcome back (F12–F15)
  Scenario: Away three days with a slipped chain
    Given KRNL0 was last used 3 days ago
    And task A was planned for 2 days ago with task B chained after it
    When the board is on screen
    Then Welcome back lists A with buttons and B as "follows the task above"
    When the user presses Today on A
    Then A is planned for today at the same time

Feature: Feedback (F16–F19)
  Scenario: Report a bug
    When the user opens Help › Send feedback, types a title and presses Continue on GitHub
    Then the browser opens a GitHub new-issue link with the title, the description and the version
    And no board data is in the link

Feature: Milestones (F20–F23)
  Scenario: 30-day streak
    Given Celebrations is on
    When a habit's streak reaches 30 today
    Then a card shows "30 days of <habit>." once
  Scenario: Celebrations off
    Given Celebrations is off
    Then no card shows

Feature: Time at a glance (F10–F11)
  Scenario: Windows taskbar while focusing
    Given a Pomodoro session runs
    Then the taskbar icon shows the session's progress
    And the preview offers Stop, Break and Pause
```

## Out of scope (for now)

- A release channel (stable / beta): it would change the update pipeline (AGENTS.md rule 11).
- Attaching a screenshot to feedback (a GitHub link can't carry one), a web feedback form (email covers people without GitHub), and GitHub Discussions links (Discussions is off).
- A screen while the Windows installer runs after quitting (it runs outside the app).
- A date picker in Welcome back (Today / Tomorrow / Unplan cover it without a native picker).
- What's new as a note on the canvas (draft D) and the other splash / What's new drafts.
- The website download page (separate branch `feat/krnl0-website`).
