# Capturing clean raw screens (research 2026-10-02)

Checked against a live Mac (read-only `simctl`/`devicectl --help` over SSH). **verify** = not confirmed.

## 0. The test Mac (as of 2026-10-02)
- Xcode 27.0, macOS 27.0.1, only the iOS 27.0 runtime, **8 GB RAM** → one simulator at a time.
- Only simulator: iPhone 17 Pro. Screenshot devices must be created:
  - iPhone 17 Pro Max / 18 Pro Max: **1320×2868** (@3x); iPhone Air 1260×2736 (also accepted for 6.9")
  - iPad Pro 13-inch (M5/M4): **2064×2752** (@2x)
- **Xcode 27 removed Simulator.app (Device Hub instead).** `open -a Simulator` fails; `expo run:ios` fails with "Can't determine id of Simulator app" ([expo#46671](https://github.com/expo/expo/issues/46671)). `simctl` works headless ([Bitrise](https://bitrise.io/blog/post/wwdc-2026-device-hub-and-what-it-means-for-ci-cd)).
- maestro, fastlane, flutter not on the non-interactive SSH PATH.

## 1. iOS Simulator commands
```sh
UDID=$(xcrun simctl create Shots-17PM com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max com.apple.CoreSimulator.SimRuntime.iOS-27-0)
#  iPad: com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB
xcrun simctl bootstatus $UDID -b
xcrun simctl status_bar $UDID clear
xcrun simctl status_bar $UDID override --time "2007-01-09T09:41:00+01:00" \
  --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 \
  --operatorName '' --batteryState charged --batteryLevel 100
# Xcode 27 alternative: xcrun devicectl device simulate statusBar preset --device $UDID screenshot
xcrun simctl ui $UDID appearance dark            # or light
xcrun simctl ui $UDID content_size large
SIMCTL_CHILD_TZ=Europe/Warsaw xcrun simctl launch --terminate-running-process $UDID com.me.app \
  -DemoMode YES -DemoScreen stats -AppleLanguages "(pl)" -AppleLocale pl_PL
xcrun simctl io $UDID screenshot --type=png --mask=ignored out/pl/iphone/02_stats.png
```
- `--time` ISO strings were rejected on Xcode 26.1 ([ControlRoom#205](https://github.com/twostraws/ControlRoom/issues/205)) → **verify on 27**. If the iPad date won't change, paint over it in compose.
- Overrides are lost on reboot; reapply after every boot.
- `--mask=ignored` (no alpha corners).
- Launch args change only the app. System UI (alerts, keyboard, share sheet, iPad date) needs `simctl spawn $UDID defaults write -g AppleLanguages -array pl` + `-g AppleLocale -string pl_PL` + reboot.
- iPad panel native orientation is landscape → check PNG dimensions.

## 2. fastlane snapshot
Maintained (2.236.0 Jun 2026 fixed simulator-UDID destinations; up to 2.240.x). Needs an XCUITest target + SnapshotHelper. iOS 26 TabView: tab accessibility identifiers broken on iPhone → query by label/index. Xcode 27 untested (**verify**). Alternative: plain XCUITest `XCUIScreen.main.screenshot()` + `xcrun xcresulttool export attachments`.

## 3. SwiftUI render-to-image vs simulator
- ImageRenderer: blank/partial for UIKit-backed views (List, ScrollView, TextField, Map); no status bar.
- swift-snapshot-testing: Liquid Glass comes out transparent; workaround has pixel inaccuracies.
- SnapshotPreviews / Prefire / `xcrun mcpbridge` RenderPreview: regression testing, not marketing.
- **Verdict: real simulator** (glass, materials, safe areas, Dynamic Island, keyboard, status bar).

## 4. Demo data + routing (code in each app)
- `DemoMode` launch arg (`UserDefaults.standard.bool(forKey: "DemoMode")`): seeded in-memory store, fixed clock, seeded randomness, bundled images; skip onboarding/paywall/review/ATT/debug overlays.
- `DemoScreen=<id>` router: set tab, NavigationPath, sheet at launch → deterministic, no UI driving.
- Disable animations: `UIView.setAnimationsEnabled(false)` + `.transaction { $0.animation = nil }`; short sleep before capture.
- Keyboard shots: `@FocusState` in `onAppear` under demo mode.
- Deep links via `simctl openurl` may show "Open in…?" (**verify**); launch args avoid it.

## 5. React Native / Expo, Flutter
- RN/Expo: Release build (no LogBox/dev menu). On Xcode 27 use `expo prebuild` + `xcodebuild`, not `expo run:ios`. iOS: `Settings.get('DemoScreen')` reads launch args; Android: `am start … --es DemoScreen stats` + `react-native-launch-arguments`. Maestro is Expo's standard E2E tool. Expo **web** capture doesn't render native UI (it only works for apps whose UI is a custom canvas scene).
- Flutter: integration_test `binding.takeScreenshot` (in-app, probably no real status bar — **verify**); alchemist for goldens; Patrol 4.x for native dialogs. Prefer a launch-arg/deep-link router + external capture.

## 6. Android
```sh
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 -e mobile show -e datatype none -e level 4
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false
for s in window_animation_scale transition_animation_scale animator_duration_scale; do adb shell settings put global $s 0; done
adb exec-out screencap -p > shot.png
```
Locale: `adb shell cmd locale set-app-locales <pkg> --locales pl-PL` (Android 13+, **verify**). Raw 1080×2400 breaks Play's 2:1 rule → compose to 9:16.

## 7. Maestro
Apache-2.0 CLI (Cloud not needed). iOS simulators + Android emulators from the same YAML; no physical iOS. For iOS run it on the Mac over SSH and rsync PNGs back. `launchApp: {clearState: true, arguments: {DemoMode: "YES", DemoScreen: stats}}`, `setDarkMode`, `takeScreenshot`. Doesn't set the status bar → `simctl status_bar` first.

## Recommendation
- Shared iOS step: SSH-driven script on the Mac, sequential loop device × locale × appearance × screen: boot → (system locale + reboot only if system UI visible) → status bar → appearance → `simctl launch` with demo args → sleep → `simctl io screenshot --mask=ignored` → rsync to Linux → compose on Linux.
- SwiftUI: launch-arg router + seeded in-memory data + fixed clock; no UI tests.
- Expo/RN: Release build + same router; Maestro on the Mac only for interactive screens.
- Flutter: router or Maestro on Semantics labels; capture externally.
- Android: emulator demo mode + `adb exec-out screencap`, shared Maestro flows, compose to 9:16.
- agent-device / ios-device is fine for ad-hoc shots; the scripted simctl loop is what makes it reproducible.
