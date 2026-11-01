"""tools/bakeoff.py: the voice bake-off (docs/v2/voices.md §2). The same test lines (tools/bakeoff-lines.json) through
Kokoro and four ElevenLabs models, a woman's and a man's voice each, three takes; both recognisers on every clip; a
speaker check across takes; and a listening page for the owner's ear, review/voices/bakeoff.html (tools/serve.mjs:
http://127.0.0.1:8791/review/voices/bakeoff.html).

  py=~/.cache/kuaishuo/venv/bin/python
  $py -I tools/bakeoff.py --estimate          what voicing would spend, without calling anyone
  $py -I tools/bakeoff.py voice --budget=N    voice every clip; stops before calling if it would spend over N credits
  $py -I tools/bakeoff.py hear                SenseVoice on every clip, Whisper on its doubts
  $py -I tools/bakeoff.py spk                 the speaker check (CAM++): do a voice's takes and lines sound like one person?
  $py -I tools/bakeoff.py pitch               character times and pitch, for the tone check on marked characters
  $py -I tools/bakeoff.py page                the listening page, from whatever the steps above have made
  $py -I tools/bakeoff.py all --budget=N      the five in turn
  --only=h1,x2                                just those lines (a trial run)

Every API answer is cached (.cache/bakeoff/api), so a line is paid for once however often this runs. The key comes from
ELEVENLABS_API_KEY or the Keychain item "elevenlabs", and is never written anywhere.
"""
import collections
import concurrent.futures as cf
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import NamedTuple

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import voice  # noqa: E402

ROOT = voice.ROOT
LINES, TEMPLATE = ROOT / 'tools' / 'bakeoff-lines.json', ROOT / 'tools' / 'bakeoff.html'
OUT, PAGE = ROOT / 'review' / 'voices' / 'bakeoff', ROOT / 'review' / 'voices' / 'bakeoff.html'
CACHE = ROOT / '.cache' / 'bakeoff'
API = 'https://api.elevenlabs.io/v1'
# engine → credits a character, from the account's model list (Flash is half price; Kokoro is free and local)
ENGINES = {'kokoro': 0, 'eleven_v4': 1.0, 'eleven_v3': 1.0, 'eleven_multilingual_v2': 1.0, 'eleven_flash_v2_5': 0.5}
ACTS = {'eleven_v4', 'eleven_v3'}   # the models that take audio tags; the others would read "[laughs]" aloud
VOICES = {   # a woman's and a man's, standard Putonghua
    'kokoro': {'f': 'zf_004', 'm': 'zm_030'},   # tools/voices.json's model voice and narrator
    'eleven': {'f': 'Ca5bKgudqKJzq8YRFoAz', 'm': '4VZIsMPtgggwNg7OXbPY'},   # Coco Li (on the account already), James Gao (Voice Library)
}
TAKES = 3          # Kokoro says a line the same way every time, so it has one
SLOW, FAST = 0.78, 1.15   # build.py's slow model answer, and its pace: "fast"
OFF = 0.15         # build.py's check: a clip more than 15% off from both recognisers is doubted
HAN = re.compile(r'[一-鿿]')
MARKS = {c: n for n, cs in enumerate(['āēīōūǖ', 'áéíóúǘ', 'ǎěǐǒǔǚ', 'àèìòùǜ'], 1) for c in cs}


def tone(syllable):   # 1 to 4, or 5 for a neutral tone
    return next((MARKS[c] for c in syllable if c in MARKS), 5)


class Clip(NamedTuple):
    engine: str
    g: str        # 'f' or 'm'
    line: str
    take: int
    mode: str     # '' as said, 'slow' the engine's own slow speed, 'stretch' take 1 stretched (as the app's slow answers are now)
    text: str
    speed: float

    @property
    def name(self):
        return f'{self.engine}.{self.g}.{self.line}.{self.take}' + (f'.{self.mode}' if self.mode else '')

    @property
    def file(self):   # the page's file names say nothing about the engine: the A/B is blind
        return hashlib.sha1(self.name.encode()).hexdigest()[:12]

    @property
    def paid(self):   # a call of its own (a stretch reuses take 1)
        return self.engine != 'kokoro' and self.mode != 'stretch'


def plan(lines):
    out = []
    for ln in lines:
        speed = FAST if ln.get('pace') == 'fast' else 1.0
        for e in ENGINES:
            text = f"{ln['tag']} {ln['zh']}" if ln.get('tag') and e in ACTS else ln['zh']
            for g in 'fm':
                out += [Clip(e, g, ln['id'], t, '', text, speed) for t in range(1, (1 if e == 'kokoro' else TAKES) + 1)]
                if ln['kind'] == 'model':
                    out.append(Clip(e, g, ln['id'], 1, 'stretch', text, SLOW))
                    if e != 'kokoro':
                        out.append(Clip(e, g, ln['id'], 1, 'slow', text, SLOW))
    return out


# ---------- ElevenLabs ----------

_key = None


def key():
    global _key
    if _key is None:
        _key = os.environ.get('ELEVENLABS_API_KEY') or subprocess.run(
            ['security', 'find-generic-password', '-s', 'elevenlabs', '-w'], capture_output=True, text=True).stdout.strip()
        if not _key:
            raise SystemExit('No ElevenLabs key: set ELEVENLABS_API_KEY, or save it in the Keychain as "elevenlabs"')
    return _key


def api_file(text, model, vid, speed, seed):
    return CACHE / 'api' / (hashlib.sha1(f'{model}|{vid}|{speed}|{seed}|{text}'.encode()).hexdigest()[:16] + '.wav')


def eleven(text, model, vid, speed=1.0, seed=1):
    """One line through the text-to-speech API, cached. Normal speed sends no voice settings, so each voice is heard as
    its maker set it; slow and fast send only the speed."""
    f = api_file(text, model, vid, speed, seed)
    if not f.exists():
        body = {'text': text, 'model_id': model, 'language_code': 'zh', 'seed': seed}
        if speed != 1.0:
            body['voice_settings'] = {'speed': speed}
        req = urllib.request.Request(f'{API}/text-to-speech/{vid}?output_format=pcm_24000', json.dumps(body).encode(),
                                     {'xi-api-key': key(), 'content-type': 'application/json'})
        for attempt in range(6):
            try:
                r = urllib.request.urlopen(req, timeout=120)
                pcm, cost = r.read(), r.headers.get('character-cost')
                break
            except urllib.error.HTTPError as e:   # too many at once, or a hiccup: wait and again; anything else stops the run
                msg = e.read()[:300].decode('utf8', 'replace')
                if e.code not in (429, 500, 502, 503, 504) or attempt == 5:
                    raise SystemExit(f'{model} said {e.code} to {text!r}: {msg}')
            except (urllib.error.URLError, TimeoutError):
                if attempt == 5:
                    raise
            time.sleep(3 * 2 ** attempt)
        x = np.frombuffer(pcm, dtype='<i2').astype('float32') / 32768
        f.parent.mkdir(parents=True, exist_ok=True)
        sf.write(f, voice.level(voice.trim(x)), voice.SR, subtype='PCM_16')
        f.with_suffix('.json').write_text(json.dumps({'cost': int(cost) if cost and cost.isdigit() else None}))   # what it charged
    return sf.read(f, dtype='float32')[0]


def used():
    req = urllib.request.Request(f'{API}/user/subscription', headers={'xi-api-key': key()})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())['character_count']


# ---------- clips ----------

_ced = None


def ced():
    global _ced
    if _ced is None:
        import build
        _ced = build.setup_text()   # loads Kokoro, and our pinyin fixes on top of pypinyin
    return _ced


def audio(c):
    if c.engine == 'kokoro':
        import build
        ced()
        return build.speak(c.text, VOICES['kokoro'][c.g], c.speed, False)   # below 0.95 that's said, then stretched
    vid = VOICES['eleven'][c.g]
    if c.mode == 'stretch':
        return voice.level(voice.stretch(eleven(c.text, c.engine, vid, 1.0, 1), SLOW))
    return eleven(c.text, c.engine, vid, c.speed, c.take)


def wav(c):
    return CACHE / 'clips' / f'{c.file}.wav'


def render(c):
    """The clip as heard: a wav for the checks, an m4a for the page."""
    w, m = wav(c), OUT / 'clips' / f'{c.file}.m4a'
    if not w.exists():
        w.parent.mkdir(parents=True, exist_ok=True)
        sf.write(w, audio(c), voice.SR, subtype='PCM_16')
    if not m.exists():
        m.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(w), '-c:a', 'aac', '-b:a', '96k', '-ac', '1', str(m)], check=True)
    return c


def clip(c):
    if not wav(c).exists():
        raise SystemExit(f'{c.name} has no audio yet: run tools/bakeoff.py voice first')
    return sf.read(wav(c), dtype='float32')[0]


def todo(clips):
    return [c for c in clips if c.paid and not api_file(c.text, c.engine, VOICES['eleven'][c.g], c.speed, c.take).exists()]


def estimate(lines):
    left = todo(plan(lines))
    for e in ENGINES:
        mine = [c for c in left if c.engine == e]
        if mine:
            print(f'{e}: {len(mine)} calls, about {sum(len(c.text) for c in mine) * ENGINES[e]:.0f} credits')
    n = sum(len(c.text) * ENGINES[c.engine] for c in left)
    print(f'in all: {len(left)} calls, about {n:.0f} credits')
    return n


def voice_all(lines, budget):
    clips = plan(lines)
    n = estimate(lines)
    if n > budget:
        raise SystemExit(f'That is over the budget of {budget} credits: nothing voiced.')
    left = todo(clips)
    if left:
        before = used()
        done = 0
        with cf.ThreadPoolExecutor(4) as ex:   # Creator allows five requests at once
            for _ in ex.map(render, left):
                done += 1
                if done % 50 == 0 or done == len(left):
                    print(f'  {done}/{len(left)} voiced', flush=True)
        after = used()
        spend = json.loads((OUT / 'spend.json').read_text()) if (OUT / 'spend.json').exists() else {'runs': []}
        spend['runs'].append({'at': time.strftime('%Y-%m-%d %H:%M'), 'calls': len(left), 'estimate': round(n), 'before': before, 'after': after})
        (OUT / 'spend.json').write_text(json.dumps(spend, indent=1))
        print(f'voiced; the account had used {before} credits before this run (its counter catches up a minute or two later)')
    rest = [c for c in clips if not (wav(c).exists() and (OUT / 'clips' / f'{c.file}.m4a').exists())]
    for i, c in enumerate(rest):   # Kokoro, the stretches, and anything not yet a clip
        render(c)
        if i % 50 == 49:
            print(f'  {i + 1}/{len(rest)} clips made', flush=True)
    print(f'{len(clips)} clips in {OUT.relative_to(ROOT)}/clips')


def readings(ln):
    """The pinyin the app would show for the line, and for each check the reading it gives that character."""
    import build
    py, toks = build.annotate(ced(), ln['zh'])
    per = []   # one syllable per character; erhua's 儿 gets none (点儿 is diǎnr, on the 点)
    for t in toks:
        w, syl = t[0], (t[1].split() if len(t) > 1 else [])
        if not syl:
            per += [''] * len(w)
        elif len(syl) == len(w):
            per += syl
        elif w.endswith('儿') and len(syl) == len(w) - 1:
            per += syl + ['']
        else:
            per += [t[1]] * len(w)
    app = []
    for ctx, ch, *_ in ln.get('check', []):
        i = ln['zh'].index(ctx) + ctx.index(ch)
        app.append(per[i] if len(per) == len(ln['zh']) else '?')
    if len(per) != len(ln['zh']):
        return {'py': py, 'app': app}
    # the tone each character is said on, for the pitch check: 0 for none (punctuation, erhua's 儿), 5 for neutral
    said = [tone(p) if HAN.match(ch) and p else 0 for ch, p in zip(ln['zh'], per)]
    for ctx, ch, reading, *_ in ln.get('check', []):
        said[ln['zh'].index(ctx) + ctx.index(ch)] = tone(reading)
    for i in range(len(said) - 1):   # the app writes 一 and 不 as said, but third tones as written: the first of two is said rising
        j = i + 2 if ln['zh'][i + 1] == '儿' and i + 2 < len(said) else i + 1   # 点儿小 is diǎnr xiǎo: 儿 is part of 点
        if said[i] == 3 and said[j] == 3:
            said[i] = 2
    return {'py': py, 'app': app, 'said': said}


# ---------- the checks ----------

def hear(lines):
    """SenseVoice on every clip, then Whisper on the ones it doubts. Doubted by both is the same as with Whisper on
    everything, and this Mac can't hold Whisper large on 1,900 clips beside everything else (it swaps). SenseVoice is
    also the fairer first ear: it writes 八零二 where Whisper writes 802, which the check reads back as 八百零二."""
    import asr
    f = OUT / 'heard.json'
    heard = json.loads(f.read_text()) if f.exists() else {}
    clips = plan(lines)
    zh = {ln['id']: ln['zh'] for ln in lines}
    for which, fn in (('sv', asr.transcribe_sv), ('w', asr.transcribe)):   # one model at a time: 8 GB
        left = [c for c in clips if which not in heard.get(c.name, {})
                and (which == 'sv' or asr.cer(None, zh[c.line], heard[c.name]['sv']) > OFF)]
        t0 = time.time()
        for i, c in enumerate(left):
            heard.setdefault(c.name, {})[which] = fn(clip(c))
            if i % 50 == 49 or i == len(left) - 1:
                f.write_text(json.dumps(heard, ensure_ascii=False))
                print(f'  {which}: {i + 1}/{len(left)}, {(time.time() - t0) / (i + 1):.1f} s a clip', flush=True)
    print(f'{len(clips)} clips heard')


def spk(lines):
    from funasr import AutoModel
    from scipy.signal import resample_poly
    m = AutoModel(model='iic/speech_campplus_sv_zh-cn_16k-common', disable_update=True, device='cpu', log_level='ERROR')
    clips = [c for c in plan(lines) if not c.mode]
    emb = np.stack([np.asarray(m.generate(input=resample_poly(clip(c), 2, 3).astype('float32'), fs=16000, disable_pbar=True)[0]['spk_embedding']).reshape(-1)
                    for c in clips])
    np.savez(OUT / 'spk.npz', names=np.array([c.name for c in clips]), emb=emb)
    print(f'{len(clips)} clips embedded')


def track(lines):
    """For the tone check: when SenseVoice heard each character, and the pitch (pYIN, semitones over 100 Hz, 10 ms
    frames), in every clip of a line with marked characters. The recognisers write the word the context suggests
    whatever its tone (涨 said zhāng came back 涨), so tones get a check of their own."""
    import librosa
    import zhconv
    from funasr import AutoModel
    from scipy.signal import resample_poly
    f = OUT / 'pitch.json'
    got = json.loads(f.read_text()) if f.exists() else {}
    left = [c for c in plan([ln for ln in lines if ln.get('check')]) if not c.mode and c.name not in got]
    if not left:
        return print('pitch: every clip tracked')
    m = AutoModel(model='FunAudioLLM/SenseVoiceSmall', hub='hf', disable_update=True, device='cpu', log_level='ERROR')
    t0 = time.time()
    for i, c in enumerate(left):
        y = resample_poly(clip(c), 2, 3).astype('float32')
        r = m.generate(input=y, fs=16000, language='zh', use_itn=False, disable_pbar=True, output_timestamp=True)[0]
        f0, _, _ = librosa.pyin(y, fmin=65, fmax=500, sr=16000, frame_length=1024, hop_length=160)
        got[c.name] = {'w': [zhconv.convert(w, 'zh-cn') for w in r.get('words', [])], 't': [a for a, _ in r.get('timestamp', [])],
                       'end': round(len(y) / 16), 'p': [None if np.isnan(v) else round(float(12 * np.log2(v / 100)), 1) for v in f0]}
        if i % 50 == 49 or i == len(left) - 1:
            f.write_text(json.dumps(got, ensure_ascii=False, separators=(',', ':')))
            print(f'  pitch: {i + 1}/{len(left)}, {(time.time() - t0) / (i + 1):.1f} s a clip', flush=True)


# ---------- the page ----------

def slips(script, heard):
    """Where SenseVoice heard a different character in a character's place: (tone slips, other syllables), each a list
    of 'script→heard'. A tone slip is the same syllable on another tone (微辣 heard as 胃了's 胃, 八 as 把), which the
    toneless check above lets through; for a tone language it's the error that matters most."""
    import difflib
    from pypinyin import Style, pinyin
    han = lambda t: ''.join(re.findall(r'[一-鿿]', t))   # noqa: E731
    a, b = han(script), han(heard)
    pa, pb = ([p[0] for p in pinyin(x, style=Style.TONE3, neutral_tone_with_five=True)] for x in (a, b))
    tone, other = [], []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == 'replace' and i2 - i1 == j2 - j1:
            for i, j in zip(range(i1, i2), range(j1, j2)):
                if pa[i][:-1] != pb[j][:-1]:
                    other.append(f'{a[i]}→{b[j]}')
                elif pa[i][-1] != pb[j][-1] and '5' not in (pa[i][-1], pb[j][-1]):   # a neutral tone either way isn't a slip
                    tone.append(f'{a[i]}{pa[i]}→{b[j]}{pb[j]}')
    return tone, other


LAG = 100   # ms: SenseVoice marks a character about when it starts, and its vowel, which carries the tone, comes after


def contours(d, zh):
    """Each character's pitch in one clip, from track()'s times and pitch: {index in zh: (start, end, middle, rise)},
    start, end and middle as a share of the clip's range (0 its low, 1 its high), rise in semitones. A character the
    recogniser heard as another of the same length still gets its time; one it dropped gets none."""
    import difflib
    p = np.array([np.nan if v is None else v for v in d['p']])
    v = p[~np.isnan(p)]
    if len(v) < 10:
        return {}
    lo = np.percentile(v, 10)
    span = max(np.percentile(v, 90) - lo, 4)
    hw, ht = [], []   # SenseVoice's tokens are characters, but split any longer one evenly
    for k, w in enumerate(d['w']):
        nxt = d['t'][k + 1] if k + 1 < len(d['t']) else d['end']
        for q, ch in enumerate(w):
            hw.append(ch)
            ht.append(d['t'][k] + q * (nxt - d['t'][k]) / len(w))
    ht.append(d['end'])
    at = [i for i, ch in enumerate(zh) if HAN.match(ch)]
    out = {}
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ''.join(zh[i] for i in at), ''.join(hw), autojunk=False).get_opcodes():
        if op == 'equal' or (op == 'replace' and i2 - i1 == j2 - j1):
            for i, j in zip(range(i1, i2), range(j1, j2)):
                f = p[int((ht[j] + LAG) // 10): int((ht[j + 1] + LAG) // 10)]
                f = f[~np.isnan(f)]
                f = f[2:-2] if len(f) > 6 else f   # the glides into and out of it
                if len(f) >= 4:
                    k = max(1, len(f) // 3)
                    a, z = f[:k].mean(), f[-k:].mean()
                    out[at[i]] = ((a - lo) / span, (z - lo) / span, (np.median(f) - lo) / span, z - a)
    return out


def misfit(i, f, zh, said):
    """What a character's pitch says is wrong with its tone, or '' if nothing clearly is. The times come from a
    recogniser, so this is rough: it only names clear contradictions (a third tone said high, a first low, a second
    falling, a fourth rising), set so that characters presumed right (in v4, v3 and Kokoro, where SenseVoice heard the
    character itself) rarely trip it."""
    start, end, mid, rise = f[i]
    t = said[i]
    if len(HAN.findall(zh)) < 3:   # 啊？ has no range of its own to be high or low in
        return ''
    j = i + 2 if i + 2 < len(zh) and zh[i + 1] == '儿' else i + 1
    last = j >= len(zh) or not HAN.match(zh[j])
    near_end = last or j + 1 >= len(zh) or not HAN.match(zh[j + 1])   # a phrase sinks as it ends
    if t == 3 and mid >= 0.65 and i > 0 and not (last and rise > 2):   # a line starts where it likes; a third tone at the end may rise
        return 'high'
    if t == 3 and mid >= 0.35 and j in f and said[j] == 1 and f[j][0] - mid < 0.15:   # 涨三: zhǎng sits well below 三's high start
        return 'as high as the next'
    if t == 1 and mid <= 0.25 and not near_end:
        return 'low'
    if t == 2 and rise <= -3.5:
        return 'falling'
    if t == 4 and rise >= 3:
        return 'rising'
    return ''


def charged(c):
    f = api_file(c.text, c.engine, VOICES['eleven'][c.g], c.speed, c.take).with_suffix('.json')
    return (json.loads(f.read_text())['cost'] or 0) if f.exists() else 0


def scores(lines, clips):
    import asr
    heard = json.loads((OUT / 'heard.json').read_text()) if (OUT / 'heard.json').exists() else {}
    pitch = json.loads((OUT / 'pitch.json').read_text()) if (OUT / 'pitch.json').exists() else {}
    zh = {ln['id']: ln['zh'] for ln in lines}
    kind = {ln['id']: ln['kind'] for ln in lines}
    byid = {ln['id']: ln for ln in lines}
    rows = []
    for c in clips:
        h = heard.get(c.name, {})
        r = {'f': c.file, 'e': c.engine, 'g': c.g, 'l': c.line, 't': c.take, 'm': c.mode}
        for k in ('w', 'sv'):
            if k in h:
                r[k], r[k + 'o'] = h[k], round(asr.cer(None, zh[c.line], h[k]), 2)
        if 'sv' in h:
            r['ts'], r['os'] = slips(zh[c.line], h['sv'])
        ln = byid[c.line]
        if c.name in pitch and ln.get('said'):
            f = contours(pitch[c.name], ln['zh'])
            fit = {i: misfit(i, f, ln['zh'], ln['said']) for i in f if 1 <= ln['said'][i] <= 4}
            at = [ln['zh'].index(ctx) + ctx.index(ch) for ctx, ch, *_ in ln['check']]
            # pt: each marked character's misfit ('' fits, null not measured); po: every character that misfits; pm: how many were measured
            r['pt'], r['po'], r['pm'] = [fit.get(i) for i in at], [[i, w] for i, w in fit.items() if w], len(fit)
        rows.append(r)
    sim = {}
    if (OUT / 'spk.npz').exists():
        z = np.load(OUT / 'spk.npz')
        e = z['emb'] / np.linalg.norm(z['emb'], axis=1, keepdims=True)
        sim = dict(zip(z['names'].tolist(), e))
    out = {}
    for eng in ENGINES:
        mine = [r for r in rows if r['e'] == eng and not r['m']]
        heardby = [r for r in mine if 'svo' in r]
        doubts = [r for r in heardby if r['svo'] > OFF]
        both = [r for r in doubts if r.get('wo', 0) > OFF]
        s = {'clips': len(mine), 'heard': len(heardby), 'doubts': len(doubts), 'both': len(both),
             'sv': round(float(np.mean([r['svo'] for r in heardby])), 3) if heardby else None,
             'kinds': {k: [sum(1 for r in both if kind[r['l']] == k), sum(1 for r in heardby if kind[r['l']] == k)] for k in dict.fromkeys(kind.values())},
             'model': [r['f'] for r in both if kind[r['l']] == 'model'],
             'slow': {m: [sum(1 for r in rows if r['e'] == eng and r['m'] == m and r.get('svo', 0) > OFF and r.get('wo', 0) > OFF),
                          sum(1 for r in rows if r['e'] == eng and r['m'] == m and 'svo' in r)] for m in ('slow', 'stretch')},
             'credits': sum(charged(c) for c in clips if c.engine == eng and c.paid),
             'tones': [sum(len(r['ts']) for r in heardby), sum(len(r['os']) for r in heardby),
                       sum(len(re.findall(r'[一-鿿]', zh[r['l']])) for r in heardby)],
             'tone_top': collections.Counter(f"{t} ({r['l']})" for r in heardby for t in r['ts']).most_common(12),
             # by pitch: [marked characters that misfit, marked measured, any character that misfits, any measured]
             'pitch': [sum(1 for r in mine if 'pt' in r for w in r['pt'] if w), sum(1 for r in mine if 'pt' in r for w in r['pt'] if w is not None),
                       sum(len(r['po']) for r in mine if 'po' in r), sum(r['pm'] for r in mine if 'pm' in r)]}
        if sim:
            takes, voices = [], {}
            for g in 'fm':
                vs = [sim[c.name] for c in clips if c.engine == eng and c.g == g and not c.mode and c.name in sim]
                if vs:
                    centre = np.mean(vs, axis=0)
                    centre /= np.linalg.norm(centre)
                    voices[g] = round(float(np.mean([v @ centre for v in vs])), 3)
                for ln in lines:
                    t = [sim.get(f'{eng}.{g}.{ln["id"]}.{k}') for k in range(1, TAKES + 1)]
                    t = [v for v in t if v is not None]
                    if len(t) > 1:
                        takes.append(np.mean([t[i] @ t[j] for i in range(len(t)) for j in range(i + 1, len(t))]))
            s['takes'] = round(float(np.mean(takes)), 3) if takes else None
            s['voice'] = voices
        out[eng] = s
    return rows, out


def page(lines):
    clips = [c for c in plan(lines) if wav(c).exists()]
    lines = [{**ln, **readings(ln)} for ln in lines]
    rows, summary = scores(lines, clips)
    spend = json.loads((OUT / 'spend.json').read_text()) if (OUT / 'spend.json').exists() else {'runs': []}
    charged = [json.loads(p.read_text())['cost'] for p in (CACHE / 'api').glob('*.json')]
    try:   # the account's counter lags a minute or two behind the calls, and counts anything else the account voiced meanwhile
        since = used() - spend['runs'][0]['before'] if spend['runs'] else 0
    except Exception:
        since = None
    data = {'lines': lines, 'clips': rows, 'engines': list(ENGINES), 'acts': sorted(ACTS), 'summary': summary,
            'spent': {'counter': since, 'charged': sum(c for c in charged if c), 'calls': len(charged), 'unknown': sum(1 for c in charged if c is None)}, 'off': OFF, 'slow': SLOW,
            'made': time.strftime('%Y-%m-%d %H:%M')}
    html = TEMPLATE.read_text().replace('/*DATA*/null', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
    PAGE.write_text(html)
    print(f'{PAGE.relative_to(ROOT)}: http://127.0.0.1:8791/{PAGE.relative_to(ROOT)}')


if __name__ == '__main__':
    args = sys.argv[1:]
    lines = json.loads(LINES.read_text())['lines']
    budget = next((int(a.split('=', 1)[1]) for a in args if a.startswith('--budget=')), 0)
    only = next((a.split('=', 1)[1].split(',') for a in args if a.startswith('--only=')), None)
    lines = [ln for ln in lines if not only or ln['id'] in only]
    OUT.mkdir(parents=True, exist_ok=True)
    if '--estimate' in args:
        estimate(lines)
        sys.exit()
    steps = [a for a in args if not a.startswith('--')] or ['page']
    for s in (['voice', 'hear', 'spk', 'pitch', 'page'] if steps == ['all'] else steps):
        if s == 'voice':
            voice_all(lines, budget)
        else:
            {'hear': hear, 'spk': spk, 'pitch': track, 'page': page}[s](lines)
