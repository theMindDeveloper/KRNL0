# Review: B "Nine become one" (render 1, 26.2 s, 1080×1920, 30 fps)

**Creative calls**
- The match cut carries the film: the "before" is a 3×3 grid of nine tools, the cube's front face is a 3×3 grid of nine tiles, and card *i* becomes tile *i*. Each feature then opens from its own tile and returns into it.
- The nine tools are the website hero's own list (timer, to-dos, habits, calendar, focus sounds, whiteboard, time tracking), plus Clock and Analytics. No real app brand is shown in the "before".
- Every window is the real KRNL0 app, filmed whole by `scripts/capture.cjs` on a calm demo board, and shown at 1.59× its real size (860 px wide). Each one does its real job: the quick-add card, an event landing on the Day view, the timer running, five habit ticks.

**Not built (yet):** storylines C "One sentence, everywhere" and A "One day, one take" (see `../STORYLINES.md`).

**Measured**
- `check`: lint, runtime, motion, contrast, craft and audio all pass.
- Loudness: −14.7 LUFS, true peak −1.7 dBTP, no clipping.
- Each effect is placed so its measured peak lands one frame after its picture.

**Only looked at:** the decoded render, as frame sheets every 0.5 s and around each carry-back. Nobody has *heard* the mix: it was measured, not listened to.

**Warnings kept on purpose**
- `outside_safe_zone`: the tool cards' bottom row (decoration, not reading text) and the TikTok/Shorts edges. The film is cut for Reels.
- `text_below_floor`: "25:00" on the cube's Timer tile once the cube shrinks for the claim. It's a glyph, not a line to read.
- `nested_media_start_basis_ambiguous`: the video start times are local to their scene, which is intended.

**Weakest shot:** the window entries fade in over their ground for about 4 frames (the timer briefly reads olive). Next I'd land the window on the zoom's last frame with no fade.

**Pending:** swap the hand-built cube for the website's own `cube.js` once the site snapshot is pushed; add a music bed (needs the user's track or a HeyGen sign-in); add the ElevenLabs voiceover.
