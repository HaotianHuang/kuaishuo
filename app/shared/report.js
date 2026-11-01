// Telling us something's wrong (docs/v2/web.md §4): "Something sound wrong?" on a story's end screen (feed.js endNote)
// and "Send feedback" in For You's menu (main.js), each a mailto: to web.json's contact, so a line that judged someone
// wrong, or a voice that says it oddly, can be found and put right. Nothing is sent by the app: the mail opens in the
// player's own mail app, to read and change before it goes. No contact, no link (files.js owner()). DOM-free: the
// caller hands in the rows, the text and the browser (tools/web-app-check.mjs builds one in Node too).
//   played(rows, { after, last })   the line rows of the card just played, oldest first (events.js's, as they stand):
//                                   back from the end to the last card left (a card row; the page hidden mid-story
//                                   isn't one), or to after (a time: the end of the run before it on the same card,
//                                   played Again), or to a line met again from its start (a line's first attempt
//                                   later on: a run before, played Again);
//                                   last: back from the last line logged instead (the menu: the story most recently
//                                   played, on screen or not). Answered lines only: a panel swiped away before it was,
//                                   isn't one
//   mailto({ to, scn, rows, text, browser, speech, feedback })   → 'mailto:…'. scn: the story ({ id, title, title_en },
//                                   or null: the menu before anything's played); rows: played()'s; text(id): a line's
//                                   Chinese; browser: the user agent and the window; speech: speech.js whyNot() ('' is
//                                   a recogniser); feedback: the menu's mail, not the end screen's
export function played(rows, { after = -Infinity, last = false } = {}) {
  const out = [], fresh = new Set(); // the lines this run met at their first attempt
  let i = rows.length - 1;
  if (last) while (i >= 0 && rows[i].k !== 'line') i--;
  for (; i >= 0; i--) {
    const r = rows[i];
    if (r.at <= after || r.k === 'sess' || (r.k === 'card' && r.how !== 'hide') || (r.k === 'line' && fresh.has(r.id))) break;
    if (r.k !== 'line') continue;
    if (r.att === 1) fresh.add(r.id);
    if (r.res !== 'cancel') out.unshift(r);
  }
  return out;
}

const RES = { ok: 'right', timeout: 'out of time', skip: 'skipped', fail: 'missed' };
const WAY = { speak: 'spoken', type: 'typed', tiles: 'tiles', self: 'said and checked' };
const HEARD = { speak: 'heard', type: 'typed', tiles: 'built' };
// Kept to what every mail app takes in a mailto (Chrome on Windows won't hand on one over 2,048 characters, escapes
// counted, and a Chinese character is nine): all of it where it fits; over that, a hearing that's the line itself
// without its punctuation (the judge never weighs it); then as "as written"; then the text of the lines that went
// right first time left out too; then the oldest lines (said so). A long hearing is cut.
const BUDGET = 2000, cut = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t), bare = (t) => (t || '').replace(/[\s\p{P}]/gu, '');
export function mailto({ to, scn = null, rows = [], text = () => '', browser = '', speech = '', feedback = false }) {
  const story = scn ? `${scn.title} (${scn.id})` : '';
  const subject = feedback ? `快说 feedback${story ? `, after ${story}` : ''}` : `快说: something sounds wrong in ${story || 'a story'}`;
  // "3. scn/beat 是我！我在三号出口。 right 3★, heard “是我我在三号出口”"; short: how far it's cut (above)
  const line = (r, k, short = 0) => {
    const zh = text(r.id) || '', heard = r.heard || [], same = (h) => bare(h) === bare(zh);
    const said = heard.map((h) => (!same(h) || !short ? `“${cut(h, 30)}”` : short < 2 ? `“${cut(bare(h), 30)}”` : 'as written')).join(', ');
    const clean = r.res === 'ok' && r.att === 1 && heard.every(same);
    return `${k + 1}. ${r.id}${zh && !(short > 2 && clean) ? ` ${zh}` : ''} ${RES[r.res] || r.res || '?'}${r.res === 'ok' && r.stars ? ` ${r.stars}★` : ''}${r.att > 1 ? `, try ${r.att}` : ''}, ${said ? `${HEARD[r.mode] || 'heard'} ${said}` : WAY[r.mode] || r.mode || '?'}`;
  };
  const head = feedback ? 'What would you like to tell us?' : 'What sounded wrong?';
  const body = (ls, gone) => [head, '', '', `What I just played${scn?.title_en ? ` (${scn.title_en})` : ''}:`, ...(gone ? [`(${gone} earlier line${gone === 1 ? '' : 's'} left out)`] : []), ...(ls.length ? ls : ['No lines yet.']), `Browser: ${browser || '?'}`, `Speech: ${speech ? `none (${speech})` : 'its recogniser'}`].join('\r\n');
  const url = (b) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(b)}`;
  let ls = rows.map((r, k) => line(r, k)), k = 0;
  for (let short = 1; short <= 3 && url(body(ls, 0)).length > BUDGET; short++) ls = rows.map((r, k) => line(r, k, short));
  while (k < ls.length - 1 && url(body(ls.slice(k), k)).length > BUDGET) k++;
  return url(body(ls.slice(k), k));
}
