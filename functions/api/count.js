// POST /api/count: a phone's daily totals (app/shared/tally.js), kept as one row. { day, n: { key: count } }: every key
// held to KEYS, every count a whole number in reason; what fails is left out, and a send with nothing left is a 400 (the
// phone drops it rather than sending it again). Nothing about the sender is kept but the country Cloudflare says it's
// in, and that only on a phone's first send of its day (the one with active:), so countries count phones, not sends.
const KEYS = new RegExp('^(?:' + [
  'new', 'visit', 'secs', 'error',
  'from:[a-z0-9.-]{1,64}', 'active:(?:\\d{1,2}|60\\+)', 'cohort:\\d{4}-\\d\\d-\\d\\d',
  'browser:[a-z]{1,10}', 'os:[a-z]{1,10}', 'screen:[a-z]{1,10}', 'speech:(?:yes|no)', 'lang:[a-z]{1,8}|lang:none',
  'home:[a-z]{1,10}', 'goal:[a-z]{1,10}', 'age:[a-z0-9+-]{1,8}', '(?:streak|visitmin|visitcards):[0-9+-]{1,7}',
  'card:[a-z]{1,12}:(?:done|left|passed)', 'story:[a-z0-9_.-]{1,48}:[a-z]{1,10}', '(?:fmt|lv):[a-z0-9]{1,10}:(?:done|left|passed)',
  'note:(?:gloss|reveal|peek|quiet|like|replay)', 'line:[a-z]{1,10}:[a-z]{1,12}', '(?:said|miss):[a-z0-9_./@-]{1,64}',
].join('|') + ')$');
const MAX = { secs: 86400 }, BYTES = 32768, KEEP = 500;

const day = (d) => new Date(d).toISOString().slice(0, 10);

export async function onRequestPost({ request, env }) {
  const text = await request.text();
  if (text.length > BYTES) return new Response(null, { status: 413 });
  let b; try { b = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
  // the phone's day, within a day of the server's either side (a phone's day starts at 4 am, wherever it is)
  const t = Date.now(), d = String(b?.day || '');
  if (!/^\d{4}-\d\d-\d\d$/.test(d) || d < day(t - 2 * 864e5) || d > day(t + 864e5)) return new Response(null, { status: 400 });
  const n = {};
  for (const [k, v] of Object.entries(b.n && typeof b.n === 'object' ? b.n : {}).slice(0, KEEP)) {
    const x = Math.round(Number(v));
    if (KEYS.test(k) && x > 0 && x <= (MAX[k] || 10000)) n[k] = x;
  }
  if (!Object.keys(n).length) return new Response(null, { status: 400 });
  const country = Object.keys(n).some((k) => k.startsWith('active:')) && /^[A-Z]{2}$/.test(request.cf?.country || '') ? request.cf.country : null;
  await env.DB.prepare('INSERT INTO beats (day, country, n) VALUES (?, ?, ?)').bind(d, country, JSON.stringify(n)).run();
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
