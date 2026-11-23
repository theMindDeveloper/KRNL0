# Post 02: Plan your day in one line (7 slides, 1080x1350)

Real footage of the app (Playwright drives the browser preview), composed with `../_shared/brand.css`.

    # preview running at :5201 (repo root: npx vite --config vite.preview.config.ts)
    node scripts/capture.cjs     # assets/*.png: typed plan card, plan landing, drag, drop
    python3 scripts/build.py     # slide-N.html
    node scripts/render.cjs      # slide-N.png + contact-sheet.png

Demo data is illustrative. Features shown: quick add (src/shared/quickAdd.ts), the plan card, drag a Todos row onto the Calendar.
