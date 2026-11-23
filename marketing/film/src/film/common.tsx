import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, delayRender, continueRender } from "remotion";
import { fontsReady } from "../lib/fonts";
export const useT = () => { const f = useCurrentFrame(); const { fps } = useVideoConfig(); return { f, t: f / fps }; };
export const useFonts = () => { const [h] = React.useState(() => delayRender("fonts")); React.useEffect(() => { fontsReady.then(() => continueRender(h)); }, [h]); };
/** The ground: a dark bay with a faint key, or a coloured studio sweep that dark app windows stand out on. */
export const Bay: React.FC<{ studio?: string | null; glow?: string }> = ({ studio, glow = "rgba(201,241,88,0.05)" }) => (
  studio
    ? <AbsoluteFill style={{ background: `radial-gradient(ellipse 72% 78% at 50% 36%, ${studio} 0%, color-mix(in srgb, ${studio} 52%, #000) 58%, color-mix(in srgb, ${studio} 18%, #000) 100%)` }} />
    : <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 55% at 50% 42%, ${glow} 0%, transparent 70%), radial-gradient(ellipse 95% 85% at 50% 38%, #171715 0%, #070707 72%)` }} />
);
const rad = (d: number) => (d * Math.PI) / 180;
export type V3 = [number, number, number];
export const rotX = (v: V3, a: number): V3 => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
export const rotY = (v: V3, a: number): V3 => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
export const rotZ = (v: V3, a: number): V3 => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
// window cut-outs from the 2880x1620 recordings (px) and what each shows
export const RECT: Record<string, { src: string; rect: [number, number, number, number]; at: number }> = {
  todo: { src: "S07-tick", rect: [628, 136, 1996, 1504], at: 0.2 },
  cal: { src: "S08-calendar-day", rect: [806, 204, 2073, 1437], at: 0.5 },
  habit: { src: "S13-habit-tick", rect: [809, 191, 2070, 1452], at: 5.0 },
  timer: { src: "S09-timer-record", rect: [160, 200, 1369, 1410], at: 5.0 },
  analytics: { src: "S15-analytics", rect: [809, 191, 2070, 1452], at: 4.0 },
  radio: { src: "S10-radio-mix", rect: [1662, 194, 2583, 1458], at: 4.0 },
  sticky: { src: "S18-sticky", rect: [2040, 450, 2480, 890], at: 6.0 },
  frame: { src: "S19-frame", rect: [470, 520, 2190, 1320], at: 0.2 },
  terminal: { src: "S22-terminal", rect: [250, 241, 1420, 1402], at: 5.0 },
};
