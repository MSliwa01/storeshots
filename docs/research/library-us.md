# What 189 top US apps actually ship (analysed 2026-10-05)

Library: `references/us/<app>/sheet.jpg` (gitignored), built with `storeshots refs --country us --genres utilities,productivity,lifestyle,health,finance,weather,education --kind topgrossingapplications,topfreeapplications --limit 15 --curated`. Group images for viewing: `references/_groups/us/gNN.jpg` + `index.json`. Four agents described every set; counts below are summed (≈ 189 sets; sizes estimated by eye).

## Counts
| Pattern | Share |
|---|---|
| Realistic framed phone as the main device | ~64 % |
| Frameless UI cards (no bezel) | ~14 % |
| Tilted/3D phone somewhere (mostly slide 1) | ~30 % |
| At least one slide without a phone (photo, mascot, props, stats) | ~25 % |
| Spread (2 slides = one picture), mostly on slides 1–2 | ~25 % |
| Headline at the top on every slide | ~80 %; alternating top/bottom ~12 % |
| Headline size < 6 % W / 6–9 % / 9–12 % / > 12 % | 16 % / 44 % / 26 % / 13 % |
| Subtitle under the headline | ~31 % |
| Social proof on slide 1 (laurels, user counts, press) | ~39 % |
| Lifted UI (pop-outs) | ~45 %, almost always 1 per slide (rarely 2–3) |
| Mascot | ~11 %; real people/photos ~24 % |
| One background for the whole set / colour per slide | ~70 % / ~30 % |
| Dark sets | ~40 % |

Big headlines (> 12 %) cluster in high-grossing education, fitness and finance. The weakest sets are raw screenshots, tiny thin captions, or the same template ×6.

## Top sets (agents' picks, 5/5) and what to steal
- **Cash App**: frameless UI card + a big plain left-aligned headline + 3 rotating brand colours — the most confident system.
- **Chime**: one dark-green world, small eyebrow + bold headline, one lifted notification per slide telling a story.
- **EveryDollar**: a hand-drawn line running through all six slides; layouts vary, set reads as one.
- **Deepstash**: saturated colour per slide + grain + witty strikethrough headline ("~~TikTok~~ for smart people").
- **ExpressVPN**: premium serif on dark teal, a stat row on slide 1, spread in the middle.
- **Claude**: editorial serif over moody photos, a different layout each slide.
- **Daylio / Waterllama / Mercury Weather / ParentSquare**: one vivid colour per slide from one family, one clean UI each — colour alone carries rhythm.
- **Flighty**: dark cinematic spread, eyebrow pills ("#1 CAUSE OF DELAYS"), press quote, every composition different.
- **Hinge / The League / Tinder**: photo-led editorial; serif or italic accent; sells a feeling.
- **Gentler Streak / Headspace / Finch / Bear**: mascot as connective tissue or the whole hero, bg colour switching with topic.
- **Imprint / Grammarly / RISE / Gmail**: one oversized lifted UI element per slide on one calm background.
- **Gizmo / Ziggy**: giant one-word headline (or one word in a pill) + one prop — maximal thumbnail legibility.
- **Norton / Everlance / Capital One / RISE**: one continuous stage or path across the whole set (dotted path, graph line, sunset), phones straddling seams.
- **Structured**: lowercase two-weight headline, a different crop/device every slide, one sparkle each.
- **Monarch**: orange small-caps eyebrow + serif with italic phrase, cream; one off-colour people slide.
- **NordVPN**: giant one-word headline (~18 %) over a light second line; composition changes every slide.
- **Opal**: headline built from the user's own result ("Get back 1h23m every day"); ratings s1, award s2.
- **MyFitnessPal / Cronometer**: a real-world photo (hand + food) with scan brackets and data pills as the hero.

## Rules derived (added to skill/references/design.md)
1. Default to the majority grammar (framed phone, headline on top, 6–12 % headline, one lift per slide) and spend boldness on ONE system that ties the set: a path/line through all slides, a colour per slide, a mascot, or a continuous stage.
2. Slide 1 is different from the rest in ~1/3 of top sets (bigger headline, spread, photo, proof). The rest is calm and consistent.
3. A giant number or the user's own result as the headline is a strong hero when the app has one ("+82 points", "1h23m", "$200").
4. Proof on slide 1 only with real numbers; otherwise use the space for the promise.
5. One element per slide that is clearly bigger than the phone's UI (lifted card, giant word, prop) is what reads at thumbnail size.
