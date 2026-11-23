import React from "react";
import { AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame } from "remotion";
import EDL from "./edl.json";
import TL from "./timeline.json";
import FOOT from "./footage.json";
import { Device, DeviceProps } from "./Device";
import { Title, World, Intro, End } from "./Scenes";
import { useFonts } from "./common";

const FPS = 30;
const fr = (s: number) => Math.round(s * FPS);
type Shot = Record<string, any>;

// ── sound ──
const PEAK: Record<string, number> = { pop: 0.12, "click-soft": 0.073, click: 0.073, whoosh: 0.162, "whoosh-short": 0.162, "impact-bass-1": 0.073, "impact-bass-2": 1.986, typing: 0.454, riser: 3.472, "whoosh-cinematic": 2.503, sparkle: 0.027, ping: 0.324 };
const LEN: Record<string, number> = { pop: 0.72, "click-soft": 0.37, click: 0.37, whoosh: 0.57, "whoosh-short": 0.57, "impact-bass-1": 2.12, "impact-bass-2": 2.59, typing: 1.2, riser: 10.03, "whoosh-cinematic": 5.54, sparkle: 1.8, ping: 1.32 };
const MAP: Record<string, string> = { click: "click-soft", typeStart: "typing", enter: "click", landed: "pop", grab: "click-soft", drop: "pop", done: "pop", pickPlan: "click-soft", start: "click",
  rain: "pop", fire: "pop", synth: "pop", tick_run: "pop", tick_read: "pop", tick_water: "pop", tab_month: "click-soft", tab_year: "click-soft", click_tab: "click-soft", card_in: "pop",
  created1: "pop", typing1: "typing", menu: "click-soft", shortcut: "click", light: "whoosh-short", "enter-add": "click", "click-orb": "click-soft", "orb-click": "click-soft",
  "start-tour-click": "click", "next-click": "click-soft", "calendar-updates": "pop", grab_: "click-soft", stopwatchTab: "click-soft", save: "click" };
function cues(): [string, number, number][] {
  const out: [string, number, number][] = [];
  for (const s of EDL as Shot[]) {
    if (s.kind === "device") {
      const m = (FOOT as Record<string, { markers: Record<string, number> }>)[s.src]?.markers ?? {};
      for (const [k, mt] of Object.entries(m)) { const name = MAP[k]; if (!name) continue; const at = s.t0 + (mt - s.m0) / s.rate; if (at > s.t0 + 0.05 && at < s.t1 - 0.05) out.push([name, at, name === "typing" ? 0.22 : name === "pop" ? 0.3 : 0.34]); }
    }
    if (s.kind === "title") out.push(["whoosh-short", s.t0 + 0.04, 0.28]);
  }
  const W = TL.words as Record<string, { w: string; t: number }[]>;
  for (const w of ["list", "calendar", "timer", "habit"]) { const x = W.p1.find((y) => y.w.toLowerCase().startsWith(w)); if (x) out.push(["pop", x.t, 0.28]); }
  for (const h of [1.11, 2.68, 4.38]) out.push(["impact-bass-1", h, 0.35]);
  out.push(["whoosh-cinematic", TL.voice.p2.end + 1.0, 0.3]);
  out.push(["impact-bass-1", TL.drop, 0.55], ["sparkle", TL.drop + 0.05, 0.3]);
  out.push(["whoosh", 140.06 + 5.0, 0.3], ["impact-bass-1", TL.endHit, 0.6], ["sparkle", TL.endHit + 0.1, 0.35]);
  const dl = W.en.find((y) => y.w.toLowerCase().startsWith("download")); if (dl) out.push(["pop", dl.t, 0.3]);
  return out;
}
const VOICE = TL.voice as Record<string, { start: number; end: number }>;
function introVol(f: number) {
  const t = f / FPS; let v = 1.0;
  for (const k in VOICE) { const a = VOICE[k].start + 0.05, b = VOICE[k].end; if (t > a - 0.4 && t < b + 0.6 && a < TL.drop) { const e = Math.min(1, (t - (a - 0.4)) / 0.4, (b + 0.6 - t) / 0.6); v = Math.min(v, 1.0 - 0.55 * e); } }
  if (t > TL.drop) v *= Math.max(0, 1 - (t - TL.drop) / 0.8);
  return v;
}
function musicVol(f: number) {
  const t = f / FPS; let v = 0.78;
  for (const k in VOICE) { const a = VOICE[k].start + 0.05, b = VOICE[k].end; if (t > a - 0.4 && t < b + 0.6) { const e = Math.min(1, (t - (a - 0.4)) / 0.4, (b + 0.6 - t) / 0.6); v = Math.min(v, 0.78 - (0.78 - 0.24) * e); } }
  if (t > TL.total - 3) v *= Math.max(0, (TL.total - t) / 3);
  return v;
}

const XF = 0.4;
const Dissolve: React.FC<{ lead: number; wipe?: boolean; children: React.ReactNode }> = ({ lead, wipe, children }) => {
  const f = useCurrentFrame();
  const k = lead > 0 ? Math.min(1, f / (lead * FPS)) : 1;
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  // chapter titles arrive as a colour flood that rises from the bottom; everything else dissolves
  if (wipe) return <AbsoluteFill style={{ clipPath: `inset(${(1 - e) * 100}% 0 0 0)` }}>{children}</AbsoluteFill>;
  return <AbsoluteFill style={{ opacity: e }}>{children}</AbsoluteFill>;
};

export const Film: React.FC = () => {
  useFonts();
  const shots = EDL as Shot[];
  const intro = shots.find((s) => s.kind === "intro")!;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {shots.filter((s) => s.kind !== "intro").map((s, i) => {
        // every cut is a short dissolve: the incoming shot starts XF early and fades in over the outgoing one
        const lead = (s.kind === "world" && s.preset === "reveal") || s.kind === "end" ? 0 : XF;
        const from = fr(s.t0 - lead);
        return (
          <Sequence key={i} from={from} durationInFrames={Math.max(1, fr(s.t1) - from)} premountFor={45}>
            <Dissolve lead={lead} wipe={s.kind === "title"}>
              {s.kind === "device" ? <Device {...(s as unknown as DeviceProps)} lead={lead} />
                : s.kind === "title" ? <Title words={s.words} studio={s.studio} accent={s.accent} dur={s.t1 - s.t0 + lead} />
                : s.kind === "world" ? <World preset={s.preset} studio={s.studio} dur={s.t1 - s.t0 + lead} />
                : <End dur={s.t1 - s.t0 + lead} />}
            </Dissolve>
          </Sequence>
        );
      })}
      <Sequence from={0} durationInFrames={fr(intro.t1)}><Intro /></Sequence>
      <Sequence from={0} durationInFrames={fr(TL.drop + 0.9)}><Audio src={staticFile(`music/${(TL as any).intro}`)} volume={(f) => introVol(f)} /></Sequence>
      <Sequence from={fr(TL.drop)}><Audio src={staticFile(`music/${TL.music}`)} startFrom={fr(TL.drop)} volume={(f) => musicVol(f + fr(TL.drop))} /></Sequence>
      {Object.entries(VOICE).map(([k, v]) => <Sequence key={k} from={fr(v.start)}><Audio src={staticFile(`voiceb/${k}.mp3`)} /></Sequence>)}
      {cues().map(([name, at, vol], i) => { const st = at + 1 / FPS - PEAK[name]; const trim = st < 0 ? -st : 0; return (
        <Sequence key={`s${i}`} from={fr(Math.max(0, st))} durationInFrames={fr(LEN[name] - trim) + 1}><Audio src={staticFile(`sfx/${name}.mp3`)} volume={vol} startFrom={fr(trim)} /></Sequence>); })}
    </AbsoluteFill>
  );
};
