import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { Calendar, Canvas, EndCard, Focus, Habits, Hook, Plan } from "./scenes/Scenes";

// The reel scrolls down through one day like the website does: each hour pushes
// the last one up. Seams are 14 frames; durations below are per scene.
const seam = () => (
  <TransitionSeries.Transition
    presentation={slide({ direction: "from-bottom" })}
    timing={springTiming({ config: { damping: 200 }, durationInFrames: 14 })}
  />
);

export const SCENES = [
  { name: "Hook", d: 112, C: Hook },
  { name: "Plan", d: 132, C: Plan },
  { name: "Calendar", d: 150, C: Calendar },
  { name: "Focus", d: 140, C: Focus },
  { name: "Habits", d: 112, C: Habits },
  { name: "Canvas", d: 150, C: Canvas },
  { name: "End", d: 150, C: EndCard },
];
export const REEL_FRAMES = SCENES.reduce((a, s) => a + s.d, 0) - (SCENES.length - 1) * 14;

export const KrnlReel: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <TransitionSeries>
      {SCENES.flatMap((s, i) => [
        ...(i > 0 ? [React.cloneElement(seam(), { key: `t${i}` })] : []),
        <TransitionSeries.Sequence key={s.name} name={s.name} durationInFrames={s.d}>
          <s.C />
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
  </AbsoluteFill>
);
