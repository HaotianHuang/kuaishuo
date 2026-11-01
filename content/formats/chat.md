# The `chat` format (聊)

A WeChat conversation playing out on the phone, one card in the feed. Messages arrive in bursts: text bubbles (the
reading practice), voice notes (heard first, read only if you tap 转文字), stickers, photos, forwarded articles, red
packets, and the grey system lines between them. At the moments that matter the chat waits for you: you reply by
typing with the phone's Chinese keyboard (the writing practice), by holding to talk (按住 说话), or with tiles.

A chat is an ordinary scenario (CONTENT.md): the same cast, steps, `say` beats and shared fields, so the build voices
and glosses it like the others. This page adds one block, `chat`, a few fields on lines and beats, and one meaning
for `narr`. The five chats in `content/src/chat-*.json` use all of them.

## How a chat plays

`app/protos/chat.js` and `chat.css` play it like this, and the content relies on it.

1. **It opens at once.** Reached by a swipe, the card goes straight into the chat. Only before the first tap of a
   visit does it show WeChat's 微信 tab: the conversation on top with a red 1 and its first message as the preview (a
   group shows a grid of faces), a few everyday chats, the TikTok caption and rail. Tap the chat (`data-test-go`).
2. **The chat screen**: the top bar (the person's `name`, or the group's name and size, and 🔊 for reading aloud),
   WeChat's grey wallpaper, the input bar. A plain `narr` is a dark caption card: where you are, why the phone buzzes.
   While it plays the log doesn't scroll (a swipe belongs to the feed): the newest messages sit on the input bar and
   older ones fade out at the top. On the end screen the whole chat scrolls back.
3. **Messages land** one by one, with a soft pop. The first lands at once; after that each waits its `typing`, capped at
   0.5 s for a short line and 0.9 s for a long one (1.2 s when the script asks for 2 s or more: suspense). One-on-one,
   the top bar says 对方正在输入… meanwhile (对方正在讲话… before a voice note); groups show nothing, as in WeChat.
   **Read first, then hear**: after a text's reading pause its clip plays once (clips queue, never overlap; the story
   doesn't wait for them; 🔊 turns it off). Voice notes play as they land, waves moving, red dot going, words behind
   转文字. A message with `recall` is heard as it lands and stays at least 0.4 s a character (4 s below level 4).
4. **Your turn.** At a `say` the input bar becomes `ask()` with `skin: 'chat'`: the mission (or `cue`) and the clock,
   the tools, then WeChat's bottom row: 按住 说话 (hold to talk, or tap), the field and 发送, or the tiles. It opens in
   the beat's `reply` mode; with no microphone a `speak` beat is typed, its "Hold to talk:" dropped from the mission.
   What they send lands as their green bubble: characters as typed (a wrong one struck through, then put right in a
   second bubble, *辣), pinyin as the characters it matched, tiles as built, speech as a voice note with its words
   under it; small stars under it. The player has no other bubbles.
5. **Right**: `ok` (or an alt's `then`) plays and the chat goes on; a red packet gated on the beat opens first.
   **Wrong, or the clock runs out**: `fail` plays, the other side in character (人呢？, 睡了？), then the beat comes
   back with help. **Silent twice running** on one beat and they give up on you: the chat's `giveup` steps play (算了,
   a blocked message, a mum removing you from the group) and it ends lost. Nothing sends itself.
6. **It ends** with the `end` caption at the bottom of the log (the card's colours, or dark red for a loss), then the
   sheet: 聊完了 or 聊崩了, the stars, and at most three lines (the one you never sent, then the fewest stars), each with
   🔊, what it means (`gloss`), what you typed where it differed (odd characters marked) and its stars; "+ 2 more" for
   the rest. The sheet never scrolls, so a swipe on it moves the feed; ↻ Again and Next ↓ always show. Behind it the
   chat scrolls back, starting at its last line, so a swipe up still leaves.

## Fields

### `chat`, at the top level

```jsonc
"chat": { "with": "dalu" }                     // one-on-one: the cast key of the person you're talking to
"chat": {                                     // or a group
  "group": { "zh": "相亲相爱一家人" },          //   its name, shown as 相亲相爱一家人(23); glossed, never voiced
  "members": 23,                              //   the number in brackets
  "me": { "zh": "小宝" }                       //   optional: what the others call the player, for `mention`
}
"giveup": [                                   // in either: what happens when you go silent twice on one beat
  { "who": "lu", "zh": "算了，不聊了。", "en": "Forget it. I'm done." },
  { "narr": "Your message bounced.", "zh": "消息已发出，但被对方拒收了。", "kind": "system", "bounce": true },
  { "end": "lose", "en": "Xiao Lu blocked you.", "zh": "你被拉黑了。" }
]
```

- One of `with` or `group`. In a group every bubble shows the sender's `emoji` and `name`; one-on-one, only the emoji.
- `me` is a name or a family nickname, never a gendered form of address.
- `giveup` (inside `chat`): ordinary steps, in character, ending with `end: "lose"`. They play when the clock runs out
  twice in a row on one beat without the player trying anything. `"bounce": true` on a system line first sends the
  line the player never said, too late, as their bubble with WeChat's red !, then the grey line under it. Without
  `giveup` the chat ends with a plain "They gave up waiting for you."

### On a message (a `who` step, anywhere)

Every `who` step is a message from that cast member, and keeps `zh` and `en` whatever its kind. Keep emoji out of
`zh` (the voice would trip on them): they go in `art` or `tail`.

| `kind` | What shows | `zh` is | Plays |
|---|---|---|---|
| `text` (default) | a text bubble | the message | on tap |
| `voice` | a voice note: ▶ and `secs″`, text hidden until 转文字 | what they say | as it lands |
| `sticker` | a big sticker, no bubble: the `art`, with `zh` across it | the words on it (表情包 nearly always have some) | on tap |
| `photo` | the `art` in a photo frame; tapped, it opens big with `zh` under it | a caption of what's in it, or the words written in it (a contract clause) | on tap |
| `link` | a forwarded-article card: `zh` as the headline, `art` as the thumbnail | the headline | on tap |
| `packet` | a red packet with `zh` on its face (see below) | the greeting written on it | on tap |

| Field | |
|---|---|
| `typing` | Seconds before the message lands. Default from its length (about 0.5 + 0.12 a character, at most 4). Bursts are 0.5 to 1; a long pause before a short message is a joke or a threat. |
| `clock` | `"23:04"`: a time divider above the message, as WeChat shows after a gap. Display only, so digits are fine. |
| `tail` | Emoji typed after the words (`"🙏"`, `"🙂"`): shown at the end of the bubble, never voiced. |
| `art` | The emoji that draw a sticker, photo or link thumbnail: `"🐈‍⬛🧊"`. |
| `secs` | Voice notes: the length on the bubble, 1 to 60. A label only, so grandma's sixty-second note can be five words. |
| `mention` | `true`: the bubble starts with @ and `chat.me`, highlighted, the way an @ in a group looks. |
| `recall` | Seconds the message stays up before its sender takes it back: the bubble goes, and the next step must be the system line `<name>撤回了一条消息`. Give the player two or three seconds: reading it in time is the game. |
| `packet` | On a `packet`: `{ "amount": 0.88, "gate": "bless" }`, below. |
| `fx` | As in CONTENT.md, done by the bubble: `shake` jolts it and buzzes the phone. |

### Red packets

```jsonc
{ "who": "dajiu", "kind": "packet", "zh": "说句好听的，才能领！", "en": "Say something nice, then you can open it!",
  "packet": { "amount": 0.88, "gate": "bless" } }
```

- `amount`: yuan, shown when it opens (¥0.88).
- `gate`: the `id` of a later `say` beat. Until that beat is passed the packet stays sealed: tapping it shows its face
  and a greyed 開. When the beat is passed, the packet opens (the 開 spins, the amount shows), then that beat's `ok`
  runs; start the `ok` with the system line `你领取了<name>的红包`. An alt that should open it too needs the same line
  in its `then`. Without a `gate`, a tap opens it.

### System lines (`narr` with `"kind": "system"`)

```jsonc
{ "narr": "Xiao Lu unsent a message.", "zh": "小鹿撤回了一条消息", "kind": "system" }
```

- A grey line in the middle of the chat, in WeChat's own words: 你已添加了小鹿，现在可以开始聊天了。,
  小鹿撤回了一条消息, 你领取了大舅的红包, 外婆拍了拍你. `zh` is the line as shown, `narr` its English, on tap. The
  build gives it a narrator clip like any `narr`; the chat plays it only on tap.
- `"fx": "shake"` on a 拍了拍 line shakes the chat, as a pat does.
- A `narr` without `kind` is the caption over the screen. Use it once, to set the chat up.

### On a `say` beat

| Field | |
|---|---|
| `reply` | The mode the input bar opens in: `"type"` (the default: the Chinese keyboard, or plain pinyin), `"speak"` (hold to talk, sent as a voice note) or `"tiles"`. These are `ask.js` modes; where there is no microphone (the artifact), `speak` falls back like `defaultMode()`, and `self` stays available. |
| `cue` | Optional, 2 to 4 words shown in place of the mission (`ask()`'s `opts.cue`; Hint reveals the mission), so the player reads the chat to know what to say. |
| `decoys` | Tiles that tempt: homophones and near-misses of the answer's words (再 beside 在, 叫 and 教 beside 交, 得 beside 的, 便 beside 变). Never part of any answer. `match.tiles` keeps three decoys picked at random from what it's given, so when a beat has its own, the chat should pass only those as `opts.decoys` (the scenario-wide ones otherwise). |

- Pick `speak` when the moment calls for a voice note: hands full, running, a grandma who can't read the screen.
  Pick `tiles` for a long sentence whose word order is the lesson. Everything else is typed: that's the point of chat.
- Set `time` on every beat: typing takes longer than talking. 20 to 35 seconds to type, about 15 to speak.
- `answers[0]` is easy to type on a pinyin keyboard (common words, the keyboard's first suggestion) and still a chunk
  worth having: 先把水关了, 收到，七点半前发您, 合同上写的是…….
- Typed answers go through the same judge (`match.judge(text, beat, { typed: true })`): homophones the keyboard
  picked pass and are listed (`chars`), digits count as numbers (500 is 五百). A slip that only shows in writing gets
  `"typed": true` on its mistake (scene.md), like 再的 for 在的.

## Writing a chat

- Bursts: three short messages beat one long one. 哈哈哈, 嗯嗯, 好呀, 就这？, …… and a sticker are the texture.
- Voice notes come from whoever is too busy, too frantic or too old to type. Hear them first; tap only to check.
- Each chat ends on a WeChat moment people recognise: a recall, a sixty-second voice note, 拍了拍, a red packet of
  八毛八, a 呵呵.
- `fail` lines are the other side reacting to silence or nonsense, in character, never a narrator.
- After an alt's `then`, the chat rejoins at the next step, so that step must follow from every branch.
- Mind the judge (`app/shared/match.js`). A `need` word of three or more sounds passes with one sound wrong, so
  七点半 would also take 八点半: split it, `[["七点"], ["点半"]]`, and use 期六 for 星期六 so 星期五 fails. A need
  word inside its own negative passes too (不可以 contains 可以, 不是真的 is one sound from 就是真的): pick words that
  can't be flipped (当然, 没问题, 谣言). The same rule cuts the other way for mistakes: 把水开了 is one sound from
  把水关了, so its note fired on right answers until it became 水开.

## For the build and the checks

- Every Chinese line a chat adds is an ordinary step (`who` or `narr` with `zh`), so `tools/build.py` voices and
  glosses it as it is, `ok`, `fail` and `then` included. `chat.group` and `chat.me` are `{ "zh" }` with no `who`:
  glossed, never voiced. `art`, `tail`, `clock` and `amount` are display only.
- `tools/validate.mjs` doesn't look at chat fields yet. A chat-aware check would want: `chat.with` in the cast or a
  `chat.group` with `zh`; `kind` one of the six; `secs` 1 to 60 on voice notes only; `art` on stickers, photos and
  links; every `packet.gate` naming a `say` id that comes after it; a system line straight after every `recall`;
  `reply` one of `type`, `speak`, `tiles`; no decoy inside its beat's answers.

## Engine requests

- **`tools/test.mjs`**: with no `--input`, the harness only taps `.ks-mic`, so a panel that opens in `type` or `tiles`
  mode would sit until its clocks ran out. Until the harness answers those itself (coming), chat.js leaves out
  `opts.mode` when `KS_SIM` is set: default runs speak every beat; `--input=type`, `--input=tiles` and `--input=self`
  cover the rest. Once it lands, that one condition in `turn()` can go.
- **`ask.js`**: for typed answers, a character in the wrong tone (拉 for 辣) is reported in `tones` with `heard`, and
  one with the same sound in `chars`; chat.js treats both as typos. One list of typed slips would be simpler.
- **`ask.js`**: hold to talk. chat.js wraps the mic (a press calls its click, a release after a real hold calls it
  again, the click that follows is swallowed). A `hold: true` option on `ask()` would do it at the source, and the
  mic's label could come from `opts` (按住 说话 / 松开 发送) rather than CSS `content`.
- **`tools/build.py`**: 辣 is glossed "old variant of 辣[la4]": the gloss takes a variant entry from CC-CEDICT before
  the real one (it shows in the hint, `__ old variant of 辣`). Variant-only senses should lose to a definition.

## The chats

| File | Level | You learn to say |
|---|---|---|
| `chat-flat-flood` 家里发大水了 | 2 | 别慌，水是从哪儿来的 · 先把水关了 · 在厨房水池下面 · 别管它，它自己会下来的 · 我马上打车回去 |
| `chat-first-date` 我是小鹿 | 2 | 我超爱吃辣的 · 一般在家睡懒觉 · 周末一起去吃火锅吧 · 周六晚上七点，门口见 · 当然可以 |
| `chat-family-group` 相亲相爱一家人 | 3 | 这是谣言，别信哈 · 点了点了，拍得真好看 · 谢谢大舅，祝您身体健康 · 外婆，我好想你 |
| `chat-late-boss` 老板：在吗？ | 3 | 在的，您说 · 收到，七点半前发您 · 什么都没看到 · 您也早点休息 · 好的，收到 |
| `chat-rent-rise` 房租涨五百 | 4 | 也太多了吧 · 我一直按时交房租的 · 能不能少涨一点 · 合同上写的是…… · 明年再商量 |
