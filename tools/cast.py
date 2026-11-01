"""tools/cast.py: audition every Kokoro Chinese voice so the build can cast characters without anyone listening.

Each voice reads the same two lines; we keep its pitch and pace, and (with --asr) how well a speech recogniser
understands it. `voices.json` then maps each role (m-old … kid) to the clearest voices in the right pitch range.
Run: ~/.cache/kuaishuo/venv/bin/python -I tools/cast.py [--asr]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import voice  # noqa: E402

LINES = ['你好，请问去火车站怎么走？我有点儿着急。', '算了，我还是自己打车吧，谢谢你啊。']
OUT = voice.ROOT / '.cache' / 'cast.json'


def main():
    from huggingface_hub import list_repo_files
    names = sorted(f[7:-3] for f in list_repo_files(voice.REPO) if f.startswith('voices/z') and f.endswith('.pt'))
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    for v in names:
        if v in data:
            continue
        xs = [voice.say(t, v) for t in LINES]
        dur = sum(len(x) for x in xs) / voice.SR
        data[v] = {'f0': round(sum(voice.f0(x) for x in xs) / len(xs)), 'secs': round(dur, 2), 'cps': round(sum(len(t) for t in LINES) / dur, 2)}
        OUT.write_text(json.dumps(data, indent=1))
        print(v, data[v], flush=True)
    if '--asr' in sys.argv:
        import asr
        for v in names:
            if 'cer' in data[v]:
                continue
            data[v]['cer'] = round(sum(asr.cer(voice.say(t, v), t) for t in LINES) / len(LINES), 3)
            OUT.write_text(json.dumps(data, indent=1))
            print(v, 'cer', data[v]['cer'], flush=True)


if __name__ == '__main__':
    main()
