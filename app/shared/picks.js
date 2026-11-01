// What a scenario offers beside itself, for the cards dealt after it (mix.js, and the ranker): lines of its cast to
// shadow, words of its answers to write. Each takes the story as it was played: at its own level, or tailored to
// another (content.tailor(): a beat's override, its lines scn/beat@L), so a word to write comes from the lines said
// (content request 5). DOM-free, so Node deals them too (tools/sim.mjs).

// Lines worth shadowing from a scenario: said by someone in the cast, short enough to repeat in one breath.
export function linesToShadow(scn) {
  const out = [];
  const visit = (l) => (l || []).forEach((st) => {
    if (st.who && st.a && st.t) { const n = st.t.filter((t) => t.length > 1).reduce((k, t) => k + [...t[0]].length, 0); if (n >= 5 && n <= 12) out.push(st); }
    if (st.say) visit(st.say.ok); // not the or-branches: a shadow line is one every player has heard
  });
  visit(scn.steps);
  return out;
}

// A word's syllables as its phrase reads them, wherever it falls among the phrase's words.
function sylsIn(p, w) {
  const cs = [], ss = [];
  for (const t of p.t) if (t.length > 1) { const sy = t[1].split(' '); [...t[0]].forEach((c, i) => { cs.push(c); ss.push(sy[i] || ''); }); }
  const i = cs.join('').indexOf(w);
  return i < 0 ? [] : ss.slice(i, i + [...w].length);
}

// The phrases a story asks as it's played: its say beats', every branch, under the ids they go by (a tailored beat's
// own, scn/beat@L), in the content's order
function asked(data, scn) {
  const ids = new Set(), walk = (l) => { for (const st of l || []) if (st.say && !ids.has(st.say.pid || `${scn.id}/${st.say.id}`)) { const b = st.say; ids.add(b.pid || `${scn.id}/${b.id}`); [b.ok, b.fail, b.miss, ...(b.alts || []).map((a) => a.then)].forEach(walk); } };
  walk(scn.steps);
  return data.phrases.filter((p) => ids.has(p.id));
}

// The words worth writing from a scenario as it's played, best first: the ones its content lists (`write`), else the
// dictionary words of its model answers that carry the meaning (a need word itself, or a word inside one: 着急 in
// 别着急), of one or two characters, with a meaning to show for them. Never an answer checker's fragment (还早, 听我说):
// not words.
export function wordsToWrite(data, scn) {
  const ps = asked(data, scn), out = [];
  const add = (w, p) => { const syl = sylsIn(p, w); if (syl.length !== [...w].length || syl.some((s) => !s)) return; // erhua (哪儿 is one syllable) can't be traced a character at a time
    if (!out.some((o) => o.word === w)) out.push({ word: w, phrase: p, syl, gloss: (p.t.find((t) => t[0] === w)?.[2] || '').split(';')[0].trim() }); };
  for (const w of scn.write || []) { const p = ps.find((p) => p.zh.includes(w)); if (p) add(w, p); }
  if (!out.length) for (const exact of [true, false]) for (const p of ps) for (const t of p.t) {
    const n = [...t[0]].length, need = p.need.flat();
    if (t[1] && t[2] && n <= 2 && (exact ? need.includes(t[0]) : n === 2 && need.some((x) => x.includes(t[0])))) add(t[0], p);
  }
  return out;
}
