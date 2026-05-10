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

---

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Terminal background color is `var(--term-bg)` (#0c0a08); font family is JetBrains Mono |
| NF2 | The xterm instance is created once per `node.id` session; navigating away and back reconnects to the existing pty session without reset |
| NF3 | `pty:data` events are batched using `requestAnimationFrame` before writing to xterm to avoid layout thrashing |
| NF4 | Node minimum width is 480 px; minimum height is 300 px; the node is resizable |

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
```

---

*Last updated: 2026-05-10*
