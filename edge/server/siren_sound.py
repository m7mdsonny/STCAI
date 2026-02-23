"""
Play siren/alarm through PC speakers. Generates high-quality WAV (loud, professional).
Presets: fire_smoke (urgent high-pitch), theft (lower alert). Multiple presets per category.
"""
import io
import logging
import math
import os
import subprocess
import struct
import sys
import tempfile
import wave
from pathlib import Path

logger = logging.getLogger("edge.siren_sound")

SAMPLE_RATE = 44100
BIT_DEPTH = 16
VOLUME = 0.95  # max without clipping

# Preset definitions: (freq1, freq2, beat_ms, duration_sec, pattern)
PRESETS_FIRE_SMOKE = {
    "preset1": (880, 1100, 120, 3.0, "alternating"),
    "preset2": (700, 900, 180, 3.5, "alternating"),
    "preset3": (600, 800, 250, 4.0, "wail"),
    "preset4": (950, 1200, 100, 3.5, "alternating"),
    "preset5": (650, 850, 200, 4.0, "wail"),
    "preset6": (750, 950, 150, 3.0, "alternating"),
    "preset7": (550, 720, 280, 4.5, "wail"),
    "preset8": (820, 1050, 130, 3.2, "alternating"),
}
PRESETS_THEFT = {
    "preset1": (440, 550, 200, 3.0, "pulse"),
    "preset2": (380, 480, 280, 3.5, "pulse"),
    "preset3": (320, 400, 350, 4.0, "slow_pulse"),
    "preset4": (360, 460, 240, 3.2, "pulse"),
    "preset5": (400, 520, 220, 3.8, "slow_pulse"),
    "preset6": (300, 380, 380, 4.0, "pulse"),
    "preset7": (420, 500, 260, 3.5, "pulse"),
    "preset8": (340, 440, 300, 4.2, "slow_pulse"),
}
PRESETS_PERSON = PRESETS_THEFT  # نفس أصوات السرقة أو مخصص لاحقاً


def _generate_wav(freq1: float, freq2: float, duration_sec: float, pattern: str, beat_ms: int) -> bytes:
    """Generate 16-bit mono WAV bytes. Loud sine waves."""
    n_samples = int(SAMPLE_RATE * duration_sec)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)  # 16-bit
        wav.setframerate(SAMPLE_RATE)
        frames = []
        beat_samples = int(SAMPLE_RATE * beat_ms / 1000)
        for i in range(n_samples):
            t = i / SAMPLE_RATE
            if pattern == "alternating":
                # Switch between freq1 and freq2 every beat
                phase = (i // beat_samples) % 2
                f = freq1 if phase == 0 else freq2
                val = math.sin(2 * math.pi * f * t)
            elif pattern == "wail":
                # Siren-like sweep
                sweep = 0.5 + 0.5 * math.sin(2 * math.pi * 2 * t)
                f = freq1 + (freq2 - freq1) * sweep
                val = math.sin(2 * math.pi * f * t)
            elif pattern in ("pulse", "slow_pulse"):
                f = freq1
                pulse = 1.0 if (i // beat_samples) % 2 == 0 else 0.3
                val = math.sin(2 * math.pi * f * t) * pulse
            else:
                val = math.sin(2 * math.pi * freq1 * t)
            sample = int(VOLUME * 32767 * val)
            sample = max(-32768, min(32767, sample))
            frames.append(struct.pack("<h", sample))
        wav.writeframes(b"".join(frames))
    return buf.getvalue()


def _get_preset_params(category: str, preset: str) -> tuple:
    if category == "fire_smoke":
        return PRESETS_FIRE_SMOKE.get(preset, PRESETS_FIRE_SMOKE["preset1"])
    if category == "person":
        return PRESETS_PERSON.get(preset, PRESETS_THEFT["preset1"])
    return PRESETS_THEFT.get(preset, PRESETS_THEFT["preset1"])


def _sounds_dir() -> str:
    return os.environ.get("EDGE_SOUNDS_DIR", str(Path(__file__).resolve().parent.parent / "data" / "sounds"))


def _play_wav_file(file_path: str, duration_sec: float = 10.0) -> None:
    if not file_path or not os.path.isfile(file_path):
        return
    if sys.platform == "win32":
        import winsound
        winsound.PlaySound(file_path, winsound.SND_FILENAME | winsound.SND_NODEFAULT)
    else:
        for cmd in (["aplay", "-q", file_path], ["paplay", file_path]):
            try:
                subprocess.run(cmd, check=True, timeout=int(duration_sec) + 2, capture_output=True)
                break
            except (FileNotFoundError, subprocess.CalledProcessError):
                continue


def play_pc_sound(event_type: str, hw_config: dict) -> None:
    """
    Play alarm through PC speakers. Blocking.
    If preset is "custom:filename.wav" plays from data/sounds/filename.wav.
    """
    try:
        if event_type in ("fire", "smoke"):
            preset_name = (hw_config.get("sound_fire_smoke") or "preset1").strip() or "preset1"
            category = "fire_smoke"
        elif event_type == "person":
            preset_name = (hw_config.get("sound_person") or "preset1").strip() or "preset1"
            category = "person"
        else:
            preset_name = (hw_config.get("sound_theft") or "preset1").strip() or "preset1"
            category = "theft"
        duration_sec = max(1, min(30, float(hw_config.get("siren_duration_sec") or 3)))
        if preset_name.startswith("custom:"):
            fname = preset_name[7:].strip().replace("..", "").lstrip("/")
            if fname:
                sounds_dir = _sounds_dir()
                path = os.path.join(sounds_dir, os.path.basename(fname))
                if os.path.isfile(path):
                    _play_wav_file(path, duration_sec)
                    return
        params = _get_preset_params(category, preset_name)
        freq1, freq2, beat_ms, duration_sec, pattern = params
        duration_sec = max(1, min(30, float(hw_config.get("siren_duration_sec") or duration_sec)))
        wav_bytes = _generate_wav(freq1, freq2, duration_sec, pattern, beat_ms)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav_bytes)
            path = f.name
        try:
            _play_wav_file(path, duration_sec)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
    except Exception as e:
        logger.warning("PC siren play failed: %s", e)


def play_test_sound(sound_type: str, preset: str, hw_config: dict) -> None:
    """Play a test sound. sound_type: fire_smoke | theft | person. preset can be preset1..preset8 or custom:file.wav."""
    preset_name = (preset or "preset1").strip() or "preset1"
    if preset_name.startswith("custom:"):
        fname = preset_name[7:].strip().replace("..", "").lstrip("/")
        if fname:
            path = os.path.join(_sounds_dir(), os.path.basename(fname))
            if os.path.isfile(path):
                _play_wav_file(path, 5.0)
                return
    category = "fire_smoke" if sound_type == "fire_smoke" else ("person" if sound_type == "person" else "theft")
    params = _get_preset_params(category, preset_name)
    freq1, freq2, beat_ms, duration_sec, pattern = params
    wav_bytes = _generate_wav(freq1, freq2, min(1.5, duration_sec), pattern, beat_ms)  # shorter for test
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(wav_bytes)
        path = f.name
    try:
        if sys.platform == "win32":
            import winsound
            winsound.PlaySound(path, winsound.SND_FILENAME | winsound.SND_NODEFAULT)
        else:
            for cmd in (["aplay", "-q", path], ["paplay", path]):
                try:
                    subprocess.run(cmd, check=True, timeout=3, capture_output=True)
                    break
                except (FileNotFoundError, subprocess.CalledProcessError):
                    continue
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
