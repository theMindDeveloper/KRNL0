# Before the next release (experiment/new-user-review)

What must be done before this branch ships. Each line is a GitHub issue; tick it here when it is merged and checked in the app.

## Asked for, not started

- [x] **Orb answers through Claude** — "Ask anything" sends the question to the Claude CLI and shows the answer as text in the orb. ([#224](https://github.com/theMindDeveloper/KRNL0/issues/224)) *Built 8 Nov, waiting for your check. Hold Space to talk removed (no speech-to-text: the user chose text only).*
- [ ] **One voice** — re-record the orb's own lines ("hi", "I'm here", the welcome line) in the new ElevenLabs voice. ([#225](https://github.com/theMindDeveloper/KRNL0/issues/225))
- [x] **Cursor stutter** — task cards and their edges flick between pointer, grab and default; each area gets one cursor. ([#226](https://github.com/theMindDeveloper/KRNL0/issues/226)) *Done 8 Nov — checked by the user.*
- [ ] **Board cards for habits and repeating events** — generated cards in the new task-card style; the habit card redesigned to match. Design drafts first. ([#229](https://github.com/theMindDeveloper/KRNL0/issues/229))
- [ ] **Voice the other tours** — after the first-day voice is approved. ([#227](https://github.com/theMindDeveloper/KRNL0/issues/227))

## Found while testing

- [x] **Easy: the task card still shows its tag.** ([#228](https://github.com/theMindDeveloper/KRNL0/issues/228)) *Fixed 8 Nov (open and done cards).*

## Release steps (RELEASING.md)

- [ ] Designed "What's new" for the release (Claude Design canvas, approved), covering every feature in it — the 0.11 notes still say "Habits & Routines".
- [ ] Every tour clicked through once in the app, both modes.
- [ ] Version bump (minor), CHANGELOG, `docs/releases/vX.Y.Z.md`, HISTORY entry; tag, draft release, Publish.
