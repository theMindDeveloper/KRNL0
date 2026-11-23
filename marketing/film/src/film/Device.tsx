// A device shot: the real recording on a tilted plane with thickness, filmed by a camera that glides between
// targets on the screen; depth of field keeps the target sharp and lets the rest of the screen fall off.
import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import { Space, Finish, Cam, FOCAL } from "../lib/space";
import { FocusPlate, Slab } from "../lib/focus";
import { keys, sine } from "../lib/ease";
import { Bay, useT, rotX, rotY, rotZ, V3 } from "./common";

export type DeviceProps = { lead?: number; src: string; t0: number; t1: number; m0: number; rate: number; views: [number, number, number, number, number][]; tilt: [number, number, number]; studio: string | null; blur: number };
const W = 2880, H = 1620; // the plane is the recording at native size, so close framings stay sharp

export const Device: React.FC<DeviceProps> = ({ src, t0, t1, m0, rate, views, tilt, studio, blur, lead = 0 }) => {
  const { f, t: tt } = useT();
  const t = tt - lead; // seconds since the shot's cut point (negative while it dissolves in)
  const { fps } = useVideoConfig();
  // the camera frames a subject rectangle (fractions of the screen) so the whole of it fits inside the frame
  const r = keys<{ a: number; b: number; c: number; d: number }>(views.map(([k, a, b, c, d]) => [k, { a, b, c, d }, sine]), t);
  const fit = Math.min((0.86 * 1920) / ((r.c - r.a) * W), (0.82 * 1080) / ((r.d - r.b) * H));
  const v = { u: (r.a + r.c) / 2, v: (r.b + r.d) / 2, wr: (r.c - r.a), hr: (r.d - r.b) };
  const life = (t1 - t0);
  const rx = tilt[0] + 1.2 * Math.sin(t * 0.45 + t0), ry = tilt[1] * (1 - 0.18 * sine(t / life)) , rz = tilt[2];
  const p: V3 = rotX(rotY(rotZ([(v.u - 0.5) * W, (v.v - 0.5) * H, 0], rz), ry), rx);
  const dist = FOCAL / fit;
  const cam: Cam = { x: p[0] + 20 * Math.sin(t * 0.3), y: p[1], z: p[2] + dist, yaw: 0, pitch: 0, focus: dist, aperture: 0 };
  const wide = Math.min(1, Math.max(0, (Math.max(v.wr, v.hr) - 0.6) / 0.35));
  const b = Math.min(2.2, blur * 0.45) * (1 - 0.6 * wide);
  
  return (
    <AbsoluteFill>
      <Bay studio={studio} />
      <Space cam={cam} bg="transparent">
        <div style={{ position: "absolute", left: -W / 2, top: -H / 2, width: W, height: H, transformStyle: "preserve-3d", transform: `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)` }}>
          <Slab radius={42} layers={10} step={4} />
          <div style={{ position: "absolute", inset: 0, borderRadius: 42, overflow: "hidden", background: "#0c0c0c", boxShadow: "0 90px 200px rgba(0,0,0,.6), 0 30px 70px rgba(0,0,0,.45)" }}>
            <FocusPlate w={W} h={H} fx={v.u * W} fy={v.v * H} rx={v.wr * W * 0.7 + 260} ry={v.hr * H * 0.7 + 200} blur={b}
              render={() => <OffthreadVideo src={staticFile(`footage/${src}.mp4`)} muted startFrom={Math.max(0, Math.round((m0 - lead * rate) * fps))} playbackRate={rate} style={{ width: W, height: H, display: "block" }} />} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(122deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,0) 30%)" }} />
          </div>
        </div>
      </Space>
      <Finish frame={f} vignette={studio ? 0.55 : 0.85} grain={0.03} />
    </AbsoluteFill>
  );
};
