"""Rough tempo/onset read of the track so the cut can land on the beat.

No librosa here, so this is a plain onset-envelope autocorrelation. Good
enough to pick a BPM and the first strong downbeat.
"""
import sys
import numpy as np
import soundfile as sf

path = sys.argv[1]
x, sr = sf.read(path, always_2d=True)
mono = x.mean(axis=1).astype(np.float64)

# --- onset envelope: half-wave rectified frame energy difference ---
hop = 512
win = 1024
n = (len(mono) - win) // hop
frames = np.lib.stride_tricks.sliding_window_view(mono, win)[::hop][:n]
energy = (frames ** 2).mean(axis=1)
env = np.diff(energy)
env[env < 0] = 0          # half-wave rectify
fps = sr / hop

# --- autocorrelation over plausible tempos ---
env = env - env.mean()
ac = np.correlate(env, env, mode="full")[len(env) - 1:]
ac[0] = 0
bpm_min, bpm_max = 70, 200
lo = int(fps * 60 / bpm_max)
hi = int(fps * 60 / bpm_min)
ac[:lo] = 0
ac[hi:] = 0
best = np.argmax(ac)
bpm = 60 * fps / best
print(f"bpm={bpm:.1f}  (lag={best} frames, fps={fps:.1f})")

# --- first strong onset, in seconds ---
peak = env.max()
idx = np.argmax(env > 0.35 * peak)
# back off to the nearest preceding local minimum = start of the hit
j = idx
while j > 1 and env[j - 1] < env[j]:
    j -= 1
print(f"first_onset={j / fps:.3f}s  (peak at {idx / fps:.3f}s)")

# --- beat grid from the detected bpm, starting at first_onset ---
beat = 60.0 / bpm
print("beat_grid=" + ",".join(f"{j / fps + i * beat:.3f}" for i in range(9)))
