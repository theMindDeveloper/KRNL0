import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender } from "remotion";
import { Space, Plane, Finish, Cam } from "../lib/space";
import { Cube } from "../lib/cube";
import { ToolCard, Kind } from "../lib/cards";
import { Crop } from "../lib/media";
import { FocusPlate, Slab } from "../lib/focus";
import { fontsReady, SANS, C } from "../lib/fonts";
import { keys, sine, inOut, rand, lerp, prog, outExpo } from "../lib/ease";

const useT = () => { const f = useCurrentFrame(); const { fps } = useVideoConfig(); return { f, t: f / fps }; };
const useFonts = () => { const [h] = React.useState(() => delayRender("fonts")); React.useEffect(() => { fontsReady.then(() => continueRender(h)); }, [h]); };
const Bay: React.FC<{ glow?: string; studio?: string }> = ({ glow = "rgba(201,241,88,0.06)", studio }) => (
  studio
    ? <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 75% at 50% 38%, ${studio} 0%, color-mix(in srgb, ${studio} 55%, #000) 55%, color-mix(in srgb, ${studio} 22%, #000) 100%)` }} />
    : <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 55% at 50% 45%, ${glow} 0%, transparent 70%), radial-gradient(ellipse 90% 80% at 50% 40%, #151513 0%, #060606 70%)` }} />
);

// 1 — the lit core: a macro on the top tile, then the camera pulls back to the whole cube, centred
export const LookCube: React.FC = () => {
  useFonts(); const { f, t } = useT();
  const cam: Cam = { x: 0, y: 0, z: 1000, yaw: 0, pitch: 0, focus: 1000, aperture: 6 };
  const k = inOut(prog(t, 1.3, 6.8));
  const rx = lerp(-90, -35.26, k), ry = 45 + 6 * Math.sin(t * 0.35);
  // the top tile's centre relative to the cube centre, after the cube's own rotation
  const h = 180, r = (rx * Math.PI) / 180;
  const off = [0, -h * Math.cos(r), -h * Math.sin(r)];
  const macroZ = 1000 - 300;                      // the core sits 300 px from the lens at the start
  const cx = 0, cy = lerp(-off[1], 0, k), cz = lerp(macroZ - off[2], 0, k);
  const pulse = (t > 0.5 ? Math.exp(-(t - 0.5) * 4) : 0) + (t > 0.9 ? 0.7 * Math.exp(-(t - 0.9) * 4) : 0);
  return (
    <AbsoluteFill>
      <Bay />
      <Space cam={cam} bg="transparent">
        <Cube cam={cam} size={360} x={cx} y={cy} z={cz} rx={rx} ry={ry} core={0.55 + 0.45 * Math.min(1, pulse + k)} />
      </Space>
      <Finish frame={f} />
    </AbsoluteFill>
  );
};

// 2 — the old way: tool cards scattered through depth; the camera dollies through them, focus pulling
const KINDS: Kind[] = ["list", "cal", "timer", "habit", "tabs", "note", "mail", "chat"];
export const CARDS = Array.from({ length: 22 }, (_, i) => ({
  kind: KINDS[i % 8], x: lerp(-1100, 1100, rand(i * 3 + 1)), y: lerp(-560, 560, rand(i * 3 + 2)), z: -i * 170 - 200,
  ry: lerp(-28, 28, rand(i * 7 + 5)), rz: lerp(-8, 8, rand(i * 5 + 3)),
}));
export const LookCards: React.FC = () => {
  useFonts(); const { f, t } = useT();
  const z = lerp(900, -1400, inOut(t / 6));
  const cam: Cam = { x: Math.sin(t * 0.5) * 120, y: 0, z, yaw: lerp(-6, 6, sine(t / 6)), pitch: 0, focus: 900, aperture: 9 };
  return (
    <AbsoluteFill>
      <Bay glow="rgba(169,139,246,0.08)" />
      <Space cam={cam} bg="transparent">
        {CARDS.map((k, i) => { const d = cam.z - k.z; return <Plane key={i} cam={cam} x={k.x} y={k.y} z={k.z} w={420} h={290} ry={k.ry} rz={k.rz} opacity={Math.min(1, Math.max(0, (d - 380) / 260))}><ToolCard kind={k.kind} /></Plane>; })}
      </Space>
      <Finish frame={f} />
    </AbsoluteFill>
  );
};

// 3 — the app as a device: the whole screen on a tilted plane with thickness and depth of field
export const LookUI: React.FC = () => {
  useFonts(); const { f, t } = useT();
  const k = sine(t / 6);
  const cam: Cam = { x: lerp(-40, 40, k), y: lerp(20, -10, k), z: lerp(1180, 1080, k), yaw: lerp(-2, 2, k), pitch: 0, focus: 1150, aperture: 3 };
  const W = 1700, H = 956;
  return (
    <AbsoluteFill>
      <Bay studio="#7d62d6" />
      <Space cam={cam} bg="transparent">
        <div style={{ position: "absolute", left: -W / 2, top: -H / 2, width: W, height: H, transformStyle: "preserve-3d", transform: `rotateX(${lerp(9, 6, k)}deg) rotateY(${lerp(-12, -8, k)}deg)` }}>
          <Slab radius={26} />
          <div style={{ position: "absolute", inset: 0, borderRadius: 26, overflow: "hidden", boxShadow: "0 90px 180px rgba(10,0,40,.55), 0 30px 60px rgba(0,0,0,.4)" }}>
            <FocusPlate w={W} h={H} fx={W * 0.5} fy={H * 0.62} rx={1500} ry={760} blur={5} render={() => <Crop src="S05-quickadd" rect={[0, 0, 2880, 1620]} w={W} h={H} startFrom={0} />} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(125deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 32%)" }} />
          </div>
        </div>
      </Space>
      <Finish frame={f} vignette={0.6} />
    </AbsoluteFill>
  );
};

// 4 — the canvas world: each window is its own plane at its own depth; the camera glides and the focus pulls
const WIN: { src: string; rect: [number, number, number, number]; x: number; y: number; z: number; ry: number; at?: number }[] = [
  { src: "S07-tick", rect: [628, 136, 1996, 1504], x: -470, y: 30, z: -250, ry: 14 },
  { src: "S08-calendar-day", rect: [806, 204, 2073, 1437], x: 430, y: -10, z: -500, ry: -10 },
  { src: "S13-habit-tick", rect: [809, 191, 2070, 1452], x: 1350, y: 60, z: -1500, ry: -16 },
  { src: "S09-timer-record", rect: [160, 200, 1369, 1410], x: -1300, y: -40, z: -1500, ry: 16, at: 3 },
];
export const LookWorld: React.FC = () => {
  useFonts(); const { f, t } = useT();
  const k = inOut(t / 6);
  const cam: Cam = { x: lerp(-160, 160, k), y: 0, z: lerp(1150, 1050, k), yaw: lerp(-4, 4, k), pitch: 0, focus: lerp(1400, 1550, k), aperture: 9 };
  return (
    <AbsoluteFill>
      <Bay studio="#1fb6cc" />
      <Space cam={cam} bg="transparent">
        {WIN.map((w, i) => { const ww = 760, hh = Math.round(ww * (w.rect[3] - w.rect[1]) / (w.rect[2] - w.rect[0])); return (
          <Plane key={i} cam={cam} x={w.x} y={w.y} z={w.z} w={ww} h={hh} ry={w.ry} radius={22} shadow sheen={0.07}>
            <Crop src={w.src} rect={w.rect} w={ww} h={hh} startFrom={w.at ?? 0} />
          </Plane>); })}
      </Space>
      <Finish frame={f} vignette={0.55} />
    </AbsoluteFill>
  );
};

// 5 — a chapter title set in the same space, in focus, with the windows soft behind it
export const LookTitle: React.FC = () => {
  useFonts(); const { f, t } = useT();
  const cam: Cam = { x: 0, y: 0, z: lerp(1000, 920, sine(t / 4)), yaw: lerp(-0.6, 0.6, sine(t / 4)), pitch: 0, focus: 960, aperture: 12 };
  const words = ["Plan", "it."];
  return (
    <AbsoluteFill>
      <Bay studio="#7d62d6" />
      <Space cam={cam} bg="transparent">
        {WIN.slice(0, 3).map((w, i) => (
          <Plane key={i} cam={cam} x={w.x * 1.2} y={w.y + 60} z={w.z - 900} w={620} h={600} ry={w.ry} radius={20} opacity={0.8}>
            <Crop src={w.src} rect={w.rect} w={620} h={600} />
          </Plane>
        ))}
        <Plane cam={cam} x={0} y={0} z={0} w={1500} h={360}>
          <div style={{ display: "flex", gap: 40, justifyContent: "center", alignItems: "center", height: "100%", font: `800 300px ${SANS}`, letterSpacing: "-0.055em", color: C.paper }}>
            {words.map((w, i) => { const p = outExpo(prog(t, 0.3 + i * 0.12, 0.9 + i * 0.12)); return <span key={i} style={{ opacity: p, filter: `blur(${(1 - p) * 14}px)`, color: i === 1 ? C.acid : C.paper }}>{w}</span>; })}
          </div>
        </Plane>
      </Space>
      <Finish frame={f} />
    </AbsoluteFill>
  );
};
