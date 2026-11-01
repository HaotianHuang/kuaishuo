# Writing a 快说 scenario

One JSON file per scenario in `content/src/`, named `<format>-<id>.json`. `node tools/validate.mjs` checks them all.
`content/src/scene-airport-esim.json` is the worked example: read it first, it sets the bar.

## What makes a good one

- **Stakes in the first five seconds.** Something is about to go wrong and only you, speaking Chinese, can fix it.
  Ridiculous beats realistic (a goose, your aunt's questions, a tiger at a temple fair), but every phrase you must
  say is one a native speaker really uses, and you would use again.
- **A twist or a punchline at the end.** The phrase sticks because the scene did.
- **The player is conversational but reads little.** Aim at natural colloquial mainland Mandarin, HSK 3 to 5
  chunks: 麻烦你……一下, 能不能……, 来不及了, 差点儿, 被锁在外面了, 帮我个忙, 说来话长, 不至于吧. Not textbook lines.
- **Short.** Lines of at most about 20 characters (30 at the very most). 8 to 16 steps, 3 to 5 `say` beats, under two
  minutes. The model answer the player must say is ideally 14 characters or fewer.
- **Fast to the first line.** At most one narration (12 words or fewer) before the first thing someone says, and the
  player's first turn within about 8 seconds. Stakes come from the situation, not from a paragraph.

## Style rules

Who these stories are for: 2nd- and 3rd-generation diaspora Chinese, who understand far more than they say, and
English-background learners starting out. Everyone should be able to laugh at a scene and nobody should be the joke.

- **Relatives pry because they care, and every scene ends warm.** The aunt asking about your salary, your love life
  and your weight is funny because she loves you; the last beat shows it (she slips you a red packet, saves you the
  last dumpling). A lose ending is a comic one, never a cruel one.
- **Nobody mocks an accent or anyone's identity.** Not the player's Chinese, not a migrant worker's dialect, not a
  foreigner's tones. "你中文好可爱！" gets a comeback the player gets to land; the player is never the punchline for
  sounding foreign, and nobody is for where they're from.
- **China is ordinary and modern.** Delivery apps, high-speed rail, QR codes, group chats, a mortgage: the everyday
  life of a big country, not temples and kung fu. Animals and folklore are welcome as absurdity, not as exotica.
- **Dating stays gender-neutral:** 对象, 那个人, a name. Nobody assumes the player's partner's gender, or the
  player's (see "Never gender the player" below).
- **Settings span the diaspora:** Shanghai and a county town, but also Toronto, Sydney, London, Vancouver, a Chinatown
  bakery, a family WeChat group with members in four time zones.
- **No politics, no religion.** Temples and festivals as places and customs only.
- **No stereotypes as jokes:** not the tiger mother, not the cheapskate, not the bad driver. The comedy comes from
  the situation (a goose, a 60-second voice note, a door game at a wedding), not from who someone is.

## Rules for the Chinese

- Simplified characters. No pinyin in the source: it is generated (and checked) by the build.
- Numbers as characters (三号出口, 一分钟, 一百五), never digits.
- No Latin letters inside `zh`: the voice can't say them. Write 网 or 无线网 for Wi-Fi, 手机卡 for SIM.
- Never gender the player. Nobody calls "you" 小伙子, 姑娘, 美女, 帅哥, 先生 or 女士. Use 你, 您, 同学, 年轻人, 朋友,
  这位, 小朋友 (from grannies) or a name. NPCs may of course be gendered.
- `en` is a natural English translation, not word for word.

## Scenario fields

```jsonc
{
  "id": "airport-esim",            // kebab-case, unique across all files
  "format": "scene",               // scene | chase | chat | call
  "title": "手机没信号",            // short Chinese title, shown big
  "title_en": "No Signal at Arrivals",
  "level": 2,                      // the say level, 0 to 5 (the table below)
  "listen": 3,                     // optional: the listen level, 0 to 5; the build measures it when it's left out
  "topics": ["travel"],            // one to three, the first the main one (the list below)
  "audience": "new",               // heritage | new: who the story is written for first (both can play it)
  "hook": 5,                       // 1 to 5: stakes by second 5, absurdity, relatability (a judge scores it)
  "status": "live",                // draft | live: only the owner makes a story live; drafts never ship
  "series": { "id": "back-home", "ep": 1, "next": "二姨 has already sent your photo to someone's mother." },   // optional
  "kind": "decide",                // optional: a 你来评评理 You Decide story (The world, below)
  "first": true,                   // optional, one story only: the one a brand-new phone opens on (level 0)
  "gate": "You've just landed at Pudong, and your phone has no signal.",   // with first: the hook over "Tap to start"
  "tags": ["机场", "借手机"],       // 2 to 4 Chinese hashtags
  "setting": "Shanghai Pudong, arrivals hall, 11:47 pm.",   // one English line
  "stage": "✈️",                   // one emoji for the backdrop
  "bg": ["#12305c", "#3f7fd6"],    // two colours for the card gradient, dark enough for white text
  "cast": {                         // everyone who speaks; "you" is never in the cast
    "uncle": { "name": "大叔", "en": "a man with a thermos", "emoji": "🧔", "voice": "m-mid", "phone": false },
    "lin": { "is": "xiaolin", "name": "小林", "en": "your friend", "emoji": "👩", "voice": "f-young" }   // someone from the world
  },
  "steps": [ /* see below */ ]
}
```

`voice` is a role, mapped to a real voice by the build: `m-young`, `m-mid`, `m-old`, `f-young`, `f-mid`, `f-old`, `kid`.
`phone: true` marks someone heard through a phone.

### Levels

A story has two dials. **Say** is the player's lines: the scenario's `level`, and each beat can play at other levels
(`levels`, below). **Listen** is everyone else's lines, fixed by the recordings: `listen`, or what the build measures.
Roughly HSK 2.0 and CEFR:

| L | Your line (the model answer) | Need groups | Everyone else | Clock |
|---|---|---|---|---|
| 0 | 1 to 4 characters, one chunk (多少钱？) | 1 | lines of 8 characters or fewer, 10 lines at most, slow (`"speed": 0.85` on the cast) | none: the model line plays first |
| 1 | 3 to 6, a set phrase (不要香菜) | 1 | 12 or fewer | 18 s |
| 2 | 5 to 10, one pattern (能…吗) | 1 or 2 | 15 or fewer | 15 s |
| 3 | 6 to 12: deflect, soften or refuse (到时候再说吧) | 2 | 20 or fewer, several speakers | 12 s |
| 4 | 8 to 14: persuade, a 俗语 | 2 or 3 | monologues, a little fast (`speed` 1.15) | 10 s |
| 5 | 12 to 20: register (a toast, a formal refusal, comforting someone) | 3 | native pace (1.25), crosstalk | 8 s |

`node tools/validate.mjs` warns when a level's model answers run longer or need more groups. The build writes its own
estimate of every line's say level (`lv`) and every story's listen level into `review/levels.md`, next to the declared
ones: a line more than a level off is worth a second look (a short line in an L3 story is fine if what it does, deflect
or refuse, is the L3 part).

### Topics, audience, series

- `topics`, from this list only (the For You feed balances them, and the first is the story's main one): `family`
  (relatives, parents, grandparents), `dating` (dates, matchmakers, partners), `food` (ordering, cooking, meals),
  `travel` (airports, taxis, hotels, the metro, directions), `home` (flats, landlords, neighbours, repairs), `work`
  (bosses, colleagues, interviews), `shopping` (buying, paying, deliveries, banks, scams by phone), `animals` (geese,
  monkeys, cats: chaos), `health` (doctors, hospitals, feeling unwell), `celebrations` (New Year, weddings, birthdays,
  red packets).
- `audience`: `heritage` for a story written listen-first for people who grew up hearing Chinese (fast relatives,
  short replies that carry the culture: 嗯嗯, 没有啦, 我尽量), `new` for one written for learners starting out.
- `series`: an episode of a thread (a series), `content/series/<id>.json`:
  ```jsonc
  { "id": "back-home", "title": "回老家", "title_en": "Back Home", "eps": 8,
    "audience": "heritage",          // heritage | new | all: who the thread is for (its episodes say the same, unless all)
    "levels": [2, 5],                // the levels its episodes are in
    "home": "laojia",                // one of world.json's places
    "cast": ["biaoge", "nainai", "dagu", "eryi"] }   // world.json ids: who every episode shares
  ```
  An episode's cast key that's in its thread's cast is that character: it copies their `name`, `voice` and `emoji`
  from `content/world.json` (it can change `en` and `phone`), and has their one voice. `ep` counts from 1 without gaps;
  `next` is the cliffhanger the end card teases ("二姨 has already sent your photo to someone's mother."). Every episode
  has at least one real fork: an `alts` branch with its own ending, since an ad will offer "replay the other choice".
- `status`: `draft` until the owner has played it through its gate (`review/gate/<batch>.md`); `live` ships. A draft
  is left out of `data/` and `audio/` by the build; `build.py --out=review/gate/<batch>` builds drafts for review.

## Steps

```jsonc
{ "who": "uncle", "zh": "你怎么了？手机坏了？", "en": "What's wrong? Is your phone broken?", "fx": "squint" }
{ "narr": "English caption that moves the story on.", "zh": "Optional Chinese version, read by the narrator." }
{ "sfx": "ring" }
{ "say": { /* the player's line, see below */ } }
{ "end": "win", "en": "Closing caption.", "zh": "Optional Chinese closing line." }   // or "lose"
```

- `fx` (optional, on a line): `shake`, `squint`, `leave`, `enter`, `give`, `jump`, `laugh`, `angry`, `cry`, `run`, `faint`.
- `sfx`: `ring`, `roar`, `ding`, `buzz`, `whoosh`, `heartbeat`, `door`, `crash`, `honk`, `pop`, `splash`, `goose`,
  `drum`, `cheer`, `alarm`, `knock`, `type`, `message`.

## The `say` beat

```jsonc
{ "say": {
  "id": "borrow",                                   // unique within the scenario
  "en": "Ask if you can borrow his phone to make a call.",   // the mission, in English, as the player would think it
  "answers": ["能借你的手机打个电话吗？", "可以借一下你的手机吗？", "我能用一下你的手机吗？"],
  "need": [["借", "用"], ["手机", "电话"]],
  "time": 15,
  "tip": "借 jiè = borrow. 打个电话 = make a (quick) call.",
  "mistakes": [ { "heard": ["借给你"], "note": "借给你 means 'lend to you'. You want 借你的手机." } ],
  "ok":   [ /* steps that happen when the player gets it */ ],
  "fail": [ /* steps when time runs out or it's wrong; then the beat repeats with help */ ],
  "alts": [ { "en": "Offer your passport as a deposit", "answers": ["我把护照押给你。"], "need": [["护照"]], "then": [ /* steps */ ] } ]
} }
```

- `answers[0]` is the model answer: the most natural thing a native would say right then. It is voiced and taught.
  Two to four more are other good ways to say it.
- `need` is how the answer is judged, **by sound** (so homophones and tone slips still count, and are pointed out).
  Every group must be heard; any one item in a group will do. Pick only the words that carry the meaning, never
  particles. Every answer must contain an item from every group: the validator checks. A one-character need word
  must be heard with its own tone; a word said after 不, 没 or 别 only counts when the answers say it that way too, so
  where the meaning is a no (没信号), put the no in an answer, and check with `node tools/judge-check.mjs <id>`.
- `time` in seconds. Defaults by level, 0 to 5: none, 18, 15, 12, 10, 8.
- `tip`: one line on the chunk, in English (pinyin allowed here).
- `mistakes` (optional): things a learner might say instead, and a short note on why it's off.
- `alts` (optional): other things the player might say, with their own outcome: a branch. Shown to the player as
  choices ("or: offer your passport"), so the player steers the story by what they say.
- `cue` (optional, recommended): 2 to 5 English words shown big at the freeze instead of the mission ("Not what you
  ordered!"); the full `en` mission appears with the first Hint. A cue names the goal without translating the line.
- `gloss`: a natural English translation of `answers[0]` (the phrase deck and review cards show it).
- `key` (optional): `{ "word": "meaning here" }` for the hint key, where a dictionary's first sense is wrong in this
  line (`{ "点了": "tapped Like" }`).
- `not` (optional): `[{ "heard": ["有信号"], "note": "That says it HAS signal." }]`: things that sound close but mean the
  opposite or something else; checked first, failing with the note. Chinese words only.
- `miss` (scenes): steps for a second miss, after which the story moves on without the player's line.
- After `ok` or `then`, the scenario carries on with the next step.

### `levels`: the same moment at another level

A beat can be played at other levels than its scenario's. Only the player's side changes: everyone else's lines,
`ok` / `fail` / `miss`, the branches' `then` and all their audio stay, so a variant costs one model-voice clip.

```jsonc
"say": { "id": "borrow", "answers": ["大叔，能借您的手机打个电话吗？", "…"], "need": [["借", "用", "打个电话", "打电话"], ["手机", "电话"]],
  "levels": {
    "0": { "answers": ["借一下手机？", "手机借我用一下？", "能打个电话吗？"], "need": [["借", "用", "打电话", "打个电话"]],
           "gloss": "Could I borrow your phone?", "status": "draft" },
    "3": { "answers": ["大叔，能借您手机打个电话吗？我卡没信号了。", "…"], "need": [["借", "用", "打个电话", "打电话"], ["手机", "电话"], ["信号", "网"]],
           "gloss": "…", "tip": "…", "status": "draft" } } }
```

- Keys are levels, 0 to 5, other than the scenario's own. An override may change `answers`, `need`, `not`,
  `mistakes`, `gloss`, `tip`, `cue`, `en`, `key`, `time` (0 for no clock), `hint`, `free`, `mode`, `reply` and
  `decoys`; whatever it leaves out is the beat's. A new model answer needs its own `gloss`.
- `alts` in an override says which of the beat's branches show at that level: `[]` none, `[{ "of": 0 }]` only the
  first, and `[{ "of": 0, "answers": ["护照给你！"], "need": [["护照"]], "gloss": "…" }]` the first with an easier line.
  Left out, all of them show as they are. No `then`: where a branch goes doesn't change.
- `status`: `draft` until the owner approves it; a draft override is left out of the shipping build, even in a live
  scenario. Leave it out (or `live`) once approved.
- The app plays a level by merging each beat with its override (`content.tailor()`). Review ids are `scn/beat@0`; a
  beat's own id (`scn/beat`) never changes, so progress survives.
- What the checks hold every level to: each override passes its own `need` (spoken, typed, as pinyin); every line a
  harder level accepts passes every easier level too, as the main line (someone who says more is never failed); an
  easier model answer that passes an override above the story's own level is a warning (that `need` asks for nothing
  more). A chase's
  `again` encounter has overrides at the same levels as the encounter it drills (it's reviewed under that one's id),
  even if one of the two keeps its own line there.
- Check that the next line someone says still follows each variant: the variant is the same moment, said more simply
  or more fully, never a different move.

## The world

快说's stories are one world (docs/v2/world.md): one cast in two homes, 上海 and 老家, with threads running at once,
choices made by what the player says, and characters who remember them and message them between visits.

### `content/world.json`, the bible

- `places`: `shanghai`, `laojia`, `abroad` (where the player grew up: never named in a story for everyone) and `trips`.
- `cast`: everyone who recurs, by id (`wangshu`, `nainai`): `name`, `aka` (other names stories use for them: 房东王阿姨,
  妈), `emoji`, `voice` (the role) and `tts` (the voice they have in every story and message), `home`, `en` (who they
  are to a heritage player), `en_new` (to a newcomer, who meets the 老家 family through 小李; left out for someone a
  newcomer never meets), and `feel`: the contacts page's line for each step of how they feel about you, `"-2"` to `"4"`
  ("Saving you dumplings in the freezer."). Low is never cruel: a cool 大姑 is a curious 大姑.
- `who`: who's who, and the name clashes settled (four different 王s; 王总 the manager, 张总 the founder). Read it
  before writing someone in. Strangers (waiters, guards, drivers) stay strangers and aren't in it.
- A story's cast member is someone from the world when their key is in their thread's cast, or they say so:
  `"is": "wangayi"`. Their `name` (or one in `aka`), `voice` and `emoji` are the bible's, and the build gives them its
  `tts`. Two characters who share a voice (the pools are small: `who` lists them) can't be in one story.

### What a choice does: `sets` and `rel`

```jsonc
"say": { "id": "salary", "answers": ["还行吧，够花。"], …,
  "rel": { "dagu": -1 },                                  // the main line said: how it makes them feel about you
  "alts": [ { "en": "Tell her the truth", "answers": ["一个月两万五。"], "need": [["两万五"]],
              "sets": { "back-home.salary": "told" },      // flags the world keeps
              "rel": { "dagu": 1 }, "then": [ … ] } ] }
```

- `sets` is `{ "<flag>": value }` on a beat (its line said) or a branch: a flag is `<story or thread>.<name>`
  (`back-home.salary`), its value `true`, a word or a number. Every flag set is read somewhere later (a `when`
  further on, in a message, a later episode or another thread; an earlier episode doesn't count): the validator checks.
- `rel` is `{ "<world id>": ±1 }` (±2 rarely): a feeling, from −2 to 4, starts at 0 and only choices move it. The end
  card says "大姑 will remember that." where a flag or a feeling moved.
- Every option is a fine thing to say: a choice is about who the player is, never right or wrong. Each is a line
  judged like any other, at every level (an override can't change what a choice does, or whether it's there).

### What the world remembers: `when` and `else`

```jsonc
{ "when": { "back-home.salary": "told" }, "who": "dagu", "zh": "两万五的人，请客吧！", "en": "Twenty-five grand a month? You're buying!",
  "else": [ { "who": "dagu", "zh": "够花是多少啊？", "en": "So how much is 'enough'?" } ] }
```

- `when` on any step (a line, a narration, a beat, an end) plays it only where it holds; `else`, a list of steps,
  plays in its place where it doesn't (left out: nothing does). On a branch, `when` offers it only where it holds.
- Conditions: `{ "<flag>": value }` (every key must hold), `{ "rel": { "dagu": ">=1" } }` (`>=`, `<=`, `>`, `<` or
  `=`, -2 to 4), `{ "all": [ … ] }`, `{ "any": [ … ] }`, `{ "not": … }`. A flag never set holds for no value, so
  `{ "not": … }` is how to say "unless".
- Every `when` can hold: what it reads is set somewhere, to that value (by live content, for a live line), and a
  feeling it tests is moved that far by the catalogue's choices. A callback lands best one to three episodes later
  ("上次你说要来我婚礼……").
- Branch and bottleneck: a choice changes the next scene's opening lines, the end card's teaser and a callback; a
  whole other episode only at a thread's turning point, once a season at most.

### Secret endings: `secret` and `perfect`

- `"secret": true` on a branch: it isn't offered among the choices, but it's heard if the player says it; with a
  `when` (a flag from another thread), only where that holds. Give it an ending of its own.
- `"perfect": { "then": [ … ], "sets"?, "rel"? }` on a beat: its line said perfectly first time (3★) goes here in
  place of `ok`, a secret ending of its own.

### Messages between visits: `content/messages/<id>.json`

```jsonc
{ "id": "biaoge-van", "from": "biaoge", "story": "back-home-pickup", "after": "3h",
  "when": { "back-home.supper": "home" },       // optional: sent only where it holds when the story ends
  "level": 2, "status": "draft",
  "cast": { "biaoge": { "name": "表哥", "en": "your cousin", "emoji": "🧑", "voice": "m-young" } },
  "steps": [ { "who": "biaoge", "zh": "到家了吧？奶奶睡了没？", "en": "Home yet? Is Grandma asleep?" },
             { "say": { "id": "home", … } }, { "end": "win", "en": "表哥 sends a thumbs-up and a photo of the van." } ] }
```

- A message is a short chat (one to three of the player's lines) from someone in the world (`from`, a cast key that
  is a world id), sent when `story` (a story's or another message's id) ends: `after` a wait (`30m`, `3h`, `2d`) or at
  a time (`19:00`, `tomorrow 19:00`). Its chat is `{ "with": from }` unless it says otherwise (chat.md's fields).
- Never needy, never guilt: a character misses you warmly (哎呀，好久不见！) and never scolds an absence; nothing in a
  message expires.

### 你来评评理 You Decide: `"kind": "decide"`

- A messy everyday dilemma set up in about 30 seconds, then the player's verdict, said to the person involved: a beat
  with `"verdict": true`, whose line and one or two branches are the two or three verdicts, each a fine thing to say,
  each playing what it leads to, to an ending of its own.
- From situations that go viral again and again (world.md §5), never a post: every story is original, nothing
  identifiable, and the style rules hold (it ends warm; nobody's identity is the joke).

### The first story

- `"first": true` on one story, level 0: a brand-new phone opens on it, and its `gate` line sits over "Tap to start"
  (the hook, said before the first sound).

## Format notes

Each format can add its own fields. They are documented in `content/formats/<format>.md` by whoever builds that
format, so the builds and the other formats can rely on them.

## From draft to live

One batch of about ten stories at a time (docs/v2/README.md §9):

1. A brief in `content/briefs/<batch>.md` (ids, format, say and listen levels, audience, topics, series, premise,
   intents, twist, fork; and for the world, the flags each fork sets and where they're read), with an `ids:` line
   (stories and messages), approved by the owner before anything is drafted.
2. Drafts in `content/src/`, `"status": "draft"` (and each new override `"status": "draft"`).
3. `node tools/factory.mjs <batch> --play`: validate, a build into `review/gate/<batch>/` (drafts included, next to
   the live catalogue, so `data/` and `audio/` don't change), judge-check over every beat and override, both speech
   recognisers on every clip (a model answer both doubt fails the batch), and each story played headless at each level
   the batch adds. It writes `review/gate/<batch>/factory.md`, with `levels.md` and `qa.md` beside it.
4. The factory also writes the owner's page, `review/gate/<batch>.md`: a link that plays each story at each level from
   the batch's build, and its lines next to the story's own. What to listen for goes between its `<!-- notes -->`
   markers, which a rerun keeps.
5. Only when the owner says so: `"status": "live"`, then `tools/build.py` (the live build) and the tests.
