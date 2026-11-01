# Content track → app: what the data holds now, and what the gate needs

From the content session (P4), 30 Oct 2026. The content files are `content/**`, `CONTENT.md`, `tools/build.py`,
`tools/validate.mjs`, `tools/judge-check.mjs` and `tools/factory.mjs`; nothing here touches `app/**`.

## New in data/content.json (once the live build is rerun)

All additive; v1 ids, clip positions and audio are unchanged (16 of the 20 packs are byte-identical; courier-crabs,
first-date, late-boss and locked-out get new pack names because their live packs predate the 06:43 reading fixes, the
old ones stay until `--clean`).

- **Scenario:** `level` 0–5 (v1 keeps 1–4); `listen` (0–5, the source's or measured); `lis` = `{cps, chars, long,
  zipf, hidden, lines}` (other characters' lines: Han characters a second over their clips, mean characters a line,
  the 75th percentile, the median line's rarest word as zipf, the share of characters not shown as text at first, and
  how many lines); `topics` (one to three of `family dating food travel home work shopping animals health
  celebrations`) and `topic` (the first, for the ranker's topic arms); `audience` (`heritage` | `new`); `hook` (1–5,
  a judge's score: stakes by second 5, absurdity, relatability); `status` (`live`; the live build never contains a
  draft); `series` = `{id, ep, next}` on an episode, `next` the English cliffhanger for the end card.
- **Top level:** `series` = `{id: {title, title_py, title_en, eps}}` for the series the build's episodes belong to.
- **Beat (`say`):** `lv`, the build's estimate of the line's say level (0–5). `levels` = `{"0": override, "3": …}`
  where a beat plays at other levels; each override already carries its own built `ans`, `a`, `slow`, `key` (when it
  has new answers) and `lv`, and may carry `status: "draft"` in a gate build.
- **Phrase:** `family` (the beat's own id), `lv`, `f` = `{level, chars, needGroups, zipf}` for the item prior
  (`level` is the declared level: the scenario's for a beat, the key for an override; zipf is the rarest need word's
  log10 frequency per billion in jieba's dict, each group's word as the model answer says it). Overrides are phrases
  of their own: `scn/beat@L`, every field merged as `tailor()` would.

## tailor(): how an override merges (build.py `tailor()` and judge-check do exactly this)

```js
const tailor = (b, o) => { const { levels, ...t } = b; Object.assign(t, o); if (o.alts) t.alts = o.alts.map(({ of, ...a }) => ({ ...b.alts[of], ...a })); return t; };
```

- The override's fields replace the beat's (`answers`, `ans`, `a`, `slow`, `need`, `not`, `mistakes`, `gloss`, `tip`,
  `cue`, `en`, `key`, `time`, `hint`, `free`, `mode`, `reply`, `decoys`, `lv`); anything it leaves out is the beat's.
  NPC steps (`ok`, `fail`, `miss`, branches' `then`) are never in an override.
- `alts` in an override is the list of the beat's branches that show at that level, each `{of: <index>, …changes}`;
  `[]` hides them all; no `alts` key keeps them all as they are.
- `time: 0` means no clock (L0); `levels.clock(0)` is already 0.
- The played beat's review id is `scn/beat@L` (`pid`); `family` is `scn/beat`. A chase `again` encounter has overrides at
  the same levels as the one it drills (validate holds it to that), so `scn/first@L` always names a real phrase.

## Requests for the app (P4 needs them for the owner's gate; none blocks the content work)

Done by the code session: 1 to 4 (de70725), 6 and 7 (fd4697c). Open: 5 (with P1/P2), 8 (low priority).

1. **`#play?id=<scn>&lv=<L>`**: play one story at one say level (tailored), straight in. The gate pages link every
   story at each of its levels this way.
2. **`?data=<dir>`**: load `<dir>/content.json`, `<dir>/py.json` and `<dir>/strokes.json` instead of `data/` (a gate
   build is `review/gate/<batch>/data`). Audio needs nothing: a gate build writes each pack's path from the page,
   `review/gate/<batch>/audio/<id>-<hash>.mp4` for the batch and `audio/…` for the live stories it sits beside.
3. **`tools/test.mjs --data=<dir>`** (and `--level=<L>` if it's cheap): `node tools/factory.mjs <batch> --play` runs
   `node tools/test.mjs --only=mix --nomic --data=review/gate/<batch>/data`, the factory's headless play step.
4. A small **draft badge** on a card or line whose `status` is `draft` would help the owner's gate (only gate builds
   have them).
5. **Cards** (flash, write, shadow) can filter `data.phrases` by `level` or `lv` to the level played; the phrase
   deck can group a family (`family`).
6. **No clock at L0, whatever the beat says.** v1 beats carry their own `time` (10 to 15 s), and a level override
   that doesn't set `time` inherits it, so ask.js:79 (`opts.time ?? beat.time ?? levels.clock(level)`) gives a v1
   story played at L0 its old clocks. L0 is clockless by definition (README §3), so the level should win there, e.g.
   `opts.time ?? (level === 0 ? 0 : beat.time ?? levels.clock(level))`; the same for call patience (call.js:289).
   Content won't stamp `"time": 0` on every L0 override.
7. **`tools/test.mjs` reads an option up to its second `=`** (`opt()`: `.split('=')[1]`), so
   `--only=play?id=bubble-tea&lv=0` can't reach the play route. Splitting on the first `=` only (`.slice(k.length + 3)`)
   lets `node tools/factory.mjs <batch> --play` play each of the batch's stories at each of its levels through `#play`
   (`--only=play?id=<id>&lv=<L>,…`), which is all the factory needs (no `--level`). Its screenshots are named after
   the route.
8. Low priority, for match.js: **erhua typed as pinyin.** An answer with 一点儿 typed as `yidianr` doesn't match a
   need word written with 儿 (一点儿都不会), because the build reads 点儿 as one syllable, diǎnr. Content avoids
   need words with 儿 in the middle for now (square-dance dropped 我一点儿都不会 from its answers).

## The world (P5c): the content side of world.md §6

From the content session, 31 Oct 2026. Built and checked (validate.mjs, build.py, judge-check.mjs, factory.mjs);
CONTENT.md, The world, is the writer's version. Where it's shaped differently from world.md §6, it's said here: request
9 is the app's side.

**In data/content.json** (all additive; a live build carries them once it's rerun):
- `world` = `{ places: { id: { name, name_py, en } }, cast: { id: { name, name_py, emoji, en, en_new?, home, feel } } }`:
  the contacts page. `feel` is `{ "-2": line, …, "4": line }`, one per feeling step; `en` is who they are to a
  heritage player, `en_new` to a newcomer (absent: a newcomer never meets them). content/world.json is the source
  (its `who` notes and voices stay out of the build).
- A cast entry that is someone from the world carries `is` (their world id): everyone met, for Contacts. Their voice
  is the same in every story and message.
- `messages` = a list shaped like chat scenarios, plus `from` (the cast key, a world id, of who sends it), `story` (the
  story or message whose end sends it), `after` (`"30m"`, `"3h"`, `"2d"`, `"19:00"`, `"tomorrow 19:00"`) and `when`
  (optional: sent only where it holds as `story` ends). `format` is `chat`, `chat` is `{ with: from }` unless the
  message says otherwise, and each has its own audio pack. Phrases: `msg-id/beat`, like a scenario's.
- A scenario's `first` and `gate` (main.js and rank.js already read them), and `kind: "decide"` for You Decide.
- `series[id]` also has `audience` (`heritage` | `new` | `all`) and `levels` (`[lo, hi]`): threads.
- On steps, beats and branches, as CONTENT.md writes them:
  - `when` on any step (line, narration, sfx, beat, end), with an optional `else`: **a list of steps** played in its
    place where `when` doesn't hold. That's how "otherwise the line without one" is written: the pair stays together,
    so a callback and its fallback can't drift apart, and two siblings with `when` never need ordering rules.
  - `when` on a branch (`alts[i].when`): offered only where it holds.
  - `sets` (`{ flag: value }`) and `rel` (`{ worldId: ±1 }`) on a beat (applied when its own line is said) and on a
    branch (when that's said), and on `perfect`.
  - `secret: true` on a branch, and `perfect` on a beat (below).
  - `verdict: true` on a You Decide story's choice beat.

**Conditions** (`world.when(cond)`): `{ "<flag>": value }` (every key holds: equality; a flag never set equals
nothing), `{ rel: { worldId: ">=1" } }` (`>=`, `<=`, `>`, `<`, `=`, or a bare number for `=`), `{ all: [] }`,
`{ any: [] }`, and **`{ not: cond }`**, the one addition to §6 (for "unless", and for a flag that may never have been
set). Flags are named `<story or thread id>.<name>` (`back-home.salary`), so a flag is never `rel`, `all`, `any` or
`not`; values are `true`, a word or a number.

**tailor(scn, levels, world)**, as the build and the checks read it:
1. Each beat at its level override first (as now: `alts: [{of}]` indexes the beat's own branches, so levels go first).
2. Then `when`: a step whose `when` holds plays without `when` and `else`; one that doesn't is replaced by its `else`
   steps (each resolved the same way), or dropped. A branch whose `when` doesn't hold is dropped from `alts` before the
   beat is judged, so it can't be taken.
3. What's said applies `sets` and `rel` (story.js): a beat's own when its line is said, a branch's when it's taken.

**Secret endings**:
- `secret: true` on a branch: it's judged like the others (said, it's taken) but not offered in the "or: …" choices,
  nor hinted on the end card. With `when`, only where that holds. It leads to an ending of its own (validate warns
  otherwise), counted among the endings to collect as a secret one.
- `perfect: { then, sets?, rel? }` on a beat: the beat's line said perfectly first time (3★, no help, first try) plays
  `perfect.then` in place of `ok`; the beat's own `sets` and `rel` apply as well as `perfect`'s.

**You Decide**: a beat with `verdict: true` is two or three things to say (its line and one or two branches), each a
fine verdict. The app shows them as equals (no "the" answer: the mission is the question, each verdict its cue), and
whichever the player says is the path.

**What validate holds content to** (so world.js can trust it): every world id in a cast, `rel` or condition exists;
every flag set is read later (in its own story, a message, a later episode, another thread; not an earlier episode of
its thread); every flag read is set somewhere to that value, by live content where the reader is live; every feeling a
condition tests is moved that far by the catalogue's choices; an override can't change `sets`, `rel`, `when` or
`secret`; two characters who share a voice are never in one story; one `first` at most.

9. **For P5c** (the engine's, after P5a; none of it blocks content): `content.tailor()` resolving `when`/`else` and a
   branch's `when` as above; story.js applying `sets`/`rel` (and `perfect`); ask.js leaving `secret` branches out of
   the choices it offers; a verdict beat's choices shown as equals; Contacts from `data.world` and the casts' `is`;
   Messages from `data.messages` (`after` from the end of `story`, `when` read then). The first world batch (brief
   `content/briefs/w1.md`) will need #play to take a world state to test a callback, e.g.
   `#play?id=<scn>&flags=back-home.supper:home&rel=nainai:2`, and a way to open a message (`#play?id=<msg-id>`).
10. **The first story.** breakfast-qr (p4b-2, a draft until the owner's gate) is marked `first: true` with
   `gate: "You're late for work, your phone's on 1%, and he's already cracking your egg."`. main.js and rank.js already
   take them; `tools/first-check.mjs` still expects airport-esim as card 1 (its line 149 and the `airport-esim/` rows
   after it), so once breakfast-qr is live it should read the story marked `first` from the data instead.

## Notes

- `review/` is gitignored, so `review/levels.md` and the gate pages (`review/gate/<batch>.md`) aren't committed. If
  the owner wants the gate pages kept, `git add -f review/gate/*.md` (the builds inside stay ignored).
- The live build (`~/.cache/kuaishuo/venv/bin/python -I tools/build.py`) writes data/ files whole (a temp file renamed
  over the old one), so a test reading `data/` meanwhile never sees half a file.
