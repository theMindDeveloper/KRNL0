# Changelog

All notable changes to krnl0 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] — 2026-11-02

### Added
- **Analytics window** — Analytics is a fixed mother window: its own panel beside the terminal in Station mode, a fixed window in Canvas mode. Eight full-window pages switched by toolbar icons (Summary · Activity · Year · Hours · Plan vs actual · Time by tag · Insights · Habits), a plain-language summary, a full-window settings view, and no scrolling anywhere.
- **Pen tool** — pen, marker, highlighter, arrow and eraser with colours and sizes (perfect-freehand), a two-ring tool wheel on right-click, a pen-tip cursor, and middle-drag pan.
- **Canvas wheel** — right-click empty canvas for a radial menu with nested panels: Task · Habit · Note · Sticky · Shapes · Media · Frame · Pen.
- **Brainstorming** — paper sticky notes (handwritten, ruled lines, red margin) and shapes (rectangle, ellipse, diamond) with a style bar.
- **Drop or paste anything** — video, audio, PDF, YouTube/Vimeo/SoundCloud links, websites and any other file become cards (react-player, pdf.js); links can switch to plain text. Files import instantly by path and stream with seeking.
- **Calendar** — year view, readable parallel tasks ("+N" chips), pomo sessions as background highlights, right-click menus shared with the Clock, optional task times (open-ended tasks fade out).
- **Clock** — Big Clock (dial-only) mode, bigger dial, easy-to-hit task arcs.
- **Task tags** — every task is auto-tagged (Code, Study, Writing, Reading, Meetings, Admin, Planning, Health, Chores, Social, Creative); click a tag to change it or create your own. Finished tasks move to a Done list, then an Archive by day.
- **Habits & Routines** — habits double as recurring events: set a repeat (every day, weekdays or picked days, time, length) when adding one or when dropping it on the Calendar.
- **Drawings are objects** — select, box-select, move and delete strokes like any node; they draw above everything.
- **Pomo** — icon controls (Stop · Break · Pause/Resume/End break) and a "Count stopped sessions" setting instead of a separate Reset.
- **Show on calendar** — right-click a scheduled task to jump to it on the Calendar.
- **Movable dock** — drag it to the top, middle or bottom of the left edge, or bottom centre, with shortcut hints on every button.
- CLI: `analytics open|close|toggle|summary`, `pomo segments|delete-segment`, `clock dial`, `cal view`, `draw list|delete|clear`, `media add|list`, `text add --sticky|--shape`, `todo tag`, `todo tags list|add|remove`, `todo archive`, `analytics show --view tags`, `pomo config --count-stopped on|off`.

### Fixed
- Light/dark is always available (and in Settings); the gear no longer looks like the theme button.
- Mother windows no longer flash a selection ring when clicked; easier node connections (drop anywhere on a node).
- Media sits behind other nodes and notes sit on top; Month-view cells stay readable.
- Canvas mode: nodes never hide behind the window row, and switching Station ↔ Canvas keeps the view on the same spot.
- Drags no longer get stuck over YouTube or website cards; YouTube Mix links play; cards no longer blur on hover.
- Dropping a task on another calendar task puts them side by side; dropdown lists are readable in dark mode.

## [Unreleased]

### Added

- App updates (#211, Decision 36): Windows installs download in the background and install on restart (or on quit); macOS/Linux show a download link. Status bar, Settings → Updates and `krnl update status|check|install|open`. Release workflow uploads `latest.yml` and builds Windows on `windows-2022`.
- Terminal node: `krnl` CLI bridge — full UI parity from inside the PTY's shell, named-pipe/UDS transport with per-launch token auth (#108)
- Terminal MOTD banner with ASCII KRNL0 logo, dynamic version, compact-form fallback for narrow terminals (#108)
- Generated `krnl help` command from a single command registry (`src/shared/cli/commandRegistry.ts`) — new commands auto-document (#108)
- `term.*` FSM commands (`setShell`, `setFontSize`, `setTitle`, `clear`) wired through `commandDispatch` (#108)
- `krnl version`, `krnl whoami` subcommands (#108)
- Phase 2 UI-parity surface: `node.move/resize`, `viewport pan/zoom/reset`, `undo/redo`, `select/marquee`, `edge add/remove/list`, `board show/save/load/reset`, `theme set` (#108)
- Infinite canvas with pan (middle-mouse + space+drag) and zoom (focal-point wheel) — Issue #3
- NODE_REGISTRY dispatch pattern routing node.kind to typed React components — Issue #4
- PomoNode: 25-min FSM timer (idle/running/break), session persistence via startedAt, history log — Issue #5
- TodoNode: flat item list with add/toggle/delete, render-time sort (undone first), completedAt tracking — Issue #6
- HabitNode: sparse YYYY-MM-DD log, Mon-Sun grid, streak calculation (safe from yesterday), archiving — Issue #7
- TerminalNode: xterm.js + node-pty wired via sessionId-keyed IPC channels — Issue #8
- electron.vite.config.ts + contextBridge preload — npm run dev now functional

### Infrastructure

- vitest.config.ts, PR template, GitHub labels, milestones (week-2-canvas-nodes, week-3-edges-children)
- 116 unit tests covering all Phase 2 node logic

### Fixed
- perf: replace `onMove` → `onMoveEnd` to stop 60fps Zustand viewport writes (#perf)
- perf: StatusBar zoom now reads from RF internal store (`useStore`) not `boardStore` — eliminates 60fps re-render (#perf)
- fix(terminal): add `nokey` class + `onKeyDown` `stopPropagation` so xterm receives keyboard input (#terminal)

### Changed
- Cascade logic (`task.delete`, todo↔task mirror) lifted from renderer into `src/shared/dispatch/` — single source of truth for both UI and CLI mutations; fixes latent pomo-cancel desync bug (#108)
- `sys` binary is now a deprecation alias for `krnl`; prints one-line stderr note then delegates (#108)
- MOTD banner moved from renderer (`BOOT_LINE_ASCII` in `session.ts`) to main process — version is now read dynamically from `package.json` at startup (#108)
- feat(dock): redesign dock to spawn child nodes (text, image) instead of parent (mother) nodes
- feat(nodes): add TextNode and ImageNode placeholder components
- feat(canvas): implement actual node creation in `handleAddNode` (wired to `boardStore`)
- feat(mother): add `‹`/`›` slot reorder arrows on fixed nodes (hover-revealed)

## [0.1.0] - 2026-05-09

Initial scaffold. Week 1 of the 10-week build to live demo on 2026-07-20.

### Added

- Electron + Vite + React + TypeScript (strict) scaffold via `electron-vite`.
- Project structure: `src/main`, `src/renderer`, `src/sys` with separate `tsconfig.main.json` and `tsconfig.renderer.json`.
- Zustand store with `Node` and `Edge` type definitions.
- Zod schemas for runtime validation of `board.json`.
- `Persistence.save` / `Persistence.load` with round-trip test against `~/Documents/krnl0/board.json`.
- One placeholder node renders on the canvas.
- Token system, fonts, and cyber theme (light + dark variants).
- `sys` CLI binary entry stub at `dist/sys/index.js`.
- xterm.js dependencies wired (`@xterm/xterm`, `@xterm/addon-fit`) for the upcoming Terminal node.
- Vitest + React Testing Library set up; `npm test` and `npm run typecheck` scripts.
- Documentation: PRD v0.6.0, architecture docs, 10-week build roadmap, functional requirements (R1–R10).
- README with project description, quickstart, architecture overview, and license framing.
- Functional Source License v1.1 (Apache 2.0 future grant).

[Unreleased]: https://github.com/theMindDeveloper/krnl0/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/theMindDeveloper/krnl0/releases/tag/v0.1.0
