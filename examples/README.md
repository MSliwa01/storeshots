# Examples

Two real apps with their captures, art and copy. Both build on any machine, no Mac needed.

| Folder | App | Copy | Look |
|---|---|---|---|
| `bloomling/` | Bloomling, a self-care app where daily good news grows a flower | English | `atmosphere` style, `pieces` lift cards out of three screens, the app's sheep on the closer |
| `truesky/` | TrueSky Weather, a forecast drawn as a painted landscape | Polish | `world` style, the app's own landscapes behind the phones |

```bash
node bin/storeshots.mjs build examples/bloomling/store
node bin/storeshots.mjs build examples/truesky/store
```

Renders and review sheets go to `store/output/`. The captures are JPEGs in `store/captures/`, set by `"paths": {"raw": "captures"}`, to keep the repo small. `storeshots capture` writes PNGs. The art is the apps' own, listed in `store/assets.json`: Bloomling's SVG pets and garden, TrueSky's painted scenes.

The captures, art and app icons belong to the two apps and are here to show the tool. The MIT licence covers the code, not them.
