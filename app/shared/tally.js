// What the owner sees of how 快说 is played (docs/v2/web.md §6, decision 2, the owner's OK of 1 Nov 2026): daily totals,
// counted on this phone from the rows events.js logs and sent to /api/count now and then, added to everyone else's
// there. Never a row, never anything that tells one phone from another: no id, no cookie, no time of day, nothing
// typed or said. What's counted, each a key and a number for the day (functions/api/count.js holds every key to KEYS):
//   once a day, as the phone first plays that day: active:<days since its first day> and cohort:<its first day> (so
//     the totals give retention with no id: phones of each first day still playing n days on); browser:, os:, screen:,
//     speech: (a recogniser here or not), lang: (the browser's language, its first part), home: and goal: (the about
//     card's answers), age: (a band, from the year you were born), streak: (a band); and once ever, new and from:<the
//     site that sent you here> (its host only)
//   every visit (half an hour away starts a new one, as events.js has it): visit, and when it's over (seen as the next
//     one starts) visitmin: and visitcards: (bands)
//   every card: card:<kind>:<how it was left: done, left mid-way, passed before it began>, and a story's
//     story:<id>:<in, done, left, passed, win, lose>, fmt:<format>:<…>, lv:<level>:<…>, secs (time on cards) and the small
//     things done on it (note:gloss, note:reveal, note:peek, note:quiet, note:like, note:replay)
//   every line answered: line:<how answered>:<result> and said:<line id>, with miss:<line id> where it wasn't got (the
//     lines the judge or the Chinese gets wrong, found by how often)
//   error: a script error (at most 20 a day)
// Sent only from the real site (web.json's url), or a page whose localStorage has ks.countHere set (tools that test
// this, against wrangler pages dev); never from the artifact, a test or the dev server. A send that fails is kept and
// tried again later; at most one every 5 minutes while the page is up, and one as it goes away.
import { kv } from './store.js';
import { now } from './time.js';
import * as events from './events.js';
import * as files from './files.js';
import * as learner from './learner.js';
import * as days from './days.js';

const EVERY = 5 * 60e3, MAX_KEYS = 400, GAP = 30 * 60e3, URL_ = 'api/count';
let out = null, last = 0, timer = 0, keep = 0, errs = 0;

const band = (n, cuts) => { for (const c of cuts) if (n < c) return `${cuts[cuts.indexOf(c) - 1] ?? 0}-${c}`; return `${cuts[cuts.length - 1]}+`; };
const clean = (s) => String(s ?? 'none').toLowerCase().replace(/[^a-z0-9_./-]/g, '').slice(0, 64) || 'none';
// the totals not yet sent, kept (ks.out) a second after the last change, so a phone that goes away keeps them for later
const add = (k, n = 1) => { out ||= kv.get('out', {}); if (!(k in out) && Object.keys(out).length >= MAX_KEYS) return; out[k] = (out[k] || 0) + n; keep ||= setTimeout(save, 1000); };
const save = () => { clearTimeout(keep); keep = 0; if (out) kv.set('out', out); };

function browser() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'edge' : /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox|FxiOS/.test(ua) ? 'firefox' : /CriOS|Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : /Mac OS X/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'windows' : /Linux|CrOS/.test(ua) ? 'linux' : 'other';
  return { b, os, screen: Math.min(screen.width, screen.height) < 600 ? 'phone' : Math.min(screen.width, screen.height) < 900 ? 'tablet' : 'desktop' };
}

// The day's first: who's playing today, by the first day they played (retention), and on what
function today() {
  const d = events.dayKey(now()), seen = kv.get('seen', null);
  if (seen === d) return;
  let first = kv.get('first', null);
  if (!first) {
    kv.set('first', (first = d)); add('new');
    let from = 'direct'; try { if (document.referrer) from = new URL(document.referrer).hostname.replace(/^www\./, ''); } catch {}
    if (from !== location.hostname) add(`from:${clean(from)}`);
  }
  const since = Math.round((Date.parse(d) - Date.parse(first)) / 864e5);
  add(`active:${since > 60 ? '60+' : since}`); add(`cohort:${first}`);
  const { b, os, screen: sc } = browser();
  add(`browser:${b}`); add(`os:${os}`); add(`screen:${sc}`);
  add(`speech:${'webkitSpeechRecognition' in window || 'SpeechRecognition' in window ? 'yes' : 'no'}`);
  add(`lang:${clean((navigator.language || '').split('-')[0])}`);
  add(`home:${clean(learner.persona())}`);
  for (const g of kv.get('goals', null) || ['none']) add(`goal:${clean(g)}`);
  const y = kv.get('born', null), age = y ? new Date(now()).getFullYear() - y : null;
  add(`age:${age == null ? 'none' : age < 13 ? 'under13' : age < 18 ? '13-17' : age < 30 ? '18-29' : age < 45 ? '30-44' : '45+'}`);
  try { add(`streak:${band(days.streak().n, [1, 2, 4, 8, 15, 31])}`); } catch {}
  kv.set('seen', d);
}

function hear(r) {
  today(); visit(r);
  if (r.k === 'line') {
    if (r.res === 'cancel') return;
    const ok = r.res === 'ok' && r.stars > 0;
    add(`line:${clean(r.mode)}:${clean(r.res)}`); add(`said:${r.id}`); if (!ok) add(`miss:${r.id}`);
  } else if (r.k === 'card') {
    if (r.again) return;
    const how = r.state === 'done' ? 'done' : r.state === 'playing' ? (r.asked ? 'left' : 'passed') : 'passed';
    add(`card:${clean(r.kind)}:${how}`);
    if (r.kind === 'scn' || r.kind === 'challenge') {
      add(`story:${r.id}:in`); add(`story:${r.id}:${how}`); if (r.out) add(`story:${r.id}:${clean(r.out)}`);
      add(`fmt:${clean(r.fmt)}:${how}`); if (r.lv != null) add(`lv:${clean(r.lv)}:${how}`);
    }
    add('secs', Math.round(Math.min(r.ms || 0, 30 * 60e3) / 1000));
    for (const n of ['gloss', 'reveal', 'peek', 'quiet', 'like', 'replay']) if (r[n]) add(`note:${n}`, r[n]);
  }
  soon();
}
// the visit a row belongs to (ks.visit: { start, last, cards }): the one before is counted whole as a new one begins
function visit(r) {
  const t = now(); let v = kv.get('visit', null);
  if (!v || t - v.last >= GAP) {
    if (v) { add(`visitmin:${band((v.last - v.start) / 60e3, [1, 3, 5, 10, 20, 40])}`); add(`visitcards:${band(v.cards, [1, 3, 6, 11, 21])}`); }
    v = { start: t, last: t, cards: 0 }; add('visit');
  }
  v.last = t; if (r.k === 'card' && !r.again) v.cards++;
  kv.set('visit', v);
}

function soon() { if (!timer) timer = setTimeout(() => { timer = 0; send(); }, Math.max(1000, EVERY - (performance.now() - last))); }
function send(going = false) {
  out ||= kv.get('out', {});
  const body = out, keys = Object.keys(body);
  if (!keys.length || (!going && performance.now() - last < EVERY)) return;
  last = performance.now(); out = {}; save();
  const back = () => { for (const k of keys) add(k, body[k]); }; // not sent: counted again next time
  try {
    fetch(URL_, { method: 'POST', body: JSON.stringify({ day: events.dayKey(now()), n: body }), headers: { 'Content-Type': 'application/json' }, keepalive: true, credentials: 'omit' })
      .then((r) => { if (!r.ok && r.status !== 400) back(); }, back);
  } catch { back(); }
}

// Only the real site counts (or a page told to: ks.countHere), and only once web.json has said what that is
export function init() {
  if (typeof document === 'undefined' || files.packed()) return;
  files.web().then((w) => {
    let real = false; try { real = !!w?.url && new URL(w.url).origin === location.origin; } catch {}
    if (!real && !kv.get('countHere', false)) return;
    events.on(hear);
    addEventListener('error', () => { if (errs++ < 20) add('error'); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { send(true); save(); } });
    send(true); // what an earlier visit left unsent
  });
}
