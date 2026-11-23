"""Builds slides/slide-N.html (1080 x 1350) for post 08 from the footage in assets/. Run: python3 scripts/build.py && node scripts/render.cjs"""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
(ROOT / "slides").mkdir(exist_ok=True)
N = 8
CSS = """
.hl { position:absolute; left:64px; top:150px; width:952px; }
.hl .headline { font-size:118px; }
.hl .sub { margin-top:26px; font-size:42px; max-width:880px; }
.ph { position:absolute; display:block; }
.card { position:absolute; border-radius:22px; overflow:hidden; background:#0b0b0b; box-shadow:0 40px 80px rgba(0,0,0,.30), 0 10px 24px rgba(0,0,0,.22); }
.card img { display:block; width:100%; }
.orbbadge { position:absolute; border-radius:50%; overflow:hidden; background:#0b0b0b; box-shadow:0 24px 50px rgba(0,0,0,.30); }
.orbbadge img { width:100%; display:block; transform:scale(1.18); }
.slide.ink .chip { background:var(--acid); color:var(--ink); }
.row { position:absolute; left:64px; right:64px; display:flex; gap:32px; align-items:flex-start; }
.row .n { font-family:var(--mono); font-weight:800; font-size:30px; width:64px; height:64px; border-radius:18px; background:var(--acid); color:var(--ink); display:grid; place-items:center; flex:none; margin-top:6px; }
.row h3 { font-weight:800; font-size:62px; letter-spacing:-.045em; line-height:1; }
.row p { margin-top:12px; font-weight:600; font-size:34px; line-height:1.2; color:#b9b3a3; letter-spacing:-.01em; }
.fine { position:absolute; left:64px; right:64px; bottom:64px; font-family:var(--mono); font-weight:700; font-size:25px; line-height:1.4; color:#8a8478; }
"""
def bar(i, ink=False):
    return (f'<div class="bar"><div class="brand"><img src="../../_shared/icon.svg" alt=""><span>KRNL0</span></div><span>{i}/{N}</span></div>'
            + ('' if i == N else '<div class="swipe">swipe <span style="font-size:34px;line-height:1">→</span></div>'))
def page(i, colour, body, extra=""):
    html = f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../../_shared/brand.css"><style>{CSS}{extra}</style></head>
<body><div class="slide {colour}">{bar(i)}{body}</div></body></html>'''
    (ROOT / "slides" / f"slide-{i}.html").write_text(html)
A = "../assets/"
def hl(h, sub=None, top=150):
    return f'<div class="hl" style="top:{top}px"><div class="headline">{h}</div>' + (f'<div class="sub">{sub}</div>' if sub else '') + '</div>'

# 1 hook
page(1, "acid", '<div class="ghost" style="left:-30px; top:760px; font-size:620px">17:00</div>'
  + hl("Ask your<br>canvas.", "Type it. It happens on the board.")
  + f'<div class="card" style="left:64px; top:700px; width:760px"><img src="{A}panel-move.png"></div>'
  + f'<div class="orbbadge" style="left:790px; top:1010px; width:190px; height:190px"><img src="{A}orb.png"></div>')
# 2 plan by asking
page(2, "lav", '<div class="ghost" style="right:-40px; top:700px; font-size:620px">16:00</div>'
  + hl("Plan it<br>by asking.", "Say what and when. It sets it up.")
  + f'<div class="card" style="left:64px; top:660px; width:800px"><img src="{A}panel-plan.png"></div>'
  + '<div class="chip" style="position:absolute; left:64px; top:1230px">2 commands · 1 sentence</div>')
# 3 lands
page(3, "cyan", '<div class="ghost" style="left:-30px; top:720px; font-size:620px">16:00</div>'
  + hl("Already on<br>your calendar.", None)
  + f'<div class="card" style="left:200px; top:470px; width:680px"><img src="{A}win-calendar.png"></div>'
  + '<div class="chip" style="position:absolute; left:64px; top:1190px; font-size:32px">Call Mia · 16:00 · 1h</div>')
# 4 ask about the day
page(4, "coral", '<div class="ghost" style="right:-40px; top:760px; font-size:560px">?</div>'
  + hl("Ask about<br>your day.", "Every answer shows the command it ran.")
  + f'<div class="card" style="left:64px; top:600px; width:680px"><img src="{A}panel-plate.png"></div>')
# 5 focus session
page(5, "paper", '<div class="ghost" style="right:-20px; top:560px; font-size:560px">25</div>'
  + hl("Say “focus<br>session.”", "The orb answers out loud and starts your timer.")
  + f'<div class="card" style="left:64px; top:660px; width:450px"><img src="{A}win-timer.png"></div>'
  + f'<div class="card" style="left:540px; top:660px; width:476px"><img src="{A}orb-say.png"></div>'
  + '<div class="chip" style="position:absolute; left:540px; top:960px">no Claude needed</div>')
# 6 guide
page(6, "lav", '<div class="ghost" style="right:-40px; top:600px; font-size:560px">?!</div>'
  + hl("It shows<br>you around.", "Click the orb. A voiced guide walks you through the app.")
  + f'<div class="card" style="left:64px; top:560px; width:520px"><img src="{A}panel-start.png"></div>'
  + f'<div class="orbbadge" style="left:680px; top:620px; width:270px; height:270px"><img src="{A}orb.png"></div>'
  + '<div class="chip" style="position:absolute; left:680px; top:930px">voiced tours</div>')
# 7 control
rows = [("1", "Your own Claude Code", "Sign in once. It runs on your account."),
        ("2", "Only krnl commands", "It can do what the app can do. Nothing else on your computer."),
        ("3", "Only when you ask", "Nothing is sent to Claude on its own.")]
b7 = hl("You stay<br>in charge.", None)
y = 520
for n, h, p_ in rows:
    b7 += f'<div class="row" style="top:{y}px"><div class="n">{n}</div><div><h3>{h}</h3><p>{p_}</p></div></div>'
    y += 210
b7 += '<div class="fine">Asking needs Claude Code on your computer.<br>The tours and the focus session work without it.</div>'
page(7, "ink", b7)
# 8 CTA
page(8, "acid", '<div class="ghost" style="left:-30px; top:700px; font-size:620px">K0</div>'
  + '<img src="../../_shared/icon.svg" style="position:absolute; left:64px; top:170px; width:230px; height:230px; border-radius:52px; box-shadow:0 30px 60px rgba(0,0,0,.25)">'
  + '<div class="hl" style="top:450px"><div class="headline" style="font-size:112px">Your whole day,<br>one canvas.</div><div class="sub" style="margin-top:26px">Ask it. It’s on your board.</div></div>'
  + '<div class="tiles" style="position:absolute; left:64px; top:900px"><b>K</b><b>R</b><b>N</b><b>L</b><b>0</b></div>'
  + '<div class="cta" style="position:absolute; left:64px; top:1090px">Free download · link in bio</div>'
  + '<div style="position:absolute; left:64px; top:1230px; font-family:var(--mono); font-weight:800; font-size:26px">Windows · macOS · Linux</div>')
print("built", N)
