"""tools/asr.py: a local speech recogniser (Whisper large-v3-turbo on MLX) used only to check the voices.

A clip passes if what the recogniser hears, compared as toneless pinyin, matches the script. That catches garbled
audio, skipped words and the worst mispronunciations; it can't hear a wrong tone the recogniser silently forgives.
"""
import numpy as np

MODEL = 'mlx-community/whisper-large-v3-turbo'


def transcribe(x, sr=24000):
    import mlx_whisper
    import zhconv
    from scipy.signal import resample_poly
    y = resample_poly(x, 2, 3).astype('float32') if sr == 24000 else x.astype('float32')
    pad = np.zeros(8000, dtype='float32')   # half a second either side: Whisper invents words to fill very short clips
    y = np.concatenate([pad, y, pad])
    r = mlx_whisper.transcribe(y, path_or_hf_repo=MODEL, language='zh', initial_prompt='以下是普通话的句子。',
                               condition_on_previous_text=False, temperature=0.0)
    return zhconv.convert(r['text'].strip(), 'zh-cn')


def syllables(text):
    import cn2an
    from pypinyin import lazy_pinyin
    try:
        text = cn2an.transform(text, 'an2cn')
    except Exception:
        pass
    return lazy_pinyin(''.join(c for c in text if '一' <= c <= '鿿'))


def edit(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, y in enumerate(b, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (x != y))
    return d[len(b)]


_sv = None


def transcribe_sv(x, sr=24000):
    """A second opinion from SenseVoice-Small (FunAudioLLM, Chinese-first and steadier than Whisper on one-word clips)."""
    global _sv
    import re
    import zhconv
    from scipy.signal import resample_poly
    if _sv is None:
        from funasr import AutoModel
        _sv = AutoModel(model='FunAudioLLM/SenseVoiceSmall', hub='hf', disable_update=True, device='cpu', log_level='ERROR')
    y = resample_poly(x, 2, 3).astype('float32') if sr == 24000 else x.astype('float32')
    r = _sv.generate(input=y, fs=16000, language='zh', use_itn=False, disable_pbar=True)
    return zhconv.convert(re.sub(r'<\|[^|]*\|>', '', r[0]['text']).strip(), 'zh-cn')


FILLER = {'a', 'ya', 'la', 'le', 'ne', 'ba', 'o', 'ou', 'ei', 'en', 'e'}


def cer(x, script, heard=None):
    """Toneless-syllable error rate of what the recogniser hears in clip x against its script (0 is perfect). A particle
    the recogniser tacks onto the end (啊, 了, 呀…) isn't counted: it does that to short clips."""
    heard = transcribe(x) if heard is None else heard
    a, b = syllables(script), syllables(heard)
    while b and len(b) > len(a) and b[-1] in FILLER:
        b = b[:-1]
    return edit(a, b) / max(1, len(a))
