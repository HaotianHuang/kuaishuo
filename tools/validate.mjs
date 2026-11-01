#!/usr/bin/env node
// tools/validate.mjs: checks every scenario in content/src, and every message in content/messages, against CONTENT.md.
// `node tools/validate.mjs [file...]`
// Errors (exit 1) break the build or the game; warnings are style the writing guide asks for. The world (content/world.json,
// every thread in content/series and every flag and feeling the stories read) and each series are checked across the
// whole catalogue, whichever files are given; what they find is reported where a given file is part of it.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), SRC = path.join(ROOT, 'content/src'), SERIES = path.join(ROOT, 'content/series');
const WORLD = path.join(ROOT, 'content/world.json'), MESSAGES = path.join(ROOT, 'content/messages');
const FORMATS = ['scene', 'chase', 'chat', 'call'];
const VOICES = ['m-young', 'm-mid', 'm-old', 'f-young', 'f-mid', 'f-old', 'kid'];
const FX = ['shake', 'squint', 'leave', 'enter', 'give', 'jump', 'laugh', 'angry', 'cry', 'run', 'faint'];
const SFX = ['ring', 'roar', 'ding', 'buzz', 'whoosh', 'heartbeat', 'door', 'crash', 'honk', 'pop', 'splash', 'goose', 'drum', 'cheer', 'alarm', 'knock', 'type', 'message'];
const KINDS = ['who', 'narr', 'sfx', 'say', 'end'];
// CONTENT.md "Scenario fields": the ranker's topic clusters, who a story is written for first, whether it ships
const TOPICS = ['family', 'dating', 'food', 'travel', 'home', 'work', 'shopping', 'animals', 'health', 'celebrations'];
const AUDIENCES = ['heritage', 'new'], STATUSES = ['draft', 'live'], MODES = ['speak', 'tiles', 'type', 'self'];
// what a level override may change: the player's side only (other characters' lines, branches and their audio stay)
const OVERRIDE = ['answers', 'need', 'not', 'mistakes', 'gloss', 'tip', 'cue', 'en', 'key', 'time', 'hint', 'free', 'mode', 'reply', 'decoys', 'alts', 'status'];
// a model answer's length and need groups at most, by level (docs/v2/content.md §1)
const LONG = [4, 6, 10, 12, 14, 20], GROUPS = [1, 1, 2, 2, 3, 3];
// Address forms that would gender the player (CONTENT.md); NPCs talking about each other may use them, so warn only.
const GENDERED = /小伙子|姑娘|美女|帅哥|先生|女士|小哥哥|小姐姐/;
// CONTENT.md "The world": a feeling's steps; a flag is <story or thread>.<name>; a message's wait; a rel test
const FEEL = ['-2', '-1', '0', '1', '2', '3', '4'], THREADS = ['heritage', 'new', 'all'];
const GENRES = ['horror', 'mystery', 'drama', 'classic', 'trope', 'comedy', 'romance', 'adventure'];   // a show's kind (docs/v2/genres.md)
const FLAG = /^[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+([-_][a-z0-9]+)*$/, AFTER = /^(\d+[mhd]|(tomorrow )?([01]\d|2[0-3]):[0-5]\d)$/, TEST = /^(>=|<=|>|<|=)?(-?\d)$/;

const errors = [], warnings = [];
const json = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
const all = [...json(SRC), ...json(MESSAGES)];
const files = process.argv.slice(2).length ? process.argv.slice(2).map((f) => path.resolve(f)) : all;
const given = new Set(files.map((f) => path.basename(f)));
const ids = new Map();
const strip = (s) => s.replace(/[\s，。？！、；：“”‘’（）《》…—,.?!;:'"()\-~]/g, '');
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return e; } };
const isMessage = (f) => path.dirname(f) === MESSAGES;
const series = Object.fromEntries(json(SERIES).map((f) => [path.basename(f, '.json'), read(f)]));
const isLevel = (l) => Number.isInteger(l) && l >= 0 && l <= 5;
const pools = read(path.join(ROOT, 'tools/voices.json')).roles || {};

// the world bible: places, and the cast that recurs, each with one voice everywhere and a line for every feeling
let world = fs.existsSync(WORLD) ? read(WORLD) : { places: {}, cast: {} };
if (world instanceof Error) { errors.push(`world.json: not JSON (${world.message})`); world = { places: {}, cast: {} }; }
const people = world.cast || {}, places = world.places || {}, byVoice = {};
for (const [id, c] of Object.entries(people)) {
  const err = (m) => errors.push(`world.json cast ${id}: ${m}`);
  if (!/^[a-z0-9]+$/.test(id)) err('an id is lowercase letters and digits (the cast key a thread\'s episodes use)');
  for (const k of ['name', 'emoji', 'en']) if (typeof c[k] !== 'string' || !c[k]) err(`no ${k}`);
  if (!VOICES.includes(c.voice)) err(`voice "${c.voice}" isn't one of ${VOICES.join(', ')}`);
  if (!/^z[fm]_\d{3}$/.test(c.tts || '')) err('no tts: the voice they have in every story (zf_047)');
  else { (byVoice[c.tts] ||= []).push(id); if (pools[c.voice] && !pools[c.voice].includes(c.tts)) warnings.push(`world.json cast ${id}: ${c.tts} isn't one of tools/voices.json's ${c.voice} voices (the owner's ear first)`); }
  if (!places[c.home]) err(`home "${c.home}" isn't one of the places (${Object.keys(places).join(', ')})`);
  for (const f of FEEL) if (typeof c.feel?.[f] !== 'string' || !c.feel[f]) err(`no feel line for ${f} (the contacts page says one for every step, -2 to 4)`);
  for (const f of Object.keys(c.feel || {})) if (!FEEL.includes(f)) err(`feel "${f}" isn't a step (${FEEL.join(', ')})`);
}

// threads: a series' episodes, its cast (world ids), who it's for and its levels
for (const [id, s] of Object.entries(series)) {
  const err = (m) => errors.push(`series/${id}.json: ${m}`);
  if (s instanceof Error) { err(`not JSON (${s.message})`); continue; }
  if (s.id !== id) err(`id "${s.id}" should be "${id}", as the file is named`);
  for (const k of ['title', 'title_en']) if (typeof s[k] !== 'string' || !s[k]) err(`no ${k}`);
  if (s.eps != null && !(Number.isInteger(s.eps) && s.eps > 0)) err('eps must be how many episodes are planned');
  if (!THREADS.includes(s.audience)) err(`audience must be ${THREADS.join(', ')} (who the thread is for)`);
  if (!(Array.isArray(s.levels) && s.levels.length === 2 && s.levels.every(isLevel) && s.levels[0] <= s.levels[1])) err('levels is [lowest, highest], 0 to 5: the range its episodes are in');
  if (s.genre != null && !GENRES.includes(s.genre)) err(`genre "${s.genre}" isn't one of ${GENRES.join(', ')}`);
  if (s.genre === 'horror' && s.optin !== true) err('horror is opt-in: "optin": true (genres.md §6)');
  // a show (one with a genre, genres.md §2) has its own cast and home, outside the world; a thread's are world.json's
  if (s.genre != null) {
    if (s.home != null && !(typeof s.home?.name === 'string' && typeof s.home?.en === 'string')) err('home: a show\'s own place, {"name", "en"}');
    if (!s.cast || typeof s.cast !== 'object' || Array.isArray(s.cast) || !Object.keys(s.cast).length) err('no cast: a show\'s own characters, {key: {name, emoji, voice, tts}}');
    const tts = {};
    for (const [k, c] of Object.entries(s.cast && !Array.isArray(s.cast) ? s.cast : {})) {
      if (people[k]) err(`cast ${k} is a world id: a show's characters are its own (shows never cross over)`);
      for (const f of ['name', 'emoji', 'en']) if (typeof c[f] !== 'string' || !c[f]) err(`cast ${k}: no ${f}`);
      if (!VOICES.includes(c.voice)) err(`cast ${k}: voice "${c.voice}" isn't one of ${VOICES.join(', ')}`);
      if (!/^z[fm]_\d{3}$/.test(c.tts || '')) err(`cast ${k}: no tts, the voice they have in every episode (zf_047)`);
      else if (pools[c.voice] && !pools[c.voice].includes(c.tts)) err(`cast ${k}: ${c.tts} isn't one of tools/voices.json's ${c.voice} voices`);
      if (tts[c.tts]) err(`cast ${k} and ${tts[c.tts]} have one voice (${c.tts})`);
      tts[c.tts] = k;
    }
    continue;
  }
  if (s.home != null && !places[s.home]) err(`home "${s.home}" isn't one of world.json's places`);
  if (!Array.isArray(s.cast) || !s.cast.length) err('no cast: the world ids of the characters every episode shares');
  for (const k of Array.isArray(s.cast) ? s.cast : []) if (!people[k]) err(`cast "${k}" isn't in content/world.json`);
}

// what the world pass needs from every file: flags set and read, feelings moved and read, firsts
const facts = new Map();   // file name → { s, sets: [[flag, value, at]], reads: [[flag, value, at, not]], moves: [[who, n]], tests: [[who, op, n, at]] }
const fact = (name) => facts.get(name) || facts.set(name, { sets: [], reads: [], moves: [], tests: [] }).get(name);

for (const file of [...new Set([...all, ...files])]) {
  const name = path.basename(file), mine = files.includes(file) || given.has(name), msg = isMessage(file);
  const s = read(file);
  if (s instanceof Error) { if (mine) errors.push(`${name}: not JSON (${s.message})`); continue; }
  const facts1 = fact(name);
  facts1.s = s; facts1.msg = msg;
  // every file is read for the world pass; only the given ones are reported on
  const err = (m) => { if (mine) errors.push(`${name}: ${m}`); }, warn = (m) => { if (mine) warnings.push(`${name}: ${m}`); };
  if (msg) {
    for (const k of ['id', 'from', 'story', 'after']) if (typeof s[k] !== 'string' || !s[k]) err(`no ${k} (a message: who it's from, the story whose end sends it, and how long after)`);
    if (s.id && name !== `${s.id}.json`) err(`file should be named ${s.id}.json`);
    if (s.after && !AFTER.test(s.after)) err(`after "${s.after}": a wait (30m, 3h, 2d) or a time (19:00, tomorrow 19:00)`);
    if (s.format != null && s.format !== 'chat') err('a message is a chat (leave format out)');
  } else {
    for (const k of ['id', 'format', 'title', 'title_en', 'setting']) if (typeof s[k] !== 'string' || !s[k]) err(`no ${k}`);
    if (!FORMATS.includes(s.format)) err(`format "${s.format}" isn't one of ${FORMATS.join(', ')}`);
    if (s.id && s.format && name !== `${s.format}-${s.id}.json`) err(`file should be named ${s.format}-${s.id}.json`);
    if (!Array.isArray(s.topics) || !s.topics.length || s.topics.length > 3 || !s.topics.every((t) => TOPICS.includes(t))) err(`topics: one to three of ${TOPICS.join(', ')} (the first is the main one)`);
    if (!AUDIENCES.includes(s.audience)) err(`audience must be ${AUDIENCES.join(' or ')}`);
    if (s.hook == null) warn('no hook score (1 to 5: stakes by second 5, absurdity, relatability)');
    else if (!(Number.isInteger(s.hook) && s.hook >= 1 && s.hook <= 5)) err('hook must be 1 to 5');
    if (!Array.isArray(s.tags) || !s.tags.length) err('no tags');
    if (s.first != null && s.first !== true) err('first is true or left out');
    if (s.first && s.level !== 0) warn('first: the story a new phone opens on is best a level-0 one');
    if (s.first && !s.gate) err('first needs its gate line: the hook over "Tap to start" ("You\'ve just landed at Pudong, and your phone has no signal.")');
    if (s.gate != null && (typeof s.gate !== 'string' || !s.gate)) err('gate is one English line');
    else if (s.gate && s.gate.length > 90) warn(`gate: ${s.gate.length} characters (it sits over the tap: 90 or fewer)`);
    if (s.kind != null && s.kind !== 'decide') err('kind is "decide" (你来评评理) or left out');
  }
  if (s.audience != null && !AUDIENCES.includes(s.audience)) err(`audience must be ${AUDIENCES.join(' or ')}`);
  if (s.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) err(`id "${s.id}" isn't kebab-case`);
  if (s.id) { if (ids.has(s.id)) err(`id "${s.id}" also used by ${ids.get(s.id)}`); else ids.set(s.id, name); }
  if (!isLevel(s.level)) err('level must be 0 to 5');
  if (s.listen != null && !isLevel(s.listen)) err('listen must be 0 to 5 (or left out: the build measures it)');
  if (!STATUSES.includes(s.status)) err(`status must be ${STATUSES.join(' or ')} (only the owner makes a story live)`);
  if (s.bg && !(Array.isArray(s.bg) && s.bg.length === 2 && s.bg.every((c) => /^#[0-9a-f]{6}$/i.test(c)))) err('bg must be two #rrggbb colours');
  const cast = s.cast && typeof s.cast === 'object' ? s.cast : (err('no cast'), {});
  const show = s.series && series[s.series.id] && !(series[s.series.id] instanceof Error) ? series[s.series.id] : null;
  // who each cast member is in the world: their thread's character with that key (any world id, in a message), or "is"
  const who = {}, theirs = new Map();
  for (const [k, c] of Object.entries(cast)) {
    if (k === 'you') err('"you" is the player and is never in the cast');
    if (!c.name || !c.emoji) err(`cast ${k}: needs name and emoji`);
    if (!VOICES.includes(c.voice)) err(`cast ${k}: voice "${c.voice}" isn't one of ${VOICES.join(', ')}`);
    if (c.is != null && !people[c.is]) { err(`cast ${k}: is "${c.is}", who isn't in content/world.json`); continue; }
    const mine = show?.genre != null && show.cast && !Array.isArray(show.cast) ? show.cast[k] : null;   // a show's own character
    if (mine) {
      // one voice always; the name or one in aka (who they seem to be, before the show says), and the emoji unless they're
      // only heard (on the phone) or not yet known (an aka)
      const aka = (mine.aka || []).includes(c.name);
      if (c.voice !== mine.voice) err(`cast ${k}: voice "${c.voice}" isn't "${mine.voice}", as the show's cast has it (content/series/${s.series.id}.json)`);
      if (c.name !== mine.name && !aka) err(`cast ${k}: name "${c.name}" isn't "${mine.name}" or one in its aka (content/series/${s.series.id}.json)`);
      if (c.emoji !== mine.emoji && !aka && !c.phone) err(`cast ${k}: emoji ${c.emoji} isn't ${mine.emoji} (a character keeps it, unless on the phone or under an aka)`);
      continue;
    }
    const w = c.is ?? ((msg || (Array.isArray(show?.cast) && show.cast.includes(k))) && people[k] ? k : null);   // a message is from the world
    if (!w) { if (s.status === 'draft' && Object.values(people).some((o) => o.name === c.name && o.name.length > 1 && !/^[大小老]?(奶奶|爷爷|阿姨|叔叔|大爷|大妈)$/.test(o.name))) warn(`cast ${k}: ${c.name} is in content/world.json; say "is": "<id>" if it's them (it gives them their voice)`); continue; }
    const o = people[w];
    if (c.voice !== o.voice) err(`cast ${k}: voice "${c.voice}" isn't ${o.name}'s "${o.voice}" (content/world.json)`);
    if (c.name !== o.name && !(o.aka || []).includes(c.name)) err(`cast ${k}: name "${c.name}" isn't ${o.name}'s (content/world.json: the name, or one in aka)`);
    if (c.emoji !== o.emoji) err(`cast ${k}: emoji ${c.emoji} isn't ${o.name}'s ${o.emoji} (a character keeps it everywhere)`);
    if (theirs.has(w)) err(`cast ${k} and ${theirs.get(w)} are both ${o.name}`);
    theirs.set(w, k); who[k] = w;
  }
  const linked = Object.entries(who);
  for (let i = 0; i < linked.length; i++) for (let j = i + 1; j < linked.length; j++) {
    const [a, x] = linked[i], [b, y] = linked[j];
    if (people[x].tts === people[y].tts) err(`cast ${a} and ${b}: ${people[x].name} and ${people[y].name} have one voice (${people[x].tts}), so they can't be in one story (content/world.json, who)`);
  }
  if (s.series != null && !msg) {
    const sr = s.series;
    if (!sr || typeof sr !== 'object' || !show) err(`series: {"id", "ep", "next"}, with an id from content/series/ (${Object.keys(series).join(', ') || 'none yet'})`);
    else {
      if (!(Number.isInteger(sr.ep) && sr.ep >= 1 && (!show.eps || sr.ep <= show.eps))) err(`series.ep must be 1 to ${show.eps || 'n'}`);
      if (typeof sr.next !== 'string' || !sr.next) { if (!show.eps || sr.ep < show.eps) warn('series.next: no cliffhanger for the next episode'); }
      if (AUDIENCES.includes(show.audience) && s.audience !== show.audience) err(`audience "${s.audience}": the thread is for ${show.audience}`);
      if (Array.isArray(show.levels) && isLevel(s.level) && (s.level < show.levels[0] || s.level > show.levels[1])) err(`level ${s.level}: the thread's episodes are levels ${show.levels.join(' to ')}`);
    }
  }
  if (msg) {
    if (s.from && !who[s.from]) err(`from "${s.from}" isn't a cast key that's someone in content/world.json`);
    if (s.chat != null && s.chat.with !== s.from) err('chat.with is the one it\'s from (or leave chat out)');
    if (s.when != null) cond(s.when, 'when');
  }

  const level = isLevel(s.level) ? s.level : 2, long = [];   // long: [level, beat, characters, groups] past the level's limits
  const tooLong = (l, id, o) => { const n = strip(o.answers?.[0] || '').length, g = o.need?.length || 0; if (n > LONG[l] || g > GROUPS[l]) long.push([l, id, n, g]); };
  const zhCheck = (zh, where) => {
    if (typeof zh !== 'string' || !zh) return err(`${where}: no zh`);
    if (/[A-Za-z0-9]/.test(zh)) err(`${where}: Latin letters or digits in zh ("${zh}"); the voice can't read them`);
    if (strip(zh).length > 30) warn(`${where}: ${strip(zh).length} characters (aim for 20 or fewer)`);
    if (GENDERED.test(zh)) warn(`${where}: "${zh}" has a gendered address form; make sure it isn't aimed at the player`);
  };
  // when: {"<flag>": value} (all of them), {"rel": {"<who>": ">=1"}}, {"all": […]}, {"any": […]}, {"not": …}
  function cond(c, at, not = false) {
    if (!c || typeof c !== 'object' || Array.isArray(c) || !Object.keys(c).length) return err(`${at}: when is {"<flag>": value}, {"rel": {"<who>": ">=1"}}, {"all": […]}, {"any": […]} or {"not": …}`);
    for (const [k, v] of Object.entries(c)) {
      if (k === 'all' || k === 'any') { if (!Array.isArray(v) || !v.length) err(`${at}.${k}: a list of conditions`); else v.forEach((x, i) => cond(x, `${at}.${k}[${i}]`, not)); }
      else if (k === 'not') cond(v, `${at}.not`, !not);
      else if (k === 'rel') {
        if (!v || typeof v !== 'object' || Array.isArray(v) || !Object.keys(v).length) { err(`${at}.rel: {"<who>": ">=1"}`); continue; }
        for (const [p, t] of Object.entries(v)) {
          const m = TEST.exec(String(t));
          if (!people[p]) err(`${at}.rel: "${p}" isn't in content/world.json`);
          if (!m || +m[2] < -2 || +m[2] > 4) err(`${at}.rel.${p}: "${t}" is a test of a feeling, -2 to 4 (">=1", "<0", "2")`);
          else if (!not) facts1.tests.push([p, m[1] || '=', +m[2], at]);
        }
      } else if (FLAG.test(k)) {
        if (!['string', 'number', 'boolean'].includes(typeof v)) err(`${at}: "${k}" is tested against a value (true, "truth", 2)`);
        facts1.reads.push([k, v, at, not]);
      } else err(`${at}: "${k}" isn't a flag (<story or thread>.<name>, like back-home.job) or rel, all, any, not`);
    }
  }
  // what a line said does to the world: flags it sets, how it makes people feel about you
  const outcome = (o, at) => {
    if (o.sets != null) {
      if (!o.sets || typeof o.sets !== 'object' || Array.isArray(o.sets) || !Object.keys(o.sets).length) err(`${at}: sets is {"<flag>": value}`);
      else for (const [k, v] of Object.entries(o.sets)) {
        if (!FLAG.test(k)) { err(`${at}: flag "${k}" is <story or thread>.<name> (back-home.job)`); continue; }
        if (!['string', 'number', 'boolean'].includes(typeof v)) err(`${at}: flag ${k} is set to true, a word or a number`);
        const scope = k.split('.')[0];
        if (scope !== s.id && scope !== s.series?.id) warn(`${at}: flag ${k} isn't named for this story or its thread (${[s.id, s.series?.id].filter(Boolean).join(' or ')}.…), so it's harder to trace`);
        facts1.sets.push([k, v, at]);
      }
    }
    if (o.rel != null) {
      if (!o.rel || typeof o.rel !== 'object' || Array.isArray(o.rel) || !Object.keys(o.rel).length) err(`${at}: rel is {"<who>": 1}`);
      else for (const [p, n] of Object.entries(o.rel)) {
        if (!people[p]) err(`${at}: rel "${p}" isn't in content/world.json`);
        if (!Number.isInteger(n) || !n || Math.abs(n) > 2) err(`${at}: rel ${p} moves by ±1 (or, rarely, ±2)`);
        else { if (Math.abs(n) === 2) warn(`${at}: rel ${p} ${n} (a feeling moves by 2 only rarely)`); facts1.moves.push([p, n]); }
      }
    }
  };
  // answers and need, with what an override leaves out taken from the beat it changes (base)
  const judge = (o, w, base = {}) => {
    const answers = o.answers ?? base.answers, need = o.need ?? base.need;
    if (!Array.isArray(answers) || !answers.length) return err(`${w}: no answers`);
    (o.answers || []).forEach((a, j) => zhCheck(a, `${w} answers[${j}]`));
    if (!Array.isArray(need) || !need.length || !need.every((g) => Array.isArray(g) && g.length && g.every((x) => typeof x === 'string' && x))) return err(`${w}: need must be a list of non-empty lists of words`);
    (o.need || []).flat().forEach((x) => { if (/[A-Za-z0-9]/.test(x)) err(`${w}: need word "${x}" has Latin letters or digits`); });
    answers.forEach((a, j) => need.forEach((g) => { if (typeof a === 'string' && !g.some((x) => strip(a).includes(strip(x)))) err(`${w} answers[${j}] "${a}" has none of ${JSON.stringify(g)}`); }));
    for (const k of ['not', 'mistakes']) (o[k] || []).forEach((m, j) => { if (!Array.isArray(m.heard) || !m.note) err(`${w}.${k}[${j}]: needs heard[] and note`); });
  };
  const ends = (list) => Array.isArray(list) && list.some((st) => 'end' in st);
  const sayIds = new Set(), levelsOf = new Map(), again = [];
  let says = 0, verdicts = 0;
  const overrides = (b, at) => {
    if (b.levels == null) return;
    if (typeof b.levels !== 'object' || Array.isArray(b.levels)) return err(`${at}: levels must be {"0": {…}, "3": {…}}`);
    levelsOf.set(b.id, Object.keys(b.levels).sort().join());
    for (const [k, o] of Object.entries(b.levels)) {
      const w = `${at} @${k}`, l = Number(k);
      if (!/^[0-5]$/.test(k)) { err(`${w}: a level override's key is a level, 0 to 5`); continue; }
      if (l === level) err(`${w}: the beat itself is level ${level}; an override is another level`);
      if (!o || typeof o !== 'object' || Array.isArray(o)) { err(`${w}: an override is an object`); continue; }
      for (const f of Object.keys(o)) if (!OVERRIDE.includes(f)) err(`${w}: "${f}" can't change with the level (only ${OVERRIDE.join(', ')}); other characters' lines, branches and what a choice does stay`);
      if (o.status != null && !STATUSES.includes(o.status)) err(`${w}: status must be ${STATUSES.join(' or ')}`);
      if (o.time != null && !(o.time === 0 || (o.time >= 4 && o.time <= 40))) err(`${w}: time ${o.time} (4 to 40 seconds, or 0 for no clock)`);
      for (const f of ['mode', 'reply']) if (o[f] != null && !MODES.includes(o[f])) err(`${w}: ${f} "${o[f]}" isn't one of ${MODES.join(', ')}`);
      for (const f of ['gloss', 'tip', 'cue', 'en']) if (o[f] != null && typeof o[f] !== 'string') err(`${w}: ${f} is text`);
      if (o.key != null && (typeof o.key !== 'object' || Array.isArray(o.key))) err(`${w}: key is {"word": "meaning here"}`);
      if (o.answers && !o.gloss) warn(`${w}: a new model answer with no gloss of its own (the beat's would be shown)`);
      judge(o, w, b);
      tooLong(l, `${b.id}@${k}`, { answers: o.answers ?? b.answers, need: o.need ?? b.need });
      if (o.alts != null) {
        if (!Array.isArray(o.alts)) { err(`${w}: alts is a list of {"of": <the beat's alt>, …changes}`); continue; }
        const seen = new Set();
        o.alts.forEach((a, j) => {
          const base = b.alts?.[a?.of];
          if (!base || seen.has(a.of)) return err(`${w}.alts[${j}]: "of" must name one of the beat's ${b.alts?.length || 0} alts, once`);
          seen.add(a.of);
          if ('then' in a) err(`${w}.alts[${j}]: an override can't change where a branch goes (no "then")`);
          for (const f of ['sets', 'rel', 'when', 'secret']) if (f in a) err(`${w}.alts[${j}]: "${f}" doesn't change with the level (what a choice does, and when it's there, is the beat's)`);
          judge(a, `${w}.alts[${j}]`, base);
        });
      }
    }
  };
  const steps = (list, where) => {
    if (!Array.isArray(list)) return err(`${where}: steps must be a list`);
    list.forEach((st, i) => {
      const at = `${where}[${i}]`, kinds = KINDS.filter((k) => k in st);
      if (kinds.length !== 1) return err(`${at}: a step has exactly one of ${KINDS.join(', ')} (has ${kinds.join(', ') || 'none'})`);
      const kind = kinds[0];
      if (st.when != null) cond(st.when, `${at}.when`);
      if (st.else != null) { if (st.when == null) err(`${at}: else is what plays when "when" doesn't hold: it needs a when`); if (!Array.isArray(st.else)) err(`${at}.else: a list of steps`); else steps(st.else, `${at}.else`); }
      if (kind === 'who') {
        if (!cast[st.who]) err(`${at}: "${st.who}" isn't in the cast`);
        zhCheck(st.zh, at);
        if (!st.en) err(`${at}: no en`);
        if (st.fx && !FX.includes(st.fx)) err(`${at}: fx "${st.fx}" isn't one of ${FX.join(', ')}`);
      } else if (kind === 'narr') {
        if (typeof st.narr !== 'string' || !st.narr) err(`${at}: empty narr`);
        if (st.zh) zhCheck(st.zh, at);
      } else if (kind === 'sfx') {
        if (!SFX.includes(st.sfx)) err(`${at}: sfx "${st.sfx}" isn't one of ${SFX.join(', ')}`);
      } else if (kind === 'end') {
        if (!['win', 'lose'].includes(st.end)) err(`${at}: end must be "win" or "lose"`);
        if (!st.en) err(`${at}: no en`);
        if (st.zh) zhCheck(st.zh, at);
      } else {
        const b = st.say || {};
        says++;
        if (!b.id) err(`${at}: say has no id`); else if (sayIds.has(b.id)) err(`${at}: say id "${b.id}" used twice`); else sayIds.add(b.id);
        if (!b.en) err(`${at}: say has no en (the mission)`);
        if (b.time != null && !(b.time >= 4 && b.time <= 40)) err(`${at}: time ${b.time} (4 to 40 seconds)`);
        judge(b, `${at} say`);
        tooLong(level, b.id, b);
        outcome(b, `${at} say`);
        if (b.again) again.push([b.id, b.again, at]);
        if (b.ok) steps(b.ok, `${at}.ok`);
        if (b.fail) steps(b.fail, `${at}.fail`);
        if (b.perfect != null) {   // the line said perfectly first time (3★): a secret ending in place of ok
          if (!b.perfect || typeof b.perfect !== 'object' || !Array.isArray(b.perfect.then)) err(`${at}.perfect: {"then": [steps], "sets"?, "rel"?}`);
          else { steps(b.perfect.then, `${at}.perfect.then`); outcome(b.perfect, `${at}.perfect`); if (!ends(b.perfect.then)) warn(`${at}.perfect: a secret ending with no end of its own`); }
        }
        (b.alts || []).forEach((a, j) => {
          const w = `${at}.alts[${j}]`;
          if (!a.en) err(`${w}: no en`);
          judge(a, w);
          outcome(a, w);
          if (a.when != null) cond(a.when, `${w}.when`);
          if (a.secret != null && a.secret !== true) err(`${w}: secret is true or left out`);
          if (a.secret && !ends(a.then)) warn(`${w}: a secret branch with no ending of its own`);
          if (a.then) steps(a.then, `${w}.then`);
        });
        if (b.verdict != null) {
          verdicts++;
          if (s.kind !== 'decide') warn(`${at}: verdict is for a You Decide story (kind "decide")`);
          const n = 1 + (b.alts || []).filter((a) => !a.secret).length;
          if (n < 2 || n > 3) err(`${at}: a verdict is two or three things to say (the line and one or two alts; has ${n})`);
          if (!(b.alts || []).every((a) => ends(a.then))) warn(`${at}: every verdict plays what it leads to, to an ending of its own`);
        }
        (b.mistakes || []).forEach((m, j) => { if (!Array.isArray(m.heard) || !m.note) err(`${at}.mistakes[${j}]: needs heard[] and note`); });
        overrides(b, `${at} say`);
      }
    });
  };
  steps(s.steps, 'steps');
  // format blocks (call.silence, chase.caught…) hold step lists of their own: check those too
  for (const [k, v] of Object.entries(s)) if (v && typeof v === 'object' && !Array.isArray(v) && !['cast', 'steps', 'series', 'when'].includes(k))
    for (const [kk, vv] of Object.entries(v)) if (Array.isArray(vv) && vv.length && vv.every((x) => x && typeof x === 'object' && KINDS.some((kind) => kind in x))) steps(vv, `${k}.${kk}`);
  // a chase drills a phrase again under the first encounter's id at that level (content.tailor(): scn/first@L), so the
  // two change level together: where only one has an override, add one to the other (it may keep its own line)
  for (const [id, first, at] of again) if (!sayIds.has(first)) err(`${at}: again "${first}" isn't an earlier encounter`);
    else if ((levelsOf.get(id) || '') !== (levelsOf.get(first) || '')) err(`${at}: an again encounter has overrides at the same levels as "${first}" (it has ${levelsOf.get(id) || 'none'}, "${first}" ${levelsOf.get(first) || 'none'}): give the other one an override there too, even one that keeps its own line`);
  for (const l of new Set(long.map((x) => x[0]))) {
    const mine2 = long.filter((x) => x[0] === l);
    warn(`level ${l} lines run past ${LONG[l]} characters or ${GROUPS[l]} need group${GROUPS[l] > 1 ? 's' : ''}: ${mine2.map(([, id, n, g]) => `${id} (${n}, ${g})`).join(', ')}`);
  }
  if (s.kind === 'decide' && !verdicts) err('a You Decide story has a verdict beat ("verdict": true): two or three things to say to the person involved');
  if (msg) { if (says < 1 || says > 3) warn(`${says} say beats (a message is one to three exchanges)`); }
  else {
    if (Array.isArray(s.steps) && !('end' in (s.steps.at(-1) || {}))) warn('last step isn\'t an end');
    if (s.kind === 'decide') { if (says < 2 || says > 4) warn(`${says} say beats (a You Decide story: a line or two to set it up, then the verdict)`); }
    else if (s.format !== 'chase' && (says < 3 || says > 6)) warn(`${says} say beats (aim for 3 to 5)`);
  }
}

// across the catalogue, reported where a given file is part of it
const report = (names, m) => { if (names.some((n) => given.has(n))) errors.push(m); };
// a series: one file an episode, numbered from 1 without gaps
const eps = {};
for (const [name, f] of facts) if (f.s?.series?.id && !f.msg) (eps[f.s.series.id] ||= []).push([f.s.series.ep, name]);
for (const [id, list] of Object.entries(eps)) {
  const nums = list.map((x) => x[0]).sort((a, b) => a - b), names = list.map((x) => x[1]);
  for (const n of new Set(nums)) if (nums.filter((x) => x === n).length > 1) report(names, `series ${id}: episode ${n} is ${list.filter((x) => x[0] === n).map((x) => x[1]).join(' and ')}`);
  const gap = [...Array(Math.max(0, ...nums.filter(Number.isInteger))).keys()].map((i) => i + 1).filter((n) => !nums.includes(n));
  if (gap.length) report(names, `series ${id}: no episode ${gap.join(', ')} (episodes are numbered from 1 without gaps)`);
}
// messages: the story whose end sends them
const byId = new Map([...facts].filter(([, f]) => f.s?.id).map(([n, f]) => [f.s.id, [n, f]]));
for (const [name, f] of facts) if (f.msg && f.s?.story && !byId.has(f.s.story)) report([name], `${name}: story "${f.s.story}" isn't a story or message (the one whose end sends it)`);
// one story a new phone opens on
const firsts = [...facts].filter(([, f]) => f.s?.first === true).map(([n]) => n);
if (firsts.length > 1) report(firsts, `first: ${firsts.join(' and ')} both say they're the story a new phone opens on (one only)`);
// flags: every one set is read somewhere later (in the story after it's set, a message, another story, but not an earlier
// episode of the same thread); every one read is set somewhere to that value, by live content if the reader is live
const ep = (f) => (f.s?.series && !f.msg ? [f.s.series.id, f.s.series.ep] : null);
const before = (r, w) => { const a = ep(r), b = ep(w); return a && b && a[0] === b[0] && a[1] < b[1]; };
const setters = new Map();
for (const [name, f] of facts) for (const [k, v, at] of f.sets) (setters.get(k) || setters.set(k, []).get(k)).push([name, f, v, at]);
for (const [k, list] of setters) for (const [name, f, , at] of list) {
  const later = [...facts].filter(([n, g]) => g.reads.some((r) => r[0] === k) && (n === name || !before(g, f)));
  if (!later.length) report([name], `${name}: ${at} sets ${k}, which nothing reads later (every flag set is read: a callback, a message, another thread)`);
}
for (const [name, f] of facts) for (const [k, v, at, not] of f.reads) {
  const by = (setters.get(k) || []).filter(([, , x]) => not || x === v), live = by.filter(([, g]) => g.s.status === 'live');
  if (!by.length) report([name], `${name}: ${at} reads ${k}${not ? '' : ` = ${JSON.stringify(v)}`}, which nothing sets${not ? ' (so it always holds)' : ' (that line can never play)'}`);
  else if (f.s.status === 'live' && !live.length) report([name, ...by.map((x) => x[0])], `${name}: ${at} reads ${k}, which only drafts set (the live build can't reach it)`);
}
// feelings: a test is reachable by the moves the catalogue makes (a feeling starts at 0)
const ups = {}, downs = {};
for (const [, f] of facts) for (const [p, n] of f.moves) if (n > 0) ups[p] = (ups[p] || 0) + n; else downs[p] = (downs[p] || 0) + n;
for (const [name, f] of facts) for (const [p, op, n, at] of f.tests) {
  const lo = { '>=': n, '>': n + 1, '=': n }[op], hi = { '<=': n, '<': n - 1, '=': n }[op];
  if (lo > 0 && (ups[p] || 0) < lo) report([name], `${name}: ${at} needs ${p} at ${op}${n}, and nothing moves ${p} that far up (${ups[p] || 0})`);
  if (hi < 0 && (downs[p] || 0) > hi) report([name], `${name}: ${at} needs ${p} at ${op}${n}, and nothing moves ${p} that far down (${downs[p] || 0})`);
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
const nm = files.filter(isMessage).length, ns = files.length - nm;
console.log(`${ns} scenario${ns === 1 ? '' : 's'}${nm ? `, ${nm} message${nm === 1 ? '' : 's'}` : ''}, ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
process.exit(errors.length ? 1 : 0);
