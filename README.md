# 快说 Kuài Shuō

A TikTok-style feed of short stories you get out of by speaking Mandarin. The scene freezes, a clock runs, and you say
your line out loud (or type it, or tap it). Your answer is judged by sound and tone, in the browser. 119 stories, about
1,480 lines, in pixel art drawn by code. Play it at **https://kuaishuo.freelearninggame.com**, no sign-up.

Built with Claude (Opus) as a pair: the engine, the stories, the voices and the checks. The write-up is at
https://haotianhuang.com/kuaishuo/.

## Run it

Node 20+ and Chrome (speech recognition works on localhost in desktop Chrome).

```
npm install
node tools/serve.mjs          # http://127.0.0.1:8791/: For You, the feed the app opens on; #lab for each format alone
node tools/serve.mjs --lan    # also https on your Wi-Fi address, so a phone can use its microphone
node tools/test.mjs           # every format played headless at phone sizes (needs Chrome); screenshots in review/test/
```

The web version (what's live) is `node tools/pack.mjs --web` into `web/`, served as Cloudflare Pages would with
`node tools/serve.mjs --web`. Its functions (`functions/api/`) keep anonymous daily totals in a D1 database
(`schema.sql`); point `wrangler.toml` at your own.

## How it's made

- `app/shared/` is the engine: the feed, the answer panel and its judge (`match.js`), the learner model (`learner.js`),
  how much help each card gets (`assist.js`), and the For You ranker (`rank.js`). `app/protos/` holds the formats:
  scenes, chases, chats and calls. `ENGINE.md` explains it.
- `content/src/` holds the stories as JSON; `CONTENT.md` is how they're written. `tools/build.py` turns them into
  `data/` and `audio/`: pinyin and glosses (pypinyin, jieba, CC-CEDICT), voices (Kokoro, run locally), and every clip
  heard back by two speech recognisers. It needs a Python environment with those packages.
- `PLAN.md` and `docs/v2/` are the plans and designs the app was built from, decisions and all.

The stories were drafted with AI and checked by machine; the first twenty were also played by a person. If a line is
wrong, open an issue.

## Licence

The code is MIT (`LICENSE`). The glosses (CC-CEDICT, CC BY-SA 4.0), stroke data (Arphic Public License) and the
vendored Hanzi Writer (MIT) keep their own licences; `LICENSE` lists them.
