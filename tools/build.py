"""tools/build.py: content/src/*.json and content/messages/*.json → data/content.json, audio/<id>-<hash>.mp4, data/py.json,
data/strokes.json.

1. validate (tools/validate.mjs)
2. pinyin, words and an English gloss for every Chinese text (pypinyin + jieba + CC-CEDICT, fixes in pinyin_fix.json)
3. voice every line (tools/voice.py, cached) and pack one audio file per scenario, with each clip's [start, length]
4. measure every line: the say level `lv` of each beat and level override, each scenario's `listen` level and `lis`,
   the features the learner model starts from (`f` on each phrase), all listed in review/levels.md
5. with --qa, play every clip to a speech recogniser (tools/asr.py) and list the ones that come back wrong

What gets a voice: anything with `zh` and a `who` in the cast (that person), `narr` or `end` with `zh` (the narrator),
and the first answer of every `say`, `alts` entry and level override (the model voice, at normal and slow speed).
Every other `zh` is glossed but silent.

Someone from the world (content/world.json) has one voice in every story and message; content.json carries the world's
places and cast for the contacts page (`world`), and the messages characters send between visits (`messages`).

Drafts never ship: a scenario or a level override with "status": "draft" is left out of data/ and audio/. --out builds
everything, drafts too, into <dir>/data, <dir>/audio, <dir>/levels.md and <dir>/qa.md (review/gate/<batch>, for the
owner to play), next to the live catalogue; data/ and audio/ aren't touched.

Run: ~/.cache/kuaishuo/venv/bin/python -I tools/build.py [--qa] [--only=id,id] [--out=review/gate/<batch>]
     … --engine=elevenlabs --estimate   what ElevenLabs voices would cost (characters ≈ credits), calling nothing
     … --engine=elevenlabs              voice with ElevenLabs instead (ELEVENLABS_API_KEY; ELEVENLABS_MODEL, eleven_v4 is the
                                        bake-off's pick; each Kokoro voice's stand-in in voices.json → elevenlabs.stand_in)
"""
import math
import datetime
import hashlib
import json
import re
import subprocess
import sys
import time
import unicodedata
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import voice  # noqa: E402

ROOT = voice.ROOT
SRC, DATA, AUDIO, CACHE = ROOT / 'content' / 'src', ROOT / 'data', ROOT / 'audio', ROOT / '.cache'
SERIES, REVIEW = ROOT / 'content' / 'series', ROOT / 'review'   # REVIEW, DATA and AUDIO move under --out
WORLD, MESSAGES = ROOT / 'content' / 'world.json', ROOT / 'content' / 'messages'
estimate_total = [0]
GAP = 0.3          # silence between clips in a pack, so a slightly early or late seek never clips a word
SLOW = 0.78        # speed of the slow model answer
HAN = re.compile(r'[一-鿿]')


# ---------- pinyin, words, glosses ----------

FIXES = {k: v for k, v in json.loads((ROOT / 'tools' / 'pinyin_fix.json').read_text()).items() if not k.startswith('_')}

# What a word means in our lines, where CC-CEDICT's first senses mislead (别 'to leave', 把 'to hold a baby in position to
# help it urinate', 打 'to hit' in 打个电话, 几号 'heroin') or say nothing (了, 吗), and words it lacks. Asked before the
# dictionary; the first sense is what the hint key shows. A 'word reading' key is one reading of a polyphone; 'word after
# X' is the word right after the word X, 'word before X' right before it ('word before adj': before any adjective).
GLOSS = {
    '下来': 'to come down; (after a verb) down (towards here)', '报警': 'to call the police', '哪': 'which; where', '哪边': 'which way; which side', '心意': 'a kind thought; a small token (of thanks)', '叔叔': "uncle (a man your parents' age)", '阿姨': "auntie (a woman your parents' age)", '钱': 'money', '份': '(measure word: a portion, a copy)', '接着': 'to carry on (doing); next; to catch', '年': 'year', '保安': 'security guard', '混口饭吃': 'to scrape a living', '证明不了': "can't prove (it)", '指望不上': "can't count on", '等不到': 'waits in vain (for)', '别提了': "don't ask; say no more",
    '五号 before 楼': 'No. 5 (Building 5)', '网名': 'online name', '抄近道': 'to take a shortcut', '您好': 'hello (polite)', '那就好': "that's good, then",
    '二号': 'number 2; the 2nd (of the month)', '好好好': 'OK, OK, OK! (fine, fine)',
    '修不修': 'fix (it) or not', '做不了': "can't do (it)",
    # particles
    '了': 'done; now (a change)', '吗': '(makes a yes-no question)', '吧': "(suggests: let's…, …OK?; I suppose)",
    '呢': '(what about…?; still going on)', '呀': '(friendly: ah, oh)', '啊': '(adds feeling: ah, oh)', '啊 a2': "huh? (didn't catch that; surprised)", '哟': 'oh!',
    '嘛': "(it's obvious; come on)", '啦': '(了 + 啊: it has happened!)', '呗': '(a shrug: just…; why not)',
    '嘞': '(cheerful: 好嘞 you got it!)', '哈': 'ha; (friendly: OK?)', '嗯': 'mm; yeah', '哎': 'hey!; oh',
    '喂 wei2': 'hello? (on the phone); hey!', '喂 wei4': 'to feed', '的': "'s; (the one) that", '个': '(measure word: a, one)',
    '得 de5': '(verb + 得 + how: 跑得快 runs fast)', '着 zhe5': '(-ing: going on, or in a state)',
    '着 zhao2': '(got it: 抓着 caught, 睡着 asleep)', '过 guo5': '(after a verb) have done before; over, past',
    # function words
    '别': "don't", '太': 'too; so (very)', '把': '(puts the object before the verb); (measure word: keys, chairs)', '就': 'just; then; right away',
    '才': 'only; only then', '还 hai2': 'still; also; even', '还 huan2': 'to give back', '给': 'to give; for; to',
    '在': 'to be at; at; in; (be) doing', '被': '(passive: by)', '跟': 'with; to (sb)', '往': 'towards', '让': 'to make way; to let',
    '可': 'but; really', '刚': 'just (now)', '快': 'quick!; almost', '连': 'even (连…都); to connect', '那': 'that; then (so)',
    '得 dei3': 'must; have to', '想': 'to miss (sb); to want to; to think', '点': "o'clock; a bit; to order (food)",
    '啥': 'what (= 什么)', '咋': 'how; why (= 怎么)', '来': 'to come; to bring; (I) will have', '行 xing2': 'OK; fine; to work',
    '当 dang4': 'to treat as; as if', '冲 chong4': 'at; towards (sb)', '一起': 'together', '不会': "can't; won't",
    '还是': 'or (in a question); still; had better', '那个': 'that one; um… (stalling)', '点儿': 'a bit; a little',
    '早点': 'a bit earlier; early', '千万': 'by all means (千万别: never ever)', '别说': "don't say (it); not to mention",
    '别管': 'leave (it) alone; never mind', '等等': 'wait!; and so on', '走开': 'go away!', '不多': 'not much',
    '第': '(makes an ordinal: 第一 first)', '幺': 'one (in phone and room numbers)',
    # verbs, measure words and other words whose first sense is another word
    '打': 'to make (a call); to hit', '关': 'to turn off; to close', '等': 'to wait', '包': 'bag; to wrap (dumplings)',
    '挂': 'to hang up (the phone); to hang', '订': 'to book; to order', '抢': 'to snatch; to rob', '穿': 'to wear; to put on',
    '装': 'to pretend; to put in', '凑': 'to move close', '挣': 'to earn', '带': 'to bring; to carry; to take along',
    '端': 'to carry (level); to serve', '响': 'to ring; to sound', '干 gan4': 'to do', '折': '(a discount: 打八折 20% off); to break',
    '赞': 'a like (on social media); to praise', '话': 'words; what (sb) says', '祝': 'to wish (sb well)',
    '宅': 'to stay in (at home)', '阀': 'valve', '网': 'internet; net', '里': 'inside; in', '后': 'after; behind',
    '过去 guo4 qu5': 'over (there)', '顿': '(measure word for meals)', '号': 'number; day of the month',
    '只 zhi1': '(measure word for animals)', '条': '(measure word: fish, roads, messages)', '块': 'yuan (money); piece',
    '楼': 'floor; building', '位': '(polite measure word for people)', '地 di4': 'floor; ground', '几号': 'what number; what date',
    '一口': 'a mouthful; a bite', '一把': 'in one grab', '一手': 'one hand (…the other)', '一头': 'headfirst; one head',
    '事儿': 'thing; matter', '礼拜': 'week', '实在': 'really; honest', '死活': 'no matter what; life or death',
    '同学': 'classmate; (to a young person) you', '对象': 'boyfriend or girlfriend', '机场': 'airport',
    '高速': 'expressway; high speed', '开车': 'to drive', '前台': 'front desk', '酒店': 'hotel', '内线': 'inside (phone) line',
    '警号': "police officer's number", '包裹': 'parcel', '打错': 'to dial the wrong number', '老板': 'boss; owner',
    '大叔': 'uncle (an older man)', '大爷': 'grandpa, uncle (an old man)', '大妈': 'auntie (an older woman)',
    '师傅': 'driver; master (to a skilled worker)', '特辣': 'extra spicy', '够花': 'enough to spend',
    '快递柜': 'parcel locker', '家门口': 'doorstep', '一大家子': 'the whole big family', '往下流': 'flows down',
    '睡得正香': 'sound asleep', '哪位': 'who (polite)', '小桥': 'little bridge', '猴王': 'the boss monkey',
    '拍': 'to take (a photo); to pat', '发给': 'to send to', '一般': 'usually; ordinary', '水池': 'sink; pool',
    '撇 pie3': 'left-falling stroke (丿)', '太好了': 'great!', '好的': 'OK',
    # in context
    '信 after 别': 'to believe', '信 after 不': 'to believe', '好 after 就': 'ready; fine', '好 after 马上': 'ready',
    '好 before adj': 'so (very)', '好 before 想': 'so (much)', '不客气 after 就': "won't hold back (I'll help myself)",
    # phrases a need word spans, for the hint key (keys()): 是我 "it's me", not 'to be I'
    '是我': "it's me", '没看到': "didn't see", '听不太清楚': "can't hear (you) very clearly", '还早': "it's still early",
    '八字还没一撇': "it's early days (not one stroke of 八 yet)", '没一撇': 'not one stroke yet', '早说': 'to say so earlier',
    '早知道': "if (I'd) known earlier", '没到': "hasn't come (yet)", '别慌': "don't panic", '您说': 'go ahead (lit. you say)',
    '没订': "didn't book", '不着急': "(there's) no hurry", '听我说': 'listen to me', '再说一遍': 'to say (it) again',
    '太多': 'too much; too many', '吓死': 'to scare to death', '借我': 'to lend me', '牵走': 'to lead (it) away',
    '抢钱': 'to rob (sb); a rip-off', '吃了': '(have) eaten', '来一份': "(I'll) have one", '放门口': 'to leave (it) at the door',
    '少涨': 'to raise (it) less', '续一年': 'to renew for a year', '正在改': 'to be fixing (it) right now',
    '接着聊': 'to keep chatting', '问小雨': 'to ask Xiaoyu', '带鹅': 'to bring a goose', '鹅是我': 'the goose is (mine)',
    # names (CC-CEDICT leaves out its surname senses: 王 is 'king', 李 'plum')
    '王': 'Wang (a surname); king', '李': 'Li (a surname); plum', '张': 'Zhang (a surname); (measure word: sheets)',
    '老': 'old; always (别老… stop always…); (before a surname: friendly)', '老王': 'Old Wang (friendly)',
    '老李': 'Old Li (friendly)', '小李': 'Xiao Li (a name)', '王总': 'Boss Wang', '张总': 'Boss Zhang', '王叔': 'Uncle Wang', '王家': 'the Wang family', '大白': 'Dabai (a name)',
    '小林': 'Xiaolin (a name)', '小雨': 'Xiaoyu (a name)', '小鹿': 'Xiaolu (a name)', '小宝': 'Xiaobao (a pet name: little treasure)',
    '煤球': 'Meiqiu (the cat: coal ball)', '大舅': "uncle (mum's eldest brother)", '三舅': "uncle (mum's third brother)",
    '二姨': "auntie (mum's second sister)", '三姨': "auntie (mum's third sister)",
    # chunks kept whole (a 'can' or 'can't' complement, an either-or question)
    '进不了': "can't get in", '进不去': "can't get in", '打不了': "can't make (a call)", '来不了': "can't come", '扫不了': "can't scan",
    '拿得动': 'can carry (it)',
    '走不了': "can't leave", '牵不动': "can't pull (it) along", '停不下来': "can't stop", '急不来': "can't be rushed",
    '听不清': "can't hear clearly", '听不清楚': "can't hear clearly", '说不清': "can't say clearly", '听得到': 'can hear',
    '找得到': 'can find', '看得到': 'can see', '厉不厉害': 'how bad (is it)?', '要不要': 'do (you) want…?', '能不能': 'can (you)…?',
    '行不行': 'OK? (or not)', '多不多': 'a lot? (or not)',
}
# Words jieba cuts in two that a learner meets as one (快递 柜 is a parcel locker, 借 过 'excuse me'), and words it
# glues across a boundary (风把门关上 is 把 门, not 把门 'to keep goal'; 穿着拖鞋 is 穿 着, not 穿着 'attire').
JOIN = {'快递柜', '猫条', '叫醒服务', '广场舞', '变态辣', '打酱油', '包饺子', '睡过头', '借过', '等一下', '稍等', '什么时候',
        '没问题', '别客气', '慢慢吃', '听清', '听得见', '塞给', '穿上', '吃完', '清汤', '知道了', '怎么了', '什么事', '这就',
        '看情况', '不一定', '着呢', '不对', '没办法', '小李', '哪边', '别提了', '网名', '抄近道', '太好了', '好好好'}
OPEN = {'好的'}   # glued only as a whole clause: 好的，… and 好的！ are 'OK'; in 很好的人 and 好的人 it's 好 'good' + 的
SPLIT = {'把门', '穿着', '不等', '才能', '一把抓'}
NUM = '零一二三四五六七八九十百千万两几幺'
TIME = {'分钟': 'minute', '秒钟': 'second', '秒': 'second', '小时': 'hour', '个小时': 'hour', '天': 'day', '年': 'year',
        '个月': 'month', '星期': 'week'}
# compound directional complements, whose last syllable is neutral (过来 guòlai, 爬出来 pá chūlai)
DIR2 = {'起来', '下去', '出来', '进来', '过来', '回来', '上来', '下来', '上去', '出去', '进去', '回去', '过去'}
# one-syllable verbs said twice to soften them, the second time toneless (看看 kànkan, 等等 děngdeng)
TWICE = set('看等试想听说问走尝聊找写读坐歇玩帮动摸闻洗擦转逛练学讲谈查算猜瞧敲揉拍抱笑让压劝夸碰理修换改弄搞数')
# verbs of carrying and moving, whose 来 and 去 are a direction (拿来 nálai, 拿去 náqu); a 来 or 去 after anything else
# is a verb of its own (我是来喝汤的, 我想去)
MOVE = set('拿带送寄发传搬递抬扛扔推拉抱牵领端跑走飞冲爬跳追退')
CALL = re.compile(r'(?<![一-鿿])喂+(?![一-鿿])')   # 喂 between pauses is a call, the phone's wéi (喂？, 喂，您好); 喂猫 and 别喂！ 'feed' are wèi


def setup_text():
    import jieba
    from pypinyin import load_phrases_dict
    from pypinyin.constants import PHRASES_DICT
    odd = [k for k, v in FIXES.items() if len(v.split()) != len(k)]
    if odd:   # pypinyin lines a phrase's readings up with its characters, one each
        raise SystemExit(f"tools/pinyin_fix.json: one syllable per character ({', '.join(odd)})")
    jieba.setLogLevel(60)
    voice.pipeline()   # first: the voice loads pypinyin's large phrase list, and our fixes must land on top of it
    # 谁 is shéi in speech (pinyin_fix.json), in the phrases pypinyin knows too (谁家 has shuí); the judge hears both
    shei = {p: [['shéi'] if c == '谁' else r for c, r in zip(p, rs)] for p, rs in PHRASES_DICT.items() if '谁' in p and len(p) == len(rs)}
    load_phrases_dict({**shei, **{phrase: [[p] for p in py.split()] for phrase, py in FIXES.items()}})   # in one go: each load retrains pypinyin's segmenter
    for phrase in FIXES:
        if len(phrase) > 1:   # a character is a word of its own already; one made that common would cut 谁家 in two
            jieba.add_word(phrase, freq=200000)
    ced = {}
    for line in open(CACHE / 'cedict_ts.u8', encoding='utf8'):
        m = re.match(r'(\S+) (\S+) \[([^\]]+)\] /(.+)/', line)
        if m:
            ced.setdefault(m[2], []).append((m[3].lower().replace('u:', 'v'), m[4].split('/')))
    return ced


# words whose 儿 is a syllable of its own (a child), not the erhua ending of 哪儿, 一点儿, 玩儿
REAL_ER = {'女儿', '婴儿', '幼儿', '孤儿', '男儿', '健儿', '宠儿', '胎儿', '患儿', '少儿', '儿', '侄儿', '孙儿', '育儿'}
SKIP_DEF = ('CL:', 'variant of', 'old variant', 'see ', 'used in', 'surname ', 'abbr. for', 'abbr. to', 'erhua variant', 'Taiwan pr.', 'also pr.')


def gloss(ced, w, num, near=('', '')):
    """Our own meaning (GLOSS: next to the words around it, near, for this reading, or at all), or CC-CEDICT's first two
    senses for the reading the word has here ('bie2' …)."""
    before, after = near
    for k in (before and f'{w} after {before}', after and f'{w} before {after}', after and verb(after, ('a',)) and f'{w} before adj', f'{w} {num}', w):
        if k in GLOSS:
            return GLOSS[k]
    es = ced.get(w)
    if not es:
        if len(w) == 4 and w[0] == w[1] and w[2] == w[3] and w[::2] in ced:   # 清清楚楚: 清楚 said twice over
            return 'very ' + gloss(ced, w[::2], '').split(';')[0]
        return amount(ced, w) or number(w)
    useful = lambda e: sum(not d.startswith(SKIP_DEF) for d in e[1])   # 辣 has an 'old variant of 辣' entry too
    same = [e for e in es if e[0].replace(' ', '') == num.replace(' ', '') and useful(e)]   # 过来 guo4 lai5 is a 'see'
    e = max(same or es, key=useful)
    defs = [d for d in e[1] if not d.startswith(SKIP_DEF)]
    if not defs:   # 一点儿 is an 'erhua variant of 一點|一点[yi1 dian3]', 差一点 'see 差點|差点[cha4 dian3]': use that word's
        m = re.match(r'(?:erhua )?(?:variant of|see(?: also)?|abbr\. for) (?:[^|\[]*\|)?([^\[|]+)\[', e[1][0])
        if m and m[1] != w:
            return gloss(ced, m[1], '')
        defs = e[1]

    def plain(d, first):   # '(coll.) if' → 'if'; a first sense that is all aside keeps it ('(completed action marker)')
        s = d
        while re.search(r'\([^()]*\)', s):
            s = re.sub(r'\s*\([^()]*\)', '', s)
        s = s.strip() or (d.strip(' ()') if first else '')
        return re.sub(r'(?:[^\s|\[\]]+\|)?([^\s|\[\]]+)\[[^\]]*\]', r'\1', s)   # 長沙市|长沙市[Chang2 sha1 Shi4] → 长沙市
    return '; '.join([s for s in (plain(d, not i) for i, d in enumerate(defs)) if s][:2])[:70]


def amount(ced, w):
    """十分钟 → 'ten minutes': a number and a unit of time are one word to a learner (cut, 十分 'very' + 钟 'a bell')."""
    n = len(w) - len(w.lstrip(NUM))
    unit, k = TIME.get(w[n:]), w[:n]
    if not 0 < n < len(w) or not unit or not (k in ced or k == '几'):
        return ''
    k = 'a few' if k == '几' else gloss(ced, k, '').split(';')[0]
    return f"{k} {unit}{'' if k == 'one' else 's'}"


DIGIT = dict(zip('零幺一二两三四五六七八九', '011223456789'))


def number(w):
    """A number in figures, where its characters' meanings would read as nonsense: 八零二 → '802' (a room, said digit by
    digit), 三号 → 'number 3', 七点 → "7 o'clock", 七点半 → 'half past 7', 点半 → 'half past'."""
    m = re.fullmatch(r'([零幺一二三四五六七八九]+|两|[一二三四五六七八九]?十[一二三四五六七八九]?)?(号|点|点半)?', w)
    if not m or len(w) < 2:
        return ''
    a, ten, b = (m[1] or '').partition('十')
    n = str(int(DIGIT.get(a, 1)) * 10 + int(DIGIT.get(b, 0))) if ten else ''.join(DIGIT[c] for c in m[1] or '')
    return {None: n, '号': f'number {n}', '点': f"{n} o'clock", '点半': f'half past {n}'}[m[2]].strip()


MARKS = {'a': 'āáǎà', 'e': 'ēéěè', 'i': 'īíǐì', 'o': 'ōóǒò', 'u': 'ūúǔù', 'ü': 'ǖǘǚǜ'}


def marked(s):
    """'bu4' → 'bù'. The voice's front end loads some numbered readings into pypinyin, so a few come back numbered."""
    m = re.fullmatch(r'([a-zü:v]+?)([1-5])', s)
    if not m:
        return s
    b, t = m[1].replace('v', 'ü').replace('u:', 'ü'), int(m[2])
    if t == 5:
        return b
    i = b.index('a') if 'a' in b else b.index('e') if 'e' in b else b.index('o') if 'ou' in b else max(b.rfind(v) for v in 'iouü')
    return b[:i] + MARKS[b[i]][t - 1] + b[i + 1:]


def tone(s):
    for ch, t in (('āēīōūǖ', 1), ('áéíóúǘ', 2), ('ǎěǐǒǔǚ', 3), ('àèìòùǜ', 4)):
        if any(c in s for c in ch):
            return t
    return 5


def toneless(s):
    """'shàng' → 'shang', 'lǚ' → 'lü': the neutral tone."""
    return unicodedata.normalize('NFC', ''.join(c for c in unicodedata.normalize('NFD', s) if c not in '\u0300\u0301\u0304\u030c'))


def numbered(s):
    """'shàng' → 'shang4', 'shang' → 'shang5', as CC-CEDICT writes readings."""
    return toneless(s).replace('ü', 'v') + str(tone(s))


def sandhi(syls):
    """Mark the tone changes of 一 and 不 that learners are taught to say (bú shì, yí ge, yì diǎn)."""
    nums = set('零一二三四五六七八九十百千万两几第')
    out = list(syls)
    for i, (ch, s) in enumerate(syls):
        nxt = syls[i + 1] if i + 1 < len(syls) else None
        if ch == '不' and s == 'bù' and nxt and tone(nxt[1]) == 4:
            out[i] = (ch, 'bú')
        elif ch == '一' and s == 'yī' and nxt and HAN.match(nxt[0]):
            prev = syls[i - 1][0] if i else ''
            if prev in nums or nxt[0] in nums - {'几'}:
                continue
            if nxt[0] in '月号楼层年':
                continue
            out[i] = (ch, 'yí' if tone(nxt[1]) in (4, 5) else 'yì')
    return out


def split_known(ced, w, marks):
    """A word CC-CEDICT doesn't know, as the longest words it does know (keeping each character's reading); a
    direction at the end comes off first (掉下来 → 掉 下来, not 掉下 'to drop' + 来)."""
    end = len(w) - 2 if len(w) > 2 and w[-2:] in DIR2 else len(w)
    out, i = [], 0
    while i < end:
        for n in range(min(4, end - i), 0, -1):
            p = w[i:i + n]
            if n == 1 or (p in ced or p in GLOSS) and p != w:
                out.append((p, marks[i:i + n]))
                i += n
                break
    return out + ([(w[end:], marks[end:])] if end < len(w) else [])


def verb(w, kinds=('v',)):
    """jieba's dictionary calls w a verb (or one of `kinds`: 'a' adjectives)."""
    import jieba.posseg
    return jieba.posseg.dt.word_tag_tab.get(w, '').startswith(kinds)


def whole(ced, w):
    """A word CC-CEDICT lacks that stays in one piece: one of ours, an amount of time (十分钟), AABB (清清楚楚), or a
    chunk best learnt whole: a 'can' or 'can't' (进不去, 听得到) or an either-or question (要不要)."""
    return (w in GLOSS or bool(amount(ced, w)) or len(w) == 4 and w[0] == w[1] and w[2] == w[3]
            or bool(re.fullmatch(r'(.)[不没]\1.*', w)) or bool(re.fullmatch(r'.[不得].{1,2}', w)) and verb(w[0]))


def cut(ced, text):
    """text → [(word, its readings, or None for punctuation)]: jieba's words, each read whole so a polyphone gets its
    reading from the full context, then cut or glued where jieba's word isn't the one a learner would look up."""
    import jieba
    from pypinyin import Style, pinyin
    pieces = []
    for w in jieba.cut(text):
        if not HAN.search(w):
            pieces.append((w, None))
            continue
        marks = [marked(x[0]) for x in pinyin(w, style=Style.TONE, errors=lambda c: [c])]
        if len(marks) == len(w) and len(w) > 1 and (w in SPLIT or w not in ced and not whole(ced, w)):
            pieces += split_known(ced, w, marks)   # 吃火锅 → 吃 火锅, 我点 → 我 点, 别着急 (glued for its reading) → 别 着急
        else:
            pieces.append((w, marks))
    out = []
    for k, (w, m) in enumerate(pieces):
        p = out[-1] if out and out[-1][1] and m else None
        pp = out[-2] if p and len(out) > 1 and out[-2][1] else None
        if pp and pp[0] + p[0] + w in JOIN:   # 听得 (a reading fix, split) + 见
            out[-2:] = [(pp[0] + p[0] + w, pp[1] + p[1] + m)]
        elif p and (p[0] + w in JOIN or p[0] + w in OPEN and not pp and not (k + 1 < len(pieces) and pieces[k + 1][1]) or amount(ced, p[0] + w) and not (pp and pp[0][-1] in NUM)):   # not 一九九 五年
            out[-1] = (p[0] + w, p[1] + m)
        elif p and len(w) == 2 == len(m) and w[0] == '个' and (p[0][-1] in '着了' or verb(p[0])):   # 坐着个人, 说个数
            out += [(w[0], m[:1]), (w[1], m[1:])]
        elif p and p[0] == '不' and len(w) == 3 == len(m) and w[0] == w[2] and w[1] == '不':   # 不 多不多 is 不多 不多
            out[-1:] = [(p[0] + w[0], p[1] + m[:1]), (w[1:], m[1:])]
        else:
            out.append((w, m))
    return out


def neutral(ced, pieces):
    """The neutral tones learners are taught and dictionaries mostly leave out, set in [(word, readings)]: a verb said
    twice (看看 kànkan, 看一看), the 不 of a question or a 'can't' (是不是, 说不清), 个 (一个 yí ge), a direction after a
    verb (过来 guòlai, 关上 guānshang, 拿去 náqu), the 上 and 面 of a place (地上 dìshang, 前面 qiánmian), 过 and 得 after a
    verb (吃过, 爬得高). And 别 is always bié: biè is only 别扭; a call is wéi (CALL: 喂？, 喂，您好)."""
    def soft(m, i):
        m[i] = toneless(m[i])
    acts = lambda w: verb(w) or any(e[1][0].startswith('to ') for e in ced.get(w, [])[:1])   # 问 is tagged a noun
    # a 上 or 下 CC-CEDICT reads neutral (地上, 底下), or one that finishes a verb (关上 'to close', 坐下 'to sit down')
    lexical = lambda w: any(e[0].endswith('5') or e[1][0].startswith('to ') for e in ced.get(w, []))
    at = [0]   # where each word starts in the line
    for w, _ in pieces:
        at.append(at[-1] + len(w))
    calls = {i for x in CALL.finditer(''.join(w for w, _ in pieces)) for i in range(*x.span())}
    for k, (w, m) in enumerate(pieces):
        if not m or len(m) != len(w):
            continue
        m[:] = ['wéi' if at[k] + i in calls else x for i, x in enumerate(m)]
        p = pieces[k - 1][0] if k and pieces[k - 1][1] else ''
        pp = pieces[k - 2][0] if k > 1 and pieces[k - 2][1] else ''
        for i, c in enumerate(w):
            if c == '别' and '别扭' not in w:
                m[i] = 'bié'
            elif c == '个' and m[i] == 'gè' and (i or len(w) == 1) and w not in ('整个', '各个'):
                soft(m, i)
            elif c == '不' and i == 1 and len(w) in (3, 4) and w[0] != w[2] and ['bu4'] not in (e[0].split()[1:2] for e in ced.get(w, [])):
                soft(m, i)   # 说不清, 停不下来 (but 要不然 is yào bù rán)
        if w[-2:] in DIR2 and not (len(w) > 2 and w[-3] in '不得') and (w != '过去' or len(p) == 1 and acts(p) or p == '了' and acts(pp)):
            soft(m, len(w) - 1)   # 过去 is guòqù, the past, unless it's after a verb (走过去)
        elif len(w) == 2 and (w[1] in '上下' and lexical(w) or w[1] in '来去' and w[0] in MOVE or w[1] == '面' and w[0] in '上下前后里外左右'):
            soft(m, 1)
        elif w == '上' and p and p not in ('想', '要', '能', '会', '可以', '得', '该', '敢', '肯') and (verb(p, ('n', 's', 'v', 'a')) or len(p) == 1 and acts(p)):
            soft(m, 0)   # 腿上, 跳上出租车 (but not 到底上不上, where it's the verb)
        elif w in ('来', '去') and p != w and (p in MOVE or len(p) == 2 and p[1] in '上下进出回过起' and acts(p)):
            soft(m, 0)   # 拿去, 端上 来
        elif w == '过' and p and acts(p) or w == '得' and m[0] == 'dé' and p and (acts(p) or verb(p, ('v', 'a'))):
            soft(m, 0)   # 吃过, 爬得更高
    seq = []
    for w, m in pieces:   # every syllable in order, None between clauses
        seq += [(c, m, i) for i, c in enumerate(w)] if m and len(m) == len(w) else [None]
    for j in range(1, len(seq)):
        a, b, c, z = seq[j - 1], seq[j], seq[j + 1] if j + 1 < len(seq) else None, seq[j - 2] if j > 1 else None
        if not (a and b):
            continue
        if a[0] == b[0] in TWICE and (b[1] is a[1] or len(b[1]) == 1) and not (z and z[0] == b[0]) and not (c and c[0] == b[0]):
            soft(b[1], b[2])   # 看看, 说说
        elif c and b[0] in '一不没' and a[0] == c[0] != b[0] and (b[0] != '一' or a[0] in TWICE) and not (z and z[0] == b[0]):
            soft(b[1], b[2])   # 看一看, 是不是, 有没有 (but 不贵不贵, 没有没有 are said twice)


def around(ws, i, j=None):
    """The words just before ws[i] and just after ws[j] (or ws[i]), for gloss(); '' at a clause's edge (ws has '' for
    punctuation)."""
    j = i if j is None else j
    return ws[i - 1] if i else '', ws[j + 1] if j + 1 < len(ws) else ''


def annotate(ced, text):
    """→ (pinyin string, tokens). A token is [word] for punctuation, or [word, pinyin, gloss]."""
    pieces = [(w, m and list(m)) for w, m in cut(ced, text)]
    neutral(ced, pieces)
    for k, (w, m) in enumerate(pieces):   # 啊 on its own before a ？ is the interjection á, 'huh?' (啊？你说啥？), not the particle
        if w == '啊' and m and (k == 0 or pieces[k - 1][1] is None) and k + 1 < len(pieces) and pieces[k + 1][0].strip().startswith(('？', '?')):
            m[0] = 'á'
    flat, spans = [], []
    for w, marks in pieces:
        if marks is not None:
            spans.append((len(flat), len(marks)))
            flat += list(zip(w if len(marks) == len(w) else [w] * len(marks), marks))
        else:
            spans.append(None)
    flat = sandhi(flat)
    toks, pys, ws = [], [], [w if m is not None else '' for w, m in pieces]
    for k, ((w, read), sp) in enumerate(zip(pieces, spans)):
        if sp is None:
            toks.append([w])
            if w.strip() and pys:
                pys[-1] += w.strip()
            continue
        marks = [s for _, s in flat[sp[0]:sp[0] + sp[1]]]
        if len(marks) > 1 and w.endswith('儿') and w not in REAL_ER:   # erhua: 哪儿 is one syllable, nǎr
            marks = marks[:-2] + [marks[-2] + 'r']
        num = ' '.join(map(numbered, read))   # as CC-CEDICT writes it: neutral tones in, but 一 and 不 before sandhi
        g = gloss(ced, w, num, around(ws, k))
        if not g and len(w) > 1:
            g = ' · '.join(filter(None, (gloss(ced, c, n).split(';')[0] for c, n in zip(w, num.split()))))
        toks.append([w, ' '.join(marks), g])
        pys.append(''.join(marks))
    return ' '.join(pys), toks


def lint(ced, scn):
    """Stop the build on a 别 that isn't bié (biè is only 别扭). Return the words CC-CEDICT reads with a neutral tone
    the build didn't use, in every reading it gives those sounds, for a person to check: {word: (ours, CC-CEDICT's)}."""
    toks, soft = [], {}

    def visit(d):
        if isinstance(d, dict):
            toks.extend(t for t in d.get('t') or [] if isinstance(t, list) and len(t) > 2)
            d = list(d.values())
        if isinstance(d, list):
            for x in d:
                visit(x)
    visit(scn)
    for w, py, _ in toks:
        bad = [s for c, s in zip(w, py.split()) if c == '别' and s != 'bié' and '别扭' not in w]
        if bad:
            raise SystemExit(f"{scn['id']}: 别 read {bad[0]} in {w} (it's bié; fix tools/pinyin_fix.json or neutral())")
        mine = [numbered(s) for s in py.split()]
        if len(w) < 2 or len(mine) != len(w) or w in FIXES:   # the fixes were read by a person
            continue
        es = [e[0].split() for e in ced.get(w, []) if [x[:-1] for x in e[0].split()] == [x[:-1] for x in mine]]
        fits = lambda e: all(a == b or b[-1] == '5' or c in '一不' for a, b, c in zip(e, mine, w))   # sandhi aside
        if es and not any(map(fits, es)) and any(a[-1] == '5' != b[-1] for e in es for a, b in zip(e, mine)):
            soft[w] = (py, ' / '.join(' '.join(e) for e in es))
    glued = {w: g for w, _, g in toks if ' · ' in g}
    if glued:   # a word stitched from its characters' meanings reads as nonsense: give it its own gloss
        print(f"{scn['id']}: words with no gloss of their own (add them to GLOSS): " + '; '.join(f'{w} = {g}' for w, g in glued.items()))
    return soft


def beats(d):
    """Every `say` beat in a scenario, or in any part of one."""
    if isinstance(d, list):
        for x in d:
            yield from beats(x)
    elif isinstance(d, dict):
        if isinstance(d.get('say'), dict):
            yield d['say']
        for k, v in d.items():
            if k not in ('ans', 't'):
                yield from beats(v)


def spans(o):
    """What the hint blanks in o's model answer, as match.js spans() does: each need group's first word found there,
    everywhere it occurs, widened to whole words, overlaps merged (八零 + 零二 → 八零二) → [[start, end]] in characters."""
    s, t, edge = o['answers'][0], o['ans'][0]['t'], [0]
    for x in t:
        edge.append(edge[-1] + len(x[0]))
    if ''.join(x[0] for x in t) != s:   # not built: each character is a word
        edge = list(range(len(s) + 1))
    found = []
    for g in o.get('need') or []:
        w = next((x for x in g if x and x in s), '')
        found += [[max(e for e in edge if e <= i), min(e for e in edge if e >= i + len(w))] for i in range(len(s)) if w and s.startswith(w, i)]
    runs = []
    for a, b in sorted(found, key=lambda r: r[0]):
        if runs and a < runs[-1][1]:
            runs[-1][1] = max(runs[-1][1], b)
        else:
            runs.append([a, b])
    return runs


def keys(ced, o, own):
    """A meaning of its own for each word ask.js glosses that spans several of the build's words (是我, 没看到), where
    glossOf() would string their first senses together ('to be I'): o's blanks (the hint key) and the first word of each
    need group ('Missing the word for …'), taken where glossOf() finds them. From GLOSS or CC-CEDICT, for the words it
    covers (没看 → 没看到); a word a hand-written entry (own) reaches is left to it.
    → ({word: meaning}, [words with no meaning of their own])."""
    out, left = {}, []
    for w in dict.fromkeys([o['answers'][0][a:b] for a, b in spans(o)] + [g[0] for g in o.get('need') or [] if g]):
        e = next((x for x in o['ans'] if w and w in x['zh']), None)
        if not e:
            continue
        t, at = e['t'], [0]
        for x in t:
            at.append(at[-1] + len(x[0]))   # where each word starts: annotate() keeps every character
        i = next((j for j in at if e['zh'].startswith(w, j) and j + len(w) in at), e['zh'].find(w))   # on word edges if it can be
        inside = [k for k in range(len(t)) if len(t[k]) > 1 and at[k] < i + len(w) and at[k + 1] > i]
        ws, run = [x[0] if len(x) > 1 else '' for x in t], lambda p, q: ''.join(t[k][0] for k in inside[p:q])
        if len(inside) < 2 or any(run(p, q) in own for p in range(len(inside)) for q in range(p + 1, len(inside) + 1)):
            continue
        py, whole = [s for k in inside for s in t[k][1].split()], run(0, len(inside))   # read as CC-CEDICT writes it: 一 and 不 before sandhi
        py = [{'yí': 'yī', 'yì': 'yī', 'bú': 'bù'}.get(s, s) if c in '一不' else s for c, s in zip(whole, py)] if len(py) == len(whole) else py
        g = gloss(ced, whole, ' '.join(map(numbered, py)), around(ws, inside[0], inside[-1])) or gloss(ced, w, '')
        if g:
            out[w] = g.split(';')[0]
        else:
            left.append(w)
    return out, left


# ---------- voices ----------

def speak(txt, v, speed, tel):
    """voice.say, keyed by the fixes this line touches. A line whose 喂 are all calls is voiced with pypinyin reading a
    喂 on its own wéi, the phone's 'hello?', for that line only: everywhere else it is wèi, 'to feed' (喂猫)."""
    from pypinyin.constants import PINYIN_DICT
    call, was = '喂' in txt and '喂' not in CALL.sub('', txt), PINYIN_DICT[ord('喂')]
    PINYIN_DICT[ord('喂')] = 'wéi' if call else was
    try:
        return voice.say(txt, v, speed, tel, extra=';'.join([f'{k}={FIXES[k]}' for k in FIXES if k in txt] + ['喂=wéi'] * call))
    finally:
        PINYIN_DICT[ord('喂')] = was


def save(f, text):
    """Write a file whole or not at all: a test or a page reading data/ meanwhile never sees half of one."""
    tmp = f.with_name(f.name + '.tmp')
    tmp.write_text(text)
    tmp.replace(f)


def casting():
    return json.loads((ROOT / 'tools' / 'voices.json').read_text())


def who(scn, k, show, people):
    """Who a cast member is in the world (content/world.json), or None: the one they say they are ("is"), else their
    thread's character with that key (any world id, in a message: messages come from the world)."""
    c = scn['cast'][k]
    if c.get('is'):
        return c['is']
    return k if k in people and ('from' in scn or k in ((show or {}).get('cast') or [])) else None


def assign(scn, cast_cfg, show=None, people=None):
    """Give every cast member a voice for their role, different from the others in this scene, varied across scenes.
    Someone from the world has their own in every story (world.json's `tts`): they're placed first, and the rest dealt
    around them."""
    people = people or {}
    out = {k: people[w]['tts'] for k in scn['cast'] if (w := who(scn, k, show, people))}
    own = (show or {}).get('cast') if (show or {}).get('genre') else None   # a show's own characters (genres.md §2)
    out.update({k: own[k]['tts'] for k in scn['cast'] if own and k in own})
    used = set(out.values())
    for k, c in scn['cast'].items():
        if k in out:
            continue
        pool = cast_cfg['roles'][c['voice']]
        start = zlib.crc32(f"{scn['id']}/{k}".encode()) % len(pool)
        for i in range(len(pool)):
            v = pool[(start + i) % len(pool)]
            if v not in used:
                break
        used.add(v)
        out[k] = v
    return out


# ---------- levels ----------

FREQ = {}   # jieba's dict.txt: word → count, '' → all words


def zipf(w):
    """How common a word is: log10 of its frequency per billion words in jieba's dictionary (借 4.9, 押金 3.2, 吗 5.6).
    A number is common (三号 is as common as 号). jieba also lists phrases, many at a count of 3 (多少钱, 吓死): a word of
    three or more characters, or one that rare, is as common as its rarest part (the longest words inside it)."""
    if not FREQ:
        import jieba
        for line in open(Path(jieba.__file__).parent / 'dict.txt', encoding='utf8'):
            x, n = line.split()[:2]
            FREQ[x] = FREQ.get(x, 0) + int(n)
        FREQ[''] = sum(FREQ.values())
    w = ''.join(HAN.findall(w))
    own = math.log10(FREQ[w] / FREQ[''] * 1e9) if w and FREQ.get(w) else None
    if not w.strip(NUM):
        return 6.0
    if w[0] in NUM and zipf(w.lstrip(NUM)) >= 4:   # 三号, 一分钟 (but 一般 is a word of its own)
        return max(zipf(w.lstrip(NUM)), own or 0)
    if len(w) == 1 or own and len(w) < 3 and FREQ[w] >= 10:
        return own or 1.0
    parts, i = [], 0
    while i < len(w):
        n = next(n for n in range(min(4, len(w) - i), 0, -1) if n == 1 or w[i:i + n] in FREQ and w[i:i + n] != w)
        parts.append(w[i:i + n])
        i += n
    least = min(map(zipf, parts))
    return max(own, least) if own else least


def idiom(ced, w):
    return any('(idiom)' in d for _, ds in ced.get(w, []) for d in ds)


def hardness(ced, b):
    """What makes a line hard to say, from its model answer: Han characters, need groups, the rarest need word's zipf
    (each group's word as the model answer says it), an idiom (CC-CEDICT's tag on a word, or on a whole clause) and
    clauses."""
    a = b['answers'][0]
    said = [next((w for w in g if w and w in a), g[0]) for g in b.get('need') or []]
    clauses = [c for c in re.split(r'[，。！？；…,.!?;]+', a) if HAN.search(c)]
    words = [x[0] for x in b['ans'][0]['t'] if len(x) > 1] + clauses
    return {'chars': len(HAN.findall(a)), 'needGroups': len(said), 'zipf': round(min(map(zipf, said), default=6.0), 2),
            'idiom': any(idiom(ced, w) for w in words), 'clauses': len(clauses)}


# The say level from those: one level per 4.5 characters or so, more for need groups past one, a rare word, an idiom or a
# clause past one, and for the format (a chase line is said from memory with the chaser gaining, a chat line typed, a
# call line live). Fitted to v1's declared levels by a grid search held to docs/v2/content.md's level table (多少钱 L0,
# the four-group borrow line L4, a toast L5), then the intercept to the first batches' 270 lines at every level, L0 to L5
# (93% within one level, half exact); review/levels.md says how many land within one level.
SAY = {'base': -0.2, 'char': 0.22, 'group': 0.15, 'rare': 0.35, 'idiom': 1.0, 'clause': 0.15}
SAY_FORMAT = {'scene': 0, 'chase': 0.75, 'chat': 0.5, 'call': 0.25}


def say_level(h, fmt):
    x = (SAY['base'] + SAY['char'] * h['chars'] + SAY['group'] * (h['needGroups'] - 1) + SAY['rare'] * max(0, 4.5 - h['zipf'])
         + SAY['idiom'] * h['idiom'] + SAY['clause'] * (h['clauses'] - 1) + SAY_FORMAT[fmt])
    return max(0, min(5, math.floor(x + 0.5)))


def listening(scn):
    """What the other characters' lines ask of a listener → (lis, listen level). lis: characters a second (Han characters
    over their clips' length, so a fast `pace` or `speed` counts), characters a line (`chars` the mean, `long` the 75th
    percentile), `zipf` the median line's rarest word (names aside), `hidden` the share of characters not shown as text at
    first (a call's lines but a free peek, a chat's voice notes) and `lines`. The level is 2 at v1's usual 11-character
    long lines and 3.9 characters a second, a level per 4 characters and per 0.5 a second, plus the hidden share and 0.5
    for three or more speakers: v1 lands where docs/v2/content.md §1 measured it (L2 almost everywhere, calls L3)."""
    names = {c['name'] for c in scn['cast'].values()}
    said = []

    def visit(d):
        if isinstance(d, list):
            for x in d:
                visit(x)
        elif isinstance(d, dict):
            if d.get('who') in scn['cast'] and isinstance(d.get('a'), list) and HAN.search(d.get('zh') or ''):
                hidden = (scn['format'] == 'call' and d.get('peek') != 'free') or (scn['format'] == 'chat' and d.get('kind') == 'voice')
                words = [x[0] for x in d.get('t') or [] if len(x) > 1 and x[0] not in names and not re.match(r'[A-Z]', GLOSS.get(x[0], 'a'))]
                said.append((len(HAN.findall(d['zh'])), d['a'][1], hidden, min(map(zipf, words), default=6.0)))
            for k, v in d.items():
                if k not in ('ans', 't'):
                    visit(v)
    visit(scn['steps'])
    for k, v in scn.items():
        if k not in ('steps', 'cast') and isinstance(v, (dict, list)):
            visit(v)
    if not said:
        return {'lines': 0}, 0
    n = np.array([s[0] for s in said])
    lis = {'cps': round(float(n.sum() / max(0.1, sum(s[1] for s in said))), 2), 'chars': round(float(n.mean()), 1),
           'long': round(float(np.percentile(n, 75)), 1), 'zipf': round(float(np.median([s[3] for s in said])), 2),
           'hidden': round(sum(s[0] for s in said if s[2]) / max(1, n.sum()), 2), 'lines': len(said)}
    x = 2 + (lis['long'] - 11) / 4 + (lis['cps'] - 3.9) / 0.5 + lis['hidden'] + 0.5 * (len(scn['cast']) >= 3)
    return lis, max(0, min(5, math.floor(x + 0.5)))


def measure(ced, scenarios, sources):
    """Levels and the learner model's features for every scenario in the build (those kept from the live build too,
    their metadata read again from content/src): `lv` on every beat and level override, `listen` (the source's, else
    measured), `lis` and `topic` (the first of `topics`) on each scenario. → ({phrase id: f}, rows for levels_report())"""
    feats, rows = {}, []
    for scn in scenarios:
        src = sources.get(scn['id'], {})
        for k in ('topics', 'audience', 'hook', 'status', 'series', 'first', 'gate', 'kind'):
            if k in src:
                scn[k] = src[k]
            elif k in ('first', 'gate', 'kind'):   # taken off since the scenario was built
                scn.pop(k, None)
        if scn.get('topics'):
            scn['topic'] = scn['topics'][0]
        scn['lis'], heard = listening(scn)
        scn['listen'] = src['listen'] if isinstance(src.get('listen'), int) else heard
        for b in beats(scn):
            for k, o in [(None, b)] + list((b.get('levels') or {}).items()):
                h = hardness(ced, tailor(b, o) if k else b)
                o['lv'] = say_level(h, scn['format'])
                pid, level = f"{scn['id']}/{b['id']}" + (f'@{k}' if k else ''), int(k) if k else scn['level']
                feats[pid] = {'level': level, 'chars': h['chars'], 'needGroups': h['needGroups'], 'zipf': h['zipf']}
                rows.append((scn, pid, level, o['lv'], h, (tailor(b, o) if k else b)['answers'][0], o.get('status')))
        rows.append((scn, None, src.get('listen'), heard, scn['lis'], None, None))
    return feats, rows


def levels_report(rows, scenarios):
    """review/levels.md: where every line and story is declared next to the build's estimate, for the owner and the
    factory's editor; the lines more than one level off first."""
    lines = [r for r in rows if r[1]]
    near = [r for r in lines if abs(r[2] - r[3]) <= 1]
    off = sorted((r for r in lines if abs(r[2] - r[3]) > 1), key=lambda r: -abs(r[2] - r[3]))
    row = lambda r: (f"| {r[1]}{' (draft)' if r[6] == 'draft' else ''} | {r[2]} | {r[3]} | {r[4]['chars']} | {r[4]['needGroups']} | "
                     f"{r[4]['zipf']} | {'idiom' if r[4]['idiom'] else ''} | {r[5]} |")
    head = ['| line | declared | lv | characters | need groups | rarest zipf | | model answer |', '|---|---|---|---|---|---|---|---|']
    out = ['# Levels', '',
           f"Built {datetime.datetime.now().isoformat(timespec='minutes')} by tools/build.py. `lv` is the build's estimate of a "
           "line's say level from its model answer (`SAY` in build.py: about a level per 4.5 characters, more for need groups, "
           "a rare word, an idiom, clauses, and a chase, chat or call); listen comes from the other characters' lines "
           "(`listening()`). The declared level is the scenario's `level`, or an override's key.", '',
           f'**{len(near)} of {len(lines)} lines ({len(near) / max(1, len(lines)):.0%}) are within one level of where they are '
           'declared** (the target is 90%).', '',
           '## Stories', '', '| scenario | format | say | listen | heard: characters a second · a line (long) · zipf · hidden | lines: lv |',
           '|---|---|---|---|---|---|']
    for scn in scenarios:
        lis = scn.get('lis') or {}
        mine = [r for r in lines if r[0] is scn]
        listen = next((r for r in rows if r[0] is scn and not r[1]), None)
        said = f"{listen[2]} (measured {listen[3]})" if listen and listen[2] is not None else scn.get('listen')
        out.append(f"| {scn['id']}{' (draft)' if scn.get('status') == 'draft' else ''} | {scn['format']} | {scn['level']} | {said} | "
                   f"{lis.get('cps')} · {lis.get('chars')} ({lis.get('long')}) · {lis.get('zipf')} · {lis.get('hidden')} | "
                   + ' · '.join(f"{r[1].split('/', 1)[1]} {r[3]}" for r in mine) + ' |')
    out += ['', '## More than one level off', '', *(head + [row(r) for r in off] if off else ['None.'])]
    out += ['', '## Every line', '', *head, *(row(r) for r in lines)]
    REVIEW.mkdir(parents=True, exist_ok=True)
    (REVIEW / 'levels.md').write_text('\n'.join(out) + '\n')
    print(f'{(REVIEW / "levels.md").relative_to(ROOT)}: {len(near)} of {len(lines)} lines within one level of where they are declared')


def shows(ced, series, scenarios):
    """The series (threads) the build's episodes belong to, for end cards ('Episode 2 →') and the ranker's thread arms:
    {id: {title, title_py, title_en, eps, audience, levels}}."""
    out = {}
    for sid in dict.fromkeys((s.get('series') or {}).get('id') for s in scenarios):
        if sid in series:
            s = series[sid]
            out[sid] = {'title': s['title'], 'title_py': annotate(ced, s['title'])[0], 'title_en': s['title_en'], 'eps': s.get('eps'),
                        'audience': s.get('audience'), 'levels': s.get('levels')}
    return out


def contacts(ced, world):
    """The world for the contacts page: its places, and its cast with each one's line for every feeling, -2 to 4
    ({id: {name, name_py, emoji, en, en_new, home, feel}}). Voices stay in the build."""
    keep = ('name', 'emoji', 'en', 'en_new', 'home', 'feel')
    return {'places': {k: {'name': p['name'], 'name_py': annotate(ced, p['name'])[0], 'en': p['en']} for k, p in world.get('places', {}).items()},
            'cast': {k: {**{f: c[f] for f in keep if f in c}, 'name_py': annotate(ced, c['name'])[0]} for k, c in world.get('cast', {}).items()}}


def sid_of(f):
    """A source's id: <format>-<id>.json in content/src (validate holds files to it), <id>.json in content/messages."""
    return f.stem if f.parent == MESSAGES else f.stem.split('-', 1)[1]


# ---------- build ----------

def readable(f):
    try:
        return json.loads(f.read_text())
    except ValueError:   # a draft someone is still writing: not in this build, so its metadata can wait
        return None


def undraft(scn):
    """Take a shipping scenario's draft level overrides out → the ones taken ('beat@0')."""
    gone = []
    for b in list(beats(scn)):
        for k in [k for k, o in (b.get('levels') or {}).items() if o.get('status') == 'draft']:
            del b['levels'][k]
            gone.append(f"{b['id']}@{k}")
        if b.get('levels') == {}:
            del b['levels']
    return gone


def eleven_retry(txt, v, speed, tries=5):
    """voice.say_eleven, again after a pause when the API is busy (429), is still adding a library voice to the account
    on its first use (409), or hiccups (5xx)."""
    import urllib.error
    for n in range(tries):
        try:
            return voice.say_eleven(txt, v, speed)
        except urllib.error.HTTPError as e:
            if e.code not in (409, 429) and e.code < 500 or n == tries - 1:
                raise SystemExit(f'ElevenLabs said {e.code} for {txt!r}: {e.read()[:300]!r}')
        except (urllib.error.URLError, TimeoutError):
            if n == tries - 1:
                raise
        time.sleep(2 ** n)


def build(only=None, qa=False, warm=False, engine='kokoro', estimate=False, out=None):
    global DATA, AUDIO, REVIEW
    live = DATA / 'content.json'
    if out:   # a batch to review: drafts too, next to the live catalogue
        DATA, AUDIO, REVIEW = out / 'data', out / 'audio', out
    sources = sorted(SRC.glob('*.json')) + sorted(MESSAGES.glob('*.json'))
    files = [str(f) for f in sources if not only or sid_of(f) in only]
    subprocess.run(['node', str(ROOT / 'tools' / 'validate.mjs'), *files], check=True)
    ced = setup_text()
    cfg = casting()
    # ElevenLabs: the same casting, each Kokoro voice played by its stand-in (tools/voices.json → elevenlabs.stand_in),
    # so someone from the world keeps one voice and a scene's voices stay different
    stand_in = cfg['elevenlabs']['stand_in'] if engine == 'elevenlabs' else None
    DATA.mkdir(parents=True, exist_ok=True)
    AUDIO.mkdir(parents=True, exist_ok=True)
    out_path = DATA / 'content.json'
    # with --only, the rest are the live build's as they are (a batch is played inside the live catalogue)
    was = json.loads(live.read_text()) if live.exists() and only else {}
    old = {s['id']: s for s in [*was.get('scenarios', []), *was.get('messages', [])]}
    series = {s['id']: s for s in (json.loads(f.read_text()) for f in sorted(SERIES.glob('*.json')))}
    world = json.loads(WORLD.read_text()) if WORLD.exists() else {}
    people = world.get('cast', {})
    scenarios, qa_rows, soft, held = [], [], {}, []
    for f in sources:
        sid = sid_of(f)                  # a file outside --only isn't read at all, so one someone is still writing
        if only and sid not in only:     # can't stop the build
            if sid in old:
                scenarios.append(old[sid])
            continue
        scn = json.loads(f.read_text())
        if not out:   # drafts never ship
            if scn.get('status') == 'draft':
                held.append(scn['id'])
                continue
            held += [f"{scn['id']}/{x}" for x in undraft(scn)]
        if f.parent == MESSAGES:   # a message is a chat with the one it's from
            scn['format'] = 'chat'
            scn.setdefault('chat', {'with': scn['from']})
        show = series.get((scn.get('series') or {}).get('id'))
        voices = assign(scn, cfg, show, people)
        tel_all = scn['format'] == 'call'
        clips = []   # (holder dict, key, text, voice, speed, tel)

        def text(d, k='zh'):
            d['py'], d['t'] = annotate(ced, d[k])

        def visit(d):
            if isinstance(d, list):
                for x in d:
                    visit(x)
                return
            if not isinstance(d, dict):
                return
            if isinstance(d.get('answers'), list):
                d['ans'] = []
                for a in d['answers']:
                    py, t = annotate(ced, a)
                    d['ans'].append({'zh': a, 'py': py, 't': t})
                clips.append((d, 'a', d['answers'][0], cfg['model'], 1.0, False))
                clips.append((d, 'slow', d['answers'][0], cfg['model'], SLOW, False))
            if isinstance(d.get('zh'), str) and HAN.search(d['zh']):
                text(d)
                who = d.get('who')
                if who in scn['cast']:
                    c = scn['cast'][who]
                    pace = {'fast': 1.15, 'slow': 0.85}.get(d.get('pace'), 1.0)   # a line said in a rush, or slowly
                    clips.append((d, 'a', d['zh'], voices[who], round(c.get('speed', 1.0) * pace, 2), c.get('phone', tel_all)))
                elif 'narr' in d or 'end' in d:
                    clips.append((d, 'a', d['zh'], cfg['narrator'], 1.0, False))
            for k, v in d.items():
                if k not in ('ans', 't') and isinstance(v, (dict, list)):
                    visit(v)

        visit(scn['steps'])
        for k, v in scn.items():   # format-specific blocks (chase, chat, call settings) may hold lines too
            if k not in ('steps', 'cast') and isinstance(v, (dict, list)):
                visit(v)
        if scn.get('title'):
            scn['title_py'], _ = annotate(ced, scn['title'])
        for k, c in scn['cast'].items():
            c['name_py'], _ = annotate(ced, c['name'])
            c['tts'] = voices[k]
            if w := who(scn, k, show, people):   # the contacts page's: everyone you've met
                c['is'] = w
        bare = []
        for b in beats(scn):   # meanings for the hint key's phrases (keys()); the writer's own entries win
            hand = b.get('key') or {}
            mine, left = keys(ced, b, hand)
            if mine:
                b['key'] = {**mine, **hand}
            for o in b.get('alts') or []:
                theirs, more = keys(ced, o, o.get('key') or hand)
                # an or-branch with no key of its own reads the beat's (ask.js): it gets one where the beat's new one could reach it
                if theirs or not o.get('key') and any(x in a for x in mine for a in o['answers']):
                    o['key'] = {**theirs, **(o.get('key') or hand)}
                left += more
            for lv, o in (b.get('levels') or {}).items():   # a level override's own line, over the beat's keys
                if 'answers' in o or 'need' in o:
                    theirs, more = keys(ced, tailor(b, o), o.get('key') or b.get('key') or {})
                    if theirs:
                        o['key'] = {**theirs, **(o.get('key') or b.get('key') or {})}
                    left += [f'{w} (@{lv})' for w in more]
                for a in o.get('alts') or []:
                    if 'answers' in a:
                        base = b['alts'][a['of']]
                        theirs, more = keys(ced, {**base, **a}, a.get('key') or base.get('key') or {})
                        if theirs:
                            a['key'] = {**theirs, **(a.get('key') or base.get('key') or {})}
                        left += [f'{w} (@{lv} alt)' for w in more]
            bare += [f"{b['id']}: {w}" for w in left]
        if bare:   # the hint key would string their words' first senses together
            print(f"{scn['id']}: need words over several words with no meaning of their own (give the beat a key, or GLOSS the phrase): " + '; '.join(bare))
        soft.update(lint(ced, scn))   # before any voicing, so a wrong 别 stops the build at once

        if stand_in:
            clips = [(h, k, txt, stand_in[v], speed, tel) for h, k, txt, v, speed, tel in clips]
            if not estimate:   # four calls at a time (Creator allows five), so a scene isn't voiced a line at a time
                left = list({(txt, v, speed) for _, _, txt, v, speed, _ in clips if not voice.cached_eleven(txt, v, speed)})
                with ThreadPoolExecutor(4) as ex:
                    list(ex.map(lambda c: eleven_retry(*c), left))
        if estimate:   # --estimate: what an ElevenLabs build would cost, without calling it
            todo = {(txt, v, speed) for _, _, txt, v, speed, _ in clips if not voice.cached_eleven(txt, v, speed)}
            n = sum(len(t) for t, _, _ in todo)
            estimate_total[0] += n
            print(f"{scn['id']}: {len(todo)} lines to voice, {n} characters", flush=True)
            continue
        if warm:   # --warm: just fill the voice cache (several of these can run side by side), no output
            for holder, key, txt, v, speed, tel in clips:
                speak(txt, v, speed, tel)
            print(f"{scn['id']}: {len(clips)} clips voiced", flush=True)
            continue

        # voice and pack
        pieces, t, gap = [], 0.0, np.zeros(int(GAP * voice.SR), dtype='float32')
        pieces.append(gap)
        t += GAP
        seen = {}
        for holder, key, txt, v, speed, tel in clips:
            sig = (txt, v, speed, tel)
            if sig not in seen:
                x = voice.say_eleven(txt, v, speed, tel) if engine == 'elevenlabs' else speak(txt, v, speed, tel)
                seen[sig] = [round(t, 3), round(len(x) / voice.SR, 3)]
                pieces += [x, gap]
                t += len(x) / voice.SR + GAP
                if qa:
                    qa_rows.append((scn['id'], key, txt, v, x))
            holder[key] = seen[sig]
        pack = np.concatenate(pieces)
        digest = hashlib.sha1(pack.tobytes()).hexdigest()[:8]
        name = f"{scn['id']}-{digest}.mp4"   # AAC in MP4 (an .m4a by another name: the artifact host serves .mp4)
        if not (AUDIO / name).exists():
            tmp = CACHE / f"{scn['id']}.wav"
            sf.write(tmp, pack, voice.SR)
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(tmp), '-ac', '1', '-c:a', 'aac', '-b:a', '56k',
                            '-movflags', '+faststart', '-f', 'mp4', str(AUDIO / name)], check=True)
            tmp.unlink()
        scn['audio'] = (AUDIO / name).relative_to(ROOT).as_posix()   # from the page: audio/…, or review/gate/<batch>/audio/…
        scn['secs'] = round(t, 1)
        scenarios.append(scn)
        print(f"{scn['id']}: {len(seen)} clips, {t:.0f}s of audio → {name}", flush=True)

    if estimate:
        return print(f'ElevenLabs ({voice.ELEVEN_MODEL}): {estimate_total[0]} characters ≈ {estimate_total[0]} credits')
    if warm:
        return
    keep = {s['audio'].split('/')[-1] for s in scenarios}
    # old packs stay until --clean: a page or test already running may still be fetching them (the artifact pack only
    # publishes the ones data/content.json names)
    for f in [*AUDIO.glob('*.m4a'), *AUDIO.glob('*.mp4')]:
        if f.name not in keep and '--clean' in sys.argv:
            f.unlink()
    order = {'scene': 0, 'chase': 1, 'chat': 2, 'call': 3}
    messages = sorted((s for s in scenarios if 'from' in s), key=lambda s: s['id'])
    scenarios = sorted((s for s in scenarios if 'from' not in s), key=lambda s: (order[s['format']], s['level'], s['id']))
    every = scenarios + messages
    feats, rows = measure(ced, every, {s['id']: s for s in map(readable, sources) if s})
    doc = {'v': 1, 'built': datetime.datetime.now().isoformat(timespec='seconds'), 'voice': 'Kokoro-82M v1.1-zh',
           'scenarios': scenarios, 'messages': messages, 'series': shows(ced, series, scenarios), 'world': contacts(ced, world),
           'phrases': phrases(every, feats)}
    save(out_path, json.dumps(doc, ensure_ascii=False, separators=(',', ':')))
    print(f'{out_path.relative_to(ROOT)}: {len(scenarios)} scenarios, {len(messages)} messages, {len(doc["phrases"])} phrases, {out_path.stat().st_size // 1024} KB')
    if held:
        print(f'drafts left out ({len(held)}; --out builds them for review): {", ".join(held)}')
    if soft:   # not an error: CC-CEDICT writes some neutral tones many speakers don't use (那边 nàbian), so a person decides
        print(f'neutral tones CC-CEDICT has that the build left out ({len(soft)}; fix real ones in tools/pinyin_fix.json):')
        for w, (py, theirs) in sorted(soft.items()):
            print(f'  {w} {py} (CC-CEDICT {theirs})')
    levels_report(rows, every)
    pinyin_map(every)
    strokes(every)
    if qa:
        check(qa_rows, cfg['model'])


def tailor(b, o):
    """A beat as played at one of its level overrides, as content.js tailor() plays it: the override's fields over the
    beat's; if it lists `alts`, those in place of the beat's, each the beat's alt `of` with its own changes."""
    t = {k: v for k, v in b.items() if k != 'levels'}
    t.update({k: v for k, v in o.items() if k != 'alts'})
    if 'alts' in o:
        t['alts'] = [{**b['alts'][a['of']], **{k: v for k, v in a.items() if k != 'of'}} for a in o['alts']]
    return t


def phrases(scenarios, feats=None):
    """Every phrase the player must say, once, for review cards and the phrase deck: each beat (scn/beat) and each of its
    level overrides (scn/beat@L, `family` the beat's id), with the say level `lv` and the learner model's `f` (measure())."""
    out, feats = [], feats or {}

    def one(scn, b, pid, level):
        out.append({'id': pid, 'family': pid.split('@')[0], 'scn': scn['id'], 'format': scn['format'], 'level': level,
                    'lv': b.get('lv'), 'f': feats.get(pid),
                    'zh': b['answers'][0], 'py': b['ans'][0]['py'], 't': b['ans'][0]['t'], 'en': b['en'], 'ans': b['ans'],
                    'gloss': b.get('gloss', ''), 'tip': b.get('tip', ''), 'need': b['need'], 'answers': b['answers'],
                    'a': b['a'], 'slow': b['slow'], 'audio': scn['audio'], **({'key': b['key']} if b.get('key') else {})})

    def visit(scn, d):
        if isinstance(d, list):
            for x in d:
                visit(scn, x)
        elif isinstance(d, dict):
            if 'say' in d and isinstance(d['say'], dict):
                b = d['say']
                one(scn, b, f"{scn['id']}/{b['id']}", scn['level'])
                for k, o in (b.get('levels') or {}).items():
                    one(scn, tailor(b, o), f"{scn['id']}/{b['id']}@{k}", int(k))
            for k, v in d.items():
                if k not in ('ans', 't'):
                    visit(scn, v)

    for s in scenarios:
        visit(s, s['steps'])
    return out


def pinyin_map(scenarios):
    """data/py.json: readings → characters ({"hai2 huan2": "还", "jie4": "借介界…"}), most common reading first, so the
    page can hear a recogniser's characters (or typed ones) as sounds."""
    import jieba
    from pypinyin import Style, pinyin
    chars = set()
    dict_txt = Path(jieba.__file__).parent / 'dict.txt'
    for line in open(dict_txt, encoding='utf8'):
        w, freq = line.split()[:2]
        if int(freq) >= 300:
            chars.update(c for c in w if HAN.match(c))
    # every character of the content, but not of the build's own glosses: 撇's 丿 is no word, and would be a tile that sounds like it
    strip = lambda d: [strip(x) for x in d] if isinstance(d, list) else {k: strip(v) for k, v in d.items() if k != 't'} if isinstance(d, dict) else d
    chars.update(HAN.findall(json.dumps(strip(scenarios), ensure_ascii=False)))
    # Keep a character's other readings only if real words use them: pypinyin also lists archaic ones (有 wěi,
    # 说 yuè), and those would let unrelated words pass a need (喂 for 有).
    from pypinyin.constants import PHRASES_DICT, PINYIN_DICT
    from pypinyin.contrib.tone_convert import to_tone3
    used = {}
    for phrase, rs in PHRASES_DICT.items():
        for c, r in zip(phrase, rs):
            if r:
                k = (c, to_tone3(r[0], neutral_tone_with_five=True))
                used[k] = used.get(k, 0) + 1
    groups = {}
    for c in sorted(chars):
        rs = list(dict.fromkeys(pinyin(c, style=Style.TONE3, heteronym=True, neutral_tone_with_five=True)[0]))
        rs = rs[:1] + [r for r in rs[1:] if used.get((c, r), 0) >= 3]
        if c in FIXES and ord(c) in PINYIN_DICT:   # read our way (谁 shéi), it keeps the dictionary's own reading: the judge hears shuí too
            rs = list(dict.fromkeys(rs + [to_tone3(PINYIN_DICT[ord(c)].split(',')[0], neutral_tone_with_five=True)]))
        groups.setdefault(' '.join(rs), []).append(c)
    save(DATA / 'py.json', json.dumps({k: ''.join(v) for k, v in sorted(groups.items())}, ensure_ascii=False, separators=(',', ':')))
    print(f'{(DATA / "py.json").relative_to(ROOT)}: {len(chars)} characters, {len(groups)} reading groups, {(DATA / "py.json").stat().st_size // 1024} KB')


def strokes(scenarios):
    """data/strokes.json: Hanzi Writer stroke data for the characters in the phrases the player must say."""
    src = CACHE / 'hwdata' / 'package'
    if not src.exists():
        return print('strokes: no hanzi-writer-data in .cache, skipped')
    chars = set()
    for p in phrases(scenarios):
        chars.update(HAN.findall(p['zh']))
    data = {}
    for c in sorted(chars):
        f = src / f'{c}.json'
        if f.exists():
            data[c] = json.loads(f.read_text())
    save(DATA / 'strokes.json', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print(f'{(DATA / "strokes.json").relative_to(ROOT)}: {len(data)} characters, {(DATA / "strokes.json").stat().st_size // 1024} KB')


def check(rows, model):
    """Play every new clip to the recogniser; write review/qa.md with the ones it doesn't understand, and review/qa.json
    with them too, the model answers marked: a model answer both recognisers doubt fails a batch (tools/factory.mjs),
    because it's the line people imitate."""
    import asr
    cache_f = CACHE / 'asr2.json'   # asr2: clips are padded with silence before they're heard
    heard = json.loads(cache_f.read_text()) if cache_f.exists() else {}
    bad = []
    for sid, key, txt, v, x in rows:
        k = hashlib.sha1(x.tobytes()).hexdigest()[:16]
        if k not in heard:
            heard[k] = asr.transcribe(x)
            cache_f.write_text(json.dumps(heard, ensure_ascii=False))
        e = asr.cer(x, txt, heard[k])
        if e > 0.15:   # Whisper is shaky on short clips: only a line both recognisers get wrong is a real problem
            k2 = 'sv:' + k
            if k2 not in heard:
                heard[k2] = asr.transcribe_sv(x)
                cache_f.write_text(json.dumps(heard, ensure_ascii=False))
            e2 = asr.cer(x, txt, heard[k2])
            if e2 > 0.15:
                bad.append((min(e, e2), sid, key, v, txt, f'{heard[k]} / {heard[k2]}'))
    REVIEW.mkdir(parents=True, exist_ok=True)
    bad.sort(reverse=True)
    mine = [x for x in bad if x[3] == model]
    lines = ['# Voice check', '', f'{len(rows)} clips played back to Whisper, and the ones it doubted to SenseVoice too; {len(bad)} came back more than 15% off from both'
             + (f', {len(mine)} of them model answers (a doubted model answer fails a batch).' if mine else ', none of them a model answer.'), '',
             '| off | scenario | voice | script | heard (Whisper / SenseVoice) |', '|---|---|---|---|---|']
    lines += [f"| {e:.0%} | {sid} | {v}{' (model)' if v == model else ''} | {txt} | {h} |" for e, sid, key, v, txt, h in bad]
    (REVIEW / 'qa.md').write_text('\n'.join(lines) + '\n')
    (REVIEW / 'qa.json').write_text(json.dumps({'clips': len(rows), 'doubted': [
        {'off': round(e, 2), 'scn': sid, 'clip': key, 'voice': v, 'model': v == model, 'script': txt, 'heard': h} for e, sid, key, v, txt, h in bad]}, ensure_ascii=False, indent=1))
    print(f'qa: {len(bad)} of {len(rows)} clips off, {len(mine)} of them model answers ({(REVIEW / "qa.md").relative_to(ROOT)})')


if __name__ == '__main__':
    only = next((a.split('=', 1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)
    engine = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--engine=')), 'kokoro')
    out = next((Path(a.split('=', 1)[1]).resolve() for a in sys.argv if a.startswith('--out=')), None)
    if out and ROOT not in out.parents:   # the page reaches a batch's audio by its path from the project folder
        raise SystemExit('--out must be a folder inside the project, such as review/gate/<batch>')
    build(only=set(only) if only else None, qa='--qa' in sys.argv, warm='--warm' in sys.argv, engine=engine, estimate='--estimate' in sys.argv, out=out)
