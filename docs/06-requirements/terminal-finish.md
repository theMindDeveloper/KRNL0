# TerminalNode — Finish (CLI bridge + MOTD + help)

*Phase 1+ requirements · Derived from ADR-0014 · Supersedes nothing — extends `terminal-node.md`*

---

## Functional Requirements

| # | Requirement | Phase |
|---|---|---|
| T1 | When a PTY is spawned, main writes the MOTD banner to the PTY's stdout before the first shell prompt renders | 1 |
| T2 | The MOTD banner includes an ASCII KRNL0 logo in acid-green (24-bit ANSI color `38;2;201;241;88`) | 1 |
| T3 | The MOTD tagline reads `krnl0 · v<X.Y.Z> · claude code attached · session <sid8>` where `<X.Y.Z>` is read from `package.json#version` at app startup | 1 |
| T4 | The MOTD includes a dim (`\x1b[2m`) separator line and a `type a command — try 'help' or 'krnl help'` prompt | 1 |
| T5 | If `cols < 50` at PTY spawn time, the MOTD is replaced with a single-line compact form: `krnl0 v<X.Y.Z> · 'help' for usage` | 1 |
| T6 | If `KRNL0_NO_MOTD=1` is set in the environment **at the time the Electron app launches** (read by main, not by the PTY's shell), no banner is written for any PTY in that app instance | 1 |
| T7 | A `krnl` binary is reachable from inside the PTY's shell via `which krnl` (POSIX) / `where krnl` (Windows) | 1 |
| T8 | The `krnl` binary connects to the running Electron app's RPC server via a Unix domain socket (POSIX) or named pipe (Windows) addressed by `$KRNL0_RPC_SOCKET` | 1 |
| T9 | The `krnl` binary authenticates with the token at `$KRNL0_RPC_TOKEN`; a missing or wrong token causes the server to write a single `exit` frame with code `126` and close | 1 |
| T10 | `krnl version` prints the version from `package.json` and exits 0 | 1 |
| T11 | `krnl whoami` prints the socket path (from `$KRNL0_RPC_SOCKET`), token-probe result (✓ if `$KRNL0_RPC_TOKEN` is set AND a probe request to the server returns exit code ≠ 126; ✗ otherwise), and the main process pid; exits 0 | 1 |
| T12 | `krnl help` prints a list of every command group (task, todo, habit, pomo, text, image, edge, node, viewport, term, board, theme, history, help) with one-line summaries; exits 0 | 1 |
| T13 | `krnl help <group>` prints every subcommand in that group with usage strings; exits 0 | 1 |
| T14 | `krnl help <group> <sub>` prints full usage for one subcommand; exits 0 | 1 |
| T15 | `krnl` with no arguments prints a short overview and points at `krnl help`; exits 0 | 1 |
| T16 | `krnl task add "groceries"` creates a new TaskNode and a linked TodoItem on the mother TodoNode; the canvas re-renders within 500ms | 1 |
| T17 | `krnl task delete <id>` cascades — removes the task, all descendants, all linked TodoItems, and **if the task is the active pomo task, cancels the pomo session and clears `activeTaskId`** | 1 |
| T18 | `krnl todo add "x"` creates a TodoItem AND a linked TaskNode (bidirectional linkage invariant from Decision 20) | 1 |
| T19 | All renderer-side cascade semantics (task↔todo mirror, pomo credit on complete, sibling renumber, marquee cascade) execute identically whether triggered from UI clicks or from `krnl` commands | 1 |
| T20 | The `TerminalNode` emits `term.sessionStart` on PTY creation and `term.sessionEnd` on PTY exit; both events are received by `commandDispatch` and reach a `case 'term':` branch | 1 |
| T21 | `krnl term setTitle "<title>"` updates `TermState.title` for the active terminal session | 1 |
| T22 | `krnl term setFontSize <N>` updates `TermConfig.fontSize` for the active terminal session | 1 |
| T23 | `krnl term clear` writes `\x1b[2J\x1b[H` (clear + cursor home) into the PTY for the active session | 1 |
| T24 | `claude` invoked inside the PTY can run `krnl task add "..."` via its Bash tool and the task appears on the canvas — closing the Decision 3 loop end-to-end | 1 |
| T25 | The `sys` binary still exists as a deprecation alias; running `sys task add "..."` works but writes a one-line stderr note: `sys is deprecated; use krnl` | 1 |
| T26 | `krnl node move <id> --to x,y` repositions a node | 2 |
| T27 | `krnl viewport pan --dx N --dy N` and `krnl viewport zoom --factor N` modify the renderer's viewport (no-op + exit 2 if no renderer is open) | 2 |
| T28 | `krnl undo` / `krnl redo` modify the renderer's history (no-op + exit 2 if no renderer is open) | 2 |
| T29 | `krnl edge add --from <node:event> --to <node:command>` creates an edge in board.json | 2 |
| T30 | `krnl marquee --rect x1,y1,x2,y2 --delete` deletes all nodes whose bbox intersects the rect, with full cascade semantics | 2 |
| T31 | `krnl theme set <light\|dark>` updates the renderer theme; persists to localStorage | 2 |
| T32 | Output from the `krnl` binary's own messages (banner, help, success) is ANSI-colored: `krnl` keyword acid-green, `help` cyan, errors rust | 3 |
| T33 | `krnl init zsh` and `krnl init pwsh` print init snippets to stdout that the user can paste into their shell rc file to get `help` as an alias and syntax-highlight `krnl`/`claude`/`vim` keywords | 3 |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| TNF1 | The RPC server binds at app startup before any window is created; teardown happens on `app.on('before-quit')` |
| TNF2 | The RPC token is generated via `crypto.randomBytes(32).toString('hex')` and never persists to disk |
| TNF3 | The RPC socket path is `${os.tmpdir()}/krnl0-${pid}.sock` on POSIX and `\\.\pipe\krnl0-${pid}` on Windows |
| TNF4 | Cascade logic invoked from `krnl` is the same code path as the renderer's `commandDispatch` (shared module at `src/shared/dispatch/`) |
| TNF5 | The MOTD writes complete within 50ms of PTY spawn; the shell prompt rendering is not delayed |
| TNF6 | A fresh `npm install` produces a working `krnl` binary in the per-launch `KRNL0_CLI_DIR`; no manual chmod or PATH setup |
| TNF7 | `bin/krnl.js`, `bin/krnl`, `bin/krnl.cmd` are listed in `electron-builder` `extraResources` so packaged builds include them |
| TNF8 | Help text is generated from `src/shared/cli/commandRegistry.ts`; no hand-maintained `HELP_TEXT` constant survives |
| TNF9 | Token mismatch is a single-frame exit `code: 126`; no auth retry, no rate limit (single per-connection request) |
| TNF10 | The named-pipe / UDS path is loopback-only by construction; tested with `socat` / `nc` confirming external connections are not possible |

---

## Use Cases

**UC-T1 — `krnl` from the user's shell.**
Actor clicks the TerminalNode. PTY spawns; banner renders; shell prompt appears. Actor types `krnl task add "buy milk"` and presses Enter. The `krnl` binary connects to the RPC server, sends the request, prints "Added task ...". The canvas updates within 500ms.

**UC-T2 — Claude Code drives the app.**
Actor types `claude` in the PTY. Claude Code starts. Actor says (or types) "add a task to buy milk." Claude Code's Bash tool runs `krnl task add "buy milk"`. The task appears on the canvas.

**UC-T3 — Cascade correctness.**
A task is the active pomo task. Actor types `krnl task delete <task-id>`. The task is removed, all descendants are removed, the linked TodoItem is removed, and the PomoNode's `activeTaskId` reverts to `null` with `status: 'idle'`. The pomo UI does not show a dangling timer.

**UC-T4 — Help discoverability.**
Actor types `help`. A function injected by `krnl init zsh` (Phase 3) routes to `krnl help`. Without the init snippet, `help` is the shell builtin. Actor types `krnl help task` and sees every task subcommand with usage strings.

**UC-T5 — MOTD on small terminal.**
Actor resizes the TerminalNode to ~40 cols and reopens. The PTY is spawned with `cols < 50`; the compact one-line banner renders instead of the multi-line logo.

---

## Gherkin Scenarios

```gherkin
Feature: krnl CLI bridge — MOTD banner

  Background:
    Given the KRNL0 Electron app is running
    And a TerminalNode is mounted on the canvas
    And the package.json version is "0.2.0"

  Scenario: T1, T2, T3 — Full banner on a wide terminal
    When the PTY spawns with cols=80 rows=24
    Then the PTY stdout contains the ASCII KRNL0 logo in acid-green
    And the PTY stdout contains "krnl0 · v0.2.0 · claude code attached · session "
    And the PTY stdout contains a dim separator line
    And the PTY stdout contains "type a command — try 'help' or 'krnl help'"

  Scenario: T5 — Compact banner on a narrow terminal
    When the PTY spawns with cols=40
    Then the PTY stdout contains "krnl0 v0.2.0 · 'help' for usage"
    And the PTY stdout does NOT contain the multi-line ASCII logo

  Scenario: T6 — Banner suppressed by env var
    Given the env var KRNL0_NO_MOTD is set to "1"
    When the PTY spawns
    Then no banner bytes are written to the PTY before the shell prompt
```

```gherkin
Feature: krnl CLI bridge — binary on PATH

  Scenario: T7 — krnl is resolvable from inside the PTY
    Given the PTY has spawned
    When the user types "which krnl" (POSIX) or "where krnl" (Windows)
    Then the resolved path is under $KRNL0_CLI_DIR
    And the resolved path is on the per-launch temp dir, NOT on the system PATH

  Scenario: T7 — krnl is the prepended (winning) entry on PATH
    Given the system has an unrelated /usr/local/bin/krnl from a different install
    When the user types "which krnl" inside the PTY
    Then the resolved path is the one from $KRNL0_CLI_DIR, not the system one
```

```gherkin
Feature: krnl CLI bridge — auth and transport

  Scenario: T9 — Token mismatch closes the connection
    Given the krnl binary is invoked with KRNL0_RPC_TOKEN="wrong-token"
    When the binary sends its request frame
    Then the server writes exactly one response frame
    And that frame has kind "exit" and code 126
    And the server closes the connection immediately after

  Scenario: T9 — Valid token authorizes the request
    Given the krnl binary is invoked with the real KRNL0_RPC_TOKEN
    When the binary sends "task list" as its request
    Then the server writes at least one "stdout" frame
    And the server writes an "exit" frame with code 0

  Scenario: TNF10 — External connection is rejected by construction
    Given an external process tries to open the named pipe / UDS without being a descendant of the PTY shell
    When it sends any frame
    Then it either cannot connect (POSIX permissions) or the token check rejects it
```

```gherkin
Feature: krnl CLI bridge — help

  Scenario: T12 — Bare help lists all groups
    When the user types "krnl help"
    Then stdout contains a list of group names: task, todo, habit, pomo, text, image, edge, node, viewport, term, board, theme, history
    And exit code is 0

  Scenario: T13 — Group help lists subcommands
    When the user types "krnl help task"
    Then stdout contains "task add"
    And stdout contains "task delete"
    And stdout contains "task list"
    And each subcommand has a usage string

  Scenario: T14 — Subcommand help shows full usage
    When the user types "krnl help task add"
    Then stdout contains "Usage: krnl task add"
    And stdout contains at least one example invocation
```

```gherkin
Feature: krnl CLI bridge — semantic parity with the UI

  Background:
    Given a TodoNode exists with one TodoItem "buy milk" linked to TaskNode T1
    And T1 has one child TaskNode T2

  Scenario: T17 — krnl task delete cascades like UI delete
    When the user types "krnl task delete T1"
    Then T1 is removed from board.json
    And T2 is removed from board.json
    And the TodoItem "buy milk" is removed from the TodoNode
    And all incident edges are removed

  Scenario: T17 — krnl task delete cancels active pomo
    Given the PomoNode has activeTaskId = T1 and status = "running"
    When the user types "krnl task delete T1"
    Then the PomoNode state has activeTaskId = null
    And the PomoNode state has status = "idle"
    And the PomoNode history records a cancellation entry

  Scenario: T19 — Cascade parity with UI
    When a TodoItem is deleted via UI right-click
    And a separate TodoItem is deleted via "krnl todo remove <itemId>"
    Then the resulting board.json mutations are structurally identical (cascade-wise)
```

```gherkin
Feature: krnl CLI bridge — term.* FSM

  Scenario: T20 — term.sessionStart is dispatched
    When the TerminalNode mounts and PTY creation succeeds
    Then commandDispatch receives "term.sessionStart" with args { sessionId: <sid> }
    And the case 'term': branch handles it without an unknown-command warning

  Scenario: T20 — term.sessionEnd is dispatched
    Given a TerminalNode is mounted
    When the PTY exits (e.g. user types "exit")
    Then commandDispatch receives "term.sessionEnd"
    And the TermState.sessionId reverts to null

  Scenario: T21 — krnl term setTitle updates state
    When the user types "krnl term setTitle 'logs'"
    Then the active terminal node's TermState.title is "logs"

  Scenario: T23 — krnl term clear clears the xterm
    Given the xterm has visible output
    When the user types "krnl term clear"
    Then the xterm screen is blank and the cursor is at row 0 col 0
```

```gherkin
Feature: krnl CLI bridge — Claude Code closes the loop (Decision 3)

  Scenario: T24 — Claude Code creates a task via krnl
    Given the user has typed "claude" inside the TerminalNode
    And Claude Code has started with --allowedTools "Bash"
    When the user says "add a task: write the docs"
    Then Claude Code's Bash tool invokes "krnl task add 'write the docs'"
    And a new TaskNode appears on the canvas
    And the canvas re-renders within 500ms
```

```gherkin
Feature: krnl CLI bridge — sys alias deprecation

  Scenario: T25 — sys still works but prints a deprecation note
    When the user types "sys task list"
    Then stdout contains the same output as "krnl task list"
    And stderr contains "sys is deprecated; use krnl"
    And exit code is 0
```

```gherkin
Feature: krnl CLI bridge — Phase 2 renderer-coupled commands

  Scenario: T27 — krnl viewport pan requires a renderer
    Given no Electron window is open
    When the user types "krnl viewport pan --dx 100 --dy 0"
    Then exit code is 2
    And stderr contains "no active renderer"

  Scenario: T28 — krnl undo modifies the renderer's history
    Given the user has just added a task via "krnl task add 'x'"
    And an Electron window is open
    When the user types "krnl undo"
    Then the task is removed from the canvas (renderer history pops)
    And exit code is 0
```

---

## Out of Scope (this requirements doc)

- Voice integration with the terminal (`sys say` / `sys hear` exists at the parser level but is not part of the CLI-bridge requirements).
- Tabbed terminal panes inside a single TerminalNode (one PTY per node, locked).
- Remote / network RPC. Bridge is loopback-only by construction (TNF10).
- Streaming commands (`krnl board watch`, `krnl pomo tail`) — Phase 4.

---

## Test Coverage Notes for `tester`

- All Phase 1 scenarios above MUST have a passing unit or integration test before Phase 1 PR merges.
- Cascade-parity (T19) needs a property test: run the same command via UI dispatch and CLI dispatch on the same input board, assert structurally equal output boards.
- The MOTD test (T1–T5) needs to assert ANSI bytes, not pixel rendering — the renderer is not in the loop.
- T9 token-mismatch should be tested with a wrong-token attempt, a missing-token attempt, and a malformed-frame attempt. All three close with exit 126.
- T17 (cascade on active pomo) is the load-bearing regression test. Without it, the parity gap from §2 of the ADR re-emerges silently.
