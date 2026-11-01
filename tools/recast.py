"""tools/recast.py: which voice says short shouted lines cleanly? Voices every short player line (≤ 7 characters) with
each candidate voice, has both recognisers (Whisper, then SenseVoice for Whisper's doubts) hear them, and ranks the
voices by how many lines both get wrong. Also tries the current model voice with the line's final ！/？ read as 。
Run: ~/.cache/kuaishuo/venv/bin/python -I tools/recast.py zf_004 zf_001 …"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asr  # noqa: E402
import voice  # noqa: E402

ROOT = voice.ROOT
data = json.loads((ROOT / 'data' / 'content.json').read_text())
lines = sorted({p['zh'] for p in data['phrases'] if len(re.sub(r'[^一-鿿]', '', p['zh'])) <= 7})
print(len(lines), 'short lines', flush=True)
cache_f = ROOT / '.cache' / 'recast.json'
heard = json.loads(cache_f.read_text()) if cache_f.exists() else {}
rows = []
for v in sys.argv[1:] + ['zf_004:period']:
    name, variant = (v.split(':') + [''])[:2]
    bad = []
    for t in lines:
        text = re.sub(r'[！？!?]+$', '。', t) if variant == 'period' else t
        x = voice.say(text, name)
        k = f'{name}|{text}'
        if k not in heard:
            heard[k] = asr.transcribe(x)
        e = asr.cer(x, t, heard[k])
        if e > 0.15:
            k2 = 'sv|' + k
            if k2 not in heard:
                heard[k2] = asr.transcribe_sv(x)
            if asr.cer(x, t, heard[k2]) > 0.15:
                bad.append(f'{t}→{heard[k2]}')
        cache_f.write_text(json.dumps(heard, ensure_ascii=False))
    rows.append((len(bad), v, bad))
    print(v, len(bad), 'wrong', bad[:6], flush=True)
print('\nranking:')
for n, v, bad in sorted(rows):
    print(f'{n:3} {v}')
