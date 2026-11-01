// GET /api/stats?days=14: the daily totals for numbers.html, with the admin key (Authorization: Bearer <ADMIN_KEY>).
// Summed by D1 (json_each), not here: { from, to, daily: [[day, key, n]] for the keys that aren't per story or line,
// totals: [[key, n]] over the days for story:, said: and miss:, countries: [[day, country, phones]] }.
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// the admin key, compared without leaking how much of it matched
function admin(request, env) {
  const got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), want = env.ADMIN_KEY || '';
  if (!want || got.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export async function onRequestGet({ request, env }) {
  if (!admin(request, env)) return json({ ok: false }, 403);
  const days = Math.max(1, Math.min(90, Number(new URL(request.url).searchParams.get('days')) || 14));
  const day = (d) => new Date(d).toISOString().slice(0, 10), to = day(Date.now() + 864e5), from = day(Date.now() - (days - 1) * 864e5);
  const many = "(j.key LIKE 'story:%' OR j.key LIKE 'said:%' OR j.key LIKE 'miss:%')";
  const [daily, totals, countries] = await env.DB.batch([
    env.DB.prepare(`SELECT b.day, j.key, SUM(j.value) AS n FROM beats b, json_each(b.n) j WHERE b.day BETWEEN ? AND ? AND NOT ${many} GROUP BY b.day, j.key`).bind(from, to),
    env.DB.prepare(`SELECT j.key, SUM(j.value) AS n FROM beats b, json_each(b.n) j WHERE b.day BETWEEN ? AND ? AND ${many} GROUP BY j.key`).bind(from, to),
    env.DB.prepare('SELECT day, country, COUNT(*) AS n FROM beats WHERE day BETWEEN ? AND ? AND country IS NOT NULL GROUP BY day, country').bind(from, to),
  ]);
  return json({ ok: true, from, to, daily: daily.results.map((r) => [r.day, r.key, r.n]), totals: totals.results.map((r) => [r.key, r.n]), countries: countries.results.map((r) => [r.day, r.country, r.n]) });
}
