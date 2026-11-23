"""Writes slides/slide-N.html for the "planned vs spent" carousel. Render with: node scripts/render.cjs"""
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "slides"; OUT.mkdir(exist_ok=True)
N = 8

CSS = """
@import url("../../_shared/brand.css");
.slide { font-family: var(--sans); }
.pad { position: absolute; left: 72px; right: 72px; }
.kicker { position: absolute; left: 72px; top: 168px; }
.h { position: absolute; left: 72px; right: 72px; font-weight: 800; letter-spacing: -0.055em; line-height: .94; }
.sub { position: absolute; left: 72px; right: 72px; font-weight: 600; font-size: 44px; line-height: 1.22; letter-spacing: -0.02em; }
.shot { position: absolute; filter: drop-shadow(3px 0 0 var(--ink)) drop-shadow(-3px 0 0 var(--ink)) drop-shadow(0 3px 0 var(--ink)) drop-shadow(0 -3px 0 var(--ink)) drop-shadow(0 40px 48px rgba(0,0,0,.28)); }
.shot img { display: block; width: 100%; height: auto; }
.hi { display: inline-block; background: var(--ink); color: var(--acid); border-radius: 26px; padding: 0 .16em .06em; margin-left: -.04em; }
.mono { font-family: var(--mono); font-weight: 800; }
.cap { position: absolute; font-family: var(--mono); font-weight: 800; font-size: 26px; letter-spacing: .04em; text-transform: uppercase; }
"""
(OUT / "slides.css").write_text(CSS)

def bar(i, dark=False):
    return f'<div class="bar"><div class="brand"><img src="../../_shared/icon.svg"><span>KRNL0</span></div><span>{i}/{N}</span></div>'
def swipe():
    return '<div class="swipe">swipe <svg width="40" height="22" viewBox="0 0 40 22" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11h34M27 3l9 8-9 8"/></svg></div>'
def page(i, colour, body, last=False):
    html = f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="slides.css"></head><body>
<div class="slide {colour}" id="s">{bar(i)}{body}{"" if last else swipe()}</div></body></html>'''
    (OUT / f"slide-{i}.html").write_text(html)

# 1 — hook ---------------------------------------------------------------
page(1, "acid", '''
<span class="chip kicker">what a to-do list never shows</span>
<div class="h" style="top:262px;font-size:166px">Planned 1h.<br>Took <span class="hi">2h05.</span></div>
<div style="position:absolute;left:72px;right:72px;top:760px">
  <div class="mono" style="display:flex;justify-content:space-between;font-size:30px;margin-bottom:14px"><span>PLANNED</span><span>1h</span></div>
  <div style="height:64px;width:436px;border-radius:18px;background:rgba(10,9,8,.28)"></div>
  <div class="mono" style="display:flex;justify-content:space-between;font-size:30px;margin:44px 0 14px"><span>TOOK</span><span>2h05</span></div>
  <div style="height:64px;width:936px;border-radius:18px;background:var(--ink);position:relative"><div style="position:absolute;left:436px;right:0;top:0;bottom:0;border-radius:0 18px 18px 0;background:var(--coral)"></div></div>
  <div style="margin-top:34px;display:flex;justify-content:flex-end"><span class="chip" style="background:var(--coral);color:var(--ink)">+1h05 more than planned</span></div>
</div>
<div class="sub" style="top:1170px;font-size:46px;max-width:760px">The one thing a plain to-do list can&rsquo;t tell you.</div>
''')

# 2 — the list says what, not how long ---------------------------------------
page(2, "lav", '''
<div class="h" style="top:170px;font-size:116px">Lists know what.<br>Not how long.</div>
<div class="sub" style="top:430px;font-size:46px">You write the plan. Then you guess the time.</div>
<span class="chip" style="position:absolute;right:76px;top:570px;background:var(--ink)">&darr; just a guess</span>
<div class="shot" style="left:72px;top:650px;width:936px"><img src="../assets/todo.png"></div>
''')

# 3 — press start, it records -------------------------------------------------
page(3, "cyan", '''
<div class="h" style="top:170px;font-size:140px">Press start.<br>It records.</div>
<div class="sub" style="top:470px">Pick the plan. The time lands on the task.</div>
<div class="shot" style="left:120px;top:590px;width:840px"><img src="../assets/timer.png"></div>
''')

# 4 — analytics window -----------------------------------------------------------
page(4, "coral", '''
<div class="h" style="top:170px;font-size:116px">Then, the<br>real numbers.</div>
<div class="sub" style="top:424px;font-size:42px">Planned vs spent: per task, per day.</div>
<div class="shot" style="left:90px;top:500px;width:770px"><img src="../assets/plan_vs.png"></div>
''')

# 5 — the number ------------------------------------------------------------------------
page(5, "ink", '''
<span class="chip kicker" style="background:var(--acid);color:var(--ink)">accuracy · last 7 days</span>
<div class="h" style="top:250px;font-size:392px;line-height:.82;color:var(--acid);letter-spacing:-0.07em">&times;1.47</div>
<div class="sub" style="top:700px;color:var(--paper);font-size:62px;line-height:1.12;letter-spacing:-0.03em">Tasks took almost<br>1.5&times; the estimate.</div>
<div class="mono" style="position:absolute;left:72px;right:72px;top:930px;display:flex;gap:18px">
  <div style="flex:1;border:3px solid rgba(244,239,226,.25);border-radius:26px;padding:26px 30px"><div style="font-size:24px;opacity:.6;letter-spacing:.06em">PLANNED</div><div style="font-size:64px;margin-top:6px">15h45</div></div>
  <div style="flex:1;border:3px solid var(--acid);border-radius:26px;padding:26px 30px;color:var(--acid)"><div style="font-size:24px;opacity:.75;letter-spacing:.06em">TRACKED</div><div style="font-size:64px;margin-top:6px">23h10</div></div>
</div>
<div class="sub" style="top:1160px;color:var(--paper);opacity:.75;font-size:38px;max-width:780px">Now you can plan with real numbers.</div>
''')

# 6 — evening recap ---------------------------------------------------------------------------
page(6, "cyan", '''
<div class="h" style="top:170px;font-size:124px">Every evening,<br>a recap.</div>
<div class="sub" style="top:440px;max-width:900px;font-size:42px">What got done, what was recorded, and how it went against the plan.</div>
<div class="shot" style="left:100px;top:570px;width:840px"><img src="../assets/recap.png"></div>
''')

# 7 — Monday look-back ---------------------------------------------------------------------------
page(7, "lav", '''
<div class="h" style="top:170px;font-size:124px">Every Monday,<br>a look back.</div>
<div class="sub" style="top:440px;max-width:900px;font-size:42px">Last week day by day,<br>with your best day picked out.</div>
<div class="shot" style="left:90px;top:590px;width:780px"><img src="../assets/week.png"></div>
''')

# 8 — end -------------------------------------------------------------------------------------------
page(8, "acid", '''
<div class="h" style="top:230px;font-size:190px;line-height:.88">Plan it.<br>Time it.<br>See it.</div>
<div style="position:absolute;left:72px;top:880px"><div class="tiles"><b>K</b><b>R</b><b>N</b><b>L</b><b>0</b></div></div>
<div style="position:absolute;left:72px;top:1060px"><span class="cta">Free download &middot; link in bio</span></div>
<div class="mono" style="position:absolute;left:72px;top:1190px;font-size:28px;letter-spacing:.04em">Windows &middot; macOS &middot; Linux</div>
''', last=True)
print("wrote", N, "slides")
