# Before the next release (experiment/new-user-review)

What must be done before this branch ships. Each line is a GitHub issue; tick it here when it is merged and checked in the app.

## Asked for, not started

- [ ] **Orb answers through Claude** — "Ask anything" and hold-Space-to-talk send the question to the Claude CLI and show the answer as text in the orb. ([#224](https://github.com/theMindDeveloper/KRNL0/issues/224))
- [ ] **One voice** — re-record the orb's own lines ("hi", "I'm here", the welcome line) in the new ElevenLabs voice. ([#225](https://github.com/theMindDeveloper/KRNL0/issues/225))
- [ ] **Cursor stutter** — task cards and their edges flick between pointer, grab and default; each area gets one cursor. ([#226](https://github.com/theMindDeveloper/KRNL0/issues/226))
- [ ] **Voice the other tours** — after the first-day voice is approved. ([#227](https://github.com/theMindDeveloper/KRNL0/issues/227))

## Found while testing

- [ ] **Easy: the task card still shows its tag.** ([#228](https://github.com/theMindDeveloper/KRNL0/issues/228))

## Release steps (RELEASING.md)

- [ ] Designed "What's new" for the release (Claude Design canvas, approved), covering every feature in it — the 0.11 notes still say "Habits & Routines".
- [ ] Every tour clicked through once in the app, both modes.
- [ ] Version bump (minor), CHANGELOG, `docs/releases/vX.Y.Z.md`, HISTORY entry; tag, draft release, Publish.
