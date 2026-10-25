# Store specs, review rules, upload


## Sizes (App Store, portrait)
| Device key | Canvas | ASC display type | Notes |
|---|---|---|---|
| `iphone-6.9` | 1320×2868 | `APP_IPHONE_67` | The one iPhone set to upload; smaller iPhones scale from it. There is no `APP_IPHONE_69`. |
| `ipad-13` | 2064×2752 | `APP_IPAD_PRO_3GEN_129` | Required only if the app runs on iPad. |
| `iphone-duo-outer`, `iphone-duo-inner` | 1398×2034, 2853×2007 | `APP_IPHONE_DUO` | One set for both displays, outer first, 10 at most between them. Capture each display by hand, then `storeshots import --device <id>`. |

Video and the rest of the product page (from App Store Connect's `/v1/appAssetLibraryRefData`):

| Device key | Canvas | Goes to | Video |
|---|---|---|---|
| `preview-iphone-6.9` | 886×1920 | app preview set `IPHONE_67`, 3 at most | 15–30 s, 23–30 fps, **audio track required** (silence is fine) |
| `preview-ipad-13` | 1200×1600 | app preview set `IPAD_PRO_3GEN_129` | same |
| `header` | 3840×1646 (21:9) | `PRODUCT_PAGE_HEADER_ASSET`, PNG only | 10–30 s, 30 or 60 fps, muted, loops |
| `search` | 3:2, 1920–3840 wide | `APP_STORE_SEARCH_RESULTS_ASSET`, PNG or JPEG | 15–30 s, 30 or 60 fps, muted, can't be unmuted |
| `event-card`, `event-details` | 16:9 1920–3840 wide, 9:16 1080–2160 wide | In-App Event card and details page | 15–30 s, 30 or 60 fps |

No alpha anywhere. Headers and search assets show on iOS 27 and later and are optional. They must fit a 4+ rating and carry no prices, web addresses, ©, unearned awards, Apple badges or other platforms' logos (`check` fails them).
1–10 screenshots per set per locale. PNG or JPEG, RGB, **no alpha** (enforced since July 2026). Order = upload order.

## App Review rules that bite
- 2.3.3 show the app in use; not only title art, login or splash.
- 2.3.7 no prices; no keyword stuffing or irrelevant terms.
- 2.3.8 everything fits a 4+ rating.
- 2.3.9 fictional data for accounts and people.
- 2.3.10 no other mobile platforms' names, devices or imagery.
- 2.3.2 say when a shown feature needs a purchase.

## Upload (App Store Connect API)
`storeshots upload` does all of this. Credentials (same variables as the `asc` CLI): `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY_PATH` (or `ASC_PRIVATE_KEY`), or `ASC_CONFIG=<json with key_id, issuer_id, key_path>`. Without `--confirm` it only returns the plan; sets whose remote checksums already match are left alone.

Screenshots belong to an **App Store version** and can only change while it is editable (`PREPARE_FOR_SUBMISSION`, `DEVELOPER_REJECTED`, `REJECTED`, `METADATA_REJECTED`). A version that is `READY_FOR_SALE` or `WAITING_FOR_REVIEW` is locked: new screenshots go with the next version. Creating a version (`POST /v1/appStoreVersions`) needs the user's OK. Custom Product Pages and Product Page Optimization treatments have their own screenshot sets and don't need a new build.

Flow per locale and display type:
1. `GET /v1/apps/{appId}/appStoreVersions?filter[platform]=IOS` → the editable version.
2. `GET /v1/appStoreVersions/{id}/appStoreVersionLocalizations` → localization for the locale (ASC codes: `pl`, `en-US`, `de-DE`…).
3. `GET /v1/appStoreVersionLocalizations/{id}/appScreenshotSets` → the set with the display type, or `POST /v1/appScreenshotSets` to create it.
4. Delete the old screenshots: `DELETE /v1/appScreenshots/{id}` for each.
5. For each file in order: `POST /v1/appScreenshots` `{fileName, fileSize}` + set relationship → PUT every `uploadOperations[]` byte range (no auth header, use the given headers) → `PATCH /v1/appScreenshots/{id}` `{"uploaded": true, "sourceFileChecksum": "<md5>"}`.
6. Poll `GET /v1/appScreenshots/{id}` until `assetDeliveryState.state` is `COMPLETE` (or `FAILED` → report).
7. `PATCH /v1/appScreenshotSets/{id}/relationships/appScreenshots` with the ids in order.

Canvases sharing a display type (the Duo's two) fill one set in `screenshots.json` order. App previews upload the same way: `appPreviewSets` (`previewType`), `POST /v1/appPreviews` `{fileName, fileSize, mimeType}`, the byte ranges, `PATCH` `{uploaded, sourceFileChecksum}`, then the order.

## Header, search results asset (`storeshots creative`)
Not screenshots: they live in the app's **Asset Library** and are placed on each localization.
1. `POST /v1/appAssetLibraryImages` or `…Videos` `{category: "CREATIVE_ASSETS", fileName, fileSize}` + `assetLibrary` (id = the app's id) → byte ranges → `PATCH {uploaded: true}` (no checksum attribute) → poll until the state leaves `AWAITING_UPLOAD`/`UPLOAD_COMPLETE`.
2. `POST /v1/appAssetLibraryPlacements` `{placementType, placementGroup: "DEFAULT_PROFILE"}` + `image`/`video` + `appStoreVersionLocalization`. One per placement type per localization: delete the old placement first.
3. Placed on an editable version, they are reviewed with it; sending them as review items as well fails with `BLOCKED_BY_EMBEDDED_REVIEW`. On the version on sale a placement needs an **approved** asset: send the assets alone (`reviewSubmissions` + `reviewSubmissionItems` with `appAssetLibraryImage`/`Video`), place after approval. At most two open review submissions per platform. A running product page optimization test blocks placements.

## In-App Events (`storeshots event`)
`appEvents` (referenceName, badge, purpose, priority, primaryLocale, deepLink, `territorySchedules`), `appEventLocalizations` (name ≤30, shortDescription ≤50, longDescription ≤120), media per localization as `appEventScreenshots` or `appEventVideoClips` with `appEventAssetType` `EVENT_CARD` / `EVENT_DETAILS_PAGE`. An event runs 31 days at most and shows up to 14 days early. It goes to App Review as a `reviewSubmissionItems` with `appEvent`; the feature it promotes must already be in the released app.

## Google Play (later)
Separate design variant, not a resize: frameless, 9:16 (1080×1920 min for featuring), ≥4 screenshots, text ≤20% of the image, no "best/#1/new/download now", feature graphic 1024×500. Upload via androidpublisher v3 `edits.images`.
