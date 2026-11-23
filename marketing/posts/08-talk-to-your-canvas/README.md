# Post 08 · Talk to your canvas (8 slides, 1080×1350)

Rebuild: `node scripts/capture.cjs all` (needs the preview on :5201), `python3 scripts/build.py && node scripts/render.cjs`.

Real: the orb, the assistant panel, the Calendar, the Timer, the focus-session flow and its spoken caption are the running app.
Scripted: Claude Code does not run in a browser, so `scripts/board.js` plays the three answers (and their `krnl` lines) through the
same bridge calls the desktop app uses. In the desktop app the answers come from Claude Code; the commands shown are real `krnl` commands.
The Timer was started with its own button (the preview cannot run the `pomo start` command the focus flow sends).
