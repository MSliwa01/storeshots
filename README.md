# storeshots

[![test](https://github.com/MSliwa01/storeshots/actions/workflows/test.yml/badge.svg)](https://github.com/MSliwa01/storeshots/actions/workflows/test.yml)

App Store screenshots from your real app. storeshots captures the app in the iOS Simulator or imports your screenshots. It puts them in device frames with headlines, renders the sizes App Store Connect requires, checks them against the store's rules and uploads them.

![A six-slide set for a demo app](docs/images/set.jpg)

Used for the App Store screenshots of [EcoSort 1.1.0](https://apps.apple.com/pl/app/ecosort/id6785674008).

- **Real UI.** Slides are built around screenshots of the running app with seeded demo data. Nothing in the UI is redrawn or generated.
- **Designs are HTML.** A set is one HTML page, rendered by Chrome at 1320×2868. Slides sit on one canvas, so a phone can cross from one slide into the next. Eight styles are included; any of them can be edited by hand.
- **Pop-outs.** `elements` finds the cards, rows and blocks on each screen, cuts them along their own shape and ranks them against the slide's headline. You (or an agent) pick by number.
- **Checks.** Size, alpha, 1–10 per set, minimum text size, one headline size, nothing cut by a slide edge, and text contrast measured on the rendered pixels.
- **Upload.** `upload` prints a plan and `upload --confirm` applies it through the App Store Connect API. Sets that have not changed are left alone.
- **Scriptable.** Every command prints one JSON document on stdout and logs to stderr. Errors carry `error`, `fix` and `next` along with a distinct exit code. An agent skill is included.

## Try it

Requirements: Node 20+, ffmpeg and Chrome or Chromium (or `npx playwright-core install chromium`). Capture needs macOS with Xcode, locally or over SSH. Everything else, including the demo, also runs on Linux.

```bash
git clone https://github.com/MSliwa01/storeshots && cd storeshots
npm install && npm run demo
# result: examples/demo/app/store/output/review/iphone-6.9-en-sheet.png
```

## Use it in your app

storeshots is not on npm yet. Run `npm link` inside the clone to put `storeshots` on your PATH.

```bash
npm link                                     # puts `storeshots` on your PATH
cd your-app
storeshots doctor
storeshots init --shots today,detail,stats   # store/ from the app's name, icon and colour
```

Write the headlines in `store/copy/en.json`, then get the screens. To capture them, the app needs a demo mode: launch arguments that open a given screen with seeded data. [references/capture.md](skills/store-screenshots/references/capture.md) has recipes for SwiftUI, Expo/React Native and Flutter. `capture` runs on a Mac with Xcode, either locally or on another Mac over SSH (`"capture": {"host": {"ssh": "my-mac"}}`). It sets the status bar to 9:41 and waits for each screen to settle.

```bash
storeshots capture                           # or: storeshots import ~/Desktop/screens
storeshots elements                          # open store/output/elements/marks.png
storeshots elements --slides today --pick 2  # lift element 2 on the "today" slide
storeshots catalog style                     # your screens in every style, numbered
storeshots catalog style --pick 3
storeshots style && storeshots build         # render, review sheets, check
storeshots upload                            # prints the plan, changes nothing
storeshots upload --confirm                  # uploads the changed sets
```

`upload` changes nothing without `--confirm`. It runs `check` first, stops if the set fails, and prints a plan per locale and device. With `--confirm` it deletes the screenshots of each changed set in the editable App Store version and uploads the new ones. Sets whose checksums already match the local files are left alone. If no version is editable, create the next one in App Store Connect first. It needs `app.ascAppId` (the app's numeric Apple ID) in `screenshots.json` and an App Store Connect API key (Users and Access → Integrations → Keys). Download the `.p8` once, keep it outside the repo, and set `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_PRIVATE_KEY_PATH=/path/to/AuthKey_XXXX.p8`.

## With a coding agent

```bash
storeshots skill --install                   # Claude Code (~/.claude/skills)
storeshots skill --install ~/.agents/skills  # Codex, Gemini CLI and others
```

Then ask for App Store screenshots of the app. The skill takes the agent through the brief, the copy, a demo mode, capture, the look and the upload. It stops twice for your decisions. First it shows a lettered sheet of top apps in your category, then numbered sheets of your own screens.

## Styles

![The first two slides of the demo in each style](docs/images/styles.jpg)

| Style | For |
|---|---|
| `clean` | productivity and tools; anything that should look native (the default) |
| `soft` | planners, habits, home, family |
| `atmosphere` | apps with colour-rich screens: weather, sleep, photo, music. The background is the slide's own screen, blurred |
| `premium` | finance, travel, pro tools |
| `poster` | consumer and learning apps with bold colour and big type |
| `editorial` | reading, journaling, food |
| `playful` | kids, habits and pets; only with a character the app really has |
| `neon` | fitness, sport, gaming |

Within a style, `look` in `screenshots.json` sets the palette, one colour or one per slide, an accent slide, the background and a rating laurel. Each slide's layout is set separately: hero, tilted (`lean`), hanging from the top, offset, or 3D (`tilt`, `lay`). Every phone in a set has the same size. See [docs/configuration.md](docs/configuration.md).

## Pop-outs

![Candidates on one screen, and the slide made from the pick](docs/images/pop-outs.jpg)

`elements` numbers the cards, rows and blocks on each screen, and `--pick` lifts the chosen one out of the phone. [docs/configuration.md](docs/configuration.md#pop-outs) explains how candidates are cut and ranked.

## Commands

`storeshots help` lists every command and option.

| | |
|---|---|
| `init`, `doctor`, `skill` | set up a project, check tools, install the agent skill |
| `capture`, `import`, `elements` | get the screens, pick what pops out |
| `style`, `catalog`, `proof` | write the design, compare options, add the App Store rating |
| `render`, `review`, `check`, `build` | output, review sheets, rules |
| `upload` | App Store Connect |
| `refs`, `board`, `frames`, `art` | reference sets from the App Store, Apple bezels, optional generated props |

## Notes

- storeshots draws the default device frame. `storeshots frames` downloads Apple's bezels from Apple Design Resources (needs `7z`: `brew install p7zip` or `apt install p7zip-full`). Apple licenses them for depicting your own app and does not allow redistribution, so they stay in `frames/` on your machine.
- `refs` downloads other apps' App Store screenshots into a local library for study. They belong to their publishers. Keep them local and don't commit or redistribute them.
- The bundled fonts are under the SIL Open Font License, not MIT. [kit/fonts/README.md](kit/fonts/README.md) lists them with their licence files.
- iPhone 6.9" is tested end to end. iPad 13" is wired but untested. Google Play is not supported yet.
- `npm test` uses node:test and needs no extra dependencies.

## License

[MIT](LICENSE)
