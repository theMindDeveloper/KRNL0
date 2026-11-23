"""Writes slides/slide-N.html (1080 x 1350). Render with: node render.cjs"""
import json, html
from pathlib import Path
ROOT = Path(__file__).resolve().parent
OUT = json.loads((ROOT / ".capture/outputs.json").read_text())
real = {o["cmd"]: o["message"] for o in OUT}
N = 7
HEAD = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../../_shared/brand.css"><style>{css}</style></head><body>'
BASE_CSS = """
.hl { position:absolute; left:64px; top:150px; width:952px; z-index:3; }
.hl .sub { margin-top: 26px; opacity:.78; }
.code { font-family: var(--mono); font-weight: 700; }
.pill { position:absolute; display:inline-block; font-family: var(--mono); font-weight: 800; font-size: 30px; padding: 12px 26px; border-radius: 999px; background: var(--ink); color: var(--paper); }
.ghostn { position:absolute; right:-40px; bottom:-120px; font-family: var(--mono); font-weight:800; font-size:760px; letter-spacing:-.08em; line-height:.8; opacity:.08; pointer-events:none; }
"""
def bar(n, ink=False):
    col = "var(--paper)" if ink else "var(--ink)"
    cue = f'<span>{n}/{N}{"  ·  swipe →" if n < N else ""}</span>'
    return f'<div class="bar" style="color:{col}"><div class="brand"><img src="../../_shared/icon.svg"><span>KRNL0</span></div>{cue}</div>'
def swipe(ink=False):
    return ""
def slide(n, cls, body, css="", ghost=True, ink=False):
    ghost = ghost and n in (5, 6)
    g = f'<div class="ghostn" style="color:{"var(--paper)" if ink else "var(--ink)"}">{n:02d}</div>' if ghost else ""
    return HEAD.format(css=BASE_CSS + css) + f'<div class="slide {cls}">{g}{bar(n, ink)}{body}{swipe(ink) if n < N else ""}</div></body></html>'
def hl(l1, l2, sub=None, size=120):
    s = f'<div class="sub">{sub}</div>' if sub else ""
    return f'<div class="hl"><div class="headline" style="font-size:{size}px">{l1}<br>{l2}</div>{s}</div>'
def win(src, x, y, w, light=False):
    ring = "0 0 0 5px var(--ink)," if light else ""
    return f'<div class="win" style="left:{x}px;top:{y}px;width:{w}px;height:{w}px;border-radius:26px;box-shadow:{ring}0 40px 80px rgba(0,0,0,.30),0 10px 24px rgba(0,0,0,.22)"><img src="../assets/{src}"></div>'
def card(x, y, w, inner, bg="#0c0a08", fg="var(--paper)", pad=40):
    return f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;background:{bg};color:{fg};border-radius:26px;padding:{pad}px;box-shadow:0 30px 60px rgba(0,0,0,.28);z-index:2">{inner}</div>'
e = html.escape
slides = {}

# 1 hook
slides[1] = slide(1, "acid", hl("Every button", "is a command.") + win("term-add.png", 110, 420, 860))

# 2 plan in one line
slides[2] = slide(2, "cyan", hl("Plan it in", "one line.", None, 108) +
    card(64, 372, 952, '<div class="code" style="font-size:31px;line-height:1.3;white-space:nowrap"><span style="color:var(--acid)">❯</span> krnl todo add "Review the proposal 11:00 1h"</div>', pad=26) +
    win("win-calendar.png", 130, 490, 820, light=True))

# 3 habit
slides[3] = slide(3, "lav", hl("Tick it off.", "Keep the streak.", None, 112) + win("term-habit.png", 110, 420, 860))

# 4 timer
slides[4] = slide(4, "coral", hl("Start the timer.", "Stay in flow.", None, 108) +
    card(64, 372, 952, '<div class="code" style="font-size:33px;line-height:1.3"><span style="color:var(--acid)">❯</span> krnl pomo start</div>', pad=26) +
    win("win-timer.png", 130, 490, 820, light=True))

# 5 groups
groups = ["todo","task","habit","routine","pomo","cal","clock","analytics","time","recap","text","image","frame","board","radio","sound","theme","window","settings","edge","tour","help"]
cols = ["var(--acid)","var(--cyan)","var(--coral)","var(--lav)","var(--paper)"]
chips = "".join(f'<span style="display:inline-block;margin:0 14px 18px 0;padding:12px 24px;border-radius:999px;background:{cols[i%5]};color:var(--ink);font-family:var(--mono);font-weight:800;font-size:33px">krnl {g}</span>' for i, g in enumerate(groups))
slides[5] = slide(5, "ink", hl("A command for", "every window.", None, 112) +
    f'<div style="position:absolute;left:64px;top:430px;width:952px;z-index:2">{chips}</div>' +
    '<div class="code" style="position:absolute;left:64px;top:1190px;font-size:34px;color:var(--paper);opacity:.75">krnl help lists all of them.</div>', ink=True)

# 6 script
script = ['# morning.sh', 'krnl todo add "Review the proposal 11:00 1h"', 'krnl habit done "Morning run"', 'krnl pomo start', 'krnl cal show']
sc = "".join(f'<div style="{"opacity:.5" if i==0 else ""}">{e(l)}</div>' if i else f'<div style="opacity:.5">{e(l)}</div>' for i, l in enumerate(script))
res = ['Added todo: "Review the proposal" · on the Calendar 2026-11-24 11:00 · 60 min (task: task-f1e0b4a9…)', real['habit done Morning run'], 'Pomodoro started', real['cal show']]
slides[6] = slide(6, "paper", hl("Script your", "morning.", None, 120) +
    card(64, 392, 952, f'<div class="code" style="font-size:32px;line-height:1.5">{sc}</div>', pad=36) +
    '<div class="pill" style="left:64px;top:780px">↓ runs in the Terminal window</div>' +
    card(64, 850, 952, '<div class="code" style="font-size:30px;line-height:1.4;color:#e6e1d2;font-weight:500">' + "".join(f'<div style="margin-bottom:8px">{e(r)}</div>' for r in res) + '</div>', pad=30))

# 7 cta
slides[7] = slide(7, "acid", '<img src="../../_shared/icon.svg" style="position:absolute;left:64px;top:170px;width:230px;height:230px;border-radius:52px;box-shadow:0 30px 60px rgba(0,0,0,.25)">' +
    '<div class="hl" style="top:470px"><div class="headline" style="font-size:132px">Script<br>your day.</div><div class="sub" style="margin-top:26px">Every button is a command.</div></div>' +
    '<div class="tiles" style="position:absolute;left:64px;top:900px"><b>K</b><b>R</b><b>N</b><b>L</b><b>0</b></div>' +
    '<div class="cta" style="position:absolute;left:64px;top:1070px">Free download · link in bio</div>' +
    '<div class="code" style="position:absolute;left:64px;top:1230px;font-size:30px;opacity:.75">Windows · macOS · Linux</div>', ghost=False)

for n, h in slides.items():
    (ROOT / "slides" / f"slide-{n}.html").write_text(h)
print("wrote", len(slides))
