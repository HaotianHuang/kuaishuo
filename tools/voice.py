"""tools/voice.py: the local voice (Kokoro-82M v1.1-zh, Apache-2.0) and the small audio helpers the build shares.

Every clip is cached by (engine, voice, speed, text), so a rebuild only voices what changed.
"""
import hashlib
import os
import time
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 24000
REPO = 'hexgrad/Kokoro-82M-v1.1-zh'
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache' / 'tts'

_pipe = None


def pipeline():
    global _pipe
    if _pipe is None:
        os.environ.setdefault('HF_HUB_OFFLINE', '1')   # the model is cached; a flaky network shouldn't stop a build
        import torch
        from kokoro import KModel, KPipeline
        torch.set_num_threads(int(os.environ.get('KS_THREADS', '4')))
        model = KModel(repo_id=REPO).to('cpu').eval()
        _pipe = KPipeline(lang_code='z', repo_id=REPO, model=model)
    return _pipe


def trim(x, floor=0.012, pad=0.05):
    """Cut leading and trailing silence, keeping a little air so words don't start clipped."""
    loud = np.flatnonzero(np.abs(x) > floor)
    if not len(loud):
        return x
    p = int(pad * SR)
    return x[max(0, loud[0] - p): loud[-1] + p]


def level(x, rms=0.075, peak=0.89):
    """Bring every voice to the same loudness, so no character shouts or mumbles next to another."""
    r = float(np.sqrt(np.mean(x ** 2))) or 1.0
    x = x * (rms / r)
    m = float(np.max(np.abs(x))) or 1.0
    return x * (peak / m) if m > peak else x


def phone(x):
    """A gentle telephone colour for people heard down a line: no deep bass, no air."""
    from scipy.signal import butter, sosfilt
    sos = butter(4, [280, 4200], btype='bandpass', fs=SR, output='sos')
    return level(np.tanh(sosfilt(sos, x) * 1.6) / 1.6)


def stretch(x, rate):
    """Slower without changing the pitch (ffmpeg's atempo). Kokoro's own slow mode smears vowels and invents syllables
    below about 0.9 (吃了 came out 吃冷, 让一让 grew a 我), so slow lines are said at normal speed and stretched."""
    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        a, b = f'{d}/a.wav', f'{d}/b.wav'
        sf.write(a, x, SR)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', a, '-filter:a', f'atempo={rate}', b], check=True)
        y, _ = sf.read(b, dtype='float32')
    return y


def say(text, voice, speed=1.0, tel=False, extra=''):
    """Voice one line; returns float32 mono at SR. Cached on disk; `extra` (the pinyin fixes that touch this text) is
    part of the key, so fixing a reading re-voices exactly the lines it changes."""
    if speed < 0.95:   # slow lines: normal speech, stretched (see stretch())
        key = hashlib.sha1(f'stretch|{speed}|{voice}|{text}|{extra}'.encode()).hexdigest()[:16]
        f = CACHE / f'{key}.wav'
        if not f.exists():
            sf.write(f, level(stretch(say(text, voice, 1.0, False, extra), speed)), SR)
        x, _ = sf.read(f, dtype='float32')
        return phone(x).astype('float32') if tel else x
    key = hashlib.sha1((f'kokoro11zh|{voice}|{speed}|{text}' + (f'|{extra}' if extra else '')).encode()).hexdigest()[:16]
    f = CACHE / f'{key}.wav'
    if f.exists():
        x, _ = sf.read(f, dtype='float32')
    else:
        CACHE.mkdir(parents=True, exist_ok=True)
        parts = [r.audio.numpy() for r in pipeline()(text, voice=voice, speed=speed) if r.audio is not None]
        x = level(trim(np.concatenate(parts).astype('float32')))
        sf.write(f, x, SR)
    return phone(x).astype('float32') if tel else x


# ---------- optional: ElevenLabs (only when asked: python3 tools/build.py --engine=elevenlabs) ----------
ELEVEN_MODEL = os.environ.get('ELEVENLABS_MODEL', 'eleven_multilingual_v2')


def say_eleven(text, voice_id, speed=1.0, tel=False):
    """Same as say(), through the ElevenLabs API (needs ELEVENLABS_API_KEY). Cached like the local voice, so each line
    is paid for once. Credits: about one per character with eleven_multilingual_v2."""
    import json
    import urllib.request
    key = hashlib.sha1(f'eleven|{ELEVEN_MODEL}|{voice_id}|{speed}|{text}'.encode()).hexdigest()[:16]
    f = CACHE / f'{key}.wav'
    if not f.exists():
        api = os.environ.get('ELEVENLABS_API_KEY')
        if not api:
            raise SystemExit('ELEVENLABS_API_KEY is not set')
        body = json.dumps({'text': text, 'model_id': ELEVEN_MODEL, 'language_code': 'zh',
                           'voice_settings': {'stability': 0.5, 'similarity_boost': 0.8, 'speed': max(0.7, min(1.2, speed))}}).encode()
        req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=pcm_24000', body,
                                     {'xi-api-key': api, 'content-type': 'application/json'})
        pcm = urllib.request.urlopen(req, timeout=60).read()
        x = np.frombuffer(pcm, dtype='<i2').astype('float32') / 32768
        CACHE.mkdir(parents=True, exist_ok=True)
        sf.write(f, level(trim(x)), SR)
    x, _ = sf.read(f, dtype='float32')
    return phone(x).astype('float32') if tel else x


def cached_eleven(text, voice_id, speed=1.0):
    key = hashlib.sha1(f'eleven|{ELEVEN_MODEL}|{voice_id}|{speed}|{text}'.encode()).hexdigest()[:16]
    return (CACHE / f'{key}.wav').exists()


def f0(x):
    """Median pitch in Hz over voiced 40 ms frames (autocorrelation): enough to sort voices from low to high."""
    n, out = int(0.04 * SR), []
    for i in range(0, len(x) - n, n // 2):
        fr = x[i:i + n] - np.mean(x[i:i + n])
        if np.sqrt(np.mean(fr ** 2)) < 0.03:
            continue
        ac = np.correlate(fr, fr, 'full')[n - 1:]
        lo, hi = SR // 400, SR // 70
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.3 * ac[0]:
            out.append(SR / k)
    return float(np.median(out)) if out else 0.0


if __name__ == '__main__':
    t = time.time()
    x = say('不好意思，打扰一下。', 'zf_001')
    print(len(x) / SR, 's in', round(time.time() - t, 2), 's; f0', round(f0(x)))
