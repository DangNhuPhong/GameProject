"""Trim supplied recordings and synthesize small pixel-game cues.

Run with imageio_ffmpeg and numpy available. Original recordings stay untouched.
"""
from pathlib import Path
import subprocess
import wave
import numpy as np
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend/src/assets/audio"
OUT.mkdir(parents=True, exist_ok=True)
RATE = 22050
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
DOWNLOADS = Path.home() / "Downloads"


def save(name, samples):
    samples = np.clip(samples, -0.95, 0.95)
    with wave.open(str(OUT / (name + ".wav")), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(RATE)
        stream.writeframes((samples * 32767).astype("<i2").tobytes())


def recording(filename, start, duration, gain, fade=0.015):
    result = subprocess.run(
        [FFMPEG, "-v", "error", "-i", str(DOWNLOADS / filename),
         "-ss", str(start), "-t", str(duration), "-f", "f32le",
         "-ac", "1", "-ar", str(RATE), "-"],
        capture_output=True, check=True,
    )
    data = np.frombuffer(result.stdout, dtype=np.float32).copy() * gain
    count = min(int(fade * RATE), len(data) // 2)
    data[:count] *= np.linspace(0, 1, count)
    data[-count:] *= np.linspace(1, 0, count)
    return data


save("chop", recording("freesound_community-knife-stab-48222.mp3", 0.28, 0.23, 2.4, 0.008))
save("oven-ready", recording("oven ding.mp3", 0, 1.15, 1, 0.004))
frying = recording("frying.mp3", 2, 5, 2.2, 0.004)
# Overlap the ends so the repeating ambience has no abrupt seam.
cross = int(0.18 * RATE)
blend = np.linspace(0, 1, cross)
frying[:cross] = frying[-cross:] * (1 - blend) + frying[:cross] * blend
save("frying", frying[:-cross])


def note(frequency, duration, amplitude=0.3):
    t = np.arange(int(RATE * duration)) / RATE
    envelope = np.minimum(t / 0.006, 1) * np.exp(-t * 10)
    return amplitude * (np.sin(2*np.pi*frequency*t) + 0.15*np.sin(6*np.pi*frequency*t)) * envelope


def melody(name, frequencies, duration):
    save(name, np.concatenate([note(f, duration) for f in frequencies]))


melody("success", [523.25, 659.25, 783.99, 1046.5], 0.12)
melody("error", [220, 164.81], 0.12)
melody("warning", [880, 660, 880], 0.13)
melody("tick", [1100], 0.065)
melody("time-up", [659.25, 523.25, 392, 261.63], 0.17)
melody("place", [420, 620], 0.045)
rng = np.random.default_rng(42)
for i, frequency in enumerate([130, 155]):
    t = np.arange(int(RATE * 0.1)) / RATE
    noise = rng.normal(0, 1, len(t))
    noise = np.convolve(noise, np.ones(7)/7, mode="same")
    sound = (np.sin(2*np.pi*frequency*t)*0.22 + noise*0.18) * np.exp(-t*48)
    sound[:100] *= np.linspace(0, 1, 100)
    save("step-" + str(i+1), sound)
print("Prepared", len(list(OUT.glob('*.wav'))), "audio clips")
