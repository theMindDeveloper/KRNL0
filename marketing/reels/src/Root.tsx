import React from "react";
import { Composition } from "remotion";
import { KrnlReel, REEL_FRAMES } from "./reel/KrnlReel";
import { FPS, H, W } from "./reel/theme";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="KrnlReel" component={KrnlReel} durationInFrames={REEL_FRAMES} fps={FPS} width={W} height={H} />
  </>
);
