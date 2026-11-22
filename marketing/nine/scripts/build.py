"""Writes compositions/before.html, compositions/core.html, compositions/end.html and index.html.

The nine tools are authored once here so the "before" cards and the cube's front-face tiles
match one to one (the collapse is a match cut: card i becomes tile i). Run: python3 scripts/build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FPS = 30

# ── the nine tools, in grid order (row by row) ───────────────────────────────────────────────
TOOLS = [
    # name,           nag line,                       card bg,   ink,       radius, badge
    ("Timer",         "Break over",                    "#ff6b5b", "#0a0908", 8,  "3"),
    ("To-dos",        "7 overdue",                     "#ffffff", "#0a0908", 28, "7"),
    ("Habits",        "Streak lost",                   "#ffd66b", "#0a0908", 16, "1"),
    ("Calendar",      "Sync in 5 min",                 "#7aa7ff", "#0a0908", 12, "2"),
    ("Clock",         "Alarm 06:30",                   "#262626", "#ffffff", 40, "1"),
    ("Focus sounds",  "Rain stopped",                  "#b9f5a8", "#0a0908", 4,  "4"),
    ("Whiteboard",    "3 unsaved",                     "#f4efe2", "#0a0908", 20, "3"),
    ("Analytics",     "Report ready",                  "#d9c2ff", "#0a0908", 24, "5"),
    ("Time tracking", "Still running",                 "#ffb3c7", "#0a0908", 10, "9"),
]

ACID, LAV, CYAN, CORAL, DARK, INK, PAPER = "#c9f158", "#a98bf6", "#22d3ee", "#ee8466", "#141414", "#0a0908", "#f4efe2"

# Mini glyph for each tool on its 176 px cube tile (KRNL0's own look: dark tile, brand colours).
GLYPHS = [
    # Timer
    f'<div class="g-time">25:00</div><div class="g-bar" style="background:{ACID}"></div>',
    # To-dos
    "".join(f'<div class="g-row"><i style="background:{c}"></i><b></b><s></s></div>' for c in (CYAN, CORAL, ACID)),
    # Habits
    '<div class="g-grid">' + "".join(f'<i style="background:{c}"></i>' for c in (ACID, ACID, ACID, "#3a3a3a", CYAN, CYAN, "#3a3a3a", "#3a3a3a", CORAL, CORAL, CORAL, CORAL)) + "</div>",
    # Calendar
    f'<div class="g-cal"><i style="background:{CORAL};height:26px"></i><i style="background:{LAV};height:40px"></i><i style="background:{ACID};height:30px"></i></div>',
    # Clock
    f'<svg class="g-svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="none" stroke="#4a4a4a" stroke-width="7"/><path d="M50 12 A38 38 0 0 1 86 40" fill="none" stroke="{ACID}" stroke-width="7" stroke-linecap="round"/><line x1="50" y1="50" x2="50" y2="26" stroke="{PAPER}" stroke-width="6" stroke-linecap="round"/><line x1="50" y1="50" x2="68" y2="60" stroke="{CORAL}" stroke-width="4" stroke-linecap="round"/></svg>',
    # Focus sounds
    '<div class="g-wave">' + "".join(f'<i style="height:{h}px"></i>' for h in (22, 46, 70, 38, 58, 28, 50)) + "</div>",
    # Whiteboard / canvas
    f'<div class="g-notes"><i style="background:#ffe28a;left:18px;top:26px;rotate:-6deg"></i><i style="background:#ffb3c7;left:66px;top:18px;rotate:4deg"></i><i style="background:#a8e6ff;left:44px;top:66px;rotate:-2deg"></i></div>',
    # Analytics
    '<div class="g-bars">' + "".join(f'<i style="height:{h}px;background:{c}"></i>' for h, c in ((30, "#5a5a5a"), (52, "#5a5a5a"), (40, "#5a5a5a"), (78, ACID), (60, "#5a5a5a"))) + "</div>",
    # Time tracking
    f'<div class="g-track"><i style="width:34px;background:{CYAN}"></i><i style="width:22px;background:{CORAL}"></i><i style="width:46px;background:{ACID}"></i></div><div class="g-ticks"><s></s><s></s><s></s><s></s></div>',
]

GLYPH_CSS = f"""
  .tile {{ position: absolute; width: 176px; height: 176px; border-radius: 22px; background: #232323; overflow: hidden; }}
  .g-time {{ position: absolute; left: 0; right: 0; top: 52px; text-align: center; font-family: "KMono", monospace; font-weight: 800; font-size: 46px; color: {PAPER}; letter-spacing: -0.02em; }}
  .g-bar {{ position: absolute; left: 30px; right: 30px; bottom: 34px; height: 14px; border-radius: 7px; }}
  .g-row {{ position: relative; height: 34px; margin: 22px 0 -6px 22px; }}
  .g-row i {{ position: absolute; left: 0; top: 10px; width: 12px; height: 12px; border-radius: 6px; }}
  .g-row b {{ position: absolute; left: 22px; top: 4px; width: 22px; height: 22px; border-radius: 6px; border: 3px solid #8a8a8a; box-sizing: border-box; }}
  .g-row s {{ position: absolute; left: 54px; top: 11px; width: 78px; height: 10px; border-radius: 5px; background: #6a6a6a; }}
  .g-grid {{ position: absolute; left: 22px; top: 34px; display: grid; grid-template-columns: repeat(4, 26px); gap: 8px; }}
  .g-grid i {{ width: 26px; height: 26px; border-radius: 7px; display: block; }}
  .g-cal {{ position: absolute; left: 26px; right: 26px; top: 26px; display: flex; flex-direction: column; gap: 10px; }}
  .g-cal i {{ display: block; border-radius: 8px; opacity: 0.95; }}
  .g-svg {{ position: absolute; left: 18px; top: 18px; width: 140px; height: 140px; }}
  .g-wave {{ position: absolute; left: 24px; right: 24px; top: 0; bottom: 0; display: flex; align-items: center; justify-content: space-between; }}
  .g-wave i {{ display: block; width: 12px; border-radius: 6px; background: {CYAN}; }}
  .g-notes i {{ position: absolute; width: 64px; height: 64px; border-radius: 6px; display: block; }}
  .g-bars {{ position: absolute; left: 24px; right: 24px; bottom: 30px; height: 100px; display: flex; align-items: flex-end; justify-content: space-between; }}
  .g-bars i {{ display: block; width: 18px; border-radius: 5px; }}
  .g-track {{ position: absolute; left: 22px; right: 22px; top: 62px; height: 28px; border-radius: 8px; background: #3a3a3a; display: flex; gap: 6px; padding: 0 8px; align-items: center; }}
  .g-track i {{ display: block; height: 14px; border-radius: 5px; }}
  .g-ticks {{ position: absolute; left: 22px; right: 22px; top: 104px; display: flex; justify-content: space-between; }}
  .g-ticks s {{ display: block; width: 3px; height: 14px; background: #6a6a6a; }}
"""

FONTS = """
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-600-normal.woff2") format("woff2"); font-weight: 600; }
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-700-normal.woff2") format("woff2"); font-weight: 700; }
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-800-normal.woff2") format("woff2"); font-weight: 800; }
  @font-face { font-family: "KMono"; src: url("assets/fonts/jetbrains-mono-latin-500-normal.woff2") format("woff2"); font-weight: 500; }
  @font-face { font-family: "KMono"; src: url("assets/fonts/jetbrains-mono-latin-700-normal.woff2") format("woff2"); font-weight: 700; }
  @font-face { font-family: "KMono"; src: url("assets/fonts/jetbrains-mono-latin-800-normal.woff2") format("woff2"); font-weight: 800; }
"""

import json as _json
VOICE = {k: _json.loads((ROOT / f"assets/voice/{k}.json").read_text()) for k in ("chaos", "reveal", "plan", "see", "run", "keep", "claim")}
VEND = {k: v["words"][-1]["e"] for k, v in VOICE.items()}
import subprocess as _sp
VLEN = {k: float(_sp.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(ROOT / f"assets/voice/{k}.mp3")], capture_output=True, text=True).stdout) for k in VOICE}
PLAYBACK = 0.8   # the windows' real footage plays a little slower than life

# Geometry shared by the match cut.
CARD, CARD_X0, CARD_Y0, CARD_GAP = 256, 129, 566, 23
FACE = 600
TILE, TILE_STEP = 176, 194          # tile size; centre-to-centre on the face
FACE_CX, FACE_CY = 540, 900         # where the cube's front face sits, frontal, at z = 0


def card_center(i):
    c, r = i % 3, i // 3
    return CARD_X0 + c * (CARD + CARD_GAP) + CARD / 2, CARD_Y0 + r * (CARD + CARD_GAP) + CARD / 2


def tile_center(i):
    c, r = i % 3, i // 3
    return FACE_CX + (c - 1) * TILE_STEP, FACE_CY + (r - 1) * TILE_STEP


# ── before: nine noisy tools → collapse into the cube's front face ─────────────────────────────
CHAOS_AT = 0.4   # the chaos line starts here


def before():
    w = {x["w"].strip(".,").lower(): x["s"] + CHAOS_AT for x in reversed(VOICE["chaos"]["words"])}
    day_end = VEND["chaos"] + CHAOS_AT
    COL = round(day_end + 0.15, 3)      # collapse starts as the line ends
    D = round(COL + 1.3, 3)
    cards = []
    for i, (name, nag, bg, ink, rad, badge) in enumerate(TOOLS):
        cx, cy = card_center(i)
        cards.append(f"""
      <div class="b-slot" id="b-slot{i}" style="left:{cx - CARD / 2}px; top:{cy - CARD / 2}px">
        <div class="b-jit" id="b-jit{i}">
          <div class="b-card" id="b-card{i}" style="background:{bg}; color:{ink}; border-radius:{rad}px">
            <div class="b-name">{name}</div>
            <div class="b-nag">{nag}</div>
            <div class="b-badge" id="b-badge{i}">{badge}</div>
          </div>
          <div class="tile b-tile" id="b-tile{i}" style="left:{(CARD - TILE) / 2}px; top:{(CARD - TILE) / 2}px">{GLYPHS[i]}</div>
        </div>
      </div>""")
    # Each tool pings as the voice names it; the rest pile on during "nine apps, just to get through one day".
    named = [(0, w["timer"]), (1, w["to-do"]), (2, w["habits"]), (3, w["calendar"]), (5, w["focus"])]
    rest = [4, 6, 7, 8]
    t0, t1 = w["nine"] - 0.9, w["nine"] - 0.05
    named += [(c, round(t0 + j * (t1 - t0) / len(rest), 3)) for j, c in enumerate(rest)]
    pile, t, gap = [0, 4, 8, 2, 6, 1, 5, 3, 7, 0, 4, 8], w["apps"] + 0.1, 0.3
    for c in pile:
        if t > day_end - 0.1: break
        named.append((c, round(t, 3))); t += gap; gap = max(0.09, gap * 0.82)
    order = [c for c, _ in named]; times = [round(x, 3) for _, x in named]
    js_pings = ",".join(f"[{i},{tt}]" for i, tt in zip(order, times))
    moves = ",".join(f"[{tile_center(i)[0] - card_center(i)[0]},{tile_center(i)[1] - card_center(i)[1]}]" for i in range(9))
    html = f"""<template>
  <style>
    {FONTS}
    #root {{ position: absolute; inset: 0; overflow: hidden; font-family: "KGeist", sans-serif; }}
    #b-ground {{ position: absolute; inset: 0; background: {DARK}; }}
    #b-flood {{ position: absolute; inset: 0; background: {ACID}; clip-path: circle(0px at {FACE_CX}px {FACE_CY}px); }}
    #b-head {{ position: absolute; left: 120px; top: 330px; font-weight: 800; font-size: 150px; letter-spacing: -0.055em; line-height: 0.92; color: {PAPER}; white-space: nowrap; }}
    #b-face {{ position: absolute; left: {FACE_CX - FACE // 2}px; top: {FACE_CY - FACE // 2}px; width: {FACE}px; height: {FACE}px; border-radius: 30px; background: #070707; opacity: 0; }}
    .b-slot {{ position: absolute; width: {CARD}px; height: {CARD}px; }}
    .b-jit {{ position: absolute; inset: 0; }}
    .b-card {{ position: absolute; inset: 0; padding: 24px 22px; box-shadow: 0 30px 60px rgba(0,0,0,.35); }}
    .b-name {{ font-weight: 700; font-size: 36px; letter-spacing: -0.03em; line-height: 1.02; }}
    .b-nag {{ margin-top: 12px; font-family: "KMono", monospace; font-weight: 500; font-size: 28px; line-height: 1.25; opacity: 0.9; }}
    .b-badge {{ position: absolute; right: 16px; bottom: 16px; min-width: 54px; height: 54px; padding: 0 12px; border-radius: 27px; background: #e5484d; color: #fff;
      font-weight: 700; font-size: 32px; display: flex; align-items: center; justify-content: center; }}
    {GLYPH_CSS}
    .b-tile {{ opacity: 0; }}
  </style>
  <div id="root" data-composition-id="before" data-width="1080" data-height="1920">
    <div id="b-ground"></div>
    <div id="b-flood"></div>
    <div id="b-head">Nine apps.</div>
    <div id="b-face"></div>
    {''.join(cards)}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    const pings = [{js_pings}];
    const moves = [{moves}];
    // Badges start hidden and pop on their card's first ping; every ping jolts the card.
    const seen = new Set();
    pings.forEach(([i, t], k) => {{
      if (!seen.has(i)) {{
        seen.add(i);
        tl.fromTo(`#b-badge${{i}}`, {{ scale: 0 }}, {{ scale: 1, duration: 0.22, ease: "back.out(2.2)" }}, t);
      }}
      tl.fromTo(`#b-jit${{i}}`, {{ rotation: 0, x: 0 }}, {{ keyframes: [{{ rotation: k % 2 ? 2.2 : -2.2, x: k % 2 ? 7 : -7, duration: 0.05 }}, {{ rotation: k % 2 ? -1.4 : 1.4, x: k % 2 ? -4 : 4, duration: 0.06 }}, {{ rotation: 0, x: 0, duration: 0.08 }}], immediateRender: false }}, t);
    }});
    // Collapse (2.75 → 3.3): the headline leaves; each card flies to its tile on the cube face and becomes it.
    tl.fromTo("#b-head", {{ y: 0, opacity: 1 }}, {{ y: -260, opacity: 0, duration: 0.4, ease: "power3.in" }}, {COL - 0.1});
    moves.forEach(([dx, dy], i) => {{
      const t0 = {COL} + (i % 3) * 0.03 + Math.floor(i / 3) * 0.03;
      tl.fromTo(`#b-slot${{i}}`, {{ x: 0, y: 0 }}, {{ x: dx, y: dy, duration: 0.7, ease: "power3.inOut" }}, t0);
      tl.fromTo(`#b-card${{i}}`, {{ scale: 1, opacity: 1 }}, {{ scale: {TILE / CARD:.4f}, opacity: 0, duration: 0.7, ease: "power3.inOut" }}, t0);
      tl.fromTo(`#b-tile${{i}}`, {{ scale: {CARD / TILE:.4f}, opacity: 0 }}, {{ scale: 1, opacity: 1, duration: 0.7, ease: "power3.inOut" }}, t0);
    }});
    // The cube face's dark backing forms under the landing tiles, so the cut into the cube is seamless.
    tl.fromTo("#b-face", {{ opacity: 0, scale: 0.9 }}, {{ opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" }}, {COL + 0.4});
    // The ground floods acid from the face's centre.
    tl.fromTo("#b-flood", {{ clipPath: "circle(0px at {FACE_CX}px {FACE_CY}px)" }}, {{ clipPath: "circle(1400px at {FACE_CX}px {FACE_CY}px)", duration: 0.6, ease: "power2.inOut" }}, {COL + 0.65});
    window.__timelines["before"] = tl;
  </script>
</template>
"""
    (ROOT / "compositions/before.html").write_text(html)
    return D, times, COL


# ── core: the cube, four real windows opened from their tiles, the claim, the end card ─────────
FEATURES = [
    # tile, video,   frames, ground, window height (css px), window centre y, verb
    (1, "todo",  54, LAV,   540, 1050, "Plan it."),
    (3, "cal",   63, CYAN,  720, 1140, "See it."),
    (0, "timer", 94, ACID,  540, 1050, "Run it."),
    (2, "habit", 66, CORAL, 540, 1050, "Keep it."),
]
# Captures are the window plus a 110 css px margin of ground, at 2x. On screen every window is 860 px wide.
WIN_W, PAD, K = 540, 110, 860 / 540


LINE_OF = {"todo": "plan", "cal": "see", "timer": "run", "habit": "keep"}


def core():
    t = {}
    rw = {x["w"].strip(".,?").lower(): x["s"] for x in VOICE["reveal"]["words"]}
    t["reveal_at"] = 0.2
    t["one_in"] = round(t["reveal_at"] + rw["one"] - 0.05, 3)          # "One app" lands on "one?"
    t["iso"] = (round(t["reveal_at"] + rw["one"] + 0.3, 3), round(t["reveal_at"] + rw["one"] + 2.2, 3))
    S = round(t["reveal_at"] + VEND["reveal"] + 0.6, 3)
    feats = []
    for k, (tile, vid, frames, ground, wh, vcy, verb) in enumerate(FEATURES):
        f = {"k": k, "tile": tile, "vid": vid, "ground": ground, "vw": round(WIN_W * K), "vh": round(wh * K), "wh": wh, "vcy": vcy, "verb": verb, "frames": frames}
        f["zs"] = round(S + (0.65 if k == 0 else 0.0), 3)
        f["ze"] = round(f["zs"] + 0.5, 3)
        f["vs"] = round(f["ze"] - 0.02, 3)
        f["line"] = LINE_OF[vid]
        f["voice_at"] = round(f["vs"] + 0.35, 3)
        footage = frames / FPS / PLAYBACK
        f["vd"] = round(max(VEND[f["line"]] + 0.35 + 0.6, footage + 0.6), 3)
        f["cb"] = round(f["vs"] + f["vd"], 3)
        feats.append(f)
        S = f["cb"] + 0.5 + 0.3
    last = feats[-1]["cb"] + 0.5
    cw = [x for x in VOICE["claim"]["words"]]
    t["claim"] = round(last + 0.35, 3)                       # claim words land with the voice
    t["claim_voice"] = round(t["claim"] - 0.15, 3)
    t["claim_words"] = [round(t["claim_voice"] + cw[i]["s"], 3) for i in (0, 2, 3)]
    t["end"] = round(t["claim_voice"] + next(x["s"] for x in cw if x["w"].startswith("Kernel")) - 0.35, 3)
    t["cta"] = round(t["claim_voice"] + next(x["s"] for x in cw if x["w"].startswith("Free")), 3)
    D = round(t["claim_voice"] + VEND["claim"] + 2.0, 3)

    def tile_html(i, extra=""):
        extra = extra or f' id="c-ft{i}"' 
        cx, cy = (i % 3 - 1) * TILE_STEP + FACE / 2, (i // 3 - 1) * TILE_STEP + FACE / 2
        return f'<div class="tile" style="left:{cx - TILE / 2}px; top:{cy - TILE / 2}px"{extra}>{GLYPHS[i]}</div>'

    front = "".join(tile_html(i) for i in range(9))
    def plain(face, lit):
        out = []
        for i in range(9):
            cx, cy = (i % 3 - 1) * TILE_STEP + FACE / 2, (i // 3 - 1) * TILE_STEP + FACE / 2
            cls = "vox lit-" + face if i == 4 else "vox"
            out.append(f'<i class="{cls}" style="left:{cx - TILE / 2}px; top:{cy - TILE / 2}px"></i>')
        return "".join(out)

    zooms, vids = [], []
    for f in feats:
        tx, ty = tile_center(f["tile"])
        f["tx"], f["ty"] = tx, ty
        zooms.append(f"""
    <div class="zoom" id="c-zoom{f['k']}" style="left:{tx - TILE / 2}px; top:{ty - TILE / 2}px">
      <div class="tile" style="left:0; top:0">{GLYPHS[f['tile']]}</div>
      <div class="zoom-fill" id="c-zfill{f['k']}" style="background:{f['ground']}"></div>
    </div>""")
        vw, vh = f["vw"], f["vh"]
        full_w, full_h = round((WIN_W + 2 * PAD) * K, 1), round((f["wh"] + 2 * PAD) * K, 1)
        vids.append(f"""
    <div class="vground" id="c-vg{f['k']}" style="background:{f['ground']}"></div>
    <div class="vwrap" id="c-vw{f['k']}" style="left:{540 - vw / 2}px; top:{f['vcy'] - vh / 2}px; width:{vw}px; height:{vh}px">
      <video id="c-video{f['k']}" class="clip" src="assets/windows/{f['vid']}.mp4" muted playsinline
        data-start="{f['vs']}" data-duration="{round(f['vd'] + 0.55, 3)}" data-playback-rate="{PLAYBACK}" data-track-index="2"
        style="position:absolute; left:{-round(PAD * K, 1)}px; top:{-round(PAD * K, 1)}px; width:{full_w}px; height:{full_h}px; display:block"></video>
    </div>
    <div class="verb" id="c-verb{f['k']}">{f['verb']}</div>""")

    tiles_end = "".join(
        f'<div class="etile{" zero" if ch == "0" else ""}" id="c-et{i}" style="background:{c}">{ch}</div>'
        for i, (ch, c) in enumerate((("K", ACID), ("R", CYAN), ("N", CORAL), ("L", LAV), ("0", PAPER))))

    js_feats = ",".join(
        "{" + f"k:{f['k']},tile:{f['tile']},zs:{f['zs']},ze:{f['ze']},vs:{f['vs']},vd:{f['vd']},cb:{f['cb']},tx:{f['tx']},ty:{f['ty']},vw:{f['vw']},vh:{f['vh']},vcy:{f['vcy']}" + "}"
        for f in feats)

    html = f"""<template>
  <style>
    {FONTS}
    #root {{ position: absolute; inset: 0; overflow: hidden; font-family: "KGeist", sans-serif; background: {ACID}; }}
    #c-stage {{ position: absolute; inset: 0; perspective: 2600px; perspective-origin: {FACE_CX}px {FACE_CY}px; }}
    #c-pos {{ position: absolute; left: {FACE_CX}px; top: {FACE_CY}px; width: 0; height: 0; transform-style: preserve-3d; }}
    #c-zoff {{ position: absolute; left: 0; top: 0; width: 0; height: 0; transform-style: preserve-3d; transform: translateZ(-{FACE // 2}px); }}
    #c-cube {{ position: absolute; left: 0; top: 0; width: 0; height: 0; transform-style: preserve-3d; }}
    .holder {{ position: absolute; left: -{FACE // 2}px; top: -{FACE // 2}px; width: {FACE}px; height: {FACE}px; transform-style: preserve-3d; }}
    .holder.front {{ transform: translateZ({FACE // 2}px); }}
    .holder.right {{ transform: rotateY(90deg) translateZ({FACE // 2}px); }}
    .holder.top {{ transform: rotateX(90deg) translateZ({FACE // 2}px); }}
    .face {{ position: absolute; inset: 0; border-radius: 30px; background: #070707; }}
    .vox {{ position: absolute; width: {TILE}px; height: {TILE}px; border-radius: 22px; display: block; }}
    .top .vox {{ background: #4a4a4a; }} .right .vox {{ background: #1d1d1d; }}
    .vox.lit-top {{ background: #e2ff9c; }} .vox.lit-right {{ background: #9cc235; }}
    {GLYPH_CSS}
    .zoom {{ position: absolute; width: {TILE}px; height: {TILE}px; opacity: 0; }}
    .zoom-fill {{ position: absolute; inset: 0; border-radius: 22px; opacity: 0; }}
    .vground {{ position: absolute; inset: 0; opacity: 0; }}
    .vwrap {{ position: absolute; overflow: hidden; border-radius: {round(8 * K, 1)}px; box-shadow: 0 60px 120px rgba(0,0,0,.38), 0 16px 36px rgba(0,0,0,.26); }}
    .head {{ position: absolute; left: 120px; top: 300px; font-weight: 800; font-size: 150px; letter-spacing: -0.055em; line-height: 0.92; color: {INK}; white-space: nowrap; }}
    .head span {{ display: inline-block; margin-right: 0.22em; }}
    .verb {{ position: absolute; left: 120px; top: 300px; font-weight: 800; font-size: 150px; letter-spacing: -0.055em; line-height: 0.92; color: {INK}; white-space: nowrap; opacity: 0; }}
    #c-tiles {{ position: absolute; left: 0; right: 0; top: 950px; display: flex; justify-content: center; gap: 14px; }}
    .etile {{ opacity: 0; width: 160px; height: 184px; border-radius: 22px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 160px; color: {INK}; letter-spacing: -0.04em; box-shadow: inset 0 0 0 5px {INK}; }}
    .etile.zero {{ font-family: "KMono", monospace; font-size: 140px; }}
    #c-cta {{ position: absolute; left: 0; right: 0; top: 1168px; display: flex; flex-direction: column; align-items: center; gap: 24px; opacity: 0; }}
    #c-btn {{ background: {INK}; color: {ACID}; font-weight: 700; font-size: 42px; padding: 24px 44px; border-radius: 22px; }}
    #c-os {{ font-family: "KMono", monospace; font-weight: 500; font-size: 32px; color: {INK}; }}
  </style>
  <div id="root" data-composition-id="core" data-width="1080" data-height="1920">
    <div id="c-stage"><div id="c-pos"><div id="c-zoff"><div id="c-cube">
      <div class="holder top"><div class="face"></div>{plain('top', True)}</div>
      <div class="holder right"><div class="face"></div>{plain('right', True)}</div>
      <div class="holder front"><div class="face"></div>{front}</div>
    </div></div></div></div>
    <div class="head" id="c-one"><span id="c-one0">One</span><span id="c-one1">app</span></div>
    {''.join(zooms)}
    {''.join(vids)}
    <div class="head" id="c-claim" style="opacity:1"><span id="c-cl0">One app</span><br /><span id="c-cl1">instead</span><br /><span id="c-cl2">of nine.</span></div>
    <div id="c-tiles">{tiles_end}</div>
    <div id="c-cta"><div id="c-btn">Free download · link in bio</div><div id="c-os">Windows · macOS · Linux</div></div>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    const F = [{js_feats}];
    const A = "expo.out";
    // "One app" lands word by word while the face sits exactly where the nine cards landed.
    ["#c-one0", "#c-one1"].forEach((id, i) => tl.fromTo(id, {{ opacity: 0, filter: "blur(10px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.16, ease: "power2.out" }}, {t['one_in']} + i * 0.08));
    // The side faces exist only once the cube starts to turn (no hairlines at the frontal cut).
    tl.fromTo(".holder.top, .holder.right", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.12 }}, {t['iso'][0]});
    // The face becomes a cube: it turns into the logo pose.
    tl.fromTo("#c-pos", {{ rotationX: 0, scale: 1, y: 0 }}, {{ rotationX: -35.26, scale: 0.82, y: 150, duration: {t['iso'][1] - t['iso'][0]}, ease: "power3.inOut" }}, {t['iso'][0]});
    tl.fromTo("#c-cube", {{ rotationY: 0 }}, {{ rotationY: -45, duration: {t['iso'][1] - t['iso'][0]}, ease: "power3.inOut" }}, {t['iso'][0]});
    // Back to the front face for the first feature; "One app" leaves.
    tl.fromTo("#c-one", {{ opacity: 1, y: 0 }}, {{ opacity: 0, y: -200, duration: 0.35, ease: "power3.in" }}, F[0].zs - 0.6);
    tl.fromTo("#c-pos", {{ rotationX: -35.26, scale: 0.82, y: 150 }}, {{ rotationX: 0, scale: 1, y: 0, duration: 0.6, ease: "power2.inOut", immediateRender: false }}, F[0].zs - 0.65);
    tl.fromTo("#c-cube", {{ rotationY: -45 }}, {{ rotationY: 0, duration: 0.6, ease: "power2.inOut", immediateRender: false }}, F[0].zs - 0.65);
    F.forEach((f) => {{
      // Zoom through the tile: it grows past the frame and its fill becomes the window's ground.
      tl.fromTo(`#c-zoom${{f.k}}`, {{ opacity: 0 }}, {{ opacity: 1, duration: 0.01 }}, f.zs);
      tl.fromTo(`#c-ft${{f.tile}}`, {{ opacity: 1 }}, {{ opacity: 0, duration: 0.01 }}, f.zs);
      tl.fromTo(`#c-ft${{f.tile}}`, {{ opacity: 0 }}, {{ opacity: 1, duration: 0.01, immediateRender: false }}, f.cb + 0.51);
      tl.fromTo(`#c-zoom${{f.k}}`, {{ scale: 1 }}, {{ scale: 18, duration: f.ze - f.zs, ease: "power3.in" }}, f.zs);
      tl.fromTo(`#c-zfill${{f.k}}`, {{ opacity: 0 }}, {{ opacity: 1, duration: 0.32, ease: "power1.in" }}, f.zs + 0.1);
      tl.fromTo(`#c-vg${{f.k}}`, {{ opacity: 0 }}, {{ opacity: 1, duration: 0.01 }}, f.ze - 0.02);
      // While the window is up, the grown tile underneath is hidden; it returns for the carry back.
      tl.fromTo(`#c-zoom${{f.k}}`, {{ visibility: "visible" }}, {{ visibility: "hidden", duration: 0.01, immediateRender: false }}, f.ze + 0.01);

      // The real window rises whole and settles; the verb lands and holds.
      tl.fromTo(`#c-vw${{f.k}}`, {{ y: 120, scale: 1.05, opacity: 0 }}, {{ y: 0, scale: 1, opacity: 1, duration: 0.6, ease: A }}, f.vs);
      tl.fromTo(`#c-verb${{f.k}}`, {{ opacity: 0, filter: "blur(10px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.16, ease: "power2.out" }}, f.vs + 0.1);
      // Carry back: the window shrinks into its tile, the fill drains back into the tile.
      tl.fromTo(`#c-verb${{f.k}}`, {{ opacity: 1, y: 0 }}, {{ opacity: 0, y: -160, duration: 0.3, ease: "power3.in", immediateRender: false }}, f.cb - 0.05);
      tl.fromTo(`#c-vw${{f.k}}`, {{ scale: 1, x: 0, y: 0, opacity: 1, filter: "blur(0px)" }}, {{ scale: 0.13, x: f.tx - 540, y: f.ty - f.vcy, opacity: 0, filter: "blur(6px)", duration: 0.5, ease: "power3.in", immediateRender: false }}, f.cb);
      // The window's colour closes like an iris into its tile, over the cube.
      tl.fromTo(`#c-vg${{f.k}}`, {{ clipPath: `circle(1500px at ${{f.tx}}px ${{f.ty}}px)` }}, {{ clipPath: `circle(80px at ${{f.tx}}px ${{f.ty}}px)`, duration: 0.5, ease: "power3.in", immediateRender: false }}, f.cb);
      tl.fromTo(`#c-vg${{f.k}}`, {{ opacity: 1 }}, {{ opacity: 0, duration: 0.08, immediateRender: false }}, f.cb + 0.46);
    }});
    // Claim: the cube settles back into the logo pose, lower; the line slams in word group by group.
    tl.fromTo("#c-pos", {{ rotationX: 0, scale: 1, y: 0 }}, {{ rotationX: -35.26, scale: 0.62, y: 470, duration: 0.9, ease: "power3.inOut", immediateRender: false }}, {t['claim'] - 0.45});
    tl.fromTo("#c-cube", {{ rotationY: 0 }}, {{ rotationY: -45, duration: 0.9, ease: "power3.inOut", immediateRender: false }}, {t['claim'] - 0.45});
    const CW = {t['claim_words']};
    ["#c-cl0", "#c-cl1", "#c-cl2"].forEach((id, i) => tl.fromTo(id, {{ scale: 1.25, opacity: 0, filter: "blur(12px)" }}, {{ scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.35, ease: A }}, CW[i] - 0.05));
    // End card, calm: the claim clears, the cube glides up and stays in the logo pose,
    // the K·R·N·L·0 tiles rise in under it on "Kernel Zero", the call to action lands on "Free".
    ["#c-cl0", "#c-cl1", "#c-cl2"].forEach((id, i) => tl.fromTo(id, {{ opacity: 1, filter: "blur(0px)" }}, {{ opacity: 0, filter: "blur(8px)", duration: 0.25, ease: "power2.in", immediateRender: false }}, {t['end']} - 0.3 + i * 0.05));
    tl.fromTo("#c-pos", {{ scale: 0.62, y: 470 }}, {{ scale: 0.56, y: -260, duration: 0.9, ease: "power3.inOut", immediateRender: false }}, {t['end']} - 0.2);
    for (let i = 0; i < 5; i++) tl.fromTo(`#c-et${{i}}`, {{ y: 70, opacity: 0, filter: "blur(8px)" }}, {{ y: 0, opacity: 1, filter: "blur(0px)", duration: 0.6, ease: A }}, {t['end']} + 0.25 + i * 0.06);
    tl.fromTo("#c-cta", {{ opacity: 0, y: 30 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: A }}, {t['cta']} - 0.1);
    window.__timelines["core"] = tl;
  </script>
</template>
"""
    (ROOT / "compositions/core.html").write_text(html)
    return D, t, feats


def captions(groups, D):
    """Word-timed captions for viewers watching muted: one short group at a time, each word lifting
    to full ink as it is spoken. Sits under the headline, above the windows."""
    els, js = [], []
    for g, (start, end, words, ink) in enumerate(groups):
        spans = "".join(f'<span id="cap{g}w{i}">{w["w"]}</span> ' for i, w in enumerate(words))
        els.append(f'<div class="cap clip" id="cap{g}" data-start="{start}" data-duration="{round(end - start, 3)}" data-track-index="0" style="color:{ink}">{spans.strip()}</div>')
        for i, w in enumerate(words):
            js.append(f'tl.fromTo("#cap{g}w{i}", {{ opacity: 0.32 }}, {{ opacity: 1, duration: 0.08 }}, {round(w["abs"], 3)});')
    html = f"""<template>
  <style>
    {FONTS}
    #root {{ position: absolute; inset: 0; pointer-events: none; }}
    .cap {{ position: absolute; left: 120px; right: 120px; top: 478px; font-family: "KGeist", sans-serif; font-weight: 600; font-size: 46px; line-height: 1.18; letter-spacing: -0.01em; }}
    .cap span {{ opacity: 0.32; }}
  </style>
  <div id="root" data-composition-id="captions" data-width="1080" data-height="1920">
    {''.join(els)}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {' '.join(js)}
    window.__timelines["captions"] = tl;
  </script>
</template>
"""
    (ROOT / "compositions/captions.html").write_text(html)


def caption_groups(line, at, ink, max_words=5):
    """Splits a narrated line into groups of up to five words, breaking after punctuation."""
    ws = [dict(w, abs=at + w["s"]) for w in VOICE[line]["words"]]
    groups, cur = [], []
    for w in ws:
        cur.append(w)
        if len(cur) >= max_words or w["w"][-1] in ".,?!" and len(cur) >= 2:
            groups.append(cur); cur = []
    if cur:
        groups.append(cur)
    out = []
    for i, g in enumerate(groups):
        start = round(g[0]["abs"] - 0.12, 3)
        nxt = groups[i + 1][0]["abs"] - 0.12 if i + 1 < len(groups) else g[-1]["abs"] + (g[-1]["e"] - g[-1]["s"]) + 0.5
        out.append((start, round(nxt, 3), g, ink))
    return out


def index(bD, cD):
    D = round(bD + cD, 3)
    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="assets/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1080px; height: 1920px; overflow: hidden; background: {DARK}; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{D}" data-width="1080" data-height="1920">
      <div id="before" data-composition-id="before" data-composition-src="compositions/before.html"
        data-start="0" data-duration="{bD}" data-track-index="0" data-track-kind="graphics" data-width="1080" data-height="1920"></div>
      <div id="core" data-composition-id="core" data-composition-src="compositions/core.html"
        data-start="{bD}" data-duration="{cD}" data-track-index="0" data-track-kind="graphics" data-width="1080" data-height="1920"></div>
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html"
        data-start="0" data-duration="{D}" data-track-index="1" data-track-kind="captions" data-width="1080" data-height="1920"></div>
{AUDIO}
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
    (ROOT / "index.html").write_text(html)
    return D


# ── sound: every effect placed so its measured peak lands one frame after its picture ──────────
PEAK = {"pop": 0.12, "click-soft": 0.073, "click": 0.073, "whoosh": 0.162, "whoosh-short": 0.162, "impact-bass-1": 0.073,
        "riser": 3.472, "key-press": 0.076, "notification": 0.229, "ping": 0.324, "typing": 0.454}
DUR = {"pop": 0.72, "click-soft": 0.37, "click": 0.37, "whoosh": 0.57, "whoosh-short": 0.57, "impact-bass-1": 2.12,
       "riser": 10.03, "key-press": 0.43, "notification": 2.46, "ping": 1.32, "typing": 1.54}
AUDIO = ""
SFX_GAIN = 0.36   # effects sit well under the voice (about -9 dB from the first cut)


def place(cues, total):
    """Each cue's measured peak lands one frame after its picture; overlapping cues take the next lane."""
    out, lanes = [], []
    for n, (name, at, vol, *dur) in enumerate(sorted(cues, key=lambda c: c[1])):
        start = round(at + 1 / FPS - PEAK[name], 3)
        trim = 0.0
        if start < 0:
            trim, start = -start, 0.0
        d = dur[0] if dur else DUR[name] - trim
        d = round(min(d, total - start - 0.001), 3)
        lane = next((i for i, end in enumerate(lanes) if end <= start), None)
        if lane is None:
            lanes.append(0); lane = len(lanes) - 1
        lanes[lane] = start + d
        media = f' data-media-start="{round(trim, 3)}"' if trim else ""
        out.append(f'      <audio id="sfx{n}" class="clip" src="assets/sfx/{name}.mp3" data-start="{start}" data-duration="{d}"{media} data-volume="{round(vol * SFX_GAIN, 3)}" data-track-index="{5 + lane}"></audio>')
    return "\n".join(out)


if __name__ == "__main__":
    bD, pings, COL = before()
    cD, t, feats = core()
    off = bD
    D_total = round(bD + cD, 3)
    cues = []
    ring = ["notification", "ping", "pop"]
    for k, p in enumerate(pings[:9]):                       # one sound per tool as it is named
        cues.append((ring[k % 3], p, [0.3, 0.38, 0.42][k % 3], 0.5))
    cues += [("whoosh", COL + 0.35, 0.45), ("impact-bass-1", COL + 0.7, 0.45)]
    cues += [("whoosh-short", off + t["iso"][0] + 0.6, 0.25)]
    for f in feats:
        cues.append(("whoosh" if f["k"] % 2 == 0 else "whoosh-short", off + f["ze"], 0.38))
        vs = off + f["vs"]
        r = 1 / PLAYBACK
        if f["vid"] == "todo":
            cues += [("typing", vs + 6 / FPS * r, 0.4, 1.0), ("pop", vs + 9 / FPS * r, 0.35)]
        if f["vid"] == "cal":
            cues += [("typing", vs + 4 / FPS * r, 0.4, 1.2), ("pop", vs + 38 / FPS * r, 0.4)]
        if f["vid"] == "timer":
            cues += [("click", vs + 10 / FPS * r, 0.5)]
        if f["vid"] == "habit":
            cues += [(("pop", "click-soft")[j % 2], vs + fr / FPS * r, 0.38) for j, fr in enumerate((6, 16, 26, 36, 46))]
    cues += [("impact-bass-1", off + t["end"] + 0.3, 0.35)]
    AUDIO = place(cues, D_total)
    # Voice: the clock of the film.
    vo = [("chaos", CHAOS_AT), ("reveal", off + t["reveal_at"])] + [(f["line"], off + f["voice_at"]) for f in feats] + [("claim", off + t["claim_voice"])]
    AUDIO += "\n" + "\n".join(
        f'      <audio id="vo-{k}" class="clip" src="assets/voice/{k}.mp3" data-start="{round(at, 3)}" data-duration="{round(min(VLEN[k] - 0.02, D_total - at - 0.001), 3)}" data-volume="1" data-track-index="4"></audio>'
        for k, at in vo)
    # Captions: under the headline; not for the claim (it is on screen as the headline and the CTA).
    groups = caption_groups("chaos", CHAOS_AT, PAPER)
    groups += caption_groups("reveal", off + t["reveal_at"], INK)
    for f in feats:
        groups += caption_groups(f["line"], off + f["voice_at"], INK)
    # clamp each group so it never overlaps the next
    groups = [(st, min(en, groups[i + 1][0]) if i + 1 < len(groups) else en, ws, ink) for i, (st, en, ws, ink) in enumerate(groups)]
    captions(groups, D_total)
    D = index(bD, cD)
    print("before", bD, "core", cD, "total", D)
    print({k: v for k, v in t.items()})
    for f in feats:
        print(f["vid"], "zoom", round(off + f["zs"], 2), "video", round(off + f["vs"], 2), "→", round(off + f["cb"], 2), "voice", round(off + f["voice_at"], 2))
