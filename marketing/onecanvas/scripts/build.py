"""Writes compositions/*.html and index.html for "One day, one take" (storyline A, marketing cut).

The picture is one continuous recording of the real canvas (assets/take.mp4, 1080x1200, from capture.cjs) placed in the
middle of the frame. Everything around it is drawn here: the ground (the same top-to-bottom wipe the recording uses),
headlines in the website's own words, captions, the end card, the voice, quiet effects and a minimal music bed.
Run: python3 scripts/plan.py && node scripts/capture.cjs && python3 scripts/build.py
"""
import json, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FPS = 30
ACID, LAV, CYAN, CORAL, DARK, INK, PAPER = "#c9f158", "#a98bf6", "#22d3ee", "#ee8466", "#141414", "#0a0908", "#f4efe2"
T = json.loads((ROOT / "timing.json").read_text())
TOTAL, MOVE, BEATS, VEND = T["total"], T["move"], T["beats"], T["vend"]
STAGE_TOP, STAGE_H = 560, 1200
LINES = ["hook", "notes", "drag", "habits", "end"]
VOICE = {k: json.loads((ROOT / f"assets/voice/{k}.json").read_text()) for k in LINES}
VLEN = {k: float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(ROOT / f"assets/voice/{k}.mp3")], capture_output=True, text=True).stdout) for k in LINES}
WORD = {k: {w["w"].strip(".,?!'").lower(): w["s"] for w in reversed(v["words"])} for k, v in VOICE.items()}

FONTS = """
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-600-normal.woff2") format("woff2"); font-weight: 600; }
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-700-normal.woff2") format("woff2"); font-weight: 700; }
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-800-normal.woff2") format("woff2"); font-weight: 800; }
  @font-face { font-family: "KMono"; src: url("assets/fonts/jetbrains-mono-latin-500-normal.woff2") format("woff2"); font-weight: 500; }
  @font-face { font-family: "KMono"; src: url("assets/fonts/jetbrains-mono-latin-800-normal.woff2") format("woff2"); font-weight: 800; }
"""

HEADLINES = {
    "hook":   ["Your whole day,", "one canvas."],
    "notes":  ["Put anything", "next to your plan."],
    "drag":   ["Pick it up,", "put it anywhere."],
    "habits": ["Habits you can", "see building."],
    "end":    ["One app", "instead of nine."],
}
flood_at = round(T["voice"]["end"] + WORD["end"]["kernel"] - 0.35, 3)
cta_at = round(T["voice"]["end"] + WORD["end"]["link"] - 0.15, 3)


def write(name, body, css, js):
    html = f"""<template>
  <style>
    {FONTS}
    #root {{ position: absolute; inset: 0; overflow: hidden; font-family: "KGeist", sans-serif; }}
    {css}
  </style>
  <div id="root" data-composition-id="{name}" data-width="1080" data-height="1920">
    {body}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    const A = "expo.out";
    {js}
    window.__timelines["{name}"] = tl;
  </script>
</template>
"""
    (ROOT / f"compositions/{name}.html").write_text(html)


# ── ground: one full-frame block per beat, each wiped in from the top exactly like the recording's ground ──
def ground():
    blocks = "".join(f'<div class="gb" id="gb{i}" style="background:{b["color"]}"></div>' for i, b in enumerate(BEATS))
    js = "\n    ".join(
        f'tl.fromTo("#gb{i}", {{ height: 0 }}, {{ height: 1920, duration: {MOVE}, ease: "power2.inOut" }}, {b["start"]});'
        for i, b in enumerate(BEATS) if i > 0 and b["color"] != BEATS[i - 1]["color"])
    write("ground", blocks, ".gb { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; } .gb:first-child { height: 1920px; }", js)


# ── headlines ──
def headlines():
    css = ".hl { position: absolute; left: 120px; top: 250px; font-weight: 800; font-size: 112px; letter-spacing: -0.055em; line-height: 0.95; white-space: nowrap; color: %s; } .hl span { display: inline-block; margin-right: 0.2em; }" % INK
    body, js = [], []
    for bi, b in enumerate(BEATS):
        lines = HEADLINES[b["name"]]
        spans = "<br />".join("".join(f'<span id="h{bi}-{i}-{j}">{w}</span>' for j, w in enumerate(l.split(" "))) for i, l in enumerate(lines))
        body.append(f'<div class="hl" id="h{bi}">{spans}</div>')
        at = 0.0 if bi == 0 else b["start"] + 0.45
        n = 0
        for i, l in enumerate(lines):
            for j, _ in enumerate(l.split(" ")):
                if bi == 0:
                    js.append(f'tl.set("#h{bi}-{i}-{j}", {{ opacity: 1 }}, 0);')                      # frame 0 already carries the headline
                else:
                    js.append(f'tl.fromTo("#h{bi}-{i}-{j}", {{ opacity: 0, filter: "blur(10px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "power2.out" }}, {round(at + n * 0.07, 3)});')
                n += 1
        if bi < len(BEATS) - 1:
            nxt = BEATS[bi + 1]["start"]
            js.append(f'tl.fromTo("#h{bi}", {{ opacity: 1, y: 0, filter: "blur(0px)" }}, {{ opacity: 0, y: -50, filter: "blur(10px)", duration: 0.35, ease: "power3.in", immediateRender: false }}, {round(nxt + 0.05, 3)});')
        else:
            js.append(f'tl.fromTo("#h{bi}", {{ opacity: 1 }}, {{ opacity: 0, duration: 0.3, ease: "power2.in", immediateRender: false }}, {round(flood_at, 3)});')
    write("headlines", "".join(body), css, "\n    ".join(js))


# ── end card ──
def endcard():
    tiles = "".join(f'<div class="etile{" zero" if ch == "0" else ""}" id="et{i}" style="background:{c}">{ch}</div>' for i, (ch, c) in enumerate((("K", ACID), ("R", CYAN), ("N", CORAL), ("L", LAV), ("0", PAPER))))
    body = f"""
    <div id="flood"></div>
    <img id="logo" src="assets/icon.svg" alt="KRNL0" />
    <div id="tiles">{tiles}</div>
    <div id="cta"><div id="btn">Free download · link in bio</div><div id="os">Windows · macOS · Linux</div></div>"""
    css = f"""
    #flood {{ position: absolute; inset: 0; background: {ACID}; clip-path: circle(0px at 540px 1000px); }}
    #logo {{ position: absolute; left: 120px; top: 232px; width: 220px; height: 220px; border-radius: 50px; box-shadow: 0 30px 70px rgba(0,0,0,.3); opacity: 0; }}
    #tiles {{ position: absolute; left: 0; right: 0; top: 840px; display: flex; justify-content: center; gap: 14px; }}
    .etile {{ opacity: 0; width: 160px; height: 184px; border-radius: 22px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 160px; color: {INK}; letter-spacing: -0.04em; box-shadow: inset 0 0 0 5px {INK}; }}
    .etile.zero {{ font-family: "KMono", monospace; font-size: 140px; }}
    #cta {{ position: absolute; left: 0; right: 0; top: 1100px; display: flex; flex-direction: column; align-items: center; gap: 26px; opacity: 0; }}
    #btn {{ background: {INK}; color: {ACID}; font-weight: 700; font-size: 44px; padding: 26px 48px; border-radius: 22px; }}
    #os {{ font-family: "KMono", monospace; font-weight: 500; font-size: 32px; color: {INK}; }}"""
    js = f"""
    tl.fromTo("#flood", {{ clipPath: "circle(0px at 540px 1000px)" }}, {{ clipPath: "circle(1500px at 540px 1000px)", duration: 0.7, ease: "power2.inOut" }}, {flood_at});
    tl.fromTo("#logo", {{ opacity: 0, y: 40, scale: 0.9 }}, {{ opacity: 1, y: 0, scale: 1, duration: 0.7, ease: A }}, {round(flood_at + 0.2, 3)});
    for (let i = 0; i < 5; i++) tl.fromTo(`#et${{i}}`, {{ y: 70, opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, ease: A }}, {round(flood_at + 0.3, 3)} + i * 0.06);
    tl.fromTo("#cta", {{ opacity: 0, y: 30 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: A }}, {cta_at});"""
    write("endcard", body, css, js)


# ── captions (muted viewers) ──
def caption_groups(line, at, ink, max_words=5):
    ws = [dict(w, abs=at + w["s"]) for w in VOICE[line]["words"]]
    groups, cur = [], []
    for w in ws:
        cur.append(w)
        if len(cur) >= max_words or (w["w"][-1] in ".,?!" and len(cur) >= 2):
            groups.append(cur); cur = []
    if cur:
        groups.append(cur)
    out = []
    for i, g in enumerate(groups):
        start = round(g[0]["abs"] - 0.12, 3)
        nxt = groups[i + 1][0]["abs"] - 0.12 if i + 1 < len(groups) else g[-1]["abs"] + (g[-1]["e"] - g[-1]["s"]) + 0.5
        out.append((start, round(nxt, 3), g, ink))
    return out


def captions():
    groups = []
    for line in LINES:
        g = caption_groups(line, T["voice"][line], INK)
        if line == "end":
            g = [x for x in g if not x[2][0]["w"].lower().startswith(("one", "instead"))]   # the headline says it
        groups += g
    groups = [(a, min(b, groups[i + 1][0]) if i + 1 < len(groups) else b, ws, ink) for i, (a, b, ws, ink) in enumerate(groups)]
    els, js = [], []
    for g, (start, end, words, ink) in enumerate(groups):
        spans = "".join(f'<span id="cap{g}w{i}">{w["w"]}</span> ' for i, w in enumerate(words))
        els.append(f'<div class="cap clip" id="cap{g}" data-start="{start}" data-duration="{round(end - start, 3)}" data-track-index="0" style="color:{ink}">{spans.strip()}</div>')
        for i, w in enumerate(words):
            js.append(f'tl.fromTo("#cap{g}w{i}", {{ opacity: 0.32 }}, {{ opacity: 1, duration: 0.08 }}, {round(w["abs"], 3)});')
    css = '.cap { position: absolute; left: 120px; right: 120px; top: 520px; font-weight: 600; font-size: 46px; line-height: 1.18; letter-spacing: -0.01em; } .cap span { opacity: 0.32; }'
    write("captions", "".join(els), css, " ".join(js))


# ── sound ──
PEAK = {"pop": 0.12, "click-soft": 0.073, "click": 0.073, "whoosh": 0.162, "whoosh-short": 0.162, "impact-bass-1": 0.073, "typing": 0.454}
DUR = {"pop": 0.72, "click-soft": 0.37, "click": 0.37, "whoosh": 0.57, "whoosh-short": 0.57, "impact-bass-1": 2.12, "typing": 1.54}
SFX_GAIN = 0.36


def place_sfx(cues):
    out, lanes = [], []
    for n, (name, at, vol, *dur) in enumerate(sorted(cues, key=lambda c: c[1])):
        start = round(at + 1 / FPS - PEAK[name], 3)
        trim = 0.0
        if start < 0:
            trim, start = -start, 0.0
        d = dur[0] if dur else DUR[name] - trim
        d = round(min(d, TOTAL - start - 0.001), 3)
        lane = next((i for i, end in enumerate(lanes) if end <= start), None)
        if lane is None:
            lanes.append(0); lane = len(lanes) - 1
        lanes[lane] = start + d
        media = f' data-media-start="{round(trim, 3)}"' if trim else ""
        out.append(f'      <audio id="sfx{n}" class="clip" src="assets/sfx/{name}.mp3" data-start="{start}" data-duration="{d}"{media} data-volume="{round(vol * SFX_GAIN, 3)}" data-track-index="{8 + lane}"></audio>')
    return "\n".join(out)


def main():
    (ROOT / "compositions").mkdir(exist_ok=True)
    ground(); headlines(); endcard(); captions()
    ev = {(e["do"], round(e["t"], 3)): e for e in T["events"]}
    times = lambda do: [e["t"] for e in T["events"] if e["do"] == do]
    cues = []
    fits = [e["t"] for e in T["events"] if e["do"] == "fit"]
    for k, ft in enumerate(fits):
        if ft > 0:
            cues.append(("whoosh" if k in (len(fits) - 1,) else "whoosh-short", ft + 0.1, 0.4))
    for st in times("todotick"):
        cues.append(("click-soft", st + 0.55, 0.45)); cues.append(("pop", st + 0.6, 0.3))
    for ed in times("edit"):
        cues.append(("click-soft", ed + 0.55, 0.45)); cues.append(("typing", ed + 1.0, 0.34, 1.2))
    for cm in times("commit"):
        cues.append(("click-soft", cm + 0.45, 0.4))
    for g in times("grab"):
        cues.append(("click-soft", g + 0.5, 0.5))
    for r in times("release"):
        cues.append(("pop", r + 0.6, 0.45))
    for tk in times("tick"):
        cues.append(("pop", tk + 0.5, 0.4))
    cues.append(("impact-bass-1", flood_at + 0.7, 0.3))
    audio = [place_sfx(cues)]
    for line in LINES:
        audio.append(f'      <audio id="vo-{line}" class="clip" src="assets/voice/{line}.mp3" data-start="{T["voice"][line]}" data-duration="{round(VLEN[line] - 0.02, 3)}" data-volume="1" data-track-index="6"></audio>')
    audio.append(f'      <audio id="music" class="clip" src="assets/music/bed.mp3" data-start="0" data-duration="{TOTAL}" data-volume="0.14" data-fade-in="1.2" data-fade-out="3" data-track-index="7"></audio>')
    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="assets/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1080px; height: 1920px; overflow: hidden; background: {ACID}; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; }}
      /* the recording's own ground meets the composition's: its top and bottom edges dissolve */
      #take {{ position: absolute; left: 0; top: {STAGE_TOP}px; width: 1080px; height: {STAGE_H}px; display: block;
        -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 56px, #000 {STAGE_H - 56}px, transparent {STAGE_H}px);
        mask-image: linear-gradient(180deg, transparent 0, #000 56px, #000 {STAGE_H - 56}px, transparent {STAGE_H}px); }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1080" data-height="1920">
      <div id="ground" data-composition-id="ground" data-composition-src="compositions/ground.html" data-start="0" data-duration="{TOTAL}" data-track-index="0" data-track-kind="graphics" data-width="1080" data-height="1920"></div>
      <video id="take" class="clip" src="assets/take.mp4" muted playsinline data-start="0" data-duration="{TOTAL}" data-track-index="1"></video>
      <div id="headlines" data-composition-id="headlines" data-composition-src="compositions/headlines.html" data-start="0" data-duration="{TOTAL}" data-track-index="2" data-track-kind="graphics" data-width="1080" data-height="1920"></div>
      <div id="endcard" data-composition-id="endcard" data-composition-src="compositions/endcard.html" data-start="0" data-duration="{TOTAL}" data-track-index="4" data-track-kind="graphics" data-width="1080" data-height="1920"></div>
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{TOTAL}" data-track-index="3" data-track-kind="captions" data-width="1080" data-height="1920"></div>
{chr(10).join(audio)}
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
    (ROOT / "index.html").write_text(html)
    print("total", TOTAL, "flood", flood_at, "cta", cta_at)


if __name__ == "__main__":
    main()
