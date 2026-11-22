# Review: A "One day, one take" (36.8 s, 1080×1920, 30 fps, narrated, minimal music bed)

**Idea:** one continuous camera move over one real KRNL0 canvas. The ground colour changes per beat; the app does the proving.

**Beats** (headlines are the website's own words)
1. *Your whole day, one canvas.* Todos solo, two plans ticked, then the app's own fit-view pulls out to Todos + Calendar.
2. *Put anything next to your plan.* A real sticky note on a canvas frame; "Gift idea for Mom" is typed live in the real editor.
3. *Pick it up, put it anywhere.* "Send the invoice" is picked up in Todos and dropped on the Calendar: it lands as a 15:25 block and Todos shows the time.
4. *Habits you can see building.* Three habits ticked; streaks and the "7-day card" badge appear.
5. *One app instead of nine.* Todos · Calendar · Habits · Timer in one row (Timer running), then the logo, K·R·N·L·0 tiles and "Free download · link in bio".

**Real, not drawn:** the footage is the running renderer (`scripts/capture.cjs`, fake clock, slow-motion fit-view). Demo data is seeded in `scripts/board.js` (illustrative).

**Measured / looked at:** `check` passes (lint, runtime, layout, motion, contrast, craft, audio); beat sheet and phone sheet viewed; contact sheet of the render viewed. Final file −15.0 LUFS, about −0.9 dBFS peak after AAC. Windows are whole at every stop (an earlier zoom-in that clipped both windows was removed).

**Not heard by a person:** the balance of voice, effects and the music bed (ElevenLabs Music, instrumental, volume 0.14). Check ElevenLabs' licence terms for generated music before paid promotion.

**Weak spots:** website snapshot never arrived, so site components are replicated rather than reused; the drag drop is small on the phone.
