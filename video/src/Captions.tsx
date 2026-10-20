import { interpolate } from "remotion";
import captions from "../captions.json";
import timeline from "../timeline.json";
import { C, OUT, SANS, useSec } from "./kit";

type Word = { text: string; start: number; end: number };
const CAPS = captions as Record<string, { duration: number; words: Word[] }>;

export type CaptionMode = "bottom" | "top" | "hero" | "none";

/** Which caption placement each scene uses (keeps captions off the UI being shown). */
const SCENE_MODE: Record<string, CaptionMode> = {
  cold: "hero",
  title: "bottom",
  speakA: "top",
  speakB: "top",
  types: "top",
  publish: "bottom",
  github: "bottom",
  agent: "bottom",
  ledger: "bottom",
  kept: "bottom",
  missing: "bottom",
  proof: "bottom",
  handback: "top",
  reply: "bottom",
  score: "bottom",
  end: "none",
};

function modeAt(t: number): CaptionMode {
  const s = timeline.scenes.find((s) => t >= s.from && t < s.to);
  return s ? SCENE_MODE[s.id] ?? "bottom" : "none";
}

/** Burned-in subtitles timed from Whisper word timestamps of the actual narration audio. */
export function Captions() {
  const { t } = useSec();
  const seg = timeline.narration.find((n) => {
    const c = CAPS[n.id];
    return c && t >= n.at - 0.15 && t < n.at + c.duration + 0.45;
  });
  if (!seg) return null;
  const mode = modeAt(seg.at + 0.01);
  if (mode === "none") return null;
  const c = CAPS[seg.id];
  const local = t - seg.at;
  const enter = interpolate(local, [-0.15, 0.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = interpolate(local, [c.duration + 0.1, c.duration + 0.45], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const v = Math.min(enter, exit);

  if (mode === "hero") {
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 220px" }}>
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 300, fontSize: 76, lineHeight: 1.18, letterSpacing: "-0.02em", textAlign: "center", color: C.ink, opacity: exit }}>
          {c.words.map((w, i) => {
            const on = interpolate(local, [w.start - 0.08, w.start + 0.22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const emph = /checks\?|review|code/i.test(w.text) && !/reviews?\b.*comments/i.test(w.text);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  marginRight: "0.26em",
                  opacity: on,
                  filter: `blur(${(1 - on) * 10}px)`,
                  transform: `translateY(${(1 - OUT(on)) * 18}px)`,
                  color: /checks\?/i.test(w.text) ? C.accent : C.ink,
                  fontWeight: emph && /checks\?/i.test(w.text) ? 600 : 300,
                }}
              >
                {w.text}
              </span>
            );
          })}
        </p>
      </div>
    );
  }

  const top = mode === "top";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        [top ? "top" : "bottom"]: 0,
        height: 230,
        display: "flex",
        alignItems: top ? "flex-start" : "flex-end",
        justifyContent: "center",
        paddingTop: top ? 46 : 0,
        paddingBottom: top ? 0 : 58,
        background: top ? "linear-gradient(to bottom, rgba(5,6,8,0.88), transparent)" : "linear-gradient(to top, rgba(5,6,8,0.9), transparent)",
        opacity: v,
      }}
    >
      <p
        style={{
          margin: 0,
          maxWidth: 1480,
          textAlign: "center",
          fontFamily: SANS,
          fontWeight: 500,
          fontSize: 44,
          lineHeight: 1.28,
          letterSpacing: "-0.01em",
          transform: `translateY(${(1 - OUT(enter)) * (top ? -14 : 14)}px)`,
          textShadow: "0 2px 18px rgba(0,0,0,0.85)",
        }}
      >
        {c.words.map((w, i) => {
          const spoken = local >= w.start - 0.05;
          const current = local >= w.start - 0.05 && local < w.end + 0.12;
          return (
            <span key={i} style={{ color: current ? C.accent : spoken ? C.ink : "rgba(231,233,238,0.38)", transition: "none" }}>
              {w.text}
              {i < c.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </p>
    </div>
  );
}
