# Capture and demo mode

## The simulator host
- The iOS Simulator needs macOS + Xcode. On a Mac it runs locally; from Linux or another machine set `capture.host` in `screenshots.json` to `{"ssh": "<mac>"}` (or any wrapper command: `{"command": "my-wrapper ssh"}`), or export `STORESHOTS_HOST`. `storeshots doctor` verifies it.
- The shots simulator is created on first use: "iPhone 18 Pro Max Shots" (1320×2868) and "iPad Pro 13 Shots" (2064×2752). Install a **Release** build of the app there first (no debug overlays), e.g. `xcodebuild -scheme <S> -configuration Release -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max Shots' -derivedDataPath build` then `xcrun simctl install "iPhone 18 Pro Max Shots" build/Build/Products/Release-iphonesimulator/<App>.app`.
- One simulator at a time is enough; shut it down afterwards on machines with little RAM.
- The `status_bar --time` override only accepts ISO dates in the form `2026-01-13T09:41:00.000+0100` (not `Z` or `+01:00`); `storeshots capture` handles this.

## What `storeshots capture` does per shot
`simctl status_bar override` (9:41 with the host's date, wifi 3, cell 4, battery 100 not charging) → `simctl ui appearance` → `simctl launch --terminate-running-process <bundle> -AppleLanguages (<lang>) -AppleLocale <locale> <capture.args> <shot.args>` → sleep `wait` → `simctl io screenshot` → copied back to `output/raw/`.
Launch arguments change only the app's language; system UI (alerts, keyboard) stays in the simulator's language. The demo mode must make sure no system UI appears.

## Demo mode contract (implement in the app)
Launch arguments land in `UserDefaults` (iOS) for the app process:
- `-DemoMode YES` → demo mode on. Off in every normal launch.
- `-DemoScreen <id>` → open this screen directly (tab, navigation, sheet) without UI driving.
- Optional `-DemoDate 2026-10-14` → fixed "today".

Demo mode must:
- Use seeded, realistic, local data (local street names, real-looking dates in the target market), bundled in the app, no network.
- Use an isolated store (in-memory or a separate UserDefaults suite), never the user's real data.
- Skip onboarding, paywalls, rating prompts, permission requests (notifications, ATT, location), tips, announcements, telemetry, push registration.
- Fix the clock where screens show dates, consistent with any widget or notification art used in the set.
- Disable animations or wait them out; no spinners or skeletons at capture time.

### SwiftUI
```swift
enum DemoMode {
    static let isOn = UserDefaults.standard.bool(forKey: "DemoMode")
    static let screen = UserDefaults.standard.string(forKey: "DemoScreen")
}
```
Branch at the `@main` App: build the store with demo dependencies (bundled data provider, `UserDefaults(suiteName: "demo")` cleared on launch), select the tab/sheet from `DemoMode.screen` via the app's router. Chat screens: inject a canned conversation into the view model. `UIView.setAnimationsEnabled(false)` under demo mode.

### Expo / React Native
iOS: `Settings.get('DemoMode')` from `react-native` reads the same launch arguments. Route with the navigation container's `initialState` or a deep link handled at startup. Seed state before the first render. Release build only (no LogBox, no dev menu).

### Flutter
Read launch arguments through a small platform channel or `--dart-define` builds for screenshots; route with `initialRoute`. Capture from outside (simctl) so the status bar is real.

## Rating captures
- **Great**: populated, meaningful, local data; the benefit is visible at a glance; nothing distracting.
- **Usable**: right screen, but sparse data, awkward scroll position or a dull state.
- **Retake**: empty states, spinners, alerts, debug UI, wrong language, placeholder text.
Fix the demo data or routing and recapture until every shot is Great.

## Widgets, Live Activities, notifications
Home-screen widgets and Live Activities can't be placed by simctl. Render their SwiftUI views to PNG in a unit test (`ImageRenderer`, scale 3, the card only with transparent corners) **with exactly the demo data and date the app screens use**, otherwise the set contradicts itself (the phone says "glass tomorrow" while the widget says "bio tomorrow"). Write the PNGs to a folder from an environment variable, run only that test on the simulator host:
```bash
TEST_RUNNER_STORE_SHOTS_DIR=/tmp/<app>-store-shots xcodebuild test -scheme <S> \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max Shots' -only-testing:<Tests>/StoreScreenshotRenderTests
```
then copy them into `store/design/art/` and place them in the design like any image.
