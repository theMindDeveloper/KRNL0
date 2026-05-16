# KRNL0 — Instructions for Codex

This file is for **Codex working on the KRNL0 codebase**. It is not the in-app AI assistant prompt — that lives in [Codex/AGENTS.md](Codex/AGENTS.md). Read this first; it overrides defaults.

KRNL0 is an Electron + Vite + React + TypeScript infinite-canvas productivity app. HTW Berlin project. Live demo on **2026-07-20**. Architecture is locked at PRD v0.6.0.

---

## Hard rules (non-negotiable)

1. **🚫 NEVER add ANY AI / assistant attribution to commits, PRs, or anywhere else. ZERO-TOLERANCE RULE.** Applies to every AI coding tool without exception — Claude, Claude Code, Codex, Copilot, Cursor, Gemini, any other present or future model. Forbidden patterns include but are not limited to:
   - `Co-Authored-By: Claude …` / `Co-Authored-By: Codex …` / `Co-Authored-By: <any AI / model / tool name>`
   - `🤖 Generated with [Claude Code]…` / "Generated with …" / "Created with …" / "Authored by …" footers in commit messages **and** PR bodies
   - `noreply@anthropic.com`, `noreply@openai.com`, or any other AI-vendor email in trailers
   - AI tags or model names in commit messages, PR titles, PR descriptions, PR comments, issue comments, branch names, file headers, or code comments

   Even when a default template (e.g. `gh pr create` boilerplate, an SDK preset, a slash-command output, a `cat <<'EOF'` block copied from a guide) suggests the line — **strip it before sending**. "It was the default" / "the command suggested it" is not an excuse. Re-read this rule before every `git commit` and every `gh pr create`.

   The git user `theMindDeveloper` is the **sole author** of every commit. If you have already created a commit or PR with an AI attribution, fix it **before doing anything else**: amend the commit to remove the trailer (`git commit --amend` → `git push --force-with-lease`) and edit the PR body to remove the line (`gh pr edit <n> --body …`).
2. **Every merge to `main` must be documented in [docs/08-history/HISTORY.md](docs/08-history/HISTORY.md)** before the PR is merged. Append a new dated section in the existing format (Type, PRs/Commits, Files changed, Summary).
3. `**docs/` is the source of truth.** When you have a question — about a node contract, a requirement, a decision, the visual system, the roadmap — read the relevant doc first. Do not guess.
4. **TypeScript strict, no `any`.** `npm run typecheck` must be zero errors. `npm test` must be all green.
5. **All state mutations go through `sys` CLI or the Zustand store — never write `board.json` directly from app code.**
6. **Mother nodes (Pomo, Todo, Habit, Terminal) are fixed-position.** Do not make them draggable.
7. register issues and solve them using Github
8. Every fucntionality in the software should have a cli sys command too for Codex terminal to be able to interact with the app fully. for more read PRD6.0
9. **Journal every hard problem you solve into [docs/Challenges.md](docs/Challenges.md).** Trigger: a non-trivial bug or design problem has been solved AND the user has personally verified the fix works. Do not journal failed attempts, in-progress debugging, trivial typos, or fixes the user hasn't confirmed. Use the entry template at the top of the file (Symptom → Wrong guesses → Real cause → Fix → Lesson) and write in plain language — assume the reader is a future engineer who has never seen this code. Include the analogy you used to explain the bug to the user; that's often the most valuable part.
10. EACH WORK TREE SHOULD HAVE ITS OWN ENV, BOARD ETC, SO NO CONFLICT SHOULD APEAR WHEN BUILDING MULTIPLE FEATURES ON MUTLIPLE BRANCHES/WORKTREES LOCALLY, Make sure this happend as default with no additional commands

---

## Where to look (`docs/` map)


| Folder                                                   | What's there                                                                                                | Read it when…                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [docs/01-concept/](docs/01-concept/)                     | Vision and concept (`krnl0-description.md`)                                                                 | You need the "why"                                                                                                    |
| [docs/02-prd/](docs/02-prd/)                             | PRD v0.6.0 (locked spec)                                                                                    | You're touching anything load-bearing — scope is frozen here                                                          |
| [docs/03-architecture/](docs/03-architecture/)           | Three-layer overview, design patterns, **decisions.md** (ADRs 1–13+)                                        | Before any architectural change. ADRs are binding contracts                                                           |
| [docs/04-visual-system/](docs/04-visual-system/)         | Design tokens, colors, type, spacing                                                                        | Any UI/CSS work                                                                                                       |
| [docs/05-node-system/](docs/05-node-system/)             | `node-spec.md` — node contract (state, config, events, commands)                                            | Adding or modifying a node kind                                                                                       |
| [docs/06-requirements/](docs/06-requirements/)           | Per-component requirements (Functional, Use Cases, Gherkin Scenarios) — **start here for any feature work** | Always                                                                                                                |
| [docs/07-roadmap/](docs/07-roadmap/)                     | 10-week build roadmap, references                                                                           | Phase planning                                                                                                        |
| [docs/08-history/HISTORY.md](docs/08-history/HISTORY.md) | Running implementation log                                                                                  | After every merge — append an entry                                                                                   |
| [docs/Challenges.md](docs/Challenges.md)                 | Plain-language journal of hard bugs we've solved (symptom, wrong guesses, real cause, fix, lesson)          | After a non-trivial fix the user has verified — append an entry. Read before re-attacking a bug that "feels familiar" |
| `frontendref/LifeOS Whiteboard.html`                     | Authoritative UI design reference                                                                           | Any visual-parity work                                                                                                |


---

## Two workflows: pick the right one

### Workflow A — Big change (default)

Triggered by any of: new feature, new node kind, contract change, multi-component refactor, anything touching architecture, anything spanning more than one logical area.

**Do this in a git worktree.** All four sub-agents collaborate. Kanban + scrum.

#### 1. Spin up a worktree

```bash
git worktree add ../KRNL0-<feature-slug> -b feat/<feature-slug>
```

The worktree name **must match the feature** (e.g. `KRNL0-edge-wiring`, `KRNL0-voice-stt`, `KRNL0-task-pipeline`). Don't use random codenames. All work happens inside that worktree until merge.

#### 2. Start from `docs/06-requirements/`

Open the relevant `docs/06-requirements/<component>.md` (or create one in the same format if the component is new). The convention is fixed:

- **Functional Requirements** — `F1`, `F2`, … testable statements
- **Non-Functional Requirements** — `NF1`, `NF2`, …
- **Use Cases** — `UC-K1`, `UC-K2`, … (actor-driven)
- **User Stories** — "As a user, I want…"
- **Gherkin Scenarios (ATDD)** — `Feature:` / `Scenario:` blocks, one per `F#`

If a requirement isn't written down yet, the **architect** writes it (or the user dictates) before any code is written. That doc is the contract for the whole loop.

#### 3. Run the agent loop (kanban: Backlog → In Progress → Review → Done)


| Step                   | Agent              | Output                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Decide architecture | `architect`        | New entry in `docs/03-architecture/decisions.md` if a contract is in question                                                                                                                                                                                                                                                                   |
| 2. Implement           | `backend-dev`      | Code on the feature branch in the worktree                                                                                                                                                                                                                                                                                                      |
| 3. Test                | `tester`           | Vitest unit/integration tests mapping each `F#` and Gherkin scenario; runs `npm test` + `npm run typecheck`                                                                                                                                                                                                                                     |
| 4. Review & approve    | architect + tester | Both must sign off. Tester says PASS, architect confirms contract is met                                                                                                                                                                                                                                                                        |
| 5. Document & close    | `pm-docs`          | Walks the requirements doc's `## Use Cases` and `## Gherkin Scenarios (ATDD)` — every box checked. Then appends to [docs/08-history/HISTORY.md](docs/08-history/HISTORY.md). For substantial changes, also updates the relevant `docs/02-prd/`, `docs/03-architecture/`, `docs/04-visual-system/`, `docs/05-node-system/` so docs match reality |
| 6. Merge               | `pm-docs`          | PR merged to `main`. Worktree removed: `git worktree remove ../KRNL0-<feature-slug>`                                                                                                                                                                                                                                                            |


Nothing merges until **all four** have signed off (architect → backend-dev → tester → pm-docs). PM is the last gate; merge cannot happen without their requirement-checklist pass.

#### 4. Scrum cadence

Treat each requirements doc as a sprint backlog. Each `F#` / `UC-K#` / `Scenario` is a kanban card. Move cards Backlog → In Progress → Review → Done as you go — use TodoWrite to track this in-session. Don't open the next card until the current one is in Done.

### Workflow B — Small fast change (only when explicitly asked)

Triggered when the user says **"work fast"**, **"quick fix"**, **"just fix this"**, or similar. Examples: typo, one-line bug, lint, missing import, copy tweak.

Skip the entire multi-agent loop. **One agent (usually `backend-dev`) fixes the problem and opens the PR.** Still:

- No Codex co-author.
- Still append a one-line entry to [docs/08-history/HISTORY.md](docs/08-history/HISTORY.md) before merge (Type: Bug Fix / Chore, one-sentence summary). The history log is non-negotiable even on small changes.
- Typecheck and tests still must be green.

If you're unsure which workflow applies, ask. Default to A.

---

## Branch, commit, PR conventions

- **Branches:** `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`. For worktree-driven big changes, the branch name matches the worktree name.
- **Commits:** conventional, one concern per commit. Examples:
  - `feat(canvas): implement pointer-event pan and zoom`
  - `fix(board-store): correct edge deduplication`
  - `docs(history): record PR #57 merge`
- **PR description format** (enforced by `pm-docs`):
  ```
  ## Closes #<issue>

  ## What changed
  - <bullet>

  ## Acceptance criteria covered
  - [ ] F1 — <criterion>
  - [ ] F2 — <criterion>

  ## Test results
  - npm test: PASS
  - npm run typecheck: 0 errors

  ## History entry
  - Added to docs/08-history/HISTORY.md
  ```
- Never force-push to `main`. Never `--no-verify`. Never skip hooks.

---

## Local commands

```bash
npm run dev          # electron-vite dev (smoke test in Electron)
npm run build        # production build
npm test             # vitest run — must be green
npm run typecheck    # tsc --noEmit on main + renderer — must be 0 errors
```

Always run `npm run typecheck` and `npm test` before pushing. UI work additionally requires running `npm run dev` and exercising the feature in the actual Electron window — type/test green is not the same as feature green.

---

## Tech stack quick reference

Electron 30 · TypeScript 5.4 (strict) · React 18.3 · Zustand 4.5 · Zod 3.23 · `@xyflow/react` 12 · xterm.js 5.3 · node-pty (terminal) · Vitest 1.6 · `@testing-library/react` 16 · Vite 5.2 + electron-vite

```
src/
  brain/         LLM providers (Codex, API, Ollama)
  main/          Electron main process + IPC
  renderer/      React UI (Canvas, nodes, store, styles)
  shared/        types/ + Zod schemas/
  sys/           sys CLI (commands, parser, facade)
  voice/         STT + TTS providers
tests/
  unit/
  integration/
docs/            see "Where to look" above
```

Board persists to `~/Documents/krnl0/board.json`. The Zustand `boardStore` is the single source of truth in-process; `sys` and IPC are the only mutation paths.

---

## When in doubt

1. Read [docs/06-requirements/](docs/06-requirements/) for the component you're touching.
2. Read [docs/03-architecture/decisions.md](docs/03-architecture/decisions.md) for prior contracts.
3. Read [docs/08-history/HISTORY.md](docs/08-history/HISTORY.md) for what's already been done.
4. If still unclear — ask, don't guess.

