# 03-press-start (Instagram carousel, 1080×1350, 7 slides)

Topic: the Focus Timer. Pick the plan that is on, press start, it records onto the plan (task card, calendar), stopwatch mode.

- `slide-1.png … slide-7.png`, `contact-sheet.png`, `caption.md`
- Source: `slides.html` (uses `../_shared/brand.css`), `assets/` (trimmed real window shots)
- Rebuild (preview server on :5201 must be running):
  `node scripts/capture.cjs && node scripts/capture-stopwatch.cjs && python3 scripts/trim.py && node scripts/render.cjs`
- Footage: real renderer driven by Playwright with a fake clock (2026-11-24 11:02); the timer is fast-forwarded in 3-minute steps. Demo data is illustrative.
