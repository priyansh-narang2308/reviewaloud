import { loadFont } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const { fontFamily: SANS } = loadFont("normal", { weights: ["300", "400", "500", "600", "700"], subsets: ["latin"] });
export const { fontFamily: MONO } = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const C = {
  bg: "#07080A",
  ink: "#E7E9EE",
  muted: "#A0A8B6",
  accent: "#F5A524",
  red: "#F87171",
  green: "#34D399",
};

export const EASE = Easing.bezier(0.77, 0, 0.175, 1); // strong ease-in-out for camera moves
export const OUT = Easing.bezier(0.23, 1, 0.32, 1); // strong ease-out for entrances

/** Seconds → frames helper bound to the composition fps. */
export const useSec = () => {
  const { fps } = useVideoConfig();
  const f = useCurrentFrame();
  return { t: f / fps, fps, f };
};

export type Key = { t: number; x: number; y: number; z: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** Interpolated camera: source point (x,y) centred in frame at zoom z (1 = source fits 1920 wide). */
export function camera(keys: Key[], t: number) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b.t) {
      const p = EASE((t - a.t) / (b.t - a.t));
      return { t, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, z: a.z + (b.z - a.z) * p };
    }
  }
  return keys[keys.length - 1];
}

type ShotProps = {
  src: string;
  kind: "video" | "image";
  w: number;
  h: number;
  keys: Key[];
  startFrom?: number; // seconds into the source video
  rate?: number;
  /** Source-space rects to paint over (dev-only overlay badges). */
  masks?: Rect[];
  spots?: { rect: Rect; from: number; to: number; color?: string }[];
  children?: (map: (r: Rect) => Rect) => React.ReactNode;
};

/** A piece of real footage/screenshot under a moving camera, with a soft vignette. */
export function Shot({ src, kind, w, h, keys, startFrom = 0, rate = 1, masks = [], spots = [], children }: ShotProps) {
  const { t, fps } = useSec();
  const cam = camera(keys, t);
  const scale = (cam.z * 1920) / w;
  const tx = 960 - cam.x * scale;
  const ty = 540 - cam.y * scale;
  const map = (r: Rect): Rect => ({ x: tx + r.x * scale, y: ty + r.y * scale, w: r.w * scale, h: r.h * scale });
  const active = spots.find((s) => t >= s.from && t <= s.to);
  const spot = active;
  const spotOn = spot ? interpolate(t, [spot.from, spot.from + 0.45, spot.to - 0.4, spot.to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const sr = spot ? map(spot.rect) : null;
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: tx,
          top: ty,
          width: w * scale,
          height: h * scale,
          borderRadius: 18 * Math.min(1, scale),
          overflow: "hidden",
          boxShadow: "0 40px 120px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        {kind === "video" ? (
          <OffthreadVideo src={staticFile(src)} startFrom={Math.round(startFrom * fps)} playbackRate={rate} muted style={{ width: "100%", height: "100%" }} />
        ) : (
          <Img src={staticFile(src)} style={{ width: "100%", height: "100%" }} />
        )}
        {masks.map((m, i) => (
          <div key={i} style={{ position: "absolute", left: m.x * scale, top: m.y * scale, width: m.w * scale, height: m.h * scale, background: "#0B0C0F" }} />
        ))}
      </div>
      {sr && spotOn > 0 && (
        <div
          style={{
            position: "absolute",
            left: sr.x - 10,
            top: sr.y - 8,
            width: sr.w + 20,
            height: sr.h + 16,
            borderRadius: 14,
            border: `2px solid ${spot!.color ?? C.accent}`,
            boxShadow: `0 0 0 9999px rgba(3,4,6,${0.62 * spotOn}), 0 0 40px ${spot!.color ?? C.accent}55`,
            opacity: spotOn,
            transform: `scale(${0.98 + 0.02 * spotOn})`,
          }}
        />
      )}
      {children?.(map)}
      <Vignette />
    </AbsoluteFill>
  );
}

export function Vignette() {
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: "radial-gradient(ellipse 75% 70% at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%)",
      }}
    />
  );
}

/** Subtle animated film grain over everything. */
export function Grain() {
  const { f } = useSec();
  const seed = Math.floor(f / 2);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: 0.06, mixBlendMode: "overlay" }}>
      <svg width="1920" height="1080">
        <filter id={`g${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} />
        </filter>
        <rect width="1920" height="1080" filter={`url(#g${seed})`} />
      </svg>
    </AbsoluteFill>
  );
}

/** Glass chip label anchored in frame space. */
export function Chip({ x, y, from, to, children, tone = "accent", align = "left" }: { x: number; y: number; from: number; to: number; children: React.ReactNode; tone?: "accent" | "red" | "green" | "plain"; align?: "left" | "center" | "right" }) {
  const { t } = useSec();
  const v = interpolate(t, [from, from + 0.35, to - 0.3, to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (v <= 0) return null;
  const color = { accent: C.accent, red: C.red, green: C.green, plain: C.ink }[tone];
  const shift = align === "center" ? "-50%" : align === "right" ? "-100%" : "0";
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(${shift}, ${(1 - OUT(v)) * 10}px) scale(${0.96 + 0.04 * v})`,
        opacity: v,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 20px",
        borderRadius: 999,
        background: "rgba(14,15,19,0.78)",
        border: `1px solid ${color}66`,
        boxShadow: `0 10px 40px rgba(0,0,0,0.5), 0 0 30px ${color}22`,
        backdropFilter: "blur(12px)",
        color: C.ink,
        fontFamily: SANS,
        fontSize: 26,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 99, background: color, boxShadow: `0 0 12px ${color}` }} />
      {children}
    </div>
  );
}

/** Honest speed indicator whenever footage is sped up. */
export function Speed({ rate, from, to }: { rate: number; from: number; to: number }) {
  const { t } = useSec();
  const v = interpolate(t, [from, from + 0.3, to - 0.3, to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (v <= 0 || rate <= 1.05) return null;
  return (
    <div style={{ position: "absolute", right: 56, top: 48, opacity: v * 0.9, fontFamily: MONO, fontSize: 22, color: C.muted, letterSpacing: 1, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.45)" }}>
      ▶▶ {rate.toFixed(1)}×
    </div>
  );
}

export function rnd(seed: string) {
  return random(seed);
}
