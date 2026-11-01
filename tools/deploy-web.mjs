#!/usr/bin/env node
// tools/deploy-web.mjs: web/ onto Cloudflare Pages (docs/v2/web.md §6), on the owner's OK, each time. It refuses any
// project but kuaishuo's own (never freelearninggame, huangetal-org or huangetal), a web/ older than anything it's built
// from (node tools/pack.mjs --web again), and a web.json with no contact (no way to tell us something's wrong); then
// runs wrangler pages deploy web --project-name kuaishuo with --branch preview (public at an unlisted address: the test
// link for a few friends) unless told --production. It asks at a terminal first, so nothing but the owner at one can
// set it off.
//   node tools/deploy-web.mjs [--production] [--project-name kuaishuo] [--dry-run]
//   --dry-run   every check, and the command it would run, printed; wrangler never runs (web-check.mjs runs this)
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readWeb } from './webpage.mjs';

export const PROJECT = 'kuaishuo';

// what web/ is built from (pack.mjs --web): the page, the app and its pages, data/ and the packs it plays, web.json, the
// two tools that build it
function sources(root) {
  const out = ['index.html', 'web.json', 'tools/pack.mjs', 'tools/webpage.mjs'].map((f) => path.join(root, f));
  const walk = (d) => { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (!e.name.startsWith('.')) e.isDirectory() ? walk(path.join(d, e.name)) : out.push(path.join(d, e.name)); } catch {} };
  walk(path.join(root, 'app')); walk(path.join(root, 'data'));
  try { for (const a of new Set(JSON.parse(fs.readFileSync(path.join(root, 'data', 'content.json'), 'utf8')).scenarios.map((s) => s.audio))) out.push(path.join(root, a)); } catch {}
  return out.filter((f) => fs.existsSync(f));
}

// Why it won't deploy ([] when it will): checked by web-check.mjs on trees of its own making, as well as by dry runs
export function refusals({ root, project }) {
  const why = [];
  if (project !== PROJECT) why.push(`the Cloudflare Pages project is ${PROJECT} only, not "${project}"`);
  const built = path.join(root, 'web', 'index.html');
  if (!fs.existsSync(built)) why.push('there is no web/: node tools/pack.mjs --web first');
  else {
    const at = fs.statSync(built).mtimeMs, newer = sources(root).filter((f) => fs.statSync(f).mtimeMs > at);
    if (newer.length) why.push(`web/ is older than ${newer.slice(0, 3).map((f) => path.relative(root, f)).join(', ')}${newer.length > 3 ? ` and ${newer.length - 3} more` : ''}: node tools/pack.mjs --web again`);
  }
  if (!readWeb(root).web.contact) why.push('web.json has no contact: the report link and Send feedback would have nowhere to go');
  return why;
}

export const command = (production) => ['wrangler', 'pages', 'deploy', 'web', '--project-name', PROJECT, ...(production ? [] : ['--branch', 'preview'])];

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2), has = (k) => argv.includes(k);
  const at = argv.findIndex((a) => a === '--project-name' || a.startsWith('--project-name='));
  const project = at < 0 ? PROJECT : argv[at].includes('=') ? argv[at].split('=')[1] : argv[at + 1] || '';
  const unknown = argv.filter((a, i) => !['--production', '--dry-run'].includes(a) && i !== at && !(i === at + 1 && !argv[at].includes('=')));
  const root = path.resolve(new URL('..', import.meta.url).pathname), cmd = command(has('--production'));
  const why = [...refusals({ root, project }), ...(unknown.length ? [`unknown: ${unknown.join(' ')} (--production, --project-name ${PROJECT}, --dry-run)`] : [])];
  if (why.length) { console.error(`not deploying:\n  ${why.join('\n  ')}`); process.exit(1); }
  if (has('--dry-run')) { console.log(`would run: ${cmd.join(' ')}`); process.exit(0); }
  if (!process.stdin.isTTY) { console.error('not deploying: it asks the owner first, at a terminal, and there is none here'); process.exit(1); }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((r) => rl.question(`Put web/ on Cloudflare Pages, project ${PROJECT}, ${has('--production') ? 'PRODUCTION (the public site)' : 'branch preview (an unlisted address)'}? Type deploy to go on: `, r));
  rl.close();
  if (answer.trim() !== 'deploy') { console.log('not deployed'); process.exit(1); }
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: root, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  process.exit(r.status ?? 1);
}
