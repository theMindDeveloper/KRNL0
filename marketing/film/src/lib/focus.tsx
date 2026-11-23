import React from "react";
/** In-plane depth of field (ui-camera-film's trick): a blurred copy under a sharp copy masked to the focus point. */
export const FocusPlate: React.FC<{ w: number; h: number; fx: number; fy: number; rx: number; ry: number; blur: number; render: () => React.ReactNode }> =
  ({ w, h, fx, fy, rx, ry, blur, render }) => {
  const mask = `radial-gradient(ellipse ${rx}px ${ry}px at ${fx}px ${fy}px, #000 45%, transparent 100%)`;
  return (
    <div style={{ position: "relative", width: w, height: h }}>
      <div style={{ position: "absolute", inset: 0, filter: blur > 0.3 ? `blur(${blur}px) brightness(${1 - 0.02 * blur})` : undefined }}>{render()}</div>
      {blur > 0.3 ? <div style={{ position: "absolute", inset: 0, maskImage: mask, WebkitMaskImage: mask }}>{render()}</div> : null}
    </div>
  );
};
/** Device thickness behind a plane: stacked lips from lit to black. */
export const Slab: React.FC<{ radius: number; layers?: number; step?: number }> = ({ radius, layers = 10, step = 3 }) => (
  <>{Array.from({ length: layers }, (_, i) => { const v = Math.round(34 - 26 * (i / (layers - 1))); return (
    <div key={i} style={{ position: "absolute", inset: -2, borderRadius: radius + 2, background: `rgb(${v},${v},${v})`, transform: `translateZ(${-(i + 1) * step}px)` }} />); })}</>
);
