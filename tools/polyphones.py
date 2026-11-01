"""tools/polyphones.py: list every character with more than one common reading, in context, with the reading the build
gave it, so a person can check the pinyin (and so the voice) in a minute. Fix wrong ones in tools/pinyin_fix.json.
Run after a build: python3 tools/polyphones.py [char...]"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WATCH = set(sys.argv[1:] or '还得着了行长重好便差为当觉干发都种数只少空调地和处落倒背血削率传藏乐教假间结系应朝曾难没喝累相看分泊吐尽称冲兴参会缝几将强觉圈卷片')
data = json.loads((ROOT / 'data' / 'content.json').read_text())
seen = {}


def visit(sid, d):
    if isinstance(d, list):
        for x in d:
            visit(sid, x)
    elif isinstance(d, dict):
        if isinstance(d.get('t'), list) and isinstance(d.get('zh'), str):
            for tok in d['t']:
                if len(tok) < 2:
                    continue
                w, py = tok[0], tok[1].split()
                for i, c in enumerate(w):
                    if c in WATCH and i < len(py):
                        key = (c, py[i], w)
                        seen.setdefault(key, []).append(f"{sid}: {d['zh']}")
        for k, v in d.items():
            if k != 't':
                visit(sid, v)


for s in data['scenarios']:
    visit(s['id'], s['steps'])
    for k, v in s.items():
        if k not in ('steps', 't', 'cast'):
            visit(s['id'], v)
for (c, py, w), where in sorted(seen.items()):
    print(f'{c} {py:6} in {w:6} ×{len(where):<2} e.g. {where[0]}')
