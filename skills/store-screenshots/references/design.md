# Design: what converts

Sources and numbers: the tool repo's docs/research (design.md, guides.md, library-us.md).

## Facts that drive every decision
- Search results show the first 3 portrait screenshots (only when there is no app preview video). About 60% of visitors decide there, in ~3 seconds. Slides 1–3 are an ad that must work without the rest.
- Each search thumbnail is ~115 pt wide on the phone. A headline under ~6% of the canvas width (80 px on 1320) is unreadable there. Top apps use 9–12% (120–160 px).
- Localized screenshots won +33–36% installs in published cases. Reusing Google Play images cost iOS 20–30%.
- Apple's own tests move conversion by single digits; only big differences show up. Don't polish details at the expense of the hook.

## Story (5–8 slides)
1. **Hero**: the main outcome over the most characteristic screen. The only slide many people see. Pick it by the app's ground:
   - The app's own scenery is the product (painted weather scenes, a garden that grows): a statement can open, a huge headline on that scenery and no phone. The scenery proves the claim.
   - Anything else (a utility on a plain ground, a game whose product is its play): open with the core result on real UI, large enough to read in search. A statement on a flat field or around a mascot proves nothing; on a utility it belongs on the closer, if anywhere.
2. **Differentiator**: what this app does that others don't.
3. **Top benefit** with its screen.
4–6. **More benefits**: one idea per slide, most important first (widgets, reminders, privacy, sync…).
- **Second to last (optional)**: trust ("Data from official council schedules", ratings strip).
- **Last**: breadth (feature wall of short words, or a mosaic of small screens), not another single feature.
Follow the order in which someone actually uses the app. Never lead with onboarding, settings, login, empty states or a splash. Slides 1–3 show three different screens and three different benefits (`check` warns when a capture repeats there).

## Plain by default
Real UI on the app's own ground is the default. Anything else on a slide (a texture, a mascot, a prop, a cut-out, cards lifted onto a scene) needs a reason in one sentence: what the slide fails to say without it. "Variety", "to fill space" and "the brief asked for the app's art" are not reasons. A rule an addition happens to satisfy does not make it look good: a faint texture made of the app's own art is still a texture.

These read as artificial in rated rounds, every time:
- A faint line-art texture (stars, orbits, doodles) laid over a flat ground. It reads as scratches.
- Small framed tiles cut out of a picker and floated, tilted, over a painted scene. Show the real picker on a zoomed phone instead.
- A mascot as the opener's hero when the mascot is not what people come for.
- A photo cut-out in a drawn or painted world, and props drawn next to UI.
- A frosted-glass card lifted with whatever was behind it.
- A ground that repeats the screen (the same painting behind the phone and inside it) or contradicts it (a cloud beside "clear sky"). Use another scene of the app's own art that matches the screen's weather and time of day, or the screen's own sky without its UI.
- Part of the ground peeking out from behind a phone or a card (a roof, a window). Move it fully clear or fully behind, or mirror the ground.

When a slide adds anything beyond real UI on the app's own ground, render two versions (with and without it, or two treatments) and let the user pick. Don't settle it alone: the user's eye has rejected additions that every rule and every reviewing model passed.

## Composition: a rhythm, not a template
Read `patterns.md` before designing: what strong reference sets do slide by slide, and the patterns they share. (These rules come from real design reviews: users rejected repeated phone layouts, effects placed by eye, duplicated UI and piles of pop-outs.)
- **Vary the composition, keep the language.** Palette, type, radii, rim, shadow and mascot style stay constant; phone size, tilt, placement and headline position change from slide to slide. The same phone layout on every slide looks cheap. Never repeat a composition on two neighbouring slides.
- **Spreads are an option for slides 1–2, never the default.** `"layout": "spread"` on slide 1 puts one phone across slides 1 and 2, tilted, with the second half shifted by the store's gap so it lines up. Search shows the first three slides side by side, so only 1–2 read as one picture. Slide 2 keeps its own headline and gets a job for its free corner (a lift, a widget, proof). The seam must not cut the headline or a hero number. Show the pair to the user and let them judge it; a spread that doesn't look designed is worse than none.
- **Lift one thing, big enough to read.** The element the headline names: a row, a notification, a number, a chip, a short card. 15 words at most, never a paragraph. Its biggest line must reach 3 % of the slide's width in capitals (aim 3.5–4 %) and every line 2 %; leave `size` out and the kit sizes it from its text. Body text in a full-width crop can't get there, so crop narrow or lift something with bigger type (numbers do best). One per slide (two only if they belong together). Upright, no rim, a soft shadow; it may be wider than the phone. Five lifted rows read as messy.
- **Mix in slides without a phone** (`"layout": "free"`): real widget and Live Activity renders as `art` with `"place": "float"`, real chat bubbles with the mascot, a feature wall, a before/after, a photo. Never invented UI.
- **Vary headline position**: top on most slides, bottom on one or two (phone hanging from the top edge, or a full-bleed picture).
- Effects placed by eye still read as random: every effect needs a reason you can say in one sentence (it is what the headline names, it is the mascot reacting).
- Look at real sets first (`storeshots refs`, or the iTunes Search API → `screenshotUrls`) and name the patterns you borrow in the design file's header comment.

## Layout patterns and when to use them
- **Caption on top + framed device below** (bleeding off the bottom): the default; safe for utilities (Things 3).
- **Device on top, caption below**: one contrast slide to break the rhythm.
- **Pop-out** (`.device > .pop`): a piece of the UI grows out of the screen past the bezel, when one panel *is* the benefit. It must cover its source or leave an empty slot (`data-leave`), never sit next to a visible copy of itself. One per slide, 5–20 % wider than the phone.
- **Lifts** (`slides[].pieces`, any style): one whole object of the screen lifted out as a card of its own, over its source and past the phone's edge. Never a slice through a row, a picture or a paragraph; never two on top of each other; at most two per slide, on a few slides of the set, not all. `storeshots elements` finds the boxes and marks the ones whose text is too small to lift; `check` fails crops that cut through content and warns about small text, long ones, and a crop a few pixels wider than its card (it carries a strip of the screen; crop that much tighter). With tesseract installed it also warns when a lift, a pop-out or art in front covers part of a word on the phone's screen or touches one: put it over a calm part of the screen or cover that text whole.
  In 208 top sets, a lift appears when the slide's claim is one state, event or number and one small element of the screen shows it (a row, a notification, a score, a chip). Lists, chat, dashboards and photo apps lift most (65–84 % of top sets). Maps, scenery, feeds and game boards get a tilted or zoomed phone instead, with at most an alert lifted over it. On a dark UI the lifted element needs a light or accent surface to separate.
- **Zoom** (`"layout": "zoom"` + `focus`): the phone 1.3–1.6× its size, moved sideways so one corner and two frame edges stay in view with background beside them, cut by the slide on the other two sides. At most two per set. Pick a focus of one to three large things (a big number, a widget, a map). A dense screen reads better with a lift than a zoom.
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
- A whole screen in a mid-size phone is unreadable in search results. Give each slide one readable hero: a pop, a cutout, a zoom, or a phone big enough that its main number or card reads at thumbnail size.

## Mascot rules
- The mascot needs a job or it goes: its own phone-less slide or the closer, the speaker of real UI it owns in the app (e.g. the chat assistant answering in real bubbles), or a part of the scene doing something (peeking over the phone at a game, `"place": "peek"`). Not decoration on a slide that is about something else (it reads as forced in).
- No character stickers beside phones. A character standing next to a phone reads as clip art. At most twice per set.
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
- [ ] Slides 1–3 show three different screens.
- [ ] Every addition beyond real UI (texture, mascot, prop, cut-out) has its one-sentence reason; the ground neither repeats nor contradicts the screen, and nothing peeks out from behind a phone or card.
- [ ] Nothing on the list of rejections in `~/.storeshots/taste.md` and `store/brief.md` came back.
- [ ] No two adjacent slides share a layout; at most one pop-out per slide.
- [ ] Cross-slide elements look deliberate in the strip and harmless in each PNG.
- [ ] Palette, type and spacing consistent across the set; text contrast ≥ 4.5:1.
- [ ] No prices, "#1/best/free", other platforms; content fits a 4+ rating.
- [ ] `storeshots check` passes with no errors.
