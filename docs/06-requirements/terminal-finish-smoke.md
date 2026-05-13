# Terminal CLI Bridge — Manual Smoke Test Plan

*Target platform: Windows 11. Run after every deploy to `feat/terminal-finish`.*

---

## Prerequisites

- KRNL0 app is built (`npm run build`) or running in dev mode (`npm run dev`).
- At least one `TerminalNode` exists on the canvas (or create one via the node picker).

---

## S1 — Banner renders with ASCII art (T1–T4)

1. Launch the app (or reload if already running).
2. Click a `TerminalNode` to bring it into focus and mount the PTY.
3. Observe the terminal output before the shell prompt appears.

Expected:
- Multi-line ASCII KRNL0 logo rendered in acid-green (`#c9f158` approximate colour).
- A tagline line reading `krnl0 · v<X.Y.Z> · claude code attached · session <8-char-id>`.
- A dim separator line (`─` characters).
- A hint line: `type a command — try 'help' or 'krnl help'`.
- The shell prompt appears immediately after the banner (no perceptible delay).

---

## S2 — Compact banner on a narrow terminal (T5)

1. Resize the `TerminalNode` until it is narrower than 50 columns (count approximate).
2. Kill the existing PTY session by typing `exit` and pressing Enter, or destroy and re-add the node.
3. Re-open (or re-create) the `TerminalNode` to spawn a fresh PTY.

Expected:
- Only a single line: `krnl0 v<X.Y.Z> · 'help' for usage`.
- No multi-line ASCII logo.

---

## S3 — MOTD suppressed by env var (T6)

1. Launch the app with `KRNL0_NO_MOTD=1` in the environment:
   - PowerShell: `$env:KRNL0_NO_MOTD = "1"; npm run dev`
2. Open a `TerminalNode`.

Expected:
- No banner bytes are written to the terminal before the shell prompt.
- The shell prompt appears immediately.

---

## S4 — `krnl help` lists all groups (T12)

1. In an open `TerminalNode`, type:
   ```
   krnl help
   ```
2. Press Enter.

Expected:
- Stdout lists command groups including: `task`, `todo`, `habit`, `pomo`, `text`, `image`,
  `edge`, `node`, `viewport`, `term`, `board`, `theme`, `history`, `help`.
- Each group has a one-line summary.
- Exit code 0 (shell prompt returns without error indicator).

---

## S5 — `krnl task add` creates a task on the canvas (T16)

1. In the terminal, type:
   ```
   krnl task add "smoke test task"
   ```
2. Press Enter.

Expected:
- Terminal prints a confirmation: `Added task "smoke test task" (id: ...)`.
- Within 500 ms a new `TaskNode` labelled "smoke test task" appears on the canvas.
- The linked `TodoNode` gains a new `TodoItem` with the same text.

---

## S6 — `krnl task delete` cancels active pomo (T17)

1. Use `krnl task list` to find the id of a task currently running in the pomo timer
   (or start one via the PomoNode start button).
2. While the pomo is running, type:
   ```
   krnl task delete <task-id>
   ```
3. Press Enter.

Expected:
- Terminal prints: `Task and 0 descendant(s) deleted. (pomo session cancelled)`.
- The PomoNode UI reverts to idle (no timer, no active task label).
- The `TaskNode` is removed from the canvas.
- The linked `TodoItem` is removed from the `TodoNode`.

---

## S7 — Claude Code loop closes end-to-end (T24)

*Requires Claude Code to be installed: `npm install -g @anthropic-ai/claude-code`*

1. In the terminal, type `claude` and press Enter.
2. Claude Code starts inside the PTY.
3. Say or type: `"Add a task: write the smoke test docs"`.
4. Observe Claude Code's Bash tool output — it should call:
   ```
   krnl task add "write the smoke test docs"
   ```
5. Observe the canvas.

Expected:
- A `TaskNode` labelled "write the smoke test docs" appears on the canvas within 500 ms of the `krnl` command running.
- The exit code of the `krnl` invocation is 0 (visible in Claude Code's tool output).

---

## S8 — `krnl undo` reverses last action (T28)

1. After S5, with the "smoke test task" node visible, type:
   ```
   krnl undo
   ```
2. Press Enter.

Expected:
- The "smoke test task" `TaskNode` disappears from the canvas.
- The linked `TodoItem` is removed.
- Exit code 0.

---

## S9 — `exit` ends the terminal session cleanly (T20)

1. In the terminal, type `exit` and press Enter.

Expected:
- The terminal writes `[Process exited]` and the cursor stops.
- No error dialog or crash.
- The `TerminalNode` UI reflects the disconnected state (LIVE badge dimmed or hidden,
  per the component's session-state rendering).

---

## S10 — `sys` alias deprecation (T25)

1. In the terminal, type:
   ```
   sys task list
   ```
2. Press Enter.

Expected:
- Stderr contains: `sys is deprecated; use krnl`.
- Stdout contains the same task list output as `krnl task list`.
- Exit code 0.

---

## Acceptance gate

All scenarios S1–S10 must pass before the PR is approved to merge to `main`.

Automated test coverage: T12/T13/T14 (commandRegistry tests), T9 (RPC server integration tests),
T17 cascade-on-active-pomo (dispatch unit tests), T1–T6 (motd unit tests).

Remaining manual-only scenarios: T7 (krnl on PATH), T8 (socket env injection), T10, T11,
T15, T18, T20–T23, T24 (Claude Code loop), T25 (sys alias), T26–T31 (Phase 2).
