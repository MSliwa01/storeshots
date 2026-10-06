# Beautiful and converting App Store screenshots (research 2026-10-02)

Labels: **[A]** Apple docs/tests, **[B]** named case study, **[C]** vendor figure without method, **[D]** own measurement (first 4–6 US screenshots of 10 top apps via iTunes API). storemaven.com was taken over; Storemaven links point to web.archive.org.

## 1. Conversion facts
- Up to 10 per language. First 1–3 show in search results **only without an app preview**: 3 portrait, 1 landscape [A] ([product page](https://developer.apple.com/app-store/product-page/)). Frames 1–3 = an ad that must work alone.
- ~60% decide from the first view without scrolling; ~3 s to say what the app does. Reusing Google Play images cost 20–30% of iOS installs [B] ([Storemaven archive](https://web.archive.org/web/2022/https://www.storemaven.com/academy/increase-app-conversion-rate/)).
- Video autoplays muted [A]. Avg watch 4–6.5 s [B]. Simply Piano did +3.3% **without** video in Apple's test [A] ([Tech Talk 110349](https://developer.apple.com/videos/play/tech-talks/110349/)). Ship static first.
- Portrait for non-games [B].
- Apple's published A/B tests moved conversion single digits; named case studies 12–61% [B]; "+18–40%", "panoramic +30%" have no method [C] ([Crosley](https://blakecrosley.com/blog/app-store-screenshots-sell-the-why)). Test big differences.

## 2. Captions
- 3–6 words, ≤2 lines. 30/31 captioned sets used ≤8 words; 29/31 caption on top ([Crosley](https://blakecrosley.com/blog/app-store-screenshots-sell-the-why)). SplitMetrics uses 3–5-word headlines [B].
- Benefit/outcome, not feature. Verb or a number first (Opal: "Get back 1h23m every day"). Second person. Add something the screen doesn't already say.
- Keyword in a heavier weight (Opal, Structured, Headspace).
- Search indexing unconfirmed (see specs.md). Plain searchable words, no stuffing.

## 3. Layout patterns
Two schools: **Apple-minimal** (uniform template, UI carries it) and **award-winner poster** (varied, bolder) [D]:
- Framed device + caption on top — *Things 3* (single blue bg, identical template). Safe for utilities.
- Poster first frame — *Flighty* (headline + illustration + awards, then NYT quote + tilted phone). Never title-art on all of 1–3 (2.3.3).
- Panorama — *Structured* (one tilted phone spans 1–2), *Copilot* (pills cross edges). Each slice must work alone.
- UI pop-out (panel enlarged beyond phone) — *Headspace*, *Opal*, *Copilot*, *Flighty*. One per frame, only when the panel is the benefit.
- Frameless full-bleed UI — *Duolingo* (colored button-like caption at bottom, color per frame).
- Lifestyle / mascot / Watch — *Gentler Streak* (hand, mascot, privacy frame), *Bear* (color per frame + illustration).
- Social proof as a strip, not a frame — *Opal* (4.9★/150K), *Gentler* (BGR), *Structured* (Forbes). Apple: don't spend a full screenshot on accolades [A].
- Dark reads premium (Opal, Copilot, Flighty); light for playful/planning (Structured, Things, Duolingo).

## 4. Typography and color
- Headline ≈ **9–12% of canvas width** (120–160 px on 1320) — Opal, Copilot, Gentler, Structured, Bear [D]. Things ~6% (80 px) = floor.
- Search result screenshot ≈ 115 pt wide → 1 pt ≈ 11.5 px → 130 px headline ≈ 11 pt (smallest readable per HIG).
- Bold/black weights only; one typeface, ≤2 weights. Contrast ≥4.5:1.
- Focal point centered, inside a safe area [A] ([asset best practices](https://developer.apple.com/app-store/asset-best-practices/)); text ≥~7% from edges.
- One background hue from the icon, one accent, neutrals; consistent across the set [A]. Color-per-frame only with an identical layout system.
- Realistic populated data, 9:41 full battery, current device frames; one dark frame if Dark Mode supported [A].

## 5. Localization
- Apple asks to localize screenshots for every supported language [A].
- FiftyThree captions-only: **+33%** installs in China [B] ([case](https://splitmetrics.com/cases/fiftythree-localizes-screenshots-for-app-store/)). ZiMAD Japan-adapted design: **+36%** [B] ([case](https://splitmetrics.com/cases/zimad-app-store-screenshots-localization/)).
- No public test isolates localized in-app UI; do it anyway (local names, currency, dates).
- Short headlines grow **160–300%** when translated ([W3C](https://www.w3.org/International/articles/article-text-size)). Rewrite per language; re-wrap or shrink to a floor.
- CJK: PingFang / Hiragino / Apple SD Gothic Neo, fewer characters.
- RTL: mirror layout, right-align captions; don't flip the device image ([RTL HIG](https://developer.apple.com/design/human-interface-guidelines/right-to-left)).

## 6. Anti-patterns
Rejected: only title art/login/splash (2.3.3), prices (2.3.7), other platforms (2.3.10), non-4+ content (2.3.8), wrong size, alpha.
Discouraged but shipped: Apple award badges; tilted/cropped/3D Apple devices (Flighty, Structured, Opal, Headspace ship them).
Hurt conversion: thumbnail-size text, >2 lines, feature lists, settings/onboarding/empty states, debug status bars, random light/dark mixing, reused Play images, seasonal/dated art.

## 7. Order, CPP, testing
1. Point of view / outcome over hero UI. 2. Proof or how it works. 3. Top benefit. 4–6. More benefits & differentiators (privacy, widgets, Watch, sync). Last: breadth or CTA. Follow real usage order [A].
- PPO: ≤3 variants, one test, ≤90 days, 90% confidence, 7-day steps; screenshot-only tests need no build [A]. Indies: test the frame-1 hook.
- CPP: ≤70, assignable keywords (each keyword set to one page) [A]. One page per search intent with matching frame 1. Apple's "+156%" is for paid/linked traffic.

## Checklist
- [ ] 6.9" 1320×2868; RGB, no alpha; 1–10 images.
- [ ] Portrait unless landscape game with video.
- [ ] Frame 1 alone says what and why; frames 1–3 work as a set.
- [ ] Captions 3–6 words, ≤2 lines, on top, benefit-first, keyword heavier.
- [ ] Headline 9–12% of width; ≥6% floor; contrast ≥4.5:1; bold+.
- [ ] One typeface, ≤2 weights; brand hue + one accent; same template system.
- [ ] Real UI, populated data, 9:41, current device frame.
- [ ] ≤1 pop-out per frame; panorama slices readable alone.
- [ ] Proof as a strip; no Apple award badges for zero risk.
- [ ] One dark frame if supported; no prices, other platforms, dates.
- [ ] Per language: rewritten headline, 2–3× width headroom, native CJK font, mirrored RTL, localized in-app data.
- [ ] No video until a test proves it.
- [ ] CPP per keyword intent; one PPO test at a time.

## Prior-art copy rules (ParthJadhav SKILL.md)
- One idea per headline, never "and". Short common words. 3–5 words per line. Intentional line breaks.
- Three approaches: paint a moment / state an outcome / kill a pain — propose 3 options per slide.
- Narrative arc: #1 hero/main benefit, #2 differentiator, #3 ecosystem (widgets/watch), #4+ core features, 2nd-to-last trust signal, last feature wall or phone mosaic.
- Never the same layout twice in a row; 1–2 inverted (dark) slides; mix ≥2 framings (bezelless / tilted / full bezel).
- Background is a designed surface, never plain white. Headline occupies top 30–40%. One emphasis word per headline. At least one decorative accent (chips with real stats, sparkles, badges). Density inside the phone, sparsity outside. Break the phone parade every 2–3 slides.
- Cross-screen: one moment for 5+ slides, max two for 8–10; 10–30% of a non-critical visual crosses the seam; never split text/UI/faces.
- Thumbnail test at ~160 px wide before export.
