import React from "react";
import { AbsoluteFill } from "remotion";
import { Space, Plane, Finish, Cam } from "../lib/space";
import { Cube } from "../lib/cube";
import { SvgCube } from "../lib/svgcube";
import { ToolCard, Kind } from "../lib/cards";
import { Img, staticFile } from "remotion";
import { SANS, MONO, C } from "../lib/fonts";
import { keys, sine, inOut, prog, outExpo, outPow, inPow, lerp, rand, clamp } from "../lib/ease";
import { Bay, useT, RECT } from "./common";
import TL from "./timeline.json";

const wordT = (k: string, w: string, n = 0) => (TL.words as Record<string, { w: string; t: number }[]>)[k].filter((x) => x.w.replace(/[.,?!']/g, "").toLowerCase() === w.toLowerCase())[n].t;

/** A window cut out of a recording, as a plane in the world. */
const Win: React.FC<{ cam: Cam; id: string; x: number; y: number; z: number; w: number; ry?: number; rx?: number; opacity?: number }> = ({ cam, id, x, y, z, w, ry = 0, rx = 0, opacity = 1 }) => {
  const r = RECT[id]; const h = Math.round((w * (r.rect[3] - r.rect[1])) / (r.rect[2] - r.rect[0]));
  return (
    <Plane cam={cam} x={x} y={y} z={z} w={w} h={h} ry={ry} rx={rx} radius={20} shadow sheen={0.06} opacity={opacity}>
      <Img src={staticFile(`stills/${id}.png`)} style={{ width: w, height: h, display: "block" }} />
    </Plane>
  );
};

// ── chapter title, set in the studio's space, the app soft behind it ──
export const Title: React.FC<{ words: string[]; studio: string; accent: string; dur: number }> = ({ words, studio, accent, dur }) => {
  const { f, t } = useT();
  const cam: Cam = { x: 0, y: 0, z: lerp(1000, 940, sine(t / dur)), yaw: 0, pitch: 0, focus: 960, aperture: 12 };
  const lift = 1;
  const chars = words.join(" ").length; const size = Math.min(300, Math.round(1500 / (chars * 0.42 * 1.55)));
  return (
    <AbsoluteFill>
      <Bay studio={studio} />
      <Space cam={cam} bg="transparent">
        <Win cam={cam} id="todo" x={-1150} y={60} z={-1400} w={760} ry={16} opacity={0.85} />
        <Win cam={cam} id="cal" x={0} y={-40} z={-1900} w={820} opacity={0.85} />
        <Win cam={cam} id="habit" x={1150} y={80} z={-1400} w={760} ry={-16} opacity={0.85} />
        <Plane cam={cam} x={0} y={0} z={0} w={1700} h={380}>
          <div style={{ display: "flex", gap: size * 0.13, justifyContent: "center", alignItems: "center", height: "100%", font: `800 ${size}px ${SANS}`, letterSpacing: "-0.055em", color: C.paper, textShadow: "0 20px 60px rgba(0,0,0,.35)" }}>
            {words.map((w, i) => { const p = outExpo(prog(t, 0.3 + i * 0.09, 0.7 + i * 0.09)) * (1 - prog(t, dur - 0.42 + i * 0.04, dur - 0.2 + i * 0.04)); return <span key={i} style={{ opacity: p, filter: `blur(${(1 - p) * 16}px)`, color: i === words.length - 1 ? accent : C.paper }}>{w}</span>; })}
          </div>
        </Plane>
      </Space>
      <Finish frame={f} vignette={0.5} exposure={lift} />
    </AbsoluteFill>
  );
};

// ── the canvas world: real windows as planes at their own depths ──
type P = { id: string; x: number; y: number; z: number; w: number; ry?: number };
const ROW: P[] = [
  { id: "todo", x: -1020, y: 0, z: -500, w: 600, ry: 18 }, { id: "cal", x: -350, y: -20, z: -760, w: 620, ry: 6 },
  { id: "habit", x: 350, y: 20, z: -760, w: 600, ry: -6 }, { id: "timer", x: 1020, y: 0, z: -500, w: 580, ry: -18 },
];
export const World: React.FC<{ preset: string; studio: string | null; dur: number }> = ({ preset, studio, dur }) => {
  const { f, t } = useT();
  let cam: Cam; let planes: P[]; let flash = 0;
  const k = t / dur;
  if (preset === "reveal") {
    const c = keys<{ z: number; x: number; y: number }>([[0, { z: 1100, x: 0, y: 0 }], [dur * 0.85, { z: 2350, x: 0, y: 10 }, inOut], [dur, { z: 2450, x: 0, y: 10 }]], t);
    cam = { ...c, yaw: 0, pitch: 0, focus: c.z + 650, aperture: 6 };
    planes = [...ROW, { id: "analytics", x: -380, y: -760, z: -1700, w: 560, ry: 6 }, { id: "radio", x: 420, y: 760, z: -1700, w: 460, ry: -6 }];
    flash = Math.max(0, 1 - t / 0.45);
  } else if (preset === "calm") {
    cam = { x: lerp(-200, 200, sine(k)), y: 0, z: 2350, yaw: lerp(-2, 2, sine(k)), pitch: 0, focus: 3000, aperture: 8 };
    planes = ROW;
  } else if (preset === "yours") {
    cam = { x: lerp(-380, 220, inOut(k)), y: lerp(40, -20, k), z: lerp(1500, 1400, k), yaw: lerp(-4, 3, inOut(k)), pitch: 0, focus: lerp(1850, 1800, k), aperture: 10 };
    planes = [{ id: "todo", x: -600, y: 20, z: -350, w: 640, ry: 14 }, { id: "sticky", x: 60, y: -170, z: -200, w: 330, ry: 4 }, { id: "frame", x: 400, y: 210, z: -650, w: 820, ry: -10 },
      { id: "terminal", x: 1150, y: -60, z: -1300, w: 600, ry: -16 }, { id: "cal", x: -1350, y: -40, z: -1500, w: 640, ry: 18 }];
  } else { // finale: the whole board, the camera pulls all the way back, then it all falls into one point
    const c = keys<{ z: number; y: number }>([[0, { z: 2200, y: 0 }], [dur * 0.78, { z: 4300, y: -40 }, inOut], [dur, { z: 4400, y: -40 }]], t);
    cam = { x: 0, y: c.y, z: c.z, yaw: 0, pitch: 0, focus: c.z + 650, aperture: 9 };
    const grid: [string, number, number][] = [["todo", -1350, -420], ["cal", -450, -440], ["habit", 450, -420], ["timer", 1350, -430], ["analytics", -900, 330], ["radio", 0, 360], ["frame", 900, 330], ["sticky", -1550, 340], ["terminal", 1650, 320]];
    const fall = inPow(prog(t, dur - 0.9, dur), 3);
    planes = grid.map(([id, x, y], i) => ({ id, x: x * (1 - fall), y: y * (1 - fall), z: -650 - (i % 3) * 120 - fall * 400, w: id === "sticky" ? 300 : id === "frame" ? 780 : 640 }));
  }
  const lift = 1;
  return (
    <AbsoluteFill>
      <Bay studio={studio} glow={preset === "reveal" ? "rgba(201,241,88,0.10)" : undefined} />
      <Space cam={cam} bg="transparent">
        {planes.map((p, i) => <Win key={i} cam={cam} id={p.id} x={p.x} y={p.y} z={p.z} w={p.w} ry={p.ry ?? 0} />)}
      </Space>
      <Finish frame={f} vignette={studio ? 0.5 : 0.85} exposure={lift} />
      {flash > 0 ? <AbsoluteFill style={{ background: `rgba(216,255,122,${flash})` }} /> : null}
    </AbsoluteFill>
  );
};

// ── the intro: a crisp vector cube with a heartbeat on its lit core, the old way (sharp cards in depth),
//    the cards falling into the cube, and the dive through the core on the drop ──
const KINDS: Kind[] = ["list", "cal", "timer", "habit", "tabs", "note", "mail", "chat"];
const HEART = [1.11, 2.68, 4.38];   // the intro music's heartbeat hits
export const Intro: React.FC = () => {
  const { f, t } = useT();
  const cam: Cam = { x: 0, y: 0, z: 1000, yaw: 0, pitch: 0, focus: 1000, aperture: 0 };
  const DROP = TL.drop, P2 = TL.voice.p2.start, R1 = TL.voice.r1.start;
  const spawn: [number, Kind, number, number, number][] = [
    [wordT("p1", "list"), "list", -430, -40, -900], [wordT("p1", "calendar"), "cal", 420, -170, -1100], [wordT("p1", "timer"), "timer", 40, 240, -1250],
    [wordT("p1", "habit"), "habit", 640, 280, -1500], [wordT("p1", "dozen"), "tabs", -720, 300, -1650], [wordT("p1", "dozen") + 0.2, "tabs", 140, -430, -1800],
    [wordT("p1", "dozen") + 0.4, "tabs", -420, -470, -1950], [wordT("p1", "dozen") + 0.6, "tabs", 900, -330, -2100], [wordT("p1", "open") + 0.2, "note", -980, -60, -2250],
    [wordT("p1", "open") + 0.4, "mail", 1060, 120, -2350], [wordT("p1", "open") + 0.6, "chat", -160, 20, -2500], [wordT("p1", "none"), "list", 460, 520, -2650],
  ];
  const dolly = lerp(0, 380, sine(prog(t, 5.5, P2)));
  const apart = sine(prog(t, wordT("p1", "none"), P2)) * 0.18;
  const cEnd = R1 - 0.1, cStart = TL.voice.p2.end + 0.15;
  const collapse = inOut(prog(t, cStart, cEnd));
  const dark = t >= P2 - 0.2 && t < cStart + 0.6 ? 0.5 * Math.min(1, prog(t, P2 - 0.2, P2 + 0.2)) * (1 - prog(t, cStart, cStart + 0.6)) : 0;
  // heartbeat on the core
  const beat = HEART.reduce((a, h) => a + (t >= h ? Math.exp(-(t - h) * 3.2) : 0), 0);
  const glowIntro = Math.min(1, 0.25 + 0.9 * beat);
  // cube scale: macro on the lit tile -> whole cube -> falls away -> returns as the cards fall in -> dives into the core
  const BASE = 520; // px, whole cube
  let s = 1, ox = 0, oy = 0, op = 1, glow = glowIntro;
  const macro = 6.5;  // how many times bigger in the macro
  const pull = inOut(prog(t, 2.9, 5.0));
  s = lerp(macro, 1, pull);
  const toCore = (k: number) => { ox = -(-50 * 0) ; oy = 50 * (BASE / 200) * s * k; };
  toCore(1 - pull);
  if (t >= 5.2) { const k = inOut(prog(t, 5.2, 6.3)); s = lerp(1, 0.05, k); op = 1 - prog(t, 5.9, 6.3); }
  if (t >= cStart + 0.8) { const k = outExpo(prog(t, cStart + 0.8, cEnd + 0.4)); s = lerp(0.1, 1, k); op = Math.min(1, k * 1.5); oy = 0; glow = 0.55 + 0.45 * prog(t, R1, DROP); }
  if (t >= DROP - 0.75) {   // centre the lit tile first, then dive straight into it
    const c = inOut(prog(t, DROP - 0.75, DROP - 0.4)); const k = inPow(prog(t, DROP - 0.45, DROP), 3);
    s = lerp(1, 60, k); oy = 50 * (BASE / 200) * s * c; glow = 1;
  }
  const acid = t >= DROP - 0.12 ? 1 : 0;
  const tilesK = outExpo(prog(t, wordT("r1", "kernel") - 0.1, wordT("r1", "kernel") + 0.5)) * (1 - prog(t, DROP - 0.6, DROP - 0.35));
  return (
    <AbsoluteFill>
      <Bay glow={t > 5 && t < P2 ? "rgba(169,139,246,0.08)" : "rgba(201,241,88,0.07)"} />
      {t > 5.3 && collapse < 1 ? (
        <Space cam={cam} bg="transparent">
          {spawn.map(([at, kind, x, y, z], i) => {
            if (t < at - 0.05) return null;
            const a = outExpo(prog(t, at, at + 0.4));
            const z2 = lerp(z + dolly, -1600, collapse);
            const d = cam.z - z2; const halfW = (900 * d) / 1500 - 330, halfH = (500 * d) / 1500 - 250;
            const xx = Math.max(-halfW, Math.min(halfW, x * (1 + apart))) * (1 - collapse);
            const yy = Math.max(-halfH, Math.min(halfH, y * (1 + apart))) * (1 - collapse);
            const fade = 1 - prog(collapse, 0.7, 1);
            return <Plane key={i} cam={cam} x={xx} y={yy + (1 - a) * 40} z={z2} w={520} h={360} ry={lerp(-22, 22, rand(i * 3 + 1)) * (1 - collapse)} rz={lerp(-7, 7, rand(i * 5)) * (1 - collapse)}
              opacity={Math.min(1, a * 1.6) * fade}><ToolCard kind={kind} w={520} h={360} /></Plane>;
          })}
        </Space>
      ) : null}
      {dark > 0 ? <AbsoluteFill style={{ background: `rgba(0,0,0,${dark})` }} /> : null}
      {op > 0.01 ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: BASE, height: BASE, opacity: op, transform: `translate(${ox}px, ${oy}px) scale(${s})`, transformOrigin: "50% 50%" }}>
            <SvgCube size={BASE} glow={glow} id="intro" />
          </div>
        </AbsoluteFill>
      ) : null}
      {tilesK > 0.01 ? (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}>
          <div style={{ display: "flex", gap: 14, opacity: tilesK, transform: `translateY(${(1 - tilesK) * 30}px)` }}>
            {["K", "R", "N", "L", "0"].map((c, i) => <b key={i} style={{ width: 84, height: 84, borderRadius: 18, border: "4px solid #0a0908", display: "grid", placeItems: "center", font: `800 56px ${SANS}`, color: C.ink, background: [C.acid, C.cyan, C.coral, C.lav, C.paper][i] }}>{c}</b>)}
          </div>
        </AbsoluteFill>
      ) : null}
      <Finish frame={f} grain={0.03} exposure={t < 0.5 ? 0.15 + 0.85 * prog(t, 0, 0.5) : 1} />
      {acid ? <AbsoluteFill style={{ background: "#d8ff7a" }} /> : null}
    </AbsoluteFill>
  );
};

// ── the end card ──
export const End: React.FC<{ dur: number }> = ({ dur }) => {
  const { f, t } = useT();
  const T0 = TL.endHit;
  const at = (w: string) => wordT("en", w) - T0;
  const cam: Cam = { x: 0, y: 0, z: 1000, yaw: 0, pitch: 0, focus: 1000, aperture: 6 };
  const land = outExpo(prog(t, 0, 0.7));
  const fadeOut = 1 - prog(t, dur - 1.6, dur);
  const pop = (a: number) => outExpo(prog(t, a, a + 0.45));
  return (
    <AbsoluteFill>
      <Bay glow="rgba(201,241,88,0.12)" />
      <div style={{ position: "absolute", left: 490 - 200, top: 530 - 200, width: 400, height: 400, opacity: Math.min(1, land * 1.4), transform: `scale(${lerp(1.6, 1, land)})` }}>
        <SvgCube size={400} glow={0.75 + 0.25 * Math.sin(t * 2.2) ** 2} id="end" />
      </div>
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 790, top: 330, display: "flex", gap: 14 }}>
          {["K", "R", "N", "L", "0"].map((c, i) => { const p = pop(0.15 + i * 0.07); return (
            <b key={i} style={{ width: 150, height: 150, borderRadius: 30, border: "6px solid #0a0908", display: "grid", placeItems: "center", font: `800 104px ${SANS}`, color: C.ink, opacity: p, transform: `translateY(${(1 - p) * 40}px)`,
              background: [C.acid, C.cyan, C.coral, C.lav, C.paper][i], boxShadow: "0 30px 60px rgba(0,0,0,.45)" }}>{c}</b>); })}
        </div>
        <div style={{ position: "absolute", left: 794, top: 516, font: `700 46px ${SANS}`, letterSpacing: "-0.02em", color: C.paper, opacity: pop(0.5) }}>Your whole day, one canvas.</div>
        <div style={{ position: "absolute", left: 794, top: 606, display: "flex", gap: 14 }}>
          {["Free", "No account", "Windows · macOS · Linux"].map((c, i) => { const p = pop([at("free"), at("no"), at("computer") - 0.2][i]); return (
            <span key={i} style={{ font: `800 30px ${MONO}`, padding: "10px 24px", borderRadius: 999, border: `3px solid ${C.acid}`, color: C.acid, opacity: p, transform: `translateY(${(1 - p) * 20}px)` }}>{c}</span>); })}
        </div>
        <div style={{ position: "absolute", left: 794, top: 704, font: `800 48px ${SANS}`, letterSpacing: "-0.02em", background: C.acid, color: C.ink, padding: "20px 42px", borderRadius: 999, opacity: pop(at("download")), transform: `scale(${0.92 + 0.08 * pop(at("download"))})`, transformOrigin: "0 50%" }}>Download it today · link below</div>
      </AbsoluteFill>
      <Finish frame={f} vignette={0.8} exposure={fadeOut} />
      {t < 0.3 ? <AbsoluteFill style={{ background: `rgba(216,255,122,${0.35 * (1 - t / 0.3)})` }} /> : null}
    </AbsoluteFill>
  );
};
