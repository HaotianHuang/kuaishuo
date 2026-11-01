#!/usr/bin/env node
// tools/judge-check.mjs: runs the real judge (app/shared/match.js) over every built beat in data/content.json, the
// messages' too.
//   errors    an answer that fails its own beat (spoken, typed in characters, or typed as toneless pinyin)
//   warnings  another beat's model answer that would also pass this beat (its `need` may be too loose),
//             and filler that passes ("我不知道", "你好")
//   fumbles   what a stuck learner says ("我忘了", "你在说什么"), and the model answer said the other way round
//             (没信号 → 有信号, 当然可以 → 当然不可以): both should fail every beat. Warnings of their own, for the
//             content owners: tighten `need`, or add a `not` entry with a note
// Every level override is checked too, as the app plays it (the beat tailored to that level, scn/beat@L), and across
// levels: a harder line that fails an easier level is an error (a learner who says more is failed), an easier model
// answer that passes an override above the story's own level a warning (that `need` asks no more than the one below;
// v1's own needs are lenient by design, so a shorter line passing a story's own level is no news).
// node tools/judge-check.mjs [--data=review/gate/<batch>/data] [scenario-id ...]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
globalThis.fetch = async (u) => ({ json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, u.replace(/^\//, '')), 'utf8')) });
const m = await import(path.join(ROOT, 'app/shared/match.js'));
const dir = process.argv.find((a) => a.startsWith('--data='))?.slice(7) || 'data';
await m.loadPinyin(path.relative(ROOT, path.resolve(dir, 'py.json')));
const data = JSON.parse(fs.readFileSync(path.resolve(dir, 'content.json'), 'utf8'));
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const errors = [], warnings = [], fumbles = [];
const toneless = (py) => py.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zü ]/gi, ' ');
const FUMBLES = ['我不知道你在说什么', '你在说什么', '怎么说', '我会说一点中文', '我忘了'];

// answers[0] the other way round, where that's clear: the nos taken out where the meaning is, in a need word or just
// before one (没问题 → 有问题, 没信号 → 有信号, 不是骗子 → 是骗子, 别过来 → 过来; not 特别, 能不能, or a no some other
// answer goes without, 不早说 and 早说), else a no put before the yes-word that starts a need word or comes just before it
// (当然可以 → 当然不可以, 是我 → 不是我, 收到 → 没收到). None for a question: a no doesn't turn 能借吗 round.
const MOD = '是有太很要会能想吃在', NOT_NO = ['特别', '区别', '分别', '差别', '要不', '不得不'];
const YES = ['可以', '收到', '看到', '是', '有', '要', '会', '能', '想', '在', '行', '对', '够', '用', '好', '回'];
const isNo = (c, cs = '不没别未') => !!c && cs.includes(c);
const deniedAt = (a, i) => isNo(a[i - 1]) || (isNo(a[i - 2], '不没别') && isNo(a[i - 1], MOD));
const plainly = (b, w) => b.answers.some((a) => { for (let i = a.indexOf(w); i >= 0; i = a.indexOf(w, i + 1)) if (!deniedAt(a, i)) return true; return false; });
const unNo = (s, i) => s.slice(0, i) + (s[i] === '没' ? '有' : '') + s.slice(i + (s.startsWith('没有', i) ? 2 : 1));
const clause = (s, k) => s.slice(s.slice(0, k).search(/[^，。！？,.!?…]*$/), k + s.slice(k).search(/[，。！？,.!?…]|$/) + 1);
function flip(b) {
  const s = b.answers[0], at = [];
  for (const w of new Set((b.need || []).flat())) for (let i = w ? s.indexOf(w) : -1; i >= 0; i = s.indexOf(w, i + 1)) at.push([i, w]);
  at.sort((x, y) => x[0] - y[0]);
  const nos = new Set();
  for (const [i, w] of at) {
    const k = isNo(w[0]) ? i : isNo(s[i - 1]) ? i - 1 : isNo(s[i - 2], '不没别') && isNo(s[i - 1], MOD) ? i - 2 : -1;
    const either = k > 0 && s[k - 1] === s[k + 1] && !isNo(s[k - 2]); // 用不用, but not the second 不 of 不用不用
    if (k < 0 || either || NOT_NO.some((x) => s.slice(Math.max(0, k - x.length + 1), k + 1) === x || s.startsWith(x, k))) continue;
    if (k < i && plainly(b, w)) continue;
    nos.add(k);
  }
  if (nos.size) return /[吗？?]/.test(clause(s, Math.min(...nos))) ? null : [...nos].sort((x, y) => y - x).reduce(unNo, s);
  const ins = new Map(); // where a no goes → which
  for (const [i] of at) {
    const x = YES.find((y) => s.startsWith(y, i)) || YES.find((y) => i >= y.length && s.slice(i - y.length, i) === y);
    if (x) ins.set(s.startsWith(x, i) ? i : i - x.length, ['有', '收到', '看到'].includes(x) ? '没' : '不');
  }
  if (!ins.size || /[吗？?]/.test(clause(s, Math.min(...ins.keys())))) return null;
  return [...ins].sort((p, q) => q[0] - p[0]).reduce((t, [j, no]) => t.slice(0, j) + no + t.slice(j), s);
}

// a beat as played at one of its level overrides (content.js tailor()): the override's fields over the beat's; its alts,
// if it lists them, in place of the beat's, each the beat's alt `of` with its own changes
const tailor = (b, o) => { const { levels, ...t } = b; Object.assign(t, o); if (o.alts) t.alts = o.alts.map(({ of, ...a }) => ({ ...b.alts[of], ...a })); return t; };
const at = (b, l, base) => (l !== base && b.levels?.[l] ? tailor(b, b.levels[l]) : b);
let overrides = 0;

for (const s of [...data.scenarios, ...(data.messages || [])]) {
  if (only.length && !only.includes(s.id)) continue;
  const all = [];
  const visit = (d) => { if (Array.isArray(d)) d.forEach(visit); else if (d && typeof d === 'object') { if (d.say) all.push(d.say); for (const [k, v] of Object.entries(d)) if (k !== 't' && k !== 'ans') visit(v); } };
  visit(s.steps); for (const [k, v] of Object.entries(s)) if (!['steps', 'cast'].includes(k)) visit(v);
  // every beat at every level it has, each judged among the other beats at that level
  const plays = all.flatMap((b) => [[s.level, b], ...Object.keys(b.levels || {}).map((k) => [Number(k), b])]);
  overrides += plays.length - all.length;
  for (const [lv, base] of plays) {
    const b = at(base, lv, s.level), beats = all.map((x) => at(x, lv, s.level)), name = `${base.id}${lv !== s.level ? `@${lv}` : ''}`;
    const opts = [{ o: b, alt: -1 }, ...(b.alts || []).map((o, i) => ({ o, alt: i }))];
    for (const { o, alt } of opts) {
      (o.ans || []).forEach((a, i) => {
        const where = `${s.id}/${name}${alt >= 0 ? ` alt ${alt}` : ''} answer ${i} "${a.zh}"`;
        const spoken = m.judge([a.zh], b), typed = m.judge([a.zh], b, { typed: true }), pin = m.judge([toneless(a.py)], b, { typed: true });
        if (!spoken.ok || spoken.alt !== alt) errors.push(`${where}: spoken → ${spoken.ok ? `branch ${spoken.alt}` : `fails (${spoken.note || `missing ${spoken.missing.join(', ')}`})`}`);
        if (!typed.ok) errors.push(`${where}: typed fails`);
        if (!pin.ok) errors.push(`${where}: typed as pinyin "${toneless(a.py).trim()}" fails (missing ${pin.missing.join(', ')})`);
        if (typed.note) errors.push(`${where}: a mistake note fires on a right answer: ${typed.note}`);
      });
    }
    for (const other of beats) if (other.id !== b.id && other.answers[0] !== b.answers[0] && m.judge([other.answers[0]], b).ok) warnings.push(`${s.id}/${name}: "${other.answers[0]}" (from ${other.id}) also passes`);
    for (const filler of ['我不知道', '你好', '对不起', '谢谢']) if (!b.answers.some((a) => a.includes(filler)) && m.judge([filler], b).ok) warnings.push(`${s.id}/${name}: "${filler}" passes`);
    const said = opts.flatMap(({ o }) => o.answers);
    for (const f of FUMBLES) if (!said.some((a) => a.includes(f)) && m.judge([f], b).ok) fumbles.push(`${s.id}/${name}: "${f}" passes`);
    const back = flip(b), v = back && m.judge([back], b);
    if (v?.ok) fumbles.push(`${s.id}/${name}: "${back}" (the model answer the other way round) passes${v.alt >= 0 ? ` as alt ${v.alt}` : ''}`);
  }
  // across levels: what a harder level accepts, every easier one accepts too, as the main line
  for (const base of all) {
    const lvs = [s.level, ...Object.keys(base.levels || {}).map(Number)].sort((x, y) => x - y);
    for (const hi of lvs) for (const lo of lvs.filter((l) => l < hi)) {
      const easy = at(base, lo, s.level), hard = at(base, hi, s.level), tag = (l) => `${base.id}${l !== s.level ? `@${l}` : ''}`;
      for (const a of hard.answers) { const r = m.judge([a], easy); if (!r.ok || r.alt !== -1) errors.push(`${s.id}/${tag(lo)}: "${a}" (from ${tag(hi)}) ${r.ok ? `is taken as branch ${r.alt}` : `fails (${r.note || `missing ${r.missing.join(', ')}`})`}: a harder line must pass every easier level`); }
      if (hi !== s.level && m.judge([easy.answers[0]], hard).ok) warnings.push(`${s.id}/${tag(hi)}: "${easy.answers[0]}" (the level ${lo} line) also passes: the harder level asks no more`);
    }
  }
}
for (const w of warnings) console.log('warn  ' + w);
for (const f of fumbles) console.log('fumble ' + f);
for (const e of errors) console.log('ERROR ' + e);
console.log(`${overrides} level overrides with their beats; ${errors.length} errors, ${warnings.length} warnings, ${fumbles.length} fumbles that pass`);
process.exit(errors.length ? 1 : 0);
