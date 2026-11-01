// Judging what the player said or typed, by sound. A recogniser may write 接 for 借 or 3 for 三, and a learner may
// type pinyin without a Chinese keyboard, so both sides become syllables before they're compared: the same
// syllable passes, the same syllable with another tone passes but is pointed out, and each beat's `need` groups
// (CONTENT.md) decide whether the meaning got across (a need word of one syllable needs its own tone: 水 isn't 睡; in
// another tone where the word goes, 来杯睡, it's a slip, the wrong character for the right sound: typed it passes,
// with a note, spoken it doesn't).
import * as content from './content.js';
import * as files from './files.js';

let READ = null; // character → its readings, most common first: 还 → ['hai2', 'huan2']
let SYL = null;  // every toneless syllable, for splitting typed pinyin
let TYP = null;  // the syllables typed pinyin is cut into: not the n, ng, hm of interjections; ü typed as v or u

export async function loadPinyin(url = 'data/py.json') {
  const groups = await files.json(url);
  READ = new Map(); SYL = new Set();
  for (const [rs, chars] of Object.entries(groups)) {
    const list = rs.split(' ');
    for (const c of chars) READ.set(c, list);
    for (const r of list) SYL.add(r.slice(0, -1));
  }
  TYP = new Set([...SYL].filter((s) => !/^(n|ng|m|hm|hng)$/.test(s)).flatMap((s) => [s, s.replace(/v/g, 'u')]));
}
export const ready = () => !!READ;
export const readings = (c) => READ?.get(c) || null;

const HAN = /[\u4e00-\u9fff]/;
const MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };

// "jiè" → "jie4", "lǜ" → "lv4", "de" → "de5"
export function mark2num(s) {
  let tone = 5, base = '';
  for (const ch of s.normalize('NFC').toLowerCase()) {
    const v = Object.keys(MARKS).find((k) => MARKS[k].includes(ch));
    if (v) { tone = MARKS[v].indexOf(ch) + 1; base += v; } else base += ch;
  }
  return base.replace(/ü/g, 'v').replace(/[^a-z]/g, '') + tone;
}
// "jie4" → "jiè": the mark goes on a or e, else on the o of ou, else on the last vowel.
export function num2mark(s) {
  const m = /^([a-zv]+)([1-5])$/.exec(String(s).toLowerCase());
  if (!m) return s;
  const b = m[1].replace(/v/g, 'ü'), t = +m[2];
  if (t === 5) return b;
  const i = /[ae]/.test(b) ? b.search(/[ae]/) : b.includes('ou') ? b.indexOf('o') : Math.max(...['i', 'o', 'u', 'ü'].map((v) => b.lastIndexOf(v)));
  return i < 0 ? b : b.slice(0, i) + MARKS[b[i]][t - 1] + b.slice(i + 1);
}

// ---------- numbers: recognisers write digits ----------
const DIG = '零一二三四五六七八九';
function spoken(n) {
  if (n === 0) return '零';
  const ds = String(n).split('').map(Number), U = ['', '十', '百', '千', '万'];
  let out = '', gap = false;
  ds.forEach((d, i) => { if (!d) gap = true; else { if (gap && out) out += '零'; gap = false; out += DIG[d] + U[ds.length - 1 - i]; } });
  return out.replace(/^一十/, '十');
}
const byDigit = (s) => [...s].map((d) => DIG[d]).join('');
// "3号" → ["三号"]; "302" → ["三百零二", "三零二"] (a room number may be read either way); "7:30" → 七点半 or 七点三十
// (a digit straight after a letter is a typed tone, jie4 or lu:4, and stays)
export function variants(text) {
  const t = String(text).normalize('NFKC');
  if (!/\d/.test(t)) return [t];
  const clock = (half) => t.replace(/(^|[^\d:])(\d{1,2}):([0-5]\d)(?![\d:])/g, (m, pre, hh, mm) => pre + (+hh === 2 ? '两' : spoken(+hh)) + '点' + (mm === '00' ? '' : mm === '30' && half ? '半' : mm[0] === '0' ? '零' + DIG[mm[1]] : spoken(+mm)));
  const out = [];
  for (const c of new Set([clock(true), clock(false)])) {
    const swap = (f) => c.replace(/(u:|[a-zA-Zü])?(\d+)/g, (m, pre, d) => (pre ? m : f(d)));
    out.push(swap((m) => (m.length <= 5 ? spoken(+m) : byDigit(m))), swap(byDigit));
  }
  return [...new Set(out)];
}

// ---------- positions: one sound each ----------
const pos = (ch, rs) => ({ ch, rs, bare: rs.map((r) => r.slice(0, -1)) });

// "neng2jie4nide" → neng2 jie4 ni? de? (a typed tone digit belongs to the syllable just before it; a syllable
// typed without one could be any tone).
function splitPinyin(chunk) {
  const out = [];
  for (const [, letters, d] of chunk.toLowerCase().replace(/u:/g, 'v').matchAll(/([a-zv]+)([1-5]?)/g)) {
    const syls = [];
    for (let i = 0; i < letters.length;) {
      let n = Math.min(6, letters.length - i);
      while (n > 0 && !SYL?.has(letters.slice(i, i + n))) n--;
      if (!n) { syls.length = 0; break; }
      syls.push(letters.slice(i, i + n)); i += n;
    }
    if (!syls.length) { out.push(pos(null, [letters + '5'])); continue; } // not pinyin (an English word): keep it whole
    syls.forEach((s, k) => out.push(k === syls.length - 1 && d ? pos(null, [s + d]) : pos(null, [1, 2, 3, 4, 5].map((t) => s + t))));
  }
  return out;
}

// What the player said or typed → positions. A character takes its usual reading only (说 is shuō, not the shuì of
// 游说): the recogniser or the keyboard already chose it for its sound. Typed pinyin is split into syllables.
// A position after punctuation or a space is marked `gap`: a 不 in the clause before doesn't reach it.
export function heard(text) {
  const out = [];
  let end = 0;
  for (const m of String(text).normalize('NFKC').matchAll(/[\u4e00-\u9fff]|[a-zA-Züv:]+[1-5]?(?:[a-zA-Züv:]+[1-5]?)*/g)) {
    const t = m[0], at = out.length;
    if (HAN.test(t)) out.push(pos(t, (readings(t) || ['?5']).slice(0, 1)));
    else out.push(...splitPinyin(t.replace(/[\u00fc\u01d6\u01d8\u01da\u01dc\u00dc]/g, 'v').normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    if (!out[at]) continue; // a lone ':' (the colon of u:) made no sound: it's punctuation, so the gap stays open
    if (m.index > end) out[at].gap = true;
    end = m.index + t.length;
  }
  return out;
}

// A built answer ({zh, py, t}) → positions with the exact reading the build gave each character.
export function target(entry) {
  const out = [];
  for (const tok of entry.t || []) {
    if (tok.length < 2) continue;
    const chars = [...tok[0]].filter((c) => HAN.test(c)), syls = tok[1].split(' ');
    if (syls.length === chars.length - 1 && chars[chars.length - 1] === '儿') { syls[syls.length - 1] = syls[syls.length - 1].replace(/r$/, ''); syls.push('er'); }
    chars.forEach((c, i) => out.push(pos(c, [syls[i] ? mark2num(syls[i]) : (readings(c) || ['?5'])[0]])));
  }
  return out;
}
const loose = (text) => [...text].filter((c) => HAN.test(c)).map((c) => pos(c, readings(c) || ['?5']));
// A need word as the option's own answers read it, every way they do (说 in 您说 is shuō, never shuì; 给 is gěi, not
// jǐ), so another reading of its characters doesn't count; all readings when no answer has it. BOTH are one word
// said either way (谁 shéi or shuí), and the build picks just one.
const BOTH = '谁哪血喂';
function asSaid(w, o) {
  const W = [...w].filter((c) => HAN.test(c)), rs = W.map((c) => new Set(BOTH.includes(c) ? readings(c) : []));
  let found = false;
  for (const e of o.ans || []) { const T = target(e); T.forEach((_, i) => { if (W.every((c, k) => T[i + k]?.ch === c)) { found = true; W.forEach((_, k) => T[i + k].rs.forEach((r) => rs[k].add(r))); } }); }
  return found ? W.map((c, k) => pos(c, [...rs[k]])) : loose(w);
}

// ---------- comparing ----------
const same = (h, t) => (h.ch && h.ch === t.ch) || h.bare.some((b) => t.bare.includes(b));
const EQUIV = { er: ['liang'], liang: ['er'] }; // 二 and 两 are the same number

function cost(h, t) {
  if (h.ch && h.ch === t.ch) return [0, 'ok'];
  if (h.rs.includes(t.rs[0])) return [0.1, 'homo'];
  if (h.bare.includes(t.bare[0])) return [0.35, 'tone'];
  if ((EQUIV[t.bare[0]] || []).some((b) => h.bare.includes(b))) return [0.2, 'homo'];
  return [1, 'sub'];
}

// Edit distance between heard and target positions, with what happened to each target sound.
export function align(H, T) {
  const n = H.length, m = T.length, D = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  for (let i = 1; i <= n; i++) D[i][0] = i * 0.5;
  for (let j = 1; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 0.5, D[i][j - 1] + 1, D[i - 1][j - 1] + cost(H[i - 1], T[j - 1])[0]);
  const marks = Array(m).fill('miss'), notes = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    if (i && j && Math.abs(D[i][j] - D[i - 1][j - 1] - cost(H[i - 1], T[j - 1])[0]) < 1e-6) {
      const [, st] = cost(H[i - 1], T[j - 1]);
      marks[j - 1] = st;
      if (st === 'tone' || st === 'homo') notes.unshift({ st, want: T[j - 1], got: H[i - 1] });
      i--; j--;
    } else if (j && (!i || Math.abs(D[i][j] - D[i][j - 1] - 1) < 1e-6)) j--;
    else i--;
  }
  return { score: m ? Math.max(0, 1 - D[n][m] / m) : 0, marks, notes };
}

// Is the word at H[i] said the other way round? 不/没/别/未 just before it, or 不/没/别 then one or two of
// 是有太很要会能想吃在被把 (不是我, 没有漏水, 不在厨房, 不能吃辣, 不太会跳, 没被锁), in the same clause. 特别, 区别, 分别,
// 差别, 要不 and 不得不 aren't a no, and neither is an either-or question (有没有人, 能不能借, 是不是骗子) or a question
// with 吗 (这不是谣言吗, 不能便宜点吗, 没有牛奶吗). A typed syllable stands for its usual character (bu is 不), but wei is
// too seldom 未 to count.
const NO = '不没别未', NO2 = '不没别', MOD = '是有太很要会能想吃在被把', NOT_NO = ['特别', '区别', '分别', '差别', '要不', '不得不'];
const is = (p, cs) => !!p && [...cs].some((c) => (p.ch ? p.ch === c : c !== '未' && p.bare.includes(readings(c)?.[0].slice(0, -1))));
const twin = (a, b) => (a.ch && b.ch ? a.ch === b.ch : same(a, b)); // 有没有, 能不能: the same character twice (typed pinyin goes by sound)
const ends = (H, k, w) => { const W = [...w], s = k - W.length + 1; return s >= 0 && W.every((c, j) => is(H[s + j], c) && (!j || !H[s + j].gap)); };
const no = (H, k, cs) => is(H[k], cs) && !NOT_NO.some((w) => [...w].some((_, j) => ends(H, k + j, w))); // not inside 特别 or 不得不
const either = (H, k) => k > 0 && !H[k].gap && !!H[k + 1] && !H[k + 1].gap && twin(H[k - 1], H[k + 1]); // the 不 of 能不能
function negated(H, i) {
  if (i < 1 || H[i].gap) return false;
  if (no(H, i - 1, NO)) return !either(H, i - 1);
  let k = i - 1;
  while (k > Math.max(0, i - 3) && !H[k].gap && is(H[k], MOD)) k--; // back over one or two of MOD to where the no would be
  if (k === i - 1 || !no(H, k, NO2) || either(H, k)) return false;
  for (let j = i + 1; j < H.length && !H[j].gap; j++) if (is(H[j], '吗嘛') || (is(H[j], '吧') && ends(H, i - 1, '不会是'))) return false; // a question asks for it: 不能便宜点吗; 不会是骗子吧 fears it is
  return true;
}
// Is the word at H[i] (n sounds) denied at all? Looser than negated(), for a word every answer denies (没信号, 别过来,
// 不会跳), so the same denial put another way counts too: a no up to four sounds before it in its clause (我不太会跳,
// 别再过来, 不是什么骗子) that isn't an either-or (会不会跳), or one just after it (信号没了, 信号都没有, 跳不了) that
// isn't a yes (信号不错, 没问题).
const YES = ['不错', '没问题', '没事', '没关系'];
function denied(H, i, n) {
  for (let k = i - 1; k >= Math.max(0, i - 4) && !H[k + 1].gap; k--) if (no(H, k, NO) && !either(H, k) && !YES.some((w) => ends(H, k + w.length - 1, w))) return true;
  const j = i + n + (is(H[i + n], '都也') && !H[i + n].gap ? 1 : 0);
  return !!H[j] && !H[j].gap && no(H, j, '不没') && !either(H, j) && !YES.some((w) => ends(H, j + w.length - 1, w));
}
// Which way round a need word must be said: 1 not after a no (不是我 isn't 是我); -1 after one, when every answer that
// has it denies it (没信号: 有信号 isn't it); 0 either, for a word with its own no (没定) or one the answers say both
// ways (那您怎么不早说, 您早说啊).
function polarity(w, o) {
  if (NO.includes(w[0])) return 0;
  const W = [...w], said = [];
  for (const a of o.answers || []) { const A = heard(a), I = A.map((_, i) => i).filter((i) => W.every((c, k) => A[i + k]?.ch === c)); if (I.length) said.push([A, I]); }
  if (!said.some(([A, I]) => I.some((i) => negated(A, i)))) return 1;
  return said.every(([A, I]) => I.some((i) => denied(A, i, W.length))) ? -1 : 0;
}
const way = (H, i, n, pol) => (pol > 0 ? !negated(H, i) : pol < 0 ? denied(H, i, n) : true); // said the way `pol` wants

// Does `item` (a need word) occur in what was heard? Same character or same toneless syllable; a word of three or
// more sounds may have one slip, unless `strict` (a mistake is usually one sound away from the right answer, so
// it has to match exactly or it would fire on people who said it right). The slip must sound like what it stands
// for, as a recogniser's slip does (忙一点 for 慢一点, never 说一点), and can't be where the meaning is: a no or a
// number in the word (有问题 isn't 没问题, 一二零 isn't 一一零), or a heard no (来不及 isn't 来得及). A word of one sound
// is too short to go by toneless sound: it takes its own character or its own tone (水 isn't 睡, 网 isn't 忘).
// `pol` is polarity(): 1, a match said the other way round doesn't count (不是我 isn't 是我); -1, only a denied one does.
const KEY = /[不没别未无非零一二三四五六七八九十百千万两幺]/;
const one = (h, p) => (h.ch && h.ch === p.ch) || h.rs.some((r) => p.rs.includes(r));
const INI = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw]?)(.*)$/; // initial and final
const near = (h, p) => h.bare.some((a) => p.bare.some((b) => { const x = INI.exec(a), y = INI.exec(b); return x[1] === y[1] || x[2] === y[2]; }));
export function contains(H, item, strict = false, pol = 0) {
  const P = typeof item === 'string' ? loose(item) : item;
  if (!P.length) return true;
  const eq = P.length === 1 ? one : same;
  for (let i = 0; i + P.length <= H.length; i++) {
    let hits = 0, slip = -1;
    for (let k = 0; k < P.length; k++) if (eq(H[i + k], P[k])) hits++; else slip = k;
    const ok = hits === P.length || (!strict && P.length >= 3 && hits === P.length - 1 && (P.length >= 4 || near(H[i + slip], P[slip])) && !KEY.test(P[slip].ch || '') && !/[不没别]/.test(H[i + slip].ch || ''));
    if (ok && way(H, i, P.length, pol)) return true;
  }
  return false;
}

// ---------- typed pinyin, compared letter by letter ----------
// Typed pinyin can't be split into syllables reliably (huangei: huan gei or huang ei?), so it's compared as letters,
// cut wherever one of the cheapest readings of each chunk breaks: a syllable costs nothing, unless it starts with a,
// o or e inside a chunk (that takes an apostrophe: xi'an); r after a syllable is 儿; a stray letter (a typo, an
// English word) costs 10. A need word must start and end on cuts, so hao has no ha in it and hello no e.
const isPinyin = (t) => !HAN.test(t) && /[a-z]/i.test(t);
const letters = (t) => String(t).replace(/[üǖǘǚǜÜ]/g, 'v').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
// → { L: the letters, cuts: offsets in L, units: the pieces between cuts as positions (gap after punctuation), idx: offset → unit }
function cut(text) {
  const s = String(text).replace(/u:/gi, 'v').replace(/[üǖǘǚǜÜ]/g, 'v').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const C = { L: '', cuts: new Set([0]), units: [], idx: new Map() };
  let end = 0;
  for (const m of s.matchAll(/[a-z]+/g)) {
    const c = m[0], n = c.length, f = [0], g = [], ks = [0];
    const price = (i, j) => { const x = c.slice(i, j); return TYP?.has(x) ? (i && /^[aoe]/.test(x) ? 1 : 0) : x === 'r' && i ? 0 : j - i === 1 ? 10 : Infinity; };
    for (let j = 1; j <= n; j++) { f[j] = Infinity; for (let i = Math.max(0, j - 6); i < j; i++) f[j] = Math.min(f[j], f[i] + price(i, j)); }
    g[n] = 0; for (let i = n - 1; i >= 0; i--) { g[i] = Infinity; for (let j = i + 1; j <= Math.min(n, i + 6); j++) g[i] = Math.min(g[i], g[j] + price(i, j)); }
    // after n or ng, a missing apostrophe may cost the cut: jiuminga is jiu min ga by the rules, but means jiuming a
    for (let j = 1; j < n; j++) if (f[j] + g[j] - f[n] <= (/ng?$/.test(c.slice(0, j)) && /[aoe]/.test(c[j]) ? 1 : 0)) ks.push(j);
    ks.push(n);
    for (let x = 0; x + 1 < ks.length; x++) {
      const u = pos(null, [c.slice(ks[x], ks[x + 1]) + '5']);
      if (!x && /[^\s\d'’-]/.test(s.slice(end, m.index))) u.gap = true; // spaces, apostrophes, hyphens and tone digits only separate syllables
      C.idx.set(C.L.length + ks[x], C.units.length); C.units.push(u); C.cuts.add(C.L.length + ks[x + 1]);
    }
    C.L += c; end = m.index + n;
  }
  return C;
}
// every way a need word could be typed without tones (each of its readings; ü as v or u; 儿 after a sound as r, as
// pinyin writes erhua: at the word's end, 一点儿 yidianr, and inside it where it's erhua, toneless as target() reads
// the build's diǎnr, 一点儿都不会 yidianrdoubuhui, but not the ér of 女儿的 nǚ ér de; a word no answer has reads 儿
// every way, as it reads every character)
function spellings(P) {
  let out = [''];
  P.forEach((p, i) => {
    let rs = [...new Set(p.rs.map((r) => r.slice(0, -1)))];
    if (p.ch === '儿' && i && (i === P.length - 1 || p.rs.includes('er5'))) rs.push('r');
    rs = [...new Set(rs.flatMap((r) => (r.includes('v') ? [r, r.replace(/v/g, 'u')] : [r])))];
    out = out.flatMap((s) => rs.map((r) => s + r)).slice(0, 96);
  });
  return out;
}
const typedHas = (C, n) => n.sp.some((sp) => {
  for (let i = C.L.indexOf(sp); i >= 0; i = C.L.indexOf(sp, i + 1)) if (C.cuts.has(i) && C.cuts.has(i + sp.length)) { const u = C.idx.get(i); if (way(C.units, u, (C.idx.get(i + sp.length) ?? C.units.length) - u, n.pol)) return true; }
  return false;
});
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] !== b[j - 1])); p = t; } }
  return d[b.length];
}

// ---------- slips: the right sound, the wrong character ----------
// A need group that failed may still have one of its one-sound words there in another tone, said the right way round
// (拉 lā for 辣 là): a slip of the keyboard or the tiles, or of the voice the recogniser wrote down. Only in the word's
// place in one of the answers `Ts` (target()), a sound beside it the same (太拉了 for 太辣了, 能接一下 for 借一下): one
// sound in another tone anywhere would be most lines (微 in 这也叫微辣 isn't 喂). → { g, n, i } or null
const placed = (H, i, p, Ts) => Ts.some((T) => T.some((t, j) => { const l = i > 0 && j > 0, r = !!H[i + 1] && !!T[j + 1]; return t.ch === p.ch && (l || r) && (!l || same(H[i - 1], T[j - 1])) && (!r || same(H[i + 1], T[j + 1])); })); // the sounds either side the same, wherever both lines have one
const toneless = (H, n, pol, Ts) => (n.P.length === 1 ? H.findIndex((h, k) => same(h, n.P[0]) && placed(H, k, n.P[0], Ts) && way(H, k, 1, pol)) : -1);
function slipIn(H, g, Ts) {
  for (const n of g) { const i = toneless(H, n, n.pol, Ts); if (i >= 0) return { g, n, i }; }
  return null;
}
// as a tone note: { ch: 辣, want: là, got: lā, heard: 拉 } (each side in the reading the other one shares a syllable with)
const slipTone = ({ n, i }, H) => { const p = n.P[0], h = H[i], r = (x, y) => x.rs.find((s) => y.bare.includes(s.slice(0, -1))) || x.rs[0]; return { ch: p.ch, want: num2mark(r(p, h)), got: num2mark(r(h, p)), heard: h.ch }; };
// A word's first sense, for a slip's note: the beat's own key, its answers' tokens, else any line's in the content (拉
// is in no answer), 'to pull; to play' → 'pull'. Without the content (tools/judge-check.mjs), the beat's alone.
let GLOSS = null;
function sense(w, o, beat) {
  const d = content.get();
  if (!GLOSS && d) { GLOSS = new Map(); const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') for (const k in x) if (k === 't' && Array.isArray(x.t)) x.t.forEach((t) => t[2] && !GLOSS.has(t[0]) && GLOSS.set(t[0], t[2])); else walk(x[k]); }; walk(d.scenarios); }
  const g = (o.key || beat.key || {})[w] || [o, beat].flatMap((x) => x.ans || []).flatMap((e) => e.t || []).find((t) => t[0] === w && t[2])?.[2] || GLOSS?.get(w) || '';
  return /^(?:[^;(]|\([^)]*\))*/.exec(g)[0].trim().replace(/^to /, '').replace(/^\((.*)\)$/, '$1'); // a sense in brackets, (passive: by), keeps one pair
}

// The verdict on one beat. `said` is the recogniser's guesses (best first) or the typed text; `typed` is a keyboard or
// tiles, where a slip (拉 for 辣) passes: the right sound, so the right word, with its character put right.
// → { ok, perfect, alt (-1 for the main line, else the index in beat.alts), score, heard, answer, marks, tones,
//     chars (typed homophones), missing, note (a `not` entry's or a known mistake's, that it says the opposite, or
//     the slip's: 辣 là (hot), not 拉 lā (pull)), slip (a one-sound need word was there only in another tone, and
//     nothing else was wrong: typed it passes, with the slip in tones; spoken it's a miss, the recogniser heard that
//     tone) }
export function judge(said, beat, { typed = false } = {}) {
  const list = (Array.isArray(said) ? said : [said]).filter((s) => s && String(s).trim());
  // each need word as the option's answers say it, typed spellings, and which way round it must be said
  const options = [{ o: beat, alt: -1 }, ...(beat.alts || []).map((o, i) => ({ o, alt: i }))].map(({ o, alt }) => ({ o, alt,
    need: (o.need || []).map((g) => g.map((w) => { const P = asSaid(w, o); return { w, P, sp: spellings(P), pol: polarity(w, o) }; })) }));
  // a pass, then a pass by a slip, then the rest; fewer words missing (a slip half of one), then the closer
  const rank = (x) => (x.ok ? (x.slip ? 9 : 10) : 0) - x.failed.length - x.slips.length / 2 + x.score + (x.alt === -1 ? 0.01 : 0);
  // a beat's `not` list: what sounds near enough but says something else (有信号), failed with its note; not when
  // said after a no (没有信号 isn't 有信号)
  const nots = (has) => (beat.not || []).find((x) => [].concat(x.heard || []).filter((w) => HAN.test(w)).some(has)); // a bad entry can't throw or match everything
  let best = null;
  for (const raw of list) for (const text of variants(raw)) {
    if (isPinyin(text)) {
      // typed pinyin has no tones, so a one-character not (卖 for 买) can't be told from the right word: only longer ones count
      const C = cut(text), nope = nots((w) => [...w].filter((c) => HAN.test(c)).length > 1 && typedHas(C, { sp: spellings(loose(w)), pol: 1 }));
      for (const { o, alt, need } of options) {
        const failed = need.filter((g) => !g.some((n) => typedHas(C, n)));
        let top = { score: -1 };
        (o.ans || []).forEach((e, i) => { const T = letters(e.py || ''); const sc = T ? Math.max(0, 1 - lev(C.L, T) / Math.max(C.L.length, T.length)) : 0; if (sc > top.score) top = { score: sc, answer: i, marks: target(e).map(() => 'homo'), notes: [] }; });
        const flip = failed.some((g) => g.some((n) => n.pol && typedHas(C, { ...n, pol: 0 })));
        const c = { ok: !failed.length && !nope, alt, failed, slips: [], missing: failed, heard: text, H: [], ...top, pinyin: true, nope, flip }; // typed pinyin goes by toneless sound already
        if (!best || rank(c) > rank(best)) best = c;
      }
      continue;
    }
    const H = heard(text);
    if (!H.length) continue;
    const nope = nots((w) => contains(H, w, true, 1));
    for (const { o, alt, need } of options) {
      const failed = need.filter((g) => !g.some((n) => contains(H, n.P, false, n.pol)));
      const entries = o.ans || (o.answers || []).map((zh) => ({ zh, t: [[zh, loose(zh).map((p) => num2mark(p.rs[0])).join(' ')]] })), Ts = entries.map(target);
      let top = { score: -1 };
      Ts.forEach((T, i) => { const a = align(H, T); if (a.score > top.score) top = { ...a, answer: i }; });
      // each slip's character put right (憋过来 → 别过来), so what hangs on it is judged as meant; what fails even then is
      // missing, or there the wrong way round: in its own tone (不能吃辣), or in another after a no (不能吃拉; one that must
      // be denied and isn't, in another tone, is too likely another word: 我忘了 isn't 有网)
      const slips = failed.map((g) => slipIn(H, g, Ts)).filter(Boolean), F = slips.length ? H.map((h, i) => { const s = slips.find((x) => x.i === i); return s ? { ...s.n.P[0], gap: h.gap } : h; }) : H;
      const still = slips.length ? failed.filter((g) => !g.some((n) => contains(F, n.P, false, n.pol))) : failed;
      const flip = still.some((g) => g.some((n) => (n.pol && contains(F, n.P, false, 0)) || (n.pol > 0 && toneless(F, n, 0, Ts) >= 0)));
      // nothing wrong but a tone (拉 for 辣), and nothing listed as `not`: a slip. Typed it passes; spoken it's a miss
      const slip = !!slips.length && !still.length && !nope, missing = failed.filter((g) => still.includes(g) || (!typed && slips.some((s) => s.g === g)));
      const c = { ok: (typed ? !still.length : !failed.length) && !nope, alt, failed: still, slips, slip, missing, heard: text, H, ...top, nope, flip };
      if (!best || rank(c) > rank(best)) best = c;
    }
  }
  if (!best) return { ok: false, perfect: false, alt: -1, score: 0, heard: '', answer: 0, marks: [], tones: [], chars: [], missing: (beat.need || []).map((g) => g[0]), note: '', slip: false };
  const o = best.alt < 0 ? beat : beat.alts[best.alt];
  const tones = best.notes.filter((x) => x.st === 'tone' && x.got.ch !== x.want.ch).map((x) => ({ ch: x.want.ch, want: num2mark(x.want.rs[0]), got: num2mark(x.got.rs.find((r) => r.slice(0, -1) === x.want.bare[0]) || x.got.rs[0]), heard: x.got.ch }));
  // a slip is in the tones even where the answer it was lined up with put that word somewhere else
  for (const t of best.slips.map((s) => slipTone(s, best.H))) if (!tones.some((x) => x.ch === t.ch && x.heard === t.heard && x.got === t.got)) tones.push(t);
  const chars = typed ? best.notes.filter((x) => x.st === 'homo' && x.got.ch && x.got.ch !== x.want.ch).map((x) => ({ want: x.want.ch, got: x.got.ch, py: num2mark(x.want.rs[0]) })) : [];
  const gloss = (w) => { const g = w && sense(w, o, beat); return g ? ` (${g})` : ''; };
  const slipNote = () => best.slips.map((s) => slipTone(s, best.H)).map((t) => `${t.ch} ${t.want}${gloss(t.ch)}, not ${t.heard ? `${t.heard} ` : ''}${t.got}${gloss(t.heard)}`).join('; ');
  // a mistake marked typed sounds just like the right answer (在 for 再), so only a keyboard or tiles can make it
  const note = best.nope?.note || (best.pinyin ? '' : (beat.mistakes || []).filter((mk) => typed || !mk.typed).find((mk) => mk.heard.some((w) => (mk.typed ? best.heard.includes(w) : contains(best.H, w, true))))?.note) || (best.flip ? 'That says the opposite.' : '') || (best.slip ? slipNote() : '');
  return {
    // a pass that made one of the beat's known mistakes isn't perfect, however close it sounds
    ok: best.ok, perfect: best.ok && best.score >= 0.8 && !note, alt: best.alt, score: +best.score.toFixed(2), heard: best.heard, answer: best.answer,
    // typed, a slip's word isn't missing (it's there, in the wrong character); spoken, it is
    marks: best.marks, tones, chars, missing: best.missing.map((g) => g[0].w), note, entry: (o.ans || [])[best.answer], slip: !!best.slip,
  };
}

// The model answer with the needed words blanked wherever they occur: 能＿你的＿＿打个电话吗？ (a scaffold: the shape
// of the sentence, the words to recall). A blank takes the whole of each word it touches, as the build cut the answer
// (早知道 → ＿＿＿, never ＿＿道), and blanks that overlap (八零, 零二) are one: 八零二 → ＿＿＿.
function spans(beat) {
  const s = beat.answers[0], S = [...s], e = beat.ans?.[0], edge = [0], all = [], runs = [];
  if (e?.t && e.t.map((x) => x[0]).join('') === s) for (const [w] of e.t) edge.push(edge[edge.length - 1] + [...w].length);
  else S.forEach((_, i) => edge.push(i + 1)); // not built: each character is a word
  for (const g of beat.need || []) {
    const W = [...(g.find((x) => x && s.includes(x)) || '')];
    if (W.length) S.forEach((_, i) => { if (W.every((c, k) => S[i + k] === c)) all.push([edge.filter((x) => x <= i).pop(), edge.find((x) => x >= i + W.length)]); });
  }
  for (const [a, b] of all.sort((x, y) => x[0] - y[0])) { const r = runs[runs.length - 1]; if (r && a < r[1]) r[1] = Math.max(r[1], b); else runs.push([a, b]); }
  return runs;
}
export function frame(beat) {
  const S = [...beat.answers[0]];
  for (const [a, b] of spans(beat)) S.fill('＿', a, b);
  return S.join('');
}
// The blanked words, once each in sentence order: what the hint's key under the frame glosses.
export const blanks = (beat) => [...new Set(spans(beat).map(([a, b]) => [...beat.answers[0]].slice(a, b).join('')))];

// Word tiles for building the model answer, plus a few decoys from elsewhere, shuffled.
export function tiles(entry, decoys = [], n = 3) {
  const words = (entry.t || []).filter((t) => t.length > 1).map((t) => t[0]);
  const pool = [...new Set(decoys.filter((w) => HAN.test(w) && !words.includes(w)))];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const all = [...words.map((w, i) => ({ w, i })), ...pool.slice(0, n).map((w) => ({ w, i: -1 }))];
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return { words, tiles: all };
}
