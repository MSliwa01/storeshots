# Store specs and upload APIs (research 2026-10-02)

## A. Apple App Store

Sources: [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) · [Upload previews and screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots) · [Release notes](https://developer.apple.com/help/app-store-connect/release-notes/)

### General rules
- 1–10 screenshots per display size per locale. Formats .png, .jpg, .jpeg.
- "Images can't include alpha channels or transparencies" (release notes, 8 Jul 2026).
- No documented max file size or color profile. Use flattened RGB, sRGB (convention, not a rule).

### iPhone and iPad sizes (landscape = swapped)

| Display | Accepted portrait px | Requirement / scaling | API `screenshotDisplayType` |
|---|---|---|---|
| iPhone Duo (new Sep 2026) | outer 1398×2034, inner 2007×2853 | upload "available later this year" | none yet |
| 6.9" (Air, 14–18 Pro Max, 15/16 Plus) | 1320×2868, 1290×2796, 1260×2736 | the main set in practice | **APP_IPHONE_67** |
| 6.5" | 1284×2778, 1242×2688 | required only if 6.9" missing; otherwise scaled from 6.9" | APP_IPHONE_65 |
| 6.3" | 1206×2622, 1179×2556 | scaled from 6.5" | APP_IPHONE_61 |
| 6.1" | 1170×2532, 1125×2436, 1080×2340 | scaled from 6.5" | APP_IPHONE_58 |
| 5.5" | 1242×2208 | scaled from 6.1" | APP_IPHONE_55 |
| iPad 13" | 2064×2752, 2048×2732 | required if app runs on iPad | **APP_IPAD_PRO_3GEN_129** |
| iPad 12.9" (2nd gen) | 2048×2732 | scaled from 13" | APP_IPAD_PRO_129 |
| iPad 11" | 1668×2420, 1668×2388, 1640×2360, 1488×2266 | scaled from 13" | APP_IPAD_PRO_3GEN_11 |

- Minimum for iPhone + iPad app: one 6.9" set + one 13" iPad set.
- There is no `APP_IPHONE_69` enum value (checked against OpenAPI spec v4.5 and fastlane).
- Mac 16:10 (1280×800 … 2880×1800), Apple TV 1920×1080 / 3840×2160, Vision Pro 3840×2160.

### App previews ([specs](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications))
Up to 3 per size per locale, shown before screenshots. 15–30 s, ≤30 fps, ≤500 MB. H.264 or ProRes 422 HQ. 886×1920 for iPhone, 1200×1600 for iPad. Processing up to 24 h.

### Review rules ([guidelines](https://developer.apple.com/app-store/review/guidelines/))
- 2.3.3: show the app in use, not merely title art, login page or splash. Text/image overlays OK.
- 2.3.4: previews only screen captures of the app.
- 2.3.7: no prices in screenshots/previews; no keyword stuffing.
- 2.3.8: 4+ rating content. 2.3.9: fictional account data. 2.3.10: no other mobile platforms' names/imagery.
- 2.3.2: say clearly when featured items need IAP.

### Screenshot captions and search: unconfirmed
- Appfigures (Jun 2025, [X](https://x.com/arielmichaeli/status/1933614317045493848)) claimed OCR indexing based on ranking movement.
- ConsultMyApp tested 64 phrases, 1 ranked without another explanation — "no strong evidence" ([post](https://www.consultmyapp.com/blog/-is-apple-now-indexing-screenshot-titles-on-the-app-store)).
- Apple's [search page](https://developer.apple.com/app-store/search/) lists only name, subtitle, keywords, categories. App Store Tags (US only) are LLM-built from metadata; at WWDC25 Apple said developers "shouldn't need to add keywords to the screenshots".
- Conclusion: write captions in plain searchable words, don't stuff, don't count on ranking.

### Custom Product Pages and PPO
- [CPP](https://developer.apple.com/app-store/custom-product-pages/): up to 70, own screenshots/previews/promo text, can be assigned keywords, deep links on iOS 18+, reviewed separately.
- [PPO](https://developer.apple.com/app-store/product-page-optimization/): up to 3 treatments, one test at a time, ≤90 days.
- API: screenshot sets also hang off `appCustomProductPageLocalizations` and `appStoreVersionExperimentTreatmentLocalizations`.

### 2026 changes
- iOS 27 "creative assets" ([what's new](https://developer.apple.com/app-store/whats-new/), [best practices](https://developer.apple.com/app-store/asset-best-practices/)): product page header image/video + search-result image/video that replaces the screenshot strip when provided. Managed in a new Asset Library; API promised, not in spec 4.5. Sizes from third parties: 3840×1646 header, 3840×2560 search, 5244×2950 universal.
- Apple says search results show "up to three screenshots or app previews", depending on orientation. Nothing official about Liquid Glass changing screenshot display.

## B. App Store Connect API

Sources: [Uploading assets](https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect) · [OpenAPI spec](https://developer.apple.com/sample-code/app-store-connect/app-store-connect-openapi-specification.zip)

| Purpose | Endpoint |
|---|---|
| List sets | `GET /v1/appStoreVersionLocalizations/{id}/appScreenshotSets?filter[screenshotDisplayType]=…` |
| Create set | `POST /v1/appScreenshotSets` (displayType + relationship to version localization / CPP localization / experiment treatment localization) |
| Reserve | `POST /v1/appScreenshots` `{fileName, fileSize}` + `appScreenshotSet` relationship |
| Commit / status | `PATCH` / `GET /v1/appScreenshots/{id}` |
| Delete | `DELETE /v1/appScreenshots/{id}`, `DELETE /v1/appScreenshotSets/{id}` |
| Reorder | `PATCH /v1/appScreenshotSets/{id}/relationships/appScreenshots` with ordered `data` |

Flow: reserve → PUT each `uploadOperations[]` byte range (no JWT, parallel OK) → PATCH `{"uploaded":true,"sourceFileChecksum":"<MD5>"}` → poll until `COMPLETE`/`FAILED`. Replacing = delete + upload again.

fastlane deliver: `overwrite_screenshots` deletes sets, uploads, skips duplicates by checksum, waits for COMPLETE, reorders by filename.

## C. Google Play

Sources: [Preview assets](https://support.google.com/googleplay/android-developer/answer/9866151) · [Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842)

| Asset | Requirements |
|---|---|
| Screenshots | JPEG or 24-bit PNG, no alpha. Sides 320–3840 px, long side ≤ 2× short side. Up to 8 per device type, ≥2 total to publish. |
| Phone, featuring-eligible | ≥4 screenshots, 9:16 ≥1080×1920 or 16:9 ≥1920×1080 |
| Tablet 7"/10", Chromebook | ≥4, sides 1080–7680, 16:9 or 9:16 |
| Wear OS | 1:1, ≥384×384, app UI only |
| Feature graphic | 1024×500, no alpha, key content centered |
| App icon | 512×512, 32-bit PNG, ≤1024 KB |

- Screenshots/feature graphic: "highly recommended" to avoid Best/#1/Top/New/Discount/Sale/Million Downloads, CTAs ("Download now"), device frames, fingers. Taglines ≤20% of image. Alt text ≤140 chars.
- A raw 1080×2400 capture (2.22:1) fails the 2:1 rule → compose to 9:16.

### Play Developer API ([edits.images](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.images))
- `POST …/applications/{pkg}/edits` → upload `POST https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{pkg}/edits/{editId}/listings/{lang}/{imageType}` → `POST …/edits/{editId}:commit`.
- `GET` same path lists, `DELETE` = deleteall, `DELETE …/{imageType}/{imageId}` removes one.
- imageType: `phoneScreenshots`, `sevenInchScreenshots`, `tenInchScreenshots`, `tvScreenshots`, `wearScreenshots`, `icon`, `featureGraphic`, `tvBanner`. No Chromebook/XR type.
- New optional `aiGeneratedState` upload parameter (revision 20261001).
- API upload cap 15 MiB.
