"""Builds index.html and compositions/*.html. Run: python3 scripts/plan.py && python3 scripts/build.py"""
import json, os, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import *
import ignition, cards, edit

import json as _j
VFX = _j.dumps(_j.loads('''{"version":1,"nodes":[{"type":"highpass","id":"hp","label":"Rumble","params":{"frequency":70}},{"type":"peaking","id":"pk","label":"Presence","params":{"frequency":3000,"gain":2,"q":1}},{"type":"gain","id":"g","label":"Voice up","params":{"gain":5}},{"type":"limiter","id":"lim","params":{"limit":-1.5}}]}''')).replace('"', "&quot;")
BAR = round((H - W / 2.39) / 2, 1)
DROP = ignition.DROP
def vlen(k): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(ROOT / f"assets/voice/{k}.mp3")], capture_output=True, text=True).stdout)
def marks(sid):
    p = ROOT / f"footage/{sid}.json"
    return json.loads(p.read_text())["markers"] if p.exists() else {}
def have(sid): return (ROOT / f"footage/{sid}.mp4").exists()

# link the footage into assets/ (renders read assets/...)
(ROOT / "assets/footage").mkdir(parents=True, exist_ok=True)
for s in edit.SHOTS:
    src, dst = ROOT / f"footage/{s['id']}.mp4", ROOT / f"assets/footage/{s['id']}.mp4"
    if src.exists():
        if dst.exists(): dst.unlink()
        os.link(src, dst)

def cam_js(s):
    """GSAP tweens for one shot's camera. Arrival: a cut lands 5% large and settles in 0.3 s."""
    cam = s.get("cam", [])
    base = cam[0] if cam and cam[0][0] <= 0 else None
    out = [f'tl.fromTo("#pz_{s["id"]}", {{ scale: 1.05, x: 0, y: 0 }}, {{ scale: 1, x: 0, y: 0, duration: 0.3, ease: "expo.out" }}, {s["t"]});']
    for rel, sc, fx, fy, dur, ease in cam:
        x = max(-(sc - 1) * W / 2, min((sc - 1) * W / 2, -(fx - 0.5) * W * sc)); y = max(-(sc - 1) * H / 2, min((sc - 1) * H / 2, -(fy - 0.5) * H * sc))
        out.append(f'tl.to("#pz_{s["id"]}", {{ scale: {sc}, x: {round(x, 1)}, y: {round(y, 1)}, duration: {dur}, ease: "{ease}" }}, {round(s["t"] + rel, 3)});')
    return "\n      ".join(out)

def build():
    shots = [s for s in edit.SHOTS if have(s["id"])]
    stages, camjs = [], []
    for i, s in enumerate(shots):
        r = s.get("rate", 1.0); rate = f' data-playback-rate="{r}"' if r != 1.0 else ""
        mstart = f' data-media-start="{s["src"]}"' if s.get("src") else ""
        stages.append(f'<div class="stage" style="z-index:{10 + i}"><div class="pz" id="pz_{s["id"]}"><video id="v_{s["id"]}" class="clip" src="assets/footage/{s["id"]}.mp4" muted playsinline data-start="{s["t"]}" data-duration="{s["dur"]}"{mstart}{rate} data-track-index="1"></video></div></div>')
        camjs.append(cam_js(s))
    cards.build_cards([dict(it) for it in edit.CHAPTERS])
    cards.build_end()

    # ── sound ──
    cues = []
    # intro
    for b in (3.965, 4.395): cues.append(("impact-bass-1", b, 0.35))
    for c in ignition.cards:
        cues.append(("pop", c["at"], 0.3))
    for j in [b for b in DOWN if 21.1 < b < 29.0]: cues.append((("whoosh-short", "whoosh")[int(j) % 2], j, 0.35))
    cues.append(("whoosh-cinematic", 32.0, 0.5))
    cues.append(("riser", DROP, 0.9))
    cues.append(("impact-bass-1", DROP, 1.0)); cues.append(("impact-bass-2", DROP + 0.02, 0.45))
    # chapter cards
    for c in edit.CHAPTERS: cues.append(("whoosh-short", c["t0"] + 0.05, 0.5))
    # real actions: sound on the click / type / land markers of each shot
    MAP = {"click": "click-soft", "typeStart": "typing", "enter": "click", "landed": "pop", "grab": "click-soft", "drop": "pop", "done": "pop",
           "pickPlan": "click-soft", "start": "click", "rain": "pop", "fire": "pop", "synth": "pop", "tick_run": "pop", "tick_read": "pop", "tick_water": "pop",
           "tab_month": "click-soft", "tab_year": "click-soft", "click_tab": "click-soft", "card_in": "pop", "created1": "pop", "typing1": "typing", "created2": "pop",
           "menu": "click-soft", "shortcut": "click", "light": "whoosh-short", "enter-add": "click", "enter-habit": "click", "enter-pomo": "click",
           "click-orb": "click-soft", "orb-click": "click-soft", "start-tour-click": "click", "typing": "typing", "start-click": "click", "next-click": "click-soft", "calendar-updates": "pop"}
    for s in shots:
        r = s.get("rate", 1.0)
        for name, mt in marks(s["id"]).items():
            if name in MAP and s["src"] <= mt <= s["src"] + s["dur"] * r:
                cues.append((MAP[name], round(s["t"] + (mt - s["src"]) / r, 3), 0.42 if MAP[name] != "typing" else 0.3, *( [1.2] if MAP[name] == "typing" else [] )))
    # the end: riser into the hit, then the tiles
    cues.append(("riser", cards.END0 + 0.145, 0.8)); cues.append(("impact-bass-1", cards.END0 + 0.145, 1.0)); cues.append(("impact-bass-2", cards.END0 + 0.16, 0.5))
    for i in range(5): cues.append(("pop", cards.END0 + 0.4 + i * 0.07, 0.3))
    cues.append(("sparkle", vt("en", "download"), 0.5))

    seen, uniq = set(), []
    for c in cues:
        k = (c[0], round(c[1], 2))
        if k not in seen: seen.add(k); uniq.append(c)
    cues = uniq
    audio = [place_sfx(cues)]
    for k, v in VOICE_AT.items():
        audio.append(f'      <audio id="vo-{k}" class="clip" src="assets/voice/{k}.mp3" data-start="{v["start"]}" data-duration="{round(vlen(k) - 0.02, 3)}" data-volume="1" data-fx-chain="{VFX}" data-track-index="6"></audio>')
    # music: ducked while anyone speaks; a lane per voice window
    pts = [(0, 0.8)]
    for v in sorted(VOICE_AT.values(), key=lambda x: x["start"]):
        a, b = v["start"] + 0.1, v["end"]
        pts += [(a - 0.35, 0.8), (a, 0.17), (b, 0.17), (b + 0.5, 0.8)]
    pts.append((TOTAL, 0.8))
    # drop and final hit stay big: the voice there is short, so lift just those spots
    pts = [(round(t, 3), v) for t, v in sorted(pts)]
    auto = json.dumps({"version": 1, "lanes": [{"target": "volume", "points": [{"t": t, "v": v} for t, v in pts]}]}).replace('"', "&quot;")
    audio.append(f'      <audio id="music" class="clip" src="assets/music/score.mp3" data-start="0" data-duration="{TOTAL}" data-volume="0.85" data-automation="{auto}" data-fade-out="0.4" data-track-index="7"></audio>')

    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="assets/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {W}px; height: {H}px; overflow: hidden; background: #0a0908; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; }}
      .stage {{ position: absolute; inset: 0; overflow: hidden; }}
      .pz {{ position: absolute; inset: 0; transform-origin: 50% 50%; }}
      .pz video {{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }}
      .bar {{ position: absolute; left: 0; width: {W}px; height: {BAR}px; background: #000; z-index: 60; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="{W}" data-height="{H}">
      {chr(10).join(stages)}
      <div id="cards" class="clip" data-composition-id="cards" data-composition-src="compositions/cards.html" data-start="0" data-duration="{TOTAL}" data-track-index="3" data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:40"></div>
      <div id="endcard" class="clip" data-composition-id="endcard" data-composition-src="compositions/endcard.html" data-start="0" data-duration="{TOTAL}" data-track-index="4" data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:45"></div>
      <div id="ignition" class="clip" data-composition-id="ignition" data-composition-src="compositions/ignition.html" data-start="0" data-duration="40.4" data-hold data-track-index="2" data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:50"></div>
      <div id="bar-top" class="bar" style="top:0"></div><div id="bar-bot" class="bar" style="bottom:0"></div>
{chr(10).join(audio)}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      tl.to("#bar-top, #bar-bot", {{ height: 0, duration: 0.55, ease: "power3.inOut" }}, {DROP + 0.12});
      tl.to("#bar-top, #bar-bot", {{ height: {BAR}, duration: 0.45, ease: "power3.inOut" }}, {cards.END0 - 0.4});
      {chr(10).join(camjs)}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""
    (ROOT / "index.html").write_text(html)
    print("built;", len(shots), "shots,", len(cues), "sfx; total", TOTAL)

if __name__ == "__main__":
    build()
