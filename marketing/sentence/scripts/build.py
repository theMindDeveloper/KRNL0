"""Writes compositions/*.html and index.html for "Where did your day go?" (storyline C, marketing cut).

Every scene is timed from the narration (assets/voice/<line>.json, word start/end seconds).
Run: python3 scripts/capture.cjs-footage + scripts/voice.py first, then python3 scripts/build.py
"""
import json, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FPS = 30
ACID, LAV, CYAN, CORAL, DARK, INK, PAPER = "#c9f158", "#a98bf6", "#22d3ee", "#ee8466", "#141414", "#0a0908", "#f4efe2"
GHOST = {ACID: "#b5dc45", LAV: "#9677e8", CYAN: "#14bfd9", PAPER: "#ebe5d2"}
WIPE = 0.55                      # seconds the next ground takes to rise over the last
K = 860 / 540                    # windows are shown at 1.59x their real size (the calendar smaller, see below)

FONTS = """
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-600-normal.woff2") format("woff2"); font-weight: 600; }
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-700-normal.woff2") format("woff2"); font-weight: 700; }
  @font-face { font-family: "KGeist"; src: url("assets/fonts/geist-latin-800-normal.woff2") format("woff2"); font-weight: 800; }
  @font-face { font-family: "KMono"; src: url("assets/fonts/jetbrains-mono-latin-500-normal.woff2") format("woff2"); font-weight: 500; }
  @font-face { font-family: "KMono"; src: url("assets/fonts/jetbrains-mono-latin-700-normal.woff2") format("woff2"); font-weight: 700; }
  @font-face { font-family: "KMono"; src: url("assets/fonts/jetbrains-mono-latin-800-normal.woff2") format("woff2"); font-weight: 800; }
"""

LINES = ["hook", "say", "see", "run", "truth", "trust"]
VOICE = {k: json.loads((ROOT / f"assets/voice/{k}.json").read_text()) for k in LINES}
VEND = {k: v["words"][-1]["e"] for k, v in VOICE.items()}
VLEN = {k: float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(ROOT / f"assets/voice/{k}.mp3")], capture_output=True, text=True).stdout) for k in LINES}


def W(line):
    """word start times (seconds into the voice line), keyed by lower-cased word without punctuation"""
    out = {}
    for w in VOICE[line]["words"]:
        out.setdefault(w["w"].strip(".,?!'").lower(), w["s"])
    return out


SHARED_CSS = f"""
    {FONTS}
    #root {{ position: absolute; inset: 0; overflow: hidden; font-family: "KGeist", sans-serif; }}
    .ground {{ position: absolute; inset: 0; }}
    .ghost {{ position: absolute; top: -70px; left: 0; right: 0; text-align: center; font-family: "KMono", monospace; font-weight: 800; font-size: 400px; letter-spacing: -0.04em; line-height: 1; white-space: nowrap; }}
    .ghost span {{ display: inline-block; }}
    .chip {{ position: absolute; left: 120px; top: 196px; display: flex; align-items: center; gap: 20px; font-family: "KMono", monospace; font-weight: 700; font-size: 38px; }}
    .chip b {{ background: {INK}; color: {PAPER}; padding: 8px 18px; border-radius: 12px; font-weight: 700; }}
    .hl {{ position: absolute; left: 120px; top: 270px; font-weight: 800; font-size: 130px; letter-spacing: -0.055em; line-height: 0.92; white-space: nowrap; }}
    .hl span {{ display: inline-block; margin-right: 0.2em; }}
    .vwrap {{ position: absolute; overflow: hidden; box-shadow: 0 60px 120px rgba(0,0,0,.34), 0 16px 36px rgba(0,0,0,.24); }}
    .pz {{ position: absolute; inset: 0; }}
    .vwrap video {{ position: absolute; display: block; }}
"""


def video_block(pre, vid, vs, vdur, win_h, win_w=860, top=700, extra_style=""):
    """A real-app clip cut to its rounded window: the capture carries a 110 px margin of ground, trimmed here."""
    k = win_w / 540
    full_w, full_h = round((540 + 220) * k, 1), round((win_h + 220) * k, 1)
    off = round(110 * k, 1)
    return f"""
    <div class="vwrap" id="{pre}-vw" style="left:{540 - win_w / 2}px; top:{top}px; width:{win_w}px; height:{round(win_h * k, 1)}px; border-radius:{round(8 * k, 1)}px; {extra_style}">
      <div class="pz" id="{pre}-pz">
        <video id="{pre}-video" class="clip" src="assets/windows/{vid}.mp4" muted playsinline data-start="{vs}" data-duration="{vdur}" data-track-index="2"
          style="left:{-off}px; top:{-off}px; width:{full_w}px; height:{full_h}px"></video>
      </div>
    </div>"""


def head(pre, lines, color):
    spans = "<br />".join("".join(f'<span id="{pre}-w{i}-{j}">{w}</span>' for j, w in enumerate(l.split(" "))) for i, l in enumerate(lines))
    return f'<div class="hl" id="{pre}-hl" style="color:{color}">{spans}</div>'


def head_tl(pre, lines, at, step=0.07):
    js = []
    n = 0
    for i, l in enumerate(lines):
        for j, _ in enumerate(l.split(" ")):
            js.append(f'tl.fromTo("#{pre}-w{i}-{j}", {{ opacity: 0, filter: "blur(10px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: 0.28, ease: "power2.out" }}, {round(at + n * step, 3)});')
            n += 1
    return "\n    ".join(js)


def ghost(pre, text, color):
    return f'<div class="ghost" id="{pre}-ghost" data-layout-allow-overflow data-layout-allow-overlap aria-hidden="true" style="color:{color}">' + "".join(f"<span data-layout-allow-overflow data-layout-allow-overlap>{c}</span>" for c in text) + "</div>"


def ghost_tl(pre, text, at):
    return f'document.querySelectorAll("#{pre}-ghost span").forEach((el, i) => tl.fromTo(el, {{ opacity: 0, y: 150, filter: "blur(8px)" }}, {{ opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "expo.out" }}, {at} + i * 0.04));'


def scene_file(name, body, css, js, ground):
    html = f"""<template>
  <style>
    {SHARED_CSS}
    {css}
  </style>
  <div id="root" data-composition-id="{name}" data-width="1080" data-height="1920">
    {body}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    const A = "expo.out";
    {js}
    window.__timelines["{name}"] = tl;
  </script>
</template>
"""
    (ROOT / f"compositions/{name}.html").write_text(html)


def wipe_js(pre, at=0.0):
    # the ground rises from the bottom over the previous scene
    return f'tl.fromTo("#{pre}-g", {{ clipPath: "inset(100% 0 0 0)" }}, {{ clipPath: "inset(0% 0 0 0)", duration: {WIPE}, ease: "power3.inOut" }}, {at});'


def rise_js(pre, at, d=0.6):
    return f'tl.fromTo("#{pre}-vw", {{ y: 130, opacity: 0, filter: "blur(8px)" }}, {{ y: 0, opacity: 1, filter: "blur(0px)", duration: {d}, ease: A }}, {at});'


# ──────────────────────────────────────────────────────────────────────────────────────────────
SCENES = []   # (name, start, duration, voice_line, voice_at_local, cues[(sfx, local_t, vol, dur?)])


def build():
    t = 0.0
    sfx = []          # absolute cues
    out_scenes = []

    def place(name, line, vo_at, D, track):
        nonlocal t
        out_scenes.append((name, round(t, 3), round(D, 3), track, line, vo_at))
        start = t
        t = round(t + D - WIPE, 3)
        return start

    # ── 1 hook ─────────────────────────────────────────────────────────────────────────────
    w = W("hook"); vo = 0.3
    swap = vo + w["kernel"] - 0.25                       # the headline changes as the name is said
    D = vo + VEND["hook"] + 0.75
    s0 = place("hook", "hook", vo, D, 0)
    css = f"""
    .vwrap {{ left: 110px; }}
    """
    body = f"""
    <div class="ground" id="hook-g" style="background:{ACID}"></div>
    {ghost('hook', '19:43', GHOST[ACID])}
    <div class="hl" id="hook-hl" style="color:{INK}"><span id="hook-a0">Where did</span><br /><span id="hook-a1">your day go?</span></div>
    <div class="hl" id="hook-hl2" style="color:{INK}; opacity:0"><span id="hook-b0">One place</span><br /><span id="hook-b1">for your day.</span></div>
    {video_block('hook', 'clock', 0, round(D, 3), 540, 860, 700)}
    """
    js = f"""
    // Frame 0 already shows the question and the real Clock; the only motion is the line changing as the name lands.
    tl.fromTo("#hook-hl", {{ opacity: 1, y: 0, filter: "blur(0px)" }}, {{ opacity: 0, y: -60, filter: "blur(10px)", duration: 0.35, ease: "power3.in", immediateRender: false }}, {round(swap, 3)});
    tl.fromTo("#hook-hl2", {{ opacity: 0, y: 60, filter: "blur(10px)" }}, {{ opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, ease: A }}, {round(swap + 0.3, 3)});
    {ghost_tl('hook', '19:43', 0.05)}
    """
    scene_file("hook", body, css, js, ACID)
    sfx += [("whoosh-short", s0 + swap + 0.3, 0.3)]

    # ── 2 say ──────────────────────────────────────────────────────────────────────────────
    w = W("say"); vo = 0.65; vs = 0.6
    D = vo + VEND["say"] + 0.75
    s = place("say", "say", vo, D, 1)
    chips_at = [vo + w["day"], vo + w["time"], vo + w["length"]]
    body = f"""
    <div class="ground" id="say-g" style="background:{LAV}"></div>
    {ghost('say', '11:00', GHOST[LAV])}
    <div class="chip" id="say-chip"><b>11:00</b><span style="color:{INK}">Plan</span></div>
    {head('say', ['Type it.', 'It is planned.'], INK)}
    {video_block('say', 'todo', vs, round(D - vs, 3), 540, 860, 700)}
    <div id="say-chips">{"".join(f'<div class="pchip" id="say-pc{i}">{x}</div>' for i, x in enumerate(["Today", "11:00", "1 hour"]))}</div>
    """
    css = f"""
    .pchip {{ position: absolute; top: 1590px; height: 74px; padding: 0 30px; border-radius: 37px; background: {INK}; color: {ACID}; font-family: "KMono", monospace; font-weight: 700; font-size: 38px; display: flex; align-items: center; opacity: 0; }}
    #say-pc0 {{ left: 120px; }} #say-pc1 {{ left: 360px; }} #say-pc2 {{ left: 590px; }}
    """
    js = f"""
    {wipe_js('say')}
    {ghost_tl('say', '11:00', 0.15)}
    tl.fromTo("#say-chip", {{ opacity: 0, x: -30 }}, {{ opacity: 1, x: 0, duration: 0.5, ease: A }}, 0.3);
    {head_tl('say', ['Type it.', 'It is planned.'], 0.35)}
    {rise_js('say', 0.5)}
    [{round(chips_at[0], 3)}, {round(chips_at[1], 3)}, {round(chips_at[2], 3)}].forEach((at, i) => tl.fromTo(`#say-pc${{i}}`, {{ opacity: 0, y: 24, scale: 0.9 }}, {{ opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.7)" }}, at));
    """
    scene_file("say", body, css, js, LAV)
    sfx += [("whoosh", s + 0.15, 0.4), ("typing", s + vs + 8 / FPS, 0.4, 1.5), ("pop", s + chips_at[0] + 0.05, 0.34),
            ("pop", s + chips_at[1] + 0.05, 0.34), ("pop", s + chips_at[2] + 0.05, 0.34),
            ("click-soft", s + vs + 150 / FPS, 0.5), ("pop", s + vs + 152 / FPS, 0.4)]

    # ── 3 see ──────────────────────────────────────────────────────────────────────────────
    w = W("see"); vo = 0.65; vs = 0.6
    D = max(vo + VEND["see"] + 0.75, vs + 94 / FPS + 1.2)
    s = place("see", "see", vo, D, 0)
    body = f"""
    <div class="ground" id="see-g" style="background:{CYAN}"></div>
    {ghost('see', '11:00', GHOST[CYAN])}
    <div class="chip" id="see-chip"><b>11:00</b><span style="color:{INK}">Calendar</span></div>
    {head('see', ['One calendar', 'for all of it.'], INK)}
    {video_block('see', 'cal', vs, round(D - vs, 3), 720, 700, 690)}
    """
    js = f"""
    {wipe_js('see')}
    {ghost_tl('see', '11:00', 0.15)}
    tl.fromTo("#see-chip", {{ opacity: 0, x: -30 }}, {{ opacity: 1, x: 0, duration: 0.5, ease: A }}, 0.3);
    {head_tl('see', ['One calendar', 'for all of it.'], 0.35)}
    {rise_js('see', 0.5)}
    """
    scene_file("see", body, "", js, CYAN)
    sfx += [("whoosh-short", s + 0.15, 0.4), ("pop", s + vs + 27 / FPS, 0.42)]

    # ── 4 run ──────────────────────────────────────────────────────────────────────────────
    w = W("run"); vo = 0.65; vs = 0.6
    D = max(vo + VEND["run"] + 0.75, vs + 4.0 + 0.8)
    s = place("run", "run", vo, D, 1)
    body = f"""
    <div class="ground" id="run-g" style="background:{ACID}"></div>
    {ghost('run', '11:00', GHOST[ACID])}
    <div class="chip" id="run-chip"><b>11:00</b><span style="color:{INK}">Focus</span></div>
    {head('run', ['Press start.', 'It records.'], INK)}
    {video_block('run', 'timer', vs, round(D - vs, 3), 540, 860, 700)}
    """
    js = f"""
    {wipe_js('run')}
    {ghost_tl('run', '11:00', 0.15)}
    tl.fromTo("#run-chip", {{ opacity: 0, x: -30 }}, {{ opacity: 1, x: 0, duration: 0.5, ease: A }}, 0.3);
    {head_tl('run', ['Press start.', 'It records.'], 0.35)}
    {rise_js('run', 0.5)}
    """
    scene_file("run", body, "", js, ACID)
    sfx += [("whoosh", s + 0.15, 0.4), ("click", s + vs + 7 / FPS, 0.5)]

    # ── 5 truth ────────────────────────────────────────────────────────────────────────────
    w = W("truth"); vo = 0.65; vs = 0.6
    D = vo + VEND["truth"] + 1.1
    s = place("truth", "truth", vo, D, 0)
    page_at = vs + 24 / FPS                                     # the real click on "Planned vs spent"
    punch_at = max(vo + w["truth"] + 0.15, page_at + 0.9)
    pl_at, took_at = vo + w["planned"], vo + w["took"] - 0.2
    body = f"""
    <div class="ground" id="truth-g" style="background:{PAPER}"></div>
    {ghost('truth', '18:00', GHOST[PAPER])}
    <div class="chip" id="truth-chip"><b>18:00</b><span style="color:{INK}">Review</span></div>
    {head('truth', ['See where', 'the time went.'], INK)}
    {video_block('truth', 'analytics', vs, round(D - vs, 3), 540, 860, 700)}
    <div id="truth-ring"></div>
    <div id="truth-pills"><div class="tp" id="truth-p0">Planned <b>1h</b></div><div class="tp" id="truth-p1">Took <b>2h05</b></div><div class="tp d" id="truth-p2">+1h05</div></div>
    """
    css = f"""
    .tp {{ position: absolute; top: 1590px; height: 82px; padding: 0 30px; border-radius: 41px; background: {INK}; color: {PAPER}; font-family: "KGeist", sans-serif; font-weight: 600; font-size: 40px; display: flex; align-items: center; gap: 14px; opacity: 0; }}
    .tp b {{ font-family: "KMono", monospace; font-weight: 800; color: {ACID}; }}
    .tp.d {{ background: {CORAL}; color: {INK}; font-family: "KMono", monospace; font-weight: 800; }}
    #truth-p0 {{ left: 120px; }} #truth-p1 {{ left: 430px; }} #truth-p2 {{ left: 760px; }}
    #truth-ring {{ position: absolute; left: 150px; top: 1376px; width: 368px; height: 80px; border-radius: 16px; border: 6px solid {CORAL}; box-shadow: 0 0 0 6px rgba(238,132,102,.25); opacity: 0; }}
    """
    js = f"""
    {wipe_js('truth')}
    {ghost_tl('truth', '18:00', 0.15)}
    tl.fromTo("#truth-chip", {{ opacity: 0, x: -30 }}, {{ opacity: 1, x: 0, duration: 0.5, ease: A }}, 0.3);
    {head_tl('truth', ['See where', 'the time went.'], 0.35)}
    {rise_js('truth', 0.5)}
    // a ring finds the one row that matters once the real page has loaded; the window stays whole
    tl.fromTo("#truth-ring", {{ opacity: 0, scale: 1.18 }}, {{ opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.6)" }}, {round(punch_at, 3)});
    tl.fromTo("#truth-p0", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.45, ease: A }}, {round(pl_at, 3)});
    tl.fromTo("#truth-p1", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.45, ease: A }}, {round(took_at, 3)});
    tl.fromTo("#truth-p2", {{ opacity: 0, scale: 0.8 }}, {{ opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }}, {round(took_at + 0.55, 3)});
    """
    scene_file("truth", body, css, js, PAPER)
    sfx += [("whoosh-short", s + 0.15, 0.4), ("click-soft", s + page_at, 0.5), ("pop", s + pl_at, 0.32), ("pop", s + took_at, 0.34), ("ping", s + took_at + 0.55, 0.3)]

    # ── 6 trust + end card ─────────────────────────────────────────────────────────────────
    w = W("trust"); vo = 0.65
    flood = vo + w["kernel"] - 0.35
    cta_at = vo + w["link"] - 0.15
    D = vo + VEND["trust"] + 2.6
    s = place("trust", "trust", vo, D, 1)
    rows = [("Free.", w["free"]), ("No account.", w["account"]), ("Your plans stay on your computer.", w["plans"])]
    row_html = "".join(f'<div class="row" id="trust-r{i}"><div class="ck">✓</div><div class="rt">{txt}</div></div>' for i, (txt, _) in enumerate(rows))
    tiles = "".join(f'<div class="etile{" zero" if ch == "0" else ""}" id="trust-et{i}" style="background:{c}">{ch}</div>' for i, (ch, c) in enumerate((("K", ACID), ("R", CYAN), ("N", CORAL), ("L", LAV), ("0", PAPER))))
    body = f"""
    <div class="ground" id="trust-g" style="background:{DARK}"></div>
    <div class="ground" id="trust-flood" style="background:{ACID}; clip-path: circle(0px at 540px 1000px)"></div>
    <img id="trust-logo" src="assets/icon.svg" alt="KRNL0" />
    <div id="trust-rows">{row_html}</div>
    <div id="trust-tiles">{tiles}</div>
    <div id="trust-cta"><div id="trust-btn">Free download · link in bio</div><div id="trust-os">Windows · macOS · Linux</div></div>
    """
    css = f"""
    .row {{ position: absolute; left: 120px; display: flex; align-items: center; gap: 34px; opacity: 0; }}
    .ck {{ width: 120px; height: 120px; border-radius: 30px; background: {ACID}; color: {INK}; font-weight: 800; font-size: 84px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }}
    .rt {{ font-weight: 800; font-size: 92px; letter-spacing: -0.045em; line-height: 0.95; color: {PAPER}; }}
    #trust-logo {{ position: absolute; left: 120px; top: 232px; width: 220px; height: 220px; border-radius: 50px; box-shadow: 0 30px 70px rgba(0,0,0,.35); }}
    #trust-r0 {{ top: 840px; }} #trust-r1 {{ top: 1020px; }} #trust-r2 {{ top: 1200px; }}
    #trust-r2 .rt {{ font-size: 64px; line-height: 1.02; letter-spacing: -0.04em; max-width: 700px; }}
    #trust-tiles {{ position: absolute; left: 0; right: 0; top: 840px; display: flex; justify-content: center; gap: 14px; }}
    .etile {{ opacity: 0; width: 160px; height: 184px; border-radius: 22px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 160px; color: {INK}; letter-spacing: -0.04em; box-shadow: inset 0 0 0 5px {INK}; }}
    .etile.zero {{ font-family: "KMono", monospace; font-size: 140px; }}
    #trust-cta {{ position: absolute; left: 0; right: 0; top: 1100px; display: flex; flex-direction: column; align-items: center; gap: 26px; opacity: 0; }}
    #trust-btn {{ background: {INK}; color: {ACID}; font-weight: 700; font-size: 44px; padding: 26px 48px; border-radius: 22px; }}
    #trust-os {{ font-family: "KMono", monospace; font-weight: 500; font-size: 32px; color: {INK}; }}
    """
    js = f"""
    {wipe_js('trust')}
    tl.fromTo("#trust-logo", {{ opacity: 0, y: 40, scale: 0.9 }}, {{ opacity: 1, y: 0, scale: 1, duration: 0.7, ease: A }}, 0.45);
    [{",".join(str(round(vo + a, 3)) for _, a in rows)}].forEach((at, i) => tl.fromTo(`#trust-r${{i}}`, {{ opacity: 0, x: -50, filter: "blur(8px)" }}, {{ opacity: 1, x: 0, filter: "blur(0px)", duration: 0.5, ease: A }}, at - 0.05));
    // "Kernel Zero": the ground floods acid from the middle, the rows leave, the tiles rise in
    tl.fromTo("#trust-flood", {{ clipPath: "circle(0px at 540px 1000px)" }}, {{ clipPath: "circle(1500px at 540px 1000px)", duration: 0.7, ease: "power2.inOut" }}, {round(flood, 3)});
    tl.fromTo("#trust-rows", {{ opacity: 1 }}, {{ opacity: 0, duration: 0.3, ease: "power2.in", immediateRender: false }}, {round(flood, 3)});
    for (let i = 0; i < 5; i++) tl.fromTo(`#trust-et${{i}}`, {{ y: 70, opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, ease: A }}, {round(flood + 0.55, 3)} + i * 0.06);
    tl.fromTo("#trust-cta", {{ opacity: 0, y: 30 }}, {{ opacity: 1, y: 0, duration: 0.6, ease: A }}, {round(cta_at, 3)});
    """
    scene_file("trust", body, css, js, DARK)
    sfx += [("whoosh", s + 0.15, 0.4)] + [("pop", s + vo + a, 0.34) for _, a in rows] + [("impact-bass-1", s + flood + 0.7, 0.3)]
    total = round(t + WIPE, 3)
    return out_scenes, sfx, total


# ── captions (muted viewers) ────────────────────────────────────────────────────────────────
def caption_groups(line, at, inks, max_words=5):
    ws = [dict(w, abs=at + w["s"]) for w in VOICE[line]["words"]]
    groups, cur = [], []
    for w in ws:
        cur.append(w)
        if len(cur) >= max_words or (w["w"][-1] in ".,?!" and len(cur) >= 2):
            groups.append(cur); cur = []
    if cur:
        groups.append(cur)
    out = []
    for i, g in enumerate(groups):
        start = round(g[0]["abs"] - 0.12, 3)
        nxt = groups[i + 1][0]["abs"] - 0.12 if i + 1 < len(groups) else g[-1]["abs"] + (g[-1]["e"] - g[-1]["s"]) + 0.5
        ink = inks(g[0]) if callable(inks) else inks
        out.append((start, round(nxt, 3), g, ink))
    return out


def captions(groups):
    els, js = [], []
    for g, (start, end, words, ink) in enumerate(groups):
        spans = "".join(f'<span id="cap{g}w{i}">{w["w"]}</span> ' for i, w in enumerate(words))
        els.append(f'<div class="cap clip" id="cap{g}" data-start="{start}" data-duration="{round(end - start, 3)}" data-track-index="0" style="color:{ink}">{spans.strip()}</div>')
        for i, w in enumerate(words):
            js.append(f'tl.fromTo("#cap{g}w{i}", {{ opacity: 0.32 }}, {{ opacity: 1, duration: 0.08 }}, {round(w["abs"], 3)});')
    html = f"""<template>
  <style>
    {FONTS}
    #root {{ position: absolute; inset: 0; pointer-events: none; }}
    .cap {{ position: absolute; left: 120px; right: 120px; top: 548px; font-family: "KGeist", sans-serif; font-weight: 600; font-size: 46px; line-height: 1.18; letter-spacing: -0.01em; }}
    .cap span {{ opacity: 0.32; }}
  </style>
  <div id="root" data-composition-id="captions" data-width="1080" data-height="1920">
    {''.join(els)}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {' '.join(js)}
    window.__timelines["captions"] = tl;
  </script>
</template>
"""
    (ROOT / "compositions/captions.html").write_text(html)


# ── sound: peaks one frame after their picture; measured peaks of the bundled effects ──────────
PEAK = {"pop": 0.12, "click-soft": 0.073, "click": 0.073, "whoosh": 0.162, "whoosh-short": 0.162, "impact-bass-1": 0.073, "typing": 0.454, "ping": 0.324}
DUR = {"pop": 0.72, "click-soft": 0.37, "click": 0.37, "whoosh": 0.57, "whoosh-short": 0.57, "impact-bass-1": 2.12, "typing": 1.54, "ping": 1.32}
SFX_GAIN = 0.36


def place_sfx(cues, total):
    out, lanes = [], []
    for n, (name, at, vol, *dur) in enumerate(sorted(cues, key=lambda c: c[1])):
        start = round(at + 1 / FPS - PEAK[name], 3)
        trim = 0.0
        if start < 0:
            trim, start = -start, 0.0
        d = dur[0] if dur else DUR[name] - trim
        d = round(min(d, total - start - 0.001), 3)
        lane = next((i for i, end in enumerate(lanes) if end <= start), None)
        if lane is None:
            lanes.append(0); lane = len(lanes) - 1
        lanes[lane] = start + d
        media = f' data-media-start="{round(trim, 3)}"' if trim else ""
        out.append(f'      <audio id="sfx{n}" class="clip" src="assets/sfx/{name}.mp3" data-start="{start}" data-duration="{d}"{media} data-volume="{round(vol * SFX_GAIN, 3)}" data-track-index="{6 + lane}"></audio>')
    return "\n".join(out)


def main():
    scenes, sfx, total = build()
    start_of = {n: s for n, s, *_ in scenes}
    # captions
    groups = []
    for name, st, D, track, line, vo in scenes:
        if line == "trust":
            kern = VOICE["trust"]["words"][[w["w"] for w in VOICE["trust"]["words"]].index("Kernel")]["s"]
            groups += caption_groups("trust", st + vo, lambda w, k=kern: PAPER if w["s"] < k - 0.01 else INK)
        else:
            groups += caption_groups(line, st + vo, INK)
    groups = [(a, min(b, groups[i + 1][0]) if i + 1 < len(groups) else b, ws, ink) for i, (a, b, ws, ink) in enumerate(groups)]
    captions(groups)
    # root
    hosts = "\n".join(
        f'      <div id="{n}" data-composition-id="{n}" data-composition-src="compositions/{n}.html" data-start="{st}" data-duration="{D}" data-track-index="{tr}" data-track-kind="graphics" data-width="1080" data-height="1920"></div>'
        for n, st, D, tr, _, _ in scenes)
    vo_tags = "\n".join(
        f'      <audio id="vo-{line}" class="clip" src="assets/voice/{line}.mp3" data-start="{round(st + vo, 3)}" data-duration="{round(VLEN[line] - 0.02, 3)}" data-volume="1" data-track-index="5"></audio>'
        for n, st, D, tr, line, vo in scenes)
    audio = vo_tags + "\n" + place_sfx(sfx, total)
    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="assets/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1080px; height: 1920px; overflow: hidden; background: {DARK}; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="1080" data-height="1920">
{hosts}
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{total}" data-track-index="4" data-track-kind="captions" data-width="1080" data-height="1920"></div>
{audio}
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
    (ROOT / "index.html").write_text(html)
    print("total", total)
    for n, st, D, tr, line, vo in scenes:
        print(f"{n:6s} start {st:6.2f}  dur {D:5.2f}  voice {st + vo:6.2f} → {st + vo + VEND[line]:6.2f}")


if __name__ == "__main__":
    (ROOT / "compositions").mkdir(exist_ok=True)
    main()
