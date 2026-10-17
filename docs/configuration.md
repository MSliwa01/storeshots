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
`locales`: the copy files (`copy/<locale>.json`) and capture languages. `devices`: store slots to produce. `iphone-6.9` is 1320×2868 and `ipad-13` is 2064×2752. Per device:
- `frame`: `generic/black` or `generic/silver` (a drawn iPhone), `plain[/<colour>[/<width>]]` (a flat phone-like border: `white`, `black` or a hex without `#`, width in ‰ of the screen, default 34), `none` (the bare rounded screen), or an Apple bezel such as `iphone-18-pro-max/black` (`storeshots frames`). A style may bring its own frame; `"look": {"frame": …}` overrides it, and `"device"` keeps this one.
- `design`: a design file other than `design/<style>.html`.

## capture
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
