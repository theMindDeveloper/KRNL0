// A small 3D "lens": a camera in a CSS 3D world, with depth of field computed per plane
// (each plane is blurred by how far it sits from the focus distance), like After Effects 3D layers.
import React from "react";
import { AbsoluteFill } from "remotion";

export type Cam = { x: number; y: number; z: number; yaw: number; pitch: number; roll?: number; focus: number; aperture: number };
export const FOCAL = 1500; // px: the CSS perspective, ~ a 50 mm lens at 1080p

const rad = (d: number) => (d * Math.PI) / 180;
/** World point → camera-space depth (px in front of the lens). */
export function depthOf(cam: Cam, p: [number, number, number]) {
  let [x, y, z] = [p[0] - cam.x, p[1] - cam.y, p[2] - cam.z];
  // inverse yaw (about Y), then inverse pitch (about X)
  const cy = Math.cos(rad(-cam.yaw)), sy = Math.sin(rad(-cam.yaw));
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  const cp = Math.cos(rad(cam.pitch)), sp = Math.sin(rad(cam.pitch));
  [y, z] = [y * cp - z * sp, y * sp + z * cp];
  return -z; // the camera looks down -z
}
/** Circle of confusion in px for a plane at depth d (thin-lens-ish). */
export function blurAt(cam: Cam, d: number) {
  if (d <= 1) return 0;
  return Math.min(16, (cam.aperture * Math.abs(d - cam.focus)) / d);
}

export const Space: React.FC<{ cam: Cam; children: React.ReactNode; bg?: string }> = ({ cam, children, bg = "#060606" }) => (
  <AbsoluteFill style={{ background: bg, perspective: FOCAL, perspectiveOrigin: "50% 50%", overflow: "hidden" }}>
    <div style={{
      position: "absolute", left: "50%", top: "50%", transformStyle: "preserve-3d",
      transform: `translateZ(${FOCAL}px) rotateZ(${-(cam.roll ?? 0)}deg) rotateX(${cam.pitch}deg) rotateY(${-cam.yaw}deg) translate3d(${-cam.x}px, ${-cam.y}px, ${-cam.z}px)`,
    }}>{children}</div>
  </AbsoluteFill>
);

/** A flat plane in the world, centred on (x, y, z), turned by rx/ry/rz degrees, blurred by the lens. */
export const Plane: React.FC<{
  cam: Cam; x: number; y: number; z: number; w: number; h: number; rx?: number; ry?: number; rz?: number;
  opacity?: number; radius?: number; shadow?: boolean; sheen?: number; extraBlur?: number; children: React.ReactNode; style?: React.CSSProperties;
}> = ({ cam, x, y, z, w, h, rx = 0, ry = 0, rz = 0, opacity = 1, radius = 0, shadow = false, sheen = 0, extraBlur = 0, children, style }) => {
  const d = depthOf(cam, [x, y, z]);
  if (d < 40) return null;
  const b = blurAt(cam, d) + extraBlur;
  return (
    <div style={{
      position: "absolute", left: 0, top: 0, width: w, height: h, borderRadius: radius, overflow: radius ? "hidden" : undefined,
      transform: `translate3d(${x - w / 2}px, ${y - h / 2}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`,
      filter: b > 0.35 ? `blur(${b.toFixed(2)}px)` : undefined, opacity, backfaceVisibility: "hidden",
      boxShadow: shadow ? "0 60px 120px rgba(0,0,0,0.55), 0 18px 40px rgba(0,0,0,0.45)" : undefined, ...style,
    }}>
      {children}
      {sheen > 0 ? <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, rgba(255,255,255,${sheen}) 0%, rgba(255,255,255,0) 45%)`, pointerEvents: "none" }} /> : null}
    </div>
  );
};

/** Film finish: grain under nothing important, a vignette, and an exposure lift. */
export const Finish: React.FC<{ frame: number; vignette?: number; grain?: number; exposure?: number }> = ({ frame, vignette = 0.85, grain = 0.06, exposure = 1 }) => (
  <>
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 70% at 50% 50%, transparent 55%, rgba(0,0,0,${vignette}) 100%)`, pointerEvents: "none" }} />
    <AbsoluteFill style={{ opacity: grain, mixBlendMode: "overlay", pointerEvents: "none",
      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='${frame % 24}'/></filter><rect width='240' height='240' filter='url(%23n)' opacity='1'/></svg>")` }} />
    {exposure < 1 ? <AbsoluteFill style={{ background: "#000", opacity: 1 - exposure }} /> : null}
  </>
);
