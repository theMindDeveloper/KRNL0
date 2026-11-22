# Review: C "Where did your day go?" (marketing cut, 42 s, 1080×1920, 30 fps, narrated)

**Why this cut exists:** the user's note on "Nine become one" was that it showed off animation and did not sell the app. This one leads with benefits.

**The pitch, in order** (headlines are the website's own words; the app does the proving)
1. *Where did your day go?* The real Clock, 20 minutes of the evening slipping by. On "Kernel Zero puts it all in one place" the line becomes *One place for your day.*
2. *Type it. It is planned.* The real quick-add card turns "Review the proposal 11:00 1h" into Today · 11:00 · 1 hour, then the plan joins the list.
3. *One calendar for all of it.* The same plan lands as the 11:00 block among the day's other plans.
4. *Press start. It records.* The Timer, with that plan chosen, starts counting and records onto it.
5. *See where the time went.* Analytics → "Planned vs spent". Ring on the row **Review the proposal 2h05 / 1h**; pills: Planned 1h → Took 2h05 → +1h05. This is the one thing a plain to-do list cannot do.
6. *Free. No account. Your plans stay on your computer.* (the site's own line), the logo, the K·R·N·L·0 tiles, "Free download · link in bio", Windows · macOS · Linux.

**Real, not drawn:** every window is the running renderer, filmed whole by `scripts/capture.cjs`. The Analytics numbers come from tracked time seeded in `scripts/board.js` (illustrative demo data: not a claim about real users).

**Measured / looked at:** `check` passes (lint, runtime, layout, motion, craft, audio); frames viewed at every beat, including the cut and the end card; the rendered file is −15.1 LUFS, −1.3 dBTP, no clipping. **Not heard** by a person: the balance of voice and effects.

**Warnings kept on purpose:** `contrast_aa_failure` and `text_below_floor` on the tone-on-tone ghost clock digits (decorative, as on the website); `outside_safe_zone` for TikTok edges (the film is cut for Instagram).

**Weakest spot:** the timer sits still at 21:42 for the last 3 s of its scene while the voice finishes; a live counter would be better. Also pending: swap in the website's own cube/components once the site snapshot is pushed, and a music bed.
