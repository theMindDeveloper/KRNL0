# Contributing to KRNL0

Thanks for wanting to help. KRNL0 is a one-canvas day planner built by one person, so small, focused contributions are the easiest to take in.

## Reporting a bug or an idea

- In the app: **Help › Send feedback**. It opens a GitHub issue with your version and system filled in. Nothing is sent until you post it.
- Or open an issue here and pick **Something's broken** or **An idea**.
- Please never attach your `board.json`: it holds your tasks and notes.

## Working on the code

```bash
npm install
npm run dev        # the app, with its own board for this checkout
npm test           # must be green
npm run typecheck  # must be 0 errors
```

- Read `docs/06-requirements/` for the part you are changing first; it is the contract.
- TypeScript strict, no `any`.
- Every feature also gets a `krnl` command, so the terminal and the AI can use it.
- Branches: `feat/…`, `fix/…`, `docs/…`, `chore/…`. Commits: conventional (`fix(habit): …`).
- UI changes: run the app and try the change, not only the tests.

## Pull requests

Describe what changed and how you checked it. Link the issue it closes. Keep one concern per pull request.
