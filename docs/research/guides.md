# Expert guidance on converting screenshots (research 2026-10-05)

Evidence labels: **[LIVE-A/B]** Apple PPO or real-store test · **[SIM-A/B]** vendor test on a simulated page (2016–2019) · **[PRE/POST]** before/after with confounds · **[SECONDHAND]** statistic seen only in reposts · **[EXPERT]/[VENDOR]** opinion, no data.

Headline finding: very little live-store evidence exists. Most "case studies" are old simulated tests; most stats are secondhand. Treat design rules as consensus, and test on live traffic (PPO) when it matters.

## What moved conversion
- Apple Tech Talk 110349 (developer.apple.com/videos/play/tech-talks/110349) [LIVE-A/B]: Simply Piano screenshot beat video +3.3% (430k impressions/variant); Angry Birds 2 evergreen beat seasonal +1.5%; Peak icon +8%. "Data often contradicts your hypothesis."
- Super Unlimited VPN, Sub Club Apr 2026 [LIVE testimony]: "80% of the time when we do AB tests, [modernised screenshots] lose" — users prefer what they're used to seeing.
- Apple CPP page [LIVE avg]: custom product pages +2.5 pp over the 1.6 % default conversion.
- SplitMetrics [SIM-A/B]: Prisma — captions on top, bolder, higher contrast, repeated text removed, social proof on frame 3 → +12.3 %; frame-1 caption "Turn every photo and video into art" → +19.7 %. OLBG feature bubbles → +45 %. Rovio portrait > landscape +13 %. ZiMAD Japan cultural adaptation +36 %.
- Incipia 2023: Keepsafe social-proof banner ("millions of people… a billion photos") won; 5miles captions + popular product UI beat generic branding.
- Missbeez 2019 [PRE/POST]: no video, 3–4-word value text on frames 1–2, panorama → +10 % search CVR, +36 % product page CVR.

## Hero and first frames
- Apple: without a video, frames 1–3 appear in search (portrait 3, landscape 1).
- WWDC26 session 205: new **Product Page Header** image/video is now the first visual element; creative assets can replace screenshots in search via Apple Ads/Today; CPPs can show a tailored asset per keyword → design header and screenshot 1 as a pair.
- [SECONDHAND] 60 % never scroll past the first impression; ~13 % scroll the gallery; < 30 % get past frame 3.
- Blake Crosley (Sep 2026, audit of 37 sets): frame 1 = purpose/point of view, frame 2 = proof or how it works, then the user journey; 23 of 31 captioned top sets lead with positioning, not a feature.

## Copy
- ≤ 8 words, second-person verbs, full stops; the caption enhances the visual, doesn't describe it (Crosley).
- 3–5-word headlines, larger type, real statistics, portraits of the target user (SplitMetrics/italki).
- Put the keyword you rank for on the screen (Ariel Michaeli, Appfigures); vague lines fail, match the targeted keyword (Steve P. Young). Caption OCR indexing is contested (Appfigures yes, Phiture/AppTweak no) → keyword-aware, never stuffed.
- Social proof: once, quantified, inside a frame (Keepsafe, Prisma); not a whole accolade frame (Apple).

## Visual
- No controlled tests isolate placement, size, frames or backgrounds (Crosley) — consensus only.
- Apple: real UI; no title art/login/splash (2.3.3); 4+ content (2.3.8); no other platforms (2.3.10); unmodified Apple device images; one dark-mode screenshot if supported; cohesive story in usage order.
- Prisma [SIM]: bigger, bolder, higher-contrast captions on top won.
- AppAgent: one message per frame; enlarge key UI so it reads at thumbnail size; "remove the text — is the message still clear?"; ~60 % of their wins came from major design changes.
- Familiar beats pretty (Super Unlimited): don't redesign for taste alone.
- Incipia 2017 top-100: realistic full devices correlate with rank (old, correlation).

## Category and localization
- WWDC26: outdoor → aspirational imagery; travel → destinations; games → gameplay/characters.
- AppTweak 2025: utilities → speed, ease, trust; lifestyle → aspirational, emotional; finance → credibility, security.
- Localize every market; adapt culturally, not just translate (ZiMAD, Phiture). Nothing Poland/CEE-specific with data.

## Process
- Apple: research → hypothesis → one variable per test → clearly different treatments → 7-day steps to 90 % confidence (≤ 90 days). Ideas: frame order, orientation, captions, seasonal vs evergreen, branding.
- WWDC25 328: assign keywords to CPPs (unique per page), no review needed; up to 70 CPPs.
- Incipia/Phiture: competitor audit on top-10 keyword searches; review mining (most useful + most recent) for the users' own words; usage data to pick features.
- Appfigures: one localized case needed 18 tests.

## Mistakes
Feature labels or vague slogans; too much / too small text; accolade or CTA frames; redesigning for looks and assuming a win; tiny tweaks or several variables per test; seasonal art; splash/login as frame 1; translating instead of adapting.

## Top 20 (by evidence)
1. Test on live traffic; taste is often wrong. 2. CPPs with unique keywords for search intents. 3. Video isn't automatically better. 4. Evergreen over seasonal. 5. One variable, clearly different, 7-day steps, 90 %. 6. Portrait for non-games. 7. Design the 2026 Product Page Header with screenshot 1. 8. Effort on frames 1–3. 9. Real UI, never splash/login. 10. No prices, accolade-only frames, other platforms; 4+. 11. Large bold high-contrast captions on top, no repeated text. 12. Frame-1 caption = core promise in the user's words. 13. Quantified social proof once, inside a frame. 14. Adapt culturally per market. 15. Ranking keyword/intent words in captions. 16. One message per frame, 3–8 words, second person, outcome first. 17. Positioning → proof → user journey. 18. Copy from reviews, competitor searches, usage data. 19. One dark-mode frame if supported. 20. Frames vs frameless, panoramas, colour, mascots: style choices — pick, keep consistent, test.

Sources: see the URLs inline; full agent notes in this session (2026-10-05).
