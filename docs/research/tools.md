# Existing screenshot tooling (research 2026-10-02)

Stars and last-push dates from the GitHub API on 2026-10-02.

## 1. Open-source / CLI composers

| Tool | What it does | Frames | Localization | Stars · push · license |
|---|---|---|---|---|
| [Koubou](https://github.com/bitomule/Koubou) | Python, YAML → PNG via Playwright HTML/CSS + Pillow, `kou live` hot reload | 243 Apple bezel PNGs (iPhone 17/Air, iPad Pro M4) | xcstrings, per-language assets | 208 · Aug 2026 · MIT |
| [asc CLI](https://docs.asccli.sh/commands/screenshots) | `screenshots capture/frame/upload/plan/apply`; framing via Koubou | via Koubou | multi-locale upload | 7.6k · today · MIT |
| [fastlane frameit](https://docs.fastlane.tools/actions/frameit/) | Framefile.json + title.strings, ImageMagick | Facebook set + iPhone 16/17 (v2.234.0) | .strings | 42k · active · MIT |
| [frames-cli](https://github.com/viticci/frames-cli) | Python batch framing, also screen recordings | Apple bezels **downloaded at runtime**, runs on Linux | n/a | 389 · 30 Sep · MIT |
| [open-screenshot-generator](https://github.com/dotnetdreamer/open-screenshot-generator) | Next.js/Tauri, 101 templates, CLI, MCP, videos, upload | ? | yes | 121 · 1 Oct · MIT |
| [appshot-studio](https://github.com/horusstudios/appshot-studio) | editor + Node CLI share one Playwright renderer, panorama sets | CSS | locale board | 4 · Jul · MIT |
| [PixelDeck](https://github.com/Pr0xS/PixelDeck) | Konva editor, YAML CLI via Playwright | canvas | own API key | 6 · 1 Oct · MIT |
| [appshot](https://github.com/chrisvanbuskirk/appshot) | JSON config, AI translation, MCP | bundled | OpenAI | archived Jul 2026 |
| [AppScreenshotKit](https://github.com/shitamori1272/AppScreenshotKit) | Swift macro renders SwiftUI views in tests | Apple bezel fetched by CLI | `.locale([...])` | 24 · Jul · MIT |

[Shipshots](https://shipshots.app/) is the only Satori-based one.

## 2. Agent skills / MCP

| Skill | What it does / clever part | Stars |
|---|---|---|
| [ParthJadhav/app-store-screenshots](https://github.com/ParthJadhav/app-store-screenshots) | Copies a Next.js editor into the app repo; **connected canvas**, each slide a crop; state in git-tracked JSON. SKILL.md: slide-role order, no same layout twice in a row, 3–5 words per line, mandatory 160px thumbnail test, mixed emphasis word, "background is never white", cross-screen composition rules. | 7.1k |
| [Goldie](https://github.com/kacperkapusciak/goldie) (Software Mansion) | Agent explores app, writes replayable **Argent** flows (iOS sim + Android emu, any framework), frames (skia), preview video, store-rule checks, studio. Layout keys: classic, copy-below, hero, offset, tilt, duo, panorama, minimal… Bezels CC BY 4.0 (Kelly Hu). **Assumes macOS host for iOS.** | 2.4k |
| [Adam Lyttle ASO skill](https://github.com/adamlyttleapps/claude-skill-aso-appstore-screenshots) | Benefit discovery from codebase (3–5 verb-led), rates captures Great/Usable/Retake, compose.py scaffold → Nano Banana Pro enhance (3 variants), first approved = style reference, resumable memory. | 1.8k |
| [asc-shots-pipeline](https://github.com/rorkai/app-store-connect-cli-skills/blob/main/skills/asc-shots-pipeline/SKILL.md) | JSON step plans (launch/wait/tap/screenshot) via AXe; per-simulator locale with `defaults write`; pins Koubou version. | 1.0k |
| [store-screenshots](https://github.com/LeeHueeng/store-screenshots) | HTML/CSS headless Chrome, CSS frames incl. Galaxy Fold/Flip; colors from colors.xml / xcassets / icon; copy approval before render; status bar 9:41. | 88 |
| [hypersocialinc/shots](https://github.com/hypersocialinc/shots) | GPT Image 2 panorama cut into slides; **redraws UI** (2.3.3 risk). | 241 |
| [aso-skills](https://github.com/Eronred/aso-skills) | 40+ ASO skills; screenshot-optimization writes a 10-slot brief, audits competitors. | 2.1k |
| [appstore-screenshot-template](https://github.com/rkdals0203/appstore-screenshot-template) | vision → editable template from a competitor's set | 0 |

## 3. Commercial SaaS feature bar
AppScreens, AppLaunchpad, Previewed, Screenshots.pro, LaunchShots, Hotpot, Rotato, Picasso, ScreenshotWhale ($10–50/mo):
templates + one-click restyle, panoramic backgrounds with devices crossing edges, frame styles (real/clay/outline/3D/frameless), AI translation 80+ languages incl. RTL, AI captions, export every size, direct upload to ASC and Play, CPP / A/B variants, CI API.

## 4. Device frames and licensing
- [Apple Design Resources](https://developer.apple.com/design/resources/): iPhone 18/17/16, iPad Pro M5 bezels. [License](https://developer.apple.com/support/downloads/terms/apple-design-resources/Apple-Design-Resources-License-20230621-English.pdf) §2A allows screenshots of your Apple-platform software; **§2B forbids embedding in software or redistributing** → download into a gitignored folder, never commit/publish.
- [Marketing guidelines](https://developer.apple.com/app-store/marketing/guidelines): bezels "as is" — no tilt, crop, shadows, 3D; copy beside the device; latest generation; "any simulation of an Apple product" prohibited (CSS iPhones break this on paper; no rejection reports found; many apps ship tilted devices).
- Redistributable: Kelly Hu's iPhone 17/17 Pro Figma frames, CC BY 4.0 (used by Goldie).
- Meta Devices: no repackaging/redistribution.
- Google Play discourages device imagery → go frameless on Play. No Android imagery in the Apple set (2.3.10).

## 5. AI approaches
1. Full generation (redraws UI) → 2.3.3 risk.
2. Hybrid (Lyttle): layout enhanced by model; final pixels from model; photorealistic iPhone conflicts with bezel rules.
3. Compliant: AI only for backgrounds/decoration/copy; real capture composited in code; vision-model QA.

## Ideas worth stealing
- Connected canvas: one wide HTML page per locale, crop each slide → panoramas for free.
- Turn Parth's rules into automatic checks (role order, no adjacent repeat layout, ≤5 words/line, 160px thumbnail render the agent must read).
- Brand auto-detect from xcassets / app.json / pubspec.yaml / colors.xml / icon.
- Lyttle's front end: benefits from codebase, capture rating Great/Usable/Retake, copy approval step, resumable state JSON.
- Capture on the Mac: JSON step plans, status bar 9:41, sequential per-locale runs.
- Output layout `{device}/{locale}/NN-slug.png`.
- Swappable frames: Apple PNGs local & gitignored, CC BY, CSS fallback, frameless for Play.
- Store-mode check before upload: exact size, no alpha, Play 20% tagline + banned words, no Android imagery in Apple set.
- AI only around the UI, never UI pixels.
- Live preview / watch mode; xcstrings import; competitor set → template.
