# Copy

## Rules
Distilled from 14 screenshot skills and expert guides (see the tool repo's docs/research).
1. **Headline = outcome, subtitle = mechanism.** The headline says what changes for the user; the subtitle says how the app does it.
2. **Two levels only, no other text.** Headline exactly 2 lines with a manual break (`\n` in copy JSON), one accent segment (`*…*`); subtitle exactly 1 line. No eyebrows, labels or chips.
3. **One idea per headline.** No "and" joining two claims.
4. **Never repeat text that is visible on the screen** below it. The UI shows "Glass · Tomorrow"; the headline says why that matters.
5. **Cut words, never shrink.** If a line doesn't fit at the set's headline size, rewrite it. `storeshots check` warns when a headline had to shrink.
6. **Verb or a concrete moment first** where it fits; second person, everyday words; informal "you" where the language has a formal one.
7. **Plain searchable words** from the listing (app name, subtitle, keywords) in slides 1–3 where natural; never stuffing.
8. **Never:** prices, "free", "best", "#1", "new", exclamation marks, questions in headlines, hype words (innovative, revolutionary, powerful, seamless, smart), "Download now", competitors, other platforms.
9. **Tests before layout:** (a) 1-second test at arm's length; (b) cover-the-UI test: read only the headlines in order: they must tell a story, not list features, and shuffling them must break it; (c) competitor test: if the line still works with another app's name, make it more specific.
10. **Name what the screen proves.** A number, a place or a named feature beats a generic verb: "41 games, 4 skills" over "Pick your next game", "Fiord czy Paryż?" over "Wybierz swój widok". Check each headline against its capture: it must not promise more than the screen shows. Slide 1's headline must not repeat the app's subtitle, which search prints right above the screenshots.
11. Write a copy deck first (`store/copy-deck.md`): per slide three options (moment / outcome / pain), the choice and why. Lock it before designing.

## Formulas by slot
- Hero: `[outcome], without [pain]` · `No more [pain]` · `Your [noun], [benefit]` · `[verb] [noun]. [verb] [noun].`
- Differentiator: `Only [app] [does X]` · `No [pain]. No [pain]. Just [outcome].` · `Made for [person]`
- Feature: `[verb] [noun] in [time]` · `[thing] at a glance` · `Never [pain] again` · `From [before] to [after]` · `Right on your [surface]`
- Proof (true numbers only): `[number] [people] [verb] [app]` · `[rating] from [number] ratings`
- Closer: feature word list · big quiet statement · identity line.
- Deck arcs: benefit ladder (hero → differentiator → features → ecosystem → proof → closer), problem → solution, day in the life, numbers-led.

## Three approaches (offer one of each per slide)
| Type | What it does | Example |
|---|---|---|
| Paint a moment | You see yourself doing it | "Know tonight what goes out tomorrow" |
| State an outcome | Life after | "Never miss a collection" |
| Kill a pain | Name the problem, end it | "No more hunting for the schedule" |

## Subtitle
One line, 5–5.5 % of the width: the mechanism or a concrete detail that supports the headline ("The evening before, at 6 pm"). Drop it when the headline stands alone. Never repeat the headline.

## Weak → better
| Weak | Better | Why |
|---|---|---|
| Collection calendar | The whole year of collections in one place | outcome, not a screen name |
| Notifications and widgets | A reminder the evening before | one idea, concrete |
| AI chat assistant | Ask where old batteries go | a real moment |

## Language specifics (example: Polish)
- Prefer native words over anglicisms (Polish "przypomnienie", not "notyfikacja").
- Watch line length: Polish words are long; prefer short synonyms over shrinking the font.
- Diacritics must render (ąćęłńóśźż): `storeshots check` fails any character the design's font lacks.
- Sentence case, no trailing period in headlines.
- Typographic quotes „…”, the en dash and no one-letter words at line ends are set automatically; write plain quotes and hyphens.

## Other languages
Rewrite per market, don't translate literally. Short headlines grow 160–300% in translation, so leave room and let `data-fit` shrink to a floor; if it still doesn't fit, reword. CJK: fewer characters, native font. RTL (ar, he): mirror the layout, not the device image.
