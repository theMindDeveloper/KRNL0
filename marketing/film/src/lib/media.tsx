import React from "react";
import { OffthreadVideo, staticFile } from "remotion";
/** A rectangle cut out of a 2880x1620 recording, shown at w x h (the crop is scaled to fit). */
export const Crop: React.FC<{ src: string; rect: [number, number, number, number]; w: number; h: number; startFrom?: number; playbackRate?: number }> =
  ({ src, rect, w, h, startFrom = 0, playbackRate = 1 }) => {
  const [x0, y0, x1, y1] = rect; const s = w / (x1 - x0);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", width: w, height: h, background: "#141414" }}>
      <OffthreadVideo src={staticFile(`footage/${src}.mp4`)} muted startFrom={Math.round(startFrom * 30)} playbackRate={playbackRate}
        style={{ position: "absolute", left: -x0 * s, top: -y0 * s, width: 2880 * s, height: 1620 * s }} />
    </div>
  );
};
