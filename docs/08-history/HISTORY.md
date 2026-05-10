# krnl0 — Implementation History

A running log of every significant change, bug fix, and architectural decision that has been implemented in the project. Entries are ordered chronologically, oldest first.

---

## [2026-05-09] — Initial scaffold

**Type:** Feature  
**Commit:** `d9c61fb` (initial) → `c20c55a` (rebrand to KRNL0)  
**Files changed:** All project root files, `src/main`, `src/renderer`, `src/shared`, `src/sys`  
**Summary:** Project born as "THE SYSTEM", immediately rebranded to KRNL0. Electron + Vite + React + TypeScript (strict) scaffold via `electron-vite`. Established the three-process model: `main` (Node.js/Electron), `renderer` (React), `sys` (CLI binary). Zustand store with `Node` and `Edge` type definitions added. Zod schemas for runtime validation of `board.json` introduced. `Persistence.save` / `Persistence.load` with round-trip test wired. Token system, fonts, and cyber theme (light + dark) applied. xterm.js dependencies wired for the upcoming Terminal node. Vitest + React Testing Library configured. PRD v0.6.0, architecture docs, 10-week build roadmap, and functional requirements R1–R10 written.  
**Tagged:** `v0.1.0`

---

## [2026-05-10] — Architecture decisions locked (Decisions 7–12)

**Type:** Architecture  
**Commit:** `5050d89` / `0abdb3b`  
**Files changed:** `docs/03-architecture/decisions.md`  
**Summary:** Six binding architectural contracts recorded before Phase 2 code was written.

- **Decision 7 — Canvas Transform State:** Viewport `(x, y, zoom)` lives in `boardStore`, debounced 500 ms to `board.json`. Pan is 1:1 screen-space pixels; zoom uses focal-point math. CSS order fixed: `translate ∘ scale`. Initial viewport `{ x:0, y:160, zoom:1 }`.
- **Decision 8 — Node Kind Dispatch:** Central `NODE_REGISTRY` in `src/renderer/components/nodes/registry.ts` maps kind strings to React components. `NodeKindSpec<T,C>` (renamed from `NodeKind<T,C>`) is the registration interface; `NodeKind` is now the literal-union of valid kind strings. Unknown kinds render `<UnknownNode>` — never throw.
- **Decision 9 — PomoNode State Contract:** FSM with four statuses (`idle / running / break / done`). Countdown is always derived from `now - startedAt`; never stored. On-load auto-emit of `pomo.complete` if the deadline passed while the app was closed (restart-resume).
- **Decision 10 — TodoNode State Contract:** Flat `items[]` in insertion order. Render-time sort: undone first, then ascending `createdAt`. IDs via `crypto.randomUUID()`.
- **Decision 11 — HabitNode State Contract:** Sparse `log: string[]` of local YYYY-MM-DD dates. Streak walks backwards from today; if today is not yet marked it counts from yesterday so the streak does not flash zero before the day's check. Week starts Monday (ISO 8601).
- **Decision 12 — TerminalNode IPC Contract:** `node-pty` in main process, `xterm.js` in renderer, bridged via six session-keyed IPC channels (`pty:create`, `pty:write`, `pty:resize`, `pty:kill`, `pty:data`, `pty:exit`). Sessions identified by `node.id`.

---

## [2026-05-10] — Phase 2: Canvas pan/zoom and node routing

**Type:** Feature  
**PRs / Commits:** `6480d9a` (pan/zoom), `8240346` (node registry)  
**Issues:** #1, #2  
**Files changed:** `src/renderer/store/boardStore.ts`, `src/renderer/components/Canvas/index.tsx`, `src/renderer/components/nodes/registry.ts`  
**Summary:** Implemented infinite-canvas pan (middle-mouse + space+drag) and focal-point zoom. Canvas transform follows Decision 7's `translate ∘ scale` order. `NODE_REGISTRY` dispatch pattern introduced per Decision 8 — canvas iterates `board.nodes`, resolves component by `kind`, renders with `NodeProps`. Unknown kinds render `<UnknownNode>` without throwing.

---

## [2026-05-10] — Phase 2: Four mother nodes implemented

**Type:** Feature  
**PRs / Commits:** `feat(pomo)`, `feat(todo)`, `feat(habit)`, `feat(terminal)`; see also `d7a0808`, `aec336d`, `94aec36`, `9b36736`  
**Issues:** #5, #6, #7, #8  
**Files changed:** `src/renderer/components/nodes/PomoNode/`, `src/renderer/components/nodes/TodoNode/`, `src/renderer/components/nodes/HabitNode/`, `src/renderer/components/nodes/TerminalNode/`  
**Summary:**
- **PomoNode** (Issue #5): 25-min FSM timer (`idle/running/break`), session persistence via `startedAt`, history log of completed/cancelled sessions.
- **TodoNode** (Issue #6): Flat item list with add/toggle/delete. Render-time sort — undone first. `completedAt` tracking.
- **HabitNode** (Issue #7): Sparse YYYY-MM-DD log, Mon–Sun grid, streak calculation safe from yesterday's missing entry, archiving support.
- **TerminalNode** (Issue #8): `xterm.js` + `node-pty` wired via `sessionId`-keyed IPC channels per Decision 12. Later replaced `node-pty` with `child_process` shell session in `4fa99b63` due to native-rebuild friction in development.

**Tests:** 116 unit tests covering all Phase 2 node logic added alongside implementation.

---

## [2026-05-10] — Boot and command-dispatch fixes

**Type:** Bug Fix  
**PRs:** #17, #18, #19  
**Commits:** `35d6658`, `20fcf13`, `c21ebb2`  
**Files changed:** `src/main/index.ts`, `package.json`, `src/renderer/store/boardStore.ts`  
**Summary:** Three sequential fixes to get `npm run dev` from broken to functional.
1. `fix/boot-board` (PR #17): Seeded a default board and wired `boardLoad` on app mount so the canvas is not blank on first launch.
2. `fix/package-main-path` (PR #18): Corrected `package.json main` to `out/main/index.js` (the electron-vite output path).
3. `fix/command-dispatch-and-theme` (PR #19): Wired command dispatch end-to-end; enabled dark theme by default; added dot-grid CSS to canvas.

---

## [2026-05-10] — UI polish: app chrome, node styling, orb animations

**Type:** Feature  
**PRs:** #29, #28  
**Commits:** `fec110a`, `efc2082`, `d111e85`  
**Files changed:** `src/renderer/components/TopBar/`, `src/renderer/components/StatusBar/`, canvas wrapper CSS  
**Summary:** Added topbar (brand-mark, wordmark, breadcrumb, live badge), statusbar (node/edge counts), and orb animation. Node selection, child-node drag, and edge rendering added to the canvas. `sys:run` IPC channel wired for the `sys` CLI subprocess.

---

## [2026-05-10] — Visual polish: LifeOS reference-parity pass

**Type:** Feature  
**PRs:** #30, #31, #32, #33, #34, #35, #36  
**Commits:** `dc6b71f`, `3fa6b99`, `63ece11`, `595bf81`, `207f922`, `a0ea047`, `f478075`, `6381e77`, `200a3a5`, `3a722d7`  
**Files changed:** All four node component directories, canvas layout CSS  
**Summary:** Comprehensive visual pass aligning each node against the LifeOS Whiteboard reference screenshots.
- **PomoNode**: Vertical pill battery with slot tag and corner brackets.
- **HabitNode**: Week-row layout, streak with arrow, slot tag.
- **TodoNode**: Visual polish + child task pipeline (TaskNode).
- **TerminalNode**: Claude-code header, traffic lights, `+LIVE` badge.
- **Layout**: Four mother nodes arranged in a centered row at uniform 320 px width.

**Issues fixed:** Terminal typing input, task pipeline creation, mother-to-task edge connections, pomo pill width overflow.

---

## [2026-05-10] — Performance: render isolation

**Type:** Refactor / Performance  
**PR:** #37  
**Commit:** `e1acb1e`  
**Files changed:** `src/renderer/components/Canvas/index.tsx`, node wrapper components  
**Summary:** Full render isolation — pan and drag operations no longer cause all nodes to re-render. Achieved by memoizing node components and narrowing the Zustand selector subscriptions so canvas pointer events do not invalidate node subtrees.

---

## [2026-05-10] — Phase 5: React Flow migration

**Type:** Architecture / Feature  
**PRs:** #45, #46, #47, #48, #49, #50, #51, #52  
**Commits:** `6d58f84` (ADR), `10c5b37` (RF infra), `fd2f549` (PomoNode), `ac2dc7b` (HabitNode), `a3cc357` (TerminalNode), `4d276d7`, `0612844` (app chrome), `65a4ce8` (TodoNode + TaskNode)  
**Files changed:** `src/renderer/components/Canvas/index.tsx`, all node components, `src/renderer/components/TopBar/`, `src/renderer/components/StatusBar/`, `src/renderer/components/Dock/`, `docs/03-architecture/decisions.md` (ADR #13), `docs/06-requirements/` (per-component Gherkin specs)  
**Summary:** Migrated the custom CSS-transform canvas to `@xyflow/react` (React Flow). ADR #13 recorded the rationale: React Flow provides built-in node drag, edge rendering, minimap, and `<Panel>` positioning — replacing ~400 lines of bespoke pointer-event handling. Per-component Gherkin requirements written for the five app-chrome panels (TopBar, StatusBar, Dock, Minimap) and all four node types, then implemented to reference-parity. Key impacts:

- All chrome panels (`TopBar`, `StatusBar`, `Dock`) migrated to use RF `<Panel>` component — not `position: fixed` CSS — so they track the RF container boundary correctly.
- `createNodeAdapter` HOC wraps each node component to add RF source/target `<Handle>` elements without polluting the node component itself.
- `rfAdapters.ts` bridges the `NodeProps` contract to RF's `NodeProps` shape.
- `boardStore.viewport.test.ts` added for Decision 7 pan/zoom math.
- `jsdom` devDependency added (PR #52) to support component-level scenario tests.

**Issues fixed during this phase:** `TaskNode` fields `sequenceNumber`, `layer`, and `eta` made optional to maintain `board.json` compatibility with boards saved before those fields existed.

---

## [2026-05-10] — Post-merge regressions fix (PR #53)

**Type:** Bug Fix  
**PR:** #53  
**Commits:** `a705582` (six regressions), `a3d7789` (vitest config alias)  
**Files changed:** `vitest.config.ts`, various renderer source files  
**Summary:** Six regressions introduced by the Phase 5 merge were resolved.

1. **vitest xyflow mock alias conflict:** Two alias entries for `@xyflow/react` existed — `.tsx` mock and `.ts` mock. Resolved by keeping `.tsx` as the winner per Vite alias precedence.
2. **Performance — `onMove` → `onMoveEnd`:** React Flow's `onMove` fires on every animation frame during a pan or zoom. This was writing viewport state to `boardStore` at 60 fps, causing a full Zustand re-render cascade on every frame. Changed to `onMoveEnd` so viewport is only written once the gesture completes.
3. **Performance — StatusBar `useStore`:** `StatusBar` was reading `zoom` from `boardStore` (which received those 60-fps writes). Changed to read zoom directly from React Flow's internal store via `useStore(s => s.transform[2])` — this sidesteps `boardStore` entirely, eliminating the 60-fps re-render for the status bar.
4. **Terminal keyboard input — `nokey` class + `onKeyDown stopPropagation`:** The `TerminalNode` container was receiving `onKeyDown` events that the React Flow canvas was intercepting before `xterm.js` could process them (RF intercepts Space, arrow keys, etc. for its own panning). Fixed by adding the `nokey` CSS class (which React Flow uses to suppress its own key handling) and calling `e.stopPropagation()` on the container's `onKeyDown` handler.
5–6. Two additional regressions addressed in the same PR (type errors and import corrections arising from the RF migration rename of `NodeKind` → `NodeKindSpec`).

**Issues fixed:** Terminal keyboard no longer swallowed by RF canvas; StatusBar zoom display accurate; 60-fps Zustand write storm eliminated.

---

## [2026-05-10] — Current session: dock redesign and node creation

**Type:** Feature  
**Status:** In progress (not yet merged to main)  
**Files changed:** `src/renderer/components/Dock/`, `src/renderer/components/nodes/TextNode/`, `src/renderer/components/nodes/ImageNode/`, `src/renderer/components/Canvas/index.tsx`  
**Summary:** Dock redesigned to spawn child nodes (text, image) instead of parent (mother) nodes. Glassmorphic visual container applied (`backdrop-filter: blur`, border, `border-radius: 8px`). `TextNode` and `ImageNode` placeholder components added to the node registry. `handleAddNode` in the canvas wired to `boardStore.addNode` for actual node creation. Fixed (mother) nodes now show `‹` / `›` reorder arrows on hover, allowing adjacent nodes to swap horizontal positions.

---

## [2026-05-10] — Terminal keyboard input regression fix

**Type:** Bug Fix  
**Branch:** `fix/terminal-keyboard`  
**Files changed:** `src/renderer/components/nodes/TerminalNode/index.tsx`, `src/renderer/components/Dock/index.tsx`, `src/renderer/components/Orb/index.tsx`  
**Summary:** Keyboard input to the terminal stopped working. Two regressions stacked:

1. The PR #58 revert (`3b9e57d`) accidentally removed the `.xterm-helper-textarea` direct-focus call that `ac542e1` had added. Under Electron + React Flow, `term.focus()` alone does not always focus the helper textarea, so keystrokes fell on the floor. Restored by querying `containerRef.current.querySelector('.xterm-helper-textarea')` and calling `.focus()` on it inside the same microtask.
2. The `Dock` (n / i / v shortcuts) and `Orb` (Space push-to-talk) global `keydown` handlers checked `e.target.tagName === 'TEXTAREA'` to bail, but when xterm focus has fallen back to `<body>` (timing race with RF), the target is body, the check passes, and the shortcut fires instead of typing reaching the shell. Both handlers now also walk up from `document.activeElement` and bail when anything inside `.term-body` / `.xterm` is in scope.

Same fix applied on `feat/new-features` via direct push (PR #61 carries it forward).

---

## [2026-05-10] — `npm run reset` script for clearing board state

**Type:** Chore  
**Branch:** `chore/reset-board-script`  
**Files changed:** `scripts/reset-board.mjs`, `package.json`  
**Summary:** Added a small Node script that deletes the per-instance `board.json` (and, with `--hard`, the Electron `userData` folder). The script reads `package.json#name` and computes the same path that `handlers.ts` uses, so it correctly targets `~/Documents/<app-name>/board.json` regardless of which worktree it runs in. Two npm scripts wire it up: `npm run reset` (board only) and `npm run reset:hard` (board + userData). Running either prints the resolved path before deleting, so the developer always sees what was removed. After a reset, the next `npm run dev` re-seeds a fresh board via `seedBoard()`.

---

## [2026-05-10] — Worktree isolation: per-instance board path (Decision 17)

**Type:** Bug Fix / Architecture  
**Branch:** `fix/worktree-isolation`  
**Files changed:** `src/main/ipc/handlers.ts`, `docs/03-architecture/decisions.md` (ADR 17), `docs/08-history/HISTORY.md`  
**Summary:** Fixed silent loss of state when running two worktrees in parallel.

**Problem.** With two active worktrees (`main` and `feat/new-features`) running `npm run dev` in parallel, both Electron instances hard-coded `BOARD_DIR = ~/Documents/krnl0/board.json`. When the feature worktree (which knows the new `calendar` / `text` / `image` node kinds) seeded those nodes into the board, then `main` was launched, the heal-on-load logic in `handlers.ts` (PR #63) silently dropped the unknown nodes and persisted a stripped board. Returning to the feature worktree found the board already cleaned — and the seed gate did not re-fire because the file still existed. The user's calendar and other new nodes "disappeared." Both worktrees also shared Electron's `userData` folder (`%APPDATA%\krnl0\`) because both `package.json` files declared `name: "krnl0"`, compounding the cross-contamination of localStorage and caches.

**Fix.** `BOARD_DIR` is now derived from `app.getName()` with a `KRNL0_BOARD_DIR` env-var override. Production main keeps `name: "krnl0"`, so end-users see no change (`~/Documents/krnl0/board.json` continues to work). Feature branches that introduce schema-breaking node kinds rename their `package.json#name` (e.g. `krnl0-newfeatures`), which automatically routes both the board file **and** Electron's `userData` to a separate folder. ADR 17 documents the contract and conventions; `feat/new-features` carries the matching `name` rename so the two instances are now fully isolated.

---

## [2026-05-10] — Terminal node-pty migration (Issue #67)

**Type:** Bug Fix / Architecture
**Issue:** #67
**PRs / Commits:** `5a54e46` (docs requirements F9–F15 NF5–NF7), `cd940ab` (architecture Decision 12 re-affirm + Decision 18), `8e84180` (feat terminal node-pty), `5aa5ace` (test IPC-level handlers)
**Files changed:** `docs/06-requirements/terminal-node.md`, `docs/03-architecture/decisions.md`, `docs/06-requirements/test-coverage.md`, `src/main/ipc/handlers.ts`, `package.json`, `package-lock.json`, `tests/unit/main/handlers.pty.test.ts`
**Summary:**

**The bug.** The terminal node accepted keystrokes but typed characters never appeared on screen. After the initial Windows banner, `cmd.exe` produced no output regardless of what the user typed. Issue #67 documented the root cause via instrumentation: `stdin.write` returned `true` (the byte reached the child), but `cmd.exe` never wrote anything back. This is the textbook pipe-vs-TTY behavior on Windows: when stdin is a pipe, `cmd.exe` switches to non-interactive pipe mode — line-buffered, no character echo, no readline editing, no ANSI cursor handling. A secondary bug existed in the same handler: the `args` array passed to spawn were PowerShell flags (`-NoLogo -NoExit -Command -`) applied to `cmd.exe`, which silently ignored them.

**Why `4fa99b63` was wrong.** Phase 2 (commit `4fa99b63`) substituted `child_process.spawn` for `node-pty` in `src/main/ipc/handlers.ts`. The motivation was pragmatic: `node-pty` is a native module requiring a per-Electron-version rebuild, and at that point no `postinstall` hook existed. `child_process` ships with Node and required no extra tooling, so it appeared a zero-risk shortcut to unblock Phase 2. In reality it produced an unusable terminal: without a real PTY (no ConPTY on Windows, no POSIX PTY on Linux/macOS) interactive shells enter pipe mode. This violated F9 (echo), F10 (backspace), F11 (Enter submit), F12 (arrow-key history), and F14 (`claude` interactive prompt) — defeating the entire purpose of the terminal node as established in Decision 3.

**Fix — Decision 12 re-affirmed.** Restored `node-pty` per the original Decision 12 IPC contract. `node-pty` is added to `dependencies` (runtime, not dev — required at app start). `@electron/rebuild` is added to `devDependencies` with a `postinstall` hook (`electron-rebuild -f -w node-pty`) that compiles `node-pty` against the installed Electron ABI on every `npm install` and every `npm i electron@<new>`, satisfying NF5 and NF6. The `-f` flag forces recompile even if a `.node` file is present. `pty:resize` is no longer a no-op; the cmd.exe + PowerShell-flags secondary bug is removed.

**Decision 18 — Native rebuild flow.** New ADR recorded in `docs/03-architecture/decisions.md`. Key contracts: `node-pty` in `dependencies`, `@electron/rebuild` in `devDependencies`, `postinstall` script as above, failure mode is intentionally loud (build error on missing toolchain, never a silent `child_process` fallback). A pure-JS fallback is explicitly rejected — it reproduces the bug.

**Windows install requirement.** On Windows, `npm install` runs the postinstall rebuild. This requires the **Visual Studio Build Tools** with the "Desktop development with C++" workload (includes MSVC compiler and Windows SDK). Without it, `postinstall` fails and `npm install` exits non-zero — the developer sees the failure immediately rather than a silent runtime crash. To install: download the VS Build Tools installer from `https://visualstudio.microsoft.com/visual-cpp-build-tools/`, select "Desktop development with C++", install, then re-run `npm install`. On macOS: Xcode Command Line Tools (`xcode-select --install`). On Linux: `build-essential` (`sudo apt install build-essential`). Full troubleshooting steps are recorded in `docs/03-architecture/decisions.md` Decision 18.

**Regression analysis.** The Phase 2 regression escaped detection because `TerminalNode.scenarios.test.ts` mocks the IPC layer at the renderer boundary — it never exercises the main-process handlers that actually spawn the shell. The new `tests/unit/main/handlers.pty.test.ts` (13 tests) closes that gap by testing at the main-process boundary with a mocked `node-pty`, asserting that `pty:create`, `pty:write`, `pty:resize`, and `pty:kill` route through `proc.write`, `proc.resize`, and `proc.kill` correctly, and that unknown `sessionId`s are silently ignored.

**Acceptance criteria status:**

| Requirement | Status | Notes |
|---|---|---|
| F1 — Header anatomy | PASS | Regression-tested by TerminalNode.scenarios.test.ts |
| F2 — Welcome boot output | PASS | Regression-tested |
| F3 — Click to focus | PASS | Regression-tested |
| F4 — pty:create on mount | PASS | Regression-tested + IPC-level in handlers.pty.test.ts |
| F5 — pty:write keystrokes | PASS | Regression-tested + IPC-level |
| F6 — pty:resize | PASS | IPC-level confirmed in handlers.pty.test.ts |
| F7 — sys CLI in terminal | PASS | Regression-tested |
| F8 — RF handles | PASS | Regression-tested |
| F9 — Local echo on typed input | DEFERRED | Structurally satisfied by node-pty; live verification pending VS Build Tools install |
| F10 — Backspace edits buffer | DEFERRED | Same |
| F11 — Enter submits line | DEFERRED | Same |
| F12 — Arrow keys navigate history | DEFERRED | Same |
| F13 — Resize delivered to PTY | PASS | IPC-level confirmed in handlers.pty.test.ts |
| F14 — claude runs | DEFERRED | Depends on live terminal; pending VS Build Tools |
| F15 — PTY killed on unmount | PASS | IPC-level confirmed in handlers.pty.test.ts |
| NF5 — postinstall produces working terminal | PASS (conditional) | Hook is wired; requires toolchain on developer machine |
| NF6 — Electron version bump re-triggers rebuild | PASS (conditional) | `-f` flag ensures this |
| NF7 — Rebuild flow documented | PASS | Decision 18 in docs/03-architecture/decisions.md |

F9–F12 and F14 are structurally verified — the node-pty handlers are wired and correct — but live end-to-end confirmation is deferred until VS Build Tools are installed. A follow-up tracking issue is filed to close this gate.

**Test count:** 285 passing (was 272), 1 todo. `npm run typecheck`: 0 errors. `npm run build`: clean.

---

## [2026-05-10] — Terminal Backspace on Windows (xterm DEL → cmd BS translation)

**Type:** Bug Fix  
**Branch:** `fix/terminal-backspace`  
**Files changed:** `src/renderer/components/nodes/TerminalNode/session.ts`  
**Summary:** After the node-pty migration (PR #68), typing in the terminal worked on Windows but Backspace did nothing. Root cause: xterm.js emits `0x7f` (DEL) on Backspace by default — `bash`, `zsh`, and PowerShell all accept that, but Windows `cmd.exe` only recognises `0x08` (BS) and silently drops `0x7f`. Fix is a one-line translation in the renderer's `term.onData` handler: replace any `\x7f` with `\x08` before forwarding to `pty:write`. Cross-platform safe — every shell on every OS treats `\x08` as an erase, so the translation never causes harm.

---

## [2026-05-10] — Default Windows shell switched to PowerShell

**Type:** Refactor / UX  
**Branch:** `feat/terminal-default-powershell`  
**Files changed:** `src/main/ipc/handlers.ts`, `docs/03-architecture/decisions.md` (Decision 12 §Default shell)  
**Summary:** Default shell on Windows is now `powershell.exe` instead of `cmd.exe`. The previous logic (`process.env.COMSPEC ?? 'powershell.exe'`) always resolved to `cmd.exe` because `COMSPEC` is set on every default Windows install — the powershell fallback was unreachable. cmd.exe is a 1985-era batch interpreter with several known TTY-semantics problems through ConPTY (the most visible being the `0x7f`/`0x08` Backspace mismatch fixed in PR #70); PowerShell handles standard byte conventions, ANSI, Unicode, history, and tab completion natively. The renderer-side `0x7f→0x08` translation is kept as a defence-in-depth measure for users who explicitly opt back into cmd.exe via the new `KRNL0_SHELL` environment override. Decision 12's `Default shell` block updated to record the rationale and the override mechanism.

---

## [2026-05-10] — Terminal UX hardening (Backspace, Ctrl+C, cwd, GPU rendering)

**Type:** Bug Fix / UX  
**Branch:** `feat/terminal-fixes`  
**Issues:** #72, #73, #74, #75  
**Files changed:** `src/main/ipc/handlers.ts`, `src/renderer/components/nodes/TerminalNode/index.tsx`, `src/renderer/components/nodes/TerminalNode/session.ts`, `package.json`, `docs/03-architecture/decisions.md` (Decision 19), `docs/06-requirements/terminal-node.md` (F16–F19), `tests/unit/main/handlers.pty.test.ts`, `tests/unit/renderer/TerminalNode.scenarios.test.ts`  
**Summary:** Four follow-on issues from real `claude` use inside the terminal node, all closed in one coordinated PR.

- **#72 — Backspace in PowerShell.** PR #70 had translated `0x7f`→`0x08` for cmd.exe; PR #71 then made PowerShell the default, breaking Backspace because PowerShell expects `0x7f` natively. Removed the translation. cmd.exe users (opt-in via `KRNL0_SHELL`) accept that Backspace is a cmd.exe limitation.
- **#73 — Claude TUI lag and dropped keystrokes.** Switched xterm to a GPU-accelerated renderer: `@xterm/addon-webgl` with `@xterm/addon-canvas` fallback, both dynamically imported so they don't break Node test environments.
- **#74 — PTY cwd in user home.** Changed default `cwd` to `process.cwd()` so `claude` immediately sees `CLAUDE.md` and `board.json`. `KRNL0_TERM_CWD` overrides; falls back to `USERPROFILE`/`HOME` if the path doesn't exist.
- **#75 — Ctrl+C did nothing.** Added an explicit `attachCustomKeyEventHandler`: with selection → copy to clipboard and clear; without selection → write `0x03` (SIGINT) to the PTY directly. No longer relies on xterm's variable default behaviour.

New requirements F16–F19 + Gherkin scenarios. New ADR Decision 19. Test coverage extended (291 passing, 0 failing, 0 typecheck errors).

---

## [2026-05-11] — Terminal fill-height + mouse selection + copy/paste menu

**Type:** Bug Fix / UX
**Branch:** `fix/terminal-select-and-fill`
**Issues:** #77
**Files changed:** `src/renderer/components/nodes/TerminalNode/index.tsx`
**Summary:** Two visible bugs in the terminal node, one fix.

- **Bottom black gap (terminal looked "cut in half").** The term-body had a fixed `height: 280` while the MotherFrame is `minHeight: 480`, so the bottom ~170px showed the MotherFrame's dark `--term-bg` background. Wrapper now `flex: 1; display: flex; flexDirection: column; minHeight: 0` and the xterm mount is `flex: 1; minHeight: 0` — xterm flex-grows into the full mother-frame column. Existing `ResizeObserver` picks up the new dimensions and fits xterm rows/cols + `ptyResize` accordingly.
- **Mouse drag-selection didn't work.** `onPointerDownCapture` / `onMouseDownCapture` with `stopPropagation` on the term-body were killing xterm's own native mousedown listener on the screen element (the listener that starts a drag-selection). Same trap as #72 with `onKeyDownCapture`. Switched to bubble-phase `onPointerDown` / `onMouseDown` so xterm receives the event first and React Flow is still blocked from grabbing it.
- **Defense in depth.** Added a scoped `.term-body { user-select: text }` override (overrides the global `body { user-select: none }` in `tokens.css` so the DOM-renderer fallback path can natively select). Added a right-click context menu (Copy / Paste / Select All) and Ctrl+Shift+C / Ctrl+Shift+V keybindings for discoverability. Plain Ctrl+C still SIGINTs (copy-on-selection handler from #75 unchanged).

**Tests:** 291 passing, 0 typecheck errors. Live-verified in Electron: drag-select works, context menu works, terminal fills the full mother-frame height.
