# screenshots.json

`storeshots init` writes a working file. Everything below is optional unless marked.

```json
{
  "app": { "name": "Sprout", "bundleId": "com.example.sprout", "icon": "../icon.png", "accent": "#2f9e6e", "ascAppId": "1234567890" },
  "locales": ["en", "de"],
  "devices": { "iphone-6.9": { "frame": "generic/black" } },
  "capture": { "bundleId": "com.example.sprout", "args": { "DemoMode": "YES" }, "appearance": "light", "wait": 3, "host": { "ssh": "my-mac" } },
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
- `frame`: `generic/black` or `generic/silver` (drawn), or an Apple bezel such as `iphone-18-pro-max/black` (`storeshots frames`).
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
| `layout` | overrides the style's rhythm: `hero`, `lean` (tilted), `hang` (from the top, caption below), `offset`, `tilt` and `lay` (3D; at most two per set) |
| `pop` | written by `storeshots elements --pick`: the lifted element (`box` in capture pixels, `radius`, `behind`, `cut`: `surface` or `frame`, with `fill` or `pad`) |
| `bg` | this slide's background colour |

## Pop-outs
`storeshots elements` reads a screen as flat surfaces (card, inner card, chip) plus blocks of content between gaps. It cuts each candidate in one of two ways:

- **Surfaces** (cards, chips, bubbles) are cut along their real outline. The colour behind them is keyed out, so iOS corners and bubble tails stay exact.
- **Blocks** (a few lines of a card, a calendar week, two stacked cards) get a container with even padding taken from the app's own spacing.

The ranking uses size, colour, type size and the words the candidate shares with the headline (OCR, if tesseract is installed). It is a starting point. You choose from the numbered sheet. `--pick` writes the chosen element into the slide's `pop` key.

## look
| Key | |
|---|---|
| `style` | `clean`, `soft`, `atmosphere`, `premium`, `poster`, `editorial`, `playful`, `neon` |
| `palette` | the app's own colours (categories, tabs), used one per slide in turn |
| `colours` | `one` (one field for the set) or `each` (a colour per slide) |
| `accent` | `true` (the middle slide), a slide id, or `false` |
| `background` | `flat`, `gradient`, `glow` (the slide's own screen blurred into light), or `{"image": "design/bg.jpg", "credit": "…"}` |
| `proof` | a laurel: `{"rating": 4.8, "count": 2300, "slides": ["today"]}` from `storeshots proof`, or `{"text": "1M", "sub": "downloads"}`. Apple's own awards are not allowed in screenshots |

Each style sets its own defaults for `colours`, `background` and the layout rhythm. Keys set in `look` override them.

## paths
`{"output": "output", "raw": "output/raw"}`: where generated files go, relative to `store/`.

## Environment
| Variable | |
|---|---|
| `STORESHOTS_HOST` | simulator host, e.g. `ssh my-mac` |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_PATH` | App Store Connect API key (or `ASC_CONFIG` pointing at a JSON with them) |
| `STORESHOTS_BROWSER` | a Chrome/Chromium executable |
| `STORESHOTS_HOME` | where downloads are kept (Apple bezels, the reference library); default: the repo in a git clone, `~/.cache/storeshots` for an npm install |
| `STORESHOTS_FRAMES` | where Apple bezels are kept (overrides `STORESHOTS_HOME` for them) |
| `IMAGE_API_BASE`, `IMAGE_API_KEY` | optional, for `storeshots art` |

## Project layout
```
store/
  screenshots.json    app, locales, devices, capture, shots, slides, look
  brief.md            audience, benefits, story, decisions
  copy/<locale>.json  headline and subtitle per slide
  design/<style>.html the set as one page (written by `storeshots style`, editable)
  output/             raw/, final/, review/, elements/, catalog/ (gitignored)
```
