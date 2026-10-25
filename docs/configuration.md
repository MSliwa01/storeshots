# screenshots.json

`storeshots init` writes a working file. Everything below is optional unless marked.

```json
{
  "app": { "name": "Example", "bundleId": "com.example.app", "icon": "../icon.png", "accent": "#2f9e6e", "ascAppId": "1234567890" },
  "locales": ["en", "de"],
  "devices": { "iphone-6.9": { "frame": "generic/black" } },
  "capture": { "bundleId": "com.example.app", "args": { "DemoMode": "YES" }, "appearance": "light", "wait": 3, "host": { "ssh": "my-mac" } },
  "shots": { "today": { "args": { "DemoScreen": "today" } }, "detail": { "args": { "DemoScreen": "detail" }, "appearance": "dark" } },
  "slides": [
    { "id": "today", "shot": "today", "pop": { "box": [60, 417, 1200, 258], "radius": 63, "behind": "#f3f6f2", "cut": "surface", "fill": "#ffffff" } },
    { "id": "detail", "shot": "detail", "layout": "tilt" },
    { "id": "closer", "shot": null }
  ],
  "look": { "style": "soft", "colours": "one", "accent": false }
}
```

## app
| Key | |
|---|---|
| `name`, `subtitle` | shown in the search-results mock and on the closer slide |
| `icon` | path to the app icon, relative to `store/` (the closer slide, the mock) |
| `accent` | the brand colour; styles derive their palette from it |
| `bundleId`, `ascAppId` | for `upload` and `proof` |

## locales, devices
`locales`: the copy files (`copy/<locale>.json`) and capture languages. `devices`: canvases to produce.

| Canvas | Size | Goes to |
|---|---|---|
| `iphone-6.9` | 1320×2868 | screenshot set `APP_IPHONE_67` |
| `ipad-13` | 2064×2752 | screenshot set `APP_IPAD_PRO_3GEN_129` |
| `iphone-duo-outer`, `iphone-duo-inner` | 1398×2034, 2853×2007 | one shared set `APP_IPHONE_DUO`, outer first, 10 at most between them |
| `preview-iphone-6.9`, `preview-ipad-13` | 886×1920, 1200×1600 | app preview sets `IPHONE_67`, `IPAD_PRO_3GEN_129`: video only, 15–30 s, 23–30 fps, with an audio track, 3 at most |
| `header` | 3840×1646 | product page header: PNG, or video 10–30 s at 30 or 60 fps |
| `search` | 2880×1920 (3:2, 1920–3840 wide) | search results asset: PNG or JPEG, or video 15–30 s at 30 or 60 fps |
| `event-card`, `event-details` | 1920×1080, 1080×1920 | In-App Event media (see [events](#events)) |

`header` and `search` need iOS 27 on the viewer's device and take one asset per locale. Their copy is checked harder: prices, web addresses, ©, ® and ™, rankings, awards and App Store badges are errors. Canvases other than screenshots show the captures of a screenshot canvas (`shotsFrom`, default: the first one in `devices`). Per device:
- `frame`: `generic/black` or `generic/silver` (a drawn iPhone), `plain[/<colour>[/<width>]]` (a flat phone-like border: `white`, `black` or a hex without `#`, width in ‰ of the screen, default 34), `none` (the bare rounded screen), or an Apple bezel such as `iphone-18-pro-max/black` (`storeshots frames`). A style may bring its own frame; `"look": {"frame": …}` overrides it, and `"device"` keeps this one.
- `design`: a design file other than `design/<style>.html`.
- `shotsFrom`: the screenshot canvas whose captures a header, event or app preview shows.
- `video`: render settings for this canvas (see [video](#video)).

## capture

The `iphone-duo-outer` canvas is 1398×2034, portrait. `iphone-duo-inner` is 2853×2007, landscape. These match [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications). `capture` can't fold or unfold the Simulator, so capture each display by hand and use `storeshots import --device <id>`. Both displays upload into one `APP_IPHONE_DUO` set, outer first. Each display needs a design made for its aspect ratio. Apple's Duo bezels install with `storeshots frames iphone-duo-inner` and `storeshots frames iphone-duo-outer` (colours `night-sky`, `star-white`).

Screen recordings (`xcrun simctl io booted recordVideo rec.mov`) import the same way: `storeshots import rec.mov --shots rain`. The recording is kept for `storeshots video`, and a still from its first second stands in for screenshots.

| Key | |
|---|---|
| `bundleId` | **required for capture**: the app on the simulator |
| `args` | launch arguments for every shot (your demo mode) |
| `appearance` | `light` or `dark` |
| `wait`, `maxWait` | seconds before the first frame, and the limit while waiting for the screen to settle |
| `warmup` | seconds for the first launch (default 60) |
| `host` | where the simulator runs: `{"ssh": "my-mac"}`, `{"command": "…"}` (a command that runs a shell on the Mac), or `STORESHOTS_HOST` |
| `locales` | `{"en": ["en-GB", "en_GB"]}` to override the simulator language/region per locale |

## shots
One entry per screen to capture: `args`, `appearance`, `wait`, `maxWait` override `capture`; `"capture": false` skips the shot (for screens made another way, e.g. widget renders or `storeshots import`).

## slides
The set, in order. Without `slides` there is one slide per shot.
| Key | |
|---|---|
| `id` | the copy key: `copy/<locale>.json` → `{"<id>": {"title": "Line one,\n*accent*", "subtitle": "…"}}` |
| `shot` | the screen on this slide; `null` makes a closer (app icon and a statement) |
| `layout` | overrides the style's rhythm: `hero`, `lean` (tilted), `hang` (from the top, caption below), `offset`, `tilt` and `lay` (3D; at most two per set), `zoom` (the phone 1.3–1.6× its size, moved sideways so its `focus` shows while one corner and two frame edges stay in view; at most two per set), `spread` (one phone over this slide and the next, tilted 12°; the next slide keeps its caption and gets no phone of its own; for slides 1–2, which search shows side by side), `free` (no phone; the slide shows `art` with `"place": "float"`, or pieces with `at`) |
| `focus` | for `zoom`: the part of the screen to show, `[x, y, w, h]` in capture pixels (default: the `pop` box). Narrow boxes zoom further; one as wide as the screen hardly zooms, and `check` warns below 1.2× |
| `pop` | written by `storeshots elements --pick`: the lifted element (`box` in capture pixels, `radius`, `behind`, `cut`: `surface` or `frame`, with `fill` or `pad`) |
| `pieces` | lifts, in any style: one thing of a capture (a row, a number, a chip, a short card) enlarged as a card of its own, `[{ "box": [x, y, w, h], "size"?, "pad", "radius", "fill", "shot"?, "side"?, "tilt"?, "rotate"?, "rim"?, "at"?: [x, y], "shift"? }]`. `size` is the width in % of the slide; without it the piece is as big as its text needs (with tesseract installed): its biggest line 3.75 % of the slide's width tall in capitals and its smallest 2.2 %, within 40–92 %. Without `at`, a piece covers its source on the phone; a narrow one (up to 56 %) sticks out past the phone's edge on its source's side (or `side`), a wide one is centred on its source. Pieces stand upright with a soft shadow; `tilt` leans a narrow one outwards, `rim` adds a white rim (for a dark card on a dark phone). They stay off the caption and the slide's edges, and shrink rather than overlap. At most two per slide. `check` reports overlaps, crops that cut through content, crops a few pixels wider than their card, text below 3 % (biggest line) or 2 % (any line), more than 15 words, and (with tesseract) a piece that covers part of a word on the phone's screen. A slide's pieces take the place of its `pop` |
| `art` | the app's own art from `assets.json`: `{ "asset", "place": "beside" \| "peek" \| "backdrop" \| "closer" \| "float", "size"?, "side"?, "flip"? }` or a list. `float` puts a card or an object centred on `"at": [x, y]` (% of the slide), optionally `rotate`d: the app's own UI from outside the app (a widget, a Live Activity render), a photo (`"radius"` in % of the slide's width, `"aspect": "4/5"` to crop it), or a prop. `"behind": true` puts it behind the phones and pieces, `"front": true` in front of the pieces. See the skill's `references/assets.md` |
| `caption` | `"bottom"` puts the headline at the foot of the slide, `"middle"` in its middle (for a slide without a phone) |
| `headline` | `"huge"`: a statement, capitals about 13 % of the slide's width, up to three lines, on a slide with little else (the app's own scenery, one prop). `check` leaves it out of the one-size rule |
| `bg` | this slide's background colour |

## look
| Key | |
|---|---|
| `style` | `clean`, `soft`, `atmosphere`, `premium`, `poster`, `editorial`, `playful`, `neon`, `bold`, `world`, `collage` |
| `palette` | the app's own colours (categories, tabs), used one per slide in turn |
| `colours` | `one` (one field for the set) or `each` (a colour per slide) |
| `accent` | `true` (the middle slide), a slide id, or `false` |
| `background` | `flat`, `gradient`, `glow` (the slide's own screen blurred into light), or one picture across the whole strip: `{"image": "design/bg.jpg", "credit": "…"}` or `{"asset": "<id in assets.json>"}`, with an optional `"position"` (CSS `background-position`, e.g. `"center 12%"`). A picture per slide: `slides[].art` with `"place": "backdrop"` |
| `blur` | the picture behind the phones out of focus, so the phone and the caption stand out from it: `soft` (a light blur), `strong` (close to atmosphere), or `caption` (frosted only behind the caption) |
| `proof` | a laurel: `{"rating": 4.8, "count": 2300, "slides": ["today"]}` from `storeshots proof`, or your own line, `{"text": "Calm & cosy", "sub": "good news, every day"}`. `"at": "top"` puts it above the headline. Apple's own awards are refused; `check` warns on rankings and awards ("best", "#1", "award") and reminds you that Google Play asks for no accolades |
| `headline` | `"big"`: headlines with capitals about 9.5 % of the slide's width, the size most strong sets use. Keep each line to about ten characters |
| `subtitles` | `false` drops the line under each headline (the closer keeps its own) |
| `emphasis` | how the `*marked*` words stand out: `"box"` (the style's own), `"colour"`, `"serif"` (italic serif words in a sans headline), `"size"` (a bigger line), or `{"style": "colour", "colour": "#237740"}`. Without a colour, `colour` darkens the slide's background colour |

Each style sets its own defaults for `colours`, `background` and the layout rhythm. Keys set in `look` override them.

## video
`storeshots video` renders each slide of a canvas's design into `output/video/<device>/<locale>/NN-<slide>.mp4` (H.264, yuv420p). Each frame is the design at time t: imported screen recordings step to their frame and loop, CSS animations and transitions are paused at t, the root's `--t` holds t in seconds, and `window.onFrame(t, SHOTS)` runs if the design defines it. Pop-outs and cut-outs keep the recording's first frame.

```json
"video": { "fps": 30, "duration": 20, "audio": "design/preview-music.m4a", "poster": "00:00:05:00" }
```

| Key | |
|---|---|
| `fps` | frames per second (default 30) |
| `duration` | seconds per slide (default 15, the shortest length every canvas takes); a slide's `data-duration` overrides it |
| `audio` | a sound file for app previews, relative to `store/`; without it they get a silent track, which App Store Connect requires |
| `poster` | the app preview's poster frame as a timecode |

Top level for every canvas, or under `devices.<id>.video` for one. `check` and `upload` probe every video against the canvas's spec.

## creative
`storeshots creative` takes the header and search results asset of each locale (the rendered video if there is one, else the image) and places it on every localization of the version. A localization without its own render gets the first locale's, or the locale in `"creative": {"fallback": "en"}`; `--own-only` skips those instead. Files are uploaded once: their names carry their hash, so a rerun reuses them. An editable version takes the placements now and App Review checks them with it. The version on sale needs the assets approved first: `--version <on sale> --confirm --submit` sends them to App Review on their own, and a rerun after approval places them.

## events
`storeshots event <id>` reads `store/events/<id>/event.json`:

```json
{
  "referenceName": "Halloween 2026", "badge": "SPECIAL_EVENT", "purpose": "APPROPRIATE_FOR_ALL_USERS", "priority": "HIGH",
  "deepLink": "myapp://halloween", "primaryLocale": "en-US",
  "schedule": { "territories": "all", "publishStart": "2026-10-20T00:00:00Z", "eventStart": "2026-10-23T22:00:00Z", "eventEnd": "2026-11-01T08:00:00Z" },
  "copy": { "en-US": { "name": "Halloween in the app", "short": "Pumpkins glow on your porch at night", "long": "…" } },
  "media": { "card": "card.png", "details": "../../output/video/event-details/{locale}" }
}
```

`name` takes 30 characters, `short` 50 and `long` 120. An event runs for 31 days at most and shows at most 14 days before it starts. `territories` is `"all"` or a list of codes. Media paths are relative to the event's folder. `{locale}` is replaced per locale, a folder gives its first file, and a locale without its own file uses the primary locale's. Card: 16:9, 1920–3840 wide. Details page: 9:16, 1080–2160 wide. Either may be a video of 15–30 s. Without `--confirm` the command only prints the plan. `--confirm` creates or updates the event, its localizations and media, and `--submit` sends it to App Review. An event that is in review, approved or published is not changed: give it a new `referenceName`.

## paths
`{"output": "output", "raw": "output/raw"}`: where generated files go, relative to `store/`. `capture` writes PNGs into `raw`. When a shot has no PNG, storeshots reads a JPEG of the same name, so captures you commit can stay small. The examples keep theirs in `"raw": "captures"`.

## Environment
| Variable | |
|---|---|
| `STORESHOTS_HOST` | simulator host, e.g. `ssh my-mac` |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_PATH` | App Store Connect API key (or `ASC_CONFIG` pointing at a JSON with them) |
| `STORESHOTS_BROWSER` | a Chrome/Chromium executable |
| `STORESHOTS_HOME` | where downloads are kept (Apple bezels, the reference library); default: the repo in a git clone, `~/.cache/storeshots` for an npm install |
| `STORESHOTS_FRAMES` | where Apple bezels are kept (overrides `STORESHOTS_HOME` for them) |
| `IMAGE_PROVIDER` | for `storeshots art`: `codex` (the Codex CLI's image tool, with a ChatGPT login and no API key) or `api`. Without it, an API key wins, then a logged-in Codex |
| `IMAGE_API_BASE`, `IMAGE_API_KEY` | for `storeshots art` with `api`: any OpenAI-compatible images API (default Pollinations) |
| `STORESHOTS_CODEX_MODEL` | the Codex model that passes the prompt to the image tool (default: Codex's own) |

## art.json

Optional generated art for `storeshots art`: a new pose of the app's own character, and, when the user asks, a prop or a scene. Never app UI.

```json
{ "assets": [
  { "id": "sheep-wave", "kind": "pose", "prompt": "waving hello with one front hoof raised high above its head, a big happy open-mouth smile",
    "refs": ["design/art/sheep.svg"], "transparent": true, "variants": 2 }
] }
```

| Field | |
|---|---|
| `kind` | `pose` keeps the character in `refs` and changes only its pose; `prop` (one object) and `scene` (a backdrop) take only the style of `refs`. Required with `refs`; without them `prop` when `transparent`, else `scene` |
| `prompt` | only what is new: the pose, the object or the scene. storeshots wraps it in a spec (what the image is for, which reference is what, what must not change, framing, background, what to avoid) |
| `refs` | the app's own art, PNG or SVG (SVGs are drawn to PNG first). A ref that doesn't draw stops the run |
| `transparent` | generated on flat magenta, then keyed out; `art` warns when the subject touches an edge |
| `size`, `style`, `shown`, `variants`, `model` | canvas (`1024x1024`), a style in words instead of "as in the refs", the size on the slide in px (400), images per run, the API model |

`storeshots art --dry-run` prints the prompts without generating anything. Each image is written with a `.json` next to it holding the full prompt that was sent.
