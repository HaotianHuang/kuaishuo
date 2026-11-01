#!/usr/bin/env node
// tools/factory.mjs: one content batch through the checks before the owner's gate (docs/v2/README.md §9, the factory):
//   1. validate the batch's files (and every series they belong to)
//   2. build them into review/gate/<batch>/, drafts too, next to the live catalogue (data/ and audio/ aren't touched)
//   3. judge-check every beat and level override there
//   4. the two recognisers on every clip (build.py --qa): a model answer both doubt fails the batch, since it's the line
//      people imitate
//   5. with --play, each story played headless at each level the batch adds, through #play on the batch's data (needs
//      test.mjs to read --only=play?id=…&lv=… whole: docs/v2/notes-content.md, request 7)
// and writes review/gate/<batch>/factory.md. The batch's scenario and message ids follow its name, or come from the
// `ids:` line of its brief (content/briefs/<batch>.md).
// node tools/factory.mjs <batch> [id ...] [--noqa] [--play] [--engine=elevenlabs]
// --engine passes through to build.py, so a batch voiced with ElevenLabs (ELEVENLABS_API_KEY, ELEVENLABS_MODEL) is built,
// checked and played with those voices; its clips are cached, so a rerun costs only what changed
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), SRC = path.join(ROOT, 'content/src'), MSG = path.join(ROOT, 'content/messages');
const PY = path.join(os.homedir(), '.cache/kuaishuo/venv/bin/python');
const [batch, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const has = (k) => process.argv.includes(`--${k}`);
const engine = process.argv.filter((a) => a.startsWith('--engine='));
if (!batch || !/^[a-z0-9-]+$/.test(batch)) { console.error('node tools/factory.mjs <batch> [id ...] [--noqa] [--play] [--engine=elevenlabs]'); process.exit(2); }
const brief = path.join(ROOT, 'content/briefs', `${batch}.md`);
const ids = rest.length ? rest : (fs.existsSync(brief) && fs.readFileSync(brief, 'utf8').match(/^ids:(.*)$/m)?.[1].match(/[a-z0-9-]+/g)) || [];
if (!ids.length) { console.error(`no scenario ids: give them after the batch name, or an "ids:" line in content/briefs/${batch}.md`); process.exit(2); }
// a scenario is content/src/<format>-<id>.json, a message content/messages/<id>.json
const idOf = (f) => (path.dirname(f) === MSG ? path.basename(f, '.json') : path.basename(f, '.json').split('-').slice(1).join('-'));
const files = [SRC, MSG].flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d) : []).filter((f) => f.endsWith('.json')).map((f) => path.join(d, f))).filter((f) => ids.includes(idOf(f)));
const missing = ids.filter((id) => !files.some((f) => idOf(f) === id));
if (missing.length) { console.error(`no content/src or content/messages file for ${missing.join(', ')}`); process.exit(2); }
const OUT = path.join(ROOT, 'review/gate', batch), rel = path.relative(ROOT, OUT);

const report = [`# Factory: ${batch}`, '', `${new Date().toLocaleString('sv-SE').slice(0, 16)}, ${ids.length} scenario${ids.length > 1 ? 's' : ''}: ${ids.join(', ')}.`, ''];
const run = (title, cmd, args, { show = true } = {}) => {
  console.log(`\n== ${title}: ${[path.basename(cmd), ...args].join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: show ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 });
  if (!show) process.stdout.write(r.stdout || '');
  return r;
};
const finish = (ok, why) => {
  report.push(`**${ok ? 'Ready for the gate' : 'Not ready'}**${why ? `: ${why}` : ''}.`, '');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'factory.md'), report.join('\n'));
  console.log(`\n${ok ? 'READY' : 'NOT READY'}${why ? `: ${why}` : ''} (${rel}/factory.md)`);
  process.exit(ok ? 0 : 1);
};

// 1. validate
const v = run('validate', 'node', ['tools/validate.mjs', ...files.map((f) => path.relative(ROOT, f))], { show: false });
report.push('## Validate', '', '```', ...(v.stdout || '').trim().split('\n'), '```', '');
if (v.status) finish(false, 'validate has errors');

// 2. build (voices are cached, so a rebuild only voices what changed)
const only = `--only=${ids.join(',')}`;
if (run('build', PY, ['-I', 'tools/build.py', only, `--out=${rel}`, ...engine]).status) finish(false, 'the build stopped');

// 3. judge-check
const j = run('judge-check', 'node', ['tools/judge-check.mjs', `--data=${rel}/data`, ...ids], { show: false });
const jl = (j.stdout || '').trim().split('\n');
report.push('## Judge', '', `${jl.at(-1)}.`, '', ...(jl.length > 1 ? ['```', ...jl.slice(0, -1), '```', ''] : []));
if (j.status) finish(false, 'judge-check has errors');

// 4. the recognisers
if (has('noqa')) report.push('## Voices', '', 'Not checked (--noqa).', '');
else {
  if (run('voice check', PY, ['-I', 'tools/build.py', only, `--out=${rel}`, ...engine, '--qa']).status) finish(false, 'the voice check stopped');
  const qa = JSON.parse(fs.readFileSync(path.join(OUT, 'qa.json'), 'utf8')), model = qa.doubted.filter((d) => d.model);
  report.push('## Voices', '', `${qa.clips} clips; ${qa.doubted.length} doubted by both recognisers, ${model.length} of them model answers (${rel}/qa.md).`, '');
  if (model.length) {
    report.push('| off | scenario | model answer | heard |', '|---|---|---|---|', ...model.map((d) => `| ${Math.round(d.off * 100)}% | ${d.scn} | ${d.script} | ${d.heard} |`), '');
    finish(false, `${model.length} model answer${model.length > 1 ? 's' : ''} doubted by both recognisers: reword ${model.length > 1 ? 'them' : 'it'} or fix the reading`);
  }
}

// 5. play
if (has('play')) {
  const routes = adds(built()).filter(([s]) => !s.from).flatMap(([s, ls]) => ls.map((l) => `play?id=${s.id}${l === s.level ? '' : `&lv=${l}`}`));   // a message plays in the app's Messages (P5c)
  const p = run('play', 'node', ['tools/test.mjs', '--nomic', `--data=${rel}/data`, `--only=${routes.join(',')}`]);
  report.push('## Play', '', p.status ? 'A headless play failed: see its output.' : `Played headless: ${routes.length} story-levels, ${routes.join(', ')}.`, '');
  if (p.status) finish(false, 'the headless play failed');
} else report.push('## Play', '', 'Not played headless (--play).', '');

report.push('## Levels', '', `${rel}/levels.md lists every line's declared level next to the build's estimate.`, '');
gate();
finish(true);

// the batch's build; every say beat in a scenario or any part of one; a beat as played at an override (content.js tailor())
function built() { return JSON.parse(fs.readFileSync(path.join(OUT, 'data/content.json'), 'utf8')); }
function beats(d, out = []) { if (Array.isArray(d)) d.forEach((x) => beats(x, out)); else if (d && typeof d === 'object') { if (d.say) out.push(d.say); for (const [k, v] of Object.entries(d)) if (k !== 't' && k !== 'ans') beats(v, out); } return out; }
function tailor(b, o) { const { levels, ...t } = b; Object.assign(t, o); if (o.alts) t.alts = o.alts.map(({ of, ...a }) => ({ ...b.alts[of], ...a })); return t; }

// [scenario, the levels the batch adds] for each of its stories: a new story at its own level and its overrides'; a live
// one at each level a draft override gives it
function adds(data) {
  return ids.map((id) => [...data.scenarios, ...(data.messages || [])].find((x) => x.id === id)).filter(Boolean).map((s) => {
    const draft = s.status === 'draft', keys = beats(s).flatMap((b) => Object.entries(b.levels || {}).filter(([, o]) => draft || o.status === 'draft').map(([k]) => +k));
    return [s, [...new Set([...(draft ? [s.level] : []), ...keys])].sort((x, y) => x - y)];
  });
}

// review/gate/<batch>.md, the owner's page: each story at each level the batch adds, with a link that plays it from
// this build, and its lines next to the ones it's played beside. What's between the notes markers is a person's, and
// stays when the page is written again.
function gate() {
  const page = path.join(ROOT, 'review/gate', `${batch}.md`), old = fs.existsSync(page) ? fs.readFileSync(page, 'utf8') : '';
  const notes = old.match(/<!-- notes -->[\s\S]*?<!-- \/notes -->/)?.[0] || '<!-- notes -->\nWhat to listen for, and the open questions: the content session writes them here.\n<!-- /notes -->';
  const data = built();
  const lines = [`# Gate: ${batch}`, '', notes, '', '## How to play', '',
    'On the Mac, in this folder, `node tools/serve.mjs`, then open a link below in Chrome (it has the microphone). On the phone:',
    '`node tools/serve.mjs --lan`, and the same path after the https address it prints. Each link opens one story at one',
    "level, straight in, from this batch's build; nothing here is in the live game yet.", ''];
  for (const [s, play] of adds(data)) {
    const all = beats(s), draft = s.status === 'draft';
    if (s.from) lines.push(`## ${s.id}: a message from ${s.cast[s.from]?.name}`, '', `${s.after} after ${s.story}${s.when ? `, when ${JSON.stringify(s.when)}` : ''}; level ${s.level}; ${draft ? 'new' : 'live, with new levels'}. It plays in the app's Messages once P5c is built: read its lines below.`, '');
    else {
      lines.push(`## ${s.id}: ${s.title} · ${s.title_en}`, '', `${s.format}, level ${s.level}${s.kind === 'decide' ? ', You Decide' : ''}${s.series ? `, ${data.series?.[s.series.id]?.title_en || s.series.id} episode ${s.series.ep}` : ''}; listen ${s.listen}; ${draft ? 'a new story' : 'live, with new levels'}${s.first ? `; a new phone opens on it ("${s.gate}")` : ''}.`, '');
      for (const l of play) lines.push(`- Level ${l}: http://127.0.0.1:8791/?data=${rel}/data#play?id=${s.id}${l === s.level ? '' : `&lv=${l}`}`);
    }
    const cols = [...new Set([s.level, ...play])].sort((a, b) => a - b);
    lines.push('', `| line | ${cols.map((l) => `L${l}${l === s.level ? ' (the story)' : ''}`).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    for (const b of all) {
      const at = (l) => (l === s.level ? b : b.levels?.[l] ? tailor(b, b.levels[l]) : null);
      lines.push(`| ${b.id} | ${cols.map((l) => { const t = at(l); return t ? `${t.answers[0]} (${t.gloss || ''}, lv ${t.lv})` : 'as the story'; }).join(' | ')} |`);
    }
    lines.push('');
  }
  lines.push('## Checks', '', `\`node tools/factory.mjs ${batch}\` (${rel}/factory.md): validate, the judge over every line and level, both speech recognisers on every clip. Every line's measured level: ${rel}/levels.md.`, '',
    '## To approve', '', 'Tell the content session which stories, or which lines, go live (and what to change): it sets their `"status": "live"` and rebuilds the game.', '');
  fs.writeFileSync(page, lines.join('\n'));
  console.log(`gate page: ${path.relative(ROOT, page)}`);
}
