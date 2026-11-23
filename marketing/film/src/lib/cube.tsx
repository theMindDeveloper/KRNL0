// The KRNL0 mark as a real 3D object: a black body with 3x3 rounded tiles on each face and a lit centre tile
// (the "Lit Core"). Tiles are shaded by a fixed key light in camera space, so the cube turns under the light.
import React from "react";
import type { Cam } from "./space";

const rad = (d: number) => (d * Math.PI) / 180;
type V = [number, number, number];
const rotY = (v: V, a: number): V => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
const rotX = (v: V, a: number): V => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
const norm = (v: V): V => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const LIGHT = norm([-0.45, -0.85, 0.55]); // up-left-front, camera space (CSS y is down)

const FACES: { n: V; t: string }[] = [
  { n: [0, 0, 1], t: "" }, { n: [0, 0, -1], t: "rotateY(180deg)" }, { n: [1, 0, 0], t: "rotateY(90deg)" },
  { n: [-1, 0, 0], t: "rotateY(-90deg)" }, { n: [0, -1, 0], t: "rotateX(90deg)" }, { n: [0, 1, 0], t: "rotateX(-90deg)" },
];

export const Cube: React.FC<{
  cam: Cam; size: number; x?: number; y?: number; z?: number; rx: number; ry: number; core?: number; opacity?: number;
}> = ({ cam, size, x = 0, y = 0, z = 0, rx, ry, core = 1, opacity = 1 }) => {
  const h = size / 2, pitch = size / 3, tile = pitch * 0.82, r = tile * 0.3;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transformStyle: "preserve-3d", opacity,
      transform: `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg)` }}>
      {FACES.map((f, fi) => {
        // the face normal in camera space: object rotation (Y then X), then the camera (yaw, pitch)
        let n = rotX(rotY(f.n, ry), rx);
        n = rotX(rotY(n, -cam.yaw), cam.pitch);
        const facing = -n[2]; // towards the lens
        const lum = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] - n[2] * LIGHT[2] * -1);
        const k = 0.22 + 0.78 * lum;
        const g = Math.round(26 + 70 * k);
        return (
          <div key={fi} style={{ position: "absolute", left: -h, top: -h, width: size, height: size, transformStyle: "preserve-3d",
            transform: `${f.t} translateZ(${h}px)`, backfaceVisibility: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "#050505", borderRadius: size * 0.07 }} />
            {Array.from({ length: 9 }, (_, i) => {
              const cx = (i % 3) * pitch + (pitch - tile) / 2, cy = Math.floor(i / 3) * pitch + (pitch - tile) / 2;
              const lit = i === 4;
              const acid = `rgb(${Math.round(150 + 80 * k)}, ${Math.round(195 + 50 * k)}, ${Math.round(40 + 60 * k)})`;
              return (
                <div key={i} style={{ position: "absolute", left: cx, top: cy, width: tile, height: tile, borderRadius: r,
                  transform: "translateZ(1.5px)",
                  background: lit ? acid : `rgb(${g}, ${g}, ${g + 2})`,
                  boxShadow: lit ? `0 0 ${size * 0.08 * core}px ${size * 0.02 * core}px rgba(201,241,88,${0.55 * core}), inset 0 0 ${tile * 0.25}px rgba(255,255,255,${0.35 * core})`
                               : `inset 0 ${tile * 0.06}px ${tile * 0.1}px rgba(255,255,255,${0.05 + 0.08 * k})`,
                  opacity: facing > -0.05 || true ? 1 : 0 }} />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
