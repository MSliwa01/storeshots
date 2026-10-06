# What other screenshot skills teach (research 2026-10-03)

Read in full: ParthJadhav/app-store-screenshots (SKILL.md, copy-ideas.md, style-prompts/_QUALITY_BAR.md), adamlyttleapps/claude-skill-aso-appstore-screenshots, software-mansion-labs/goldie, appeeky/aso-skills, LeeHueeng/store-screenshots, hypersocialinc/shots + hypershots, rorkai/app-store-connect-cli-skills, chawlaaditya/NanoBananaASO, framara/app-store-screenshots-skill, zaferayan/app-store-screenshot-skill, Kronop/vibe-aso, dontoreve, abhishekdubey331/google-play-screenshot-skill, ScreenshotWhale, moonjar write-up. Sizes converted to the 1320 px canvas (W = width).

Weighting: hypershots, framara, zaferayan, LeeHueeng, goldie are HTML/CSS compositors like ours → take their typography/layout. shots, NanoBanana, Lyttle, Play-skill drive image models → take copy and composition rules only.

## Copy
- Outcome in the headline, mechanism in the subtitle [hypershots, framara]. Never "and" in a headline [Parth, NanoBanana].
- 3 options per slide: paint a moment / state an outcome / kill a pain; lock headlines before layout [Parth, NanoBanana].
- 1-second test at arm's length; > 8 words for the core change → simplify [NanoBanana].
- **Cover-the-UI test**: read only the headlines in order; if they read like a feature catalog or could be shuffled, rewrite [NanoBanana].
- Never repeat text already visible in the screenshot [zaferayan, NanoBanana].
- Headline creates recognition or tension; subtitle reduces doubt or reframes. In a crowded category make the hero more specific, not louder [shots].
- Build a language bank first: the market's words, phrases from reviews and complaints [shots].
- Banned: hype adjectives (stunning, seamless, powerful, innovative, effortless), exclamation marks, questions in headlines, "#1/best" without evidence, prices, "Download now" [shots, framara, Parth, Play-skill]. Test: a headline that still works with a competitor's name swapped in is too generic [Parth].
- Lengths: headline 2–6 words, ≤ ~20 characters per line, exactly 2 lines with manual breaks; subtitle 1 line [hypershots, goldie, zaferayan].
- Lyttle: two levels, line 1 a single action verb, biggest; line 2 the descriptor, smaller but still heavy; no subtitle at all.
- Localization: transcreate; set line breaks per locale; accent the meaning-carrying word; match the app's formality (Polish "ty") [framara]. Reuse the listing's keywords (captions may be OCR-indexed; unconfirmed by Apple).
- Parth formula bank by slot (hero / differentiator / feature / proof / closer) and deck arcs (benefit ladder, problem→solution, day in the life, numbers-led): `/tmp/skillref/parth-copy-ideas.md` at research time; key formulas copied into skill/references/copy.md.

## Typography and legibility
| Source | Headline | Subtitle |
|---|---|---|
| goldie | 108 px · 8.2 % W · 700 | 50 px · 3.8 % W · 400 |
| LeeHueeng | 118 px · 8.9 % W · 800 | 52 px · 3.9 % W · 500 · 85 % |
| hypershots | ~144 px · 10.9 % W · 900 | ~71 px · 5.3 % W · 600 |
| framara | 148–168 px · 11–12.7 % W | — |
- No marketing copy below 3.5 % W (46 px) [hypershots]; Parth: subtitles on textured/gradient bg > 36 px and ≥ 4.5:1; dontoreve: "if it can't be 36 px, delete it", ≤ 3 text levels, ≤ 4 lines of copy per slide; appeeky: large bold text beats small text by 5–10 % in A/B tests.
- **Cut words instead of shrinking**: an auto-shrunk headline is a copy failure [hypershots, framara]. Headline size identical across the set [zaferayan].
- Eyebrows/chips: none by default; filled chips turn into smudges at thumbnail size [hypershots].
- Contrast: WCAG AA 4.5:1 at the worst pixel; accent colours must pass on their own; tiny labels 7:1 [Parth]. One accent segment per headline, one accent style per set [framara].
- Fonts: bundle with the latin-ext subset (Polish ą ę ś ł), measure after `document.fonts.ready` [hypershots].
- Thumbnail test at ~200 px wide with a divider after panel 3 [hypershots, framara]; Parth: 220 px and answer "what style / what does it do / why tap" in one sentence.

## Mascot
- The character needs a job or it goes [all]. Jobs: its own phone-less brand slide (1–3 strong motifs) [NanoBanana, shots]; a die-cut sticker bridging copy and device, straddling the bezel [hypershots]; interacting with a lifted real UI card [hypershots, Play-skill].
- Never in the headline zone, never over UI that must be read, never clipped partway [zaferayan, NanoBanana].
- Parth's quality bar: cover mascot ≥ 380 px tall, companion ≥ 260 px; a cast shadow on the ground ("floats without shadows look pasted in"); illustration polish gates (two fill tones, volume, texture, detail).
- "A clean screenshot with no breakout is better than a forced or irrelevant one" [Lyttle, Play-skill].

## Composition
- goldie layouts (device width / copy block): classic 0.84 W / 0.24 H; hero 0.95 W centred at y 0.74 bleeding; offset 0.90 W at x 0.62; tilt −8° / +10°; duo 0.62 + 0.70 W; panorama 1.10 W across two tiles at −10°; minimal 0.92 W, no copy. Side padding 0.09 W, top 0.055 H. Never two tilted tiles in a row; `minimal` as a breather.
- hypershots: device top at 0.33 H (0.28–0.36, the same for the whole set); at most one tilted panel, never one whose text must be read.
- Parth quality bar: phone 68–82 % of canvas height; headline + phone ≥ 80 % of height; no empty band > 22 %; ≤ 3 visual layers; anchor the phone to an edge, never float it centred with bands above and below; one cross-canvas moment in 5+ slides, 10–30 % of a visual across the seam.
- Rhythm: adjacent slides never repeat phone placement, background colour or headline position; 1–2 inverted slides; loud then calm; about a third of panels without a phone [NanoBanana, framara, ScreenshotWhale].
- Background built from the screen's content; if two slides could swap backgrounds unnoticed, the concept is generic [zaferayan].
- Lyttle breakout: a complete card, same vertical position, not rotated, scaled up past both bezels, soft drop shadow; 1–2 supporting elements max.

## QA
- hypershots: render fails if the headline must shrink below its floor; warns on copy < 46 px; flags hand-built screens (2.3.3); validates size/count/alpha/sRGB; review page with a line after panel 3 and a thumbnail strip; the agent must look at every PNG.
- zaferayan: prints device box and headline px per image (must match across the set).
- Approval: copy table + fully rendered slide 1 first, then the rest [LeeHueeng, NanoBanana].

## Worth stealing later
- A big translucent number/word behind the device that matches the screen (framara).
- An honest trust strip at the bottom (e.g. "Bez konta. Bez reklam." only if true).
- One headline split across slides 1–2 as a reward for swiping (framara).
- Google Play: text ≤ 20 % of the image (Play-skill).
