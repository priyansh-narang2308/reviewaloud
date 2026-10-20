"""Original score + sound design, synthesized from scratch (no samples, no licensing).

Reads timeline.json and writes:
  audio/music.wav  - cinematic bed: sub drone, evolving pad chords, soft pulse in the
                     "ledger" act, shimmer arps, silence-aware swells
  audio/sfx.wav    - risers, deep booms, whooshes, ticks placed at timeline hits
Usage: python3 scripts/score.py
"""
import json
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
rng = np.random.default_rng(7)
tl = json.load(open("timeline.json"))
DUR = tl["duration"]
N = int(SR * DUR)
t = np.arange(N) / SR

def lp(x, f, order=4):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)

def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)

def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], "band", fs=SR, output="sos"), x)

def env_adsr(n, a, r):
    e = np.ones(n)
    ai, ri = int(a * SR), int(r * SR)
    if ai: e[:ai] = np.linspace(0, 1, ai) ** 2
    if ri: e[-ri:] *= np.linspace(1, 0, ri) ** 1.5
    return e

def reverb(x, seconds=3.2, mix=0.35):
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir = lp(ir, 6000)
    wet = fftconvolve(x, ir)[: len(x)]
    wet /= np.max(np.abs(wet)) + 1e-9
    dry = x / (np.max(np.abs(x)) + 1e-9)
    return (1 - mix) * dry + mix * wet

def hz(note):  # MIDI -> Hz
    return 440.0 * 2 ** ((note - 69) / 12)

def scene(name):
    s = next(s for s in tl["scenes"] if s["id"] == name)
    return s["from"], s["to"]

# ---------- Music ----------
music = np.zeros(N)

# Chord progression (A minor feel): Am9 - Fmaj7 - Cadd9 - Gsus
CHORDS = [[45, 57, 60, 64, 71], [41, 53, 57, 60, 64], [48, 55, 60, 62, 67], [43, 55, 57, 62, 67]]
BAR = 4.8  # seconds per chord (slow, cinematic)

def pad_voice(f, n):
    tt = np.arange(n) / SR
    det = [0.0, 0.0035, -0.0042]
    v = sum(np.sin(2 * np.pi * f * (1 + d) * tt + rng.uniform(0, 6.28)) for d in det)
    v += 0.25 * sum(np.sin(2 * np.pi * 2 * f * (1 + d) * tt) for d in det)  # soft 2nd harmonic
    return v / 4

pad = np.zeros(N)
k = 0
start = 0.0
while start < DUR:
    chord = CHORDS[k % 4]
    n = int(min(BAR + 1.2, DUR - start) * SR)
    s0 = int(start * SR)
    seg = sum(pad_voice(hz(m), n) for m in chord[1:])
    seg *= env_adsr(n, 1.4, 1.4)
    pad[s0 : s0 + n] += seg[: len(pad[s0 : s0 + n])]
    start += BAR
    k += 1
pad = lp(pad, 2400)

# Sub drone on chord roots
drone = np.zeros(N)
k, start = 0, 0.0
while start < DUR:
    n = int(min(BAR + 0.6, DUR - start) * SR)
    s0 = int(start * SR)
    f = hz(CHORDS[k % 4][0] - 12)
    tt = np.arange(n) / SR
    seg = np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt)
    seg *= env_adsr(n, 0.8, 0.8)
    drone[s0 : s0 + n] += seg[: len(drone[s0 : s0 + n])]
    start += BAR
    k += 1

# Section dynamics: quiet cold open, lift at title, drive during the ledger, resolve at end
dyn = np.interp(
    t,
    [0, 9.6, 11.8, 16, 40, 53, 61.5, 77, 83, 90, 96.5, 106.5, 108.5, 113, 117, 119],
    [0.35, 0.45, 0.85, 0.6, 0.62, 0.55, 0.9, 0.95, 0.8, 0.75, 0.7, 0.8, 0.95, 1.0, 0.6, 0.0],
)

# Pulse (felt kick + filtered hats) only in the ledger act, 96 BPM
pulse = np.zeros(N)
bpm = 96
beat = 60 / bpm
l0, l1 = 61.5, 106.0
b = l0
while b < l1:
    s0 = int(b * SR)
    n = int(0.45 * SR)
    tt = np.arange(n) / SR
    f = 52 * np.exp(-tt * 18) + 38
    kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)
    pulse[s0 : s0 + n] += kick[: len(pulse[s0 : s0 + n])] * 0.9
    hs = int((b + beat / 2) * SR)
    hn = int(0.06 * SR)
    hat = hp(rng.standard_normal(hn), 7000) * np.exp(-np.arange(hn) / SR * 70)
    pulse[hs : hs + hn] += hat[: len(pulse[hs : hs + hn])] * 0.18
    b += beat
pulse *= np.interp(t, [l0, l0 + 1.5, l1 - 2, l1], [0, 1, 1, 0])

# Shimmer arpeggio (glass-like) over the speak act and the finale
arp = np.zeros(N)
def arp_section(a, z, step):
    k = 0
    x = a
    while x < z:
        chord = CHORDS[int(x // BAR) % 4]
        note = chord[[1, 2, 3, 4, 3, 2][k % 6]] + 12
        n = int(0.9 * SR)
        s0 = int(x * SR)
        tt = np.arange(n) / SR
        tone = (np.sin(2 * np.pi * hz(note) * tt) + 0.3 * np.sin(2 * np.pi * hz(note) * 3 * tt)) * np.exp(-tt * 4.5)
        arp[s0 : s0 + n] += tone[: len(arp[s0 : s0 + n])]
        x += step
        k += 1
arp_section(16.0, 40.3, 0.3125)
arp_section(113.0, 117.5, 0.3125)
arp = reverb(arp, 2.4, 0.5)

music = 0.42 * pad + 0.38 * drone + 0.22 * pulse + 0.10 * arp
music *= dyn
music = reverb(music, 3.6, 0.28)
music *= np.interp(t, [0, 1.2, DUR - 3.5, DUR], [0, 1, 1, 0])

# ---------- SFX ----------
sfx = np.zeros(N)

def place(x, at):
    s0 = int(at * SR)
    e = min(N, s0 + len(x))
    if s0 < N:
        sfx[s0:e] += x[: e - s0]

def boom(at):
    n = int(2.6 * SR)
    tt = np.arange(n) / SR
    f = 70 * np.exp(-tt * 6) + 32
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 1.9)
    click = lp(rng.standard_normal(n), 1800) * np.exp(-tt * 40) * 0.6
    tail = lp(rng.standard_normal(n), 400) * np.exp(-tt * 2.2) * 0.35
    place((body + click + tail) * 0.95, at)

def riser(at, length):
    n = int(length * SR)
    tt = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    # sweep a band upward in chunks
    chunks = 24
    for i in range(chunks):
        a, z = i * n // chunks, (i + 1) * n // chunks
        lo = 300 * (1 + i * 1.6)
        out[a:z] = bp(noise, lo, min(lo * 2.2, 16000))[a:z]
    tone = np.sin(2 * np.pi * np.cumsum(np.linspace(110, 880, n)) / SR) * 0.25
    e = (tt / length) ** 2.2
    place((out * 0.7 + tone) * e * 0.55, at)

def whoosh(at):
    n = int(0.9 * SR)
    tt = np.arange(n) / SR
    noise = rng.standard_normal(n)
    sweep = np.zeros(n)
    for i in range(12):
        a, z = i * n // 12, (i + 1) * n // 12
        c = 600 + 4200 * np.sin(np.pi * i / 11)
        sweep[a:z] = bp(noise, c * 0.6, min(c * 1.6, 16000))[a:z]
    e = np.sin(np.pi * np.clip(tt / 0.9, 0, 1)) ** 2
    place(sweep * e * 0.35, at - 0.35)

def tick(at):
    n = int(0.08 * SR)
    tt = np.arange(n) / SR
    place(np.sin(2 * np.pi * 2400 * tt) * np.exp(-tt * 90) * 0.35, at)

for h in tl["hits"]:
    {"boom": lambda h: boom(h["at"]), "riser": lambda h: riser(h["at"], h["length"]), "whoosh": lambda h: whoosh(h["at"]), "tick": lambda h: tick(h["at"])}[h["kind"]](h)

sfx = reverb(sfx, 2.0, 0.22)

def write(name, x, peak_db):
    x = x / (np.max(np.abs(x)) + 1e-9) * 10 ** (peak_db / 20)
    stereo = np.stack([x, x], axis=1)
    # gentle stereo width: delay right channel 9 ms on the music bed
    if name == "music":
        d = int(0.009 * SR)
        stereo[d:, 1] = x[:-d]
    wavfile.write(f"audio/{name}.wav", SR, (stereo * 32767).astype(np.int16))
    print(f"audio/{name}.wav {len(x) / SR:.1f}s")

write("music", music, -3.0)
write("sfx", sfx, -2.0)
