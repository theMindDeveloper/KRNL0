# Review — KRNL0 launch film v2 (Remotion, 2:48, 1920×1080, 30 fps)

**What changed from v1** (the user's notes: clipping, off-centre cube, flat visuals, too-epic music, "kernel zero" spelled out)
- New engine: Remotion with a small 3D lens (`src/lib/space.tsx`): a CSS-3D camera, per-plane depth of field (blur from distance to the focus plane), grain, vignette, cuts that lift from black. The app-on-a-device camera is adapted from **ui-camera-film** (faizalmy, MIT — tilted plane, slab thickness, in-plane DOF). The "windows as separate planes in depth" idea is from **website-to-3d-video** (geoyrd, MIT).
- The cube is a real 3D object (27 rounded tiles, lit core, shaded by a key light) and stays centred; the camera starts on the lit tile and the cube rotates out from under it.
- Every device shot frames a **subject rectangle** (the window(s) the action happens in) and fits it inside 86 % × 82 % of the frame, so nothing important is cut; QA'd on 123 stills (start/middle/end of every shot) against the 90 % safe box.
- Music: ElevenLabs Music lo-fi, 84 BPM (Rhodes, dusty drums, crackle); four takes, picked the one with a steady beat grid. Cuts sit on its half-bar downbeats; "One canvas" lands on the groove drop (24.3 s), "Kernel Zero" on the last section change (145.4 s).
- Voice: same male voice, now written as "Kernel Zero" so it is not spelled out letter by letter; voice chain: high-pass 70 Hz, +2 dB at 3 kHz, +6 dB, limiter; music ducks to 0.24 under speech.

**Measured, not heard** by a person: the mix balance and the new lines' delivery.
**Honest limits:** footage is the app's browser preview with demo data (fake clock); the assistant reply and the terminal shell are scripted stand-ins; small UI text in wide shots is a texture, the readable moments are the punched framings.
