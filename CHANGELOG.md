# Changelog

All notable changes to krnl0 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 2 work in progress: infinite canvas, four mother nodes (Pomodoro, Todos, Habits, Terminal), and edge-ready node contract.

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
