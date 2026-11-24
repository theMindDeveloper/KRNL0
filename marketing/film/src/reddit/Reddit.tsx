// Three showcase images for a Reddit post (1920x1080, rendered at 1.5x). Real app windows (stills cut from the
// recordings) on tilted planes with depth, in the film's look.
import React from "react";
import { AbsoluteFill, Img, staticFile, delayRender, continueRender } from "remotion";
import { fontsReady, SANS, MONO, C } from "../lib/fonts";
import { SvgCube } from "../lib/svgcube";

const useFonts = () => { const [h] = React.useState(() => delayRender("fonts")); React.useEffect(() => { fontsReady.then(() => continueRender(h)); }, [h]); };
type WinP = { id: string; x: number; y: number; w: number; ry?: number; rx?: number; rz?: number; z?: number; blur?: number; ar?: number; glow?: string };
const AR: Record<string, number> = { todo: 1, cal: 1233 / 1267, habit: 1, timer: 1, clock: 1, timer2: 1, habityear: 1, analytics2: 1, radio2: 1264 / 921, sticky: 1, frame: 800 / 1720, terminal: 1161 / 1170, recap: 1092 / 1418 };
const Win: React.FC<WinP> = ({ id, x, y, w, ry = 0, rx = 0, rz = 0, z = 0, blur = 0, glow }) => {
  const h = Math.round(w * (AR[id] ?? 1));
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, transform: `perspective(2600px) translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`,
      filter: blur ? `blur(${blur}px)` : undefined, borderRadius: 22, overflow: "hidden",
      boxShadow: `0 60px 120px rgba(0,0,0,.55), 0 20px 40px rgba(0,0,0,.4)${glow ? `, 0 0 0 2px ${glow}, 0 0 60px ${glow}55` : ""}` }}>
      <Img src={staticFile(`stills2/${id}.png`)} style={{ width: "100%", height: "100%", display: "block" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(125deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,0) 35%)" }} />
    </div>
  );
};
const Grain: React.FC = () => (
  <AbsoluteFill style={{ opacity: 0.05, mixBlendMode: "overlay", backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='4'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>")` }} />
);
const Tiles: React.FC<{ s?: number }> = ({ s = 70 }) => (
  <div style={{ display: "flex", gap: s * 0.16 }}>
    {["K", "R", "N", "L", "0"].map((c, i) => <b key={i} style={{ width: s, height: s, borderRadius: s * 0.22, border: `${Math.max(3, s * 0.05)}px solid ${C.ink}`, display: "grid", placeItems: "center", font: `800 ${s * 0.68}px ${SANS}`, color: C.ink, background: [C.acid, C.cyan, C.coral, C.lav, C.paper][i] }}>{c}</b>)}
  </div>
);

// 1 — the hero: the whole idea in one frame
export const Reddit1: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 70% at 72% 50%, rgba(201,241,88,.14) 0%, transparent 60%), radial-gradient(ellipse 100% 90% at 60% 40%, #181816 0%, #060606 75%)", fontFamily: SANS }}>
      <Win id="habit" x={1380} y={110} w={400} ry={-24} rx={6} blur={3.5} />
      <Win id="todo" x={900} y={150} w={420} ry={22} rx={6} blur={2.5} />
      
      <Win id="cal" x={1010} y={330} w={500} ry={14} rx={8} z={60} />
      <Win id="clock" x={1390} y={450} w={420} ry={-18} rx={8} z={120} glow={C.acid} />
      <div style={{ position: "absolute", left: 110, top: 130, width: 820 }}>
        <div style={{ width: 150, height: 150, marginBottom: 30 }}><SvgCube size={150} glow={0.9} id="r1" /></div>
        <div style={{ font: `800 100px ${SANS}`, letterSpacing: "-0.05em", lineHeight: 0.95, color: C.paper, whiteSpace: "nowrap" }}>Your whole day,<br /><span style={{ color: C.acid }}>one canvas.</span></div>
        <div style={{ marginTop: 34, width: 640, font: `500 30px ${SANS}`, lineHeight: 1.35, color: "#bdb9ae" }}>To-dos, calendar, a focus timer, habits, notes and a live clock, on one infinite canvas that knows how they connect.</div>
        <div style={{ marginTop: 40 }}><Tiles s={64} /></div>
        <div style={{ marginTop: 34, display: "flex", gap: 12 }}>
          {["Free", "No account", "Local-first", "Win · macOS · Linux"].map((c) => <span key={c} style={{ whiteSpace: "nowrap", font: `800 20px ${MONO}`, padding: "8px 16px", borderRadius: 999, border: `2px solid ${C.acid}`, color: C.acid }}>{c}</span>)}
        </div>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

// 2 — plan it · do it · see it: three studio panels, a real window on each
const Panel: React.FC<{ x: number; bg: string; title: string; sub: string; children: React.ReactNode }> = ({ x, bg, title, sub, children }) => (
  <div style={{ position: "absolute", left: x, top: 70, width: 590, height: 940, borderRadius: 40, overflow: "hidden",
    background: `radial-gradient(ellipse 90% 80% at 50% 30%, ${bg} 0%, color-mix(in srgb, ${bg} 45%, #000) 100%)` }}>
    <div style={{ position: "absolute", left: 46, top: 44, font: `800 92px ${SANS}`, letterSpacing: "-0.055em", color: C.paper }}>{title}</div>
    <div style={{ position: "absolute", left: 50, top: 160, width: 490, font: `600 28px ${SANS}`, lineHeight: 1.3, color: "rgba(255,255,255,.85)" }}>{sub}</div>
    {children}
  </div>
);
export const Reddit2: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: "#070707", fontFamily: SANS }}>
      <Panel x={45} bg="#6c52cf" title={"Plan it."} sub="Type it the way you'd say it. It lands on your calendar.">
        <Win id="cal" x={48} y={300} w={500} ry={10} rx={8} />
      </Panel>
      <Panel x={665} bg="#139bb0" title={"Do it."} sub="Press start. Every minute lands on the plan, live on the clock.">
        <Win id="clock" x={48} y={300} w={500} ry={-10} rx={8} glow={C.acid} />
      </Panel>
      <Panel x={1285} bg="#c0603f" title={"See it."} sub="Planned against spent. What you meant to do, and what you did.">
        <Win id="analytics2" x={48} y={300} w={500} ry={-10} rx={8} />
      </Panel>
      <Grain />
    </AbsoluteFill>
  );
};

// 3 — make it yours: the canvas, the sounds, the terminal, the habits, and the call to action
export const Reddit3: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 75% 80% at 50% 35%, #93b23a 0%, #4b5c1b 55%, #1a200a 100%)", fontFamily: SANS }}>
      <Win id="frame" x={90} y={330} w={760} ry={14} rx={8} />
      <Win id="terminal" x={230} y={585} w={290} ry={12} rx={8} z={60} />
      <Win id="habityear" x={900} y={300} w={450} ry={2} rx={8} />
      <Win id="radio2" x={1420} y={300} w={300} ry={-16} rx={8} />
      <div style={{ position: "absolute", left: 110, top: 70, font: `800 120px ${SANS}`, letterSpacing: "-0.055em", color: C.paper, textShadow: "0 20px 60px rgba(0,0,0,.35)" }}>Make it <span style={{ color: C.ink }}>yours.</span></div>
      <div style={{ position: "absolute", left: 116, top: 210, font: `600 30px ${SANS}`, color: "rgba(255,255,255,.88)" }}>Notes and frames next to your plan · focus sounds · habits by the year · a real terminal · a guided tour</div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, display: "flex", justifyContent: "center", alignItems: "center", gap: 26 }}>
        <div style={{ width: 110, height: 110 }}><SvgCube size={110} glow={0.85} id="r3" /></div>
        <Tiles s={70} />
        <div style={{ font: `800 34px ${SANS}`, background: C.ink, color: C.acid, padding: "18px 34px", borderRadius: 999 }}>Free · link in comments</div>
      </div>
      <Grain />
    </AbsoluteFill>
  );
};
