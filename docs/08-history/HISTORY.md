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

---

## [2026-05-31 → 2026-06-15] — #180: retire "focus" kind, tasks become events tracked live; calendar/clock catch-up

**Type:** Feature + Architecture + Bug Fix (batch catch-up entry)
**Commits:** `6a392b2` … `f67b5b5` (26 commits, PR #179 and prior unlabeled merges)
**Files changed:** Across `src/renderer/components/nodes/{CalendarNode,ClockNode,TaskNode,TodoNode}`, `src/renderer/analytics/`, `src/sys/commands/task.ts`, `.github/workflows/release.yml`.

**Summary:** This entry catches HISTORY.md up to a batch of commits that landed on `origin/main` without a history entry at merge time, discovered while reconciling local `main` (which still held `508bdc6`/#178 as its tip) with `origin/main`. Grouped by theme:

- **#180 — retire the `focus`/`event` kind split (the core change).** Decision 28's two-kind model is gone. Every task is now created as a plain event (`feat(todo): #180 slice 1` — Todo creates events only; `slice 1b` — CLI task spawns do the same). The Pomodoro timer's own start/pause controls are removed from TaskNode (`slice 2`) — Pomo no longer runs a pre-planned countdown against a task. Instead, Calendar and Clock now draw **two layers simultaneously**: the planned block (from the task's schedule) and the **live-tracked reality** (what Pomo actually observed happening), side by side (`slice 3` — dual plan-vs-reality visualization; `slice 4` — migration that converts all existing `focus` tasks to events on load). A dev panel (`f82107a`) was added to seed fake tracked-reality segments for visual testing without having to run a real Pomo session.
- **#169 — completion ledger (`c949e72`).** Deleting a task used to erase its done-work from analytics. A separate ledger now records completed segments independently of the task's lifecycle, so analytics stay correct after deletion.
- **#170 — undoable cascade delete (`6370bf7`).** Deleting a task that cascades to linked TodoItems can now be undone in one step.
- **#171 — completed vs. overrun distinction (`c3c5ec5`).** Calendar/analytics now visually distinguish a task that finished on time from one that ran over.
- **Calendar UX pass:** Notion-style grid with granularity zoom, snap band, exact-time entry, and day view (`6268c7e`); drag-resize of task blocks with live snapped preview (`ee6fe5b`); ruler zoom on the week grid (`db76cc5`); right-click layer picker for overlapping Pomo sections (`59f2d57`); live-recording label + delete-tracked-segment (`8ca3152`); jump-to-node restored as an explicit popup action (`0299471`); editing a task's time now resizes only its own block, not successors (`9407890`); parallel-task color-collision and pomo-control-clarity fixes (`eb3baf1`).
- **Clock parity (`3319123`):** now-snap behavior and right-click pomo-segment info/delete, matching Calendar's interaction model.
- **Perf (`953003f`):** Calendar/Clock render path dispatches through the store directly instead of `commandDispatch`, cutting a layer of indirection on every tick.
- **Settings (`69bdaf0`):** destructive actions — clear focus history, factory reset.
- **Input polish (`cc8ae37`, #177):** text/number fields select their pre-filled value on focus.
- **CI (`6a392b2`, #145):** release workflow now gates on a green test suite.
- **Infra:** a Windows-build/package-upgrade change (`fdf9f22`) was shipped and then reverted (`f67b5b5`) in the same window.

**Why documented retroactively:** Hard rule requires a HISTORY.md entry before any merge to `main`, but this batch reached `origin/main` without one. Local `main` had fallen 26 commits behind while a different local commit (`9ebb796`) sat on top of the old tip; completing the already-staged merge brought both histories together. This entry closes that gap so the log matches what's actually running.

**Tests:** Post-merge, full suite green — 110 test files / 1407 tests passed, 0 typecheck errors.

---

## [2026-11-01] — Logic audit fixes: persistence safety, undo, #168 chain push, CLI parity and validation

**Type:** Bug Fix (batch)
**Commits:** `04a5b72` (persistence), `0903056` (pomo spans), `9edc7dd` (CLI input + pomo/habit/marquee), `616d43c` (undo), `7fe10b3` (#168 schedule), `6c157db` (habit/analytics midnight + streaks), `f210c7e` (todo/task/ledger sync), `e93321e` (mother guards, stubs, reset script)
**Files changed:** `src/main/{boardIo.ts,persistence/board.ts,ipc/handlers.ts}`, `src/sys/{parser.ts,SysFacade.ts,commands/*}`, `src/shared/{cli/commandRegistry.ts,dispatch/task.ts}`, `src/renderer/{store/*,hooks/useLocalDay.ts,analytics/useAnalytics.ts,components/{Canvas,nodes/*,ChassisLayer/TelemetryChrome.tsx}}`, `scripts/reset-board.mjs`, `docs/03-architecture/decisions.md` (Decision 30), tests.

**Summary:** Fixes from a read-only logic audit of the whole app.
- **Persistence:** saves are atomic (temp file plus rename, with retry on Windows locks). An unreadable `board.json` is backed up as `.corrupt-<ts>` before the seed is used. CLI writes on a missing board start from the seed, not an empty board, which used to drop the mother nodes for good.
- **Undo (#170):** undoing a task delete now also restores the todo item and the Pomo state. The cascade had been changing the undo snapshot in place. CLI changes no longer wipe undo history (new `reloadBoard`).
- **#168:** chains stay sequential (Decision 30). Duration edits resize the block, loops are refused, and `task schedule --at` is validated and stored in local time.
- **Pomo:** resuming after a pause records a separate work span, so the pause gap is not drawn as work.
- **CLI:**
  - New: `pomo pause|resume|discard`, `habit undo`.
  - `habit done` no longer toggles.
  - `marquee` needs `--delete` before it deletes anything.
  - Numbers are strict (no NaN, zero or negatives), and flags may come before positional arguments.
  - Unimplemented commands report failure instead of success.
  - `pomo config` refreshes the UI.
  - `todo check` and `task toggle` keep the todo item, the task and the completion ledger (#169) in sync.
- **Habits and analytics:** habit grids and "today" counters roll over at midnight. Streaks respect the habit's schedule everywhere.
- **Guards:** mother nodes can't be captured by `frame add --near` or moved by `node set-position`. `npm run reset` targets the worktree's own board (rule 10).
- **Deliberately not changed:** Pomo→task time crediting (removed by #180), a revision check for renderer/CLI concurrent saves, and the CLI dispatch timeout.

**Tests:** 115 files / 1456 passed, 0 typecheck errors, build OK. Some full-suite runs on this Windows machine show one random 5 s render-test timeout. The same tests pass when rerun.

---

## [2026-11-01] — Plan vs reality: pomo as observer, readable Calendar/Clock, Plan-vs-actual analytics

**Type:** Feature + Bug Fix (four stacked slices on top of the logic-audit batch)
**Commits:** `fd128cd` (dev preview), `e74dc4e` (audit leftovers), `630477d` (time model, #180), `21e70f6` (calendar/clock visuals), `b016cb5` (analytics)
**Files changed:** `src/main/{ipc/handlers.ts,persistence/board.ts}`, `src/renderer/{store/{trackedTime,laneLayout,pomoReality,boardStore}.ts,analytics/{estimates.ts,charts/PlanVsActual.tsx},components/{Canvas/commandDispatch.ts,nodes/{PomoNode,TaskNode,TodoNode,CalendarNode/WeekView.tsx,ClockNode,AnalyticsNode}},dev/*,index.tsx}`, `src/sys/{parser.ts,SysFacade.ts,commands/{pomo,task,analytics}.ts}`, `src/shared/cli/commandRegistry.ts`, `vitest.config.ts`, `docs/06-requirements/{time-model,calendar-clock-visuals,analytics-plan-vs-actual}.md`, tests.

**Summary:**
- **Audit leftovers:**
  - A renderer save over a newer CLI write is refused, and the app reloads (revision guard on `board:save`).
  - `cli:dispatch` targets one window. A timeout now says the command may have run.
  - Bulk deletes share the store's coalescing undo slot.
  - `marquee` is in the help registry.
  - The test timeout is 15 s.
- **Time model (#180 follow-up, docs/06-requirements/time-model.md):**
  - The Pomodoro only observes. Tasks tag it (`activeTaskId` on the live span, `taskId` on recorded spans).
  - Tracked time per task is derived from tagged spans, and nothing is written onto tasks any more.
  - "Start pomo" no longer cancels a running session. Before this fix, event tasks silently stopped it.
  - START suggests the task planned for now.
  - New: a tag selector on the Pomo node, retagging of recorded spans, and CLI `pomo tag` / `pomo retag`.
  - Task cards show PLAN vs TRACKED with an overrun state.
  - `plannedMin` is the single estimate, and the mirrors are re-synced on load.
- **Calendar & Clock (calendar-clock-visuals.md):**
  - One shared lane packer for parallel tasks.
  - Reality gets its own rail (calendar) and ring (clock), coloured by its tag; a pause is a gap.
  - Blocks show title and real time range, with done, missed and overrun states.
  - Habits are tinted, not solid bars.
  - Reality spans that cross midnight are split.
  - A notice appears when a drop is pushed by its chain.
  - The clock's now-pointer only shows in its own 12 h half.
- **Analytics (analytics-plan-vs-actual.md):**
  - New "Plan vs actual" tab: accuracy (median tracked ÷ planned), estimate vs actual per task (deleted tasks included via the ledger), planned vs worked per day, and where the time went.
  - CLI `analytics show --view estimates`.
- **Dev:** `npx vite --config vite.preview.config.ts` serves the renderer with a fixture board (`?solo=calendar|clock|analytics`). It is DEV-only and stripped from builds.
- **Tests removed:** tests that encoded the retired planner model (per-task checkpoints, session quotas from estimates, loading a task into the pomo, the focus/event toggle) were removed and replaced by plan-vs-reality tests.

**Tests:** 120 files / 1442 passed, 0 typecheck errors, build OK. Not yet exercised in the Electron window.

---

## [2026-11-01] — Calendar/Clock follow-up: readable narrow panels, clock decision, perf + DST

**Type:** Bug Fix + UI
**Commits:** `c75e364`, `4666b11`, `c942fb0`, `362cb95`, `cd0de37` (reverted by `5a990eb`), `c972ecf`, `5a990eb`, `ff267d7`
**Summary:**
- **Calendar:**
  - Blocks show only what fits their measured size, and lanes are packed by drawn height.
  - A "+N" chip collapses lanes that don't fit; it lists the hidden tasks.
  - 56 px per hour by default, and the grid opens scrolled to now.
  - A narrow day view (< 360 px) becomes an agenda list, with a list/grid toggle.
  - Selectors are memoized on the board, so the calendar no longer re-renders on hover or pan.
- **Clock (maintainer decision after the design rounds):** stays the analog dial, with tasks as rounded arcs on lanes around it and Pomo as colour inside the face (wedges per span; breaks hatched). The "day dial" experiment was reverted. The now-pointer only shows in its own 12-hour half, and only done tasks are struck through in the list.
- **DST:** schedule end times and block heights use wall-clock arithmetic.
- **Dev:** design drafts lived in a Claude Design canvas (not part of the app).

**Tests:** 120 files / 1443 passed, 0 typecheck errors, build OK. Not yet exercised in the Electron window.

---

## [2026-11-01] — Remove startup sound; land PR #182 on main

**Type:** Chore
**PRs / Commits:** [#182](https://github.com/theMindDeveloper/KRNL0/pull/182) (pushed to `main` directly as a fast-forward, at the maintainer's request)
**Files changed:** `src/renderer/App.tsx`
**Summary:** The `krnl0startup` sound no longer plays when the app opens. The clip stays in the SFX library and still plays via `sys sfx play krnl0startup`.

---

## [2026-11-01] — Frame-style theme engine (ADR 0009)

**Type:** Feature
**PRs / Commits:** branch `TMD/krnl0-design-system-reimagined-31f897` (`6f57865` … HEAD)
**Files changed:** `src/renderer/themes/*` (new: manifests, applyFrameTheme, useFrameTheme, transition), `src/shared/frameStyles.ts`, `src/renderer/components/ChassisLayer/*`, `src/renderer/components/{TopBar,StatusBar,Station}/*`, Clock/Pomo/Terminal/Calendar/Analytics/MotherFrame nodes, `src/renderer/styles/{tokens,chassis,reactflow-theme}.css`, `src/sys/{parser,SysFacade,commands/theme}.ts`, `docs/03-adr/0009-frame-style-theme-engine.md`, `docs/06-requirements/theme-engine.md`, tests
**Summary:**
- **Theme engine:** each frame style carries a typed `ThemeManifest` (tokens per mode, fonts, component skins, slots). Tokens are applied to `<html>`; components read `var(--k-*, <classic literal>)`, so Classic stays pixel-identical.
- **New "Pro" style:** matte graphite, Logic-Pro-inspired, dark only.
- **Every style skins the components:** clock bezels and hands (same features everywhere: task arcs, pomo, numerals, readout), Pomo default faces plus the new `vu` and `outline` faces and an `auto` face, xterm colours, Analytics palette, mother-frame decoration (Mac title bars, Submarine rivets, Telemetry brackets…). Fonts bundled locally via Fontsource.
- **Panel toggles** moved from the Station row into the top bar for every style.
- **CLI:** `sys theme frames`, `sys theme frame <id>`, `sys theme show` reports the frame.
- **Readability pass:** live WCAG audit across all 13 style/mode pairs; darker secondary inks, `--acid-ink`, tokenised status bar, fixed same-colour pills and buttons. Failures went from 40–170 per pair to a handful of near-misses and disabled controls.
- **Look switching:** light/dark and style changes reveal as a circle from the pointer (View Transition, reduced-motion fallback); dark-only styles no longer overwrite the saved light preference.

- **Follow-up round:**
  - **Pro is the default frame style.**
  - **Root fix for black-on-black:** a new `--accent-on-dark` token covers anything drawn on fixed dark surfaces, and `themeContrast.test.ts` enforces WCAG pairs for every style and mode.
  - **Panel toggles:** one minimal treatment for every style.
  - **Station panels:** 6px gap, no divider line.
  - **Calm canvases:** Mac and Submarine canvases are flat.
  - **Macintosh rebuilt:** chromeless retro-Mac windows on the app's own top bar and status bar, plus a new `mac` Pomo face.
- **Drag to Calendar:** canvas Task nodes get a drag grip, and Todo rows with no task node yet are promoted to a linked task when dropped on the Calendar (`calendar.schedule {itemId}`).

**Tests:** 0 typecheck errors; 125 files / 1495 tests green.

---

## [2026-11-02] — Analytics window, readable calendar, pomo highlights, no-scroll windows

**Type:** Feature
**PRs / Commits:** branch `TMD/hopeful-moore-10c910`
**Files changed:** `src/main/persistence/board.ts`, `src/shared/types/board.ts`, `src/renderer/components/Station/*`, `src/renderer/components/nodes/AnalyticsNode/{AnalyticsMother,SummaryHero,index}.tsx`, `src/renderer/components/nodes/CalendarNode/{WeekView,dayBlockLayout,hourWindow}.ts(x)`, `src/renderer/components/nodes/{ClockNode,TodoNode}/index.tsx`, `src/renderer/components/ContextMenu/{index,scheduleMenus}.ts(x)`, `src/renderer/components/ui/PagedView.tsx`, `src/renderer/store/{analyticsMother,scheduleActions}.ts`, `src/renderer/analytics/summary.ts`, `src/sys/{parser,SysFacade}.ts`, `src/sys/commands/{analytics,pomo}.ts`, `src/shared/cli/commandRegistry.ts`, docs (Decision 32, `analytics-window.md`, `calendar-clock-visuals.md` F15–F19), tests
**Summary:**
- **Analytics is the seventh fixed mother** (Decision 32, slot `bottom-right-pre`). Station mode: its own panel in the bottom row beside the terminal (Canvas | Term | Analytics | Clock), shown by default, with its own panel toggle. Canvas mode: a fixed window in the mother row. Migration adopts any free-floating analytics node. CLI: `analytics open | close | toggle`.
- **Readable parallel tasks:** a day column caps lanes at 64 px; extra tasks collapse into a "+N" chip (a compact corner chip on single-lane week columns). Hidden tasks can be dragged out of the chip's list.
- **Pomo spans are background highlights** behind tasks (focus = tinted wash, break = hatch), with no pointer events so drops still land.
- **Right-click menus** shared by Calendar and Clock (task arcs, task rows, pomo wedges): Tag → task, Untag, Details…, Delete segment; Start focus, Mark done, Show on canvas, Unschedule. CLI twins plus new `pomo segments` and `pomo delete-segment`.
- **Analytics overview:** a plain-language summary on top (headline, four figures with change vs the previous period, focus sparkline, sentences). CLI: `analytics summary`.
- **No scrolling:** a shared `PagedView` splits content into pages of whole items, flipped with the wheel or ‹ ● ›. Used by Analytics (cards, settings, tables), Todo, the Clock task list, the Calendar agenda and the Ambient Radio lists. The Calendar hour grid shows windows of whole hours (wheel, pager, or drag to an edge), and the Clock dial flexes to the free space.

**Tests:** 0 typecheck errors; 131 files green.

---

## [2026-11-02] — New "Lit Core" logo and app icons

**Type:** Feature (branding)
**PRs / Commits:** branch `TMD/krnl-logo-design-c607a2`
**Files changed:** `build/icon.svg` (new master), `build/icon.png`, `build/icon.ico`, `build/icon.icns` (new), `scripts/generate-icons.mjs` (new), `package.json` (`npm run icons`), `electron-builder.json` (`mac.icon`), `src/renderer/components/TopBar/{index,BrandMark}.tsx`, `tests/unit/renderer/AppChrome.scenarios.test.ts`, `README.md`, `docs/assets/krnl0-logo.png`, `docs/assets/krnl0-social-preview.png`
**Summary:**
- **New mark:** a dark 3×3 voxel cube on a near-black tile, with the centre voxel lit acid on each face (the kernel at the core). `build/icon.svg` is the single source.
- **App icons:** `npm run icons` renders the SVG under Electron and writes the macOS `.icns` (Apple 824/1024 grid with shadow), the Windows `.ico` (BMP entries ≤128px, PNG at 256px so Explorer and the taskbar decode every size) and the 1024px PNG used on Linux and as the window icon.
- **In-app logo:** the top-bar brand mark is now the same cube (`BrandMark`), identical in every theme.
- **GitHub:** README shows the logo; `docs/assets/krnl0-social-preview.png` (1280×640) is ready to upload as the repo's social preview.

**Tests:** 0 typecheck errors; 125 files / 1495 tests green.

---

## [2026-11-02] — Pen tool, year view, big clock, optional task time

**Type:** Feature
**PRs / Commits:** branch `TMD/hopeful-moore-10c910` (PR #188)
**Summary:**
- **Analytics:** one card per page, sized to the whole page (`PagedView fillItems`): a page never shows part of another card.
- **Clock:** bigger dial, a **Big Clock** dial-only toggle (`clock dial [on|off]`), and wide invisible hit areas so task arcs are easy to right-click.
- **Pen tool** (dock Pen / `P`): pen, marker, highlighter and stroke eraser, 8 colours and 3 sizes, built on `perfect-freehand`. Right-click opens a radial tool wheel; Esc exits. Strokes live on `board.drawings` (undoable). CLI: `draw list | delete | clear`.
- **Panel toggles in canvas mode:** a hidden mother disappears and the others slide into its slot. Analytics has no dock button any more (it's a mother).
- **Optional task time:** Enter skips the duration in the Todo add row. The task is open-ended (`timeOpen`) and fades out on the Calendar and Clock until a time is set.
- **Calendar year view:** 12 mini-months with focus heat and planned-task dots that always fit; click a day to open it. CLI: `cal view <day|week|month|year>`.
- **Month view fix:** cells show only whole chips plus "+N"; today is a soft tint with an acid day pill, so text stays readable.

**Tests:** 0 typecheck errors; 132 files green.
- **Follow-up:** Analytics drops the six tabs for an 8-page guide (Summary, Activity, Year, When you work, Plan vs actual, Per task, Where time went, Habit streaks), with an icon-tile index and the other charts behind "More charts". The year heatmap always shows 365 days and fills its card. Per-task bars grow to fill their card. The Calendar task popup is redesigned (header with colour and span, start/length editor with quick lengths, one action row). Clock open-ended arcs use a smooth gradient fade.
- **Follow-up 2:** the All-charts popover, icons and extra charts are gone. Analytics shows a plain text page list beside the chart (Summary · Activity · Year · Hours · Estimates · Per task · Time split · Streaks), or a wrapping row on narrow panels, with no dot pager. The Estimates figures are an even 2×2 grid.
- **Follow-up 3:** no side rail. Pages are switched with a row of SVG icon buttons in the toolbar; the active one is filled, with the page name beside the icons. 7 pages each fill the window with a 6×2 grid of related charts: Summary · Activity · Year · Hours · Plan vs actual · Insights · Habits. This brings back most charts without scrolling. The year heatmap stacks into 1–4 bands to fill tall cards.
- **Follow-up 4:**
  - **Analytics:** pages align in canvas mode (pager divides out the canvas zoom). Settings opens as a full-window view with a card per page, a switch per chart and the history wipe in the footer.
  - **Calendar:** events have no left gutter or left accent strip; they use a soft outline in the task colour.
  - **Mother badge:** the badge hides while it sits over the dock.
  - **Pen:** redesigned as an SVG pie menu (tools, sizes, colours, clear; every slice is a big target), with a pen-tip cursor, an arrow tool and middle-drag pan. The dock stays usable while drawing, and Select leaves the pen.
  - **Dock:** draggable by its grip. It snaps to top, middle or bottom of the left edge, or bottom centre (horizontal), glides into place, and remembers the spot.
  - **Brainstorming:** sticky notes (S) and shapes (R: rectangle, ellipse, diamond) with a style bar for shape and colour. CLI: `text add --sticky | --shape`.
  - **Drop anything:** video, audio and PDF files, and YouTube, Vimeo or SoundCloud links, become media nodes (react-player, pdf.js); other links become link cards. The asset store accepts media up to 500 MB. CLI: `media add <url> | list`.
- **Follow-up 5:**
  - **Analytics blur:** text stays sharp in the zoomed canvas (pager shifts with margin, not transform).
  - **Canvas right-click wheel** (shared `ui/PieMenu`, nested panels): Task · Habit · Note · Sticky (colours) · Shapes (rect/ellipse/diamond) · Media (image, any file) · Frame · Pen (tools, colours).
  - **Dock:** the Shape button opens a shape picker. Faint shortcut letters sit on dock buttons and wheel slices. The dock draws over the SPINE badge (badge portals into the canvas root) instead of hiding it.
  - **Shapes:** text stays inside the shape's inscribed box, with a stronger fill.
  - **Ctrl+V:** files become image/media nodes; a link becomes a player or website preview (the "Aa" switch turns it into text); other text becomes a note.
  - **Any file drops:** .mov and .wav are detected by extension; unknown types become a download card. Media cards are rebuilt: custom audio player, video with a codec fallback, website preview, PDF pages, file card.
- **Follow-up 6:** the right-click wheel works again. The dock's full-canvas container was an RF `<Panel>`, which forces `pointer-events: all` and swallowed every canvas click; it is now a plain click-through layer. Media cards take their content's shape (video frame size, 16:9 embeds, PDF page) and keep it while resizing.
- **Follow-up 7:** the right-click wheel opens reliably. With right-drag panning, React Flow only fired `onPaneContextMenu` when the mouse moved 0 px between press and release, so any jitter dropped it. The canvas now handles `contextmenu` itself: up to 6 px of movement still counts as a click, real right-drag pans are ignored, and nodes and edges keep their own menus.
- **Follow-up 8:** there is now one wheel design. The pen wheel (right-click while drawing) uses the same nested `PieMenu` as the canvas wheel, from one shared list: Pen · Marker · Highlight · Arrow · Eraser · Colour ▸ · Size ▸ · Clear, with Done in the centre. The canvas wheel's Pen panel shows the same items.
- **Follow-up 9:** time is optional in every task prompt: the canvas right-click Task prompt and the task card's next / parallel / subtask input (Enter skips; the task is open-ended). Mother windows are no longer canvas-selectable, so clicking a control inside one (e.g. Habit's Week/Month/Year) no longer flashes a selection ring.
- **Follow-up 10:** easier wiring. Handles snap from 48 px away, and dropping a connection anywhere on a node's body connects to that node, keeping the direction of the handle the drag started from.
- **Follow-up 11:** layer order is frames < images/media < everything else < notes (text, stickies, shapes); selected nodes still lift. Sticky notes look like paper: ruled lines, a red margin, fine grain and a lifted shadow; text sits on the lines.
- **Follow-up 12:**
  - **Faster media:** dropped files are imported by path (main copies the file; no bytes over IPC). `krnl-asset://` streams with HTTP Range support, so video and audio start at once and can seek. `.mov` is served as `video/mp4`, so H.264 movs play.
  - **Sticky notes:** the paper colour could vanish on re-render (shorthand/longhand background mix), leaving lines on black; fixed with a single `background`. Stickies now use handwritten Caveat (Fontsource), softer ruled lines, a red margin and a folded corner.
- **Follow-up 13:**
  - **Sticky notes:** the "cursed" (black) note is fixed. The paper-grain SVG's filter reference was double-encoded (`%2523n`), so the SVG painted a solid black square over the note.
  - **Light / dark:** always available. The top-bar toggle shows for every style (choosing Light on a dark-only style switches to Classic), and Settings has an Appearance section above Factory reset. Before, the dark-only default hid the toggle, so the ⚙ in its place, which opens the reset, looked like the theme button.
  - **Pen wheel:** the older two-ring design is back as the only pen wheel; the canvas wheel's Pen item opens it.
- **Follow-up 14:** no more blur. Website and YouTube cards render at their on-screen size and undo the canvas zoom, so they stay sharp at any zoom. The node hover ring is gone: its fade put each card on its own GPU layer, which the zoom then stretched, so to-do cards blurred under the cursor.
- **Follow-up 15:** nodes keep one position in both modes and never sit behind a mother window. In Canvas mode the mother row lifts itself above the topmost node (render-only, `motherRow.ts`; the canvas chrome follows it). The camera stays centred on the same spot when the canvas area changes size (Station ↔ Canvas, window resize), so a node made in one mode isn't far off in the other. Drawings render above every node, mothers included.
- **Follow-up 16:** mother windows take clicks again (React Flow turned off mouse input on nodes that are neither selectable nor draggable). Drags end when released over a YouTube / website card. Drawings are canvas nodes: click or box-select, drag, Delete. Redesigned calendar task popup and habit cadence dialog (shared `RepeatEditor`: every day, weekdays or picked days, time, length); the Habit window's add row has an optional Repeat. Task right-click has "Show on calendar" (opens the week, pulses the block; the camera stays put in Station mode). YouTube Mix links (`list=RD…`) play (the playlist part is dropped). The highlighted habit cell's ring is no longer covered by the next cell. The embed counter-scale was reverted (it changed page layout with zoom).
- **Follow-up 17:** the Habit window is "Habits & Routines": the add row reads "+ add habit or recurring event", and scheduled habits show a ↻ repeat mark on the calendar.
- **Follow-up 18:** Pomo controls are icons: Stop, Break, and Pause / Resume / End break as the main button (ending a break records it). Reset is gone: Pomo settings has "Count stopped sessions" (on = Stop records the work so far, off = Stop discards), with a CLI twin `pomo config --count-stopped on|off`. Native dropdown lists are readable in dark themes. Dropping a task anywhere on another task's calendar block runs it in parallel (same start).
## [2026-11-02] — Todo Done/Archive, smart task tags, time by tag (ADR 0016)

**Type:** Feature
**PRs / Commits:** branch `TMD/task-completion-tagging-c87ea6`
**Files changed:**
- **New:** `src/shared/tags/{taxonomy,classify}.ts`, `src/renderer/components/nodes/TodoNode/TagPicker.tsx`, `src/renderer/analytics/{tags.ts,charts/TagCharts.tsx}`
- **Todo node:** `TodoNode/{types,commands,index}.tsx`
- **Wiring:** `Canvas/commandDispatch.ts`, `shared/dispatch/task.ts`, `shared/types/board.ts`, `analytics/{types,sources/taskSource}.ts`, `AnalyticsNode/{types,index}.tsx`, `analytics/charts/{common,DonutChart}.ts(x)`
- **CLI:** `sys/{parser,SysFacade,commands/todo,commands/analytics}.ts`, `shared/cli/commandRegistry.ts`
- **Docs:** `claude/CLAUDE.md`, ADR 0016, `docs/06-requirements/todo-node.md` (F16–F25), `docs/04-visual-system/design-tokens.md`
- **Tests:** 6 new files

**Summary:**
- **Done → Archive:**
  - A ticked task now leaves the open list and waits in a collapsed **Done (N)** dropdown.
  - After its completion day it shows under **Archive (N)**, grouped by day. The buckets are derived from the clock, so no midnight job is needed.
  - "ARCHIVE DONE" replaces "CLEAR DONE" and archives early. Nothing is deleted.
  - Ticking an archived row restores it. The Archive's CLEAR deletes rows and task nodes but keeps the analytics ledger.
- **Smart tags:**
  - An offline, deterministic classifier sorts every task into 11 built-in categories, or leaves it as "Other" rather than guessing.
  - Click a tag to open a picker with best guesses first; you can create custom tags there.
  - Hand tags teach the classifier and re-file similar open tasks at once.
  - Auto tags are dashed and hand tags are solid. Existing items are backfilled on first load.
- **Time by tag:**
  - Completions record their tag on the ledger, and re-tagging a done task updates it.
  - The new Analytics **Time** view shows a donut, a ranked list and daily stacked bars, built on pomo-tracked minutes, else planned minutes.
- **CLI:** `todo list --done|--archived|--all`, `todo tag`, `todo tags list|add|remove`, `todo archive`, `todo clear-archive`, `analytics show --view tags`.
- **Text containment rule:**
  - Donut % labels used to sit on the ring and cross slice edges. Chart labels are now fitted with `fitArcLabel` / `fitCircleLabel`: shrink to 8 px, else hide, always 3 px clear of every edge.
  - The rule is in the visual-system docs and enforced by a randomized geometry test.

**Tests:** 131 files / 1589 passed, 0 typecheck errors. Exercised in the browser preview (`vite.preview.config.ts`), not yet in the Electron window. One unrelated Station test timed out once under full-suite load and passes on its own.

- **Follow-up 19:** merged `TMD/task-completion-tagging-c87ea6` (ADR 0016: Todo Done/Archive, smart task tags with picker and custom tags, time by tag). Its Analytics **Time** view is a new **Time by tag** page in the paged Analytics (donut, ranked list, daily bars), with a tag icon in the page nav. Conflicts in `sys/parser.ts`, `sys/commands/analytics.ts` and this file were resolved by keeping both sides. Tests: 141 files / 1657 green.
- **Follow-up 20:** README showcase further down uses the v0.10 screenshots (the 0.8 and old Station images are gone).
- **Follow-up 21 (Bug Fix):** dropping a calendar task onto another task now really runs them in parallel. Before, a task chained after the target was pushed back behind it by the #168 chain rule ("placed at 21:45 — after the task before it in its chain"). `calendar.schedule` takes `parallelWith`, and `parallelizeChainEdges` (chainWalker) splices the moved task out of its chain and forks it alongside the target (same todo only). CLI twin: `task parallel <ref> --with <ref2>`. Test: `calendar.parallelDrop.test.ts`.
- **Follow-up 22 (Bug Fix):** parallel tasks in a narrow week column no longer fold into a "+1" badge. Up to 4 parallel tasks always get their own lane, so each shows its start, end and colour and can be clicked. A lane too narrow for horizontal text shows the title vertically. Only a 5th+ parallel task collapses into the "+N" chip. Files: `CalendarNode/dayBlockLayout.ts`, `WeekView.tsx`, F15 in `calendar-clock-visuals.md`.
- **Follow-up 23 (Bug Fix):** the calendar snap band ("20:30") no longer stays on screen after a drop onto another task or a cancelled drag; it clears on every window `drop`/`dragend`. Over a task block it shows where the drop will land (the block start for another task, the slot under the cursor for the block itself).
- **Follow-up 24 (Bug Fix / UI):**
  - Dropping a task onto another task lands on the slot under the cursor, so it can overlap at any start. It still leaves the chain that would push it back.
  - Native pickers are replaced by app-styled ones:
    - New `ui/Popover.tsx`, `ui/AppSelect.tsx` and `ui/TimeField.tsx` (type a time, or pick from hour/minute columns).
    - Used in the calendar task popup (start time), the calendar and clock "Counts toward" retag, and the Pomo task tag.
- **Follow-up 25 (UI):** habit icons are app SVGs (`HabitNode/HabitIcon.tsx`, 24 line icons in currentColor) instead of emoji, so they follow light and dark themes. Old glyph/emoji icons map to the matching SVG. Used in the Habit window, context menu, lanes, calendar blocks and the repeat dialog.
- **Follow-up 26 (Bug Fix):** hand-tagging "task 1" as Meetings no longer re-tags "task 2"…"task 5".
  - Cause: the classifier dropped numbers, so "task N" all became the token "task", a 100% near-duplicate of the example.
  - Placeholder words (task, todo, item…) are now stopwords.
  - Near-duplicate checks count numbers.
  - A word seen in only one example votes below the tagging threshold on its own.
  - Wrong auto tags already on a board re-classify on load.
- **Follow-up 27 (Bug Fix):** choosing Light with the dark-only Pro frame still switches to Classic, but going back to Dark now restores Pro (remembered in `krnl0-dock-style-before-light`, unless another frame was picked meanwhile).
- **Follow-up 28 (UI):** hovering a task arc on the clock, its list row, or a pomo wedge brightens it, so you see what a click acts on. Arc and row highlight together.

---

## [2026-11-02] — Pomo Observe mode

**Type:** Feature  
**Branch:** `TMD/pomodoro-observer-mode-f9cfd3`  
**Files changed:** `PomoNode/{types,commands,index}.tsx?`, `store/pomoReality.ts`, `store/spanTags.ts` (new), `analytics/tags.ts`, `ClockNode/index.tsx`, `CalendarNode/WeekView.tsx`, `Canvas/commandDispatch.ts`, `sys/{parser,SysFacade,commands/pomo}.ts`, `tests/unit/sys/pomo.observe.test.ts`, `docs/06-requirements/pomo-node.md`  
**Summary:** A POMO/OBSERVE toggle sits in the Pomo header. Observe mode shows a plain count-up and has Start → Break ⇄ Back to work → Stop, so work and breaks are both recorded. Spans under 10 s are dropped as misclicks. When a work span ends, a "Log this span" panel asks for a name and a category (with icons, guessed from the name, "+ new" adds one), or a task to link. A ☰ span log lists each day's spans with delete. Named spans are coloured by category on the Clock and Calendar and counted in Time-by-tag. Analytics fix: Focus now counts all tracked work, not only full 25-minute pomodoros, and breaks are totalled. The timer faces scale to the session length instead of a fixed 25. The dev seed panel is gone; a dev-only "+30 min demo span" lives in the log. A named span carries over: after Back to work, or after Stop via **Continue**, new spans keep the name and category, so you are only asked again after **New** or after clearing the "doing" chip. CLI: `pomo config --mode`, `pomo retag <seg> --text … --tag …`, `pomo resume` ends a break (F19–F22).

---

## [2026-11-02] — Multiple canvases (Decision 33)

**Type:** Feature
**PRs / Commits:** `4750ff1`, merged together with Pomo Observe mode
**Files changed:**
- **New:** `src/shared/canvas.ts`, `src/sys/commands/canvas.ts`, `src/renderer/components/TopBar/CanvasSwitcher.tsx`, `docs/06-requirements/canvases.md`, `tests/unit/canvases.test.ts`
- **Model / migration:** `shared/types/{board,node}.ts`, `shared/schemas/board.schema.ts`, `main/persistence/board.ts` (`migrateCanvases`, seed gets `canvas-main`)
- **Store / render:** `store/boardStore.ts`, `Canvas/CanvasFlow.tsx`, `Canvas/DrawLayer.tsx`, `TopBar/index.tsx`
- **CLI:** `sys/{parser,SysFacade}.ts`, `sys/commands/draw.ts`, `shared/cli/commandRegistry.ts`
- **Docs:** ADR Decision 33

**Summary:**
- Several canvases for free content: images, drawings, text, media, frames, and the edges between them. Mothers, tasks and habit lanes are shared, so analytics, the completion ledger and pomo history stay the same on every canvas.
- Top-bar canvas switcher with list, add, inline rename, and delete with confirm. CLI: `canvas list|add|switch|rename|delete`.
- Old boards migrate onto a "Main" canvas. Deleting a canvas removes only its free nodes, its strokes and the edges touching them.

---

## [2026-11-02] — Easy / Advanced mode

**Type:** Feature  
**Branch:** `TMD/pomodoro-observer-mode-f9cfd3`  
**Files changed:** `store/uiMode.ts` (new), board type/schema/seed, `TopBar` settings, Pomo/Clock/Calendar/Todo/Analytics gates, `scheduleMenus`, `TaskInfoPopup`, `CanvasFlow`, `sys` (`settings mode`), `tests/unit/easyMode.test.ts`, `docs/06-requirements/easy-mode.md`  
**Summary:** A global Easy / Advanced switch in Settings. Easy hides the links between features and keeps the data identical: the Pomo is a stopwatch with breaks that never asks or names anything, recorded time is one colour, there are no tags or Focus buttons, and Analytics drops the plan-vs-actual and time-by-tag pages. Plan and reality are compared by time on the Clock and Calendar. New boards start in Easy and existing boards stay Advanced. CLI: `krnl settings mode [easy|advanced]`. Also fixed: Start no longer re-suggests a planned task over a continued name.

---

## [2026-11-03] — Autonomous bug-fix and polish pass (batch 1)

**Type:** Bug Fix
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `ec341e5` … `4f9439b`
**Files changed:** `main/{persistence/board,boardIo,index,ipc/handlers,rpc/server}.ts`, `renderer/App.tsx`, `store/{boardStore,useCliDispatch,scheduleActions,eventLog/boardSaveLogging}.ts`, `Canvas/{CanvasFlow,commandDispatch,dropImage,dropMedia}.ts*`, `PomoNode/commands.ts`, `shared/{dispatch/task,ymd}.ts`, `sys/commands/{clock,cal,pomo,habit}.ts`, Calendar / Clock / Analytics / TerminalNode / TextNode / TopBar / ui components, theme colour fixes, 12 test files
**Summary:**
- **Data safety:** a locked or unreadable `board.json` no longer comes back as the seed (which the next save or CLI command wrote over the real board). Reads retry, then the app shows a "board not loaded — Try again" screen. Failed writes are reported, temp files are unique per writer, and one app instance runs per data folder.
- **Persistence:** content saves keep the current camera position; swapped mother windows keep their order after a reload; the RPC server ignores non-request JSON instead of crashing main.
- **Pomo:** the gear's Session length applies on the next START. Ticking a task done (card, Todo row or popup) or deleting it mid-session records the real span instead of the session length (an Observe span was booked as 24 h), and writes nothing onto the task (time-model F2).
- **CLI:** `krnl undo/redo` persist; `node move` takes short refs and refuses mothers; `term setTitle/setFontSize/clear` work (the dispatch switch matched a kind no node has); impossible dates are rejected and `clock show` survives a bad stored day; `pomo start` during a break says to resume; `pomo config` never saves 0 minutes.
- **Calendar / Clock / Analytics:** drop, resize and right-click land on the right time at any canvas zoom; Unschedule and Show on calendar work for chain successors ("Unschedule chain"); Enter/Esc work in the task popup's time field; the Clock shows a task's real times and respects Easy mode in its menu; analytics ranges roll over at midnight.
- **Canvas / UI:** text-note Escape restores the pre-edit text after autosave; refused image drops say why; double-click renames a canvas; light-theme contrast fixes (primary buttons, Orb/Commander, analytics tiles, danger red, pomo toggle) and no left-edge accent bars in the radio.

**Tests:** see the batch report; new tests in `tests/unit/{main,sys,renderer}` and `tests/integration`.

---

## [2026-11-03] — Autonomous bug-fix pass (batch 2)

**Type:** Bug Fix
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `753b7dc` … `84e1184`
**Files changed:** `shared/boardMerge.ts` (new), `main/ipc/handlers.ts`, `shared/dispatch/task.ts`, `Canvas/commandDispatch.ts`, `PomoNode/index.tsx`, `TodoNode/commands.ts`, `HabitLaneNode/index.tsx`, `store/useCliDispatch.ts`, `sys/{parser,SysFacade}.ts`, `sys/commands/{task,pomo,info,theme}.ts`, tests
**Summary:**
- **Edits survive a CLI write (Decision 34):** a renderer save that arrives after the CLI / AI terminal changed `board.json` is three-way merged instead of being refused and thrown away on reload. The merge recurses into node state (Todo rows, pomo spans, habits by id); when both sides changed the very same value the file wins and the user's version stays one undo step away.
- **One name everywhere:** renaming a Todo row renames its task card, calendar block, pomo label and ledger entry, and the other way round (`renameTask`, shared with `krnl task edit`).
- **Easy mode:** START never links a span to a task left over from Advanced, and the header doesn't show one. Observe / Easy no longer shows a gear that opened an empty panel.
- **Terminal:** a page reload, renderer crash or closed window kills that page's shells instead of leaking one per reload.
- **CLI parity:** `task subtask` creates and links its Todo row; `task subtask` / `task addNext` without a duration are open-ended like the canvas; `krnl cal --from …`, `clock --json` etc. run the default subcommand; `theme show`, `info` and `settings show` report the window's real light/dark theme.
- **Todo:** open items are never hidden by the 50-row cap. **Habit lane:** rolls over at midnight.

---

## [2026-11-03] — Autonomous pass (batch 3): away guard, CLI parity, shared UI, day attribution

**Type:** Bug Fix / Feature / Refactor
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `d36e647` … `7685b2d`
**Files changed:** `shared/boardMerge.ts`, `PomoNode/{useAwayGap.ts (new),commands.ts,index.tsx}`, `HabitLaneNode/index.tsx`, `sys/{parser,SysFacade}.ts`, `sys/commands/{pomo,task}.ts`, `main/rpc/server.ts`, `store/useCliDispatch.ts`, `ui/{Switch,CloseButton}.tsx (new)`, `ui/TaskInfoPopup.tsx`, `analytics/{dateRange,engine,summary,sources/pomoSource}.ts`, `CalendarNode/YearView.tsx`, `ClockNode/index.tsx`, `docs/03-architecture/decisions.md` (Decision 34), `docs/06-requirements/pomo-node.md` (F23), tests
**Summary:**
- **Merge safety:** the stale-save merge recurses into node state (Todo rows, pomo spans, habits by id), so a UI tick and a `krnl task add` both survive; a true same-value conflict keeps the file's value (Decision 34).
- **Pomo away guard (F23):** time the window didn't see (sleep, app closed) is offered as "AWAY 18:02–09:14 — count that time?" with COUNT IT / STOP AT 18:02 instead of being booked as work. CLI: `pomo stop --at HH:MM`.
- **CLI parity:** `task unschedule` on a chain successor clears the anchor; `task toggle` / `todo check` stop the pomo on that task; exit code 2 reaches the shell; `marquee --delete` deletes every non-mother node in the rect as documented; a value-less flag no longer swallows the next flag.
- **Habit lane:** can't tick an unscheduled day.
- **Shared UI:** `ui/Switch` (Pomo, Analytics settings) and `ui/CloseButton` (Settings, Orb, Commander, task popup, habit swap); the task info popup closes on Esc and scrolls when tall.
- **Day attribution:** spans over midnight count their minutes on each day in Overview, heatmap, Year view and "today so far", as the week view always did; "active days" uses one rule. The Clock stays on the hour marks on DST days.

---

## [2026-11-03] — Autonomous pass (batch 4): theme accents, CLI refs, docs

**Type:** Bug Fix / Docs
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `15afd11` … `d721973`
**Files changed:** `ui/PieMenu.tsx`, `Canvas/PenWheel.tsx`, `CalendarNode/{NowLine,WeekView}.tsx`, `analytics/sources/habitSource.ts`, `shared/dispatch/resolveRef.ts`, `sys/commands/{node,edge,task,text,image,pomo,draw,cal}.ts`, `docs/04-visual-system/design-tokens.md`, tests
**Summary:**
- **Theme accents:** the pie menu and pen wheel use `--accent-on-dark` instead of a fixed lime, so Blueprint, Submarine and Macintosh show their own accent.
- **Calendar:** the day view's now dot sits in the day's column.
- **Analytics:** archiving a habit keeps its past check-ins in the totals.
- **CLI refs:** listings print the shortest unique prefix (8+) so every printed id can be typed back; ambiguous task refs list their matches; `text` / `image` commands accept prefixes; resize rejects non-positive sizes; segment and stroke refs need 4+ characters; `cal show` rejects unpadded/impossible dates; `pomo segments` uses the real local day end on DST days.
- **Docs:** the visual-system colour table is regenerated from `tokens.css` and documents the accent pairs, the shared `ui/` components and the no-left-edge-bar rule.
- **Follow-ups to batches 2–3:** split midnight spans are timestamped inside their own day (hour / weekday charts), and the stale-save merge merges arrays of plain values (habit logs, keywords) as sets, so concurrent ticks from the UI and the CLI both survive.

---

## [2026-11-03] — Autonomous pass (batch 5): audit fixes, CLI parity, layering

**Type:** Bug Fix / Feature / Refactor
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `2168dc3` … `941470b`
**Files changed:** `main/persistence/board.ts` (`migrateBoard`), `main/ipc/handlers.ts`, `main/boardIo.ts`, `main/rpc/server.ts`, `shared/boardMerge.ts`, `PomoNode/useAwayGap.ts`, `analytics/{dateRange,sources/pomoSource}.ts`, `sys/{parser,SysFacade}.ts`, `sys/commands/{frame,pomo,info}.ts`, `shared/cli/commandRegistry.ts`, `store/useCliDispatch.ts`, `AmbientRadio/{index.tsx,radioControl.ts (new)}`, `ui/layers.ts` (new) + 17 overlay components, `docs/04-visual-system/design-tokens.md`, `docs/06-requirements/ai-full-visibility-cli.md`, tests
**Summary:**
- **Stale-save merge (second pass):** board.json comes back from the loader migrated (defaults added, keys reordered) while the renderer's copies don't; the merge read that reshaping as an edit by the file, so a node created and then deleted could come back after any CLI write. All three boards now go through the same `migrateBoard` first. A user's reorder of a list survives a CLI addition; lists with repeated values are no longer merged as sets.
- **Pomo away prompt:** a prompt about a span the CLI ended (break / extend) is dropped instead of being applied to the next span. `pomo stop --at` refuses a time before the span started and a paused / idle pomo instead of recording 0 minutes or echoing a time it ignored.
- **Analytics:** a span ending exactly at midnight stays on the day before (hour chart and session date included); proportional day splits round the running total, so no day gets negative minutes.
- **CLI:** `frame add` without `--at` lands in the middle of the visible canvas, not at its top-left corner. New `settings layout [station|canvas]` and `radio list|status|play|remove|stop|volume` (hard rule 8).
- **Layering:** one named stacking scale (`ui/layers.ts`) replaces the scattered z-index numbers; dropdowns and pickers now sit above full-window modals by rule, not by DOM order.

---

## [2026-11-03] — Autonomous pass (batch 6): UX audit fixes, keyboard, undo notice

**Type:** Bug Fix / Feature / Refactor
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `2980b6f` … `ecc5007`
**Files changed:** `TodoNode`, `FrameNode`, `HabitNode/{index,HabitContextMenu}.tsx`, `TextNode`, `ImageNode`, `Assistant/{Commander.tsx,types.ts,flows/sessionFromCommander.ts}`, `Orb/{index.tsx,freshBoard.ts}`, `Dock`, `TopBar` (Settings), `Canvas/CanvasFlow.tsx`, `ui/{LayoutModeToggle,HabitSwapModal,UndoNoticeBar}.tsx`, `store/undoNotice.ts`, `utils/keyboardTargets.ts`, `shared/scheduleAt.ts` (new, shared with `sys task schedule`), node helper modules (`PomoNode/display.ts`, `ClockNode/wallHours.ts`, `CalendarNode/{screenScale,yearActivity}.ts`, `TaskNode/format.ts`), `docs/06-requirements/todo-node.md` (F10 retired), tests
**Summary:**
- **Escape cancels:** in the Todo text and minutes edits, the frame label and the habit rename, Escape used to unmount the field and its blur saved what was typed anyway. The Todo minutes field rejects "2.5" instead of reading 2, and an invalid value no longer leaves a red field stuck open.
- **Commander:** the start time and the 5-task limit are checked before launch (`HH:MM` means today); the "Session locked in" line needs this session's head task to have its time, not any task on the board.
- **Keyboard:** Dock single-key shortcuts, canvas Delete and undo stand down while typing or behind a modal (Settings, Commander, habit swap); Space push-to-talk leaves focused buttons and radios alone; Settings closes on Escape; Delete removes selected free nodes (not only drawings); notes are reachable with Tab and open with Enter / F2.
- **Undo notice:** one-click deletes (Todo ✕ and menu, Archive CLEAR, habit delete, canvas Delete and menu) show "Deleted … · UNDO" for a few seconds; UNDO takes back the whole cascade in one step and only while nothing else changed.
- **Smaller:** selecting text in a note or frame label no longer drags the node; long notes scroll while editing; the habit add field clears on Escape and never drops a half-set repeat silently; a picked image that can't be used says why on the node; a brand-new board is greeted with an introduction and a pointer to the tour.
- **Todo F10 retired:** a single click on a row's text was specified to start its pomo, but it would fire on the first half of every double-click (rename). "Start pomo" stays in the row menu; the misleading pointer cursor is gone.
- **Dev:** pure helpers moved out of the Pomo, Clock, Task, Week and Year component files, so React Fast Refresh hot-swaps them instead of reloading the page. The stale-save merge is now also covered through the real `board:save` IPC handler.

---

## [2026-11-03] — Autonomous pass (batch 7): terminal that survives, Station sizes, notes

**Type:** Bug Fix / Feature
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `f32406c` … `a42f113`
**Files changed:** `TerminalNode/{index.tsx,session.ts,liveTerminals.ts (new)}`, `main/{ipc/handlers.ts,preload.ts}`, `renderer/env.d.ts`, `store/useCliDispatch.ts`, `Station/{StationLayout.tsx,restoredSizes.ts (new),useStationViewportGate.ts}`, `Canvas/CanvasFlow.tsx`, `ui/LayoutModeToggle.tsx`, `TextNode/{index.tsx,editEvent.ts (new)}`, `shared/{types/board.ts,schemas/board.schema.ts}`, `docs/06-requirements/terminal-node.md` (F4 / F15 amended), tests (+ xterm mock `options` / `refresh`)
**Summary:**
- **Terminal survives remounts:** switching Station ↔ Canvas, hiding the terminal panel or swapping slots used to kill the shell (and whatever ran in it, the AI included) and wipe the output. The xterm and its PTY now live in a per-node registry; unmount detaches, the next mount re-attaches and refits. Shells still end with their window (main kills them on reload / navigation / crash / close). Spec F4 / F15 amended.
- **Terminal never dead:** after `exit` (or a crash) the badge reads EXITED and Enter starts a new shell; a shell that cannot start prints why in red and retries on Enter (it used to be a blank black box). One catch-up resize after spawn, so the PTY never keeps stale columns. `krnl term setShell` is now used for the next shell (it was saved but never read). Ctrl+Shift+L works from inside the terminal. A short panel gets the one-line banner. The right-click menu is the shared ContextMenu (closes on outside click, not clipped by narrow panels).
- **Station:** in the narrow-window fallback (below 1024 × 640) the canvas now draws the mother nodes, and Dock "A" / ensure-visible act as Canvas mode. Panel sizes (row split, top columns, every bottom panel) come back after a reload or a layout switch.
- **Notes:** a note whose text runs past its box fades at the bottom; Enter or F2 opens the selected note for editing.

---

## [2026-11-03] — Autonomous pass (batch 8): paste, month view, analytics

**Type:** Bug Fix
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `d71a7b2` … `9bb0c9c`
**Files changed:** `TerminalNode/{session.ts,index.tsx}`, `CalendarNode/{MonthView,WeekView}.tsx`, `AnalyticsNode/index.tsx`, `analytics/summary.ts`, tests
**Summary:**
- **Terminal paste:** Ctrl+V and right-click Paste go through xterm's paste (bracketed when the shell asks for it), so a multi-line paste no longer runs line by line; Ctrl+V cancels the browser's own paste so text can only arrive once; Cmd+C with nothing selected no longer sends ^C on macOS. (`e01f22f` carried only its test; the code followed in `d1626e4`.)
- **Month view:** up to six habit dots before "+N", and "+N" counts the hidden ones; no dots before a habit existed; the calendar's "show habits" setting is honoured; today's cell (month and week view) moves at midnight; a click also moves the anchor so Week / Day open on that day, a double-click opens it; chips are earliest first, so "+N" hides the latest.
- **Analytics:** a hidden card keeps its grid cell — hiding a page's top card used to shift every later page by half and break the page jump; the headline says "the last 7 days" (the range is rolling); seven distinct weekday colours; extra sources keep their colour by id; the saved / CLI-set view opens its page.

---

## [2026-11-03] — Autonomous pass (batch 9): month drops, plan vs actual, review follow-ups

**Type:** Bug Fix / Feature
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `a104ecf` … `d8fa4a7`
**Files changed:** `CalendarNode/MonthView.tsx`, `styles/reactflow-theme.css`, `analytics/charts/PlanVsActual.tsx`, `AnalyticsNode/index.tsx`, `Station/{StationLayout.tsx,restoredSizes.ts}`, `Canvas/CanvasFlow.tsx`, `TerminalNode/{index.tsx,liveTerminals.ts}`, `main/ipc/handlers.ts`, tests
**Summary:**
- **Month view drops (ADR 0001 §9):** day cells take Todo rows, canvas tasks and other month chips; a task keeps its time of day on the new date, a new one starts at 09:00. Month chips drag between days.
- **Plan vs actual:** "+N more" when tasks don't fit (they were dropped silently).
- **Analytics:** the per-card ☆ / − buttons are gone — they only appeared under the settings panel that covers the cards, and pinning never moved a card (each card has a fixed grid cell). Hiding stays in the settings panel.
- **Review follow-ups (batches 5–8):** the mother-row height is saved only from a real two-row split; the clock stays locked to the calendar column when other bottom panels change; canvas Delete / Enter act only while focus is on the canvas (a selection left in the embedded canvas is safe while typing in a Station panel); EXITED survives a remount; a terminal's cleanup never removes a newer mount's host; the analytics view jump handles Summary and skips pages Easy mode hides; a stale save whose payload can't be normalised still merges.

---

## [2026-11-03] — Autonomous pass (batch 10): tasks, habit lanes, CLI parity

**Type:** Bug Fix / Feature
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `f6c9501` … `78a4c4b`
**Files changed:** `TaskNode/index.tsx`, `HabitLaneNode/index.tsx`, `HabitNode/HabitContextMenu.tsx`, `Canvas/CanvasFlow.tsx`, `sys/{parser,SysFacade}.ts`, `sys/commands/{habit,task,text,analytics,clock,cal}.ts`, `shared/cli/commandRegistry.ts`, `docs/06-requirements/task-node.md` (F10 / F11), tests
**Summary:**
- **Task cards:** "Add parallel task" is saved (it lived only in memory, so the next CLI write or a quit lost it); an open-ended task shows "no set time" with no made-up estimate or overrun; opening "Edit time" and leaving it unchanged writes nothing (it used to turn an open-ended task into a fixed 25-minute one); the card's Delete offers UNDO.
- **Habit lanes:** `krnl habit remove` / `archive` take the habit's lanes with them; an orphan lane's cleanup is saved and leaves no undo slot (undoing to it re-created the orphan, which deleted itself again — a stuck undo); an archived habit's lane goes away; new "Unpin lane (keep the habit)"; the lane's Delete offers UNDO; the 7-day strip follows the same schedule rule as the tick; lane numbers count lanes instead of reading uuid digits.
- **Frames:** a task moved on one canvas also leaves frames on the other canvases.
- **CLI parity (hard rule 8):** `text look <id> --note|--sticky|--shape …|--color`, `analytics cards | hide | unhide | reset-cards`, `clock half [am|pm]`, `cal zoom <1-6>`; `task addNext`'s placeholder estimate follows the source's plan as the canvas does.

---

## [2026-11-03] — Autonomous pass (batch 11): CLI gaps, theme readability

**Type:** Bug Fix / Feature
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `5f15d2b` … `5821e25`
**Files changed:** `sys/{parser,SysFacade}.ts`, `sys/commands/{media,draw,analytics}.ts`, `shared/cli/commandRegistry.ts`, `TodoNode`, `MediaNode`, `Assistant/Commander.tsx`, `AnalyticsNode/{index,AnalyticsSettings,SummaryHero}.tsx`, `ui/Switch.tsx`, `TaskNode`, `PomoNode`, `FrameNode`, `ImageNode`, `TextNode`, `CalendarNode/TaskPopup.tsx`, `Canvas/CanvasFlow.tsx`, tests
**Summary:**
- **CLI parity (hard rule 8):** `media resize <id> --w --h`, `media page <id> <n>`, `draw stroke --points "x,y …" [--tool --color --size]`, `analytics clear-history --yes` (not undoable, so it asks for `--yes`). Factory reset stays UI-only on purpose (hold-to-confirm, wipes the board).
- **Readable in every theme:** the Todo done checkbox is the task card's checkbox (a fixed black fill hid the mark in every light theme); Media error links and Commander hints use the always-dark palette (Macintosh light made them near-black on black); the Analytics tiles, off-switch knob and header line use the panel's own tokens.
- **One accent:** task and pomo glows follow the frame style's accent instead of a fixed lime; resize grips use `--ink-4`; the calendar task popup's primary button uses the primary-button tokens; the canvas node menu is the shared ContextMenu.
- **One shell:** the habit menu, the calendar task popup and media cards use the shared menu / popover / card radius and shadow tokens (`de8b2a1`).

---

## [2026-11-03] — Autonomous pass (batch 12): assistant and chrome

**Type:** Bug Fix
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Commits:** `8ab6586` … HEAD
**Files changed:** `Assistant/{ScriptRunner.ts,flows/tutorialPomoTodo.ts,flows/focusSession.ts}`, `main/preload.ts` (`sysRun`), `renderer/env.d.ts`, `dev/previewBridge.ts`, `Orb/index.tsx`, `Dock/index.tsx`, `StatusBar/index.tsx`, `AnalyticsNode/index.tsx`, tests
**Summary:**
- **Assistant commands:** flows run `krnl` commands in main through the CLI facade with their arguments intact. They used to be typed into a hidden shell: multi-word task names were cut to their first word (so Commander sessions always "went wrong") and every command waited out a 5 s timeout. Failures now show in the caption; a stopped flow can't resume when another starts; stopping a flow stops the radio.
- **Tutorials:** the removed double-click "bind to Pomodoro" lesson is replaced by the current way (Start pomo on the Todo row; skipped in Easy mode); the "wait for you to do it" steps ignore tasks that were already on the board; the focus session says what starting really does and no longer promises a break announcement.
- **Orb and chrome:** the chat panel and caption open toward free space and the orb can't park under the top bar; a chat message launches a flow only when it names it (typing "a" started a Pomodoro); quick actions stay after the first message; the placeholder names the real shortcut (hold Space). The Dock's shape button closes its own menu; the status bar counts sessions to the Pomo's real long break; the Analytics header gets each frame style's header skin.

---

## [2026-11-03] — Pro light mode, "Paper" style name

**Type:** Feature
**Branch:** `TMD/autonomous-app-improvement-5e64b2`
**Files changed:** `themes/manifests.ts` (`PRO_LIGHT`), `shared/frameStyles.ts`, `ChassisLayer/dockRegistry.tsx`, `styles/chassis.css`, `sys/SysFacade.ts`, `docs/06-requirements/theme-engine.md` (F4), tests
**Summary:**
- **Pro light:** Pro was dark-only, so choosing Light switched the frame to the default style. Pro now has its own light palette — light-grey panels, graphite ink, the lime kept as a fill with dark text on it, deep green where it is text — with the same squared, matte frame. It passes the theme contrast checks.
- **"Paper":** the default style (id `classic`) is shown as "Paper · Cream & lime" instead of "Classic · Default frame" (Pro is the default anyway). The id is unchanged, so saved choices and scripts keep working; `krnl theme frame paper` works too.

---

## [2026-11-03] — v0.10.0 re-release

**Type:** Release
**PRs:** #193 (quality pass), #194 (release notes)
**Summary:** The v0.10.0 tag moves to the merged quality pass and the Windows installer is rebuilt in place of the first 0.10.0 build (built locally: the release workflow's Windows job can't build node-pty on the CI image — node-gyp finds no Visual Studio — and its macOS job failed on a platform-blind test, fixed in #195); `docs/releases/v0.10.0.md` gains an "Updated build (Nov 3)" section. Same version number, by the maintainer's choice.


---

## [2026-11-05] — Bug batch: terminal, clock, calendar, observe tags, no auto-chain, Orb Claude button

**Type:** Bug Fix + Feature
**Issues:** #199, #200, #201, #202, #203, #204, #205, #206
**Branch:** `TMD/bug-batch-terminal-clock-calendar`
**Files changed:** `Station/{StationLayout.tsx,layoutGeometry.ts}`, `TerminalNode/{index.tsx,session.ts,liveTerminals.ts,fitGuard.ts}`, `ClockNode/{index.tsx,follow.ts}`, `CalendarNode/WeekView.tsx`, `ContextMenu/scheduleMenus.ts`, `PomoNode/{index.tsx,DoingPicker.tsx,SpanLabeler.tsx,taskTargets.ts}`, `Canvas/commandDispatch.ts`, `shared/dispatch/todo.ts`, `sys/{parser.ts,SysFacade.ts,commands/{clock,pomo,task}.ts}`, `shared/cli/commandRegistry.ts`, `Orb/index.tsx`, `store/{claudeLaunch.ts,useCliDispatch.ts}`, requirement docs, tests
**Summary:**
- **Terminal crash on first open (#199):** the Station bottom row fed saved panel sizes back into the panels, the panel library re-emitted them rounded, and the save started over until React's update limit (#185). Restored sizes are now a snapshot per visible-panel set, and sizes within 0.01 % of the stored ones are not saved again.
- **Terminal 2-column prompt (#200):** the terminal fitted itself while its panel was ~6 px wide, so the shell redrew its prompt 2 columns wide. One guarded fit ignores sizes under 10×3 and resizes the PTY only on a real change.
- **Clock on a new day (#201):** the clock kept yesterday's `selectedDate` (and the morning half after noon). It now follows now: at app start and at midnight/noon it moves to today and the current half unless the user is browsing another day. New `krnl clock now`.
- **Clock hover flicker (#202):** ticks, numerals, readout, hands and hub are one `pointer-events: none` group.
- **Calendar left-click (#203):** a left click on recorded time opens its details (overlaps → picker); right click keeps the menu; Escape closes the details.
- **Tagged time looked untagged (#204):** recorded spans show their task name on the band, popup, menus ("Tagged: X") and in `krnl pomo segments`; done tasks stay taggable (✓, "Done today" in the Pomo); a deleted task shows as "name (deleted)" instead of a blank select. The data was never lost.
- **No auto-chain (#205):** adding tasks (Todo UI, `todo add`, `task add`) no longer links them; users chain manually.
- **Orb → Claude Code (#206):** a quick action shows the terminal and runs `claude --dangerously-skip-permissions`; CLI `krnl term claude [--bypass]`.
- **Verified in the real app** (isolated copy of the maintainer's board): clock moved from Nov 4 to today on start, numerals pass the pointer through, left-click opens "filmgenie" details, right-click shows "Tagged: filmgenie" and "✓ cluster build", terminal opened with no error and no staircase.

---

## [2026-11-05] — Idle CPU: frame budget for decorative animations

**Type:** Performance
**Issue:** #197
**Branch:** `TMD/kernel-gpu-windows-usage-f9f3aa`
**Files changed:** `renderer/utils/frameBudget.ts` (new), `renderer/index.tsx`, `AmbientRadio/index.tsx`, `docs/06-requirements/render-frame-budget.md` (new), `tests/unit/renderer/frameBudget.test.ts`
**Summary:**
- **Cause (measured over CDP on a copy of a real board, Pro theme):** the window rendered ~218 frames/s on a high-refresh monitor whenever any infinite CSS animation ran, and every frame costs CPU in the GPU process and the renderer. Idle cost ~2.2 cores (~25-28% of 8 cores in Task Manager); with animations stopped it was 0%. The silent radio widget also redrew an identical canvas every refresh.
- **Frame budget:** every infinite CSS animation gets effect-level `steps()` timing (~30 updates/s) and its start time snapped to one shared 30 fps beat, so Chromium skips the frames where nothing changes and all animations change in the same frame. Keyframes, curves and durations are untouched; transitions, one-shot animations and `data-frame-budget="off"` subtrees keep full refresh.
- **Radio:** draws once per state change while silent; while playing it draws on a ~60 fps timer (the speed its per-frame particle motion was tuned for) instead of the monitor rate.
- **Result:** idle ~190-220% of a core -> ~27-30% (~3.5% in Task Manager), with every animation still moving.

---

## [2026-11-05] — v0.10.0 re-release (Nov 5 build)

**Type:** Release
**PRs:** #198 (idle CPU frame budget), #208 (bug batch), this release-notes PR
**Summary:** The v0.10.0 tag moves to main with #198 and #208 merged, and the Windows installer is rebuilt locally in place of the Nov 3 build (same reason as Nov 3: the release workflow's Windows job can't build node-pty on the CI image). `docs/releases/v0.10.0.md` and the GitHub release gain an "Updated build (Nov 5)" section. Same version number, by the maintainer's choice.

---

## [2026-11-05] — Time log: what you did, when, on what

**Type:** Feature + UX
**Issue:** #207 · Decision 35 · docs/06-requirements/time-log.md
**Branch:** `TMD/time-log`
**Summary:**
- **Durable time log** (Decision 35): main keeps `<boardDir>/timelog/YYYY-MM.jsonl`, append-only. One choke point per side diffs the board before/after each change (renderer store subscription; CLI around write verbs) and logs span closed/edited/retagged/deleted, plan set/cleared, task created/renamed/completed/reopened — every completion kept, plan moves kept, history survives task deletion. One-time backfill from the board. `krnl time log`, `krnl time report`. "Clear focus history" logs `history.cleared`.
- **Correcting time:** double-click a time in the recorded-span popup to change it in place; on a running session "now" becomes "Stop at" (Pomo: "stopped earlier?"). **Log time** you didn't record: right-click empty Calendar/Clock time or "+ log past time" on the Pomo; the popover has a small clock to drag the range on, plus quick fill (last 30m / 1h, gaps between sessions). `krnl pomo segment <id> --start/--end`, `krnl pomo add`.
- **Plan-first, never silent:** START no longer tags itself; the Pomo shows "Planned now: X — Start on it / Track it". Planned blocks read "started 20m late / early / on time".
- **Overviews:** Analytics **Time log** page (task × day heatmap, week/month, worked / plan, by tag on the days worked); Clock **▦ WEEK** (7 static 24-h rings sized to the panel; `krnl clock week`); Calendar month cells show hours; Todo rows "⏱ 1h20 / 30m"; task details show a timeline (per-day work, plan moves, completions).
- **UX:** one popup for left and right click on recorded time (no duplicate menu); one compact searchable task/category picker (tasks first, categories as chips) for "name this span" and Counts toward; any done task can still collect time; estimate **0 = no set time** (row reads "open", `krnl task duration <ref> 0`); click the estimate to edit it; app open/close markers on Calendar and Clock; Orb "claude code" button in Claude orange.
- **Verified in the real app** on a copy of the maintainer's board (week view, edit end time, log time here, + log past time, todo tracked figure, open marker, backfill).

- **Follow-ups (same PR):** Log time simplified (day control, From / To, day strip as a picture only, gap chips, Trim on overlap); week view as small copies of the main clock (only today moves); done tasks hidden behind "Show done" and reopened to track; category-tracked time labelled as a category; discard is press-and-hold; app markers show only the first start / last shutdown, as a thin dashed line, none for today; every current task has its own colour (18 per theme). Analytics: no blurred shadows, KPI text fits its tiles, Time log page redesigned (task colours, hours in cells, by-tag bar), **Time by tag** now counts recorded work on the days worked (open tasks and category sessions included; estimates no longer count as time), Plan vs actual ignores "no set time" tasks.
- **First-start layout and guided tours** (docs/06-requirements/guided-tours.md): a new board opens Pomo, Todo, Calendar, Clock / Habits, Analytics with the Terminal hidden. Eight short text tours (Welcome, Pomo, Todo, Calendar, Clock, Habits, Analytics, Terminal & AI) spotlight what they explain, bring the window into view, and wait for Next or the real action; started from the Orb's "Tutorials" or `krnl tour list` / `krnl tour start <id>`.
- **UI review fixes (same PR):** chart axes print whole, distinct numbers (no "0 1 1 1"), edge labels stay inside the plot, card titles wrap to two lines, the weekday donut shows "8h 27m" not "507"; pages renamed **Planned vs spent** and **Time per task**. Habits "add habit" row moved to the bottom, same look as Todo's "add task". The tour ring appears in place once its target stops moving (no slide from the right) and tours sit above Settings. New **Easy and Advanced** tour (`krnl tour start modes`) says what Advanced adds. Voice flows ("Start a Pomo task", "Show me around") hidden from the Orb until they are rewritten. New **UI rules** in docs/04-visual-system/design-tokens.md (charts, add rows, motion, modes, layers).
- **Tours that show, not tell (same PR):** every tour rings what it talks about with a short label (PRESS, TICK TODAY, NEW IN ADVANCED) and asks for the real action — start, break and stop the Pomo; add and tick a task; add and tick a habit; open a page. Steps for controls that exist only in one mode are skipped in the other. The Easy and Advanced tour switches the app's mode live and rings what appears, then lets you keep either (your mode comes back if you end early). The card no longer jumps between steps.
- **Tour guide you can follow (same PR):** the tour card is bigger (420 px, 15.5 px text), carries a small glowing orb, and glides from step to step; the next words fade in once it arrives, so the text no longer changes before the card moves. Key words are highlighted and a progress bar shows how far along you are. The Easy and Advanced tour (and the Welcome tour) open Settings to show **Settings → Mode** and say which mode you are in. UI rule 8 revised (highlights never slide; the guide may glide), rule 11 added (readable teaching text).
- **Window swap by drag (same PR):** dragging a window's grip (Station panels and canvas mothers) now carries a mini picture of the whole window instead of just the grip; the picked-up window dims with a dashed outline, the window under the pointer lights up with "Swap here", and both settle into their new places with a short pop after the drop (`motherDrag.ts`; transform / opacity only, off with reduced motion).
- **Swap animation redone (same PR):** instead of a pop in place, the two windows now trade places — a picture of each flies from where it was to where it lands (the dragged one lifts and passes over the other, with a soft shadow), then the real windows fade in under them. Pictures fly above everything, so Station panel edges don't clip them; off with reduced motion.
- **Hold and carry a window (same PR):** swapping windows is no longer a browser drag. Press the grip and move: you hold the real window — it follows the pointer and tilts in 3D with your movement (scaled to at most 520 px so targets stay visible), its slot stays as an empty dashed outline, and the window under the pointer shows "Swap here". Drop it there and it flies into that slot while the other flies to the emptied one; drop elsewhere or press Esc and it flies back. On the canvas the flights live inside the canvas viewport, so they keep up with zoom and scroll (they used to stay fixed on screen and lag behind).
- **Drag feel tuned (same PR):** the held window casts a soft drop shadow on the surface below it that shifts with the tilt (no acid ring). The drop is fast and smooth: one 260 ms ease-out move that starts the instant you let go (landing spots are known before the swap, so there is no wait), the tilt and shadow settle as it lands, and nothing jumps at release.
- **Cast shadow with depth (same PR):** the held window casts its shadow on what is under it, lit from above the middle of the screen: a near, sharper shadow clipped to the window you are over and a far, softer one on the background (with a hole where that window is). They shift by different amounts as you move — parallax — and lean with the tilt. No edge shadow on the window itself. Cheap: each shadow is a blurred box drawn once; per frame only transforms change, and the clip shapes change only when the window under you changes.
- **Shadow follows the tilt (same PR):** the cast shadow is now the held window's own silhouette with the same 3D tilt, so its shape swings as you drag left / right; it trails behind the movement (up to ~80 px) and drops below, so it shows past the window instead of hiding under it. Darker, so it reads on dark themes; near (on the hovered window) sharper and closer than far (background).
- **No stretch on drop (same PR):** dropping no longer squashes a window to the other slot's shape for a moment: pictures keep their proportions and fade out mid-flight while the real windows, already at their new size, fade in underneath.
- **Real cast shadow (same PR):** the moving light (it read as a glow) is gone. The held window casts a tight shadow — its own outline with the same tilt, offset by the movement — as a sharp contact shadow on the window under it and a small soft one on the background. Its strength is set from the measured brightness of the surface it falls on, so it reads on the light and dark themes and every window frame (strong on dark, gentle on light).
- **Cast shadow removed (same PR):** the drag shadow experiments are taken out; holding a window keeps the 3D tilt, the empty-slot outline, "Swap here" and the quick, stretch-free drop.

---

## [2026-11-05] — App updates: notify + auto-update from GitHub Releases

**Type:** Feature + CI
**Issue:** #211 · Decision 36 · docs/06-requirements/app-updates.md
**Branch:** `TMD/auto-update-launcher-github-59d480`
**Files changed:** `src/main/updater/` (new: `UpdateService.ts`, `backends.ts`, `index.ts`), `src/shared/update.ts` (new), `src/sys/commands/update.ts` (new), `src/sys/parser.ts`, `src/sys/SysFacade.ts`, `src/shared/cli/commandRegistry.ts`, `src/main/index.ts`, `src/main/preload.ts`, `src/main/rpc/server.ts`, `src/main/ipc/handlers.ts`, `src/renderer/store/updateStore.ts` (new), `src/renderer/components/ui/UpdateNoticeBar.tsx` (new), `src/renderer/components/TopBar/UpdatesSection.tsx` (new), `TopBar/index.tsx`, `StatusBar/index.tsx`, `App.tsx`, `useCliDispatch.ts`, `env.d.ts`, `electron-builder.json`, `.github/workflows/release.yml`, `package.json` (`electron-updater ~6.1.8`), `AGENTS.md` (rule 11 + "Releases & updates"), `claude/CLAUDE.md`, `docs/releases/RELEASING.md` (new), `docs/03-architecture/decisions.md` (Decision 36), tests (5 new files, 78 tests)
**Summary:**
- **Installed apps update themselves from GitHub Releases (free).** Windows (NSIS): `electron-updater` checks ~15 s after start and every 4 h, downloads in the background (blockmap differential, sha512-verified), then shows "KRNL0 X.Y.Z is ready — Restart · Later"; Later installs silently on quit. macOS / Linux: notify-only via GitHub's `releases/latest` API ("is out — Download"), because Squirrel.Mac needs a paid Apple signature. Drafts and pre-releases are never offered.
- **One state machine in main** (`UpdateService`, backend + timers injected) pushed to the window (`update:state`) and pulled on mount. Status bar version item (`v0.10.0 · ↓ 42%`, `v0.10.0 → 0.11.0`), Settings → Updates (state, Check now, Restart / Download, What's new), and `krnl update status|check|install|open`. Before a restart the window commits the focused edit and saves the camera (`app.flush`); a CLI install replies before the app quits.
- **Off in dev builds and isolated worktrees** (`app.isPackaged`, `KRNL0_USER_DATA`); `KRNL0_DISABLE_UPDATES=1` turns it off, `KRNL0_UPDATES=notify` forces the notify check for trying the flow.
- **Release pipeline fixed:** the Windows job failed on `windows-latest` (VS 2026 / node-gyp can't build node-pty), now pinned to `windows-2022`; `latest.yml` ships with the installer; asset names have no spaces (`KRNL0-Setup-X.Y.Z.exe` — GitHub had turned spaces into dots); CI fails when the tag isn't `package.json`'s version; `docs/releases/vX.Y.Z.md` becomes the release body.
- **Release process written down** (AGENTS.md rule 11, docs/releases/RELEASING.md): patch for fixes, minor for feature releases, never reuse a version or move a published tag, Publish on the draft is the switch that ships it.
- **Also fixed:** `SysFacade` dropped its `viewSize` dependency, so CLI-added nodes never used the visible-centre placement.
- **Flaky test fixed (macOS CI):** `time.cli.test.ts` read "entries since `Date.now()`" right after a logging command; on a fast runner that command's `task.created` carried the same millisecond and was counted. Those windows now start at a position in the log instead of a timestamp.
- **Verified:** local `electron-builder --win` writes `latest.yml` (url = `KRNL0-Setup-0.10.0.exe`), `resources/app-update.yml` (github, theMindDeveloper/KRNL0) and bundles `electron-updater`. Typecheck 0 errors; 195 files / 2098 tests green. Not yet verified: a real update end to end. Apps on v0.10.0 have no updater, so the first updater-enabled release is installed by hand once; automatic updates can be seen from the release after it.

---

## [2026-11-05] — Frame style "KRNL Dock" renamed to "Nuclear"

**Type:** Chore (UI copy)
**Branch:** `TMD/auto-update-launcher-github-59d480`
**Files changed:** `src/shared/frameStyles.ts`, `src/renderer/components/ChassisLayer/dockRegistry.tsx`, `KrnlDockChrome.tsx`, `src/sys/SysFacade.ts`, `tests/unit/sys/theme.frame.test.ts`, `docs/06-requirements/theme-engine.md`, `docs/04-visual-system/chassis-cookbook.md`
**Summary:** The frame style shown as "KRNL Dock" is now **Nuclear** in the style picker, on the frame's own nameplate (`NUCLEAR · A1`, log caption `nuclear · /var/log`) and in `krnl theme frames`. The id stays `krnl-dock`, so saved choices and scripts keep working. `krnl theme frame` now accepts a style's id or its shown name in any case (`nuclear`, `Paper`).

---

## [2026-11-05] — v0.10.1 release: the first self-updating build

**Type:** Release
**PRs:** #212 (app updates, Nuclear rename), this release PR
**Summary:** Version 0.10.1 (`npm version patch`), `CHANGELOG.md` and `docs/releases/v0.10.1.md`. First release made through the update pipeline (docs/releases/RELEASING.md): tag `v0.10.1` on `main`, CI builds the draft with `KRNL0-Setup-0.10.1.exe`, its blockmap and `latest.yml` (plus the macOS DMG), then Publish. Installs of 0.10.0 or older have no updater and install this one by hand once; from here on releases arrive by themselves.

---

## [2026-11-05] — CI: macOS release build moves to macos-15

**Type:** Bug Fix (CI)
**Files changed:** `.github/workflows/release.yml`, `docs/08-history/HISTORY.md`
**Summary:** GitHub refused to start the `macos-14` runner on the `v0.10.1` tag build ("configuration 'macos-14-arm64-us-default' is not supported", the image is being retired), so the run was cancelled before anything was published. The macOS job now runs on `macos-15` (arm64); the unpublished `v0.10.1` tag is moved to this commit and rebuilt.

---

## [2026-11-05] — CI: release builds Windows only; macOS built by hand

**Type:** Chore (CI)
**Files changed:** `.github/workflows/release.yml`, `docs/releases/RELEASING.md`, `docs/releases/v0.10.1.md`, `docs/08-history/HISTORY.md`
**Summary:** The `macos-15` job of the v0.10.1 tag build sat queued for a shared GitHub Mac runner. By the maintainer's choice the release workflow now builds Windows only (the macOS entry is kept as a comment to restore). The maintainer builds the `.dmg` on a Mac from the same tag and attaches it with `gh release upload` (RELEASING.md → "macOS build"); macOS is notify-only, so no metadata file has to match. The unpublished `v0.10.1` tag moves to this commit.

---

## [2026-11-06] — Pocket timer: the Pomo node floats over other apps

**Type:** Feature
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/main/pocket/index.ts`, `src/main/mainWindow.ts`, `src/main/index.ts`, `src/main/preload.ts`, `src/main/ipc/handlers.ts`, `src/main/rpc/server.ts`, `src/main/boardIo.ts`, `src/shared/pocket.ts`, `src/renderer/pocket/*`, `src/renderer/index.tsx`, `src/renderer/App.tsx`, `src/renderer/env.d.ts`, `src/renderer/components/nodes/PomoNode/derive.ts`, `PomoNode/index.tsx`, `src/renderer/components/TopBar/PocketSection.tsx`, `TopBar/index.tsx`, `src/sys/commands/mini.ts`, `src/sys/parser.ts`, `src/sys/SysFacade.ts`, `src/shared/cli/commandRegistry.ts`, tests (`PomoNode.derive`, `shared/pocket`, `sys/mini.cli`), `docs/06-requirements/pocket-timer.md`, `docs/03-architecture/decisions.md` (Decision 37)
**Summary:** Minimising KRNL0 while the Pomo node is timing now shows a small always-on-top window with the node in its current mode: Pomodoro (the user's timer face counting down, session pips, Stop · Break · Pause, the "Are you done?" Extend · Break · Stop) or Observe (count-up, today's spans on the day strip, Work today / Breaks / Spans, Break · Stop, Back to work). It collapses to one line, drags anywhere (position remembered and kept on a visible screen), and hides when KRNL0 comes back. It is a view only: the main window sends it a snapshot and runs its buttons through the node's own command path; main forwards only the node's control commands. The node's timing and control rules moved to `PomoNode/derive.ts`, shared by both. The main window is now tracked by name, so CLI dispatch, second-launch focus and app activation never target the pocket. Settings → Floating timer switch; CLI `krnl mini status|show|hide|on|off`. Preferences live in `userData/pocket.json`, not the board. Out of scope: the Observe tagger in the pocket (menu bar / taskbar time shipped in the entry below).

## [2026-11-06] — Launch experience: splash, What's new, board backups, welcome back, feedback, milestones, taskbar time

**Type:** Feature
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/main/appState.ts`, `src/main/taskbar.ts`, `src/main/index.ts`, `src/main/preload.ts`, `src/main/pocket/index.ts`, `src/main/ipc/handlers.ts`, `src/main/rpc/server.ts`, `src/shared/appState.ts`, `src/shared/whatsnew.ts`, `src/shared/feedback.ts`, `src/shared/systemTimer.ts`, `src/renderer/index.html`, `src/renderer/splash.ts`, `src/renderer/launch/*`, `src/renderer/components/Launch/*`, `src/renderer/components/TopBar/LaunchSettings.tsx`, `TopBar/index.tsx`, `src/renderer/components/ui/UpdateNoticeBar.tsx`, `StatusBar/index.tsx`, `src/renderer/store/updateStore.ts`, `src/renderer/store/useCliDispatch.ts`, `src/renderer/styles/launch.css`, `src/renderer/assets/launch/*`, `PomoNode/ObserveDash.tsx`, `src/sys/commands/launch.ts`, `src/sys/parser.ts`, `src/sys/SysFacade.ts`, `src/shared/cli/commandRegistry.ts`, `.github/ISSUE_TEMPLATE/*`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, tests, `docs/06-requirements/launch-experience.md`, `docs/03-architecture/decisions.md` (Decision 38)
**Summary:** Built the launch designs. A splash card paints before any script loads and lists what is really happening (board, counts, canvas; after an update `Updated · a → b` and `backup saved`), then fades as soon as the board is on screen. Before a new version opens the board, main copies `board.json` into `backups/` (newest 3 kept; Settings › Updates › Show folder). After a feature update a What's new box (draft A) shows three highlights once; after a patch a small "Updated to x.y.z" notice fades after 5 s. Update states follow the designs: download meter in the status bar, "ready" waits while a Pomo session runs, Skip version on Mac/Linux, Retry after a failed manual check, recent versions in Settings. Windows shows Pomo progress on the taskbar icon with Pause / Break / Stop in the preview; macOS shows the time in the menu bar with the same controls. Welcome back lists what slipped after 2+ days away (only the first task of a chain gets buttons: Today, Tomorrow, Unplan, Move all to today) and habit streaks. A Help menu (?) adds Send feedback — a filled-in GitHub issue the user posts themselves — and Copy diagnostics. Milestone cards (streaks 7/30/100/365, focus sessions 10/100/500) render a 1080 px image to save or copy, with a Celebrations switch. The Observe day strip draws breaks as a thin line instead of hatching. App state lives in `userData/app-state.json` (Decision 38). New CLI: `krnl whatsnew [show]`, `krnl feedback`, `krnl catchup [show]`, `krnl share list|streak|sessions`, `krnl app status|backups|celebrations`. Repo: issue forms, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT. Previews: `KRNL0_SIMULATE_UPDATE=feature|patch`, `KRNL0_SIMULATE_AWAY_DAYS=n`.

## [2026-11-06] — Floating timer looks (dial, capsule, box); tour orb; Help › Catch up and Share a milestone

**Type:** Feature + Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/shared/pocket.ts`, `src/main/pocket/index.ts`, `src/main/preload.ts`, `src/renderer/env.d.ts`, `src/renderer/pocket/{PocketApp,DialView,CapsuleView,model,parts}.tsx`, `PomoNode/daySpans.ts`, `PomoNode/ObserveDash.tsx`, `TopBar/PocketSection.tsx`, `src/sys/commands/mini.ts`, `src/sys/parser.ts`, `src/sys/SysFacade.ts`, `src/shared/cli/commandRegistry.ts`, `src/renderer/components/Tour/{TourHost.tsx,tourAnchor.ts}`, `src/renderer/components/Orb/index.tsx`, `Launch/HelpMenu.tsx`, `styles/launch.css`, tests, `docs/06-requirements/pocket-timer.md`, `launch-experience.md`
**Summary:** The floating timer now has all three designed looks, chosen in Settings → Floating timer or with `krnl mini look`: a round **Dial** (the new default; ring = time left in Pomodoro, the day with today's spans in Observe; hover for controls; collapses to a small tab), a **Capsule** pill (hover opens a card with details and controls) and the **Box** (the node itself). The pocket window is transparent and sized to the look; main watches the pointer for hover because drag regions hide it from the page. Bug fix: a guided tour no longer shows a second, fake assistant orb — the real orb glides onto the tour card's corner and back home when the tour ends. Help menu gains **Catch up** (Welcome back any time) and **Share a milestone** (a card for the longest streak, or focus sessions).

## [2026-11-06] — Milestone cards as designed, share window, Settings redesign, pocket shadows

**Type:** Feature + Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/launch/{milestoneCard,milestones,launchStore}.ts`, `src/renderer/components/Launch/{MilestoneNotice,ShareDialog,HelpMenu,LaunchHost}.tsx`, `src/renderer/store/useCliDispatch.ts`, `src/renderer/assets/launch/cube-paper.webp`, `src/renderer/components/TopBar/{SettingsModal,index,PocketSection,UpdatesSection,LaunchSettings}.tsx`, `src/renderer/pocket/*`, `src/renderer/index.tsx`, `src/renderer/styles/launch.css`
**Summary:** The milestone cards are now drawn exactly as the design board: the cream streak card (cube, big number, habit in serif, 4-week day grid), the LCD sessions card (glowing number, 12 weekly bars) and a 1080 × 1920 story card. The in-app notice is the compact designed one (badge, one line, Save image · Copy · Not now, "See card"). A new Share a milestone window (Help menu, the notice, `krnl share`) shows every card full size, with Square / Story, Save image and Copy. Settings is redesigned: a section list with line icons (General, Floating timer, Celebrations, Updates, Reset) and the section on the right in cards; it opens on General so the guided tour still finds Mode; Help › Check for updates opens Updates. Fix: the floating timer's shadow no longer shows as a grey box around the dial and capsule — the transparent window is only 8 px bigger than the shape, so all looks now use one small shadow that fits inside it, and the page is transparent from its first frame.

## [2026-11-06] — Send feedback by email

**Type:** Feature
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/shared/feedback.ts`, `src/main/appState.ts`, `src/renderer/components/Launch/FeedbackDialog.tsx`, `src/sys/commands/launch.ts`, `tests/unit/shared/launch.rules.test.ts`, `docs/06-requirements/launch-experience.md`
**Summary:** Send feedback gains **Send by email** next to Continue on GitHub, for people without a GitHub account: it opens the user's mail app with the report (kind, title, text, version and system, recent errors if ticked) addressed to theminddevlab@gmail.com; nothing is sent until they press Send. The link is kept under 1,900 characters. Main lets only that mailto address through besides the project's GitHub pages. `krnl feedback --link` prints both links.

## [2026-11-06] — UI sounds: three sound packs, volume and on/off

**Type:** Feature
**Requirements:** [docs/06-requirements/ui-sounds.md](../06-requirements/ui-sounds.md)
**Files changed:** `src/renderer/sfx/{soundPacks,soundSettings,soundMoments,uiSounds,soundCli}.ts`, `src/renderer/sfx/packs/` (audio + `CREDITS.md`), `src/renderer/components/Canvas/commandDispatch.ts`, `src/renderer/components/TopBar/{index,SoundSection}.tsx`, `src/sys/{parser,SysFacade}.ts`, `src/renderer/store/useCliDispatch.ts`, `src/shared/cli/commandRegistry.ts`, `docs/06-requirements/{ui-sounds,ai-full-visibility-cli}.md`, `tests/unit/renderer/uiSounds.test.ts`
**Summary:** Short sounds now confirm actions: add, plan on the Calendar, timer start / pause / resume / break / stop, a finished pomodoro, task done / reopened, habit check-in / removal, delete. Three bundled free packs, picked by ear on `docs/research/free-kits.html`: **SND01 · Sine** (default, snd.dev), **Zen** (UI SFX, CC0) and **Crisp** (Anipixels, CC BY 4.0, credited in Settings and `CREDITS.md`). The moment is read from what changed on the board (`soundMoments.ts`), hooked once in `makeCommandHandler`, so every UI path for the same action sounds the same; view changes and per-second time keeping never take the snapshot. Web Audio engine with decode-on-first-use, a per-pack warm-up and an 80 ms repeat guard. Settings → Sounds: on/off switch, volume 0–100, pack buttons that play a sample. Settings are per install in `localStorage` (`krnl0-sound`), not board data. CLI: `krnl sound status|list|pack <id>|volume <0-100>|on|off|play <moment>`.

---

## [2026-11-06] — Finished tasks read neutrally; Easy calls the timer "Record"

**Type:** Feature (UI copy) + Chore
**Files changed:** `src/renderer/components/nodes/TaskNode/index.tsx`, `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `src/renderer/components/Station/StationToolbar.tsx`, `src/renderer/components/Tour/{TourHost.tsx,tours.ts}`, `src/renderer/components/Assistant/VoicePlayer.ts`, `src/renderer/sfx/{sfxEngine,uiSounds}.ts`, `docs/research/engagement-and-onboarding.md`
**Summary:** From the engagement research (C6, C11). A task that is done no longer shows the rust "+28m OVER": the card reads `PLAN 1H · TOOK 1H 28` in neutral ink, and its calendar block reads "· took 1h 28" with no rust strip; open tasks still show overruns. In Easy mode the panel toolbar names the Pomo **Record**, and tours write `{pomo}`, shown as "Record" in Easy and "Pomo" in Advanced. The sound and voice loaders use Vite's `query: '?url'` glob form (the `as: 'url'` deprecation warning is gone). Voice reactions were dropped by the maintainer; the research report records it and the final sound choice.

---

## [2026-11-06] — Engagement: finish, close the day, first-day tour

**Type:** Feature
**Requirements:** [docs/06-requirements/engagement.md](../06-requirements/engagement.md) F1–F19 (designs picked from the "KRNL0 Engagement Drafts" canvas: 1A, 2A+2C, 3A+3B+3C, 4A, 5A+5B, 6A+6B, 7A+7C, 8A)
**Files changed:**
- New: `src/renderer/store/{finishedCards,dayRecap,dayProgress,engagementCli}.ts`, `src/renderer/components/{DayMoments,PlanGuide}/index.tsx`, `src/renderer/components/TopBar/FinishedSection.tsx`
- Changed: `TaskNode`, `TodoNode`, `HabitNode` (+ `commands.ts`), `ClockNode`, `CalendarNode/WeekView.tsx`, `Canvas/CanvasFlow.tsx`, `Orb`, `Tour/{TourHost,tours}`, `ui/Popover.tsx`, `App.tsx`, `styles/tokens.css`, `src/sys/{parser,SysFacade}.ts`, `useCliDispatch.ts`, `commandRegistry.ts`
- Tests: `tests/unit/renderer/engagement.test.ts`, Todo test updates

**Summary:**
- **Finishing a task:** a ticked task becomes the **done card** (design 9B, same 220×120 box): how long it took as the big number, what was planned, when it was finished, and a ring for today's planned tasks. Ticking plays a one-shot reward (check pop, a burst of 8 dots, a border glow).
- **Finished cards leave the canvas:** they go overnight by default, with "after 1 hour" and "keep" as the other options and a "show finished" switch in Settings. A chain, or a task with its subtasks, leaves together when all of it is done. Hiding is render-only, so nothing is deleted.
- **Only "Done today":** the Todo list keeps today's done items in a "Done today" fold; older ones leave the list (Analytics and `todo list --archived` keep them). The "ARCHIVE DONE" button is gone.
- **Closing the day:** a recap card appears once a day, when the plan is all done or from 21:00. A morning line reads "yesterday: 4 done · 3h 10m", and a Monday look-back covers last week.
- **"Your first day" tour:** 16 steps through the whole loop, started by the orb's first click on a fresh board and listed first in the orb menu as "Start here".
- **Adding and planning to-dos:** estimate chips (15m–2h) appear after a to-do's name. A PLAN button on unplanned rows teaches drag and drop with one small one-shot animation (`components/PlanGuide`): a ghost of the task glides once onto the Calendar, its edge pulses once, and a tiny chip beside the row says "drag it onto the Calendar". Nothing covers the Calendar or repeats.
- **Habit streaks:** the streak line shows the next milestone and best streak, with a seal at 7/30/100/365 days. A "Missed yesterday? I DID IT" repair replaces the silent reset.
- **Clock:** an outer ring closes as the day's planned blocks are done, and seven week marks sit under the dial.
- **Missed calendar blocks:** a dashed outline and a ↻ REPLAN corner badge at any size; REPLAN makes the block hop once with a tiny "drag to a new time" chip beside it.
- **CLI:** `krnl finished …` and `krnl recap …`.
- **Fix:** nested popovers (a TimeField inside a popover) no longer close their parent.

## [2026-11-06] — Merge: engagement (sounds, done card, close the day) joined with the launch work

**Type:** Merge + Polish
**Branch:** `feat/pocket-pomo` (merged `feat/engagement-sounds-done-card`)
**Files changed:** `src/renderer/components/TopBar/{SettingsModal,SoundSection,FinishedSection}.tsx`, `src/renderer/components/ui/SettingsIcons.tsx`, `src/renderer/launch/{catchup,milestones,launchStore}.ts`, `src/renderer/components/DayMoments/index.tsx`, `src/renderer/components/nodes/HabitNode/index.tsx`, `src/renderer/components/nodes/TaskNode/DoneCard.tsx`, `src/renderer/components/PlanGuide/index.tsx`, `src/renderer/components/Launch/HelpMenu.tsx`, `src/renderer/components/Tour/TourHost.tsx`, `src/renderer/index.tsx`, `src/renderer/styles/launch.css`
**Summary:** The engagement branch (UI sound packs, the done card, finished cards leaving the board, close the day, the first-day tour, PLAN/REPLAN hints, habit streak repair) is merged into the launch work. Joined so nothing is duplicated or fights: Sounds and Finished cards are sections of the new Settings window, restyled as its cards with line icons and a styled volume slider; one best-streak rule and one milestone list (the Habit node's), and the habit's milestone seal opens the share card; the day recap and morning line wait while a launch dialog is open, and the morning line stays quiet right after Welcome back; the tour host keeps the real orb on the tour card and the `{pomo}` naming; Help › Take the tour starts the first-day tour. Polish: the done card reads as finished (light acid wash, "1h 20m", "done 19:16", softer title); a habit with no streak says "tick today to start a streak" (or "start a new streak today · best N") instead of a rust "▲ 0 day streak"; the PLAN hint's chip sits under its row inside the Todo panel on a solid background instead of over the neighbouring window. The temporary "What's new" review tour from the engagement branch is still in and must be removed before this reaches main.

## [2026-11-06] — Close-the-day redesign; tour, sound and visibility fixes

**Type:** Polish + Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/DayMoments/index.tsx`, `src/renderer/styles/launch.css`, `src/renderer/components/Tour/TourHost.tsx`, `src/renderer/components/Orb/index.tsx`, `src/renderer/sfx/{uiSounds,soundPacks}.ts`, `tests/unit/renderer/uiSounds.test.ts`
**Summary:** The day recap, last-week card and morning line are redesigned in the launch design language: the paper dialog with a scrim, an acid kicker, a serif headline, a done ring and number tiles, one plan-vs-recorded meter with a plan marker and a blame-free verdict ("right on plan", "40m less than planned"), a week of rounded bars with values and the best day in acid, three tiles (done, focused, active days), and a footer with the button on the right; the morning line is a pill with a sun icon. Fixes: a tour step about the orb (or its menu) no longer makes the card and the orb chase each other; a tour's words show as soon as the target holds still (3 px tolerance, at most 0.5 s instead of 1.2 s); a step about a window brings it back if it was hidden from the toolbar and switches the canvas layers on; every UI sound hit fades in (4 ms) and out (14 ms), and pitched-up hits are rolled off above 7 kHz, which removes the glitchy click on ticks; the task-done sparkle is pitched lower.

## [2026-11-06] — Fix: habits below the fold, tour card covering its target

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/HabitNode/index.tsx`, `src/renderer/components/Tour/TourHost.tsx`, `tests/unit/renderer/tourPlaceCard.test.ts`
**Summary:** Habits lower in the list (e.g. "No sugar") couldn't be reached: the new streak and repair lines made rows taller, the list scrolls, but the wheel over it zoomed the canvas instead. The habit list now keeps the wheel (`nowheel`, contained overscroll), like the Calendar and notes. The tour's guide card no longer covers what it talks about: when no side of the target has room (a tall Settings section), it takes the spot on screen that overlaps it least.

## [2026-11-06] — Fix: tour steps find what they talk about, wherever it is

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/Tour/TourHost.tsx`, `src/renderer/styles/launch.css`, `tests/unit/renderer/tourPlaceCard.test.ts`
**Summary:** A tour step used the first element matching its selector, wherever it sat — a Calendar block hidden under the grid's header, or a REPLAN badge inside a hidden panel — so the ring pointed at empty spots. Targets are now found by what they are, never by position: of all matches, the most visible one wins (inside the window, not hidden, clipped by every scrolling ancestor), preferring those inside the window the step is about; a match scrolled out of sight is scrolled into view once; if nothing is visible the ring goes around the window itself. A floating panel lying on top of the target (the ambient radio, a chat panel) fades aside for that step and comes back after.

## [2026-11-06] — Tour engine rules: right Settings page, named items, no dimming while waiting, every needed window shown

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/Tour/{TourHost,tours}.ts(x)`, `src/renderer/components/TopBar/SettingsModal.tsx`, `tests/unit/renderer/tourRules.test.tsx`
**Summary:** Four rules in the tour engine, so these bugs can't come back step by step: (1) a step that opens Settings opens it on the page that holds what it talks about (Sounds, Finished cards, Floating timer…), so the card no longer sits on an empty General page over the thing it describes; (2) a step can name its item (`targetText`) and the spotlight lands on that item, or on the button in that item's row (Demo · tick me, Demo · plan me, Demo · gym, Demo · read); (3) while a step waits for the user to act, nothing is dimmed, so what they must click never looks disabled; (4) a step lists every window it needs (`also`, e.g. Todo and Calendar for a drag) — each is un-hidden, and a floating panel covering any of them steps aside for that step.


## [2026-11-06] — Calendar rebuilt, one task card, Welcome back, pocket span naming, line icons

**Type:** Feature + Polish + Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/{WeekView.tsx,dayBlockLayout.ts}`, `src/renderer/components/nodes/TaskNode/{index,DoneCard,CardParts}.tsx`, `src/renderer/components/Launch/WelcomeBack.tsx`, `src/renderer/launch/{catchup,launchStore}.ts`, `src/renderer/styles/{launch,reactflow-theme}.css`, `src/renderer/components/nodes/{TodoNode,HabitNode,PomoNode,AnalyticsNode,ClockNode}/index.tsx`, `src/renderer/components/{TopBar/index,AmbientRadio/index,ui/SettingsIcons}.tsx`, `src/renderer/pocket/{PocketApp,parts,usePocketBridge}.ts(x)`, `src/main/{pocket/index,preload}.ts`, `src/renderer/env.d.ts`, `src/renderer/App.tsx`, `src/renderer/components/Tour/tours.ts`, removed `src/renderer/dev/whatsNewDemo.ts`; docs `calendar-clock-visuals.md` F15, `task-node.md` F1/F16, `pocket-timer.md` F13; tests for each.
**Summary:** Calendar: blocks are only the plan; what was recorded is a thin rail inside each day's left edge (breaks are its gaps); habits are clickable pills on the right edge that tick the habit; Recorded and Habits switch on and off in the header. After review it was rebuilt to fix real layout bugs, checked by measuring every block: text is never rotated (narrow lanes used to show titles sideways), at most 2 tasks side by side in the week and 4 in the day with a "+N" chip for the rest, a 3 px gap between blocks that touch in time, the grid opens and pages on whole hours and never on a block cut in half, a missed task says "Missed" once (the dashed border, REPLAN pill and sentence are gone; replan shows on hover), done tasks stay readable with a check, line icons replace ↑ ↓ ✓ ↻ ← → ▦. Task card: open, running, paused, missed and done share one 220×120 frame, so nothing moves under the click; "#03 L0" and the corner timer are gone. Welcome back: the days away as calendar columns, loose ends with Today and icon buttons, habit weeks. Todo "Done today" pages straight to the done items; habit rows say "N days" with a flame and a plain repair row. The floating timer asks "What were those 25m?" after an Observe span, one click on a category names it (only `pomo.retagSegment` with checked arguments may come from the pocket). The top bar, node headers and Todo use line icons instead of ⚙ ☾ ☀ ☰ ⏱. The temporary branch-review tour and its demo data are removed.

## [2026-11-06] — UI loop batch 1: Analytics fits small windows, Todo and Pomo readable in light mode

**Type:** Polish + Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/AnalyticsNode/index.tsx`, `src/renderer/analytics/charts/PlanVsActual.tsx`, `src/renderer/components/nodes/TodoNode/index.tsx`, `src/renderer/components/nodes/PomoNode/index.tsx`, `src/renderer/styles/reactflow-theme.css`
**Summary:** Found by rendering every window in light and dark and measuring clipped text, contrast and overlaps. Analytics: the "Plan vs actual" tiles cut their text ("ACCU ×1 task") in a small window; they now fit the room they have (four in a row, 2×2, or a plain label/value list). "Estimate vs actual" in a narrow card stacks name and value over full-width bars instead of drawing the value on the bars. The header's chips give way to the window's width (done, then focus) so the gear never leaves the window; the streak value uses the dark acid in light mode. Todo: a task whose planned time passed was faded like a done one; it now stays fully readable (the overdue dot marks it). Time and tag text is 10.5 px at readable contrast, tags are the task card's tinted chips, the overdue dot keeps its slot on every row so checkboxes line up, and the header says "7 overdue". Pomo: the cycles counter was lime on a pale strip (1.2:1) in light mode; it uses the dark acid with readable labels; the task picker's ☐/☑ characters are line icons.

## [2026-11-06] — UI loop batch 2: habit days read right, Welcome back copy, top bar, Settings never blank

**Type:** Polish + Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/styles/{tokens,launch,reactflow-theme}.css`, `src/renderer/components/Launch/WelcomeBack.tsx`, `src/renderer/components/TopBar/{index,CanvasSwitcher,PocketSection,LaunchSettings}.tsx`, `src/renderer/dev/previewBridge.ts`, `tests/unit/renderer/AppChrome.scenarios.test.ts`
**Summary:** Habit week grid: a habit ticked today looked unticked (the "today" rule cleared the fill); done days were a framed two-colour cell that read as an empty box; future days were darker than past ones in light mode. Now done is a solid block in the habit's colour, today is an outline (filled when ticked), a missed day is grey, and future days are a faint empty outline, in both themes. Welcome back says "1 day, still going" (not "1 days") and the "was Tue 3" date is readable on the light dialog. Top bar: the path no longer wraps onto two lines (it hides on narrower windows so the canvas name keeps its room), the canvas name no longer shrinks to "Ma…", and ∷ ◆ ▾ are drawn shapes. Settings: Floating timer and Celebrations never show an empty card (the celebrations switch shows its default until read; the floating timer says it lives in the desktop app when there is none). Dev: `?fixture=rich` preview board with habits in every state and slipped tasks, for render checks.

## [2026-11-06] — UI loop batch 3: calendar header and habit pills at any size, recap wording

**Type:** Polish + Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `src/renderer/components/DayMoments/index.tsx`, `src/renderer/styles/reactflow-theme.css`
**Summary:** In a small Calendar window (the station layout) the header wrapped "Week of November 2" onto three lines and the zoom "+" sat on the next arrow; the header now gives way to its width ("Week of" goes first, then the layer labels — their icons stay — then the zoom) and never wraps; its labels are 10 px. Habit pills on the calendar: text is always ink (the done pill was dark text on dark teal, 3.4:1); done is the habit's colour as a tint with a check, open is an outline; in narrow day columns a habit is a round icon with its name in the tooltip instead of "R…". The first-day tour was walked step by step headless: the card never covers its target and never leaves the window. Day recap: the ring says "of the plan done" (next to "3 done" it read as a contradiction) and the streak uses the flame icon, not ▲.

## [2026-11-06] — Bug hunt batch 1: safe settings writes, strict external links, calendar layers in the board and the CLI

**Type:** Bug Fix + Feature (CLI parity)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/main/appState.ts`, `src/main/pocket/index.ts`, `src/shared/feedback.ts`, `src/renderer/components/nodes/CalendarNode/{types,commands,WeekView}.ts(x)`, `src/renderer/components/Canvas/commandDispatch.ts`, `src/sys/{parser,SysFacade}.ts`, `src/sys/commands/cal.ts`, `src/shared/cli/commandRegistry.ts`, `docs/06-requirements/calendar-clock-visuals.md` F16, tests `tests/unit/shared/externalUrl.test.ts`, `tests/unit/sys/cal.layers.test.ts`
**Summary:** `app-state.json` (what's new seen, celebrations, last active) and the floating timer's prefs were written in place; a crash or power cut mid-write left a broken file and the app silently fell back to defaults. Both now use the board's atomic write (temp file, then rename, retried on Windows locks). The "open in browser" check matched by prefix, so `…/KRNL0-anything` or a look-alike host passed; it now parses the URL and allows only `https://github.com/theMindDeveloper/KRNL0[/…]` and the feedback mail. The Calendar's Recorded / Habits switches were kept in the browser's localStorage, out of the store and out of reach of the CLI (rules 5 and 8); they are now calendar state set through `calendar.setLayers`, with `krnl cal layers [recorded|habits on|off] [--json]`. Older boards (no `layers`) show both.

## [2026-11-06] — Bug hunt batch 2: Welcome back never hides a slipped task; milestones survive a jump

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/launch/{catchup,milestones}.ts`, `src/renderer/components/Launch/WelcomeBack.tsx`, `docs/06-requirements/launch-experience.md` F20, tests `launch.catchup`, `launch.dialogs`
**Summary:** Welcome back hid every task that had a predecessor, expecting it to come along with its head — but when the head was already done, or not due yet, the slipped task was shown nowhere. A slipped task is now listed under a head only when an earlier task in its chain slipped too; otherwise it is a head itself. A follower that slipped carries its time, and "Today", "Tomorrow", "Unplan" and "Bring all" move it with its head (same day, its own time), so it doesn't come back on the next launch. Milestones fired only when a count was exactly 7, 30, 100…; a repaired day (1 → 8) or logged past time (99 → 101) skipped the card for good. Now the highest milestone reached within 3 days / 5 sessions shows, once; an old long streak does not replay earlier ones.

## [2026-11-06] — Bug hunt batch 3: feedback reports don't publish your account name

**Type:** Bug Fix (privacy)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/shared/feedback.ts`, `tests/unit/shared/externalUrl.test.ts`
**Summary:** Send feedback can attach the session's recent errors to a public GitHub issue. Error lines often hold file paths such as `C:\Users\<name>\Documents\krnl0\board.json`, which would publish the user's account name. Paths under a home folder now read `~` (Windows, macOS and Linux forms) and email addresses read `<email>`, in both the issue link and "Copy diagnostics".

## [2026-11-06] — UI loop batch 4: Clock schedule readable, last glyphs gone

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/ClockNode/index.tsx`
**Summary:** The Clock's schedule faded rows that were over to 42 % opacity (3.7:1); they now keep full opacity in a quieter ink, with their colour bar at half strength. Times and durations are 10 px at readable contrast, the active PM/AM chip uses the deeper rust so its label reads in light mode, and the header's ◉ / ▦ / ◷ characters are a dot and line icons. All nine Analytics pages were rendered in both themes and at the small station size; the Insights page still squeezes three cards across a very narrow window (noted for a follow-up: the page grid needs to reflow by width).

## [2026-11-06] — UI loop batch 5: month and year views readable, Pomo chips, steadier test runs

**Type:** Polish + Chore
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/{MonthView,YearView}.tsx`, `src/renderer/components/nodes/PomoNode/index.tsx`, `vitest.config.ts`, `tests/unit/renderer/launch.dialogs.test.tsx`
**Summary:** Month view: days of the neighbouring months were ink-4 at 35 % (2.8:1); now quieter but readable. Year view: days with a light acid fill kept light text (1.1:1); dark text now starts at about a third of the fill. Pomo: the active POMO/OBSERVE and session-length chips use the deeper rust so their paper-coloured label reads in light mode (3.9 → 5:1). Tests: render tests that cold-load the whole station took 15–18 s under a full parallel run with the dev app open and timed out at random; the timeout is 30 s, and the new Welcome back test loads its command module up front.

## [2026-11-06] — UI loop batch 6: Analytics Insights fits a small window

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/AnalyticsNode/{guide,PageNav}.ts(x)`, `src/renderer/analytics/charts/Radar.tsx`
**Summary:** The Insights page put three charts in a row; in a station-sized Analytics window each was ~110 px wide, so titles were cut ("MULTIVARIATI…") and the radar's and the pie's labels ran off the card. Insights now holds four charts two by two (radar, sources split, tasks × focus, focus by weekday) and the two distributions moved to a new **Day to day** page, one full-width chart per row. The radar keeps every label inside the chart: side labels grow away from the centre, small charts use short names (Streak, Active, Focus; the full name is the tooltip) and leave more room around the shape. Easy mode's page order is unchanged.

## [2026-11-07] — UI loop batch 7: launch dialogs — share list, icons on buttons, readable numerals

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/Launch/{ShareDialog,FeedbackDialog}.tsx`, `src/renderer/launch/milestones.ts`, `src/renderer/styles/launch.css`
**Summary:** Share a milestone: the chosen card wasn't marked (the list uses `aria-checked`, the shared style only knew `aria-pressed`) — it now has a background and an outline; habits with a 0-day streak are no longer offered as cards; Copy and Save image have icons. Send feedback: Copy diagnostics, Send by email and Continue on GitHub have line icons. What's new: the outlined 01/02/03 numbers use ink-3, and the current one the dark acid, so they read on the light dialog.

## [2026-11-07] — UI loop batch 8: Easy mode pass, time log navigation, habit month/year

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/AnalyticsNode/TimeLogHeatmap.tsx`, `src/renderer/components/nodes/HabitNode/{index,HabitPopover}.tsx`
**Summary:** The whole station was rendered in Easy mode in both themes. Analytics › Time per task: in a small window the week navigation wrapped "›" onto a line of its own, away from the dates; the arrows, the range and "This week" now wrap as one unit, with line chevrons. Habits in Month and Year view showed the streak as a rust "▲ 7"; they use the week view's flame and count (acid when going, grey at 0). The habit view popover now closes with Escape like every other popover.

## [2026-11-07] — UI loop batch 9: task card in light mode

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/TaskNode/index.tsx`
**Summary:** The task card's open, missed and done states were rendered in light mode: one shape, readable. The missed card's "Was Tue 3 · 18:00" used plain rust (3.9:1 on the light card) and now uses the same darker rust as Welcome back. The first-day tour was walked again in light mode: 14 steps, the card never covers its target, its text reads on the light card.

## [2026-11-07] — UI loop batch 10: line icons in the assistant menu and the ambient radio

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/ui/LineGlyph.tsx` (new), `src/renderer/components/{AmbientRadio/index,Orb/index,Assistant/Commander}.tsx`
**Summary:** The assistant menu's ▸, the orb's ▶/◆ and the ambient radio's ▶ ★ ☆ ♪ were text characters (the OS symbol font, off the baseline, ignoring the app's stroke). They are now line icons from one small shared `LineGlyph` (play, star, star outline, note, chevron, diamond) that follow the text colour; the radio's empty-saves hint says "tap the star".

## [2026-11-07] — UI loop batch 11: floating timer captions without glyphs

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/pocket/{DialView,CapsuleView,PocketApp}.tsx`
**Summary:** The dial's caption read "▶ Start", "● Working", "❚❚ Paused" in the OS symbol font; it now says Start, Working, Paused (the ring and colour already show the state). The capsule's Observe count-up arrow is a drawn arrow with an accessible name, and the collapsed box says "time log" without the ↑ character.

## [2026-11-07] — UI loop batch 12: drawn ticks, crosses and dots

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/ui/LineGlyph.tsx`, `src/renderer/components/nodes/{TaskNode/DoneCard,TodoNode/index,HabitNode/index}.tsx`, `src/renderer/components/{StatusBar/index,TopBar/CanvasSwitcher}.tsx`
**Summary:** The tick inside every done checkbox (Todo rows and the done task card) was the ✓ character; it is now a drawn tick that sits centred in the box in both themes. The Todo row's remove ✕, the canvas switcher's ✓ and ✕, and the ● dots in the Todo and Habit headers and the status bar's "connected" are drawn too (`LineGlyph` gained check, close, dot and an optional stroke weight).

## [2026-11-07] — UI loop batch 13: Pomo pickers and span log

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/ui/{LineGlyph,TaskInfoPopup,TaskTagPicker}.tsx`, `src/renderer/components/nodes/PomoNode/{DoingPicker,SpanLabeler,SpanLog}.tsx`, `src/renderer/components/nodes/TodoNode/TagPicker.tsx`, `src/renderer/components/nodes/AnalyticsNode/TimeLogHeatmap.tsx`
**Summary:** The Pomo pickers, span labeller and span log used ✕ ☑ ☐ ✓ characters; they are drawn icons now. A span or choice linked to a task shows a small task mark (it used ☐/☑, which read as "done"), and a ticked choice shows a drawn tick. In the span log the unnamed span's "name it…" was lime on a light row (1:1 in light mode) and now uses the dark acid. The tag pickers, the task popup's DONE and the time log's done mark are drawn too.

## [2026-11-07] — UI loop batch 14: capsule card dots

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/pocket/CapsuleView.tsx`
**Summary:** The floating capsule's hover card labelled "● Time log", "● working" and "● Deep work · pomo.025" with the ● character; the dots are drawn, in the label's colour, on the text's baseline.

## [2026-11-07] — UI loop batch 15: no low-contrast text left on the main screen

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/styles/tokens.css`, `src/renderer/components/AmbientRadio/index.tsx`, `src/renderer/components/nodes/{TodoNode/index,AnalyticsNode/index,CalendarNode/WeekView}.tsx`
**Summary:** The design checker's run on the live app went from 10 low-contrast texts this evening to 0: placeholders now follow the theme (the browser's grey was 3.9:1 on dark windows), and the ambient radio's "v03", "tap a chip to layer" and "tap to layer" are readable. The smallest labels grew about a point: Todo's PLAN (9 → 10 px), Analytics' range chips (9 → 10), the calendar's day headers and hour labels (9 → 10) and half-hour labels (7.5 → 8.5), all still fitting their space.

## [2026-11-07] — UI loop batch 16: the canvas opens clear of the tool rail

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/Canvas/fitPadding.ts` (new), `src/renderer/App.tsx`, `src/renderer/components/TopBar/index.tsx`, `docs/06-requirements/app-chrome.md` F7, `tests/unit/renderer/AppChrome.scenarios.test.ts`
**Summary:** Fitting the board to the window used an even padding, so the left column of cards opened under the floating tool rail (the design checker flagged their "Not started" lines as a third covered). The opening fit and the FIT button now use one padding that leaves 104 px on the left for the rail.

## [2026-11-07] — UI loop batch 17: last contrast misses

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/{AmbientRadio/index,StatusBar/index}.tsx`, `src/renderer/components/nodes/{ClockNode/index,TodoNode/index}.tsx`
**Summary:** A full re-audit of the canvas, Todo, Habit, Pomo and Calendar in both themes found the last texts under 4.5:1 and fixed them: the ambient radio's unselected chips, header buttons and volume number; the Clock's active AM chip (now the deeper rust, like PM); the Todo's over-plan time; and the status bar's Pomo value in light mode. Only disabled buttons stay dim, as intended.

## [2026-11-07] — UI loop batch 18: nothing opens under the minimap

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/Canvas/fitPadding.ts`, `docs/06-requirements/app-chrome.md` F7
**Summary:** After the tool-rail fix, the design checker's last covered text was a task card's time under the minimap in the bottom-right corner. The fit padding now also leaves the minimap's width on the right; the live page has no covered text left.

## [2026-11-07] — UI loop batch 19: Clock rows lose their left bars

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/ClockNode/index.tsx`
**Summary:** Each Clock schedule row was marked by a 4 px colour bar on its left edge (the design checker's "side-tab"; our rule is no left accent bars). The task's colour is now a dot, as in the Todo rows, so the same task looks the same in both windows.

## [2026-11-07] — UI loop batch 20: analytics change arrows

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/AnalyticsNode/SummaryHero.tsx`, `src/renderer/analytics/charts/KpiTiles.tsx`
**Summary:** The change against the previous period read "▲ 217%" / "▼ 12%" with text triangles; it is now a drawn up or down arrow in the same colour. With this the live design check of the main screen has no low-contrast text, no covered text and no left stripes left (184 findings this evening → 156; what remains is the app's 10–10.5 px label size, a design decision to review, not a bug).

## [2026-11-07] — UI loop batch 21: habit lane icons

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/HabitLaneNode/index.tsx`
**Summary:** The habit lane (a habit placed on the canvas) used ● ✓ ▲ ↻ characters for its colour, today's tick, its streak and its cadence; they are drawn now, and the streak uses the flame like every other habit view. Covered by the lane's tests; not render-checked (the preview board has no lane).

## [2026-11-07] — UI loop batch 22: habit lane checked on screen

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/HabitLaneNode/index.tsx`, `src/renderer/dev/previewBridge.ts`
**Summary:** The rich preview board now has a habit lane, so batch 21's icons were rendered and checked in both themes. Its running streak was rust; it is acid like every other habit view (grey at 0).

## [2026-11-07] — UI loop batch 23: the morning greeting no longer covers windows

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/DayMoments/index.tsx`, `src/renderer/styles/launch.css`
**Summary:** "Good morning." floated at the top centre over the Todo and Habit windows (it covered a Todo row and the Habits header) and stayed until dismissed or the board changed. It now sits bottom centre above the status bar and goes by itself after 15 seconds. Its entrance used the shared rise animation, whose transform dropped the -50% centring, so it slid in diagonally from the right; it has its own keyframes now and none under reduced motion.

## [2026-11-07] — UI loop batch 24: an 11px floor for all functional text

**Type:** Polish (readability)
**Branch:** `feat/pocket-pomo`
**Files changed:** ~70 renderer files (`fontSize` 9 / 9.5 / 10 / 10.5 → 11 in style objects, `font-size` in CSS), `src/renderer/components/nodes/{PomoNode,TodoNode,AnalyticsNode}/index.tsx`, `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `src/renderer/components/AmbientRadio/index.tsx`, `src/renderer/pocket/parts.tsx`, `src/renderer/styles/reactflow-theme.css`, `docs/04-visual-system/design-tokens.md`
**Summary:** The app's labels, meta rows, chips and buttons were 9–10.5 px, which the design checker counted as 147 legibility failures on the main screen. All functional text is now at least 11 px; only the Calendar's half-hour ruler marks stay at 10 px to fit their gutter, and SVG chart axes are unchanged. Done in stages with a backup, each measured: no clipped text, no overlapping controls, the Calendar layout check still passes, the tour still never covers its target, the top bar fits at 1280 px. Where bigger text crowded a layout, the layout gave way: the Pomo header keeps one line (the session code shortens first), Todo titles keep at least 72 px (PLAN becomes its icon and tag chips narrow in a small window), and Analytics card toolbars wrap under their title. The light Box look's skip button follows the theme. Live design check: 184 findings this evening → 12 (no low contrast, no covered text, no left stripes, no undersized functional text). The rule is now in design-tokens.md.

## [2026-11-07] — UI loop batch 25: every Pomo timer face checked at the new size

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/PomoNode/variants/{Mac,Outline}.tsx`, `src/renderer/dev/previewBridge.ts`
**Summary:** After the 11 px floor, all seven timer faces were rendered (`?face=` on the preview board). The Mac face's last axis label wrapped "25 / min" onto two lines; it stays on one. The Outline face's dimension line read "◄ 0 … 25 MIN ►" with text arrows; it reads "0 … 25 MIN". The ASCII face keeps its characters — text art is that face's identity.

## [2026-11-07] — UI loop batch 26: every frame style checked at the new size

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/PomoNode/index.tsx`
**Summary:** All eight frame styles (Pro, Classic, Synthesizer, Telemetry, KRNL dock, Blueprint, Macintosh, Submarine) were rendered after the 11 px floor: no clipped text. In the narrower Synthesizer frame the Pomo mode switch was squeezed to "OBSERV"; the switch no longer shrinks (the window title gives way instead) and its letter spacing is tighter now that the text is larger.

## [2026-11-07] — UI loop batch 27: the live design check is clean

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/AnalyticsNode/index.tsx`, `src/renderer/analytics/charts/PlanVsActual.tsx`, `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `src/renderer/components/nodes/PomoNode/variants/Blocks.tsx`, `src/renderer/components/{AmbientRadio/index,Assistant/Commander,Orb/index,ChassisLayer/SynthesizerChrome}.tsx`, `src/renderer/components/ui/RadialChooser/RadialChooser.css`, `src/renderer/styles/chassis.css`, `docs/04-visual-system/design-tokens.md`
**Summary:** The last 12 findings of the design check on the live app are fixed; it now reports none (184 at the start of the evening). Analytics charts were cards inside the window's card; they are sections with a hairline on top (acid when pinned). Chart legends and the time mix are 12 px body text. The Calendar's gutter is 40 px so its half-hour marks are 11 px like everything else. Blurred zero-offset glows (the Blocks face's "now" bar, the radio's slider and dots) are crisp rings or none, and every overshooting "bounce" easing (orb, assistant panel, radio panel, radial chooser, Synthesizer chrome) eases out instead. The rules are in design-tokens.md.

## [2026-11-07] — Bug hunt batch 4: the rest of today's back end

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/shared/{appState,whatsnew}.ts`, `src/main/{taskbar,pocket/index}.ts`, `tests/unit/shared/launch.rules.test.ts`
**Summary:** Reviewed every main/shared/sys file changed today (app state, backups, taskbar and menu bar, system timer, What's new, pocket window, main-window lookup, IPC and RPC, mini and launch CLI, the finished-cards sweep). Fixed: the board backup's file name was built from versions read out of app-state.json without checking them, so a damaged file could put a path (`../`) into it — only version characters are kept now. The taskbar reset its "what changed" key on every Pomo snapshot, so the thumbnail buttons were rebuilt whenever the snapshot changed but the controls didn't — measured in the real app: 9 rebuilds during three light/dark switches while a timer ran (flicker), 0 after the fix (a Todo edit alone does not change the snapshot, so it never triggered this); it resets only when the buttons are cleared. The floating timer grew down and right without re-fitting the screen, so near the bottom edge its hover controls or the "what was this?" card opened off-screen; it re-fits after every resize, and a first-time pocket opens on the primary display instead of the first one in the list. The 0.11 What's new lists today's visible changes (calendar layers, one task card shape, three pocket looks, readability).

## [2026-11-07] — UI loop batch 28: START is never cut off; nothing clipped at the bottom of a card

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/PomoNode/{index,FaceFit}.tsx`, `src/renderer/analytics/charts/PlanVsActual.tsx`, `tests/unit/renderer/pomoFaceFit.test.ts`
**Summary:** A new render check (text partly hidden by its clipping container) found that in the default station layout the Pomo's content was taller than its slot: the task picker was cut in half and **START was hidden** — 148 px below the edge at 1280×800, 113 px at 1440×900, still just under it at 1920×1080 (it was like this before today too). Now a short slot sheds secondary rows first ("log past time", then the cycles strip, then the session dots; set by the slot's height, tested) and the timer face is fitted to the room left (scaled as a whole, never below 45 %), so the face, the time, the task picker and START always show — checked with the Blocks, Vapor and LCD faces and in Observe. "Log past time" stays on the Calendar and in the CLI. The same check found "Where the time went" cutting its last line in a narrow Analytics card; there it is one line per part (On a task / Untagged / Break and the share, minutes in the tooltip).

## [2026-11-07] — UI loop batch 29: nothing cut off in a small Analytics window

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/AnalyticsNode/SummaryHero.tsx`, `src/renderer/analytics/charts/TagCharts.tsx`, `src/renderer/components/nodes/PomoNode/FaceFit.tsx`
**Summary:** The cut-off check, run on every Analytics page at the station size, found the Summary's last sentence cut and the tag ranking wrapping its count onto a second line. The Summary's four tiles are a 2 × 2 grid in a narrow window (never 3 + 1, never "6h / 15m" on two lines) and its sentences scroll inside the card with a soft fade at the edge; each tag's "1h40 · 27% · 2" stays on one line (task count spelled out in the tooltip). The fitted Pomo face keeps 4 px spare so big digits never touch its edge. Every screen now passes the cut-off check (the Calendar's scrolled hour labels under the sticky header are by design).

## [2026-11-07] — Loop close-out: last hour labels, and tests that guard what can't be screenshotted

**Type:** Bug Fix + Tests
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, tests `tests/unit/main/taskbar.test.ts` (new), `tests/unit/shared/pocket.test.ts`, `tests/unit/renderer/uiSounds.test.ts`
**Summary:** The Calendar's hour window shows whole hours plus a leftover slice, and the slice's hour label ("13", "09") was cut in half at the bottom edge — on the first page, after paging and after wheel paging. Only whole hours in the window are labelled now (the slice keeps its lines); checked by paging through every window at three sizes with the pager and the wheel. Three fixes that a screenshot can't show now have tests, each confirmed to fail against the old code: the Windows taskbar sets its thumbnail buttons once per state (not on every snapshot) and restores them after a stop (also checked in the real built app through a test harness: 9 → 0 rebuilds during three theme switches while timing); a pocket that grows near the screen edge, opens for the first time or was left on an unplugged monitor is placed on screen; every UI sound hit starts at 0, reaches its level 4 ms later and ramps out at its end, and every hit played faster than 1.15× goes through a 7 kHz low-pass (the click-free tick).

## [2026-11-07] — Verified in the real app: taskbar, floating timer, click-free sound

**Type:** Verification (no code change)
**Branch:** `feat/pocket-pomo`
**Summary:** The fixes a screenshot can't show were checked against the real thing, each with the old code as a control. **Taskbar** — the built app run through an Electron test harness (isolated board and profile, `KRNL0_BOARD_DIR` / `KRNL0_USER_DATA`), recording every taskbar call: START sets the thumbnail buttons once (Break, Stop), STOP clears them, START again restores them; three light/dark switches while timing rebuilt them 9 times with the old code and 0 times with the fix. **Floating timer** — same harness: it opens on the primary display; parked at the bottom edge and grown by hover (200 → 256 px) it moves up and stays inside the work area; with the old code it ended at y = −248, off screen. **Sound** — the real sound engine rendered in Chromium through an OfflineAudioContext and measured: the first/last 0.18 ms of every hit stay within 5–11 % of peak with the fades, against 47–89 % (audible clicks) with the fades removed.

## [2026-11-07] — macOS menu bar covered

**Type:** Tests
**Branch:** `feat/pocket-pomo`
**Files changed:** `tests/unit/main/taskbar.test.ts`
**Summary:** The menu-bar timer can't be run on this Windows machine, so its code path is exercised with the platform set to macOS and the Electron `Tray` recorded: the time shows while timing and counts down every second, the menu has the state line, the controls, the Floating timer switch and Open KRNL0, the menu is rebuilt only when the state changes (an open menu isn't closed every second), the paused title changes, and the menu-bar item goes away when the timer stops. Only Apple's own drawing of it is left unchecked.

## [2026-11-07] — Calendar: the shelf, drag to unschedule, line up, and a track for tracked time

**Type:** Feature + Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/{WeekView.tsx,dayBlockLayout.ts,lineUp.ts}`, `src/renderer/styles/reactflow-theme.css`, `src/sys/{parser.ts,SysFacade.ts,commands/cal.ts}`, `src/shared/cli/commandRegistry.ts`, `src/renderer/components/ui/LineGlyph.tsx`, `src/renderer/components/Tour/tours.ts`, 21 renderer files (11 px floor, drawn arrows), `docs/06-requirements/calendar-clock-visuals.md` (F15, F16, F28, F29), tests (`WeekView.shelf.test.tsx`, `dayBlockLayout.test.ts`, `calendar.lineUp.test.ts`, `cal.lineup.test.ts`)
**Summary:** The user's report: the "+2" tile looked bugged, and a task hidden in it could not be dragged out. Four drafts were put on the design canvas (A shelf + rail, B spread + day rings, C line up + day tape, D lens + "did" lane); this builds A plus C's line-up. **Shelf (F28):** a clash whose lanes would be under 96 px is one block over the clash's time with a named row per plan (dot, full name, done tick / missed ring) — every row clickable and draggable; rows tighten, then the header goes, before the shelf ever grows over the next plan; no row is ever hidden; a Station-width day draws rows as colour bars. The "+N" chip is gone. **Unschedule:** dragging any plan from the calendar shows "Drop here to unschedule" at the bottom; dropping there sends it back to Todo. **Line up:** when two or more chains in a shelf are still ahead, the header offers Line up — back to back in start order, never before now, a chain moving as one (found by testing: chain followers have no time of their own). CLI twin: `krnl cal lineup <task> <task> [...]`. **Tracked time (F29):** a track on each day's right edge that fills with recorded spans (running span: crawling stripes), and the day's total in the header. **Rule sweep:** every functional label under 11 px raised to 11 (21 files) and text arrows (‹ › ▾ ← → ↘ ↑ ◀ ★ ◆) in controls replaced with drawn icons. Verified in the browser: drag-to-unschedule clears the task's time; line-up gives 15:00 chain, Physics 16:30; measured no cut names, no hidden rows, no overlaps, contrast passes in both themes.

## [2026-11-07] — Year view fits any panel; last contrast fix

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/YearView.tsx`, `src/renderer/components/nodes/TodoNode/index.tsx`, `tests/unit/renderer/calendar.yearLayout.test.ts`
**Summary:** Found by the post-sweep audit: the year view drew 7.5 px day numbers in 365 cells (some at 1.1:1 contrast) and laid months out 7 + 5. Cells are now a plain heat map (date, minutes and plans in the tooltip and aria-label), and `yearLayout` measures the panel and picks 2, 3, 4 or 6 months across with the biggest square cells that fit both ways — measured at six panel sizes, no month outside the box; the weekday letters (11 px) hide below 12 px cells. The Todo "N overdue" badge mixes rust toward the ink so it passes 4.5:1 in both themes.

## [2026-11-07] — Bug hunt: stuck unschedule strip, "Bring to today" landing in the past

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `src/renderer/launch/catchup.ts`, `src/renderer/components/Launch/WelcomeBack.tsx`, `docs/06-requirements/launch-experience.md` (F27), tests
**Summary:** Sweep of every screen (all panels, calendar views, help menu, settings, tour, analytics pages, both layouts) with console capture: no errors. Code review found two bugs. (1) Dropping a plan on another hour can unmount the element it was dragged from, so no `dragend` arrives and the unschedule strip stayed up — any drop or dragend in the window now ends the drag. (2) Welcome back moved slipped tasks to today at their old time: back at 19:00, a 09:00 task landed in the past and read "Missed" at once. `landingTimes` now lines those up from the next quarter hour, in order, each as long as its plan; times still ahead are kept; Tomorrow keeps every time (F27).

## [2026-11-07] — Calendar: clashing plans as letter bars; tracked-time track at the left

**Type:** Feature (revision)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/{WeekView.tsx,dayBlockLayout.ts,clashLabels.ts}`, `src/renderer/styles/reactflow-theme.css`, `src/renderer/components/Tour/tours.ts`, `docs/06-requirements/calendar-clock-visuals.md` (F15, F16, F28, F29), tests (`WeekView.clash.test.tsx`, `dayBlockLayout.test.ts`, `calendar.clashLabels.test.ts`, `schedule-menu-parity.test.tsx`)
**Summary:** The user's direction after seeing the shelf: no "N at once" list — clashing plans side by side as in draft C, named by their first character, with the rail at the left as in draft A. The shelf is gone: a clash too narrow for names keeps every plan as its own slim bar at its own time, labelled by `clashLabels` (first character; plans of one clash that share it add the first letter of their last word — RA, RB, RC — then more letters, then a number; never two equal names; skips symbols, works for any script). Letters show only where they fit (one line tall, wide enough), centred in short bars. Line up is a tab above the clash (or below), drawn only where it covers no plan or habit pill. The tracked-time track moved to the left and sits 9 px from the day line, 2 px from its own plans, so it reads as part of its own day (the user found the right-edge rail ambiguous). Also: a habit pill cut by the edge of the shown hours waits for its page instead of hiding under the hour pager. Measured at 1100, 1800 and Station width, dark and light: no cut letters (both directions), no overlapping plans, the tab covers nothing, the track never under a plan.

## [2026-11-07] — Tracked-time lane as a slot; Station calendar readable; pocket stays on screen

**Type:** Bug Fix + polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `src/renderer/styles/reactflow-theme.css`, `src/main/pocket/index.ts`, `docs/06-requirements/calendar-clock-visuals.md` (F29), `tests/unit/renderer/schedule-menu-parity.test.tsx`
**Summary:** The user asked for draft A's rail look back, on the left, "with a hole for the lane": the track is now a recessed slot (darker than the day, inner shadow, hairline edge) 4 px in from the day line, filled by the day's spans 2 px inside its walls; plans start 3 px after it. Station-width days (under 70 px): a 6 px slot, letter bars 1 px apart instead of 2 + 3 px, day names shortened to "S 7" (full names ran into each other), and a block too narrow for a name shows its first character instead of "O…" — measured: no bar under 6 px, no cut letters. Back-end review of the day's main-process work (pocket, app state, taskbar, IPC, CLI): one gap fixed — the floating timer is pulled back on screen when a monitor is removed or the display layout changes.

## [2026-11-07] — Shared/CLI review; real-app check of the calendar

**Type:** Bug Fix + verification
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/shared/feedback.ts`, `src/sys/commands/launch.ts`, `tests/unit/shared/launch.rules.test.ts`
**Summary:** Review of today's shared and CLI code. Feedback: a title of any length is now cut to 120 characters in the shared link builder (the dialog already stopped there, `krnl feedback` did not) — before, a pasted paragraph made a link the app refuses to open, with no message; a test feeds 15,000 characters and checks both links stay openable. `krnl feedback --kind idae` now says the kind is unknown instead of filing a bug report. Real-app check (production build in an Electron harness on an isolated copy of the worktree board, three tasks set to clash, window captured with `capturePage`): letter bars and the tracked-time lane render, one Line up tab, no "+N" chips, no console errors; the splash leaves 1.5 s after load. Station panel widths measured equal at 1280/1440/1920 (the right-edge overlap seen is the docked radio's edge tab).

## [2026-11-07] — Crash fix: deleting a habit with a lane took the app down

**Type:** Bug Fix (critical)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/HabitLaneNode/index.tsx`, `src/renderer/components/nodes/CalendarNode/MonthView.tsx`, `src/renderer/components/nodes/TodoNode/index.tsx`, `src/renderer/styles/reactflow-theme.css`, tests (`HabitLaneNode.orphan.test.tsx`, `pen-year-clock-optional-time.test.tsx`)
**Summary:** Found by a worst-case-data sweep (hostile names, 60 extra todos, a 999-day streak, then an empty board, on every screen). Emptying the habits — or deleting any habit that has a lane on the canvas — put the whole app on the "RENDER ERROR" screen (Maximum update depth exceeded). Bisected to the habit lane's orphan cleanup: it wrote a fresh board object on every render even after the lane was gone, and the canvas keeps the lane mounted a moment longer, so each write re-rendered it into the next. It now removes itself only while it is on the board, once; a regression test keeps it mounted through re-renders and checks one write and no loop (it fails on the old code). Also from the sweep: the month cell's fit used 15 px chip rows from the old 10 px text — at 11 px a row is 18 px, so "+N more" ran into the habit dots (now measured; test updated); in a Todo row under 330 px the tag shows its colour dot only so the task name is not cut to a few letters.

## [2026-11-07] — User-flow sweep; "Remove" becomes "Unschedule"

**Type:** UX fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/TaskPopup.tsx`
**Summary:** Drove the main flows in the preview and checked the board after each: tick a Todo row (task done), tick and untick a habit, open a plan's popup and take it off the calendar, drag a Todo row onto the calendar (scheduled at the drop slot), start and stop the Pomo (a span recorded, idle) — all pass, no console errors. One finding: the popup's action said "Remove" in warning red, which reads as delete, though it keeps the task. It is "Unschedule" everywhere else (drop strip, right-click menu, `krnl task unschedule`), so it now says Unschedule, in the neutral colour, with "Take it off the calendar — the task stays in your Todo" as its tooltip.

## [2026-11-07] — Pomo: a compact face for short windows; pocket names never lost

**Type:** Bug Fix + UX
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/PomoNode/{FaceFit.tsx,index.tsx}`, `src/renderer/pocket/PocketApp.tsx`, `tests/unit/renderer/pocket.askCard.test.tsx`
**Summary:** Review of the face fitter: measured every face at 1280×720, 1440×900 and 1920×1080 — the scale is stable (no feedback loop) and START is always visible, but at 1280×720 the faces sat at 0.45–0.53 scale, which puts their 11 px labels at about 5 px, and the Vapor glass was clipped. Under 0.85 the panel now shows a compact face (the time at 34 px, a thin progress line, one 11 px state label: Ready / Focus / Paused / Break, or Observing / On break) and returns to the full face when there is room. Floating timer: picking a tag on "What were those 25m?" hid the card even if KRNL0 refused the name; now the card comes back so the name is not lost (UI test for both outcomes).

## [2026-11-07] — Pomo face labels hold the 11 px floor at any scale

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/PomoNode/FaceFit.tsx`, `src/renderer/components/nodes/PomoNode/variants/*.tsx`, `src/renderer/components/nodes/PomoNode/ObserveDash.tsx`
**Summary:** A face shown between 85 % and 100 % size still drew its 11 px labels at 9–10 px (and Vapor's glass ticks were 7.5 px). The fitter now sets `--face-label` to 11 px ÷ scale, and the faces' labels (17 places) use it, so after the scale they read at 11 px while the big digits scale. Measured every face at 1280×720, 1440×900, 1920×1080: no label under 11 px, the scale holds one value (the bigger labels do not feed back), START always visible.

## [2026-11-07] — Habit repair asks again the next day

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/HabitNode/index.tsx`, `tests/unit/renderer/HabitNode.repair.test.tsx`
**Summary:** Review of the "Did it yesterday?" row: saying no hid the row with a plain flag that was never reset, so with KRNL0 left open overnight the next missed day was never offered. It now remembers the day that was declined; a later missed day asks again. Test walks the sequence across midnight (fails on the old code).

## [2026-11-07] — Review of the calendar rework; overrun strip on narrow bars

**Type:** Polish
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/WeekView.tsx`
**Summary:** Line-by-line review of the session's WeekView changes (drag lifecycle, letter labelling and fit, Line up placement and chain units, track geometry): one flaw — the 3 px overrun strip took half of a 6 px Station letter bar; it now shows on bars 12 px and wider (the tooltip still says "+X over"). Also this session, checked with no change needed: every day-based view rolls over at midnight with the app open; every button, field and image on the main screens and today's dialogs has an accessible name.

## [2026-11-07] — Front-end review: finished cards, day recap, pocket bridge, launch flow; share on a new board

**Type:** Bug Fix + review
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/launch/milestones.ts`, `src/renderer/components/Launch/HelpMenu.tsx`, `src/renderer/styles/launch.css`, `tests/unit/renderer/launch.catchup.test.ts`
**Summary:** Read through today's logic modules: finished-cards grouping (union-find, all-done rule), the day recap (once a minute, not on every edit), the pocket bridge (sends only when the Pomo, Todo or mode changes), the launch flow (one dialog at a time; milestones can't fire twice) — correct. One finding: on a new board Share offered a "0 focus sessions" card; it now needs at least one session, and with nothing to share the Help menu says "after a streak or focus session" on a disabled item instead of a button that does nothing.

## [2026-11-07] — Task card reads "missed" at once when planned into the past

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/TaskNode/index.tsx`
**Summary:** Review of the task card: its minute clock only runs while the task has a time, and held the time the card mounted. A card unscheduled since the morning and then planned into an earlier slot showed as not missed for up to a minute. The clock is now refreshed on every (re)schedule. Rest of the card (pomo subscription by field, timers only while needed, the one-shot done pop) is correct.

## [2026-11-07] — Review of the presentational files; no NaN rings

**Type:** Bug Fix (hardening)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/PomoNode/display.ts`, `tests/unit/renderer/pomoFaceFit.test.ts`
**Summary:** Pass over the presentational files changed today (pocket views and model, settings sections, launch dialogs) for division by zero, unchecked indexing and date parsing. One finding, probed with a zero-length config: `calcRemainingPct` returned NaN for 0/0, which blanks every ring and fill in the faces and the floating timer. The UI and CLI clamp the session length to positive, but board.json loading accepts any number, so a hand-edited 0 could reach it; it now reads as nothing left (test). The rest guard their maths (`Math.max(1, …)`) and their lookups.

## [2026-11-07] — Ambient Radio no longer covers the Calendar; tucking is remembered

**Type:** Bug Fix (first run)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/AmbientRadio/index.tsx`
**Summary:** Seen in the real-app capture with a fresh profile: the radio opened floating at the top right, exactly over the Station's Calendar, for every new user — and tucking it to the edge was not remembered (the edge state started as floating on every launch), so it came back over the Calendar after each restart. A first run now starts docked as the 14 px edge tab; the docked side is saved (`krnl0-ambient-radio-edge`) and restored against the current window's edge. The header's "−" text glyph is a drawn icon ("Tuck to the edge"). Checked in the preview: first run docked and clear of the Calendar; open → floating; tuck → reload → still tucked.

## [2026-11-07] — Sweep: emoji-safe feedback links, letterless clash names, Welcome back lands in free time

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/shared/feedback.ts`, `src/renderer/components/nodes/CalendarNode/clashLabels.ts`, `src/renderer/launch/catchup.ts`, `src/renderer/components/Launch/WelcomeBack.tsx`, `src/sys/commands/cal.ts`, tests (`launch.rules`, `calendar.clashLabels`, `launch.catchup`)
**Summary:** Code sweep of today's merges. (1) Feedback links cut long titles and bodies by UTF-16 units, so an emoji at the cut was split in half and `encodeURIComponent` threw — the Send button did nothing; cuts now land on whole characters. (2) Two clashing plans whose titles have no letter or digit (an emoji-only title) crashed the Calendar's letter naming; they are now numbered `#1`, `#2`. (3) Welcome back's "move to today" lined slipped tasks up from the next quarter hour without looking at plans already there, so it could create a new clash; slipped tasks now land in free time around the day's other open plans. (4) `krnl cal lineup` now refreshes the board and says how many moves landed when a later move fails. (5) Feedback diagnostics cut a Windows account name at its first space, so `C:\Users\John Smith\…` posted "Smith" publicly; the whole name up to the next separator is now replaced. Each fix has a test that fails on the old code.

## [2026-11-07] — Letter bars are never unnamed in a narrow week

**Type:** Bug Fix (visual)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `src/renderer/styles/reactflow-theme.css`, `src/renderer/components/nodes/CalendarNode/__tests__/WeekView.clash.test.tsx`, `docs/06-requirements/calendar-clock-visuals.md` (F28)
**Summary:** Seen in a 700 px and a 520 px calendar render: in a Station-width week the clash bars "RA" and "RB" were ~16 px wide, under the 18 px the old check asked for two letters, so they showed as empty bars. The width check now uses the real 11 px mono letter width (6.6 px), and a name still too wide stands its letters one above the other (never rotated) when the bar is tall enough. Checked in the preview at both widths: every bar named. Test stubs a 500 px calendar and fails on the old code.

## [2026-11-07] — Recorded time: a strip on the day line, no dark lane, no gap

**Type:** UI Change
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `src/renderer/styles/reactflow-theme.css`, `tests/unit/renderer/schedule-menu-parity.test.tsx`, `src/renderer/components/nodes/CalendarNode/__tests__/WeekView.clash.test.tsx`, `docs/06-requirements/calendar-clock-visuals.md` (F29)
**Summary:** User feedback: the recessed dark lane looked heavy, and the 4 px gap before it made it unclear which day it belonged to. Four drafts went to the design canvas ("Recorded time · four ways"); this builds the part drafts A and C share — tracked time is a 5 px strip of colour flush on the day's own left line (6 px day, 4 px Station), drawn only where time was tracked, with no slot and no gap. Plans now start 8 px from the day line (was 16). Untagged time uses a deeper lime in light mode (pale acid vanished on paper). Short 12 px bars now show their letter too ("Call the dentist" was a blank bar). Checked in the preview: wide and narrow week, light and dark — every strip at 0 px from its day line.

## [2026-11-07] — Hour pager moves out of the grid

**Type:** Bug Fix (visual)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `src/renderer/components/nodes/CalendarNode/__tests__/WeekView.hourPager.test.tsx` (new), `docs/06-requirements/calendar-clock-visuals.md` (F15)
**Summary:** Seen in the real-app capture: the "‹ 11–17 ›" pill floated over the grid's bottom-right and covered Sunday's letter bars (G, D, P), so they could not be read or clicked. The pager is now two chevrons in the empty corner above the time gutter — up for earlier hours, down for later — next to the hour labels it moves (the range is in their aria-labels; the gutter already shows the hours). Checked in the preview: the corner holds the chevrons and the grid's bottom-right is clear.

## [2026-11-07] — Radio follows window resizes; Welcome back keeps whole chains clear

**Type:** Bug Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/AmbientRadio/index.tsx`, `src/renderer/components/Launch/WelcomeBack.tsx`, `tests/unit/renderer/ambientRadio.resize.test.tsx` (new)
**Summary:** (1) The Ambient Radio never listened for window resizes: a tab tucked to the right edge stayed at its old x, so after maximising it floated mid-screen and after shrinking it was out of reach. A tucked tab now follows its edge and a floating radio is pulled back into view. (2) Welcome back's "move to today" now reserves room for a slipped task's untimed followers too (they run right after it), so the chain does not land on another plan.

## [2026-11-07] — 11 px floor reaches SVG text: Analytics charts, Clock readout, pie menus

**Type:** UI Fix (readability)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/analytics/charts/*.tsx` (CalendarHeatmap, CumulativeLine, DonutChart, DowBars, DowHourMatrix, Histogram, HourLine, MonthBars, PlanVsActual, Radar, Scatter, StackedArea, TagCharts), `src/renderer/analytics/charts/common.ts`, `src/renderer/components/nodes/ClockNode/index.tsx`, `src/renderer/components/ui/PieMenu.tsx`, `src/renderer/components/Canvas/PenWheel.tsx`
**Summary:** A panel audit in the preview found SVG text still at 8–9.5 px (the earlier 11 px pass covered CSS only): every Analytics axis, tick and legend label, the Clock's digital readout (8 px × 1.27 scale = 10.2 px), and the canvas wheel's labels and shortcut letters. All now render at 11 px or more; `MIN_LABEL_FONT` is 11 (a label that does not fit is hidden and its value stays in the tooltip, never shrunk). The bigger text then collided in places, each fixed and re-checked by screenshot at 760 and 520 px: the cumulative-line and stacked-area legends moved out of the SVG into wrapping HTML rows (fixed 96/64 px steps no longer fit); heat-map month labels and the Hours "peak" legend got room above their plots; the radar's label fitting uses the real 11 px width (side labels were cut at 520 px) with more space for the number under each; the histogram median no longer sits on the axis title; wheel labels are cut to their wedge and the shortcut letters moved to each wedge's outer corner (they sat on "Media" and "Sticky"). An automated overlap/outside check over every Analytics chart is clean at both widths.

## [2026-11-07] — Recorded time is the Clock rail (A4: a track that fills up to now)

**Type:** UI Change
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/WeekView.tsx`, `src/renderer/components/nodes/CalendarNode/NowLine.tsx`, `src/renderer/styles/reactflow-theme.css`, `tests/unit/renderer/schedule-menu-parity.test.tsx`, `docs/06-requirements/calendar-clock-visuals.md` (F29)
**Summary:** After the dark recessed lane and then the flush edge strip were both rejected ("cut off from the left side"), ten drafts went to the design canvas; the user liked the Clock rail best, and it was refined into four versions built from the Clock's own parts. A4 ships: a track one shade lighter than the day (the Clock's ring track), 4 px inside the day's own line, rounded at both ends; recorded focus fills it with round caps in its tag colour; the track only covers time that has passed (full on past days, up to a "now" knob today, none on days ahead), so it fills up like the Clock's ring and no empty bar runs down future days (which read as a scrollbar). The now line drops its own dot while the knob shows, and the knob uses the now line's red. On light paper the track is half as strong. All four versions sit behind one constant (`RAIL_STYLE`). Checked in the preview: wide week, Station-width week and day view, dark and light, now knob paged into view. Follow-up check on last week (nothing recorded) showed seven bare tracks reading as scrollbars again, so a past day with no recorded time draws no track at all (today keeps its track for the knob); test added.

## [2026-11-07] — Tall calendar plans show their whole title

**Type:** UI Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/WeekView.tsx`
**Summary:** Plans with room for their name and time cut the title at one line ("Outline thesi…", "Draft section…") even in blocks an hour tall. A block at least 48 px tall now gives its title two lines (clamped, never spilling) with the time still under it. Checked in the preview at 1100 and 760 px. Follow-up: the time line under a missed plan was cut ("Missed · 09:30–1…"). The time now comes first and never cuts; "Missed", "started 5m late" and "took 1h20" follow as whole pieces that wrap under it, and a block shows only as many whole lines as fit under its title (no sliver of a wrapped line). Tall title-only blocks (narrow columns) also wrap the title to two lines. Checked at 900, 1100 and 1440 px.

## [2026-11-07] — Month view hides nothing behind "+N"

**Type:** UI Fix
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/nodes/CalendarNode/MonthView.tsx`, `src/renderer/components/nodes/CalendarNode/__tests__/MonthView.test.tsx`
**Summary:** Month view hid plans behind "+10 more" in a cell and "+9" in the TODAY strip, and habit dots behind "+2" — against the rule that every item stays readable and draggable. A full day now keeps every plan as its own chip in a list that scrolls inside the cell (fading at its foot when there is more); the TODAY strip shows every plan of today and scrolls sideways (fading at its right edge); every habit keeps its dot, wrapping to a second row. Days of the month get a faint fill so each cell — and the dots at its foot — reads as one day (before, a row of dots looked like it belonged to the next row's date). Checked at 1100 and 520 px, dark and light; tests updated.

## [2026-11-07] — Design and use-case review of the whole app

**Type:** Docs (research)
**Branch:** `feat/pocket-pomo`
**Files changed:** `docs/research/design-usecase-review-2026-11-07.md` (new)
**Summary:** After the user found that repeating habits cannot be untimed (#217), every feature's data model and commands were checked against how people actually plan, not only against their specs. Main findings: time is mandatory where life has none (untimed habits, date-only plans — a Month drop invents 09:00 and the plan reads "missed"), no deadlines or repeating tasks, habits cannot be "3× a week" or have amounts or rest days, the UI can only hard-delete a habit (archive is CLI-only), and there are no reminders. A proposed priority order is in the doc; each item needs an ADR, a requirements doc, a migration and CLI commands.

## [2026-11-07] — CLI sweep: `task list` shows when each task is planned

**Type:** Bug Fix (CLI)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/sys/commands/task.ts`, `tests/unit/sys/task.list.schedule.test.ts` (new)
**Summary:** End-to-end run of today's CLI commands on a first-run board (`todo add`, `task schedule`, `cal lineup`, `habit add/archive`, `feedback`): all behaved, and bad input was refused with clear messages. One gap: `task list` never said when a task was planned, so a `task schedule` or `cal lineup` could not be checked from the CLI. Each row now ends with `@ YYYY-MM-DD HH:MM` when scheduled. Also found: there is no `habit unarchive` — noted with the "habit archive in the UI" item from the design review.

## [2026-11-07] — 0.11 "what's new" lines match what ships

**Type:** Docs (user-facing text)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/shared/whatsnew.ts`
**Summary:** The 0.11 notes (`krnl whatsnew`) still described recorded time as "a thin bar beside each day". They now describe the Clock rail (a track at the left of each day that fills up to now), the letter bars with Line up and the drag-to-unschedule strip, and the month view that never hides a plan behind "+N". Main-process changes from today (taskbar button flicker fix, safe backup names, pocket refit) were re-read in the sweep; no issues.

## [2026-11-07] — The orb's greeting fits how long you were away

**Type:** Bug Fix (copy)
**Branch:** `feat/pocket-pomo`
**Files changed:** `src/renderer/components/Orb/index.tsx`, `tests/unit/renderer/orb.greeting.test.ts` (new)
**Summary:** The opening line was drawn at random from a pool that includes "been a minute." and "welcome back. the board's where you left it." — so it could say so 30 seconds after a restart. Those two lines now come up only after 4 hours or more away (`awayMs` from the launch info); otherwise one of the others ("hey.", "need anything?", …). `pickGreeting` is pure and tested.
