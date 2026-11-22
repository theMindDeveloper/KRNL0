# Review: B "Nine become one"

## Render 2 (46.5 s, narrated): changes from the user's notes
- **Slower:** the narration is the clock. Each scene holds as long as its line, the real footage plays at 0.8×, and the moves are longer (0.5–0.9 s).
- **Narration:** ElevenLabs Eleven v4, voice "Jessa" (`yj30vwTGJxSHezdAGsv9`), with audio tags (`[exasperated]`, `[sighs]`, `[warm]`, `[confident]`, `[relaxed]`, `[cheerful]`). One line per scene (`scripts/voice.py`); each tool pings as the voice names it. Word-timed captions under the headline, for people watching muted.
- **Ending redone:** no drop. The claim clears, the cube glides up and stays in the logo pose, and the K·R·N·L·0 tiles rise in under it on "Kernel Zero". The call to action lands on "Free".
- **Effects quieter:** about 9 dB under the voice, the riser removed, one ping per tool. The final file is loudness-normalised to −15.1 LUFS, −1.4 dBTP.
- Measured, not heard: the voice levels and the effect balance.

## Render 1 (26.2 s, 1080×1920, 30 fps)

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
