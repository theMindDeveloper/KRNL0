# Before releasing 0.11.0 (experiment/new-user-review)

Updated 2026-11-09 (overnight run). Everything that can be done without the owner is done; what is left needs the owner's eyes, ears or a click.

## Done (overnight)

- [x] **Board tour** (new, both modes) — cards, toolbar, a practice sticky note, Show, habit/event cards, Align to grid; Advanced: canvases, wires.
- [x] **Every tour voiced** (#227) — a tagged Eleven v4 script on every step, 120 clips for Easy and Advanced and both timer modes; a test checks every step a user can meet has its clip.
- [x] **One voice** (#225) — the orb's 35 lines re-recorded in the same voice; outdated intro and Pomo/Todo walkthrough flows retired.
- [x] **Old boards open** — 6 real boards on this machine load with nothing lost or moved; a test pins `alignGrid` (old `true` and new scopes), habit/event cards and old wires.
- [x] **Light theme and small windows** checked (1100 × 760, 900 × 640): readable; the overflow guard reports nothing.
- [x] **Flaky test** fixed (`station-analytics-window` gets 20 s).
- [x] **#219, #220, #221 verified** in code and tests, closed. 13 finished issues closed in total; #222–#229 marked "built, waiting for your check".
- [x] **Docs** — node spec (board preferences, `habit.lane`), visual system (board cards, Align to grid, soft snap), PRD addendum, tour requirements F9–F12.
- [x] **Release prepared** — version **0.11.0**, CHANGELOG, `docs/releases/v0.11.0.md`, What's new (three headlines + full list, two new plates), HISTORY. Typecheck 0 errors, 2,551 tests green, production build OK. Release PR open — **not merged, not tagged, not published**.

- [x] **Every clip "listened" to** — all 155 recordings (120 tour, 35 orb) transcribed back with ElevenLabs speech-to-text: mean word match 0.98, no audio tag ever read aloud. Two slips ("Tick it" → "Ticket", "Tick the box" → "Take the box") reworded, re-recorded, now exact.
- [x] **Real-app check** in the Electron build (own profile and board, your running app untouched): the windows open, the board tour opens, and the orb answers through Claude Code for real.
- [x] **Claude CLI states on Windows**: no Claude on PATH → "not installed" banner; never signed in → Sign in; signed in → ready; a question with quotes and & arrives intact.
- [x] **#222–#229 closed** with the evidence above (reopen any your own check disagrees with).

## Only you can do these (by their nature)

- [ ] **Approve What's new** — canvas board "What's new in 0.11 · for approval". Approving is your call; everything in it is built and in the PR.
- [ ] **Rotate the ElevenLabs API key** that was pasted in chat — it lives in your ElevenLabs account (it is in no file here).
- [ ] **Release** (you asked not to): mark PR #230 ready and merge it, then RELEASING.md §3–4 — `git tag v0.11.0` on main, push the tag, check the draft has `latest.yml`, Publish.

## After the release

- #170 undo a delete (partly done), #172 Notion-style calendar drag, #173 meaning of connections, #174 reorder tasks, #175 Contact us, #180 Pomodoro/Todo split.
