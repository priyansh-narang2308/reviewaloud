import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import timeline from "../timeline.json";
import captions from "../captions.json";
import { Captions } from "./Captions";
import { C, Chip, Grain, MONO, OUT, SANS, Shot, Speed, useSec, Vignette, type Rect } from "./kit";

const FPS = timeline.fps;
const scene = (id: string) => timeline.scenes.find((s) => s.id === id)!;
const CAPS = captions as Record<string, { duration: number; words: { text: string; start: number }[] }>;

/** Scene wrapper: Sequence + short cross-fade with a touch of blur (masks hard cuts). */
function S({ id, children, fadeIn = 0.35, fadeOut = 0.35 }: { id: string; children: React.ReactNode; fadeIn?: number; fadeOut?: number }) {
  const sc = scene(id);
  const from = Math.round((sc.from - fadeIn / 2) * FPS);
  const dur = Math.round((sc.to - sc.from + fadeIn / 2 + fadeOut / 2) * FPS);
  return (
    <Sequence from={Math.max(0, from)} durationInFrames={dur} name={id}>
      <Fade len={dur / FPS} fadeIn={from < 0 ? 0 : fadeIn} fadeOut={fadeOut}>
        {children}
      </Fade>
    </Sequence>
  );
}

function Fade({ len, fadeIn, fadeOut, children }: { len: number; fadeIn: number; fadeOut: number; children: React.ReactNode }) {
  const { t } = useSec();
  const a = fadeIn ? interpolate(t, [0, fadeIn], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const b = interpolate(t, [len - fadeOut, len], [1, 0], { extrapolateLeft: "clamp" });
  const v = Math.min(a, b);
  return <AbsoluteFill style={{ opacity: v, filter: v < 1 ? `blur(${(1 - v) * 6}px)` : undefined }}>{children}</AbsoluteFill>;
}

// Dev-only Next.js badge (not product UI) masked out of the raw captures.
const TAKE_MASK: Rect[] = [{ x: 22, y: 1540, w: 110, h: 110 }];
const LEDGER_MASK: Rect[] = [{ x: 14, y: 1004, w: 66, h: 66 }];
const FULL_MASK: Rect[] = [{ x: 16, y: 1000, w: 64, h: 64 }];

/** Ambient backdrop for typographic scenes: dot grid + amber glow. */
function Backdrop({ glow = 0.35 }: { glow?: number }) {
  const { t } = useSec();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          backgroundPosition: `${-t * 6}px ${-t * 3}px`,
          opacity: 0.06,
          maskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, black, transparent)",
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(40% 35% at 50% 52%, rgba(245,165,36,${glow * 0.28}), transparent 70%)` }} />
    </AbsoluteFill>
  );
}

const BUBBLE =
  "M11 7.5h10a4.5 4.5 0 0 1 4.5 4.5v4.5A4.5 4.5 0 0 1 21 21h-7l-4.6 3.9a.6.6 0 0 1-1-.46V20.6A4.5 4.5 0 0 1 6.5 16.5V12A4.5 4.5 0 0 1 11 7.5Z";
const CHECK = "M11.6 14.3l3 2.9 5.8-5.7";

/** Brand mark that draws itself: tile scales in, bubble strokes then fills, check draws. */
function LogoMark({ size, start }: { size: number; start: number }) {
  const { t } = useSec();
  const p = (a: number, b: number) => OUT(Math.min(1, Math.max(0, (t - start - a) / (b - a))));
  const tile = p(0, 0.5);
  const stroke = p(0.15, 0.9);
  const fill = p(0.7, 1.05);
  const check = p(0.95, 1.4);
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} style={{ transform: `scale(${0.85 + 0.15 * tile}) rotate(${(1 - tile) * -8}deg)`, opacity: tile, filter: `drop-shadow(0 0 ${30 * fill}px rgba(245,165,36,0.45))` }}>
      <rect width="32" height="32" rx="8.5" fill={C.accent} />
      <path d={BUBBLE} fill="#0B0C0F" fillOpacity={fill} stroke="#0B0C0F" strokeWidth={0.9} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - stroke} />
      <path d={CHECK} fill="none" stroke={C.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - check} />
    </svg>
  );
}

function Wordmark({ start, size = 120 }: { start: number; size?: number }) {
  const { t } = useSec();
  const letters = "ReviewAloud".split("");
  return (
    <div style={{ display: "flex", fontFamily: SANS, fontWeight: 600, fontSize: size, letterSpacing: "-0.035em", lineHeight: 1 }}>
      {letters.map((l, i) => {
        const v = OUT(Math.min(1, Math.max(0, (t - start - i * 0.035) / 0.5)));
        return (
          <span key={i} style={{ display: "inline-block", color: i >= 6 ? C.accent : C.ink, opacity: v, transform: `translateY(${(1 - v) * 28}px)`, filter: `blur(${(1 - v) * 8}px)` }}>
            {l}
          </span>
        );
      })}
    </div>
  );
}

function TitleCard() {
  const { t } = useSec();
  const sub = interpolate(t, [1.6, 2.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const push = interpolate(t, [0, 4.4], [1.0, 1.04]);
  return (
    <AbsoluteFill>
      <Backdrop glow={interpolate(t, [0, 0.6, 4], [0, 1, 0.7], { extrapolateRight: "clamp" })} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `scale(${push})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <LogoMark size={150} start={0.05} />
          <Wordmark start={0.45} />
        </div>
        <p style={{ marginTop: 36, fontFamily: SANS, fontSize: 34, fontWeight: 300, color: C.muted, letterSpacing: "0.02em", opacity: sub, transform: `translateY(${(1 - sub) * 10}px)` }}>
          Review by voice. <span style={{ color: C.ink, fontWeight: 500 }}>Prove the fix landed.</span>
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** "1 of 3 kept" finale built from the real ledger result. */
function ScoreCard() {
  const { t } = useSec();
  const v = (a: number, b: number) => OUT(Math.min(1, Math.max(0, (t - a) / (b - a))));
  const bar = v(0.5, 1.8);
  const rows: [string, string, string][] = [
    ["Unknown coupon → return original total", "Addressed", C.green],
    ["Clamp the total at zero", "Unresolved", C.red],
    ["Case-insensitive codes?", "Unresolved", C.red],
  ];
  return (
    <AbsoluteFill>
      <Backdrop glow={0.5} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 120 }}>
        <p style={{ fontFamily: MONO, fontSize: 24, color: C.muted, letterSpacing: "0.25em", textTransform: "uppercase", opacity: v(0, 0.4) }}>Follow-through · sandbox PR #4</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: 26, marginTop: 10, opacity: v(0.05, 0.5), transform: `scale(${0.94 + 0.06 * v(0.05, 0.6)})` }}>
          <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 210, color: C.ink, letterSpacing: "-0.05em", lineHeight: 1 }}>1</span>
          <span style={{ fontFamily: SANS, fontWeight: 300, fontSize: 84, color: C.muted }}>of 3 promises kept</span>
        </div>
        <div style={{ display: "flex", width: 900, height: 14, borderRadius: 99, overflow: "hidden", background: "rgba(255,255,255,0.08)", marginTop: 34 }}>
          <div style={{ width: `${33.33 * bar}%`, background: C.green }} />
          <div style={{ width: `${66.67 * bar}%`, background: C.red }} />
        </div>
        <div style={{ marginTop: 34, display: "grid", gap: 12, width: 900 }}>
          {rows.map(([what, status, color], i) => {
            const r = v(1.0 + i * 0.22, 1.5 + i * 0.22);
            return (
              <div key={what} style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 30, color: C.ink, opacity: r, transform: `translateX(${(1 - r) * -16}px)` }}>
                <span style={{ fontWeight: 300 }}>{what}</span>
                <span style={{ color, fontWeight: 500 }}>● {status}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function EndCard() {
  const { t } = useSec();
  const n15 = timeline.narration.find((n) => n.id === "n15")!;
  const local = t - (n15.at - scene("end").from);
  const words = CAPS.n15.words;
  const tagStart = words.find((w) => w.text.startsWith("Review") && w.start > 1)?.start ?? 1.5;
  const proveStart = words.find((w) => w.text === "Prove")?.start ?? 2.5;
  const v = (a: number, b: number) => OUT(Math.min(1, Math.max(0, (local - a) / (b - a))));
  const foot = OUT(Math.min(1, Math.max(0, (t - 4.6) / 0.6)));
  return (
    <AbsoluteFill>
      <Backdrop glow={0.6} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
          <LogoMark size={120} start={0.05} />
          <Wordmark start={0.35} size={104} />
        </div>
        <p style={{ marginTop: 40, fontFamily: SANS, fontWeight: 300, fontSize: 52, letterSpacing: "-0.01em", color: C.ink }}>
          <span style={{ opacity: v(tagStart - 0.1, tagStart + 0.35) }}>Review by voice. </span>
          <span style={{ opacity: v(proveStart - 0.1, proveStart + 0.35), color: C.accent, fontWeight: 600 }}>Prove the fix landed.</span>
        </p>
        <div style={{ marginTop: 60, display: "flex", gap: 28, alignItems: "center", fontFamily: SANS, fontSize: 26, color: C.muted, opacity: foot }}>
          <span>Built with Wispr Flow</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
          <span style={{ fontFamily: MONO, fontSize: 24 }}>github.com/priyansh-narang2308/reviewaloud</span>
        </div>
        <p style={{ marginTop: 18, fontFamily: SANS, fontSize: 22, color: "rgba(160,168,182,0.7)", letterSpacing: "0.12em", textTransform: "uppercase", opacity: foot }}>WeMakeDevs × Wispr Flow · No Hands 2026</p>
      </AbsoluteFill>
      <Img src={staticFile("mascot.svg")} style={{ position: "absolute", left: 0, bottom: 0, width: 200, transform: `scaleX(-1) translateY(${(1 - foot) * 60}%)`, opacity: foot }} />
    </AbsoluteFill>
  );
}

/** Two real crops side by side: the ledger's quote vs the actual file line. */
function Crop({ src, w, h, rect, width }: { src: string; w: number; h: number; rect: Rect; width: number }) {
  const s = width / rect.w;
  return (
    <div style={{ width, height: rect.h * s, overflow: "hidden", position: "relative", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)" }}>
      <Img src={staticFile(src)} style={{ position: "absolute", width: w * s, height: h * s, left: -rect.x * s, top: -rect.y * s }} />
    </div>
  );
}

function ProofCard() {
  const { t } = useSec();
  const v = (a: number, b: number) => OUT(Math.min(1, Math.max(0, (t - a) / (b - a))));
  return (
    <AbsoluteFill>
      <Backdrop glow={0.25} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, paddingBottom: 170 }}>
        <div style={{ opacity: v(0.1, 0.6), transform: `translateY(${(1 - v(0.1, 0.6)) * 20}px)` }}>
          <p style={{ fontFamily: MONO, fontSize: 22, color: C.muted, letterSpacing: "0.18em", marginBottom: 12 }}>PROMISE LEDGER · QUOTED EVIDENCE</p>
          <Crop src="ledger-full.png" w={1920} h={2258} rect={{ x: 318, y: 1056, w: 560, h: 82 }} width={1300} />
        </div>
        <div style={{ fontFamily: SANS, fontSize: 40, color: C.accent, opacity: v(1.6, 2.0), transform: `scale(${0.8 + 0.2 * v(1.6, 2.1)})` }}>↓ checked against ↓</div>
        <div style={{ opacity: v(2.0, 2.6), transform: `translateY(${(1 - v(2.0, 2.6)) * 20}px)` }}>
          <p style={{ fontFamily: MONO, fontSize: 22, color: C.muted, letterSpacing: "0.18em", marginBottom: 12 }}>GITHUB · SRC/COUPONS.TS @ 6F3C021</p>
          <Crop src="gh-agent-commit.png" w={1920} h={1080} rect={{ x: 400, y: 887, w: 560, h: 36 }} width={1300} />
        </div>
        <div style={{ fontFamily: SANS, fontSize: 30, color: C.green, opacity: v(3.4, 3.8) }}>✓ Same line, verbatim. Unverifiable quotes are thrown away.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Music ducks under the voice; computed from the real narration windows. */
function useDuck() {
  return (frame: number) => {
    const t = frame / FPS;
    let duck = 0;
    for (const n of timeline.narration) {
      const d = CAPS[n.id].duration;
      const v = interpolate(t, [n.at - 0.35, n.at, n.at + d, n.at + d + 0.5], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      duck = Math.max(duck, v);
    }
    return 0.62 - 0.36 * duck;
  };
}

export function Film() {
  const duck = useDuck();
  useCurrentFrame();
  const take = { src: "wispr-take.mov", kind: "video" as const, w: 2932, h: 1672, masks: TAKE_MASK };
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, fontFamily: SANS }}>
      {/* 1. Cold open: kinetic typography */}
      <S id="cold" fadeIn={0}>
        <Backdrop glow={0.15} />
        <Vignette />
      </S>

      {/* 2. Title */}
      <S id="title">
        <TitleCard />
      </S>

      {/* 3. Speak: real Wispr Flow dictation */}
      <S id="speakA">
        <Shot
          {...take}
          startFrom={0.3}
          rate={1.15}
          keys={[
            { t: 0, x: 1466, y: 836, z: 1.0 },
            { t: 1.6, x: 1570, y: 1180, z: 1.6 },
            { t: 4.6, x: 1466, y: 1530, z: 2.25 },
            { t: 8.7, x: 1466, y: 1530, z: 2.25 },
            { t: 10.3, x: 1570, y: 1010, z: 1.55 },
            { t: 11.4, x: 1570, y: 1000, z: 1.6 },
          ]}
        />
        <Chip x={960} y={930} from={2.4} to={8.6} align="center">
          Real recording · Wispr Flow is listening
        </Chip>
        <Chip x={960} y={995} from={9.3} to={11.2} align="center" tone="green">
          Text lands. The anchor stays on line 8.
        </Chip>
        <Speed rate={1.15} from={0} to={11.2} />
      </S>
      <S id="speakB">
        <Shot {...take} startFrom={14.0} rate={2.6} keys={[{ t: 0, x: 1570, y: 1120, z: 1.45 }, { t: 7.1, x: 1570, y: 1160, z: 1.52 }]} />
        <Chip x={960} y={930} from={0.4} to={6.8} align="center">
          Two more comments, dictated the same way
        </Chip>
        <Speed rate={2.6} from={0} to={7.1} />
      </S>
      <S id="types">
        <Shot {...take} startFrom={33.0} rate={1.0} keys={[{ t: 0, x: 1800, y: 820, z: 1.7 }, { t: 6, x: 1760, y: 860, z: 1.85 }]} />
      </S>

      {/* 4. Publish to GitHub */}
      <S id="publish">
        <Shot {...take} startFrom={39.0} rate={1.6} keys={[{ t: 0, x: 1466, y: 830, z: 1.5 }, { t: 7.8, x: 1466, y: 830, z: 1.68 }]} />
        <Chip x={70} y={60} from={0.5} to={7.4} tone="plain">
          Real GitHub API · pending review → submit
        </Chip>
        <Speed rate={1.6} from={0} to={7.8} />
      </S>
      <S id="github">
        <Shot {...take} startFrom={53.5} rate={1.2} keys={[{ t: 0, x: 1466, y: 836, z: 1.05 }, { t: 5, x: 1466, y: 920, z: 1.25 }]} />
        <Chip x={70} y={60} from={0.3} to={4.7} tone="green">
          Live on github.com · sandbox PR #4
        </Chip>
      </S>

      {/* 5. The agent's "fix" (controlled test) */}
      <S id="agent">
        <Shot
          src="gh-agent-commit.png"
          kind="image"
          w={1920}
          h={1080}
          keys={[
            { t: 0, x: 960, y: 540, z: 1.0 },
            { t: 1.4, x: 420, y: 330, z: 2.0 },
            { t: 4.2, x: 640, y: 830, z: 1.9 },
            { t: 8.4, x: 660, y: 850, z: 2.05 },
          ]}
          spots={[
            { rect: { x: 36, y: 362, w: 320, h: 32 }, from: 1.6, to: 3.9 },
            { rect: { x: 500, y: 860, w: 560, h: 30 }, from: 4.6, to: 8.3, color: C.red },
          ]}
        />
        <Chip x={960} y={60} from={0.4} to={8.0} align="center" tone="plain">
          Controlled test · this commit plays the AI agent
        </Chip>
      </S>

      {/* 6. Promise Ledger: live run */}
      <S id="ledger">
        <Shot
          src="ledger-run.mp4"
          kind="video"
          w={1920}
          h={1080}
          rate={2.8}
          masks={LEDGER_MASK}
          keys={[
            { t: 0, x: 960, y: 470, z: 1.3 },
            { t: 5, x: 960, y: 420, z: 1.5 },
            { t: 15.9, x: 960, y: 520, z: 1.42 },
          ]}
        />
        <Chip x={70} y={60} from={0.6} to={15.4} tone="plain">
          Live run · each request checked against commit 6f3c021
        </Chip>
        <Speed rate={2.8} from={0} to={15.9} />
      </S>
      <S id="kept">
        <Shot
          src="ledger-full.png"
          kind="image"
          w={1920}
          h={2258}
          masks={FULL_MASK}
          keys={[
            { t: 0, x: 960, y: 640, z: 1.2 },
            { t: 1.5, x: 960, y: 650, z: 1.42 },
            { t: 5.6, x: 960, y: 660, z: 1.48 },
          ]}
          spots={[{ rect: { x: 324, y: 694, w: 1272, h: 72 }, from: 1.6, to: 5.5, color: C.green }]}
        />
      </S>
      <S id="missing">
        <Shot
          src="ledger-full.png"
          kind="image"
          w={1920}
          h={2258}
          masks={FULL_MASK}
          keys={[
            { t: 0, x: 960, y: 900, z: 1.2 },
            { t: 1.4, x: 960, y: 1000, z: 1.42 },
            { t: 7.2, x: 960, y: 1010, z: 1.48 },
          ]}
          spots={[
            { rect: { x: 318, y: 1020, w: 660, h: 36 }, from: 1.6, to: 4.3, color: C.red },
            { rect: { x: 324, y: 1062, w: 1272, h: 72 }, from: 4.4, to: 7.1, color: C.red },
          ]}
        />
      </S>
      <S id="proof">
        <ProofCard />
      </S>

      {/* 7. Hand back to the agent */}
      <S id="handback">
        <Shot
          src="ledger-handback.mp4"
          kind="video"
          w={1920}
          h={1080}
          rate={2.2}
          masks={LEDGER_MASK}
          keys={[
            { t: 0, x: 960, y: 520, z: 1.15 },
            { t: 3.4, x: 960, y: 640, z: 1.32 },
            { t: 9.3, x: 960, y: 700, z: 1.36 },
          ]}
        />
        <Speed rate={2.2} from={0} to={9.3} />
      </S>
      <S id="reply">
        <Shot src="gh-conversation.png" kind="image" w={1920} h={2514} keys={[{ t: 0, x: 820, y: 1560, z: 1.35 }, { t: 2.7, x: 820, y: 1610, z: 1.6 }]} />
        <Chip x={960} y={60} from={0.2} to={2.6} align="center" tone="green">
          Posted on the real GitHub thread
        </Chip>
      </S>

      {/* 8. Finale */}
      <S id="score">
        <ScoreCard />
      </S>
      <S id="end" fadeOut={0.8}>
        <EndCard />
      </S>

      <Captions />
      <Grain />

      {/* Audio */}
      <Audio src={staticFile("music.wav")} volume={duck} />
      <Audio src={staticFile("sfx.wav")} volume={0.75} />
      {timeline.narration.map((n) => (
        <Sequence key={n.id} from={Math.round(n.at * FPS)} name={`vo ${n.id}`}>
          <Audio src={staticFile(`${n.id}.wav`)} volume={1} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
