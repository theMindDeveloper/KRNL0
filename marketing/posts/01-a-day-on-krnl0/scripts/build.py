"""Writes slides/slide-N.html (1080x1350) for the post. Run: python3 scripts/build.py && node scripts/shoot.cjs"""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
(ROOT / "slides").mkdir(exist_ok=True)
N = 8
STEPS = ["Plan the day", "Give it a time", "Press start", "Tick the habits", "Close the day", "See where it went"]

def page(i, color, body, ghost=None, last=False):
    bar = "" if last else f'''<div class="bar"><div class="brand"><img src="../../_shared/icon.svg"><span>KRNL0</span></div><span>{i}/{N}</span></div>'''
    swipe = "" if last else '<div class="swipe">swipe <span style="font-size:34px;line-height:1">→</span></div>'
    g = f'<div class="ghost" style="{ghost}">{ghost_text[i]}</div>' if ghost and i in ghost_text else ""
    return f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../../_shared/brand.css">
<style>
.t {{ position:absolute; left:64px; right:64px; }}
.chip.sm {{ font-size:26px; padding:9px 18px; }}
.win img {{ filter: drop-shadow(0 46px 60px rgba(0,0,0,.30)) drop-shadow(0 10px 20px rgba(0,0,0,.20)); }}
.slide.acid .chip, .slide.lav .chip, .slide.cyan .chip, .slide.coral .chip, .slide.paper .chip {{ background: var(--ink); color: var(--paper); }}
</style></head><body><div class="slide {color}">{g}{bar}{body}{swipe}</div></body></html>'''
ghost_text = {1: "24", 2: "01", 3: "02", 4: "03", 5: "04", 6: "05", 7: "06"}
GH = "right:-30px; top:250px; font-size:560px; opacity:.07;"

def text(chip, head, sub, headsize=120):
    return f'''<div class="t" style="top:150px"><span class="chip sm">{chip}</span></div>
<div class="t headline" style="top:225px; font-size:{headsize}px">{head}</div>
<div class="t sub" style="top:{225 + 2*int(headsize*0.95) + 28}px; width:860px">{sub}</div>'''

def win(img, left, top, w, h):
    return f'<div class="win" style="left:{left}px; top:{top}px; width:{w}px; height:{h}px; border-radius:0; box-shadow:none; overflow:visible"><img src="../assets/{img}.png"></div>'

slides = {}
# 1 hook
rows = "".join(f'<div style="display:flex; align-items:center; gap:22px; height:84px"><span class="chip sm" style="min-width:76px; text-align:center">0{k+1}</span><span style="font-weight:700; font-size:50px; letter-spacing:-0.03em">{s}</span></div>' for k, s in enumerate(STEPS))
slides[1] = page(1, "acid", f'''<div class="t" style="top:150px"><span class="chip sm">A TUESDAY ON KRNL0</span></div>
<div class="t headline" style="top:225px; font-size:150px">Your whole<br>day, one<br>canvas.</div>
<div class="t" style="top:735px">{rows}</div>''', ghost="right:-60px; top:700px; font-size:640px; opacity:.08;")
# 2 plan
slides[2] = page(2, "lav", text("01 · MORNING", "Start with<br>the list.", "Type it in one line. Time included.") + win("todo", 140, 620, 800, 415), ghost=GH)
# 3 schedule
slides[3] = page(3, "cyan", text("02 · SCHEDULE", "Give every<br>plan a time.", "Drop it on the calendar. One glance.") + win("cal", 296, 580, 488, 686), ghost=GH)
# 4 focus
slides[4] = page(4, "coral", text("03 · FOCUS", "Press start.<br>It records.", "Pick the plan. Hit start.") + win("timer", 190, 570, 700, 700), ghost=GH)
# 5 habits
slides[5] = page(5, "acid", text("04 · HABITS", "Habits you can<br>see building.", "Tick them off. Streaks do the rest.", headsize=112) + win("habits", 140, 630, 800, 533), ghost=GH)
# 6 recap
slides[6] = page(6, "paper", text("05 · EVENING", "Close the<br>day.", "What got done, and for how long.") + win("recap", 160, 600, 760, 582), ghost=GH)
# 7 planned vs spent
slides[7] = page(7, "lav", text("06 · REVIEW", "See where<br>the time went.", "Planned against spent, task by task.", headsize=112) + win("planned", 190, 570, 700, 700), ghost=GH)
# 8 end
slides[8] = page(8, "acid", '''<img src="../../_shared/icon.svg" style="position:absolute; left:64px; top:120px; width:220px; height:220px; border-radius:50px; box-shadow:0 30px 60px rgba(0,0,0,.28)">
<div class="t headline" style="top:400px; font-size:128px">One canvas.<br>Your whole<br>day.</div>
<div class="t" style="top:860px"><div class="tiles"><b>K</b><b>R</b><b>N</b><b>L</b><b>0</b></div></div>
<div class="t" style="top:1040px"><span class="cta">Free download · link in bio</span></div>
<div class="t" style="top:1190px; font-family:var(--mono); font-weight:800; font-size:28px">Windows · macOS · Linux</div>''', last=True)
for k, h in slides.items():
    (ROOT / "slides" / f"slide-{k}.html").write_text(h)
print("ok", len(slides))
