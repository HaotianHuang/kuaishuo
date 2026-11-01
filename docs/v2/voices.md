# Voices: from Kokoro to a cast (plan)

From the content session, 31 Oct 2026, for the owner. A plan, not a change: nothing is paid for, and no voice
changes, until the owner says go (step 0). ElevenLabs facts were checked on 31 Oct 2026 (sources at the end); prices
move, so they're checked again at sign-up.

## 1. Where we are, and what "like voice actors" means

**Today:** Kokoro-82M v1.1-zh, free and local. Its readings follow our pinyin (pypinyin plus `tools/pinyin_fix.json`),
so what the voice says is what the screen shows. Seven role pools of three or four voices each, picked by ear and by
two recognisers. Delivery is flat: a line is read, not acted. The pools are too small for the world: 27 recurring
characters share about 20 voices (`content/world.json`, `who`), and 11 P4b model answers had to be reworded because
Kokoro garbled them.

**What ElevenLabs could bring** (to be tested, not assumed): prosody that sounds like a person; emotion on cue (Eleven
v4's audio tags: `[laughs]`, `[whispers]`, `[sighs]`); many more native voices, and voices designed from a
description, so each character can have one of their own; and scenes performed together (Text to Dialogue), so a
relative's line sounds like an answer to the one before.

**What it risks:**
- **Readings that disagree with the screen.** ElevenLabs reads the characters in context, as a native speaker does,
  which is likely better than our pinyin (pypinyin guesses from a dictionary; pinyin_fix.json exists because it
  guesses wrong). But the app shows our pinyin, so where the two disagree the learner hears one thing and reads another,
  whichever is wrong. §7 finds every disagreement and fixes the side that's wrong.
- **Variation.** v3 and v4 act differently each time (good for life, bad for consistency). A seed is "best effort".
- **Short lines.** 嗯嗯, 喂？ and 好！ can come out odd on their own. Context (§4) helps.
- **Cost and dependence.** It's paid, and a Voice Library voice can be withdrawn by its owner. Designed voices are
  ours.

**Like voice actors** means five things a studio does, and each is a step below:

| A studio | Here |
|---|---|
| casts each character once | a voice of their own for every world character, in every story (§3) |
| directs each line | a direction on a line (`dir`) becomes the performance (§4) |
| records scenes together | multi-speaker scenes generated as one dialogue, cut back into lines (§5) |
| does several takes | three takes a line, the best picked by the checks, the others kept (§6) |
| has a director's ear | your ear at the casting page, the pilot and every gate (§8) |

## 2. The bake-off first: does it really pronounce better?

Before casting anyone, the same test lines through each engine, scored the same way.

- **The test set, 60 lines:** the 11 model answers Kokoro garbled; 20 polyphones in context (还 行 得 了 长 重 觉 都 好
  便宜 为 当 着 种 只 数 发 差 干 调); tone sandhi (一个, 一起, 不是, 不要, 你好); erhua (一点儿, 哪儿, 玩儿); numbers,
  prices, times and dates (五百, 七点半, 二号); 喂？ as a call; very short lines (嗯嗯, 好！, 啊？); one fast relative's
  monologue; one whisper; one laugh; one grandma.
- **The engines:** Kokoro (today), `eleven_v4`, `eleven_v3`, `eleven_multilingual_v2` and `eleven_flash_v2_5` (all
  four list Mandarin), each with two native Mandarin voices (a woman's and a man's, standard Putonghua). Three takes
  each.
- **The measures:**
  1. Both recognisers on every clip, as `qa.md` does now: characters heard wrong.
  2. Readings: every polyphone clip next to the pinyin the app shows, ticked by ear on a listening page
     (`review/voices/bakeoff.html`, served by `tools/serve.mjs`).
  3. Your blind A/B: random pairs with the engine hidden, "which sounds more like a person?".
  4. Consistency: three takes of one line, scored by a speaker-embedding distance (§6).
  5. The slow model answer: ElevenLabs' `speed` 0.8 against the normal take stretched (as Kokoro's are now).
  6. Credits used.
- **The decision:** which model does which job. The model answer (the line learners imitate) is scored on clarity and
  readings first; characters on acting first; scenes on how the dialogue endpoint does. The answer may well be
  "v4 for the characters, something steadier for the model answers".
- **Cost:** about 60 lines × 12 characters × 4 models × 2 voices × 3 takes ≈ 17,000 credits.
- **Run on 31 Oct** (`tools/bakeoff.py`, the lines in `tools/bakeoff-lines.json`):
  - The set: 67 lines (13 Kokoro trouble lines, 21 polyphone lines, 6 sandhi, 3 erhua, 5 numbers, a call, 6 very
    short, 4 acted with a v3/v4 audio tag, 8 model answers that are also voiced slow).
  - The voices: ElevenLabs used Coco Li (a woman's voice already on the account) and James Gao (the Voice Library's most
    used standard Mandarin man's voice; used straight from the library, so no slot). Kokoro used zf_004 and zm_030.
  - It cost 6,464 credits for 1,616 calls (each call's own `character-cost`). Per Han character, v4 and v3 charged
    0.57 credits, Multilingual v2 0.54 and Flash 0.28. So the estimates in §8, which count every character of the
    text as one credit, are about twice too high: the switch is nearer 50,000 than 100,000.
  - The recognisers: SenseVoice hears every clip and Whisper hears SenseVoice's doubts, which counts "doubted by both"
    the same way. Whisper large on all 1,900 clips swapped this 8 GB Mac. Whisper also writes 802 for 八零二, and the
    check reads that back as 八百零二, a false miss.
  - Both recognisers compare toneless pinyin, so a wrong tone passes them: 把令儿 for 八零二 counts as right. Tones and
    readings are for the ear (the page's Readings and A/B tabs).
  - Consistency is measured with CAM++ (FunASR's Chinese speaker model) rather than ECAPA.
  - The listening page is `review/voices/bakeoff.html`, with four tabs: a blind A/B, readings to flag, slow against
    stretched, and the scores. Picks stay in the browser until downloaded.
- **What the recognisers say** (the ear's half, the A/B, readings and slow tabs, is the owner's):

  | | Doubted by both | Tone slips | Model answers doubted | Takes alike | Charged |
  |---|---|---|---|---|---|
  | Kokoro (today) | 19 of 134 (14%) | 7 in 1,056 characters | 0 | (one take) | 0 |
  | **Eleven v4** | **7 of 402 (2%)** | **0 in 3,168** | **0** | **0.84** | 1,882 |
  | Eleven v3 | 29 (7%) | 2 | 0 | 0.60 | 1,882 |
  | Multilingual v2 | 35 (9%) | 211 | 5 | 0.75 | 1,780 |
  | Flash v2.5 | 29 (7%) | 193 | 2 | 0.75 | 920 |

  - A tone slip is a character heard as the same syllable on another tone (微辣 as 胃了, 关 as 管, 菜 as 才).
    Multilingual v2 and Flash put about one character in fifteen on a wrong tone. That rules them out for a
    tone-learning app, and Multilingual v2 is what `build.py --engine=elevenlabs` uses today.
  - **The recognisers miss some.** The owner heard 涨 in 续一年？那……涨三百吧 said as a high, level zhāng by both
    sides of an A/B pair (a woman's voice). It should be zhǎng, said low before 三. A pitch check agrees with the ear: 涨's
    pitch against 三's (SenseVoice's character times, pYIN pitch) was low in 2 of 2 Kokoro takes, 4 of 6 v4,
    4 of 6 v3, 1 of 6 Flash and 0 of 6 Multilingual v2. v4's man's take 2 says a level zhāng, and SenseVoice still
    wrote 涨: the recognisers write the word the context suggests. So the tone-slip counts are a floor, and the
    automatic pick (§6) needs a pitch check of its own.
  - **The pitch check** (`tools/bakeoff.py pitch`, then `page`): every take of the 45 lines with marked characters
    (1,170 clips), timed by SenseVoice, pitch by pYIN. It names only clear contradictions: a third tone said high,
    or no lower than a first tone right after it (涨三); a first tone low (not at a phrase's end); a second falling; a
    fourth rising. Tuned so that characters presumed right trip it rarely; it is a pointer to takes to listen to.

    | Off by pitch | Marked characters | Any character in those lines |
    |---|---|---|
    | Kokoro | 2 of 98 | 3% |
    | **Eleven v4** | **9 of 302** | 5% |
    | Eleven v3 | 7 of 362 | 3% |
    | Multilingual v2 | 35 of 358 | 8% |
    | Flash v2.5 | 28 of 353 | 7% |

    39 of the 66 marked characters fit in every take measured. Multilingual v2 and Flash again do worst: 还 in 把钱还我
    falls (huàn), 涨 is high in both 涨 lines, 觉, 重 and 好 rise where they should fall. v4's nine, to listen to:
    涨 (h9, man take 2), 着 in 睡着了 falling (man 1 and 3), 数 in 你数一数 high (man 1 and 2), 点 in 有点儿 high
    (woman 1, man 1), 便 in 方便 rising (woman 1), 你 in 你好 falling (man 3). v3's are mostly 着 in 睡着了 (three
    takes). Kokoro's two are 喂 said wèi in 喂？ (woman). The marked ones are on the page's Scores tab with a play
    button each, and on the Readings tab under each flag.
  - **Eleven v4** has no tone slips and one wrong syllable in 3,168 characters. Six of its seven doubts are the same
    line, 少放一点儿辣, heard as 一点 with no 儿 by both recognisers in all six takes. Either v4 drops the erhua or
    both recognisers do: listen.
  - v4's seventh doubt is a whisper ([whispers]) where one take said 免得 for 奶奶. An acted take can change words, so
    the automatic pick (§6) has to check every take against the script.
  - v4's takes sound the most like one another (0.84). v3 varies a lot from take to take (0.60): lively, but a
    character would sound like a different person line to line.
  - Kokoro's doubts are where they always were: very short lines (嗯嗯, 啊？, 嗯？, 好呀！) and lines that open with
    an interjection.
  - The room number 一一零八 (the test line): v3 says yāo yāo, as a native would; v4, Kokoro and the app's pinyin
    say yī yī. The stories already write spoken numbers as 幺 (police-parcel's 幺幺零), which every engine reads yāo,
    so voice-only spellings (§7) handle this.
  - The app's own pinyin disagrees with a native on three test lines: 这么长了 (it shows zhǎng, said cháng), 自己种的
    (zhǒng, said zhòng) and 头发 (fà, said fa). None of them is in a story yet. They go in `tools/pinyin_fix.json`
    when one is.
  - Slow model answers: no engine's own slow take or stretched take was doubted on v4 or v3. Which is clearer is for
    the ear.
- **What it points to** (before the ear has had its say): v4 for the model answers and the characters both. It's
  the clearest, has the fewest wrong tones the recognisers can hear (not none: see 涨 above), and is the steadiest
  across takes. v3 is the second choice for acted lines. The
  owner's blind A/B decides whether v4 also sounds the most like a person.
- **Chosen for now** (owner, 31 Oct: "just use eleven v4 for all of them for now"): the whole game, the four P4b
  batches too, voiced with v4 into `review/v4` (play: `?data=review/v4/data`), live `data/` and `audio/` untouched.
  Each Kokoro voice has a native Mandarin stand-in from the Voice Library (`tools/voices.json` → `elevenlabs.stand_in`),
  so casting carries over; the library has no native old or child voices, so those are stand-ins for the stand-ins
  until casting (§3). It cost about 6,600 credits (88,365 left). Library voices used this way join the account's
  voice list but take no slots (still 19 of 30).

## 3. Casting

- **Character sheets.** Each world character gets a `sheet` in `content/world.json`: age, where they're from, timbre,
  energy, speech habits, one line of "sounds like" ("a grandma who laughs before she finishes a sentence"), and their
  sides: five of their real lines across their range (warm, cross, fast, whispering, laughing).
- **Candidates.** For each of the 27: three voices designed from the sheet (Voice Design, `eleven_ttv_v3`, which also
  takes a reference recording), plus any native voices in the Voice Library that fit (standard Putonghua or Beijing;
  never an English voice doing Chinese). Each says the same sides.
- **Designed over library for the world cast.** A designed voice is ours for good; a library voice can be withdrawn by
  the person who shared it. Library voices are fine for strangers.
- **Strangers.** Each role pool (m-young … kid) grows to five or six voices, and no world character's voice is in a
  stranger pool: the waiter never sounds like 奶奶.
- **The model voice and the narrator**, cast on their own: the clearest standard Putonghua in the bake-off, warm and
  unhurried, with no recogniser errors across the whole test set.
- **The casting page** (`review/voices/casting.html`): each character's sheet, their candidates side by side, the
  recognisers' and the consistency scores, and a pick button that writes the choice to a file the build reads.
- **Locked.** A pick becomes `eleven: { voice_id, model, settings: { stability, similarity, style, speed } }` on the
  character in `world.json`, next to the Kokoro `tts` (which stays for drafts and as the fallback).
- **Accents.** Standard Putonghua for the model voice and most of the cast. A little regional colour is allowed where a
  story is set (a Chongqing cabbie, 王大爷's northern 儿), never as the joke (CONTENT.md's style rules).

## 4. Direction: every line performed, not read

- **`dir` on a line**, like a script's parenthetical: `"dir": "teasing"`, `"shouting from the kitchen"`, `"mouth
  full"`, `"close to happy tears"`. A closed list, each mapped to the v4 audio tags the bake-off shows working in
  Chinese; validate holds lines to the list. What lines already say feeds it: `fx: "laugh"` → `[laughs]`, `fx: "cry"`,
  `fx: "angry"`, `pace: "fast"` → speed.
- **A director's pass per batch:** an agent reads each scene and proposes a `dir` for the lines that need one; the
  editor keeps or cuts them; the gate page shows them next to the lines.
- **Context, so a reply sounds like a reply.** Each line goes with the line before it (`previous_text`) and after
  (`next_text`), and the player's model answer is the "before" of the line that answers it. A question rises; 嗯嗯
  sounds like it's agreeing with something.
- **The model answers stay plain.** No tags, steady settings: it's the line people copy, so it should sound like a
  person saying it well, not a performance. Its slow version is the same take stretched, so it's the same reading at
  half the speed (unless the bake-off says `speed` 0.8 is cleaner).

## 5. Scenes recorded together

- **Several people in one scene** (back-home-cute's twelve relatives, new-year-dodge, the group chat's voice notes) are
  generated as one dialogue: Text to Dialogue "with timestamps" takes up to 10 voices and about 2,000 characters a
  request (our scenes are 300 to 900), and says which input each stretch of audio is (`voice_segments`). The build cuts
  it back into one clip per line, so the packs and the app don't change.
- **Each path is a take of its own:** the main path, each branch's `then`, `fail` and `miss`. Where the player speaks,
  the model voice's line goes in for the others to react to, and its audio is dropped (the model answer's clip comes
  from its own take).
- **Overlap and crosstalk** (L5's "native pace, crosstalk") are a test in the pilot: the endpoint doesn't say it
  overlaps voices.
- **One-person formats** (a call, a one-on-one chat) don't need it: line by line with context is enough.

## 6. Takes, and the pick

- **Three takes a line** (seeds 1 to 3), four for a model answer.
- **The automatic pick:**
  1. both recognisers hear it (a model answer with no error at all);
  2. readings: the polyphones the recognisers' transcript implies match the line's pinyin;
  3. tones by pitch: each character's pitch against its neighbours fits its tone (a third tone low before a
     first, a first tone high and level), because the recognisers write the word the context suggests,
     whatever the tone (涨 said zhāng still came back 涨, §2). `contours()` and `misfit()` in tools/bakeoff.py are
     the start of it;
  4. length within its pace (no runaway take, no swallowed word);
  5. the same actor: a speaker-embedding distance to the character's reference clip (ECAPA from speechbrain, local),
     so a take that drifts into another voice is dropped;
  6. loudness and peaks, as `level()` does now.
- **Your ear wins.** The gate page plays the chosen take, with "take 2" and "take 3" beside any line; a swap is
  written to a picks file, not into the content.
- **Paid once.** Every clip is cached by engine, model, voice, settings, seed, context and text, as Kokoro's are.
  `--estimate` runs before every paid build, and a new `--budget=<credits>` stops a build before it spends past it.

## 7. Readings (多音字): the voice reads in context, the screen has to agree

Kokoro is given our pinyin; ElevenLabs is given characters and reads them in context, the way a native speaker would
(the owner's call, 31 Oct: that's the better reader). The screen still shows our pinyin, so the job is agreement, and a
disagreement is as likely to be our pinyin's fault as the voice's:

1. **Find every disagreement.** The recognisers' reading test (§6) and, per batch, `tools/polyphones.py`'s list played
   as clips: every polyphone in context, next to the pinyin the app shows, ticked by ear in a minute or two.
2. **Where our pinyin is wrong, fix the pinyin** (`pinyin_fix.json`), so the screen, the hint key and the typed-pinyin
   judge all follow the voice. The bake-off's 20 polyphone lines show how often that is.
3. **Where the voice is wrong, spell it for the voice:** `pinyin_fix.json` gains `say` entries (a same-sound word the
   voice reads right), applied to the text sent to ElevenLabs and never shown. The same rules can live in an ElevenLabs
   pronunciation dictionary (alias rules work on every model; phoneme rules are for English).
4. **Or reword the line**, as P4b did for 11 lines.

## 8. Rollout

| Step | What | Who decides | Credits (about) |
|---|---|---|---|
| 0 | Your go-ahead and budget; an ElevenLabs account (you make it: I don't create accounts or handle keys). Its API key goes in your shell as `ELEVENLABS_API_KEY`, never in the repo. | you | |
| 1 | The bake-off (§2): run 31 Oct, the recognisers' half done | you, by blind A/B: which model for which job | 6,613 spent |
| 2 | Casting (§3): sheets, designs, auditions, the casting page | you pick the leads (奶奶, 表哥, 大姑, 二姨, 妈妈, 小鹿 and the model voice); the checks and I suggest the rest | 25,000 |
| 3 | The pipeline (no credits: code): v4 with context, dialogue scenes cut into lines, `dir` → tags, takes and the pick, voice-only spellings, the speaker check, `--budget` | | |
| 4 | The pilot: one story per format plus Back Home 1 (airport-esim, farm-goose, first-date, mum-calling, back-home-pickup), Kokoro and ElevenLabs side by side | you: go or no-go | 10,000 |
| 5 | The catalogue: v1's 20 (lines and ids unchanged: only the sound, so progress is kept) and the P4b batches once their text gates pass, a gate page per batch with both voices | you, per batch | 47,000 |
| 6 | From then on: Kokoro while a batch is written (free and fast), ElevenLabs for its gate build, so you gate the real performance | you, at each gate | about 15,000 a batch of 10 |

- **The account (checked 31 Oct, free calls).** Creator, active: 29,316 of 131,000 credits used this period, so
  101,684 left until the reset on 23 Nov; no overage (the limit can't be extended, so a build can't overspend). Every
  model in §2 is there with Mandarin (plus `eleven_v3_conversational` and `eleven_turbo_v2_5` at half cost). Voice slots:
  19 of 30 used by the account's own voices (19 designed, 1 professional), so 11 free. Casting locks 27 world
  characters, the model voice and the narrator, which is 29 slots. Auditions need no slots, because a design's previews
  say the sides. The bake-off and casting (about 42,000) fit before the reset; the pilot and the catalogue come after it.
- **What it costs.** One pass over all 31 stories, drafts included, is 15,585 characters (`build.py --engine=elevenlabs
  --estimate`, today); three takes is about 47,000. The switch is about 100,000 credits in all: one month of Creator
  ($11 the first month, then $22, with 121,000 credits and a commercial licence). After that, Starter ($6, 30,000
  credits) covers about a batch a month. At API rates ($0.08 per 1,000 characters for v4, v3 and Multilingual v2) the
  generation itself is under $10; the plan's cost is mostly the plan.
- **Done when:** the bake-off has picked the models; every world character has a locked voice that's theirs alone;
  the pilot is approved; the catalogue is re-voiced with no model answer doubted by both recognisers, the polyphone
  lists ticked, every character's takes passing the speaker check, and the pocket pack still within its 15.5 MiB.

## 9. What stays the same

- **The app:** one audio pack per story, a clip per line, AAC at 56 kbps mono, so about the same size. Nothing is
  voiced while someone plays and nothing about a player goes anywhere: ElevenLabs only sees our scripts, at build time
  (and keeps logs of what's sent).
- **Progress:** ids and lines never change; only the sound does.
- **The checks:** a model answer both recognisers doubt still fails a batch.
- **Kokoro:** kept, free, for drafts and as the fallback if ElevenLabs is down or a voice is withdrawn.

## 10. Rules

- No real person's voice: no cloning of anyone without their signed consent, no celebrity sound-alikes. Designed
  voices, or library voices under the plan's commercial licence.
- Nobody's accent is the joke.
- The model voice is standard Putonghua.

## 11. For the owner to decide

1. **The bake-off's ear half**: on `review/voices/bakeoff.html`, do twenty to sixty blind A/B picks, flag the
   readings that sound wrong, pick the slow rows you have time for, then download the picks. With the recognisers'
   half (§2), that settles which model does which job. The recognisers point to v4 for both.
2. **One model voice or two:** a woman's and a man's, picked in Settings (an app change for the code session)?
3. **A human for the model voice** (an option): a native voice actor records 30 to 60 minutes, and that becomes a
   Professional Voice Clone (Creator includes one) under their written consent and a licence, so the line people copy
   is a real teacher's voice. About $150 to $400 for the session; the best clarity and consistency, plus a contract.
4. **Who casts:** you for the leads and me (with the checks) for the rest, or you for everyone?
5. **The four P4b gates:** play them now for the text (recommended: lines, levels and stories don't depend on the
   voice) and re-voice them at step 5, or wait for the new voices?
6. **Voice slots.** The world cast needs 29 slots and 11 are free. You could free some of the account's own 19 voices
   (they're yours, so I won't touch them), move to Pro (160 slots), or design voices only for the leads and the people
   met often, with minor ones on native library voices.

## Sources (checked 31 Oct 2026)

- [ElevenLabs models](https://elevenlabs.io/docs/overview/models): v4 and v4 Turbo (current), v3, Multilingual v2 and
  Flash v2.5 all list Mandarin (`zh`); Voice Design's `eleven_ttv_v3`.
- [Text to Dialogue with timestamps](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps):
  up to 10 voices, about 2,000 characters a request, `voice_segments` per input, best-effort `seed`.
- [Text to Speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert): `previous_text`, `next_text`,
  `seed`, `speed`, pronunciation dictionaries, `pcm_24000` on every plan.
- [Voice Design](https://elevenlabs.io/docs/api-reference/text-to-voice/design): a description (and with
  `eleven_ttv_v3`, a reference recording) to previews to a saved voice.
- [Pricing](https://elevenlabs.io/pricing): Starter $6 (30,000 credits), Creator $22 ($11 the first month; 121,000
  credits), Pro $99 (600,000); a commercial licence on every paid plan.
- [Eleven v4 launch prices, 5 Oct 2026](https://www.usagepricing.com/blueprint/activity/elevenlabs-2026-10-05-v4-launch-tts-price-cut):
  $0.08 per 1,000 characters for v4, v3 and Multilingual v2; $0.04 for Flash and v4 Turbo.
- [Pronunciation](https://elevenlabs.io/docs/product/prompting/pronunciation): alias rules on every model, phoneme
  rules for English.
