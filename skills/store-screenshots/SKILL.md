---
name: store-screenshots
description: Make, redo, localize or upload App Store screenshots from the real app with the `storeshots` CLI — capture on the iOS Simulator, compose in HTML/CSS with Apple bezels, check store and readability rules, upload to App Store Connect. Use for "app store screenshots", "store listing images", ASO visuals, or adding a screenshot demo mode to an app.
---

# Store screenshots with storeshots

You run the pipeline; the user approves the story, the copy and the look. Everything lives in `<app repo>/store/`, and every stage can be rerun alone. The CLI documents itself: `storeshots help`. It prints one JSON document on stdout (logs on stderr); failures carry `{error, fix, next}` and an exit code (1 usage, 2 capture/render, 3 check, 4 upload, 5 missing tool). Follow `fix` and `next` before improvising.

## Start
1. `storeshots doctor` — fix every FAIL first. (`storeshots skill --install` links this skill for other agents.)
2. No `store/` yet: `storeshots init [app] --shots hero,feature-1,…` (reads the app's name, bundle id, icon and colour; style `clean`).
3. Keep `store/brief.md` current after every step so a later session can resume.

## Workflow (stop at each ★ for the user)
Never one-shot a set: it is made with the user in short interview rounds → `references/interview.md`.
1. **Study** the category: `storeshots refs --country <market>,us --genres <genre> --limit 25`, look at the top sets → `references/patterns.md`; `storeshots board --genres <genre>` makes the lettered sheet for the interview.
2. **The app's own art**: `storeshots assets`, look at the sheets, write `store/assets.json` → `references/assets.md`.
3. **Brief**: audience in a sentence; 3–5 benefits, each tied to a real screen; a 5–8 slide story → `references/design.md`.
4. **Interview, round 1** (board, style, colour, proof, brand font) → `references/interview.md`. ★
5. **Copy deck** `store/copy-deck.md`: 3 options per slide (moment / outcome / pain), choose, then `copy/<locale>.json` → `references/copy.md`. ★
6. **Demo mode + capture**: each shot opens from launch arguments with seeded local data → `references/capture.md`. Install a Release build on the shots simulator, `storeshots capture`, open every raw PNG and rate it Great / Usable / Retake; fix and recapture. Without a Mac, or with screenshots made elsewhere (fastlane, a device): `storeshots import <files|folder>`.
7. **Slides and look**: declare `slides` in screenshots.json, one per story beat: `[{id, shot, layout?, bg?}]` (copy keys are slide ids; a slide without a shot becomes the closer), and `look`: `{style, palette?, colours: one|each, accent: false|true|<slide id>, background?: flat|gradient|glow|{image, credit}, proof?}`. The style sets the defaults (see the table in interview.md). `layout` overrides the style's rhythm (`hero`, `lean`, `hang`, `offset`, 3D `tilt` or `lay`; at most two 3D slides, on slides whose pop is the message). `storeshots proof` fills `look.proof` with the real rating; or set `{text, sub}` for downloads, press, a non-Apple award; `slides` says where the laurel goes.
8. **Focus per slide**: `storeshots elements` finds the UI elements of each slide's capture that could pop out (cards, list rows, chips cut along their own shape; blocks of a card's key lines, a calendar week, stacked cards in an evenly padded container), ranks them against the slide's copy and draws numbered marks → open `output/elements/marks.png`. For each slide pick the one element that proves the headline (not the biggest, not chrome; the ranking is a prior, `--pick best` only a starting point): `storeshots elements --slides <id> --pick <n>`; `--pick none` for slides that need no pop (the spread, the closer).
9. **Render, interview round 2**: `storeshots style` (writes `design/<style>.html`), `storeshots build --design design/<style>.html`; for open choices `storeshots catalog style|layout|colours|accent|background` renders the options numbered. Show the strip and sheets, ask by number, `--pick`, rebuild. `storeshots style` regenerates the file, so settle slides, look and pops before refining the design by hand → `references/kit.md`. ★
10. **Full set**: `storeshots build`, then open `output/review/*-sheet.png` and `*-strip.png` yourself and critique against the checklist in `references/design.md` and the user's rejections (interview.md); iterate until `check` is clean and the set passes your critique. Anything added beyond real UI on the app's own ground goes to the user as two versions to pick from. Note the user's choices in `~/.storeshots/taste.md` (a weak prior, see interview.md). ★
11. **Upload**: `storeshots upload` (plan), then `storeshots upload --confirm` only after the user's OK → `references/specs.md`.

Show images inline: `![sheet](/abs/path/store/output/review/iphone-6.9-en-sheet.png)`.

## Follow-ups: change the smallest thing, rerun the cheapest stage
| Request | Edit | Rerun |
|---|---|---|
| Different headline or subtitle | `copy/<locale>.json` | `storeshots build` |
| Layout, colour, type, pop-out | `design/*.html` | `storeshots build` (`--slides id` for one) |
| Try another style | — | `storeshots catalog style`, `--pick <n>`, `storeshots style`, then `build --design design/<style>.html` |
| Different layout for one slide | `storeshots catalog layout --slides <id>`, `--pick <n>` | `storeshots style`, then `build` |
| Art from the app on a slide | `slides[].art` {asset, place} (ids in `store/assets.json`) | `storeshots style`, then `build` |
| Social proof | `storeshots proof`, or `look.proof` {text, sub, slides} | `storeshots style`, then `build` |
| Pop-out on a slide, or a different one | `storeshots elements --slides <id> --pick <n>` (writes `slides[].pop`) | `storeshots style <name>` again, then `build` |
| Different data on a screen, dark mode, other screen | app demo data or `shots.<id>` in `screenshots.json` | `storeshots capture --shots id`, then `build` |
| New language | `locales` + `copy/<locale>.json` (rewrite, don't translate) | `capture --locales x`, `build --locales x` |
| Widget / Live Activity art | the app's render test (see capture.md) | the test, then `build` |
| Upload refused | read `fix` (version locked, credentials) | `storeshots upload` |

## Non-negotiables
- Real app UI only, captured from the app. Never redraw, invent or AI-generate UI; generated art (`storeshots art`) is for props, scenes and mascot poses only.
- `storeshots check` passes: exact size, RGB without alpha, 1–10 per set, no text below 4 % of the width, one headline size, nothing crossing a slide edge, text contrast measured on the rendered pixels (≥ 3:1 headlines, aim for 4.5:1), no letters hidden behind a phone or pop, no texts running into each other, every character in the design's own font, no other platforms in the copy. Warnings cover empty bands, text on top of the UI or near an edge, prices, claims, filler words and long headlines. Contrast messages name the fix (a shade that passes, or a busy ground); apply it rather than arguing.
- 9:41 status bar, realistic local data, no debug UI, no system alerts, no prices, no "#1/best/free", no other platforms' devices (App Review 2.3).
- Slides 1–3 sell the app alone: they are what search shows.
- Apple bezels are downloaded per machine (license: depict your own app, no redistribution); never commit them.

## References
- `references/interview.md` — the two interview rounds, styles table, taste memory
- `references/design.md` — what converts, composition rhythm, legibility, mascots, checklist
- `references/patterns.md` — what top App Store sets actually do, with examples
- `references/copy.md` — headline rules, formulas by slot, localization
- `references/assets.md` — the app's own art: find it, label it, place it
- `references/kit.md` — writing a design: markup API, pop-outs, cross-slide elements, fonts
- `references/capture.md` — simulator host, demo mode recipes (SwiftUI, Expo/RN, Flutter), widgets
- `references/specs.md` — store sizes, review rules, upload flow
