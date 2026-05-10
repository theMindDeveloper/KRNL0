# TerminalNode — Component Requirements

*Phase 5 · React Flow migration · Derived from PRD v0.6.0, Decision 12, Decision 13, and LifeOS Whiteboard reference*

---

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | The header (`.term-head`) renders three traffic-light dots (`.lights`: red, yellow, green), a label `"claude-code · ~/krnl0 · zsh"`, and a live badge `"● LIVE"` |
| F2 | The terminal body (`.term-body`) hosts an `xterm.js` instance; the KRNL0 ASCII logo and a dim separator are rendered as the initial welcome output |
| F3 | Clicking anywhere in the terminal body focuses the xterm input so the user can type immediately without a separate focus click |
| F4 | On mount the component sends `pty:create` over IPC with `{ nodeId: node.id, cwd: '~/krnl0', shell: 'zsh' }`; on unmount it sends `pty:kill` |
| F5 | User keystrokes are forwarded to main via `pty:write`; output from main via `pty:data` is written to the xterm instance |
| F6 | Terminal resize (node resize or window resize) sends `pty:resize` with `{ cols, rows }` derived from the xterm `fit` addon |
| F7 | The `sys` CLI is available inside the terminal; every GUI action documented in R4 has a `sys <command>` equivalent reachable from this node |
| F8 | An RF `<Handle type="source" position="right">` and `<Handle type="target" position="left">` are rendered for edge connectivity |
| F9 | Typed printable characters echo to the screen as the user types them (real TTY echo, not pipe-mode batch input) |
| F10 | Backspace deletes the previous character on screen and in the shell input buffer |
| F11 | Pressing Enter submits the current line; the shell executes the command and stdout/stderr render in the terminal |
| F12 | Arrow keys navigate command history (up / down) and cursor position within the current line (left / right) |
| F13 | `pty:resize` updates the underlying PTY's `cols` / `rows` so the shell wraps and re-flows long output correctly (no longer a no-op) |
| F14 | `claude` (Claude Code CLI) launches and runs interactively inside the terminal — closing the loop on Decision 3 |
| F15 | Closing or unmounting the terminal node kills the PTY process cleanly (no orphaned shells in Task Manager / `ps`) |

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Terminal background color is `var(--term-bg)` (#0c0a08); font family is JetBrains Mono |
| NF2 | The xterm instance is created once per `node.id` session; navigating away and back reconnects to the existing pty session without reset |
| NF3 | `pty:data` events are batched using `requestAnimationFrame` before writing to xterm to avoid layout thrashing |
| NF4 | Node minimum width is 480 px; minimum height is 300 px; the node is resizable |
| NF5 | A fresh `npm install` produces a working terminal on Windows / macOS / Linux without any manual native-rebuild step (postinstall hook) |
| NF6 | Switching Electron versions (e.g. `npm i electron@latest`) automatically triggers a node-pty rebuild against the new ABI |
| NF7 | The native rebuild flow is documented in [docs/05-node-system/node-spec.md](../../05-node-system/node-spec.md) with troubleshooting steps for common failures |

---

## Use Cases

**UC-X1 — Type a sys command**
Actor clicks the terminal body. Focus moves to xterm. Actor types `sys todo.add "fix tests"` and presses Enter. A new todo item appears in the TodoNode.

**UC-X2 — Session survives navigation**
Actor collapses the terminal node. Later expands it. The pty session is still alive; shell history is intact.

**UC-X3 — Resize terminal**
Actor drags the node resize handle. The xterm `fit` addon recalculates cols/rows. `pty:resize` is sent and the pty adjusts its line wrap accordingly.

---

## User Stories

- As a power user, I want a live terminal on the canvas so I can execute commands without leaving the board.
- As a user, I want clicking the terminal to immediately focus input so I do not have to hunt for a focus target.
- As a developer, I want the pty session to persist so I do not lose my shell state when I scroll away.
- As a user, I want `sys` CLI equivalents for all GUI actions so I can automate my workflow from the terminal.

---

## Gherkin Scenarios (ATDD)

```gherkin
Feature: TerminalNode IPC-backed terminal

  Background:
    Given a TerminalNode is mounted with node.id "term-1"

  Scenario: F1 — Header anatomy
    When the component renders
    Then ".term-head" contains three ".lights" dots
    And ".term-head" contains label text "claude-code · ~/krnl0 · zsh"
    And ".term-head" contains badge text "● LIVE"

  Scenario: F2 — Welcome output on mount
    When the component renders
    Then the xterm instance displays the KRNL0 ASCII logo
    And the xterm instance displays a dim separator line below the logo

  Scenario: F3 — Click to focus
    When the user clicks anywhere inside ".term-body"
    Then the xterm instance has focus
    And subsequent keystrokes are captured by xterm without requiring a second click

  Scenario: F4 — IPC pty:create on mount
    When the component mounts
    Then ipcRenderer.send is called with "pty:create" and { nodeId: "term-1", cwd: "~/krnl0", shell: "zsh" }

  Scenario: F4b — IPC pty:kill on unmount
    When the component unmounts
    Then ipcRenderer.send is called with "pty:kill" and { nodeId: "term-1" }

  Scenario: F5 — Keystrokes forwarded via pty:write
    Given the xterm instance has focus
    When the user types "ls"
    Then ipcRenderer.send is called with "pty:write" and { nodeId: "term-1", data: "ls" }

  Scenario: F5b — pty:data output written to xterm
    When main sends a "pty:data" IPC event with { nodeId: "term-1", data: "total 42\n" }
    Then the xterm instance renders "total 42"

  Scenario: F6 — Resize sends pty:resize
    When the node is resized so the xterm fit addon calculates 100 cols and 30 rows
    Then ipcRenderer.send is called with "pty:resize" and { nodeId: "term-1", cols: 100, rows: 30 }

  Scenario: F7 — sys command available
    When the user types "sys todo.add text=hello" in the terminal and presses Enter
    Then a new todo item "hello" appears in the TodoNode on the canvas

  Scenario: F8 — RF handles rendered
    When the component renders
    Then a React Flow Handle with type "source" and position "right" is present
    And a React Flow Handle with type "target" and position "left" is present

  Scenario: F9 — Local echo on typed input
    Given the xterm instance has focus
    When the user types "h"
    Then the character "h" appears on the terminal screen within one frame
    And no manual local-echo loop in the renderer is responsible for it (echo originates from the PTY)

  Scenario: F10 — Backspace edits the input buffer
    Given the xterm instance has focus and "echo hello" has been typed
    When the user presses Backspace twice
    Then the screen shows "echo hel"
    And the shell's pending input buffer reflects the same content

  Scenario: F11 — Enter submits the line
    Given the xterm instance has focus and "echo hi" has been typed
    When the user presses Enter
    Then the shell executes the command
    And the screen shows "hi" on the next line, followed by a fresh prompt

  Scenario: F12 — Arrow keys navigate history
    Given two prior commands "dir" and "echo hi" have been entered
    When the user presses Up Arrow
    Then the most recent command "echo hi" appears on the current input line
    When the user presses Up Arrow again
    Then "dir" appears on the current input line

  Scenario: F13 — Resize is delivered to the PTY
    When the node is resized so the xterm fit addon yields cols=120 rows=40
    Then "pty:resize" is sent with { sessionId, cols: 120, rows: 40 }
    And the PTY's reported size matches { cols: 120, rows: 40 }
    And subsequent shell output wraps at the new width

  Scenario: F14 — Claude Code runs in the terminal
    Given the xterm instance has focus
    When the user types "claude" and presses Enter
    Then claude-code starts and renders its interactive prompt
    And keystrokes including Ctrl+C are forwarded correctly

  Scenario: F15 — PTY killed on unmount
    Given a pty session with pid P is alive
    When the TerminalNode unmounts
    Then "pty:kill" is invoked with the session's id
    And process P is no longer listed by the OS process table within one second
```

---

*Last updated: 2026-05-10*
