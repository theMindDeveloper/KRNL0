# Orb — ask anything (Claude CLI)

*Decision 41. Issue #224.*

The orb's "ask anything" box answers through Claude Code: the same assistant as the terminal, with the same instructions (`claude/CLAUDE.md`) and the same reach (`krnl`), shown as text in the orb.

## Functional Requirements

| # | Requirement |
|---|---|
| F1 | Typing a question and pressing Enter sends it to `claude -p` in the main process; the answer streams into the orb panel as it is written. |
| F2 | Claude runs in the app's `claude/` folder with `krnl` on its PATH and the RPC credentials, like the terminal; only `Bash(krnl:*)` is allowed. |
| F3 | Each `krnl` command Claude runs shows as a quiet line under its answer (e.g. "krnl todo list"). |
| F4 | Follow-up questions continue the same conversation (`--resume`); a "New chat" button (×) starts a fresh one. |
| F5 | While Claude is answering, the box shows "thinking…", a second question waits, and **Stop** cancels the answer. A question that takes over 3 minutes stops with a message. |
| F6 | Errors say what to do: not installed → how to install; not signed in → run `claude` once in the terminal; timed out; failed (its last line). |
| F7 | A message that names a built-in flow ("focus session") still starts that flow without Claude. |
| F8 | The prompt is passed on stdin, never as a command-line argument. |

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NF1 | Nothing is sent to Claude unless the user asks; no question is logged with secrets. |
| NF2 | The stream parser is pure and unit-tested (text deltas, tool use, result, errors). |
| NF3 | In the browser preview (no Electron bridge) the orb says Claude answers in the desktop app. |

## Use Cases

- **UC-A1:** "What's on my plate today?" → Claude runs `krnl todo list`, answers in two sentences; the panel shows the line "krnl todo list" under the answer.
- **UC-A2:** "Move gym to 18:00" → Claude runs the `krnl` command, the Calendar updates, the orb says what it did.
- **UC-A3:** Claude Code isn't installed → the orb says so and how to install it.

## Gherkin Scenarios (ATDD)

```gherkin
Feature: Ask the orb
  Scenario: F1 — an answer streams in
    Given Claude Code is installed and signed in
    When I type "what's on my plate today?" and press Enter
    Then the answer appears in the orb panel as it is written

  Scenario: F3 — what it did is visible
    When Claude runs "krnl todo list"
    Then a line "krnl todo list" shows under the answer

  Scenario: F4 — follow-ups continue
    Given I asked a question
    When I ask "and tomorrow?"
    Then Claude answers in the same conversation

  Scenario: F6 — not installed
    Given the claude command is missing
    When I ask anything
    Then the orb says Claude Code isn't installed and how to install it
```
