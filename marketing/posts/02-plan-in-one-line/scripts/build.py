"""Writes slide-1.html … slide-7.html (1080x1350) next to the assets. Run: python3 scripts/build.py && node scripts/render.cjs"""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
N = 7
CSS = """
.slide .bar { color: inherit; } .slide.ink .bar { color: var(--paper); }
.chip.step { position: absolute; left: 64px; top: 150px; }
.h { position: absolute; left: 64px; top: 225px; right: 64px; }
.h .headline { font-size: 112px; }
.sub { position: absolute; left: 64px; right: 64px; top: 478px; max-width: 900px; opacity: .85; }
.ghost { right: -30px; top: 520px; font-size: 440px; }
.swipe { bottom: auto; top: 58px; right: 128px; }
.win { border-radius: 14px; box-shadow: 0 0 0 3px var(--ink), 0 40px 80px rgba(0,0,0,.30), 0 10px 24px rgba(0,0,0,.22); }
.slide.ink .bar .brand img { box-shadow: 0 0 0 2px rgba(244,239,226,.28); }
.typed { position: absolute; left: 64px; top: 478px; display: inline-flex; align-items: center; gap: 14px; background: var(--ink); color: var(--paper); font-family: var(--mono); font-weight: 700; font-size: 31px; padding: 18px 28px; border-radius: 18px; }
.typed i { display: inline-block; width: 14px; height: 36px; background: var(--acid); border-radius: 3px; }
.row { position: absolute; left: 64px; right: 64px; height: 138px; background: #1b1a18; border-radius: 26px; padding: 26px 34px; }
.row .in { font-family: var(--mono); font-weight: 800; font-size: 36px; color: var(--acid); letter-spacing: -0.01em; white-space: nowrap; }
.row .out { font-family: var(--mono); font-weight: 500; font-size: 28px; color: rgba(244,239,226,.62); margin-top: 14px; white-space: nowrap; }
.row .out b { color: var(--paper); font-weight: 700; }
.cta-block { position: absolute; left: 64px; right: 64px; }
"""
def bar(i, last=False):
    return (f'<div class="bar"><div class="brand"><img src="../_shared/icon.svg" alt=""><span>KRNL0</span></div><span>{i}/{N}</span></div>'
            + ('' if last else '<div class="swipe">swipe <span>→</span></div>'))
def page(i, cls, body):
    return f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="../_shared/brand.css"><style>{CSS}</style></head>
<body><div class="slide {cls}" id="s">{body}</div></body></html>'''
def win(img, left, top, width, ratio):
    return f'<div class="win" style="left:{left}px;top:{top}px;width:{width}px;height:{round(width*ratio)}px"><img src="assets/{img}" alt=""></div>'
def step(i, cls, chip, h1, h2, sub, visual):
    return page(i, cls, bar(i) + f'<div class="chip step">{chip}</div><div class="h"><div class="headline">{h1}<br>{h2}</div></div><div class="sub">{sub}</div>' + visual)
def pair(todo_img, cal_img, top=690, w=480):
    return win(todo_img, 50, top, w, 1.0) + win(cal_img, 50 + w + 20, top, w, 560 / 540)
S = {}
# 1 hook
S[1] = page(1, 'acid', bar(1) +
  '<div class="h" style="top:150px"><div class="headline">Plan your day<br>in one line.</div></div>'
  '<div class="typed">Review the proposal 11:00 1h<i></i></div>'
  + win('cal-added.png', 110, 595, 860, 1260/1620))
# 2 type it
S[2] = step(2, 'lav', '01 · TYPE', 'Write it like', 'you’d say it.', 'Day, time and length are read for you.',
  win('todo-typed.png', 175, 575, 730, 1.0))
# 3 enter
S[3] = step(3, 'cyan', '02 · ENTER', 'Press Enter.', 'It’s planned.', 'It’s on your calendar at 11:00, and in your list.', win('todo-added.png', 175, 575, 730, 1.0))
# 4 drag
S[4] = step(4, 'coral', '03 · DRAG', 'No time yet?', 'Drag it in.', 'Pick up any plan and drop it on the calendar.', win('cal-drag.png', 100, 620, 880, 1260/1620))
# 5 drop
S[5] = step(5, 'paper', '04 · DROP', 'Dropped.', 'It has a time.', 'Your list shows the time too.', win('todo-dropped.png', 175, 575, 730, 1.0))
# 6 cheat sheet
rows = [('Gym 18:00 1h30', 'today · <b>18:00</b> · <b>1h30</b>'),
        ('Call mom tomorrow at 5pm', '<b>tomorrow</b> · <b>17:00</b>'),
        ('Pay rent fri', '<b>Friday</b> · any time'),
        ('Essay tue 16:00 by sat', 'Tuesday <b>16:00</b> · deadline <b>Saturday</b>')]
rh = ''.join(f'<div class="row" style="top:{600 + k * 160}px"><div class="in">{a}</div><div class="out">→ {b}</div></div>' for k, (a, b) in enumerate(rows))
S[6] = page(6, 'ink', bar(6) + '<div class="chip step" style="background:var(--acid);color:var(--ink)">TRY THESE</div>'
  '<div class="h"><div class="headline" style="color:var(--paper)">Say it<br>your way.</div></div>'
  '<div class="sub" style="color:var(--paper)">Day, time, length, deadline. Just type.</div>' + rh)
# 7 end
S[7] = page(7, 'acid', bar(7, True) + '<div class="ghost" style="top:880px;right:-60px">0</div>'
  '<img src="../_shared/icon.svg" style="position:absolute;left:64px;top:230px;width:230px;height:230px;border-radius:52px;box-shadow:0 30px 60px rgba(0,0,0,.28)" alt="">'
  '<div class="h" style="top:520px"><div class="headline" style="font-size:118px">Your whole day,<br>one canvas.</div></div>'
  '<div class="sub" style="top:790px">Plans, calendar, focus, habits. One calm app.</div>'
  '<div class="cta-block" style="top:900px"><div class="tiles"><b>K</b><b>R</b><b>N</b><b>L</b><b>0</b></div></div>'
  '<div class="cta-block" style="top:1100px"><span class="cta">Free download · link in bio</span></div>'
  '<div class="cta-block" style="top:1250px"><span style="font-family:var(--mono);font-weight:700;font-size:26px">Windows · macOS · Linux</span></div>')
for i, h in S.items(): (ROOT / f'slide-{i}.html').write_text(h)
print('wrote', len(S), 'slides')
