"""Builds html/slide-N.html from the captured shots, trims the shots, renders slide-N.png (1080x1350) and the contact sheet.
Run:  python3 scripts/build.py   (after node scripts/capture.cjs)"""
import json, subprocess, sys
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
SH, TR, HT = ROOT / "shots", ROOT / "shots/trim", ROOT / "html"
TR.mkdir(exist_ok=True); HT.mkdir(exist_ok=True)

def trim(name, pad=0, thr=150):
    im = Image.open(SH / f"{name}.png").convert("RGBA")
    bb = im.split()[3].point(lambda v: 255 if v > thr else 0).getbbox()
    im = im.crop((max(bb[0]-pad,0), max(bb[1]-pad,0), min(bb[2]+pad,im.width), min(bb[3]+pad,im.height)))
    im.save(TR / f"{name}.png"); return im.size
S = {n: trim(n) for n in ["hero", "beside", "frame", "free", "station"]}
dock = json.loads((SH / "dock.json").read_text())
N = 7

def page(i, cls, body, extra_css="", last=False):
    bar = "" if last else f'''<div class="bar"><div class="brand"><img src="../../_shared/icon.svg" alt=""><span>KRNL0</span></div><span>{i}/{N}</span></div>'''
    swipe = "" if last else '<div class="swipe">swipe <svg width="40" height="20" viewBox="0 0 40 20"><path d="M2 10h32M26 3l8 7-8 7" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
    html = f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../../_shared/brand.css"><style>
body{{margin:0}} .slide .h{{position:absolute;left:64px;right:64px}}
.shot{{position:absolute;filter:drop-shadow(2px 0 0 #0a0908) drop-shadow(-2px 0 0 #0a0908) drop-shadow(0 2px 0 #0a0908) drop-shadow(0 -2px 0 #0a0908) drop-shadow(0 30px 40px rgba(0,0,0,.30))}}
.shot img{{display:block;width:100%}}
{extra_css}</style></head><body><div class="slide {cls}">{body}{bar}{swipe}</div></body></html>'''
    (HT / f"slide-{i}.html").write_text(html)

def fit(name, w): return w, round(w * S[name][1] / S[name][0])

# 1 — hook (lavender)
w, h = fit("hero", 980)
page(1, "lav", f'''
<div class="ghost" style="right:-60px;bottom:-40px;font-size:900px;color:var(--ink)">0</div>
<div class="h headline" style="top:150px;font-size:158px">Not another<br>list.</div>
<div class="h sub" style="top:470px;font-size:52px;max-width:860px">A canvas that looks<br>like your head.</div>
<div class="shot" style="left:50px;top:640px;width:{w}px"><img src="../shots/trim/hero.png"></div>
<div class="chip" style="position:absolute;left:64px;top:{640+h+80}px">Free canvas · put anything anywhere</div>''')

# 2 — next to your plan (coral)
w, h = fit("beside", 960)
page(2, "coral", f'''
<div class="h headline" style="top:150px;font-size:116px">Put anything<br>next to your plan.</div>
<div class="h sub" style="top:430px;max-width:820px">Ideas, reminders and details sit right beside the task they belong to.</div>
<div class="shot" style="left:60px;top:600px;width:{w}px"><img src="../shots/trim/beside.png"></div>''')

# 3 — tools (cyan): the real dock, labelled row by row
DH = 720; k = DH / dock["h"]; DW = dock["w"] * k
labels = [("select", "Select", "V"), ("text", "Text", "N"), ("sticky", "Sticky note", "S"), ("shape", "Shape", "R"), ("image", "Image", "I"), ("pen", "Pen", "P"), ("frame", "Frame", "F")]
top0 = 520
rows = "".join(f'<div class="row" style="top:{top0 + dock[key]*k - 46}px"><span class="nm">{nm}</span><span class="chip">{kk}</span></div>' for key, nm, kk in labels)
page(3, "acid", f'''
<div class="h headline" style="top:150px;font-size:150px">Think<br>out loud.</div>
<div class="h sub" style="top:450px">Seven tools. One key each.</div>
<div class="shot" style="left:200px;top:{top0}px;width:{DW}px"><img src="../shots/dock.png"></div>
{rows}''', extra_css=f'''
.row{{position:absolute;left:{200+DW+56}px;display:flex;align-items:center;gap:28px;height:92px}}
.row .nm{{font-weight:800;font-size:56px;letter-spacing:-0.035em}}
.row .chip{{font-size:30px;padding:8px 18px}}''')

# 4 — frames (acid)
w, h = fit("frame", 660)
page(4, "cyan", f'''
<div class="h headline" style="top:150px;font-size:128px">Group it<br>in a frame.</div>
<div class="h sub" style="top:430px;max-width:860px">Drag the frame and everything inside moves with it.</div>
<div class="shot" style="left:{(1080-w)//2}px;top:560px;width:{w}px"><img src="../shots/trim/frame.png"></div>
<div class="chip" style="position:absolute;left:64px;top:{560+h+36}px;background:var(--acid);color:var(--ink)">Frame · F</div>''')

# 5 — two layouts (paper)
mw = 880; mh = round(mw * 501 / 960)
page(5, "paper", f'''
<div class="h headline" style="top:150px;font-size:112px">Tidy when<br>you want.<br><span style="color:var(--coral)">Free when<br>you don't.</span></div>
<div class="shot" style="left:100px;top:{730}px;width:{mw}px"><img src="../shots/menu.png" style="border-radius:40px"></div>
<div class="chip" style="position:absolute;left:100px;top:{730+mh+56}px">Layout menu · top bar</div>''')

# 6 — flip (lavender): the two layouts stacked, big enough to read
cw = 700; sh_ = round(cw * S["station"][1] / S["station"][0]); fh = round(cw * S["free"][1] / S["free"][0])
y1 = 536; y2 = y1 + sh_ + 76
page(6, "lav", f'''
<div class="h headline" style="top:140px;font-size:104px">One shortcut<br>flips them.</div>
<div class="h" style="top:372px"><span class="chip" style="font-size:34px;padding:12px 26px">Ctrl + Shift + L</span> <span style="font-family:var(--mono);font-weight:800;font-size:26px;margin-left:14px">⌘ + Shift + L on Mac</span></div>
<div class="shot" style="left:64px;top:{y1}px;width:{cw}px"><img src="../shots/trim/station.png"></div>
<div class="lab" style="left:64px;top:{y1-58}px"><span class="chip" style="background:var(--paper);color:var(--ink)">My layout</span></div>
<div class="shot" style="left:64px;top:{y2}px;width:{cw}px"><img src="../shots/trim/free.png"></div>
<div class="lab" style="left:64px;top:{y2-58}px"><span class="chip">Free canvas</span></div>''', extra_css=".lab{position:absolute;z-index:2}")

# 7 — CTA (acid)
page(7, "acid", '''
<div class="ghost" style="right:-80px;top:80px;font-size:1000px">0</div>
<img src="../../_shared/icon.svg" alt="" style="position:absolute;left:64px;top:130px;width:200px;height:200px;border-radius:46px;box-shadow:0 28px 50px rgba(0,0,0,.25)">
<div class="h headline" style="top:400px;font-size:132px">Make room<br>for how you<br>think.</div>
<div class="h tiles" style="top:900px"><b>K</b><b>R</b><b>N</b><b>L</b><b>0</b></div>
<div class="h" style="top:1090px"><span class="cta">Free download · link in bio</span></div>
<div class="h" style="top:1230px;font-family:var(--mono);font-weight:800;font-size:28px">Windows · macOS · Linux</div>''', last=True)
print("html written")
