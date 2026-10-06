# Interview: settle the look with the user, in two short rounds

The set is made *with* the user, not one-shot. Taste shows up when people react to pictures, so
every question comes with a picture and a recommended answer, and the user answers with letters
or numbers. Keep each round to one message.

## Before round 1 (your homework, not questions)
- Read `store/brief.md` and, if it exists, `~/.storeshots/taste.md` (see below).
- Know the app: genre, audience, the 5–8 screens of the story, real colours (`app.accent`, the
  app's own palette: categories, tabs), whether it has a character, a brand font in the repo,
  real social proof (`storeshots proof`; downloads, press, non-Apple awards the user can confirm).
- Build the category board: `storeshots board --genres <genre> --country <market>,us` → letters A–H.
- Propose a style for the app (table below) and a full set: slides, layouts, pops
  (`storeshots elements`), proof slide.

## Round 1 (before any render), 4–6 questions
1. **Board**: which 2–3 sets feel right for this app, which feel wrong? (show the board)
2. **Style**: your proposal and one alternative, with why (the table). Atmosphere vs plain UI.
3. **Colour**: one colour for the set (default) or a colour per slide; a contrasting middle slide?
4. **Proof**: what true proof is there (rating ≥ 4.5 with enough ratings, downloads, press,
   a non-Apple award), on which slide? Quotes only those the user gives; you may suggest
   real App Store reviews, the user decides.
5. **Brand font**: if the repo has one, offer it for headlines (never automatic).
6. Anything the set must or must not show.

Each question: options, then `➡️` your recommendation. Wait for the answers.

## Render, then round 2 (on our own pictures)
- `storeshots style`, `build --design design/<style>.html`; for open choices render the
  options: `storeshots catalog style|layout --slides id|colours|accent|background`.
- Show the strip and the catalog sheets. Ask only about what is visible: which style row,
  which layout number on the weak slides, which pops, copy that reads wrong. Apply by number
  (`--pick`), rebuild, show again. Repeat until the user approves.

## Styles
| Style | Looks like | For |
|---|---|---|
| `atmosphere` | the app's own screens blurred into light; Opal, Mercury, Calm | weather, sleep, focus, health, photo, music |
| `poster` | bold flat colour, condensed heavy type, pill accents; Deepstash, Cash App | learning, consumer, utilities with energy |
| `soft` | pastel of the brand, light + heavy type; Structured, Tiimo | planners, habits, family, home, friendly utilities |
| `premium` | near-black with brand light from below, rim-lit phones; Copilot, Revolut | finance, travel, pro, security |
| `clean` | near-white, ink type, crisp shadows; Fantastical, Apple's own pages | productivity, tools, native-feeling apps |
| `editorial` | paper, serif headlines, an arch behind the phone | reading, journaling, wellness, food |
| `playful` | bright pastel, rounded black type, bubbles; Finch, Duolingo | kids, habits, pets, games (only with a real character) |
| `neon` | black + one acid colour, condensed uppercase; Ladder, Strava | fitness, sport, gaming, nightlife |

## Taste memory (a weak prior, not an oracle)
After each approved set, append 2–5 lines to `~/.storeshots/taste.md` (the user's, local,
never in a repo) and to the app's `store/brief.md`: what was chosen and rejected, with the
reason in the user's words, e.g. `2026-10-05 Sprout: chose soft over poster ("calmer");
rejected a colour per slide ("looks like a template")`.
Read it before round 1 to make better *first proposals*, nothing more: every app is new,
always show options and ask, never skip a round because the file "already says" something,
and never argue with the user using it. If a new answer contradicts the file, the answer wins
and the file gets the new line.
