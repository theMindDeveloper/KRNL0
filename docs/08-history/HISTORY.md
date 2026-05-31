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

---

## [2026-05-11] — Drag stutter eliminated + task-flow edge visual parity with ref

**Type:** Bug Fix / UX
**Branch:** `main`
**Files changed:** `src/renderer/components/Canvas/CanvasFlow.tsx`, `src/renderer/components/StatusBar/index.tsx`, `src/renderer/store/useViewportPersistence.ts`, `src/renderer/styles/reactflow-theme.css`, `src/renderer/styles/tokens.css`, `src/renderer/components/nodes/TaskNode/index.tsx`, `.gitignore`
**Summary:** Two user-reported issues fixed in one pass.

- **Task-flow edges now match the LifeOS Whiteboard reference.** Replaced the flat cyan stroke with a per-edge SVG `<linearGradient gradientUnits="userSpaceOnUse">` anchored to the actual `(sourceX,sourceY)→(targetX,targetY)` coords — stops `0.18 → 0.6 → 1.0` so the trail fades in at the source and lands at full intensity on the target task. Stroke is 3 px, rounded caps, cyan drop-shadow glow (`drop-shadow(0 0 5px rgba(78,168,176,0.45))`). Hover ramps to brighter cyan. The seamless dash march comes from a period-matched `@keyframes krnl-task-flow-dash` (sweeps `stroke-dashoffset 22 → 0`, matching the `14 8` dasharray sum) at 1.6 s linear infinite — replaces RF's built-in `dashdraw` keyframe which sweeps only 10 units and caused a visible 12-unit snap each loop. Added `--cyan-glow: #7dd6df` token. TaskNode accent dot + `+ POMO` button switched from rust/acid to cyan to match the design ref.

- **Node drag stutter eliminated (RF warning #015 resolved).** Symptom: dragging an image/text/task node stuttered, and the console showed `[React Flow]: It seems that you are trying to drag a node that is not initialized`. Two root causes intertwined: (1) `onNodesChange` was ignoring `'dimensions'` changes, so RF never had measured node sizes and silently fell back to a slow uninstrumented drag path; (2) every drag tick was routing a position update through Zustand → `CanvasFlowInner` re-render → memos re-run → mother nodes (including TerminalNode with its xterm instance) re-render 60 fps. Fixed by switching to RF's recommended pattern: a local `useState<KrnlRFNode[]>` owns the live RF working copy and absorbs **every** change (position, dimensions, select) via `applyNodeChanges`. Zustand remains the persisted source of truth — a sync `useEffect` copies `derivedNodes → local nodes` from the store whenever it changes, but only when `isDraggingRef.current === false` so mid-drag ticks aren't clobbered. Drag end commits the final position to Zustand once and persists to disk. Result: zero re-renders outside RF's internal repositioning during drag, dimensions changes registered, fast measured drag path active.

  Secondary perf wins kept from the iteration: `getMemoizedRfEdge` cache (non-dragged edges return cached refs → RF skips edge re-render); `getMemoizedRfNode` extended to mother nodes keyed on `(node ref, slotIndex, slotTotal, hasLeft, hasRight)`; StatusBar / `useViewportPersistence` / outer `CanvasFlow` switched from `useBoardStore((s) => s.board)` to primitive selectors so they no longer re-render on board-ref churn.

**Tests:** 291 passing, 0 typecheck errors. Live-verified in Electron: smooth 60 fps drag with no stutter, no console warning, edges render with the source-to-target opacity fade matching the reference.

---

## [2026-05-11] — Surface pty:create failure on macOS (turn opaque crash into actionable diagnostic) — F20

**Type:** Bug Fix
**Branch:** `main`
**Files changed:** `src/main/ipc/handlers.ts`, `src/renderer/components/nodes/TerminalNode/session.ts`, `src/renderer/components/nodes/TerminalNode/index.tsx`, `tests/unit/main/handlers.pty.test.ts`, `tests/unit/renderer/TerminalNode.scenarios.test.ts`, `docs/06-requirements/terminal-node.md`
**Summary:** User reported the terminal was empty on macOS, with `Error invoking remote method 'pty:create': Error: posix_spawnp failed.` in devtools followed by a `_isDisposed` crash and "Too many active WebGL contexts" warnings. The native binary loaded fine (postinstall ran), but node-pty's macOS path throws a bare `posix_spawnp failed.` with no errno attached, leaving the user (and the dev) with no way to know whether it was a missing shell, a bad cwd, an Apple-Silicon arch mismatch, an env var, or TCC. The renderer then made things worse: the rejected promise bubbled up, React's error boundary unmounted the TerminalNode, the unmount disposed the WebGL addon, the addon re-disposed itself on context loss, and rapid remounts piled up WebGL contexts until the GPU lost the device.

Three changes, in priority order:
1. **Diagnostic in `handlers.ts pty:create`.** Wrap `pty.spawn` in try/catch and rebuild the error message as a multi-line block: `platform`/`arch`, `shell` (with `existsSync`), `cwd` (with `existsSync`), raw `$SHELL`, `KRNL0_SHELL`, `KRNL0_TERM_CWD`, the underlying error message, and `errno`/`code` if attached. `console.error` to the dev terminal AND throw the same message so the renderer receives it. No silent fallback to alternate shells — Decision 12 §Re-affirmed forbids fallback paths because they hide the bug.
2. **Catch in `session.ts`** (load-bearing). `startTerminalSession` catches the `ptyCreate` rejection, writes "Terminal failed to start." in red and the diagnostic in dim grey directly into the xterm body, then returns a no-op cleanup. The React error boundary never fires, the node never unmounts, the WebGL cascade never starts. Devtools-only diagnostics are useless when the user is debugging from a screenshot — putting it in the terminal itself is what makes the diagnostic actionable.
3. **Defense in depth in `TerminalNode/index.tsx`.** Wrapped the WebGL addon's `dispose()` in an idempotency flag + try/catch so `onContextLoss` and the unmount cleanup can both fire without the second one crashing on the addon's nulled internal `_isDisposed` field.

**Tests:** 293 passing, 0 typecheck errors. New coverage: `handlers.pty.test.ts` asserts the diagnostic-message format when `pty.spawn` throws; `TerminalNode.scenarios.test.ts` asserts the session swallows the rejection, writes the diagnostic to the xterm body, and does not call `ptyKill` (no session was created). Awaiting macOS live-verification — once the user reloads, the next failure will print the actual shell, cwd, errno so we can see *which* of the candidate causes (cwd, env, arch) is the real one, instead of guessing.

## [2026-05-12] — HabitNode v2 (color, multi-view, past backfill, settings popover, sys wiring)

**Type:** Feature
**Branch:** `feat/habit-v2`
**Files changed:** `src/renderer/components/nodes/HabitNode/{types,commands,index}.ts(x)` (extended), `src/renderer/components/nodes/HabitNode/HabitPopover.tsx` (new), `src/renderer/components/Canvas/commandDispatch.ts` (generalised dispatch return type), `src/main/persistence/board.ts` (new — shared load/save + migrations), `src/main/ipc/handlers.ts` (uses shared persistence; SysFacade gets deps), `src/sys/SysFacade.ts` (deps + habit routing), `src/sys/parser.ts` (color/remove/view/list subcommands), `src/sys/commands/habit.ts` (full wiring, no more stubs), `docs/03-architecture/decisions.md` (Decision 14), `docs/06-requirements/habit-node.md` (F9–F17, NF5–NF6, UC-H5–UC-H9, new Gherkin), `tests/unit/renderer/HabitNode.v2.test.ts` (new — 35 cases), `tests/unit/renderer/HabitNode.scenarios.test.ts` (F8 contract update), `tests/unit/sys/parser.test.ts` (color/remove/view/list cases), `tests/unit/sys/habit.test.ts` (new — 17 CLI round-trip cases).
**Summary:** HabitNode upgraded to v2 per Decision 14. Adds `HabitColor` (6 cyber tokens) and `HabitView` (`week | month | year`) to the schema, with render-time + load-time back-fill so existing `board.json` files keep working. Three views render contribution-graph-style at sizes that fit the 380px mother card. Settings gear in the header opens an inline popover (no portal) with view toggle, per-habit color swatch picker, and hard-delete (×). Past-day toggle is unbounded (user back-fills any historical day) while future dates are no-ops at the FSM level so the sys CLI cannot bypass the rule. `sys habit add | done | streak | color | remove | view | list` are wired end-to-end through the new `src/main/persistence/board.ts` module; SysFacade gets `{ boardPath, hasOpenRenderer, onBoardChanged }` deps so the renderer is notified to reload when a CLI mutation lands. 347 tests + typecheck green.

## [2026-05-12] — Todo/Task bidirectional linkage + TaskNode FSM (Decision 20)

**Type:** Feature
**Branch:** `feat/todo-task-nodes`
**Files changed:** `src/renderer/components/nodes/TodoNode/types.ts` (taskNodeId added), `src/renderer/components/nodes/TodoNode/commands.ts` (todoLinkTask added; todoAdd emits taskNodeId:null), `src/renderer/components/nodes/TaskNode/types.ts` (parentTaskId, todoItemId, pomoSessionsCompleted added), `src/renderer/components/nodes/TaskNode/commands.ts` (new — taskToggle, taskEdit, taskIncrementPomo, taskActivate), `src/renderer/components/nodes/TaskNode/index.tsx` (rewrite — inline edit, subtask row, context menu, body-click pomo, opacity-on-done), `src/renderer/components/nodes/TodoNode/index.tsx` (row right-click menu, body click-to-pomo), `src/renderer/components/ContextMenu/index.tsx` (new — portal context menu), `src/renderer/store/boardStore.ts` (removeNode added), `src/renderer/components/Canvas/commandDispatch.ts` (full task.* wiring: bidirectional toggle mirror, cascade-delete, subtask spawn, pomo start), `src/main/persistence/board.ts` (todo.task STATE_DEFAULTS backfill; migrateTodoItemFields for taskNodeId), `src/sys/commands/todo.ts` (real board.json ops replacing stubs), `src/sys/commands/task.ts` (new — add, edit, toggle, delete, pomo, subtask, list), `src/sys/parser.ts` (task subcommand union added), `src/sys/SysFacade.ts` (todo + task routing), `docs/03-architecture/decisions.md` (Decision 20), `tests/unit/renderer/TaskNode.scenarios.test.ts` (fixture updated), `tests/unit/renderer/TodoNode.commands.test.ts` (taskNodeId assertion added), `tests/unit/sys/parser.test.ts` (9 task parser tests added).
**Summary:** Implements Decision 20: bidirectional linkage between TodoItems and TaskNodes. `TodoItem` gains `taskNodeId` and `TaskState` gains `parentTaskId`, `todoItemId`, `pomoSessionsCompleted`. The commandDispatch kernel handles `task.toggle`↔`todo.toggle` done mirroring, cascade-delete (BFS descendants + linked TodoItem), subtask spawning, and pomo starting (routes to the single pomo mother node). A portal-rendered `ContextMenu` component provides right-click menus on task and todo rows. `sys task add|edit|toggle|delete|pomo|subtask|list` and real `sys todo add|check|list` replace all previous stubs. Board load migrations backfill new fields on existing `board.json` files. 480 tests + typecheck green.

**Branch topology note:** `feat/todo-task-nodes` was branched from `cd44f1c` (habit v2, recorded above) rather than directly from `main` because the implementation requires the shared `src/main/persistence/board.ts` module that habit v2 introduced. Merging PR #80 therefore also brings `cd44f1c` (habit v2) into `main` as a build-order dependency.

## [2026-05-12] — TextNode & ImageNode become real nodes (Decision 21)

**Type:** Feature
**Branch:** `feat/text-image-nodes` (PR #88)
**Files changed:**
- New requirements: `docs/06-requirements/text-node.md`, `docs/06-requirements/image-node.md`
- New ADR: `docs/03-architecture/decisions.md` (Decision 21 — authored as 20 on the branch; renumbered on merge to avoid collision with `feat/todo-task-nodes`' Decision 20)
- Main: `src/main/index.ts` (privileged scheme registration; userData override via `KRNL0_USER_DATA`), `src/main/ipc/assets.ts` (new — pipeline + `krnl-asset://` protocol handler + magic-byte validation), `src/main/boardIo.ts` (new — `mutateBoard` + `notifyBoardChanged` for sys commands), `src/main/preload.ts` (assetWrite/Read/Delete, onBoardChanged), `src/main/persistence/board.ts` (text + image kinds added to STATE_DEFAULTS)
- Renderer: `src/renderer/components/nodes/TextNode/{index.tsx, types.ts, commands.ts (new)}`, `src/renderer/components/nodes/ImageNode/{index.tsx, types.ts, commands.ts (new)}`, `src/renderer/components/Canvas/CanvasFlow.tsx` (drop, onConnect, file-picker for dock image button, right-click context menu with mother-protected delete), `src/renderer/components/Canvas/rfAdapters.tsx` (handles connectable for non-mother nodes, handle z-index 10, animation off on edges), `src/renderer/components/Canvas/commandDispatch.ts` (route text/image commands), `src/renderer/components/Canvas/dropImage.ts` (new — file ingestion helper), `src/renderer/store/boardStore.ts` (`removeNode` action — mother-protected), `src/renderer/store/useBoardChannel.ts` (new — board:changed listener), `src/renderer/App.tsx` (mount the channel), `src/renderer/env.d.ts` (extended KrnlBridge)
- Sys: `src/sys/parser.ts` (text/image subcommands), `src/sys/SysFacade.ts` (real dispatch for text/image), `src/sys/commands/text.ts` (new), `src/sys/commands/image.ts` (new)
- Tooling: `scripts/dev.mjs` (new — per-worktree isolated dev: KRNL0_BOARD_DIR + KRNL0_USER_DATA + ELECTRON_RUN_AS_NODE cleanup so `npm run dev` doesn't trample sibling worktrees), `.gitignore` (`.krnl0-data/`)
- Tests: `tests/__mocks__/@xyflow/react.tsx` (NodeResizer stub), `tests/unit/renderer/{TextNode,ImageNode}.commands.test.ts`, `tests/unit/renderer/{TextNode,ImageNode}.scenarios.test.tsx`, `tests/unit/renderer/nodeRegistry.test.ts` (text/image assertions), `tests/unit/renderer/boardStore.removeNode.test.ts` (new), `tests/unit/main/assets.test.ts` (new), `tests/unit/sys/parser.text-image.test.ts` (new), `tests/unit/sys/commands.text-image.test.ts` (new)

**Summary:** TextNode and ImageNode were read-only display stubs. This PR makes both first-class:

- **TextNode**: click-to-edit textarea, 400 ms debounced autosave + commit-on-blur, Escape cancels, NodeResizer (min 180×80, max 1200×2000), persists width/height in state, visual matches LifeOS spec (Instrument Serif 18 px, dashed→solid border on hover).
- **ImageNode**: real file-backed assets. Drag any PNG/JPG/WEBP/GIF/SVG onto the canvas → ImageNode created at the drop position with the bytes copied to `<BOARD_DIR>/assets/<ULID>.<ext>`. Dock's image button opens the OS file picker and spawns a fully-formed node (no empty placeholders). `<img src="krnl-asset://<id>">` serves the bytes through a privileged Electron protocol. NodeResizer with min 120×80 / max 1600×1600; Shift toggles aspect-ratio lock. Click-to-replace control swaps the asset.
- **Asset pipeline**: `asset:write` validates magic bytes per extension; SVG rejected if it contains `<script`/`onload=`/`onerror=`/`onclick=`. 25 MB hard cap. Privileged scheme registered before `whenReady` so `<img>` requests succeed under CSP.
- **Connections**: non-mother nodes connectable. Dragging a source handle to a target handle adds an edge with `from.event = 'link'`, `to.command = 'link'` — purely visual relations. Edge animation off (it was visually escaping the node bezels under the cyan drop-shadow); handle z-index lifted to 10 so the left connector dot stays in front of the image body.
- **Right-click delete**: right-click any non-mother node → `Delete` action. `boardStore.removeNode` filters the node and every edge that touches it. Mother nodes (pomo / todo / habit / term) suppress the canvas-level menu entirely — they own their own right-click UX (HabitNode per-habit color/pin/icon menu, TodoNode per-row menu, etc.), so the canvas handler early-returns on `isMother` and lets the inner menu run.
- **`sys` CLI parity**: `sys text add/set/resize`, `sys image add/replace/resize/clear`. Main mutates `board.json` and emits `board:changed`; renderer reloads via `useBoardChannel`.
- **Dev isolation**: `npm run dev` now goes through `scripts/dev.mjs` which points `KRNL0_BOARD_DIR` + `KRNL0_USER_DATA` at `.krnl0-data/` inside the current worktree, and clears `ELECTRON_RUN_AS_NODE` so Electron boots as the main process. Sibling worktrees no longer fight over `~/Documents/krnl0/board.json` or `%APPDATA%/krnl0/` Chromium cache.

**Tests:** 550+ passing, 0 typecheck errors after merge with origin/main.

---

## [2026-05-13] — Worktree isolation: per-instance Vite dev-server port

**Type:** Bug Fix / Isolation
**Branch:** `fix/worktree-port-isolation`
**PR:** #89
**Files changed:** `scripts/dev-port.mjs` (new), `scripts/dev-port.d.mts` (new), `scripts/dev.mjs`, `electron.vite.config.ts`, `src/main/index.ts`, `tests/unit/dev-port.test.ts` (new), `docs/03-architecture/decisions.md` (ADR 17 amendment)
**Summary:** Closed the final gap in the worktree isolation story established by ADR 17 and PR `fix/worktree-isolation`. Board JSON, the assets folder, and Electron `userData` were already isolated per worktree. The missing surface was the Vite dev-server port. Vite defaults to `5173` and, when a second worktree starts `npm run dev`, silently falls back to `5174` — but `src/main/index.ts` had the URL hardcoded to `http://localhost:5173`. The result was that worktree B's Electron window loaded worktree A's renderer bundle: both windows showed identical UI even though each was reading its own separate `board.json`, making the isolation appear completely broken from the developer's seat. The fix introduces a new `scripts/dev-port.mjs` helper that derives a deterministic port from a SHA-1 hash of the absolute worktree root path, mapped into the range `[5174, 5273]`. `scripts/dev.mjs` sets `KRNL0_DEV_PORT` from this helper (honoring a pre-set value as an escape hatch). `electron.vite.config.ts` reads `KRNL0_DEV_PORT` into `renderer.server.port` with `strictPort: true` — the strict flag is non-negotiable: without it Vite would silently fall back and reintroduce the exact bug. `src/main/index.ts` reads the same env var when constructing the dev URL, falling back to `5173` so single-instance launches without `scripts/dev.mjs` remain unaffected. Five Vitest tests cover determinism, range, spread across distinct paths, and edge cases. ADR 17 amended with a `### Update — 2026-05-13: Dev server port` subsection documenting the symptom, root cause, decision, and conventions. Tests: 555 passed, 0 failed. `npm run typecheck`: 0 errors.

---

## [2026-05-13] — Pomodoro v2: gear settings, active-task mode, per-task time tracking

**Type:** Feature
**Branch:** `claude/objective-montalcini-ae7bb0`
**Files changed:**
- New ADR: `docs/03-architecture/decisions.md` (Decision 22 — supersedes Decision 9 PomoConfig fields)
- Requirements: `docs/06-requirements/pomo-node.md` (F9–F13), `docs/06-requirements/todo-node.md` (F15), `docs/06-requirements/task-node.md` (F14–F17)
- Renderer types: `src/renderer/components/nodes/PomoNode/types.ts` (canonical `PomoConfig` + `activeTaskId`), `src/renderer/components/nodes/TaskNode/types.ts` (`plannedMin`, `secondsAccumulated`)
- Renderer FSM: `src/renderer/components/nodes/PomoNode/commands.ts` (long-break branching, `pomoSetConfig`, `pomoClearActiveTask`), `src/renderer/components/nodes/TaskNode/commands.ts` (`taskAccumulateSeconds`, `taskSetPlannedMin`)
- Renderer UI: `src/renderer/components/nodes/PomoNode/index.tsx` (gear panel + active-task header), `src/renderer/components/nodes/TodoNode/index.tsx` (minutes input), `src/renderer/components/nodes/TaskNode/index.tsx` (corner timer + active highlight)
- Dispatcher: `src/renderer/components/Canvas/commandDispatch.ts` (activation flow with commit-elapsed-then-load, side-effects of cancel/complete onto active task)
- Persistence: `src/main/persistence/board.ts` (`migratePomoConfig`, `migrateTaskPlannedMin`, CONFIG_DEFAULTS for `pomo`, STATE_DEFAULTS updated for both kinds, canonical seed)
- Sys CLI: `src/sys/commands/task.ts` (initialise new fields when spawning tasks/subtasks)
- Tests: `tests/unit/renderer/PomoNode.commands.test.ts` (taskId on history record, activeTaskId in state shape), `tests/unit/renderer/PomoNode.decision22.test.ts` (new — 13 tests), `tests/unit/main/board.decision22-migration.test.ts` (new — 4 tests)

**Summary:** Pomodoro got three connected upgrades. (1) A **gear icon** in the PomoNode header opens an inline settings panel with `Session / Short break / Long break / Long break every` fields; SAVE persists via `pomo.setConfig`. (2) **Active-task mode**: clicking any TaskNode (or a linked todo row) now atomically commits the prior session's elapsed time to the previous active task, swaps `pomoState.activeTaskId`, loads the new task's per-session length, and starts running. The PomoNode header switches to `TASK · <text>` in acid colour, and the active TaskNode gains a 2-px acid ring + `0 0 24px` glow. (3) A **corner timer** in the top-left of each TaskNode shows `secondsAccumulated + live delta`, formatted `H:MM:SS` or `MM:SS`. The timer is rendered statically except when this task is the active running one — then a single 500 ms `setInterval` is mounted locally (one ticker per app, gated by `isActiveRunning`), so the dock/perf regression that PR #56 fixed is not reintroduced.

The PomoNode FSM gains long-break branching: `pomoComplete` now reads `(sessionsCompleted + 1) % longBreakEvery === 0` and writes either `shortBreakMin` or `longBreakMin` into `state.breakMin`. The legacy `PomoConfig` schemas (the seed's `{ shortBreakMin, longBreakMin, sessionsUntilLongBreak }` and v1 `defaultPomoConfig`'s `{ defaultDurationMin, defaultBreakMin, longBreakEvery, longBreakMin }`) are healed at load time by `migratePomoConfig` into the canonical `{ sessionMin, shortBreakMin, longBreakMin, longBreakEvery }` — this migration runs *before* `migrateNodeStates` so CONFIG_DEFAULTS doesn't clobber legacy-derived values. Tests pin the migration and the FSM. TodoNode's add-task row gains a small minutes input; the regex `/,\s*time:\s*(\d+)/i` is a fallback when the dedicated input is empty.

**Tests:** 572 passed (+17 new), 0 typecheck errors.

---

## [2026-05-13] — Pomodoro v2 bug-fix pass (PR #90 follow-up)

**Type:** Bug fix / hardening
**Branch:** `claude/objective-montalcini-ae7bb0` (PR #90 picks up the additional commit)
**Files changed:**
- ADR: `docs/03-architecture/decisions.md` (Decision 22.1)
- Requirements: `docs/06-requirements/{pomo,task}-node.md` (F-rows added)
- Renderer types/FSM: `PomoNode/types.ts` (paused status, pausedAt, pausedElapsedMs), `PomoNode/commands.ts` (pomoPause, pomoResume; pomoCancel loosened), `TaskNode/types.ts` (currentSessionElapsedSec), `TaskNode/commands.ts` (taskSetCurrentSessionElapsedSec, taskClearCurrentSessionElapsedSec)
- Dispatcher: `commandDispatch.ts` (loadTaskIntoPomo, checkpointActiveTaskElapsed, extended task.toggle/task.delete cascades, secondsAccumulated commit on toggle-done)
- Renderer UI: `PomoNode/index.tsx`, `TaskNode/index.tsx`
- Persistence: `src/main/persistence/board.ts` (STATE_DEFAULTS extensions, seed updated)
- Tests: `tests/unit/renderer/PomoNode.decision22.test.ts` (+pause/resume), `tests/unit/renderer/TaskNode.commands.test.ts` (+ checkpoint), `tests/unit/main/board.decision22-migration.test.ts` (+migration), `tests/unit/renderer/commandDispatch.decision22-bugs.test.ts` (new — 15), `tests/unit/renderer/PomoNode.bugs.test.tsx` (new — 15), `tests/unit/renderer/TaskNode.bugs.test.tsx` (new — 13), `tests/integration/PomoNode.decision22-bugs.scenarios.test.ts` (new — 25 Gherkin)

**Summary:** User ran `npm run dev` on the v0.6.1 worktree and filed 9 bugs against the Pomodoro v2 feature. An audit confirmed all 9 plus 3 adjacent defects. A 4-agent team (FSM → dispatcher → UI → tester → pm-docs) executed the bug-fix pass on the same branch. Highlights: (1) real PAUSE/RESUME via a new `'paused'` FSM status with `pausedAt`/`pausedElapsedMs`; (2) per-task in-flight session checkpoint (`currentSessionElapsedSec`) so task A retains its progress when the user switches to task B and back; (3) `task.loadIntoPomo` separates "load settings" from "start session" so clicking a task no longer auto-starts the timer; (4) session-length clamp so a 1-min task gets a 1-min session, not 10; (5) gear UI moved top-right and disabled while busy; (6) pip count capped at 8 with overflow text. The 9 user stories the user manually tested are now Gherkin scenarios in `tests/integration/PomoNode.decision22-bugs.scenarios.test.ts`, ensuring CI catches any regression.

**Tests:** 662 passing (+53 since PR #90 base), 0 typecheck errors, build clean.

---

## [2026-05-13] — Pomodoro / Todo family v2.2 — UI polish, animated edges, subtask backfill

**Type:** Bug fix / UX polish
**Branch:** `claude/objective-montalcini-ae7bb0` (PR #90 second follow-up pass)
**ADR:** Decision 22.2
**Commits:** `0705d71` (feat), `734933b` (fix), `8f6e3c5` (test)
**Files changed:**
- ADR: `docs/03-architecture/decisions.md` (Decision 22.2)
- Docs: `docs/03-architecture/styling-philosophy.md` (new — color-family contract)
- Renderer UI: `TaskNode/index.tsx` (START/STOP buttons replace `+ POMO`), `TodoNode/index.tsx` (header bullet `--cyan`, MotherFrame `borderColor="var(--cyan-glow)"`, minutes input wider)
- Dispatcher: `commandDispatch.ts` (`task.stopPomo` command, `parseMinutesFromText` trailing-suffix parser, `task.addSubtask` bidirectional backfill, `task.delete` subtask cascade)
- Canvas: `rfAdapters.tsx` (animated task-flow edges `animated: true` for `todo.task → todo.task`; `krnl-kind-<kind>` className emitted for CSS-scoped selection ring)
- Styles: `reactflow-theme.css` (cyan selection ring for `.krnl-kind-todo` / `.krnl-kind-todo--task`, softer drop-shadow `3px / 0.30`)
- Tests: `tests/integration/PomoNode.decision22-2-stories.test.ts` (new — 30 Gherkin scenarios across 6 user stories)

**What happened.** User ran `npm run dev` on the Decision 22.1 worktree and filed 6 follow-up issues. None required schema changes — every fix reuses existing state fields:

- **Issue 1 — Blue `+ POMO` button auto-starts pomo.** Replace single `+ POMO` with per-task START (green, `--acid`) and STOP (red, `--rust`). START dispatches `task.startPomo`; STOP dispatches new `task.stopPomo` command which commits elapsed seconds, cancels the pomo, and clears `activeTaskId`. STOP only visible when this task is the active one. `task.spawnPomo` stays in dispatcher for sys CLI.
- **Issue 2 — Task body click should load only, not start.** Verified: body-click dispatches `task.loadIntoPomo` (Decision 22.1). No code change needed; documented in Decision 22.2 as a contract invariant.
- **Issue 3 — TodoNode quick-add: typing time in text field should work without a mouse click.** Extended `parseMinutesFromText` to also match a trailing suffix (`"foo 25m"`, `"foo 25 min"`, `"foo 25minutes"`). Returns `{ plannedMin, strippedText }`. Trailing suffix takes precedence over inline `, time: N` and over UI minutes input. Minutes input widened from 36 px to 52 px.
- **Issue 4 — Subtask via right-click didn't appear in parent TodoList.** `task.addSubtask` now appends a new TodoItem to the parent TodoNode (resolved via `parentTask.parentTodoId`) and writes bidirectional links atomically. `task.delete` cascade extended to remove every descendant's linked TodoItem before removing task nodes.
- **Issue 5 — Selection highlight: rounded blue ring for todo family.** `rfAdapters.tsx` emits `krnl-kind-<kind>` className per node. A more-specific CSS rule in `reactflow-theme.css` overrides the global acid-green ring for `.krnl-kind-todo` and `.krnl-kind-todo--task`: rounded `box-shadow: 0 0 0 2px var(--cyan)`. TodoNode header bullet changed from `--rust` to `--cyan`; MotherFrame receives `borderColor="var(--cyan-glow)"`.
- **Issue 6 — Animated edge lines not visible.** `rfAdapters.tsx` sets `animated: true` only when `srcKind === 'todo.task' && tgtKind === 'todo.task'`. Cyan drop-shadow softened from `5px / 0.45` to `3px / 0.30`; hover retains `9px / 0.85`.

**Why.** Concrete UX problems that blocked daily use: the auto-starting `+ POMO` button hijacked the timer unintentionally; subtasks silently vanished from the todo list; the selection ring gave no visual indication of todo-family membership; the dash-march animation the user originally spec'd was disabled.

**Tests:** 694 passing (+32 since Decision 22.1 pass), 1 todo, 0 failed. Typecheck clean.

---

## [2026-05-15] — Pan stutter fix: shared rAF batcher eliminates layout thrashing

**Type:** Bug Fix / Performance
**Branch:** `fix/pan-perf`
**Issue:** #124
**Files changed:**
- `src/renderer/utils/rafBatcher.ts` (new)
- `src/renderer/components/nodes/MotherFrame/index.tsx`
- `src/renderer/components/Canvas/CanvasFlow.tsx`

**Root cause.** After PR #123 the canvas pan stuttered at runtime. The culprit was 11 `getBoundingClientRect()` calls per animation frame — 6 from MotherFrame badge-tracking rAF loops and 5 from SwapButtonNode proximity-reveal rAF loops triggered by `pointermove`. Each loop ran independently, so reads and writes were interleaved across callbacks: callback A writes `style.left`, callback B reads `getBoundingClientRect()` (which must flush pending layout to return accurate values), causing up to 11 separate layout recalculations per 16 ms frame.

**Fix.** Introduced a module-level `rafBatcher` singleton (`src/renderer/utils/rafBatcher.ts`) with a `scheduleBatch({ read, write }) => unregister` API. It runs ONE shared `requestAnimationFrame` loop that fires all registered `read()` callbacks before any `write()` callback. This guarantees a single layout flush per frame regardless of how many trackers are registered — the classic read-then-write batching pattern.

- **MotherFrame** — replaced individual `useLayoutEffect` rAF loops with `scheduleBatch`. Badge BCR read goes in `read()`, `style.left/top` update in `write()`.
- **SwapButtonNode** — replaced per-button `pointermove`→rAF pattern with `scheduleBatch`. Button BCR read goes in `read()`, opacity/pointer-events update in `write()`. Cursor position tracked via a module-level `pointermove` listener.
- **MotherFrame** — removed `willChange: 'transform'` from inline style. Promoting 6 GPU compositor layers cost VRAM with no pan benefit (RF transforms the viewport wrapper during pan, not per-node elements). The CSS `transition: transform 280ms` on `.krnl-mother` is unchanged and still drives the swap animation.

**Tests:** 1080 passing, 0 typecheck errors.

---

## [2026-05-15] — Pan stutter fix pass 2: eliminate all DOM reads from the hot path (viewportBus)

**Type:** Bug Fix / Performance
**Branch:** `fix/pan-perf`
**Issue:** #124
**Commit:** `fefae21`
**Files changed:**
- `src/renderer/utils/viewportBus.ts` (new)
- `src/renderer/components/nodes/MotherFrame/index.tsx`
- `src/renderer/components/Canvas/CanvasFlow.tsx`
- `src/renderer/components/nodes/PomoNode/index.tsx`
- `src/renderer/components/nodes/TodoNode/index.tsx`
- `src/renderer/components/nodes/HabitNode/index.tsx`
- `src/renderer/components/nodes/TerminalNode/index.tsx`
- `src/renderer/components/nodes/CalendarNode/index.tsx`
- `src/renderer/components/nodes/ClockNode/index.tsx`

**Root cause (deeper).** Pass 1 (rafBatcher) consolidated 11 separate rAF loops into one shared loop with all reads before all writes — one layout flush per frame instead of 11. But the `read()` callbacks still called `getBoundingClientRect()` on each badge and swap-button DOM element. Writing `style.left/top` in the previous frame's `write()` dirtied the layout tree; the next frame's `getBoundingClientRect()` in `read()` forced a sync re-layout to resolve those dirty writes. Even with batching, one layout flush per frame remained.

**Fix.** Introduced `viewportBus.ts` — a module-level singleton that tracks the RF viewport transform `(x, y, zoom)` and the canvas container's screen offset `(canvasLeft, canvasTop)`. Any RF flow-space point `(rfX, rfY)` can be converted to a screen-space pixel position with pure arithmetic:

```
screenX = canvasLeft + rfX * zoom + vpX
screenY = canvasTop  + rfY * zoom + vpY
```

No DOM reads. The formula holds because the RF canvas wrapper does not move during pan — RF translates the viewport using a CSS `transform` on its inner node-layer, and the raw `(x, y, zoom)` values already encode that transform.

- **CanvasFlow** — `onMove` callback calls `updateViewport(x, y, zoom)` every pan/zoom frame (pure module-level write, no React state or Zustand update). A `ResizeObserver` on the canvas container div calls `updateCanvasRect(left, top)` whenever the canvas offset changes (window resize, panel toggle). `initialViewport` is seeded into viewportBus on mount so badges are correct before the first pan gesture.
- **MotherFrame** — badge tracking replaced: `getBoundingClientRect()` removed. `read()` calls `rfToScreen(position.x + 14, position.y - 11)` (zero DOM access). Badge style changed from `top/left` positioning (layout-dirty) to `transform: translate(X, Y)` (compositor-level, no layout dirty). Badge starts at `transform: translate(-9999px, -9999px)` so it is invisible before the first rAF tick. Accepts a `position: {x, y}` prop (the node's RF flow-space coordinates); re-registers scheduleBatch when the position changes (after a swap).
- **SwapButtonNode** — proximity detection replaced: `getBoundingClientRect()` removed. `read()` calls `rfToScreen(positionAbsoluteX + 16, positionAbsoluteY + 16)` where `positionAbsoluteX/Y` are the RF-provided flow-space coordinates of the 32×32 button node. Zero DOM reads per frame.
- **6 mother node files** — each MotherFrame call gains `position={node.position}` so the new prop is satisfied.

**Result:** 0 DOM reads and 0 layout flushes per frame during pan. The only work per rAF tick is arithmetic in the `read()` callbacks and a single `style.transform` write per badge/button in `write()` — both compositor-level operations the GPU handles without involving the layout engine.

**Tests:** 1080 passing, 0 typecheck errors.


---

## [2026-05-15] — Startup sound + SFX engine

**Type:** Feature
**Branch:** `feat/startup-sound`
**Files changed:**
- `src/renderer/sfx/sfxEngine.ts` (new — shared SFX engine singleton)
- `src/renderer/sfx/sounds/krnl0startup.mp3` (new — startup audio asset)
- `src/renderer/App.tsx` (play startup sound on mount)
- `src/renderer/store/useCliDispatch.ts` (sfx.play / sfx.stop / sfx.list handlers)
- `src/sys/parser.ts` (sfx play/stop/list command types)
- `src/sys/SysFacade.ts` (sfx command routing via cliDispatch)

**Summary:** Added a startup sound that plays when the renderer mounts, plus a thin shared SFX engine (`sfxEngine`) for app-level sound effects. The engine follows the same `import.meta.glob` + HTML5 Audio + caching pattern as the existing VoicePlayer in the Assistant component, but lives independently in `src/renderer/sfx/` so any component can use it without coupling to Assistant internals. The startup sound is a simple fire-and-forget play on App mount; autoplay-policy rejections are silently swallowed. Three sys CLI commands added: `krnl sfx play <clipId>`, `krnl sfx stop`, `krnl sfx list` — all renderer-coupled via the existing cliDispatch bridge.

**Tests:** Pre-existing 2 AppChrome test failures and 1 typecheck error in PomoNode (both on main before this change). No regressions introduced.


---

## [2026-05-16] — fix(boot): boardSaveLogging crashed on contextBridge frozen `window.krnl`

**Type:** Bug Fix
**Branch:** `fix/board-save-logging-readonly`
**Files changed:** `src/renderer/store/eventLog/boardSaveLogging.ts`
**Summary:** App failed to launch with `TypeError: Cannot assign to read only property 'boardSave' of object '#<Object>'` because `installBoardSaveLogging` tried to mutate `window.krnl.boardSave` in place. `contextBridge.exposeInMainWorld` freezes the bridge object, so the property assignment threw. Replaced the in-place monkey-patch with a Proxy wrapper that intercepts `boardSave` and routes every other key through to the original bridge, installed via `Object.defineProperty(window, 'krnl', …)` so the renderer keeps booting even on Electron versions where the bridge is non-configurable.


---

## [2026-05-17] — Decision 28: task `kind` (`focus`/`event`) + break-aware scheduling + contrast pass

**Type:** Feature + Architecture + UX polish
**Branch:** `feat/decision-28-pr-b`
**PR:** [#142](https://github.com/theMindDeveloper/KRNL0/pull/142)
**ADR:** [`docs/03-adr/0007-pomodoro-task-kinds-and-contrast-pass.md`](../03-adr/0007-pomodoro-task-kinds-and-contrast-pass.md)
**Spec:** `docs/03-architecture/decisions.md` § Decision 28
**Files changed:** ~22 files across `src/renderer` and `src/main`. Full list in the ADR.

**Summary:** Tasks now carry a `kind: 'focus' | 'event'` discriminator. A `focus` task is the existing Pomodoro behaviour: 25/5 work-break cadence, calendar block extended by the break overhead, clock arc with break overlays. An `event` task is a flat block — load it into the pomo timer and it runs as one big session, no breaks; the calendar shows a solid slot, the clock shows a single solid arc. Parity between the FSM and the schedule walker is now guaranteed by a shared `pomoRules.ts` (`isLongBreakAfter`, `computeCurrentSessionMin`) so the timer and the visualization can never drift apart.

**Why:** Two real-world cases broke the old model — "go to university 09:00-12:00" (not a pomodoro, do not insert breaks) and "75-min focus task at 02:00" (was rendered as 75-min on the calendar but ran for 85 min wall-clock on the timer, breaking cascade placement of the next task).

**How it shipped:** Two PRs by design. **PR-A** introduced the data field, migration, and UX gates (icon toggle, double-click reload, hidden START/pips for event tasks). **PR-B** added the parity predicates, `breakdownPomoTime`, selector branching, calendar tail texture, and the rewritten ClockNode (Apple-Fitness-style concentric rings, AM/PM toggle, solid arcs in the task tone with break overlays in the track color, scheduled-habit arcs).

**Follow-ups during review (all in #142):**
- Inline note editor on TaskNode and HabitContextMenu (replaces `window.prompt`, which throws in the Electron renderer).
- ClockNode auto-pulls every todo + every scheduled habit (manual "Link Todo" picker removed).
- `--font-sans` switched to JetBrains Mono so body text matches the chrome.
- HabitSwapModal time picker rebuilt with two `NumberStepper` widgets (HH/MM); native `<input type="time">` removed.
- HabitSwapModal corner arrow chips removed (decorative, looked like back/forward buttons).
- `removeAllLanesForHabit()` helper sweeps orphan lane nodes when a habit is deleted; HabitLaneNode also self-removes on null habit lookup.
- New `--ink-on-bright: #0a0908` token + KRNL0 contrast rule: never light text on a bright accent background. Fixed: HabitSwapModal CONFIRM / weekly badge / daily badge, App RELOAD button, calendar habit blocks (label + icon, opacity 0.7 → 0.9), TodoNode done checkbox.
- WeekView legend chip explains the two block treatments (solid = session, striped = break).

**Tests:** New: parity test, table-driven breakdown test, selector kind test, migration test, kind-toggle UX test, toggle-handoff test, ClockNode break-arc test. Pre-existing 4 ClockNode-renderer test failures (stale assertions from earlier glassy-arc design) and 5 stale "Add subtask" tests are not regressions from this PR; tracked as follow-ups.


---

## [2026-05-17] — fix(canvas): habit-lane CLI path, frame --near chain walk, cal show inclusive --to

**Type:** Bug Fix
**Branch:** `fix/canvas-layout-and-inference-scope-pt2`
**PR:** [#154](https://github.com/theMindDeveloper/KRNL0/pull/154)
**Files changed:**
- `src/renderer/store/useCliDispatch.ts` (HABIT_LANE_OFFSET_Y on the CLI dispatch path)
- `src/sys/commands/frame.ts` (collectChainTaskIds + chain-mode --near in frameAdd)
- `src/sys/commands/cal.ts` (inclusive --to bound)
- `tests/unit/sys/cal.test.ts` (flipped exclusive-to test, added same-day regression test)
- `tests/unit/sys/frame.test.ts` (new chain-walk test block)

**Summary:** Three follow-on fixes from the layout/inference PR after benchmark feedback:

1. **Habit lanes still landed at the dock band on `krnl habit pin`.** PR #154's first pass only fixed the renderer's `commandDispatch.ts` (used by the in-UI mother-habit menu). The CLI command `krnl habit pin` actually dispatches through `useCliDispatch.ts`, which still used the old inline `540` offset. Bumped that path to the same `HABIT_LANE_OFFSET_Y = 1300` and added a comment pointing back to `src/sys/layout.ts` so both renderer dispatch paths stay in sync.

2. **`frame add --near <task>` only seeded `childIds` with the single anchor task.** AI-built pipelines would create a 4-task chain and call `frame add --near <first>`, then have to manually `frame resize` + `frame fit` to actually wrap the chain. `frameAdd` now detects `--near` resolving to a `todo.task`, walks `task.next` edges in both directions to collect the connected component, and auto-sizes the frame to the bounding box plus `FRAME_PADDING`. Non-task `--near` sources (text, image, frame) keep the old single-node behaviour. Explicit `--w` / `--h` overrides still win.

3. **`krnl cal show --from X --to X` returned empty even when tasks were scheduled for that day.** The `--to` filter used `<` on the date prefix (exclusive upper bound), which silently dropped every task on `--to`'s own date. Same-day windows like "show me tomorrow's calendar" are the most common AI-assistant shape, so this was a real footgun. Switched to `<=` (inclusive).

**Why:** Benchmark run on 2026-05-17 r3 exposed all three — habit lanes overlapping the dock row, frames anchored only on the seed task, and a confusing "no scheduled tasks" output despite a fresh schedule. Each fix is small and isolated; bundling them keeps the PR-#154 churn focused.

**Tests:** sys + shared suites green (360/360 in-scope). Pre-existing renderer scenario failures (AppChrome, ClockNode, ImageNode, PomoNode, TextNode, TaskNode.new, board.decision22-migration) are unchanged.

---

## [2026-05-31] — Pomodoro live observer + decouple events

**Type:** Feature + Refactor
**PRs / Commits:** `508bdc6` (commit), [#178](https://github.com/theMindDeveloper/KRNL0/pull/178) (PR)
**Files changed:** 17 files across `src/main`, `src/renderer`, and `tests/`.
**Summary:** Pomodoro reworked as a live observer. Focus tasks (`kind: 'focus'`) no longer pre-draw scheduled blocks on Clock and Calendar, appearing only as they are tracked live in real time. Event tasks (`kind: 'event'`) are fully decoupled from the timer, hiding START/PAUSE buttons and blocking card double-clicking/loading. Event tasks and habits now render as thin hollow/outlined arcs (3 SVG paths: 1 background fill with `sw - 2` at 0.15 opacity, 2 thin outlines at `sw ± 3` with `strokeWidth = 1`). Tracked reality (Pomo work/break segments) draws as bold filled arcs/blocks. "Are you done?" prompt on pomo end supports EXTEND (continue drawing work arc), BREAK (draw break arc), or STOP. Unit/integration tests updated and typecheck passes with 0 errors.
