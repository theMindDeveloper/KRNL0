"""Writes timing.json: when the camera moves, when each real interaction happens and what colour the ground is.

Both the filming script (capture.cjs) and the overlay build (build.py) read it, so the picture and the voice agree.
Everything is derived from the narration (assets/voice/*.json). Run: python3 scripts/plan.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINES = ["hook", "notes", "drag", "habits", "end"]
V = {k: json.loads((ROOT / f"assets/voice/{k}.json").read_text()) for k in LINES}
VEND = {k: v["words"][-1]["e"] for k, v in V.items()}
WORD = {k: {w["w"].strip(".,?!'").lower(): w["s"] for w in reversed(v["words"])} for k, v in V.items()}
ACID, LAV, CYAN, CORAL = "#c9f158", "#a98bf6", "#22d3ee", "#ee8466"

MOVE = 1.25          # seconds a camera move takes on screen (the app's 0.4 s fit, filmed in slow motion)
GAP = 0.45           # pause between one line's end and the next camera move
VO = 0.7             # a beat's voice starts this long after its camera move starts (the move is the intro)

t = {}
t["hook_vo"] = 0.3
S1 = round(t["hook_vo"] + VEND["hook"] + GAP, 3)                 # notes beat starts
S2 = round(S1 + VO + VEND["notes"] + GAP, 3)                      # drag
S3 = round(S2 + VO + VEND["drag"] + GAP, 3)                       # habits
S4 = round(S3 + VO + VEND["habits"] + GAP, 3)                     # end
END_VO = round(S4 + VO, 3)
TOTAL = round(END_VO + VEND["end"] + 2.3, 3)

beats = [
    {"name": "hook",   "start": 0.0, "vo": t["hook_vo"], "color": ACID, "focus": ["mother-todo"], "focus_at": [[round(t["hook_vo"] + WORD["hook"]["kernel"] - 0.2, 3), ["mother-todo", "mother-calendar"]]]},
    {"name": "notes",  "start": S1, "vo": round(S1 + VO, 3), "color": LAV, "focus": ["frame-notes"]},
    {"name": "drag",   "start": S2, "vo": round(S2 + VO, 3), "color": CYAN, "focus": ["mother-todo", "mother-calendar"]},
    {"name": "habits", "start": S3, "vo": round(S3 + VO, 3), "color": CORAL, "focus": ["mother-habit"]},
    {"name": "end",    "start": S4, "vo": END_VO, "color": ACID, "focus": ["mother-todo", "mother-calendar", "mother-habit", "mother-pomo"]},
]

n = WORD["notes"]
d = WORD["drag"]
h = WORD["habits"]
events = [
    # hook: tight on Todos, a slow scroll-zoom out, then the app's own fit-view pulls out to the pair as the voice says "one canvas"
    {"t": 0.0,  "do": "fit", "ids": ["mother-todo"], "instant": True},
    {"t": 1.1,  "do": "todotick", "text": "Review the proposal"},
    {"t": 2.7,  "do": "todotick", "text": "Client call"},
    {"t": round(t["hook_vo"] + WORD["hook"]["kernel"] - 0.2, 3), "do": "fit", "ids": ["mother-todo", "mother-calendar"], "slow": 2.0},
    {"t": S1,   "do": "fit", "ids": ["frame-notes"]},
    # a blank sticky note on the canvas gets its words, typed live while the voice says "A note, a picture..."
    {"t": round(S1 + VO + n["a"] - 0.5, 3), "do": "edit", "text": "Gift idea for Mom"},
    {"t": round(S1 + VO + n["whatever"] - 0.1, 3), "do": "commit"},
    # drag: frame the pair, scroll-zoom in, pick the plan up in Todos and drop it on the calendar (camera still)
    {"t": S2,   "do": "fit", "ids": ["mother-todo", "mother-calendar"]},
    {"t": round(S2 + 1.95, 3), "do": "grab"},
    {"t": round(S2 + 2.35, 3), "do": "release"},
    {"t": S3,   "do": "fit", "ids": ["mother-habit"]},
    {"t": round(S3 + VO + h["tick"] + 0.45, 3), "do": "tick", "habit": 0},
    {"t": round(S3 + VO + 1.4, 3), "do": "tick", "habit": 1},
    {"t": round(S3 + VO + h["build"] + 0.25, 3), "do": "tick", "habit": 2},
    {"t": S4,   "do": "fit", "ids": ["mother-todo", "mother-calendar", "mother-habit", "mother-pomo"], "slow": 2.0},
]
# the Timer is started during the hook so the canvas is alive from the first frame
events.insert(1, {"t": 0.4, "do": "timer"})

timing = {"total": TOTAL, "move": MOVE, "beats": beats, "events": sorted(events, key=lambda e: e["t"]),
          "voice": {k: round(b["vo"], 3) for k, b in zip(LINES, beats)}, "vend": VEND}
(ROOT / "timing.json").write_text(json.dumps(timing, indent=1))
print("total", TOTAL)
for b in beats:
    print(f"{b['name']:7s} start {b['start']:6.2f}  voice {b['vo']:6.2f} → {b['vo'] + VEND[b['name']]:6.2f}")
for e in timing["events"]:
    print(f"  {e['t']:6.2f}  {e['do']} {e.get('ids') or e.get('text') or e.get('habit', '')}")
