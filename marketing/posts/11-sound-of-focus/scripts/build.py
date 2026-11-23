"""Builds slide-1..8 (1080x1350) from the real widget screenshots in assets/. Run: python3 scripts/build.py  (then it screenshots with Playwright)."""
import math, random, subprocess, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
N = 8
INK = "#0a0908"
SND = {"dark": "#aaa0dc", "brown": "#d9a55a", "white": "#e8e2d4", "rain": "#86b4e0", "fire": "#ee8466", "synth": "#c9f158"}

def bar(i, fg):
    return f'''<div class="bar" style="color:{fg}"><div class="brand"><img src="../_shared/icon.svg"><span>KRNL0</span></div><span>{i} / {N}</span></div>'''
def swipe(fg): return f'<div class="swipe" style="color:{fg}">swipe <svg width="34" height="20" viewBox="0 0 34 20" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10h28M22 3l8 7-8 7"/></svg></div>'

# ── noise graphics (deterministic) ─────────────────────────────────────────────
def wave(y, amp, period, phase, w, color, op, width=1080, step=6):
    pts = [f"{x},{y + amp * math.sin((x / period) * 2 * math.pi + phase):.1f}" for x in range(-20, width + 40, step)]
    return f'<polyline points="{" ".join(pts)}" fill="none" stroke="{color}" stroke-opacity="{op}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'
def art_low(c):    # slow, fat waves: the low rumble
    return "".join(wave(930 + k * 36, 120 - k * 18, 1000, k * 1.2, 34 - k * 6, c, .30 - k * .07) for k in range(4))
def art_white(c):  # dense, even hiss
    r = random.Random(4); out = []
    for k in range(70):
        h = r.randint(30, 330); x = 40 + k * 14.6
        out.append(f'<rect x="{x:.1f}" y="{930 - h / 2:.1f}" width="7" height="{h}" rx="3.5" fill="{c}" fill-opacity=".26"/>')
    return "".join(out)
def art_rain(c):   # falling dashes
    r = random.Random(9); out = []
    for _ in range(70):
        x, y, l = r.randint(0, 1080), r.randint(620, 1260), r.randint(40, 120)
        out.append(f'<line x1="{x}" y1="{y}" x2="{x - l * .17:.0f}" y2="{y + l}" stroke="{c}" stroke-opacity="{r.choice([.18, .26, .34])}" stroke-width="6" stroke-linecap="round"/>')
    return "".join(out)
def art_fire(c):   # rising tongues + sparks
    r = random.Random(2); out = []
    for k in range(16):
        x = 40 + k * 66 + r.randint(-14, 14); h = r.randint(160, 520)
        out.append(f'<line x1="{x}" y1="1260" x2="{x + r.randint(-24, 24)}" y2="{1260 - h}" stroke="{c}" stroke-opacity="{r.choice([.16, .24, .32])}" stroke-width="{r.choice([14, 20, 28])}" stroke-linecap="round"/>')
    for _ in range(30):
        out.append(f'<circle cx="{r.randint(30, 1050)}" cy="{r.randint(640, 1200)}" r="{r.choice([4, 6, 8])}" fill="#f4efe2" fill-opacity=".55"/>')
    return "".join(out)
def art_synth(c):  # smooth drifting chords: sine layers + orbits
    o = "".join(wave(930, 90 + k * 26, 560 + k * 140, k * 1.7, 7, c, .32 - k * .05) for k in range(4))
    o += "".join(f'<circle cx="540" cy="930" r="{r}" fill="none" stroke="{c}" stroke-opacity=".18" stroke-width="3"/>' for r in (300, 420, 540))
    return o

SLIDES = []
def sound_slide(i, bg, fg, chip, title, mood, img, art, hs=500):
    from PIL import Image
    iw, ih = Image.open(ROOT / "assets" / img).size
    h = round(hs * ih / iw)
    x = (1080 - hs) // 2
    html = f'''<div class="slide" style="background:{bg};color:{fg}">
{bar(i, fg)}
<svg style="position:absolute;left:0;top:0" width="1080" height="1350" viewBox="0 0 1080 1350">{art}</svg>
<div style="position:absolute;left:64px;top:168px;right:64px">
  <span class="chip" style="background:{fg};color:{bg}">{chip}</span>
  <div class="headline" style="margin-top:34px;font-size:150px">{title}</div>
  <div class="sub" style="margin-top:30px;max-width:900px;font-size:46px">{mood}</div>
</div>
<img src="assets/{img}" style="position:absolute;left:{x}px;top:{1250 - h}px;width:{hs}px;filter:drop-shadow(0 34px 44px rgba(0,0,0,.38)) drop-shadow(0 8px 14px rgba(0,0,0,.28))">
{swipe(fg)}
</div>'''
    SLIDES.append(html)

# 1 hook
bars = []
cols = list(SND.values())
for k in range(48):
    h = 40 + 150 * abs(math.sin(k * 0.55)) * (0.6 + 0.4 * math.sin(k * 0.13 + 1)) + 30 * abs(math.sin(k * 1.7))
    bars.append(f'<rect x="{64 + k * 20.3:.1f}" y="{1060 - h / 2:.1f}" width="11" height="{h:.1f}" rx="5.5" fill="{cols[(k * 6) // 48]}"/>')
SLIDES.append(f'''<div class="slide ink" style="background:{INK}">
{bar(1, "#f4efe2")}
<div class="headline" style="position:absolute;left:64px;top:190px;color:#c9f158;font-size:190px;line-height:.9">Focus<br>has a<br>sound.</div>
<div class="sub" style="position:absolute;left:64px;top:810px;color:#f4efe2;max-width:900px;font-size:48px">Six steady sounds, built into KRNL0.</div>
<svg style="position:absolute;left:0;top:0" width="1080" height="1350">{"".join(bars)}</svg>
<div style="position:absolute;left:64px;right:64px;top:1220px;display:flex;gap:12px;flex-wrap:wrap;font-family:var(--mono);font-weight:800;font-size:25px">
{"".join(f'<span style="color:{c}">{n}</span>' + ('<span style="color:#f4efe2;opacity:.4">·</span>' if n != "synth" else "") for n, c in SND.items())}</div>
{swipe("#f4efe2")}
</div>''')
# 2-6 the sounds
sound_slide(2, "#a98bf6", INK, "dark · brown", "Dark &amp; brown.", "Deep and low, like a hum under the room. Soft, heavy, steady.", "radio-dark-brown.png", art_low(INK))
sound_slide(3, "#f4efe2", INK, "white · soft white", "White.", "A soft, even hiss. It smooths over the sharp little noises around you.", "radio-white.png", art_white(INK))
sound_slide(4, "#22d3ee", INK, "rain · gentle rainfall", "Rain.", "Familiar, steady and easy to forget about. The classic.", "radio-rain.png", art_rain(INK))
sound_slide(5, "#ee8466", INK, "fire · crackling fire", "Fire.", "A low roar with a little crackle. Warm, with some life in it.", "radio-fire.png", art_fire(INK))
sound_slide(6, "#c9f158", INK, "synth · ambient synth", "Synth.", "Slow chords that drift. Music without a beat to follow.", "radio-synth.png", art_synth(INK))
# 7 mix + start (radio + timer, both real windows, shown whole)
from PIL import Image
rw, rh = Image.open(ROOT / "assets/radio-mix.png").size
RW = 446; RH = round(RW * rh / rw)
tw = 440
steps = "".join(f'<span class="chip" style="background:#1d1d1d;color:#f4efe2;border:2px solid rgba(244,239,226,.2)"><b style="color:#c9f158">{n}</b>&nbsp; {t}</span>' for n, t in (("1", "tap two sounds"), ("2", "press start")))
SLIDES.append(f'''<div class="slide ink" style="background:{INK}">
{bar(7, "#f4efe2")}
<div class="headline" style="position:absolute;left:64px;top:170px;color:#c9f158;font-size:122px">Mix two.<br>Then press start.</div>
<div class="sub" style="position:absolute;left:64px;top:446px;color:#f4efe2;max-width:900px;font-size:42px">Tap a second sound to layer it. Each one has its own volume.</div>
<div style="position:absolute;left:64px;top:566px;display:flex;gap:14px">{steps}</div>
<img src="assets/timer.png" style="position:absolute;left:64px;top:{1236 - tw}px;width:{tw}px;filter:drop-shadow(0 30px 40px rgba(0,0,0,.6))">
<img src="assets/radio-mix.png" style="position:absolute;left:{1080 - 64 - RW}px;top:{1236 - RH}px;width:{RW}px;filter:drop-shadow(0 30px 40px rgba(0,0,0,.6))">
{swipe("#f4efe2")}
</div>''')
# 8 end
SLIDES.append(f'''<div class="slide acid">
<img src="../_shared/icon.svg" style="position:absolute;left:64px;top:96px;width:200px;height:200px;border-radius:46px">
<div class="headline" style="position:absolute;left:64px;top:350px;font-size:150px">Hear it<br>for yourself.</div>
<div class="sub" style="position:absolute;left:64px;top:690px;max-width:880px;font-size:46px">The sounds are made live inside the app. Try them and see what works for you.</div>
<div class="tiles" style="position:absolute;left:64px;top:900px"><b>K</b><b>R</b><b>N</b><b>L</b><b>0</b></div>
<div style="position:absolute;left:64px;top:1090px"><span class="cta">Free download · link in bio</span></div>
<div style="position:absolute;left:64px;top:1230px;font-family:var(--mono);font-weight:800;font-size:28px">Windows · macOS · Linux</div>
</div>''')
assert len(SLIDES) == N
for i, s in enumerate(SLIDES, 1):
    (ROOT / f"slide-{i}.html").write_text(f'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="../_shared/brand.css"><body style="margin:0">{s}</body>')
print("built", N)
