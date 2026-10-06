# Store specs, review rules, upload


## Sizes (App Store, portrait)
| Device key | Canvas | ASC display type | Notes |
|---|---|---|---|
| `iphone-6.9` | 1320×2868 | `APP_IPHONE_67` | The one iPhone set to upload; smaller iPhones scale from it. There is no `APP_IPHONE_69`. |
| `ipad-13` | 2064×2752 | `APP_IPAD_PRO_3GEN_129` | Required only if the app runs on iPad. |
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

## Google Play (later)
Separate design variant, not a resize: frameless, 9:16 (1080×1920 min for featuring), ≥4 screenshots, text ≤20% of the image, no "best/#1/new/download now", feature graphic 1024×500. Upload via androidpublisher v3 `edits.images`.
