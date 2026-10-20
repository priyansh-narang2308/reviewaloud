import { Composition } from "remotion";
import timeline from "../timeline.json";
import { Film } from "./Film";

export const Root = () => (
  <Composition
    id="Film"
    component={Film}
    width={1920}
    height={1080}
    fps={timeline.fps}
    durationInFrames={Math.round(timeline.duration * timeline.fps)}
  />
);
