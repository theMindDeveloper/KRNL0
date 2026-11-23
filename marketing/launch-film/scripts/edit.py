"""The edit: which real shot plays when (absolute seconds), from which source second, at what speed, with which camera.
cam: list of (rel_t, scale, fx, fy, dur, ease): from rel_t the camera eases to `scale` centred on frame point (fx, fy) over dur.
Every cut lands on a beat; chapter cards sit on the bars where the narration breathes."""
from lib import *

def D(n): return DOWN[n]
# shots: id, t (abs start), src_in, dur (on screen), rate
SHOTS = [
 dict(id="S01-boot",           t=39.67,  src=0.0, dur=6.185),
 dict(id="S05-quickadd",       t=45.855, src=0.0, dur=8.19, cam=[(0.35,1.14,0.5,0.56,1.2,'power1.inOut')]),
 dict(id="S08-calendar-day",   t=54.045, src=0.0, dur=1.385, cam=[(0.35,1.1,0.55,0.55,1.4,'power1.inOut')]),
 dict(id="S06-drag",           t=55.43,  src=0.0, dur=5.4, cam=[(0.35,1.14,0.5,0.58,1.2,'power1.inOut')]),
 dict(id="S09-timer-record",   t=61.8,   src=0.0, dur=7.4, cam=[(0.35,1.16,0.5,0.56,1.4,'power1.inOut')]),
 dict(id="S10-radio-mix",      t=69.2,   src=0.0, dur=10.0, cam=[(0.35,1.2,0.62,0.55,1.5,'power1.inOut')]),
 dict(id="S02-glide",          t=79.2,   src=0.0, dur=8.7),
 dict(id="S07-tick",           t=87.9,   src=0.0, dur=5.0, cam=[(0.35,1.15,0.5,0.5,1.2,'power1.inOut')]),
 dict(id="S13-habit-tick",     t=94.4,   src=0.0, dur=5.1, cam=[(0.35,1.15,0.5,0.55,1.8,'power1.inOut')]),
 dict(id="S14-habit-year",     t=99.5,   src=3.1, dur=1.9),
 dict(id="S15-analytics",      t=101.4,  src=0.0, dur=5.3, cam=[(0.35,1.12,0.5,0.52,2.5,'power1.inOut')]),
 dict(id="S16-day-complete",   t=106.7,  src=0.0, dur=2.8, cam=[(0.35,1.08,0.5,0.55,2.4,'power1.inOut')]),
 dict(id="S18-sticky",         t=111.4,  src=0.0, dur=4.0, rate=1.45, cam=[(0.35,1.2,0.55,0.5,1.2,'power1.inOut')]),
 dict(id="S19-frame",          t=115.4,  src=0.0, dur=2.1, rate=1.2, cam=[(0.35,1.1,0.5,0.48,1.2,'power1.inOut')]),
 dict(id="S20-layout-flip",    t=117.5,  src=0.0, dur=2.7, rate=2.0),
 dict(id="S22-terminal",       t=120.2,  src=0.0, dur=3.5, rate=1.3, cam=[(0.35,1.14,0.5,0.52,1.4,'power1.inOut')]),
 dict(id="S23-orb-ask",        t=123.7,  src=0.0, dur=6.2),
 dict(id="S03-tour-first-day", t=129.9,  src=0.0, dur=7.6, cam=[(0.35,1.15,0.45,0.58,1.6,'power1.inOut')]),
 dict(id="S21-theme-flip",     t=137.5,  src=1.0, dur=3.45, cam=[(0.35,1.15,0.45,0.58,1.4,'power1.inOut')]),
 dict(id="S25-chrome-zoomout", t=140.95, src=0.0, dur=11.95, rate=0.83),
]
CHAPTERS = [  # on the bars where the narration breathes
 dict(t0=42.585, t1=44.225, words=["Plan", "it."],        bg=LAV,   fg=INK, ghost="11:00"),
 dict(t0=60.450, t1=62.090, words=["Do", "it."],          bg=CYAN,  fg=INK, ghost="25:00"),
 dict(t0=92.835, t1=94.400, words=["See", "it."],         bg=CORAL, fg=INK, ghost="21:00"),
 dict(t0=109.10, t1=111.40, words=["Make", "it", "yours."], bg=ACID, fg=INK, ghost="0", size=290),
]
