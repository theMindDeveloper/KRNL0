# Post 09: Every button is a command (7 slides, 1080 x 1350)

- `slide-1.png` … `slide-7.png`: final slides. `caption.md`: Instagram caption. `contact-sheet.png`, `phone-check.png`: review sheets.
- `build.py` writes `slides/slide-N.html` (look: `../_shared/brand.css`); `render.cjs` screenshots them (Playwright).
- `assets/`: real app footage. `capture/`: how it was filmed.
  - `capture/run.test.ts` + `commands.json` run the real `krnl` command code (SysFacade) headlessly and record each command's output to `outputs.json`.
  - `capture/capture.cjs` + `board.js` drive the browser preview (port 5201) in the LIGHT theme with a fake clock at 2026-11-24 10:30, and type the commands into the real Terminal window. The preview has no shell, so `board.js` is a stand-in that echoes typed text and prints the recorded real output (wrapped at the window width).
  - The `krnl pomo start` / `krnl pomo status` lines cannot run headlessly (they need the app's main process); their text is the exact string format from `src/sys/commands/pomo.ts`.
- Rebuild: `node capture/capture.cjs` (needs the preview), `python3 build.py && node render.cjs`.
