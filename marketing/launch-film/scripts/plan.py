"""Master clock: places each voice line on a music downbeat (so its anchor word lands on the beat) and prints the chapter map.
Reads assets/voice/*.json and assets/music/score.grid.json. Writes timeline.json. Run: python3 scripts/plan.py"""
import json, bisect
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
G = json.loads((ROOT/"assets/music/score.grid.json").read_text())
DOWN, BEATS = G["downbeats"], G["beats"]
V = {k: json.loads((ROOT/f"assets/voice/{k}.json").read_text()) for k in ["p1","p2","r1","pl","fo","lb","yo","tu","en"]}
def snap(t, arr): return min(arr, key=lambda x: abs(x-t))
def after(t, arr): return arr[bisect.bisect_left(arr, t)]
T = {}
def put(k, start, anchor=None):
    """start: absolute time the first word is heard. anchor: (word index, downbeat time) -> shift so that word lands on that downbeat."""
    w = V[k]["words"]
    if anchor is not None:
        i, t = anchor; start = t - w[i]["s"]
    T[k] = {"start": round(start - w[0]["s"] + w[0]["s"], 3), "end": round(start + w[-1]["e"], 3)}
put("p1", 9.745 - V["p1"]["words"][0]["s"])
put("p2", 29.365 - V["p2"]["words"][0]["s"])
put("r1", 39.325, anchor=(5, 39.325))                 # "One canvas" lands on the drop
put("pl", after(T["r1"]["end"] + 1.2, DOWN))
put("fo", after(T["pl"]["end"] + 2.4, DOWN))
put("lb", after(94.3, DOWN))
put("yo", after(T["lb"]["end"] + 3.0, DOWN))
put("tu", after(T["yo"]["end"] + 1.2, DOWN))
put("en", 153.045, anchor=(5, 153.045))              # "KRNL0." lands on the final hit
out = {"bpm": G["bpm"], "total": 165.094, "voice": T, "downbeats": DOWN, "beats": BEATS, "sections": G["sections"]}
(ROOT/"timeline.json").write_text(json.dumps(out, indent=1))
for k, v in T.items(): print(f"{k}: {v['start']:7.2f} -> {v['end']:7.2f}   ({v['end']-v['start']:.1f}s)")
