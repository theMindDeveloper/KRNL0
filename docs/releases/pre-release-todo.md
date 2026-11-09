# Before the next release (experiment/new-user-review)

Updated 2026-11-09. Everything asked for in the review sessions, where it stands, and what is left. Tick a line when it is merged **and** checked in the app.

## 1. Built — waiting for your check in the app

- [ ] **Orb answers through Claude** (#224): streamed text, "Claude isn't installed / signed in" banner, menu only before chatting, Stop, New chat. Hold-Space removed.
- [ ] **Habit and event board cards, round two** (#229): today's square is the button (+1 · 1/2 for an amount), the event's date page with Skip and Show, no wire dots.
- [ ] **Easy mode review D19–D26**: Easy hides deadlines, habit goals, chains, calendar layers/zoom, the terminal, frames/wires/canvas switcher, Finished cards.
- [ ] **Calendar**: double-click to add, the **Repeating** button, the new event card.
- [ ] **Pop-ups close on an outside click**; **the top bar drags the window**.
- [ ] **Show / eye** (#223): one Show for card + Calendar, state colours, `krnl show`.
- [ ] **Align to grid** (off by default; Cards only / Everything; 80 px; nearest free spot).
- [ ] **Station soft snap**: dividers click onto the other row's edge or their default spot within 14 px.
- [ ] **Ghost wires**: no wire snaps to a hidden (finished / layer-off) card; no wires between hidden cards.
- [ ] **UI rule**: no label wraps or spills out of its button (orb "New chat" fixed; dev console guard).
- [ ] **Tours** in both modes (texts corrected; ring stays on your new task; Pomo-mode timer steps).

## 2. To build

- [ ] **A tour for the board itself** — notes, sticky notes, images, frames, Align to grid, several canvases, the habit/event cards, Show. Big features end with a tour (AGENTS.md); these have none. Draft first.
- [ ] **Voice** — after you approve the tour texts: re-record the first-day tour (its words changed), voice every other tour in both modes (#227), and the orb's own lines in the same voice (#225). The paused clip check in `tourVoice.test.ts` is switched back on afterwards.
- [ ] **Fix what your checks in section 1 find.**

## 3. Check before shipping (not asked for, but needed)

- [ ] **Old boards open**: load a few real older `board.json` files (incl. one with `alignGrid: true` from the first grid build) — nothing lost, nothing moved.
- [ ] **Light theme pass** over everything new (habit/event cards, Canvas settings card, tour cards, event card, Show highlight).
- [ ] **Small window pass** (1100 × 760 and smaller): Station, Calendar header, tour cards, Settings.
- [ ] **Claude CLI on a clean Windows install**: not installed → banner; not signed in → Sign in; a question with quotes and spaces in it.
- [ ] **A long day of real use** (test like a user): plans across several days, ticks, drags, deletes, undo, every view, Easy ↔ Advanced.
- [ ] **Flaky test**: `station-analytics-window.test.tsx` times out under the full run (passes alone).
- [ ] **Rotate the ElevenLabs API key** that was pasted in chat (it is in no file).
- [ ] **Docs**: PRD / visual system / node spec for the new features; `Challenges.md` entries for fixes you have verified (cursor stutter is in; ghost wires next once verified).

## 4. GitHub housekeeping

- [ ] Close issues already done on this branch: #200 #201 #202 #203 #204 #205 #206 #217 #222 #223 #224 #226 #228 #229 (after your checks).
- [ ] Re-check and close or fix: #219 (repeating plans copy), #220 (Calendar items that can't be deleted), #221 (due date drawn nowhere) — likely covered by Decision 40 (#222), not verified.
- [ ] Decide (keep for later, or close): #102 Month view (exists), #170 undo a delete (partly done), #172 Notion-style calendar drag, #173 meaning of node connections (habit/event cards now have none), #174 reorder tasks, #175 Contact us, #176 update notice (Decision 36 updater exists), #180 split Pomodoro from Todo.

## 5. Release (RELEASING.md)

- [ ] **Designed "What's new"** on the Claude Design canvas, one slide per headline feature, approved — every feature in this release (the 0.11 notes still say "Habits & Routines").
- [ ] Every tour clicked through once in the app, both modes.
- [ ] PR `experiment/new-user-review` → `main` (typecheck + tests green, HISTORY complete).
- [ ] Version bump **0.11.0**, CHANGELOG, `docs/releases/v0.11.0.md`, HISTORY entry; tag `v0.11.0`; check the draft has `latest.yml`; Publish.
