// numbers.html: the daily totals (/api/stats) laid out. The key is kept in this browser (localStorage) once it works.
const $ = (s) => document.querySelector(s), out = $('#out'), status = $('#status');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–'), num = (n) => (n || 0).toLocaleString('en');
try { $('#key').value = localStorage.getItem('numbers.key') || ''; } catch {}

$('#go').onsubmit = async (e) => {
  e.preventDefault();
  const key = $('#key').value.trim();
  status.textContent = 'Loading…';
  try {
    const r = await fetch(`api/stats?days=${$('#days').value}`, { headers: { Authorization: `Bearer ${key}` } });
    if (r.status === 403) { status.innerHTML = '<span class="err">That key isn’t right.</span>'; return; }
    if (!r.ok) throw new Error(`${r.status}`);
    try { localStorage.setItem('numbers.key', key); } catch {}
    draw(await r.json());
    status.textContent = '';
  } catch (err) { status.innerHTML = `<span class="err">Couldn’t load: ${esc(err.message)}</span>`; }
};
if ($('#key').value) $('#go').requestSubmit();

function draw({ from, to, daily, totals, countries }) {
  // by day: { day: { key: n } }; over the days: { key: n }
  const D = {}, T = {};
  for (const [d, k, n] of daily) { (D[d] ||= {})[k] = n; T[k] = (T[k] || 0) + n; }
  for (const [k, n] of totals) T[k] = n;
  const days = Object.keys(D).sort().reverse();
  const sum = (o, re) => Object.entries(o || {}).reduce((t, [k, n]) => t + (re.test(k) ? n : 0), 0);
  const group = (prefix) => Object.entries(T).filter(([k]) => k.startsWith(prefix)).map(([k, n]) => [k.slice(prefix.length), n]).sort((a, b) => b[1] - a[1]);
  const phones = (o) => sum(o, /^active:/), lines = (o) => sum(o, /^line:/), right = (o) => sum(o, /^line:[^:]+:ok$/);
  const done = (o) => sum(o, /^fmt:[^:]+:done$/), started = (o) => sum(o, /^fmt:[^:]+:(done|left)$/);

  const tiles = [
    [phones(T), 'phone-days'], [T.new, 'new phones'], [T.visit, 'visits'], [Math.round((T.secs || 0) / 60), 'minutes played'],
    [done(T), 'stories finished'], [pct(done(T), started(T)), 'of stories begun, finished'], [lines(T), 'lines answered'], [pct(right(T), lines(T)), 'of lines right'],
  ];
  let html = `<p class="muted small">${esc(from)} to ${esc(to)}${days.length ? '' : ': nothing sent yet'}</p>`;
  html += `<div class="tiles">${tiles.map(([n, l]) => `<div class="tile"><b>${typeof n === 'number' ? num(n) : esc(n ?? 0)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;

  html += '<h2>By day</h2>' + table(['Day', 'Phones', 'New', 'Visits', 'Minutes', 'Stories finished', 'Finish rate', 'Lines', 'Right', 'Errors'],
    days.map((d) => { const o = D[d]; return [d, num(phones(o)), num(o.new), num(o.visit), num(Math.round((o.secs || 0) / 60)), num(done(o)), pct(done(o), started(o)), num(lines(o)), pct(right(o), lines(o)), num(o.error)]; }));

  // retention: phones of each first day playing n days on (cohort:<first day> on day d)
  const cohorts = [...new Set(daily.filter(([, k]) => k.startsWith('cohort:')).map(([, k]) => k.slice(7)))].sort().reverse().slice(0, 30);
  const span = Math.min(14, days.length);
  const cell = (c, n) => { const d = new Date(Date.parse(c) + n * 864e5).toISOString().slice(0, 10); return D[d]?.[`cohort:${c}`] || 0; };
  html += '<h2>Coming back</h2><p class="muted small">Phones by the day they first played, and how many played again n days later.</p>';
  html += table(['First day', ...Array.from({ length: span }, (_, n) => `+${n}`)], cohorts.map((c) => {
    const base = cell(c, 0);
    return [c, ...Array.from({ length: span }, (_, n) => { const v = cell(c, n); return n === 0 ? num(v) : v ? `${num(v)} <span class="muted">${pct(v, base)}</span>` : ''; })];
  }), true);

  html += '<div class="grid2">';
  for (const [title, prefix] of [['Came from', 'from:'], ['Country (phone-days)', null], ['Browser', 'browser:'], ['System', 'os:'], ['Screen', 'screen:'], ['Speech recogniser', 'speech:'], ['Language', 'lang:'], ['Heard Chinese at home', 'home:'], ['Goals', 'goal:'], ['Age', 'age:'], ['Streak', 'streak:'], ['Visit length (min)', 'visitmin:'], ['Cards a visit', 'visitcards:'], ['Answered by', 'line:'], ['Cards', 'card:'], ['Levels', 'lv:'], ['On a card', 'note:']]) {
    let rows = prefix ? group(prefix) : Object.entries(countries.reduce((o, [, c, n]) => ((o[c] = (o[c] || 0) + n), o), {})).sort((a, b) => b[1] - a[1]);
    if (prefix === 'line:') rows = Object.entries(rows.reduce((o, [k, n]) => { const [m, r] = k.split(':'); (o[m] ||= { all: 0, ok: 0 }).all += n; if (r === 'ok') o[m].ok += n; return o; }, {})).map(([m, x]) => [`${m} (${pct(x.ok, x.all)} right)`, x.all]);
    html += `<section><h2>${esc(title)}</h2>${bars(rows.slice(0, 15))}</section>`;
  }
  html += '</div>';

  html += '<h2>Formats</h2>' + table(['Format', 'Finished', 'Left mid-way', 'Passed', 'Finish rate'],
    [...new Set(group('fmt:').map(([k]) => k.split(':')[0]))].map((f) => [f, num(T[`fmt:${f}:done`]), num(T[`fmt:${f}:left`]), num(T[`fmt:${f}:passed`]), pct(T[`fmt:${f}:done`] || 0, (T[`fmt:${f}:done`] || 0) + (T[`fmt:${f}:left`] || 0))]));

  // stories: shown, finished, left, passed, won and lost
  const S = {};
  for (const [k, n] of group('story:')) { const i = k.lastIndexOf(':'); (S[k.slice(0, i)] ||= {})[k.slice(i + 1)] = n; }
  html += '<h2>Stories</h2><p class="muted small">Most shown first. Finish rate: of those begun (a line reached), finished.</p>' + table(['Story', 'Shown', 'Finished', 'Left mid-way', 'Passed by', 'Finish rate', 'Won', 'Lost'],
    Object.entries(S).sort((a, b) => (b[1].in || 0) - (a[1].in || 0)).map(([id, s]) => [id, num(s.in), num(s.done), num(s.left), num(s.passed), pct(s.done || 0, (s.done || 0) + (s.left || 0)), num(s.win), num(s.lose)]));

  // lines missed most, of those answered 5 times or more: where the judge or the Chinese may be wrong
  const said = Object.fromEntries(group('said:')), miss = Object.fromEntries(group('miss:'));
  const hard = Object.entries(said).filter(([, n]) => n >= 5).map(([id, n]) => [id, n, miss[id] || 0]).sort((a, b) => b[2] / b[1] - a[2] / a[1]).slice(0, 40);
  html += '<h2>Lines missed most</h2><p class="muted small">Answered 5 times or more. Worth a listen: a line most people miss may be judged wrong.</p>' +
    table(['Line', 'Answered', 'Missed', 'Miss rate'], hard.map(([id, n, m]) => [id, num(n), num(m), pct(m, n)]));
  out.innerHTML = html;
}

function table(head, rows, raw = false) {
  if (!rows.length) return '<p class="muted small">Nothing yet.</p>';
  return `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td>${raw && i ? c : esc(c ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function bars(rows) {
  if (!rows.length) return '<p class="muted small">Nothing yet.</p>';
  const top = Math.max(...rows.map(([, n]) => n));
  return `<table><tbody>${rows.map(([k, n]) => `<tr><td>${esc(k)}</td><td>${num(n)}</td><td class="bar"><i style="width:${Math.max(2, Math.round((100 * n) / top))}%"></i></td></tr>`).join('')}</tbody></table>`;
}
