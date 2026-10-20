// Kokoro TTS (local, kokoro-js + onnx-community/Kokoro-82M-v1.0-ONNX).
//   node scripts/tts.mjs narration.json   → audio/<id>.wav for each segment
// narration.json: { "voice": "af_heart", "speed": 1, "segments": [{ "id": "s01", "text": "..." }] }
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { KokoroTTS } from "kokoro-js";

const file = process.argv[2] ?? "narration.json";
const { voice, speed = 1, segments } = JSON.parse(readFileSync(file, "utf8"));
const only = process.env.ONLY?.split(",");
mkdirSync("audio", { recursive: true });

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });
for (const s of segments) {
  if (only && !only.includes(s.id)) continue;
  const out = `audio/${s.id}.wav`;
  if (existsSync(out) && !process.env.FORCE) continue;
  const t0 = Date.now();
  const audio = await tts.generate(s.text, { voice, speed: s.speed ?? speed });
  audio.save(out);
  console.log(`${s.id}: ${(audio.audio.length / audio.sampling_rate).toFixed(2)}s (${Date.now() - t0} ms)`);
}
