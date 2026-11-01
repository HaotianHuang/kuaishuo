# P6a: the web version (design and contracts)

The owner's call (31 Oct 2026): the public web version comes next, ahead of P5c, so 快说 can launch on Hacker News.
Show HN's rule is that people can try it "without barriers such as signups or emails". Today the game lives on the
owner's laptop and in a private claude.ai page with no microphone. P6a builds a static site anyone can open over https:
fast on a phone, playable in Chrome, Safari and Firefox, and holding the launch's must-haves that are code. Putting it
on the internet is a separate step that needs the owner's OK (§6).

## 1. What ships

`node tools/pack.mjs --web` builds `web/`, built aside and swapped in whole like dist/:

| Path | What | Cache (`_headers`) |
|---|---|---|
| `index.html` | a real document: `<!doctype html>`, `<html lang="en">`, charset, viewport (`viewport-fit=cover`), serve.mjs's skeleton reset (so it looks as it does on claude.ai), title, description, theme colour, icons, manifest, Open Graph and Twitter card tags, a `<noscript>` line | `no-cache` |
| `assets/app-<hash>.js`, `assets/app-<hash>.css` | the bundle and the CSS, minified by esbuild with pack.mjs's Safari 14 checks, as files and not inline, so a return visit loads them from cache | a year, `immutable` |
| `data/*.json` | data/ as it is (files.js reads these by name; Cloudflare compresses them) | `no-cache` |
| `audio/<pack>.mp4` | the packs data/content.json plays, in pack.mjs's smaller mono 32 kbps form from `.cache/pack/`, under their own names (content-hashed by build.py) | a year, `immutable` |
| `icons/…`, `manifest.webmanifest`, `og.png` | the app icon (SVG favicon, 180 px Apple touch icon, 192 and 512 px), the share image (1200×630) | a day |
| `about.html` | §3, readable without JavaScript | `no-cache` |
| `404.html` | a short page linking home. Without one, Cloudflare Pages serves index.html for any missing path, so a lost voice pack would come back as a 200 page and fail to decode, not as the 404 files.js reports | |
| `_headers` | §2 | |

- **What ships is data/:** the stories the owner's gate has made live. Drafts under `review/` never ship.
- **Nothing else goes in:** no .md, no review/, tools/, content/ or node_modules, no source maps, no dot-files.
  Every file stays under Cloudflare Pages' 25 MiB, and there are fewer than 20,000 files.
- **The artifact build is untouched:** `pack.mjs` without `--web` makes the same dist/ as before.
- **No service worker** (my call): HTTP caching covers return visits, and a worker's stale-update failures are the
  wrong risk for a launch. One comes later with notifications.
- **The manifest's `display` is `browser`:** an iPhone Home Screen web app has no speech recogniser, so Add to Home
  Screen gives a bookmark that opens in Safari, where it has one.
- **Fonts:** ZCOOL KuaiLe stays on Google Fonts, and about.html says so. Self-hosting a subset (fonttools is
  installed; the font is OFL) is a later option.

## 2. Headers

`_headers` (Cloudflare Pages' format), for every path:
- `Content-Security-Policy`: `default-src 'self'`; scripts from self only; styles from self, Google Fonts and inline
  (the app writes style attributes); fonts from fonts.gstatic.com; media and images from self, `data:` and `blob:`
  (the silent WAV for iOS's ring switch is a data: URL); `connect-src 'self'`; worker and worklet sources as the app
  needs them; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'none'`.
- `Permissions-Policy: microphone=(self), camera=(), geolocation=()`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`.
- The cache rules in §1's table.

`node tools/serve.mjs --web` serves web/ and applies `_headers` as Cloudflare would (the subset pack writes), so every
check below runs under the real CSP. `wrangler pages dev web` is the final check that Cloudflare reads them the same way.

## 3. About, privacy, and how it's made

`about.html`, linked from the menu, the gate (small, under the tap) and Settings. It uses the game's look and says
plainly:
- **What it is and who it's for:** speaking practice in short, absurd emergencies, for people who understand more
  Chinese than they can say, and for beginners.
- **What stays on the phone: everything the game learns.** Progress, the learner model and the log live in this
  browser's storage. No account, no cookies, no analytics, no ads. Settings → Start over deletes it all.
- **What leaves the phone:**
  - when you speak, the browser's speech recogniser hears it: Chrome sends the audio to Google; Safari uses Apple's
    recogniser, which can send it to Apple; Firefox has none, so you type or tap;
  - the font comes from Google Fonts;
  - the host (Cloudflare) sees page requests, as for any website.
- **How it's made:** stories drafted with AI and edited, every one played and approved by a person before it goes
  live; voices synthesised (named: ElevenLabs, Kokoro); speech judged in the browser. Honest and short.
- **Who made it, and how to reach them:** from `web.json` (below). A line stays out when its field is empty.

`web.json` (new, at the repo root) holds what only the owner can say: `{ "name", "by", "contact", "url" }`. pack
prints what's unset, and leaves out what depends on it: no contact → no report button and no contact line. The owner
set them on 31 Oct 2026: the name stays 快说 Kuài Shuō (close to 快手 Kuàishǒu, and kept), the contact is
hello@huangetal.org, and the maker is "the people behind huangetal.org", as on freelearninggame.com. `url` waits for
the domain.

**Settings → Start over:** deletes everything this game keeps in the browser, after a confirm that says what goes.
Then the page reloads as a phone that has never played.

## 4. Telling us something's wrong

With `contact` set:
- the end card gets "Something sound wrong?";
- the menu gets "Send feedback".

Both open a `mailto:` addressed to the contact. Its subject names the story; its body lists the lines just played, by
id and text, with what was heard and the browser. Nothing is sent by the app itself, and the player sees the mail
before it goes. The answer panel stays clear: no button beside a line.

## 5. Every browser, every screen

- **Firefox has no recogniser:** the game must be the real game there, with typed and tile answers (ask.js's NOMIC
  path), and the first story still a win.
- **Safari's recogniser** is webkitSpeechRecognition; the owner checks it on their iPhone by hand (no WebKit driver
  here).
- **Desktop:** the feed moves with ↓, PageDown, j and the wheel; the gate says "Click" where the pointer is fine, and
  "Tap" on a touch screen. The layout is checked at 1440×900 as well as 390×844 and 360×740.
- **A slow phone:** the first visit's budget, cold cache, under Chrome's Fast 4G profile: the gate ready to tap in 3 s or
  less; the first answer panel within 8 s of the tap (first-check's threshold); at most 1.5 MB transferred before the
  tap; the first story's pack at most 600 KB.

## 6. Going live (the owner's OK, each time)

`node tools/deploy-web.mjs` (written now, not run):
- refuses any Cloudflare Pages project but `kuaishuo`;
- refuses a web/ older than its sources, and a web.json missing `contact`;
- runs `wrangler pages deploy web --project-name kuaishuo`, `--branch preview` unless told `--production`.

A preview deploy is public at an unlisted address: the private test link for a few friends. Cloudflare Access can put
a login in front of it. The custom domain, analytics (aggregate counts, decision 2) and the production deploy are each
the owner's call.

## 7. Checks

`tools/web-check.mjs` (new), against `serve.mjs --web`:
- **The build:** every referenced file exists; nothing that mustn't ship; size limits; the HTML's head, the manifest
  and its icons; the headers on each kind of path.
- **Chrome, a fresh phone:** the gate, the first story and the about card, at 390×844 and 1440×900:
  - no console errors;
  - no CSP violations (`securitypolicyviolation`, collected);
  - no request to any host but this one and Google Fonts.
- **Firefox** (puppeteer over WebDriver BiDi, /Applications/Firefox.app): a fresh phone through the gate, the first
  story answered by typing, its end card, and the next card, with no console errors.
- **The rest:** the slow-phone budget (§5), timed alone; a missing pack is a real 404; Start over leaves a fresh phone;
  the report mailto's address, subject and body.
- **Screenshots** in `review/web/`.

`test.mjs` and `first-check.mjs` take `--web` as they take `--dist`.

## 8. Done when

| Check | Threshold |
|---|---|
| The build | web-check's build part passes; dist/ byte-identical to a pack without `--web` from the same tree |
| Chrome | the matrix's default and `--nomic` variants pass with `--web`; first-check `--web` passes; 0 console errors, 0 CSP violations, no other hosts |
| Firefox | a fresh phone plays its first story by typing to the end card, and the next card comes |
| Slow phone | gate ≤ 3 s, first panel ≤ 8 s after the tap, ≤ 1.5 MB before the tap, first pack ≤ 600 KB |
| Pages | about.html true to the code (what's kept, what leaves); Start over works; the report mail is right; 404 is real |
| The rest | the matrix, rank-check, loops-check and the --dist runs no worse than P5a's; `wrangler pages dev web` serves it with the same headers |
