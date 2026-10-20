// Word timings for subtitles, measured from the generated audio (not estimated):
// Whisper (base.en, local) word timestamps, aligned onto the caption's own words.
//   node scripts/align.mjs narration.json → captions.json
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pipeline } from "@huggingface/transformers";

const { segments } = JSON.parse(readFileSync(process.argv[2] ?? "narration.json", "utf8"));
const asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-base.en", { dtype: "fp32" });

const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

function pcm16k(file) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

const out = {};
for (const s of segments) {
  const file = `audio/${s.id}.wav`;
  const pcm = pcm16k(file);
  const duration = pcm.length / 16000;
  const r = await asr(pcm, { return_timestamps: "word", chunk_length_s: 30 });
  const heard = (r.chunks ?? []).map((c) => ({ w: norm(c.text), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] })).filter((h) => h.w);
  const words = s.caption.split(/\s+/).filter(Boolean);
  const keys = words.map(norm);

  // Global alignment (edit distance) between caption words and heard words.
  const n = keys.length, m = heard.length;
  const dp = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const sub = keys[i - 1] === heard[j - 1].w || (keys[i - 1] && heard[j - 1].w && (keys[i - 1].startsWith(heard[j - 1].w) || heard[j - 1].w.startsWith(keys[i - 1]))) ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j - 1] + sub, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  const times = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const sub = dp[i][j] === dp[i - 1][j - 1] + (keys[i - 1] === heard[j - 1].w ? 0 : 1) || dp[i][j] === dp[i - 1][j - 1];
    if (sub) {
      times[i - 1] = { start: heard[j - 1].start, end: heard[j - 1].end };
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + 1) i--;
    else j--;
  }
  // Fill words Whisper merged/missed by interpolating between known neighbours.
  for (let i = 0; i < n; i++) {
    if (times[i]) continue;
    const prev = times.slice(0, i).reverse().find(Boolean);
    let k = i;
    while (k < n && !times[k]) k++;
    const next = times[k];
    const a = prev ? prev.end : 0;
    const b = next ? next.start : duration;
    const span = (b - a) / (k - i + 1);
    for (let q = i; q < k; q++) times[q] = { start: a + span * (q - i + 0.5), end: a + span * (q - i + 1) };
  }
  out[s.id] = { duration, words: words.map((w, i) => ({ text: w, start: +times[i].start.toFixed(3), end: +times[i].end.toFixed(3) })) };
  const matched = times.filter(Boolean).length;
  console.log(`${s.id} ${duration.toFixed(2)}s  heard: "${r.text.trim().slice(0, 70)}"  words ${matched}/${n}`);
}
writeFileSync("captions.json", JSON.stringify(out, null, 1));
