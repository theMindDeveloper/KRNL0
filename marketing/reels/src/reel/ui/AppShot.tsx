import React from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { pad4 } from "../theme";

export type Crop = { x: number; y: number; w: number };

/**
 * Real KRNL0 footage in a floating card. `index(frame)` picks the captured frame,
 * `cam` moves a crop window over the 2880-wide capture (frames → crop), so a punch-in
 * is a camera move over the real UI while it acts.
 */
export const AppShot: React.FC<{
  dir: string;
  count: number;
  index?: (f: number) => number;
  cam: { f: number; c: Crop }[];
  width: number;
  height: number;
  srcWidth?: number;
  at?: number;
  radius?: number;
  style?: React.CSSProperties;
}> = ({ dir, count, index = (f) => f, cam, width, height, srcWidth = 2880, at = 0, radius = 30, style }) => {
  const frame = useCurrentFrame();
  const f = frame - at;
  const i = Math.max(0, Math.min(count - 1, Math.floor(index(Math.max(0, f)))));
  const fs = cam.map((k) => k.f);
  const ease = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) } as const;
  const c = cam.length === 1 ? cam[0].c : {
    x: interpolate(f, fs, cam.map((k) => k.c.x), ease),
    y: interpolate(f, fs, cam.map((k) => k.c.y), ease),
    w: interpolate(f, fs, cam.map((k) => k.c.w), ease),
  };
  const s = width / c.w;
  // Arrival: the card rises and sharpens on a long tail.
  const enter = interpolate(f, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.exp) });
  return (
    <div
      style={{
        width, height, borderRadius: radius, overflow: "hidden", position: "relative", background: "#0d0d0d",
        boxShadow: "0 60px 140px rgba(0,0,0,0.45), 0 14px 40px rgba(0,0,0,0.35), inset 0 0 0 1.5px rgba(255,255,255,0.08)",
        opacity: enter, translate: `0 ${(1 - enter) * 120}px`, filter: `blur(${(1 - enter) * 12}px)`,
        ...style,
      }}
    >
      <Img
        src={staticFile(`footage/${dir}/${pad4(i)}.jpg`)}
        style={{ position: "absolute", left: -c.x * s, top: -c.y * s, width: srcWidth * s, maxWidth: "none" }}
      />
      <div style={{ position: "absolute", inset: 0, borderRadius: radius, boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.08)" }} />
    </div>
  );
};
