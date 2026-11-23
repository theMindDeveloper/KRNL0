"""Scene 1: Ignition + Reveal (0 - 40.4 s). A macro of the cube's lit core, the old way (cards that never talk), the collapse into the cube,
and the dive through the core on the drop at 39.325 s. One render(t) function drives everything, so every frame is a pure function of time."""
import json, random
from lib import *

DROP = 39.325
rnd = random.Random(11)
TYPES = ["list", "cal", "timer", "habit", "tabs", "note", "mail", "chat"]
LABEL = {"list": "to-do app", "cal": "calendar app", "timer": "timer app", "habit": "habit tracker", "tabs": "12 tabs open", "note": "notes app", "mail": "inbox", "chat": "messages"}
ACC = {"list": LAV, "cal": CYAN, "timer": CORAL, "habit": ACID, "tabs": "#8d8a80", "note": "#ffd966", "mail": "#7aa7ff", "chat": "#7ad6a0"}

def card_html(kind, i):
    a = ACC[kind]
    head = f'<div class="ch" style="background:{a}"><span>{LABEL[kind]}</span></div>'
    if kind == "list":
        body = "".join(f'<div class="row"><i></i><b style="width:{w}%"></b></div>' for w in (80, 62, 74, 48))
    elif kind == "cal":
        body = '<div class="grid">' + "".join(f'<u class="{"on" if n in (3, 9, 10, 16, 22) else ""}"></u>' for n in range(28)) + '</div>'
    elif kind == "timer":
        body = '<div class="big">25:00</div><div class="bar"><b></b></div>'
    elif kind == "habit":
        body = "".join('<div class="hrow">' + "".join(f'<u class="{"on" if (r + c) % 3 else ""}"></u>' for c in range(7)) + '</div>' for r in range(3))
    elif kind == "tabs":
        body = '<div class="tabs">' + "".join(f'<s style="background:{c}"></s>' for c in (ACID, CYAN, CORAL, LAV, "#ffd966", "#7aa7ff")) + '</div><div class="row"><b style="width:70%"></b></div>'
    elif kind == "note":
        body = "".join(f'<div class="row"><b style="width:{w}%"></b></div>' for w in (90, 70, 82))
    elif kind == "mail":
        body = "".join(f'<div class="row"><i class="dot"></i><b style="width:{w}%"></b></div>' for w in (84, 60, 72))
    else:
        body = "".join(f'<div class="bub {"r" if n % 2 else ""}"></div>' for n in range(3))
    return f'<div class="card k-{kind}" id="c{i}">{head}<div class="cb">{body}</div></div>'

# first four cards are placed by hand and land on their words; then a tab strip; then chaos
spec = []
def add(kind, at, x, y, rot, sc=1.0): spec.append(dict(kind=kind, at=at, x=x, y=y, rot=rot, sc=sc))
add("list",  beat_at_or_after(vt("p1", "list") - 0.12),     470, 470, -4)
add("cal",   beat_at_or_after(vt("p1", "calendar") - 0.12), 1450, 400, 3)
add("timer", beat_at_or_after(vt("p1", "timer") - 0.12),    1010, 250, -2)
add("habit", beat_at_or_after(vt("p1", "habit") - 0.12),    780, 760, 2)
tab_at = beat_at_or_after(vt("p1", "dozen") - 0.1)
for n in range(6):
    add("tabs", round(tab_at + n * 0.205, 3), 300 + n * 240, 130 + (n % 2) * 40, rnd.uniform(-6, 6), 0.8)
# chaos: every downbeat from 21.185 spawns three more and shuffles all
chaos_beats = [b for b in DOWN if 21.1 < b < 29.0]
for b in chaos_beats[:5]:
    for _ in range(3):
        add(rnd.choice(TYPES), b, rnd.randint(260, 1660), rnd.randint(220, 880), rnd.uniform(-9, 9), rnd.uniform(0.9, 1.25))
cards = []
for i, s in enumerate(spec):
    jumps = [dict(t=b, x=rnd.randint(200, 1720), y=rnd.randint(200, 900), rot=rnd.uniform(-11, 11), sc=s["sc"] * rnd.uniform(0.95, 1.3))
             for b in chaos_beats if b > s["at"] + 0.01]
    cards.append(dict(kind=s["kind"], at=s["at"], x=s["x"], y=s["y"], rot=s["rot"], sc=s["sc"], jumps=jumps))
ground = [[0, "#0a0908"], [9.745, GREY], [21.185, LAV], [22.825, CYAN], [24.465, CORAL], [26.095, ACID], [27.735, PAPER], [29.12, "#0a0908"], [31.0, "#0a0908"]]

css = f"""
  #ground {{ position: absolute; inset: 0; background: #0a0908; }}
  #cards {{ position: absolute; inset: 0; }}
  .card {{ position: absolute; left: 0; top: 0; width: 360px; height: 250px; margin: -125px 0 0 -180px; background: #fff; border-radius: 22px; box-shadow: 0 22px 46px rgba(0,0,0,.22), 0 4px 10px rgba(0,0,0,.14); overflow: hidden; opacity: 0; }}
  .ch {{ height: 58px; display: flex; align-items: center; padding: 0 22px; font: 800 24px KMono, monospace; color: #0a0908; letter-spacing: .01em; }}
  .cb {{ padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }}
  .row {{ display: flex; align-items: center; gap: 14px; height: 22px; }} .row i {{ width: 22px; height: 22px; border-radius: 6px; border: 3px solid #bdb9ae; flex: none; }}
  .row i.dot {{ border-radius: 50%; background: #bdb9ae; border: 0; }} .row b {{ height: 12px; border-radius: 6px; background: #d9d5ca; display: block; }}
  .grid {{ display: grid; grid-template-columns: repeat(7, 1fr); gap: 7px; }} .grid u {{ height: 26px; border-radius: 6px; background: #e6e2d8; }} .grid u.on {{ background: {CYAN}; }}
  .big {{ font: 800 78px KMono, monospace; letter-spacing: -.04em; color: #0a0908; text-align: center; }} .bar {{ height: 14px; border-radius: 7px; background: #e6e2d8; overflow: hidden; }} .bar b {{ display: block; width: 38%; height: 100%; background: {CORAL}; }}
  .hrow {{ display: flex; gap: 10px; }} .hrow u {{ width: 34px; height: 34px; border-radius: 9px; background: #e6e2d8; }} .hrow u.on {{ background: {ACID}; }}
  .tabs {{ display: flex; gap: 8px; }} .tabs s {{ width: 44px; height: 20px; border-radius: 8px 8px 0 0; display: block; opacity: .85; }}
  .k-note {{ background: #fff1a8; }} .k-note .ch {{ background: #ffd966 !important; }}
  .bub {{ height: 34px; width: 62%; border-radius: 17px; background: #d9d5ca; }} .bub.r {{ align-self: flex-end; background: #7ad6a0; }}
  #cubewrap {{ position: absolute; left: {(W - 560) // 2}px; top: {(H - 560) // 2}px; width: 560px; height: 560px; transform-origin: 50% 50%; }}
  #ghost {{ position: absolute; left: 0; width: {W}px; top: 190px; text-align: center; font: 800 560px KMono, monospace; letter-spacing: -0.06em; color: #0a0908; opacity: 0; }}
  #dim {{ position: absolute; inset: 0; background: #000; opacity: 0; }} #flash {{ position: absolute; inset: 0; background: #fff; opacity: 0; }}
"""
body = (f'<div id="ground"></div><div id="ghost">07:00</div><div id="cards" data-layout-allow-overlap data-layout-ignore>{"".join(card_html(c["kind"], i) for i, c in enumerate(cards))}</div>'
        f'<div id="dim"></div><div id="cubewrap">{cube_svg(560)}</div><div id="flash"></div>')
js = f"""
    const CARDS = {json.dumps(cards)};
    const GROUND = {json.dumps(ground)};
    const BEATS = {json.dumps([b for b in BEATS if b < 40])};
    const DROP = {DROP};
    const E = (n, x) => gsap.parseEase(n)(Math.min(1, Math.max(0, x)));
    const L = (a, b, k) => a + (b - a) * k;
    const el = id => document.getElementById(id);
    const cw = el("cubewrap"), ground = el("ground"), dim = el("dim"), flash = el("flash"), cardsEl = el("cards");
    const cardEls = CARDS.map((c, i) => el("c" + i));
    const glow = [el("glow0"), el("glow1"), el("glow2")], core = [el("core0"), el("core1"), el("core2")];
    const ghost = el("ghost");
    function pulse(t) {{ let p = 0; for (const b of BEATS) {{ if (b > t) break; if (b < 6.2) p += Math.exp(-(t - b) * 7); }} return Math.min(1, p); }}
    function render(t) {{
      // ground colour: hard cuts on the beat
      let g = GROUND[0][1]; for (const [gt, gc] of GROUND) if (t >= gt) g = gc; ground.style.background = g;
      // cube: macro -> pull-back (4.795..9.745), gone while the old way plays, back on the collapse, then the dive
      let s = 9.5, op = 1;
      if (t >= 4.795 && t < 9.745) s = L(9.5, 1, E("power2.inOut", (t - 4.795) / 4.95));
      else if (t >= 9.745) s = 1;
      if (t >= 9.9 && t < 10.6) op = 1 - E("power2.out", (t - 9.9) / 0.7);
      else if (t >= 10.6 && t < 32.0) op = 0;
      if (t >= 32.0 && t < 32.9) {{ const k = E("expo.out", (t - 32.0) / 0.9); op = k; s = L(0.7, 1.28, k); }}
      else if (t >= 32.9 && t < DROP - 0.35) s = L(1.28, 1.42, E("power1.in", (t - 32.9) / (DROP - 0.35 - 32.9)));
      let rot = 0;
      if (t >= DROP - 0.35) {{ s = L(1.42, 70, E("power4.in", (t - (DROP - 0.35)) / 0.5)); }}
      gsap.set(cw, {{ scale: s, y: 140 * s, opacity: op }});
      // core light: dim, heartbeat on the first beats, then a slow anticipation until the drop
      let gl = 0.22 + 0.78 * pulse(t);
      if (t > 9.0 && t < 32.0) gl = 0.8;
      if (t >= 32.0) gl = L(0.7, 1, E("power2.in", (t - 32.0) / (DROP - 32.0)));
      for (const n of glow) n.setAttribute("opacity", gl.toFixed(3));
      for (const n of core) n.setAttribute("opacity", (0.55 + 0.45 * Math.min(1, gl + 0.1)).toFixed(3));
      // the morning: a ghost clock reads 07:00 while the voice sets the scene
      ghost.style.opacity = t >= 9.745 && t < 21.185 ? (0.09 * E("power2.out", (t - 9.745) / 0.8)).toFixed(3) : 0;
      // cards
      let collapse = 0; if (t >= 31.005) collapse = E("power3.in", (t - 31.005) / 1.4);
      CARDS.forEach((c, i) => {{
        const n = cardEls[i]; if (t < c.at || collapse >= 1) {{ n.style.opacity = 0; return; }}
        const k = E("expo.out", (t - c.at) / 0.22);
        let x = c.x, y = c.y, r = c.rot, sc = c.sc;
        for (const j of c.jumps) {{ if (t >= j.t) {{ const q = E("power2.out", (t - j.t) / 0.32); x = L(x, j.x, q); y = L(y, j.y, q); r = L(r, j.rot, q); sc = L(sc, j.sc, q); }} }}
        x = L(x, {W / 2}, collapse); y = L(y, {H / 2}, collapse); sc = sc * (1 - 0.92 * collapse);
        gsap.set(n, {{ x, y, rotation: r, scale: sc * L(1.28, 1, k), opacity: Math.min(1, k * 1.6) * (1 - collapse) }});
      }});
      // the dip cut on "what if they did?": everything darkens and holds
      dim.style.opacity = t >= 29.12 && t < 31.0 ? 0.5 : 0;
      // the drop
      let fl = 0; if (t >= DROP) fl = 0.95 * Math.exp(-(t - DROP) * 9); flash.style.opacity = fl.toFixed(3);
      // out: the whole scene leaves on a blur-less fade once the core has filled the frame
      el("root").style.opacity = t >= DROP + 0.38 ? Math.max(0, 1 - (t - (DROP + 0.38)) / 0.3) : 1;
    }}
    const S = {{ t: 0 }};
    render(0);
    tl.to(S, {{ t: 40.4, duration: 40.4, ease: "none", onUpdate: () => render(S.t) }}, 0);
"""
write("ignition", body, css, js)
print("cards", len(cards))
