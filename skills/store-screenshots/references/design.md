# Design: what converts

Sources and numbers: the tool repo's docs/research (design.md, guides.md, library-us.md).

## Facts that drive every decision
- Search results show the first 3 portrait screenshots (only when there is no app preview video). About 60% of visitors decide there, in ~3 seconds. Slides 1–3 are an ad that must work without the rest.
- Each search thumbnail is ~115 pt wide on the phone. A headline under ~6% of the canvas width (80 px on 1320) is unreadable there. Top apps use 9–12% (120–160 px).
- Localized screenshots won +33–36% installs in published cases. Reusing Google Play images cost iOS 20–30%.
- Apple's own tests move conversion by single digits; only big differences show up. Don't polish details at the expense of the hook.

## Story (5–8 slides)
1. **Hero**: the main outcome over the most characteristic screen. The only slide many people see.
2. **Differentiator**: what this app does that others don't.
3. **Top benefit** with its screen.
4–6. **More benefits**: one idea per slide, most important first (widgets, reminders, privacy, sync…).
- **Second to last (optional)**: trust ("Data from official council schedules", ratings strip).
- **Last**: breadth (feature wall of short words, or a mosaic of small screens), not another single feature.
Follow the order in which someone actually uses the app. Never lead with onboarding, settings, login, empty states or a splash.

## Composition: a rhythm, not a template
Read `patterns.md` before designing: what strong reference sets do slide by slide, and the patterns they share. (These rules come from real design reviews: users rejected repeated phone layouts, effects placed by eye, duplicated UI and piles of pop-outs.)
- **Vary the composition, keep the language.** Palette, type, radii, rim, shadow and mascot style stay constant; phone size, tilt, placement and headline position change from slide to slide. The same phone layout on every slide looks cheap. Never repeat a composition on two neighbouring slides.
- **Spreads are optional and hand-made.** Two slides as one picture (one big phone or a cascade across the seam) only when it is designed as a pair, with each slide's empty space given a job. A phone pushed sideways just to cross a seam leaves a dead wedge beside it; the built-in layouts keep every phone inside its slide.
- **Lift one thing, subtly.** The element the headline names, 5–20 % wider than the phone, level with its source, flat unless the phone itself is in 3D. One per slide (two only if they belong together). Five lifted rows read as messy. Let contrast do the work (thin rim + soft shadow); no glow on everything.
- **Mix in slides without a phone**: real widget / Live Activity renders, real chat bubbles with the mascot, a feature wall, a before/after, a photo. Never invented UI.
- **Vary headline position**: top on most slides, bottom on one or two (phone hanging from the top edge, or a full-bleed picture).
- Effects placed by eye still read as random: every effect needs a reason you can say in one sentence (it is what the headline names, it is the mascot reacting).
- Look at real sets first (`storeshots refs`, or the iTunes Search API → `screenshotUrls`) and name the patterns you borrow in the design file's header comment.

## Layout patterns and when to use them
- **Caption on top + framed device below** (bleeding off the bottom): the default; safe for utilities (Things 3).
- **Device on top, caption below**: one contrast slide to break the rhythm.
- **Pop-out** (`.device > .pop`): a piece of the UI grows out of the screen past the bezel, when one panel *is* the benefit. It must cover its source or leave an empty slot (`data-leave`), never sit next to a visible copy of itself. One per slide, 5–20 % wider than the phone.
- **Frameless full-bleed screen** (`.screen`): when the UI explains itself (Duolingo).
- **Cross-slide element**: one per 5+ slide set, at most two in 8–10. A shape, a path, a gradient, a phone corner crosses a seam by 10–30%; never text, faces, numbers or key UI. Each PNG must still read alone.
- **Floating chips**: small cards with real values from the app (a date, a count, a fraction name) next to the phone. Tell the story without more copy.
- **Social proof as a strip** on the hero only (rating, press); never a whole slide.
Never use the same layout twice in a row. Use 1–2 inverted (dark/light) slides for rhythm in a long set. Break the phone parade every 2–3 slides.

## What top apps ship (189 top US sets, 2026)
- Majority grammar: framed phone (~64 %), headline on top (~80 %), headline 6–12 % of width (~70 %), one lifted element per slide (~45 % use lifts, almost always one), one background for the set (~70 %).
- The best sets keep that grammar and spend boldness on ONE system tying the slides: a continuous stage or path (RISE sunset, Norton dotted path, EveryDollar line), a colour per slide (Cash App, Daylio, Mercury), or a mascot (Finch, Waterllama, Headspace).
- About a quarter use a spread (mostly slides 1–2) and a quarter have at least one slide without a phone.
- Strong heroes: a giant number or the user's own result ("1h23m", "+82 points"); real proof only.
- Evidence: live tests are rare and redesigns for taste often lose; bigger, bolder, higher-contrast captions on top and a frame-1 caption with the core promise in the user's words are the best-supported rules.

## Legibility rules (small text reads as slop)
- Headline 11–12 % of the width, weight 800–900, line-height ≤ 1.0, **the same size on every slide**.
- Subtitle 5–5.5 % of the width, weight 700–800, ≥ 90 % opacity, one line.
- **Nothing outside the phone below 4 % of the width** (`storeshots check` fails it), aim ≥ 5 %. If a text can't be that big, delete it. Real UI inside the phone is exempt, which is exactly why the one lifted element must be the part that matters.
- At most 3 text levels and 4 lines of copy per slide.
- Check `output/review/*-strip.png` (≈ 200 px per slide, red line after slide 3): every headline must be readable there.

## Mascot rules
- The mascot needs a job or it goes: its own phone-less slide, the speaker of real UI it owns in the app (e.g. the chat assistant answering in real bubbles), or a die-cut sticker bridging copy and phone. Not decoration on a slide that is about something else (it reads as forced in).
- At least ~380 px tall on its own slide; never in the headline zone or over UI that must be read; never clipped partway.
- Ground it: an elliptical cast shadow under a standing character (10–25 % black, 60–80 % of its width). Floating with only a drop shadow reads as pasted in.
- Use the highest-resolution original art; never upscale a 512 px asset beyond ~40 % of the width.

## Typography and colour
- One emphasis per headline (`*word*` → `<em>`): colour or weight, not both.
- One typeface family, max two weights for display. A font that covers every glyph of the target language.
- Contrast ≥ 4.5:1 for all text against whatever is behind it.
- Background is a designed surface, never plain white: brand colour, deep tone, gradient, or the app's own imagery blurred.
- One brand hue (from the icon) + one accent + neutrals. Consistent across the set; colour per slide only with an identical layout system.
- Safe margins: text ≥ 7% from edges. Nothing important in the outer 3%.
- Density inside the phone, sparsity outside: one headline, one optional subtitle, one optional accent.

## Apple vs reality
Apple's marketing guidelines say bezels "as is" (no tilt, no 3D, no shadows); top apps tilt anyway and nothing gets rejected for it. Default to upright bezels with a soft drop shadow; tilt only when the direction calls for it and the user likes it.

## Directions (checkpoint 3)
Make 2–3 directions that differ in kind, not in shade, e.g.:
- **Calm utility**: brand colour field, upright framed phone, big headline, one chip.
- **Bold poster**: saturated background, oversized cropped phone, very large type, cross-slide shape.
- **Product-photo**: dark premium surface, light glow from the app's colours, phone with a strong shadow, pop-out zoom.
Ground each in the app's world (its subject, materials, vocabulary), not in generic SaaS style. Avoid templated tells: identical rounded cards everywhere, the same grey shadow on everything, all-caps eyebrows on every slide, decorative gradients with no reason.

## Review checklist (run on the sheet and the search mock before showing the user)
- [ ] Slide 1 alone says what the app is and why, in one second; slides 1–3 work as a trio in the search mock.
- [ ] Every headline is readable in the search mock (thumbnail ~128 pt wide).
- [ ] One idea per slide; headline 3–6 words, max 2 lines; no feature lists.
- [ ] Every slide shows real UI with populated, local data; 9:41; no alerts or debug UI.
- [ ] No two adjacent slides share a layout; at most one pop-out per slide.
- [ ] Cross-slide elements look deliberate in the strip and harmless in each PNG.
- [ ] Palette, type and spacing consistent across the set; text contrast ≥ 4.5:1.
- [ ] No prices, "#1/best/free", other platforms; content fits a 4+ rating.
- [ ] `storeshots check` passes with no errors.
