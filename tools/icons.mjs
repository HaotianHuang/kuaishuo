#!/usr/bin/env node
// tools/icons.mjs: the web build's icons and share image (docs/v2/web.md §1), the 快说 wordmark in the game's look (the
// gate's: ZCOOL KuaiLe in 快说 red on the night ink), drawn by headless Chrome with the font from Google Fonts, as the
// page loads it. Writes app/web/icons/ (icon.svg, the favicon; apple-touch-icon.png, 180 px; icon-192.png, icon-512.png)
// and app/web/og.png (1200×630), which are committed: pack.mjs --web copies them, and nothing here runs at build time.
//   node tools/icons.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname), OUT = path.join(ROOT, 'app', 'web');
const INK = '#0f0d13', RED = '#ff4d5e', PAPER = '#f7f2e8', GOLD = '#ffc53d', MARK = '快说';
const FONT = 'https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap';
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));

// The wordmark's outlines from the font itself, so the favicon is a real SVG (an icon can't load a web font). A plain
// browser gets TrueType from Google Fonts (a modern one gets WOFF2, which needs Brotli), and TrueType's quadratic
// outlines are a few lines to read: cmap (format 4 or 12) → glyph → loca/glyf, simple glyphs only.
function outlines(ttf, text) {
  const dv = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength), u8 = (o) => ttf[o], u16 = (o) => dv.getUint16(o), i16 = (o) => dv.getInt16(o), u32 = (o) => dv.getUint32(o);
  const T = {};
  for (let i = 0; i < u16(4); i++) T[String.fromCharCode(...ttf.subarray(12 + 16 * i, 16 + 16 * i))] = u32(20 + 16 * i);
  const long = i16(T.head + 50) === 1, nh = u16(T.hhea + 34), upem = u16(T.head + 18);
  const f4 = (t, c) => {
    const n = u16(t + 6) / 2, end = t + 14, start = end + 2 * n + 2, delta = start + 2 * n, range = delta + 2 * n;
    for (let i = 0; i < n; i++) if (u16(end + 2 * i) >= c) {
      const s = u16(start + 2 * i), ro = u16(range + 2 * i);
      if (s > c) return 0;
      const g = ro ? u16(range + 2 * i + ro + 2 * (c - s)) : c;
      return g ? (g + i16(delta + 2 * i)) & 0xffff : 0;
    }
    return 0;
  };
  const f12 = (t, c) => { for (let i = 0; i < u32(t + 12); i++) { const o = t + 16 + 12 * i; if (c >= u32(o) && c <= u32(o + 4)) return u32(o + 8) + c - u32(o); } return 0; };
  const subs = Array.from({ length: u16(T.cmap + 2) }, (_, i) => T.cmap + u32(T.cmap + 8 + 8 * i)).filter((t) => [4, 12].includes(u16(t)));
  const glyph = (c) => { for (const t of subs) { const g = u16(t) === 4 ? (c < 0x10000 ? f4(t, c) : 0) : f12(t, c); if (g) return g; } throw new Error(`the font has no glyph for ${String.fromCodePoint(c)}`); };
  const loca = (g) => (long ? u32(T.loca + 4 * g) : 2 * u16(T.loca + 2 * g));
  let pen = 0, d = '';
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ch of text) {
    const g = glyph(ch.codePointAt(0)), at = T.glyf + loca(g), adv = u16(T.hmtx + 4 * Math.min(g, nh - 1));
    if (loca(g + 1) > loca(g)) {
      const nc = i16(at);
      if (nc < 0) throw new Error(`${ch} is a composite glyph, which this reader doesn't follow`);
      const ends = Array.from({ length: nc }, (_, k) => u16(at + 10 + 2 * k)), n = ends.at(-1) + 1;
      let p = at + 10 + 2 * nc; p += 2 + u16(p);
      const fl = [];
      while (fl.length < n) { const f = u8(p++); fl.push(f); if (f & 8) for (let r = u8(p++); r--;) fl.push(f); }
      const axis = (short, same) => { let v = 0; return fl.map((f) => { if (f & short) { const dd = u8(p++); v += f & same ? dd : -dd; } else if (!(f & same)) { v += i16(p); p += 2; } return v; }); };
      const X = axis(2, 16), Y = axis(4, 32);
      for (let k = 0, s = 0; k < nc; s = ends[k++] + 1) {
        const pts = X.slice(s, ends[k] + 1).map((x, j) => ({ x: x + pen, y: Y[s + j], on: !!(fl[s + j] & 1) }));
        for (const q of pts) box[0] = Math.min(box[0], q.x), box[1] = Math.min(box[1], q.y), box[2] = Math.max(box[2], q.x), box[3] = Math.max(box[3], q.y);
        // start on a point on the curve (or between two off it), then a line to each on-point, a curve through each
        // off-point, and the implied on-point between two off-points
        const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });
        const i0 = pts.findIndex((q) => q.on), ring = i0 < 0 ? [mid(pts[0], pts[1]), ...pts.slice(1), pts[0]] : [...pts.slice(i0), ...pts.slice(0, i0)];
        const r = (v) => Math.round(v * 10) / 10;
        d += `M${r(ring[0].x)} ${r(ring[0].y)}`;
        for (let j = 1; j <= ring.length; j++) {
          const q = ring[j % ring.length];
          if (q.on) { d += `L${r(q.x)} ${r(q.y)}`; continue; }
          const nx = ring[(j + 1) % ring.length], to = nx.on ? nx : mid(q, nx);
          d += `Q${r(q.x)} ${r(q.y)} ${r(to.x)} ${r(to.y)}`;
          if (nx.on) j++;
        }
        d += 'Z';
      }
    }
    pen += adv;
  }
  return { d, box, upem };
}

// the icon: the wordmark across the middle of a square of ink, rounded for the favicon (the PNGs are square: iOS and
// Android round them themselves)
const icon = ({ d, box }, rx) => {
  const [x0, y0, x1, y1] = box, s = (512 * 0.78) / (x1 - x0), tx = 256 - (s * (x0 + x1)) / 2, ty = 256 + (s * (y0 + y1)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"${rx ? ` rx="${rx}"` : ''} fill="${INK}"/><path fill="${RED}" transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${s.toFixed(4)} ${(-s).toFixed(4)})" d="${d}"/></svg>\n`;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0');
  const ttf = new Promise((ok, no) => { page.on('response', (r) => { if (/fonts\.gstatic\.com/.test(r.url())) r.buffer().then(ok, no); }); setTimeout(() => no(new Error('no font from Google Fonts in 20 s')), 20000); });
  await page.setContent(`<link rel="stylesheet" href="${FONT}&text=${encodeURIComponent(MARK)}"><span style="font-family:'ZCOOL KuaiLe'">${MARK}</span>`);
  const mark = outlines(new Uint8Array(await ttf), MARK);

  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'icons', 'icon.svg'), icon(mark, 112));
  const shot = async (html, w, h, file) => {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.setContent(`<style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${INK}}svg{display:block;width:100%;height:100%}</style>${html}`, { waitUntil: 'networkidle0' });
    // never a picture in a fallback font
    if (html.includes('ZCOOL') && !(await p.evaluate(async (m) => { await document.fonts.ready; return document.fonts.check("64px 'ZCOOL KuaiLe'", m); }, MARK))) throw new Error(`${file}: ZCOOL KuaiLe never came from Google Fonts`);
    await p.screenshot({ path: path.join(OUT, file) });
    await p.close();
  };
  for (const [n, f] of [[180, 'icons/apple-touch-icon.png'], [192, 'icons/icon-192.png'], [512, 'icons/icon-512.png']]) await shot(icon(mark, 0), n, n, f);

  // the share image: the wordmark as the gate draws it, what it is, and that it's free with no sign-up
  const line = 'Speak Chinese in short, absurd emergencies', B = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
  await shot(`<link rel="stylesheet" href="${FONT}"><style>
    .c{box-sizing:border-box;height:630px;display:grid;place-content:center;justify-items:center;padding:0 80px;text-align:center;color:${PAPER};background:radial-gradient(circle at 50% 36%,#241e2e 0,${INK} 64%)}
    .m{font:220px/1 'ZCOOL KuaiLe';color:${RED};letter-spacing:8px}.p{font:46px/1.2 'ZCOOL KuaiLe';margin:6px 0 34px}
    .l{font:700 40px/1.25 ${B};max-width:920px}.f{margin-top:20px;font:600 28px/1 ${B};color:${GOLD}}
  </style><div class="c"><div class="m">${MARK}</div><div class="p">Kuài Shuō</div><div class="l">${line}.</div><div class="f">Free in your browser · no sign-up</div></div>`, 1200, 630, 'og.png');
  for (const f of ['icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'og.png']) console.log(`app/web/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1)} KB`);
} finally { await browser.close(); }
