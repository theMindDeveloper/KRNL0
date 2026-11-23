"""Places the narration on the lo-fi score's grid and writes src/film/timeline.json (the film's clock).
Anchors: p1 starts on the first downbeat; "One canvas" lands where the groove drops (24.34 s);
each chapter title fills the half-bar before its line; "KRNL0." lands on the last section change (145.4 s)."""
import json, bisect
from pathlib import Path
R = Path(__file__).resolve().parent.parent
t = open("/tmp/lofid.json").read(); it = json.loads(t[t.find("{"):])["items"][0]
DOWN = it["downbeats"]["times"]; BEATS = it["beats"]["times"]; SECT = it["sections"]["spans"]
V = {k: json.loads((R / f"public/voice/{k}.json").read_text())["words"] for k in ["p1","p2","r1","pl","fo","lb","yo","tu","en"]}
LEN = {k: v[-1]["e"] for k, v in V.items()}
after = lambda x: DOWN[bisect.bisect_left(DOWN, x)]
near = lambda x: min(DOWN, key=lambda d: abs(d - x))
T = {}
def put(k, word_at, idx=0): T[k] = round(word_at - V[k][idx]["s"], 3)
DROP = near(24.34); END_HIT = near(145.4)
put("p1", DOWN[0])
put("p2", after(T["p1"] + LEN["p1"] + 1.2))
put("r1", DROP, idx=[w["w"] for w in V["r1"]].index("One"))   # "One canvas" on the drop
titles = {}
def chapter(name, k, earliest):
    t0 = after(earliest); t1 = after(t0 + 1.0)   # the title holds one half-bar, the line starts on the next
    titles[name] = [round(t0, 3), round(t1, 3)]; put(k, t1 + 0.12)
chapter("plan", "pl", T["r1"] + LEN["r1"] + 1.0)
chapter("do", "fo", T["pl"] + LEN["pl"] + 1.0)
chapter("see", "lb", 71.4)
chapter("yours", "yo", 92.8)
put("tu", after(T["yo"] + LEN["yo"] + 1.0))
put("en", END_HIT, idx=[w["w"].strip(".") for w in V["en"]].index("Kernel"))   # "Kernel Zero" on the last change
out = {"music": "lofi-d.mp3", "total": 168.0, "drop": DROP, "endHit": END_HIT, "voice": {k: {"start": v, "end": round(v + LEN[k], 3)} for k, v in T.items()},
       "titles": titles, "downbeats": DOWN, "beats": BEATS, "sections": SECT,
       "words": {k: [{"w": w["w"], "t": round(T[k] + w["s"], 3)} for w in V[k]] for k in V}}
(R / "src/film/timeline.json").write_text(json.dumps(out, indent=1))
for k, v in out["voice"].items(): print(f"{k}: {v['start']:7.2f} -> {v['end']:7.2f}")
print("titles", titles, "drop", DROP, "end", END_HIT)
