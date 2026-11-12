"""Per-second loudness profile + energy in the low band, to find the drop.

The edit should start on the drop and ride the loudest 14 seconds.
"""
import sys
import numpy as np
import soundfile as sf

path = sys.argv[1]
x, sr = sf.read(path, always_2d=True)
mono = x.mean(axis=1).astype(np.float64)

# crude low-band (bass) split with a one-pole lowpass
alpha = 0.02
low = np.empty_like(mono)
acc = 0.0
for i in range(len(mono)):
    acc += alpha * (mono[i] - acc)
    low[i] = acc
high = mono - low

win = int(sr * 1.0)
for s in range(0, len(mono) - win, win):
    seg = mono[s:s + win]
    l = low[s:s + win]
    h = high[s:s + win]
    rms = np.sqrt((seg ** 2).mean())
    lrms = np.sqrt((l ** 2).mean())
    hrms = np.sqrt((h ** 2).mean())
    bar = "#" * int(rms * 60)
    print(f"{s // win:>2}s  rms={rms:.3f} low={lrms:.3f} high={hrms:.3f} {bar}")
