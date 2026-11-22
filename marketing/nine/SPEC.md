# B — "Nine become one"

GOAL:    the viewer feels the relief of nine noisy tools becoming one calm KRNL0, and remembers
         "one app instead of nine" (the website's own hero line, verbatim).
OUTPUT:  HyperFrames, 1080 x 1920, 30 fps (Instagram Reels; text inside 120–888 px x 288–1248 px).
TIME:    24 s x 30 = 720 frames. No music source yet: built on a 110 bpm grid (16.36 frames a beat)
         so a bed can drop in later; effects carry the sound until then.

LOOK:    the website's day colours, flat, no gradients:
           acid #c9f158 (ground of the "after"), ink #0a0908, paper #f4efe2,
           lavender #a98bf6, cyan #22d3ee, coral #ee8466, dark #141414 (ground of the "before").
         Display: Geist 800, 150 px (7.8% of height), tracking -5.5%, leading 0.92.
         Labels/times: JetBrains Mono 700, 34 px. Nothing readable under 30 px.
         Medium: the real product UI — KRNL0 windows captured from the running app, cut out whole
         (never a slice of a window), shown at 1.6–2x their real size: >= 860 px wide.
         Depth: one shadow only, 0 60px 140px rgba(0,0,0,.42) + 0 14px 40px rgba(0,0,0,.3). No grain,
         no vignette, no glow except the cube's lit centre tile (the logo's own).

OBJECTS: nine small tools (before): each a flat card with its own colour, a name and one nagging
         line, red unread badges — they read as "separate apps" without naming any real brand.
         The KRNL0 cube: 3x3x3 dark voxels (#4a4a4a top / #303030 left / #1d1d1d right, 22 px radius,
         14 px gaps), centre tile acid and lit — exactly the app icon (build/icon.svg).
         KRNL0 windows: Todos, Calendar, Timer, Habits, as the real app draws them.
         K·R·N·L·0 tiles: acid, cyan, coral, lavender, paper; 0 in JetBrains Mono.

MOTION:  enter expo.out (long tail); camera moves power2.inOut; exits power3.in, 40–50% shorter
         than their entrance. Springs only on position/scale, damping ratio 0.75. Word stagger
         2 frames; list items 2 frames. One hero move per shot; secondary moves start 4 frames later
         and travel 60% as far. Titles land and hold dead still.

SHOTS:
  1  0–90     BEFORE. Frame 0: nine tool cards fill the screen in a 3x3 grid, badges already red;
              "Nine apps." slams in over them (0.3 s). Cards jitter on each ping, pings accelerate.
              Read: "Nine apps." (held 1.5 s), then "for one day." (1.1 s).
              Sound: pops on badges (rotated takes), rising density. → the grid is pulled to centre.
  2  90–120   COLLAPSE. All nine cards slam into one point (power3.in, 0.5 s, blur 12 px on the
              move); the ground floods acid on impact. Sound: whoosh → bass impact.
  3  120–210  THE CUBE. From the impact point the cube's three faces fly in along their normals and
              lock; it turns 205° to the logo pose. Lit centre tile glows on the lock.
              Read: "One app" (held 1.4 s). Sound: soft click per face lock.
  4  210–570  FOUR FACES. Four times (90 frames each): the cube turns a face to camera, the lit tile
              zooms through (8% → 250% of frame, 0.35 s, power3.in) and its acid becomes the window's
              ground colour; the real window rises whole, 900 px wide, and does its one job:
                Todos    — "Call mom 20:00 30m" types; the quick-add card opens   (lavender ground)
                Calendar — "Design review 16:00 1h30" lands as a block            (cyan ground)
                Timer    — Start; the countdown runs                              (acid ground)
                Habits   — three ticks; streaks +1                                (coral ground)
              Read: one verb each — "Plan it." "See it." "Run it." "Keep it." (held >= 1.2 s).
              The window then shrinks back into the cube (carry across, 0.6 → blur 6 px peak).
              Sound: key ticks only while text types, a pop when the block/tick lands, whoosh on
              zoom-through (two takes rotated).
  5  570–630  CLAIM. Cube settles to the logo pose; "One app instead of nine." char-slam, 3 lines.
              Sound: riser ending on the slam.
  6  630–720  END CARD. Claim lifts; K·R·N·L·0 tiles drop (spring 0.75), CTA "Free download · link in
              bio" + "Windows · macOS · Linux" hold 2.4 s. Sound: bass impact on the tiles.

BANNED:  a dark void with small things floating; cropped slices of windows; a window narrower than
         860 px; text closer than 40 px to a box edge or clipped by it; every element fading and
         sliding up; three cards in a row; glow other than the logo's lit tile; titles that drift
         after landing; real brand names or logos in the "before"; the logo docked in a corner;
         the same whoosh on every cut.

QA:      t=0 (thumbnail: grid + "Nine apps." readable), 1.5, 3.4 (impact), 6.0 (cube in logo pose),
         each face at its midpoint (window whole, its action visible, verb readable), 19.5 (claim),
         23 (end card); every seam -0.2/+0.2 s; phone sheet at 360 px; no text clipped anywhere.
