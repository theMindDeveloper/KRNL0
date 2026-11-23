"""Writes slides/slide-1..7.html (1080x1350) from the captured Habits windows in assets/. Run: python3 scripts/build.py && node scripts/render.cjs"""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
N = 7
CURSOR = '<svg class="cur" width="64" height="64" viewBox="0 0 24 24"><path d="M5 3l14 8.5-6.2 1.4 3.6 6.6-3 1.6-3.6-6.6L5 18.6z" fill="#fff" stroke="#0a0908" stroke-width="1.6" stroke-linejoin="round"/></svg>'

CSS = """
<link rel="stylesheet" href="../../_shared/brand.css">
<style>
 .headline { position: absolute; left: 64px; right: 64px; top: 150px; }
 .sub { position: absolute; left: 64px; right: 120px; }
 .shot { position: absolute; display: block; filter: drop-shadow(0 36px 50px rgba(0,0,0,.34)) drop-shadow(0 8px 16px rgba(0,0,0,.22)); }
 .ring { position: absolute; border: 5px solid var(--acid); border-radius: 16px; box-shadow: 0 0 0 3px rgba(10,9,8,.5); }
 .cur { position: absolute; filter: drop-shadow(0 6px 8px rgba(0,0,0,.35)); }
 .tag { position: absolute; font-family: var(--mono); font-weight: 800; font-size: 30px; padding: 12px 22px; border-radius: 999px; background: var(--ink); color: var(--paper); white-space: nowrap; }
 .ink .tag { background: var(--acid); color: var(--ink); }
 .ghost { right: -20px; top: 40px; opacity: .06; }
 .bar .brand span { letter-spacing: .06em; }
</style>
"""

def bar(i):
    return f'<div class="bar"><div class="brand"><img src="../../_shared/icon.svg"><span>KRNL0</span></div><span>{i}/{N}</span></div>'
def swipe():
    return '<div class="swipe">swipe <svg width="40" height="22" viewBox="0 0 40 22" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11h34M27 3l9 8-9 8"/></svg></div>'

def slide(i, colour, headline, sub, img, win, extra="", ghost=None, sub_top=None, hl_size=None):
    x, y, s = win   # window left/top/size (px, square)
    g = f'<div class="ghost" style="font-size:560px">{ghost}</div>' if ghost else ''
    st = f' style="top:{sub_top}px"' if sub_top else ''
    sb = f'<div class="sub"{st}>{sub}</div>' if sub else ''
    hs = f' style="font-size:{hl_size}px"' if hl_size else ''
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>04 habits · slide {i}</title>{CSS}</head><body>
<div class="slide {colour}">{g}{bar(i)}
<div class="headline"{hs}>{headline}</div>{sb}
<img class="shot" src="../assets/{img}.png" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px">
{extra}{swipe()}</div></body></html>"""
    (ROOT / f"slides/slide-{i}.html").write_text(html)

def k(win): return win[2] / 540          # css-px of the window -> slide px
def at(win, cx, cy): return win[0] + cx * k(win), win[1] + cy * k(win)

# 1 hook ------------------------------------------------------------------------------------------------
w1 = (220, 650, 640)
slide(1, "coral", "Habits you<br>can see<br>building.", None, "week-all", w1, hl_size=150)
# 2 tick ------------------------------------------------------------------------------------------------
w2 = (180, 525, 720)
cx, cy = at(w2, 409, 89)
slide(2, "acid", "Tick it.<br>That&rsquo;s it.", "One tap on today&rsquo;s square. No forms.", "week-before", w2,
      extra=CURSOR.replace('class="cur"', f'class="cur" style="left:{cx-6:.0f}px;top:{cy-4:.0f}px"'), sub_top=392)
# 3 streak ----------------------------------------------------------------------------------------------
w3 = (180, 525, 720)
rx, ry = at(w3, 29, 99)
slide(3, "lav", "Watch the<br>streak grow.", "Hit 7, 30, 100 or 365 days and you get a card to save or share.", "week-ticked", w3, ghost="7",
      extra=f'<div class="ring" style="left:{rx:.0f}px;top:{ry:.0f}px;width:{222*k(w3):.0f}px;height:{27*k(w3):.0f}px"></div>', sub_top=392)
# 4 repair ----------------------------------------------------------------------------------------------
w4 = (180, 525, 720)
rx, ry = at(w4, 36, 124)
slide(4, "cyan", "A missed day<br>isn&rsquo;t a reset.", "Say you did it, or call it a rest day. Your streak carries on.", "repair", w4,
      extra=f'<div class="ring" style="left:{rx:.0f}px;top:{ry:.0f}px;width:{488*k(w4):.0f}px;height:{36*k(w4):.0f}px"></div>', sub_top=392)
# 5 month -----------------------------------------------------------------------------------------------
w5 = (180, 525, 720)
slide(5, "paper", "See the<br>whole month.", "Forgot to log a day? Tap it. Past days can be back-filled.", "month", w5, ghost="30", sub_top=392)
# 6 year ------------------------------------------------------------------------------------------------
w6 = (180, 525, 720)
slide(6, "ink", "Then the<br>whole year.", "Every square is a day you showed up.", "year", w6, ghost="365", sub_top=392)

# 7 end -------------------------------------------------------------------------------------------------
html = f"""<!doctype html><html><head><meta charset="utf-8"><title>04 habits · slide 7</title>{CSS}</head><body>
<div class="slide acid"><div class="ghost" style="font-size:560px">0</div>{bar(7)}
<img src="../../_shared/icon.svg" style="position:absolute;left:64px;top:196px;width:200px;height:200px;border-radius:46px;box-shadow:0 20px 40px rgba(0,0,0,.25)">
<div class="headline" style="top:470px">Start your<br>first streak.</div>
<div class="sub" style="top:730px">Habits, plans, calendar and focus timer on one canvas.</div>
<div class="tiles" style="position:absolute;left:64px;top:900px"><b>K</b><b>R</b><b>N</b><b>L</b><b>0</b></div>
<div class="cta" style="position:absolute;left:64px;top:1090px">Free download &middot; link in bio</div>
<div class="sub" style="top:1230px;font-family:var(--mono);font-size:28px;font-weight:700">Windows &middot; macOS &middot; Linux</div>
</div></body></html>"""
(ROOT / "slides/slide-7.html").write_text(html)
print("ok")
