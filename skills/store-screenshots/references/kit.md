# Writing a design (`store/design/iphone.html`)

A design is one HTML page: a `.strip` of `<section class="slide">` side by side. The renderer injects the kit and the data, renders the whole strip at once, and crops each slide into `NN-<id>.png`. Because it is one canvas, elements may deliberately cross from one slide into the next. Starting point: `storeshots init` writes one from a style; a complete example is `examples/demo` in the tool repo.

## Injected for you
- `kit/kit.css` (loaded before your CSS, so yours wins), `kit/kit.js`, `window.SHOTS`.
- `<base href>` = the design folder: `url(fonts/X.woff2)`, `src="art/blob.svg"` resolve there.
- CSS variables: `--slide-w`, `--slide-h` (1320px, 2868px on iPhone) and `--u` = 1% of slide width. Size everything in `--u` (`font-size: calc(var(--u) * 10)`), so the same design renders on other devices.

## Markup API
```html
<div class="strip">
  <section class="slide" id="hero">                      <!-- id → 01-hero.png; DOM order = store order -->
    <h1 data-text="hero.title" data-fit data-role="title" data-lines="2"></h1>
    <p  data-text="hero.subtitle" data-fit data-lines="2"></p>
    <div class="device" data-shot="upcoming"></div>     <!-- capture in the Apple bezel; set its width in CSS -->
    <div class="device" data-shot="calendar" data-frame="iphone-18-pro-max/silver"></div>
    <div class="screen" data-shot="chat"></div>          <!-- capture alone; --screen-radius for corners -->
    <img data-shot="upcoming">                            <!-- capture as a plain image (e.g. blurred backdrop) -->
    <div class="zoom" data-shot="upcoming" data-crop="40 540 1240 340"></div>  <!-- x y w h in capture px -->
    <img data-app-icon> <span data-app-name></span>
  </section>
</div>
```
- `data-text="a.b"` reads `copy/<locale>.json`. `*word*` → `<em>`, `\n` → line break.
- `data-fit` shrinks the font (3% steps, down to `data-min` px, default 60%) until the text fits its width, `data-lines`, and its CSS `max-height` if you set one. Treat any shrink as a copy problem: `storeshots check` warns, rewrite the line.
- Roles for `storeshots check`: `data-role="title"` (2 lines max, one size across the set, ≥ 6 % hard floor), `data-role="sub"` (one line). Any text below 4 % of the width fails.
- Frame colours for iPhone 18 Pro Max: black, silver, glacier, burgundy. Default comes from `screenshots.json`.
- The bezel's opening is measured from the PNG, and the capture fills it exactly (1320×2868 → 1320×2868).
- Hooks: `window.beforeFit = async S => {…}` and `window.afterFit` for design-specific layout (S = window.SHOTS).

## Cross-slide elements
`.slide` has no background and no overflow clipping by default. To span a seam, put the element directly in `.strip` (absolutely positioned at e.g. `left: calc(var(--slide-w) * 3 - var(--u) * 9)`), before the slides in the DOM, and keep the slides it crosses transparent. If you give slides `overflow: hidden` (useful for blurred backdrops), elements must live in `.strip` to cross. Text must never cross a seam; `storeshots check` flags it.

## Fonts
Linux has no SF Pro. Bundle font files in `design/fonts/` (OFL fonts such as Inter, Manrope, Plus Jakarta Sans, Geist, Fraunces) or the app's own brand font, and declare them with `@font-face`. Check Polish glyphs render. The renderer waits for `document.fonts.ready`.

## Pop-outs (UI coming out of the screen)
```html
<div class="device" data-shot="upcoming">
  <div class="pop p1" data-crop="47 232 1224 832" data-leave="#000"></div>
</div>
```
- Get crops from `storeshots elements` rather than by eye. Two kinds of pop come out of it:
  - `data-cut="surface"` (a card, chip, bubble, tile with its own fill): the kit cuts it along its real silhouette by keying out the colour behind it (`data-leave`, `data-fill`), so iOS continuous corners, pill ends and bubble tails come out exact and anti-aliased; the rim (`--pop-rim`, `--pop-rim-width` in capture px) follows the shape and the shadow is `--pop-drop` (a `drop-shadow` filter).
  - `data-cut="frame"` (content without its own fill: a few lines of a card, a calendar week, two stacked cards): the kit draws a container in the colour behind it with the same padding on all four sides (`data-pad`: the card's own inner margin, or the gutter between grouped cards) and corners concentric with the content (`data-radius` = child radius + padding); styled by `--pop-shadow`.
  - A pop is the one thing the headline names: prefer a block of the essential lines ("Tomorrow · Wed 21 · Glass") over the whole card with its header and controls.
- A `.pop` inside a `.device` sits exactly on its source (crop in capture px), then `--pop-reach` (its width as a share of the phone's, e.g. 1.08: the kit derives the scale) or `--pop-scale`, `--pop-x`, `--pop-y`, `--pop-z`, `--pop-origin`, `rotate` move it out of the bezel. It grows away from the screen edge it is near, and the kit slides it back inside its slide if it would be cut. Style it with `--pop-radius` (when there is no `data-radius`), `--pop-shadow`.
- 3D: set `--depth` on a `.device` (thickness as a share of its width, ~0.1) and give it a camera `transform` (e.g. `perspective(calc(var(--u) * 260)) rotateY(-24deg) rotateX(10deg)`). The kit then stacks edge layers cut to the bezel's silhouette (the phone's sides, shade from `--edge`), adds a ground shadow (`--shadow-x/-y/-alpha`), keeps it all in one 3D context, shrinks the projection to fit its slide, and pops lift with `--pop-z`. Ready-made: compositions `d-tilt` and `d-lay` (`slides[].layout`). Never put `filter` on a 3D `.device` (it flattens the pops; the kit overrides it). A lifted pop exposes its source: `data-leave` (written by `storeshots elements` as `behind`) paints that spot so it reads as a slot, not a duplicate.
- `check` warns when a phone crosses a slide edge (measured on what shows inside the slide); add `data-cross` to a device that should.
- **Never leave the original visible next to its copy** (it reads as duplicated text). Either keep the pop over its source and only grow it (scale ≥ 1.1, small offset), or move it away and set `data-leave="<bg colour>"`, which paints the source's spot so the row looks lifted out. Sample the background colour from the capture (e.g. `#1c1c1e` cards, `#000` page in iOS dark mode).
- For a crop `elements` misses, measure on the raw capture with a grid: `ffmpeg -i raw.png -vf "drawgrid=w=100:h=100:t=2:c=red@0.6" grid.png`.
- The kit inserts sibling elements (screen, bezel, holes) into `.device`, so never target pops with `:nth-of-type` / `:nth-child`; give each pop its own class (`p1`, `p2`…).

## Gotchas
- Images: only via `data-shot` (captures) or paths relative to the design folder. Remote URLs make renders non-deterministic; download assets instead.
- Missing copy keys render a red dashed box and fail `storeshots check`.
- `filter: blur()` on big images is slow but fine; keep it to one backdrop per slide.
- Drop shadows on `.device`: use `filter: drop-shadow(...)`, not `box-shadow` (the bezel has transparent corners).
- After editing only copy or CSS, `storeshots build` is enough; recapture only when the app's screens change.
