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

## Needs you

- [ ] **Approve What's new** — canvas board "What's new in 0.11 · for approval" (three slides + the list). Say what to change.
- [ ] **Listen** to a few tours (Help › a tour, speaker on) and the orb's greeting; say if a line sounds off — one script changes, one clip re-records.
- [ ] **Check in the app** (Ctrl+R): orb answers (#224), habit/event cards (#229), Easy review, Calendar adds, Show (#223), Align to grid, soft snap, no ghost wires, the tours in both modes. Then close #222–#229.
- [ ] **Claude CLI on a clean Windows install** (not installed → banner; not signed in → Sign in).
- [ ] **Rotate the ElevenLabs API key** that was pasted in chat (it is in no file).
- [ ] **Release**: merge the PR, then RELEASING.md §3–4 — `git tag v0.11.0` on main, push the tag, check the draft has `latest.yml`, Publish.

## After the release

- #170 undo a delete (partly done), #172 Notion-style calendar drag, #173 meaning of connections, #174 reorder tasks, #175 Contact us, #180 Pomodoro/Todo split.
