"""Shared helpers for build.py: constants, the composition writer, the cube art and sound placement."""
import json, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
FPS, W, H = 30, 1920, 1080
ACID, LAV, CYAN, CORAL, INK, PAPER, GREY = "#c9f158", "#a98bf6", "#22d3ee", "#ee8466", "#0a0908", "#f4efe2", "#cdc9be"
TL = json.loads((ROOT / "timeline.json").read_text())
TOTAL = TL["total"]
DOWN, BEATS, VOICE_AT = TL["downbeats"], TL["beats"], TL["voice"]
WORDS = {k: json.loads((ROOT / f"assets/voice/{k}.json").read_text())["words"] for k in VOICE_AT}
def vt(k, word, nth=0):
    """absolute time (s) the nth occurrence of `word` in voice line k is spoken"""
    hits = [w for w in WORDS[k] if w["w"].strip(".,?!'").lower() == word.lower()]
    return round(VOICE_AT[k]["start"] + hits[nth]["s"], 3)
def beat_at_or_after(t): return next(b for b in BEATS if b >= t - 1e-6)
def beat_nearest(t): return min(BEATS, key=lambda b: abs(b - t))
FONTS = """
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-600-normal.woff2") format("woff2"); font-weight: 600; }
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-700-normal.woff2") format("woff2"); font-weight: 700; }
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-800-normal.woff2") format("woff2"); font-weight: 800; }
  @font-face { font-family: "KMono"; src: url("assets/fonts/jetbrains-mono-latin-500-normal.woff2") format("woff2"); font-weight: 500; }
  @font-face { font-family: "KMono"; src: url("assets/fonts/jetbrains-mono-latin-800-normal.woff2") format("woff2"); font-weight: 800; }
"""
def write(name, body, css, js):
    html = f"""<template>
  <style>
    {FONTS}
    #root {{ position: absolute; inset: 0; overflow: hidden; font-family: "KGeist", sans-serif; }}
    {css}
  </style>
  <div id="root" data-composition-id="{name}" data-width="{W}" data-height="{H}">
    {body}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {js}
    window.__timelines["{name}"] = tl;
  </script>
</template>
"""
    (ROOT / "compositions").mkdir(exist_ok=True)
    (ROOT / f"compositions/{name}.html").write_text(html)

# ── the KRNL0 cube (original "Lit Core" colours), iso, rounded 3x3 cells; units: 200 tall, centred on 0,0 ──
MATS = ["0.866,-0.5,0.866,0.5,-86.6,-50", "0.866,0.5,0,1,-86.6,-50", "0.866,-0.5,0,1,0,0"]
def cube_svg(size_px=560, ids=True):
    cells = ["#4a4a4a", "#303030", "#1c1c1c"]; cores = ["#e6ff9c", "#b5e03a", "#9bc232"]
    out = [f'<svg id="cubesvg" width="{size_px}" height="{size_px}" viewBox="-100 -100 200 200" overflow="visible" style="overflow:visible">',
           '<defs><filter id="cglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter></defs>',
           '<path d="M0,-98 L85,-49 L85,49 L0,98 L-85,49 L-85,-49Z" fill="#050505" stroke="#050505" stroke-width="12" stroke-linejoin="round"/>']
    for f, m in enumerate(MATS):
        out.append(f'<g transform="matrix({m})">')
        for i in range(3):
            for j in range(3):
                x, y = 2.5 + i * 33.333, 2.5 + j * 33.333
                if (i, j) == (1, 1):
                    out.append(f'<rect id="glow{f}" x="{x-3}" y="{y-3}" width="34.33" height="34.33" rx="10" fill="{cores[f]}" filter="url(#cglow)" opacity="0.7"/>')
                    out.append(f'<rect id="core{f}" x="{x}" y="{y}" width="28.33" height="28.33" rx="10" fill="{cores[f]}"/>')
                else:
                    out.append(f'<rect x="{x}" y="{y}" width="28.33" height="28.33" rx="10" fill="{cells[f]}"/>')
        out.append('</g>')
    out.append('</svg>')
    return "".join(out)

PEAK = {"pop": 0.12, "click-soft": 0.073, "click": 0.073, "whoosh": 0.162, "whoosh-short": 0.162, "impact-bass-1": 0.073,
        "impact-bass-2": 1.986, "typing": 0.454, "riser": 3.472, "whoosh-cinematic": 2.503, "sparkle": 0.027, "ping": 0.324,
        "notification": 0.229, "key-press": 0.076}
DUR = {"pop": 0.72, "click-soft": 0.37, "click": 0.37, "whoosh": 0.57, "whoosh-short": 0.57, "impact-bass-1": 2.12, "impact-bass-2": 2.59,
       "typing": 1.54, "riser": 10.03, "whoosh-cinematic": 5.54, "sparkle": 1.8, "ping": 1.32, "notification": 2.46, "key-press": 0.43}
SFX_GAIN = 0.36
def place_sfx(cues, first_lane=8):
    out, lanes = [], []
    for n, (name, at, vol, *dur) in enumerate(sorted(cues, key=lambda c: c[1])):
        start = round(at + 1 / FPS - PEAK[name], 3); trim = 0.0
        if start < 0: trim, start = -start, 0.0
        d = dur[0] if dur else DUR[name] - trim
        d = round(min(d, TOTAL - start - 0.001), 3)
        lane = next((i for i, e in enumerate(lanes) if e <= start), None)
        if lane is None: lanes.append(0); lane = len(lanes) - 1
        lanes[lane] = start + d
        media = f' data-media-start="{round(trim, 3)}"' if trim else ""
        out.append(f'      <audio id="sfx{n}" class="clip" src="assets/sfx/{name}.mp3" data-start="{start}" data-duration="{d}"{media} data-volume="{round(vol * SFX_GAIN, 3)}" data-track-index="{first_lane + lane}"></audio>')
    return "\n".join(out)
