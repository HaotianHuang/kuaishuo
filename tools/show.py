"""tools/show.py: print scenarios as a script, for reading the Chinese through quickly. python3 tools/show.py [ids...]"""
import json, sys
from pathlib import Path
SRC = Path(__file__).resolve().parent.parent / 'content' / 'src'

def steps(l, d=0):
    for st in l or []:
        p = '  ' * d
        if 'who' in st: print(f"{p}{st['who']}: {st['zh']}  | {st['en']}")
        elif 'narr' in st: print(f"{p}[{st['narr']}] {st.get('zh', '')}")
        elif 'sfx' in st: print(f"{p}<{st['sfx']}>")
        elif 'end' in st: print(f"{p}END {st['end']}: {st['en']} {st.get('zh', '')}")
        elif 'say' in st:
            b = st['say']
            print(f"{p}>> SAY ({b['en']}) {' / '.join(b['answers'])}  need={b['need']}")
            if b.get('ok'): print(f'{p}  ok:'); steps(b['ok'], d + 2)
            if b.get('fail'): print(f'{p}  fail:'); steps(b['fail'], d + 2)
            for a in b.get('alts', []): print(f"{p}  alt ({a['en']}) {' / '.join(a['answers'])}"); steps(a.get('then'), d + 2)

for f in sorted(SRC.glob('*.json')):
    s = json.loads(f.read_text())
    if len(sys.argv) > 1 and s['id'] not in sys.argv[1:]: continue
    print(f"\n=== {s['id']} ({s['format']}, L{s['level']}) {s['title']} / {s['title_en']} — {s['setting']}")
    extra = {k: v for k, v in s.items() if k not in ('id', 'format', 'title', 'title_en', 'level', 'tags', 'setting', 'stage', 'bg', 'cast', 'steps')}
    if extra: print('extra:', json.dumps(extra, ensure_ascii=False)[:400])
    steps(s['steps'])
