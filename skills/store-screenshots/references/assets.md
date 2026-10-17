# The app's own art

Mascots, illustrations, badges and painted scenes the app already ships make a set look like *this* app and nobody else's. Use them before stock photos, and stock before generated art.

## Find it
1. `storeshots assets` scans the app repo (`app.root` in screenshots.json, default the folder above `store/`) and draws numbered sheets in `output/assets/`:
   - art the code uses comes first;
   - big families (emoji sets, game icons) show as one group with samples;
   - work files (QA captures, mockups, explorations) and art the code never names are folded into groups at the end, marked "not in the code".
   The JSON result also lists the icon, the accent, every colour set, Rive and Lottie files, font files, the fonts the code asks for, and the ones missing from the repo.
2. Open every sheet. For a group worth a closer look: `storeshots assets --dir <folder>`.
3. Rive files: `storeshots assets --rive <file.riv>` renders every artboard × animation (and state machine) at 0.1, 0.6 and 1.5 s on one sheet. A pose is free: no image generation.
4. Decide what each piece is and what it is good for, and write `store/assets.json`:
```json
{ "assets": [
  { "id": "fox-wave", "rive": "assets/mascot/fox.riv", "artboard": "Fox", "animation": "wave", "time": 0.6, "role": "mascot", "fits": "closer, celebrating a streak" },
  { "id": "sunflower", "file": "Bloomling/Resources/Assets.xcassets/GardenSunflower.imageset/GardenSunflower.svg", "role": "illustration", "fits": "growth, progress" },
  { "id": "hills", "file": "assets/art/hills.png", "role": "backdrop", "fits": "atmosphere behind the phone" }
] }
```
   Paths are relative to the app repo, or to the store's parent with a `store/` prefix. Roles: `mascot`, `illustration`, `badge`, `icon`, `sticker`, `backdrop`, `texture`, `widget`. Art is cropped to what it draws (empty margins removed); `backdrop` and `texture` keep their frame (or set `"tight": false`). A flat Rive artboard background is keyed out (`"keepBackground": true` keeps it).

## Place it
`slides[].art` in screenshots.json (one or a list), then `storeshots style` and `build`:

| place | where | good for |
|---|---|---|
| `beside` (default) | a sticker over the phone's lower corner, in front | an object the headline names; not a character (one standing next to a phone reads as clip art) |
| `peek` | behind the phone, looking over its top edge (its bottom edge on a hanging phone); the phone moves down to make room under the caption | a character doing something (watching a game), plants growing out of the phone |
| `backdrop` | a scene filling the slide behind the phone | painted landscapes, textures, weather, places |
| `closer` | on the closing slide, in place of the app icon | the mascot, waving |
| `float` | a card in front, centred on `at: [x, y]` (% of the slide), on any slide; with `"layout": "free"` the slide has no phone | the app's own UI from outside the app: widget and Live Activity renders (role `widget`) |

Options: `size` (width in % of the slide; for `closer` the height), `side` (`left`/`right`, default alternates), `flip` (mirror so it faces the phone). A whole-set scene: `"look": {"background": {"asset": "hills"}}`. In a hand-written design: `<img data-asset="id">`, or `data-asset` on any element for a background image.

## Stock photos, when the app has nothing for an idea
`storeshots stock "<query>" [--orientation portrait]` puts candidates from Unsplash, Pexels, Pixabay (keys in `~/.storeshots/.env`) and Openverse (CC0, no key) on a numbered sheet, `output/stock/sheet.png`; ones whose tags read as generated are marked **AI?**. `storeshots stock --get <n> --id <name>` downloads one into `design/stock/` and adds it to `store/assets.json` with its credit.
- **Default: scenes and backdrops only**: the place or thing the app is about (bins by a wall for a waste app, a sky for a weather app), behind the phone, never competing with it.
- **Ask the user first** for anything more: people, a photo as the whole set's background, a cut-out product next to the phone. Note the yes in `store/brief.md`.
- Never people posing at the camera, never other brands' logos, never anything marked AI? unless you have checked it is a real photo.
- Search in English, 2–3 queries; prefer photos with one calm area where a caption can sit.
- **Cut-outs**: `storeshots cutout <asset> --id <name>` cuts the subject (a person, a hand holding something, an object) out of a downloaded photo on this machine (rembg) and adds it with role `cutout` and the photo's credit; `--crop x,y,w,h` keeps part of the photo first. Pick an opaque subject on a plain background: clear glass and plastic keep the old background inside them, and a pale subject on a pale ground loses its edge. A person must not hold another platform's phone (2.3.10). Cut-outs suit sets with photographic or flat UI; in a painted or drawn world (a painted landscape, a cartoon) a photo looks pasted on. Where the photo cut the subject off (a person at the waist, an arm at the wrist), that straight edge has to run past the slide's edge: set `at` so it does, and `check` warns when it shows.

## Rules
- **Every piece needs a reason in the headline or the screen.** A sunflower on a "watch them grow" slide, not on the settings slide. Art with no reason reads as decoration and as slop.
- **One piece per slide, at most two slides with art next to a phone**, plus the closer. The UI stays the hero. A character appears at most twice per set.
- **Never art that looks like UI** (fake notifications, fake buttons): App Review 2.3.3.
- `storeshots check` warns when art is shown past 1.35× its pixels (fails past 1.6×), when it is cut by the slide's edge (except a cut-out's cropped side), when a cut-out's cropped side shows inside the slide (any straight run along its picture's border, even a wrist), and when it covers part of a word on a phone's screen (with tesseract). It fails when art hides letters of a caption. Small art (512 px) is still fine as a sticker; ask the user for the source file before blowing it up.
- Generated art (`storeshots art`) only for new poses of a mascot the app already has, with its files as references. Props and scenes only when the user asks.
  - Write `prompt` as the new pose alone, in concrete body language ("waving, one front hoof raised high above its head, a big open-mouth smile"), not "happy" or "cute". `art` adds the rest: keep the character, match the style, magenta background, no text.
  - Ask for a pose whose limbs or held object stand clear of the body, so it reads at sticker size.
  - Run `storeshots art --dry-run` first and read the prompt; each image costs a call. Generate 1–2 variants, look at them on the slide's real colour, and keep one. Never hand the user an image you haven't looked at.
  - Off-model results (a different face, gloss the original lacks) mean a weak ref: use the cleanest, largest file of the character, and never one with a background scene.
  - A prop must look drawn by the same hand as the app: give the app's own art as `refs` (a crop of its scenery, an icon from a screen, the mascot) and name that rendering in `style` ("flat 2D with thick black outlines like Image 1"). A glossy 3D prop next to flat or painted art looks pasted on.
