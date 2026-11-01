#!/usr/bin/env node
// tools/match-check.mjs: erhua typed as pinyin (content request 8, docs/v2/p3.md). The build reads a word's 儿 into the
// sound before it (一点儿 yì diǎnr, 哪儿 nǎr), and a learner types it as the build writes it (yidianr), with the r apart
// (yi dian r) or as a syllable of its own (yidian er): the judge (app/shared/match.js) takes all three for a need word
// written with 儿, wherever the 儿 falls in the word (一点儿, 一点儿都不会) and the word in the answer, and loosens
// nothing else. Its parts:
//   typed     the three ways, run together or spaced (an apostrophe, hyphens), with tone marks or digits, the word
//             first, inside or last in the answer, in a word no answer has (square-dance's 一点儿都不会 beside 一点都不会)
//             and one every answer denies (不是那儿); and square-dance's 我一点儿都不会 back among its answers, judged as
//             tools/judge-check.mjs judges one
//   misses    what must still fail: the no left out (一点儿都会), the word cut short or a sound of it changed, the r on the
//             wrong sound or twice, an r that starts the next syllable (yidianrou is 一点肉), the 儿 left out where the
//             need word has it (yidiandoubuhui), an r for a 儿 the build reads as a syllable of its own (女儿的 nǚ ér de,
//             儿子 ér zi), and erhua where the need word has none: the judge makes no erhua optional (content lists both
//             forms, as square-dance does)
//   spoken    the recogniser writes 儿 as a character, and it's judged as one (by character, so no r comes into it)
//   builds    every need word with 儿 after its first character in data/ and the gate builds (review/gate/*/data, where
//             there are any), in every branch at every level its beat plays at (tailored as the app plays it): each answer
//             with the word, typed the three ways, passes its beat and has the word; a word no answer has, put in an
//             answer where a word of its group is, the same; each with its 儿 left out, or a sound of the word changed,
//             hasn't. Reported, not failed: a word whose group has no form without the erhua (等会儿再说 and no
//             等会再说), which fails a speaker who doesn't use it
// Exit 1 on any failure. node tools/match-check.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
globalThis.fetch = async (u) => ({ json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, u.replace(/^\//, '')), 'utf8')) });
const m = await import(path.join(ROOT, 'app/shared/match.js'));
const HAN = /[\u4e00-\u9fff]/, problems = [];
let cases = 0;
const toneless = (py) => py.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zü ]/gi, ' '); // as judge-check types a model answer

// an answer as the build makes one (tools/build.py annotate()): '我=wǒ|一点儿=yì diǎnr|都=dōu|不会=bú huì|！'
const built = (s) => { const t = s.split('|').map((x) => (x.includes('=') ? [...x.split('='), ''] : [x])); return { zh: t.map((x) => x[0]).join(''), py: t.reduce((p, x) => (x[1] ? `${p} ${x[1].replace(/ /g, '')}` : p + x[0]), '').trim(), t }; };
const beat = (need, ...ans) => ({ id: 'b', answers: ans.map((e) => e.zh), ans, need });
const needs = (b) => b.need.map((g) => g.join('/')).join(' + ');
// each of `said` judged on `b`, typed (a keyboard) unless `spoken`: it must pass (`want`) or fail
function expect(b, want, said, { spoken = false, why = '' } = {}) {
  for (const s of said) {
    cases++;
    const v = m.judge([s], b, { typed: !spoken });
    if (v.ok !== want) problems.push(`${spoken ? 'spoken' : 'typed'} "${s}" for ${needs(b)} ${v.ok ? 'passes' : `fails (missing ${v.missing.join(', ')})`}${why ? `: ${why}` : ''}`);
  }
}

await m.loadPinyin('data/py.json');

// ---------- typed: the three ways, wherever the 儿 and the word fall ----------
const ALL = beat([['一点儿都不会']], built('我=wǒ|一点儿=yì diǎnr|都=dōu|不会=bú huì|！')); // the 儿 inside the need word
expect(ALL, true, ['wo yidianr dou bu hui', 'wo yi dian r dou bu hui', 'wo yidian er dou bu hui', 'wo yidian r dou bu hui', 'woyidianrdoubuhui', 'wo yidianerdoubuhui', 'wǒ yìdiǎnr dōu búhuì', 'wo3 yi4dian3r dou1 bu2hui4', 'Wo yidianr dou buhui!']);
expect(ALL, true, ["wo yidian'r dou bu hui", 'wo yi-dian-r dou bu hui', 'wo yi4 dianr3 dou1 bu4 hui4'], { why: 'an apostrophe, hyphens, the tone after the r' });
expect(ALL, true, ['yidianr dou bu hui', 'zhende, wo yidianr dou bu hui tiao', 'wo yidianrdoubuhuitiao'], { why: 'the word first, inside, run into the rest' });
expect(ALL, false, ['wo yidianr dou hui', 'wo yi dian r dou hui'], { why: 'the no left out' });
expect(ALL, false, ['wo yidianr', 'wo yidianr dou', 'wo yidianr dou bu shuo', 'wo yidianr ye bu hui', 'wo yidianr du bu hui'], { why: 'the word cut short, or a sound of it changed' });
expect(ALL, false, ['wo yir dian dou bu hui', 'wo yidian dour bu hui', 'wo yidianrr dou bu hui'], { why: 'the r on the wrong sound, or twice' });
expect(ALL, false, ['wo yidianre dou bu hui', 'wo yi dian ru dou bu hui'], { why: 'the r starts the next syllable: 一点热, 一点入' });
expect(ALL, false, ['wo yidian dou bu hui', 'wo yi dian dou bu hui'], { why: "the 儿 left out: this need word has it, and the judge doesn't make it optional (content lists 一点都不会 beside it)" });
const END = beat([['一点儿']], built('我=wǒ|会=huì|说=shuō|一点儿=yì diǎnr|。'), built('一点儿=yì diǎnr|就=jiù|够了=gòu le|。'), built('我=wǒ|会=huì|说=shuō|一点儿=yì diǎnr|中文=zhōng wén|。')); // at the word's end
expect(END, true, ['wo hui shuo yidianr', 'wo hui shuo yi dian r', 'wo hui shuo yidian er', 'yidianr jiu gou le', 'yi dian r jiu gou le', 'wo hui shuo yidianr zhongwen', 'wohuishuoyidianrzhongwen', 'wo hui shuo yidian er zhongwen']);
expect(END, false, ['wo hui shuo yidian', 'wo hui shuo yi dian zhongwen'], { why: 'the 儿 left out' });
expect(END, false, ['wo xiang chi yidianrou'], { why: 'the r starts the next syllable: 一点肉' });
const WAIT = beat([['回头再说', '等会儿再说']], built('房租=fáng zū|等=děng|会儿=huìr|再说=zài shuō|！')); // inside the word, at a token's end
const LOOSE = beat([['回头再说', '等会儿再说']], built('房租=fáng zū|回头=huí tóu|再说=zài shuō|！')); // a word no answer has (landlord-leak@4)
for (const b of [WAIT, LOOSE]) {
  expect(b, true, ['fangzu denghuir zaishuo', 'fangzu deng hui r zai shuo', 'fangzu denghui er zaishuo', 'denghuirzaishuo ba']);
  expect(b, false, ['fangzu denghuir', 'fangzu denghuir zaijian', 'fangzu dengr hui zaishuo'], { why: 'cut short, a sound changed, the r on the wrong sound' });
  expect(b, false, ['fangzu deng hui zai shuo'], { why: 'the 儿 left out (content: 等会再说 isn\'t in the group)' });
}
expect(LOOSE, true, ['fangzu huitou zaishuo']);
// square-dance cant2@1 (p4b-2): its answers say 一点都不会, the group has the erhua too
const DANCE = beat([['一点都不会', '一点也不会', '一点儿都不会', '一点儿也不会']], built('我=wǒ|一点=yì diǎn|都=dōu|不会=bú huì|！'), built('我=wǒ|一点=yì diǎn|也=yě|不会=bú huì|跳=tiào|！'), built('真的=zhēn de|，|我=wǒ|一点=yì diǎn|都=dōu|不会=bú huì|！'));
expect(DANCE, true, ['wo yidianr dou bu hui', 'wo yi dian r ye bu hui tiao', 'zhende, wo yidian er dou bu hui', 'wo yidian dou bu hui', 'wo yidian ye bu hui tiao']);
expect(DANCE, false, ['wo yidianr dou hui', 'wo yidianr', 'wo yidianr dou bu tiao', 'wo bu hui'], { why: 'the no left out, the word cut short or changed' });
// toilet-dash: every answer with 那儿 denies it, so it must be denied
const WHERE = { ...beat([['那边', '那儿', '那里', '右边', '左边', '这边']], built('不是=bú shì|那边=nà biān|！'), built('不是=bú shì|那儿=nàr|！'), built('不是=bú shì|那里=nà lǐ|，|是=shì|左边=zuǒ bian|！')), not: [{ heard: ['是那边', '是右边'], note: "That says he's right." }] };
expect(WHERE, true, ['bu shi nar', 'bu shi na r', 'bushi na er', 'bu shi nar!']);
expect(WHERE, false, ['shi nar', 'shi na r', 'shi na er'], { why: 'said the other way round' });
// a 儿 the build reads as a syllable of its own takes no r inside a word (女儿 nǚ ér, 儿子 ér zi)
const GIRL = beat([['女儿的']], built('这=zhè|是=shì|我=wǒ|女儿=nǚ ér|的=de|书=shū|。')), SON = beat([['儿子']], built('这=zhè|是=shì|我=wǒ|儿子=ér zi|。'));
expect(GIRL, true, ['zhe shi wo nv er de shu', 'zhe shi wo nüer de shu', 'zhe shi wo nu er de shu']);
expect(GIRL, false, ['zhe shi wo nvr de shu', 'zhe shi wo nur de shu'], { why: '女儿 is nǚ ér' });
expect(SON, true, ['zhe shi wo erzi']);
expect(SON, false, ['zhe shi wo rzi'], { why: '儿子 is ér zi' });
// erhua where the need word has none: not this request's, and nothing loosened (content lists both forms)
const NONE = beat([['一点都不会']], built('我=wǒ|一点=yì diǎn|都=dōu|不会=bú huì|！'));
expect(NONE, false, ['wo yidianr dou bu hui', 'wo yi dian r dou bu hui', 'wo yidian er dou bu hui'], { why: 'the need word has no 儿' });

// ---------- spoken: the recogniser's text, by character ----------
expect(ALL, true, ['我一点儿都不会', '真的，我一点儿都不会跳'], { spoken: true });
expect(ALL, false, ['我一点儿都会', '我一点都不会'], { spoken: true, why: 'the no left out, the 儿 left out' }); // 也 for 都 is a slip a long word may have, spoken
expect(ALL, true, ['我一点儿都不会'], { why: 'typed in characters' });
expect(DANCE, true, ['我一点儿都不会', '我一点儿也不会跳', '我一点都不会'], { spoken: true });
expect(NONE, false, ['我一点儿都不会'], { spoken: true, why: 'the need word has no 儿' });
expect(WHERE, true, ['不是那儿'], { spoken: true });
expect(WHERE, false, ['是那儿'], { spoken: true, why: 'said the other way round' });
expect(GIRL, true, ['这是我女儿的书'], { spoken: true });
{ cases++; const v = m.judge(['我一点儿都不会！'], ALL); if (!v.perfect || v.marks.some((x) => x !== 'ok')) problems.push(`spoken model answer 我一点儿都不会！ isn't perfect (${v.marks.join(' ')})`); }

// ---------- square-dance's 我一点儿都不会！ back among cant2@1's answers: judge-check's checks of an answer ----------
const back = built('我=wǒ|一点儿=yì diǎnr|都=dōu|不会=bú huì|！'), D2 = { ...DANCE, answers: [...DANCE.answers, back.zh], ans: [...DANCE.ans, back] };
const L0 = beat([['不会', '不太会']], built('真=zhēn|不会=bú huì|！'), built('我=wǒ|真=zhēn|不会=bú huì|！')); // cant2 at the story's own level, L0
for (const [said, opts, what] of [[back.zh, {}, 'spoken'], [back.zh, { typed: true }, 'typed'], [toneless(back.py), { typed: true }, `typed as pinyin "${toneless(back.py).trim()}"`]]) {
  cases++;
  const v = m.judge([said], D2, opts);
  if (!v.ok || v.alt !== -1 || (opts.typed && v.note)) problems.push(`square-dance cant2@1 with ${back.zh} among its answers: ${what} ${v.ok ? `passes as branch ${v.alt}${v.note ? `, noting ${v.note}` : ''}` : `fails (missing ${v.missing.join(', ')})`}`);
}
expect(L0, true, [back.zh], { spoken: true, why: 'a harder line must pass every easier level' });

// ---------- builds: every need word with 儿 after its first character, as the app plays it ----------
// an answer's sounds as typed, word by word as the build cut it, an erhua's 儿 as r: [[[点, dian], [儿, r]], …]
const words = (e) => (e.t || []).filter((t) => t.length > 1).map((t) => {
  const cs = [...t[0]].filter((c) => HAN.test(c)), ss = toneless(t[1]).trim().split(/\s+/);
  if (ss.length === cs.length - 1 && cs.at(-1) === '儿') ss.push(ss.pop().replace(/r$/, ''), 'r'); // as target() splits it
  return ss.length === cs.length ? cs.map((c, i) => [c, ss[i]]) : [[t[0], ss.join('')]]; // a number (3号, 302) as one piece
});
// the three ways: as the build writes it (yidianr), every sound apart (yi dian r), the erhua a syllable (yidian er)
const ways = (W) => [...new Set([W.map((w) => w.map(([, s]) => s).join('')).join(' '), W.flat().map(([, s]) => s).join(' '), W.map((w) => w.map(([c, s]) => (c === '儿' && s === 'r' ? ' er ' : s)).join('').trim()).join(' ').replace(/ +/g, ' ')])];
const spanOf = (F, w) => { const V = [...w]; return F.findIndex((_, i) => V.every((c, k) => F[i + k]?.[0] === c)); };
// the words W with the characters of v at `at` (n of them) as `put` (pairs, one word of its own)
const swap = (W, at, n, put) => { const F = W.flatMap((x, i) => x.map((p) => [...p, i])), G = [...F.slice(0, at), ...put.map((p) => [...p, -1]), ...F.slice(at + n)]; return G.reduce((out, p, i) => (i && p[2] === G[i - 1][2] ? out.at(-1).push(p) : out.push([p]), out), []).map((x) => x.map(([c, s]) => [c, s])); };
const said = (w) => [...w].map((c, k) => [c, c === '儿' && k ? 'r' : (m.readings(c)?.[0] || '?').slice(0, -1)]); // a word no answer has, as py.json reads it, its 儿 erhua
const other = (c) => ['ga', 'bo', 'te'].find((s) => !(m.readings(c) || []).some((r) => r.startsWith(s) && r.length === s.length + 1)); // a sound it never has
const twin = (w) => w.replace(/([这那哪])儿/g, '$1里').replace(/儿/g, ''); // the same said without the erhua: 一点都不会, 哪里
const tailor = (b, o) => { const { levels, ...t } = b; Object.assign(t, o); if (o.alts) t.alts = o.alts.map(({ of, ...a }) => ({ ...b.alts[of], ...a })); return t; }; // content.js tailor(), one beat

const gate = path.join(ROOT, 'review/gate'), DIRS = ['data', ...(fs.existsSync(gate) ? fs.readdirSync(gate).sort().map((b) => `review/gate/${b}/data`) : [])].filter((d) => fs.existsSync(path.join(ROOT, d, 'content.json')));
const report = new Map(); // dir, beat and word → what fails
for (const dir of DIRS) {
  await m.loadPinyin(`${dir}/py.json`);
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'content.json'), 'utf8')), seen = new Set(), before = problems.length, n0 = cases;
  for (const s of data.scenarios) {
    const all = [], visit = (d) => { if (Array.isArray(d)) d.forEach(visit); else if (d && typeof d === 'object') { if (d.say) all.push(d.say); for (const [k, v] of Object.entries(d)) if (k !== 't' && k !== 'ans') visit(v); } };
    visit(s.steps); for (const [k, v] of Object.entries(s)) if (!['steps', 'cast'].includes(k)) visit(v);
    for (const base of all) for (const lv of [s.level, ...Object.keys(base.levels || {}).map(Number).filter((l) => l !== s.level)]) {
      const b = lv !== s.level ? tailor(base, base.levels[lv]) : base, name = `${s.id}/${base.id}${lv !== s.level ? `@${lv}` : ''}`;
      (b.alts ? [b, ...b.alts] : [b]).forEach((o, alt) => (o.need || []).forEach((g) => g.filter((w) => /.儿/.test(w)).forEach((w) => {
        seen.add(w);
        const where = `${dir} ${name}${alt ? ` alt ${alt - 1}` : ''} "${w}"`, one = { id: b.id, answers: o.answers, ans: o.ans, need: [[w]] }; // the word alone: is it there?
        // each answer with the word, as built; else one with a word of its group, that word put as this one
        let lines = (o.ans || []).filter((e) => e.zh.includes(w)).map((e) => { const W = words(e); return { zh: e.zh, W, at: spanOf(W.flat(), w) }; });
        if (!lines.length) for (const e of o.ans || []) { const v = g.find((x) => x !== w && e.zh.includes(x)), W = v && words(e), at = v ? spanOf(W.flat(), v) : -1; if (at >= 0) { lines = [{ zh: e.zh.replace(v, w), W: swap(W, at, [...v].length, said(w)), at }]; break; } }
        if (!lines.length) { problems.push(`${where}: no answer to try it in`); return; }
        for (const { zh, W, at } of lines) {
          if (at < 0) { problems.push(`${where}: the build's tokens of "${zh}" don't spell it`); continue; }
          const F = W.flat(), n = [...w].length, once = spanOf(F.slice(at + 1), w) < 0;
          for (const t of ways(W)) {
            cases += 2;
            if (!m.judge([t], one, { typed: true }).ok) problems.push(`${where}: typed "${t}" hasn't the word`);
            const v = m.judge([t], b, { typed: true });
            if (!v.ok) problems.push(`${where}: typed "${t}" fails the beat (missing ${v.missing.join(', ')})`);
          }
          // near misses: the 儿 left out, a sound of the word changed (where the word is there once, so it's the one changed)
          const k = F.slice(at, at + n).findIndex(([c]) => c !== '儿'), sound = other(F[at + k][0]);
          const misses = once ? [swap(W, at, n, F.slice(at, at + n).filter(([c], j) => c !== '儿' || !j)), swap(W, at, n, F.slice(at, at + n).map((p, j) => (j === k ? [p[0], sound] : p)))] : [];
          for (const M of misses) for (const t of ways(M)) { cases++; if (m.judge([t], one, { typed: true }).ok) problems.push(`${where}: typed "${t}" (a near miss) has the word`); }
          cases++;
          if (!m.judge([zh], one).ok) problems.push(`${where}: spoken "${zh}" hasn't the word`);
          const plain = zh.replace(w, twin(w));
          if (!m.judge([plain], b).ok) report.set(`${dir} ${name} ${w}`, `${dir} ${name}: "${plain}" (${w} said without its erhua) fails: no word of its group is said that way`);
        }
      })));
    }
  }
  console.log(`${problems.length > before ? 'FAIL' : 'ok  '} ${dir}: ${seen.size} need words with 儿 inside or last (${[...seen].join(' ') || 'none'}), ${cases - n0} judgements`);
}
for (const r of report.values()) console.log(`note ${r}`);
for (const p of problems) console.log(`FAIL ${p}`);
console.log(`${cases} judgements; ${problems.length ? `${problems.length} problems` : 'all good'}`);
process.exit(problems.length ? 1 : 0);
