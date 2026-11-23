# KRNL0 launch film — v2 plan (radical visual rebuild)

## What was wrong with v1 (from the user's review, confirmed on the frames)
- Flat 2D picture: screenshots pasted full-frame, colour-field cards; no depth, no light, no lens.
- Composition errors: the cube sat low and was cut by the letterbox; cards cropped at the frame edges; windows cut by punch-ins.
- Score too epic for a calm productivity tool.
- The review looked at small contact sheets only; nobody checked each shot at full size against a checklist.

## Tools (researched)
| Tool | Use in v2 |
|---|---|
| **Remotion 4** (React → MP4) | the film engine; every frame a pure function of time |
| **ui-camera-film** (faizalmy, MIT) — the "Ultramock" style: tilted 3D camera, shallow depth of field, slab thickness, grain, vignette, cut shots that lift from black, light-wave outlines | the camera rig for every app shot (adapted, credited) |
| **website-to-3d-video** (geoyrd, MIT) — idea only: UI pieces lift off a page as separate 3D cards with DOF and motion blur | the "canvas world": each KRNL0 window is its own plane at its own depth, blurred by its distance from the focus plane |
| CSS 3D (perspective, preserve-3d) | a real voxel cube (27 cubes, rounded faces, lit core), cards and windows in depth; cheap and deterministic on a GPU-less render box |
| Real app footage (25 shots already filmed from the running app, 2880×1620) | textures on the planes; windows cut out of static shots with a rounded mask |
| ElevenLabs Music | a **lo-fi** score (84 BPM, Rhodes, dusty drums, crackle) with a breath at 0:37 and the beat landing at 0:39 |
| ElevenLabs voice (kept), SFX (kept) | the user liked the story and the sound |
Rejected: three.js/R3F post-processing DOF (no GPU here: SwiftShader is too slow for 5 000 frames), Motion Canvas (can't reuse the app).

## The look ("one lens, one light")
- Bay: near-black #060606 with 6 % grain and a 0.9 vignette; one soft warm key light from upper left (gradient sheen on planes).
- Planes: app windows with 22 px radius, a 9-step slab (device thickness), contact shadow, tilt rx 8–22°, ry ±12–25°.
- Lens: depth of field on every app shot (focus on the action; far planes blur 6–14 px); slow drifts 1–2 %w/s; cuts lift from black in 0.35 s.
- Accent: acid #c9f158 only for light-wave outlines on what the cursor touches and the lit core.
- Type: Geist 800, set in 3D space in front of out-of-focus UI (never on a flat colour field); one line at a time, ≥ 6 % of frame height.

## Story (kept) — beats re-timed to the lo-fi score
0:00 macro of the lit core, the 3D cube turns, centred · 0:10 the old way: tool cards float in depth, camera dollies through them · 0:29 "What if they did?" — everything stops · 0:31 the cards fly into the cube · 0:39 the beat lands: the camera dives through the core into the app (device plane rises from the dark) · Plan it · Do it · See it · Make it yours · tours · pull back to the whole canvas world · end card (cube + K·R·N·L·0).

## Workflow (the loop)
1. Look-dev: 5 test shots, stills at full size, checked against the QA list, iterate. **Show the user before the full build.**
2. Build scene by scene; after each scene: stills at start/middle/end + every cut, full size.
3. QA list per frame: subject centred or on a thirds line on purpose; nothing important cut by the frame or letterbox unless it is a deliberate macro with DOF; focus on the action; text ≥ 26 px; no dead black; motion smooth (no jumps between cuts).
4. Render, measure loudness (−14 LUFS, −1 dBTP), sample 1 frame/sec for a final pass, deliver.
