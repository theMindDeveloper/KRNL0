"""Chapter cards, beat word-flashes and the end card (compositions 'cards' and 'endcard'). Each is one render(t) function."""
import json
from lib import *

def build_cards(items):
    """items: dict(t0, t1, words=[..], bg, fg, ghost=None, size=330, align='left'|'center')"""
    html, data = [], []
    for i, it in enumerate(items):
        words = "".join(f'<span class="w" id="w{i}_{j}">{w}</span>' for j, w in enumerate(it["words"]))
        ghost = f'<div class="gh" style="color:{it["fg"]}">{it["ghost"]}</div>' if it.get("ghost") else ""
        al = it.get("align", "left")
        html.append(f'<div class="card" id="k{i}" style="background:{it["bg"]};color:{it["fg"]}">{ghost}<div class="tx {al}" style="font-size:{it.get("size", 330)}px">{words}</div></div>')
        data.append(dict(t0=it["t0"], t1=it["t1"], n=len(it["words"])))
    css = f"""
      .card {{ position: absolute; inset: 0; clip-path: inset(100% 0 0 0); }}
      .gh {{ position: absolute; right: -30px; bottom: -90px; font: 800 640px KMono, monospace; letter-spacing: -0.07em; opacity: .1; line-height: 1; }}
      .tx {{ position: absolute; left: 150px; right: 120px; top: 50%; transform: translateY(-50%); font-weight: 800; line-height: .92; letter-spacing: -0.055em; }}
      .tx.center {{ text-align: center; left: 60px; right: 60px; }}
      .w {{ display: inline-block; margin-right: .22em; opacity: 0; }} .tx .w:last-child {{ margin-right: 0; }}
    """
    js = f"""
      const D = {json.dumps(data)};
      const E = (n, x) => gsap.parseEase(n)(Math.min(1, Math.max(0, x)));
      const ks = D.map((d, i) => document.getElementById("k" + i));
      function render(t) {{
        D.forEach((d, i) => {{
          const k = ks[i];
          if (t < d.t0 - 0.01 || t > d.t1 + 0.4) {{ k.style.clipPath = "inset(100% 0 0 0)"; return; }}
          const a = E("expo.out", (t - d.t0) / 0.3), b = t > d.t1 ? E("power3.in", (t - d.t1) / 0.22) : 0;
          k.style.clipPath = `inset(${{(1 - a) * 100}}% 0 ${{b * 100}}% 0)`;
          for (let j = 0; j < d.n; j++) {{
            const w = document.getElementById("w" + i + "_" + j), p = E("power2.out", (t - (d.t0 + 0.12 + 0.09 * j)) / 0.2);
            w.style.opacity = p; w.style.filter = `blur(${{(1 - p) * 9}}px)`;
          }}
        }});
      }}
      const S = {{ t: 0 }}; render(0);
      tl.to(S, {{ t: {TOTAL}, duration: {TOTAL}, ease: "none", onUpdate: () => render(S.t) }}, 0);
    """
    write("cards", f'<div id="cardsroot">{"".join(html)}</div>', css, js)

END0 = 152.9      # flood starts; "KRNL0." is heard at 153.0 and the hit lands at 153.045
def build_end():
    tiles = "".join(f'<b class="t t{i}">{c}</b>' for i, c in enumerate("KRNL0"))
    body = f"""<div id="flood"></div>
      <div id="cubebox">{cube_svg(430)}</div>
      <div id="tiles">{tiles}</div>
      <div id="chips"><span class="chip" id="c1">Free</span><span class="chip" id="c2">No account</span><span class="chip" id="c3">Windows · macOS · Linux</span></div>
      <div id="cta">Download it today · link below</div>"""
    css = f"""
      #flood {{ position: absolute; left: 50%; top: 50%; width: 4400px; height: 4400px; margin: -2200px 0 0 -2200px; border-radius: 50%; background: {ACID}; transform: scale(0); }}
      #cubebox {{ position: absolute; left: 300px; top: 300px; width: 430px; height: 430px; opacity: 0; transform-origin: 50% 50%; }}
      #tiles {{ position: absolute; left: 790px; top: 335px; display: flex; gap: 12px; }}
      .t {{ width: 190px; height: 190px; border: 6px solid {INK}; border-radius: 34px; display: grid; place-items: center; font: 800 128px KGeist, sans-serif; color: {INK}; opacity: 0; }}
      .t0 {{ background: {ACID}; }} .t1 {{ background: {CYAN}; }} .t2 {{ background: {CORAL}; }} .t3 {{ background: {LAV}; }} .t4 {{ background: {PAPER}; }}
      #chips {{ position: absolute; left: 790px; top: 585px; display: flex; gap: 14px; }}
      .chip {{ font: 800 34px KMono, monospace; padding: 12px 26px; border-radius: 999px; border: 4px solid {INK}; color: {INK}; opacity: 0; }}
      #cta {{ position: absolute; left: 790px; top: 690px; font: 800 52px KGeist, sans-serif; letter-spacing: -0.02em; background: {INK}; color: {PAPER}; padding: 22px 44px; border-radius: 999px; opacity: 0; }}
    """
    t_free, t_no, t_win, t_dl = vt("en", "free"), vt("en", "no"), vt("en", "computer") - 0.2, vt("en", "download")
    js = f"""
      const E = (n, x) => gsap.parseEase(n)(Math.min(1, Math.max(0, x)));
      const el = id => document.getElementById(id);
      const flood = el("flood"), cube = el("cubebox"), tiles = [...document.querySelectorAll(".t")], chips = [el("c1"), el("c2"), el("c3")], cta = el("cta");
      const HIT = {END0 + 0.145}, T = [{t_free}, {t_no}, {t_win}];
      function render(t) {{
        flood.style.transform = `scale(${{E("power3.inOut", (t - {END0}) / 0.45)}})`;
        // the mark is carried in on the hit: it lands from large with a short settle, then everything else follows
        const k = E("expo.out", (t - (HIT - 0.12)) / 0.5);
        cube.style.opacity = t >= HIT - 0.12 ? Math.min(1, k * 3) : 0; cube.style.transform = `scale(${{1 + (1 - k) * 2.2}})`;
        tiles.forEach((n, i) => {{ const p = E("expo.out", (t - (HIT + 0.08 + i * 0.07)) / 0.4); n.style.opacity = Math.min(1, p * 2); n.style.transform = `translateX(${{(1 - p) * 60}}px)`; }});
        chips.forEach((n, i) => {{ const p = E("expo.out", (t - T[i]) / 0.3); n.style.opacity = p; n.style.transform = `translateY(${{(1 - p) * 24}}px)`; }});
        const p = E("expo.out", (t - {t_dl}) / 0.35); cta.style.opacity = p; cta.style.transform = `scale(${{0.9 + 0.1 * p}})`;
      }}
      const S = {{ t: 0 }}; render(0);
      tl.to(S, {{ t: {TOTAL}, duration: {TOTAL}, ease: "none", onUpdate: () => render(S.t) }}, 0);
    """
    write("endcard", body, css, js)
