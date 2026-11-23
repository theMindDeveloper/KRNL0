import React from "react";
import { Composition } from "remotion";
import { LookCube, LookCards, LookUI, LookWorld, LookTitle } from "./look/Look";
import { Film } from "./film/Film";
import TL from "./film/timeline.json";
const P = { fps: 30, width: 1920, height: 1080 };
export const Root: React.FC = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={Math.round(TL.total * 30)} {...P} />
    <Composition id="LookCube" component={LookCube} durationInFrames={240} {...P} />
    <Composition id="LookCards" component={LookCards} durationInFrames={180} {...P} />
    <Composition id="LookUI" component={LookUI} durationInFrames={180} {...P} />
    <Composition id="LookWorld" component={LookWorld} durationInFrames={180} {...P} />
    <Composition id="LookTitle" component={LookTitle} durationInFrames={120} {...P} />
  </>
);
