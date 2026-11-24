"""The edit decision list for film v2 -> src/film/edl.json.
Device shots: the real recording on a tilted 3D 'device' plane; `views` are camera targets on the plane
(u, v = point as a fraction of the screen, wr = how much of the screen width fills the frame), keyed in shot seconds.
Cuts sit on the score's half-bar downbeats; footage is aligned so the action happens on the word that names it."""
import json
from pathlib import Path
R = Path(__file__).resolve().parent.parent
T = json.loads((R / "src/film/timeline.json").read_text())
W = lambda k, w, n=0: [x["t"] for x in T["words"][k] if x["w"].strip(".,?!'").lower() == w.lower()][n]
LAV, CYAN, CORAL, ACID, DARK = "#5f49b8", "#127d8d", "#b0573f", "#7e9a2e", None
shots = []
def dev(src, t0, t1, m0, views, tilt=(8, -10, 0), rate=1.0, studio=DARK, blur=5):
    assert m0 >= 0, (src, m0)
    shots.append(dict(kind="device", src=src, t0=round(t0, 3), t1=round(t1, 3), m0=round(m0, 3), rate=rate, views=views, tilt=tilt, studio=studio, blur=blur))
def title(t0, t1, words, studio, accent): shots.append(dict(kind="title", t0=t0, t1=t1, words=words, studio=studio, accent=accent))
def world(t0, t1, preset, studio=DARK): shots.append(dict(kind="world", t0=round(t0, 3), t1=round(t1, 3), preset=preset, studio=studio))
D = T["downbeats"]; tt = T["titles"]; DROP = T["drop"]; END = T["endHit"]
WIDE = [0.04, 0.06, 0.96, 0.94]
PAIR = [0.04, 0.07, 0.97, 0.97]; TODO5 = [0.04, 0.07, 0.5, 0.97]; CAL5 = [0.49, 0.07, 0.97, 0.97]
CAL = CAL5

shots.append(dict(kind="intro", t0=0, t1=round(DROP + 0.034, 3)))
world(DROP, tt["plan"][0], "reveal")
title(*tt["plan"], ["Plan", "it."], LAV, "#c9f158")
# Plan: Start with the plan. Type it... Review the proposal, eleven, one hour. Done. It's planned... on your calendar.
dev("S01-boot", tt["plan"][1], 33.4, 0.4, [[0, 0.12, 0.1, 0.88, 0.92], [1.7, 0.06, 0.08, 0.94, 0.94]], tilt=(6, 12, -1), studio=LAV)
t0 = 33.4; dev("S05-quickadd", t0, 40.05, 0.0,
    [[0, *TODO5], [3.5, *PAIR], [4.6, *CAL5]], tilt=(8, -12, 1), studio=LAV)
dev("S08-calendar-day", 40.05, 41.48, 0.3, [[0, 0.25, 0.08, 0.75, 0.94], [1.4, 0.27, 0.1, 0.73, 0.9]], tilt=(10, 8, 0), studio=LAV)
pick = W("pl", "pick"); dev("S06-drag", 41.48, tt["do"][0], 1.2 - (pick - 41.48), [[0, *PAIR], [2.2, 0.3, 0.07, 0.97, 0.97]], tilt=(7, -9, -1), studio=LAV)
title(*tt["do"], ["Do", "it."], CYAN, "#c9f158")
press = W("fo", "press"); dev("S09-timer-record", tt["do"][1], 50.06, 2.8 - (press + 0.1 - tt["do"][1]), [[0, 0.03, 0.09, 0.5, 0.94], [2.5, 0.04, 0.12, 0.49, 0.9]], tilt=(8, 12, 1), studio=CYAN)
dev("S12b-card-closeup", 50.06, 52.91, 1.0, [[0, 0.2, 0.2, 0.8, 0.82], [2.8, 0.23, 0.24, 0.77, 0.78]], tilt=(10, -8, -1), studio=CYAN)
dev("S10-radio-mix", 52.91, 60.05, 0.0, [[0, 0.12, 0.09, 0.91, 0.93], [2.0, 0.56, 0.09, 0.91, 0.93], [6.5, 0.5, 0.09, 0.91, 0.93]], tilt=(7, -12, 0), rate=0.75, studio=CYAN)
# groove, music only
dev("S07-tick", 60.05, 62.91, 0.3, [[0, 0.19, 0.09, 0.71, 0.95], [2.8, 0.2, 0.1, 0.7, 0.93]], tilt=(9, 10, 1))
CLK = json.loads((R / "scripts/clock.json").read_text()) if (R / "scripts/clock.json").exists() else None
if CLK:   # the clock beat (voice line "cl"): framing from scripts/clock.json, written after the footage lands
    for c in CLK: dev(c["src"], c["t0"], c["t1"], c["m0"], c["views"], tilt=tuple(c["tilt"]), rate=c.get("rate", 1.0))
else:
    dev("S11-stopwatch", 62.91, 65.77, 0.5, [[0, 0.03, 0.09, 0.5, 0.93], [2.8, 0.04, 0.1, 0.49, 0.91]], tilt=(7, -12, -1))
    dev("S02-glide", 65.77, tt["see"][0], 0.0, [[0, *WIDE], [5.6, 0.06, 0.08, 0.94, 0.92]], tilt=(6, 8, 0))
title(*tt["see"], ["See", "it."], CORAL, "#c9f158")
dev("S14-habit-year", tt["see"][1], 74.31, 4.5, [[0, 0.26, 0.08, 0.74, 0.94], [1.4, 0.27, 0.1, 0.73, 0.92]], tilt=(9, -10, 0), studio=CORAL)
tick = W("lb", "tick"); dev("S13-habit-tick", 74.31, 78.61, max(0, 1.17 - (tick - 74.31)), [[0, 0.26, 0.08, 0.74, 0.94], [4.2, 0.27, 0.1, 0.73, 0.92]], tilt=(8, 11, 1), studio=CORAL)
dev("S16-day-complete", 78.61, 80.03, 0.3, [[0, 0.24, 0.14, 0.76, 0.88], [1.4, 0.25, 0.16, 0.75, 0.86]], tilt=(8, -8, 0), studio=CORAL)
planned = W("lb", "planned"); dev("S15-analytics", 80.03, 85.75, 3.1 - (planned + 0.1 - 80.03), [[0, 0.26, 0.08, 0.74, 0.94], [5.7, 0.27, 0.1, 0.73, 0.92]], tilt=(9, 10, 1), studio=CORAL)
dev("S17-week-recap", 85.75, 88.61, 0.3, [[0, 0.21, 0.14, 0.79, 0.88], [2.8, 0.22, 0.16, 0.78, 0.86]], tilt=(7, -10, -1), studio=CORAL)
world(88.61, tt["yours"][0], "calm")
title(*tt["yours"], ["Make", "it", "yours."], ACID, "#ffffff")
world(tt["yours"][1], 97.19, "yours", ACID)
dev("S18-sticky", 97.19, 98.62, 1.6, [[0, 0.27, 0.12, 0.89, 0.9], [1.4, 0.3, 0.14, 0.88, 0.88]], tilt=(8, -10, 0), rate=1.6, studio=ACID)
dev("S19-frame", 98.62, 101.48, 0.4, [[0, 0.13, 0.25, 0.8, 0.88], [2.8, 0.15, 0.27, 0.78, 0.86]], tilt=(10, 9, 1), studio=ACID)
dev("S20-layout-flip", 101.48, 104.34, 1.99, [[0, 0.02, 0.04, 0.98, 0.96], [2.8, *WIDE]], tilt=(6, -8, 0), rate=2.0, studio=ACID)
cmd = W("yo", "command"); dev("S22-terminal", 104.34, 107.2, 3.87 - (cmd - 0.3 - 104.34), [[0, 0.07, 0.1, 0.51, 0.94], [1.8, 0.07, 0.1, 0.93, 0.94]], tilt=(8, 12, 1), studio=ACID)
ask = W("yo", "ask", 1); dev("S23-orb-ask", 107.2, 112.92, 4.47 - (ask + 0.05 - 107.2), [[0, 0.04, 0.3, 0.4, 0.92], [2.2, 0.04, 0.1, 0.6, 0.94], [3.4, 0.04, 0.09, 0.93, 0.95]], tilt=(8, -11, -1), studio=ACID)
# tours
dev("S24-orb-tours", 112.92, 115.78, 0.3, [[0, 0.03, 0.06, 0.66, 0.96], [2.8, 0.03, 0.08, 0.62, 0.94]], tilt=(9, 10, 0))
dev("S03-tour-first-day", 115.78, 121.48, 2.9, [[0, 0.17, 0.06, 0.8, 0.94], [3.0, 0.14, 0.04, 0.9, 0.94], [5.6, 0.12, 0.03, 0.97, 0.94]], tilt=(7, -9, 0))
# the groove montage, one shot per half-bar
dev("S21-theme-flip", 121.48, 124.34, 1.5, [[0, 0.27, 0.18, 0.73, 0.82], [2.8, 0.06, 0.1, 0.92, 0.92]], tilt=(8, 10, 1))
mont = [("S05-quickadd", 5.6, PAIR, (8, -12, 1)), ("S10-radio-mix", 2.6, [0.12, 0.09, 0.91, 0.93], (7, 12, -1)), ("S13-habit-tick", 3.5, [0.26, 0.08, 0.74, 0.94], (9, -10, 0)),
        ("S15-analytics", 4.0, [0.26, 0.08, 0.74, 0.94], (8, 11, 1)), ("S22-terminal", 3.4, [0.07, 0.1, 0.93, 0.94], (8, -12, -1)), ("S12b-card-closeup", 2.0, [0.2, 0.2, 0.8, 0.82], (10, 9, 0)),
        ("S16-day-complete", 1.5, [0.24, 0.14, 0.76, 0.88], (8, -9, 0))]
cuts = [124.34, 125.77, 127.2, 128.62, 130.06, 131.49, 132.91, 134.34]
for (src, m0, v, tl), a, b in zip(mont, cuts, cuts[1:]):
    dev(src, a, b, m0, [[0, v[0] - 0.015, v[1] - 0.015, v[2] + 0.015, v[3] + 0.015], [b - a, *v]], tilt=tl)
dev("S25-chrome-zoomout", 134.34, 140.06, 0.0, [[0, *WIDE], [5.7, *WIDE]], tilt=(10, 6, 0), rate=1.45)
world(140.06, END, "finale")
shots.append(dict(kind="end", t0=END, t1=T["total"]))
(R / "src/film/edl.json").write_text(json.dumps(shots, indent=1))
for s in shots: print(f"{s['t0']:7.2f} {s['t1']:7.2f} {s['kind']:6s} {s.get('src', s.get('preset', ''))} m0={s.get('m0', '')}")
