/*
  Fills a design from window.SHOTS, then fits the text. The renderer awaits
  window.__kit, which resolves to { slides, texts, problems }.

  Markup a design can use:
    <section class="slide" id="hero">                one store screenshot, in order
    <h1 data-text="hero.title" data-fit data-role="title" data-lines="2" data-min="110">
        copy/<locale>.json value; *word* → <em>, \n → line break; shrinks until it
        fits its width, data-lines and (if set) its CSS max-height
    <div class="device" data-shot="upcoming" [data-frame="iphone-18-pro-max/silver"]>
        (data-behind on a text: it is meant to sit behind a phone; check skips its hidden letters)
        <div class="pop" data-crop="x y w h" [data-radius="43"]>   pop-out, see below
        capture inside the Apple bezel (width from CSS, height from the bezel)
    <div class="screen" data-shot="upcoming">       capture alone, device aspect ratio
    <img data-shot="upcoming">                       capture as a plain image
    <div class="zoom" data-shot="upcoming" data-crop="x y w h">
        crop of the capture in capture pixels, scaled to the element's width
    <img data-app-icon>, <span data-app-name>        from screenshots.json "app"
    <img data-asset="mascot-wave">                   the app's own art by id (store/assets.json)
  Hooks: window.beforeFit / window.afterFit (async) for design-specific layout.
*/
(() => {
  const S = window.SHOTS;
  const MATTE_MARGIN = 12; // capture px around a surface pop: room for the rim and the keyed edge
  const problems = [];
  const lookup = (object, path) => path.split('.').reduce((o, key) => o?.[key], object);
  const escape = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rich = text => escape(typeof typeset === 'function' ? typeset(text, S.locale) : text).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
  const slideOf = el => el.closest('.slide')?.id || null;

  function shotURL(el) {
    const id = el.dataset.shot, url = S.shots[id];
    if (!url) problems.push({ type: 'missing-shot', shot: id, slide: slideOf(el) });
    return url ?? '';
  }

  function fill() {
    for (const el of document.querySelectorAll('[data-text]')) {
      const value = lookup(S.copy, el.dataset.text);
      if (value == null) { problems.push({ type: 'missing-text', key: el.dataset.text, slide: slideOf(el) }); el.dataset.missing = ''; continue; }
      el.innerHTML = rich(String(value));
    }
    for (const el of document.querySelectorAll('[data-app-name]')) el.textContent = S.app.name ?? '';
    for (const el of document.querySelectorAll('img[data-app-icon]')) el.src = S.app.icon ?? '';
    // The app's own art, by id from store/assets.json (Rive poses are rendered to PNG first).
    for (const el of document.querySelectorAll('[data-asset]')) {
      const url = S.assets?.[el.dataset.asset];
      if (!url) { problems.push({ type: 'missing-asset', asset: el.dataset.asset, slide: slideOf(el) }); continue; }
      if (el.tagName === 'IMG') el.src = url; else el.style.backgroundImage = `url("${url}")`;
    }

    for (const el of document.querySelectorAll('.device[data-shot]')) {
      const frame = S.frames[el.dataset.frame || S.defaultFrame];
      if (!frame) { problems.push({ type: 'missing-frame', frame: el.dataset.frame, slide: slideOf(el) }); continue; }
      const { screen: s } = frame, pct = (v, of) => `${(v / of) * 100}%`;
      el.style.aspectRatio = `${frame.width} / ${frame.height}`;
      const screen = document.createElement('div');
      screen.className = 'device-screen';
      Object.assign(screen.style, {
        left: pct(s.x, frame.width), top: pct(s.y, frame.height), width: pct(s.width, frame.width), height: pct(s.height, frame.height),
        borderRadius: `${pct(s.radius, s.width)} / ${pct(s.radius, s.height)}`,
      });
      const capture = new Image();
      capture.src = shotURL(el);
      screen.append(capture);
      const bezel = new Image();
      bezel.className = 'device-bezel';
      bezel.src = frame.url;
      el.prepend(screen, bezel);
      // 3D (--depth > 0, set by tilted compositions): the phone's sides are layers cut to the
      // bezel's silhouette, stacked behind it; the shadow is its own blurred layer below, so
      // no filter flattens the 3D (a filter on .device would).
      // --depth: thickness as a share of the phone's width (an iPhone is ~0.11 of its width).
      const depth = (parseFloat(getComputedStyle(el).getPropertyValue('--depth')) || 0) * el.offsetWidth;
      if (depth > 0) {
        el.classList.add('is-3d');
        const layers = 16, shade = getComputedStyle(el).getPropertyValue('--edge').trim() || '#2b2d33';
        const edges = Array.from({ length: layers }, (_, i) => {
          const edge = document.createElement('div');
          edge.className = 'device-edge';
          Object.assign(edge.style, { maskImage: `url("${frame.url}")`, webkitMaskImage: `url("${frame.url}")`, transform: `translateZ(${((-(i + 1) * depth) / layers).toFixed(2)}px)`,
            background: `color-mix(in srgb, ${shade}, #000 ${Math.round((i / layers) * 45)}%)` });
          return edge;
        });
        const shadow = document.createElement('div');
        shadow.className = 'device-shadow';
        el.prepend(shadow, ...edges.reverse());
      }
    }
    // Pop-outs: a crop placed exactly over its source on the phone's screen, then
    // scaled/moved by CSS (--pop-scale, --pop-x, --pop-y) so it covers the original
    // and breaks out of the bezel. Never a second copy next to the first.
    for (const el of document.querySelectorAll('.device > .pop')) {
      el.parentElement.classList.add('has-pop');
      const device = el.parentElement, frame = S.frames[device.dataset.frame || S.defaultFrame];
      const [x, y, w, h] = (el.dataset.crop ?? '').trim().split(/[\s,]+/).map(Number);
      if (!frame || ![x, y, w, h].every(Number.isFinite)) { problems.push({ type: 'bad-pop', crop: el.dataset.crop, slide: slideOf(el) }); continue; }
      const { screen: s } = frame, k = s.width / S.device.width, pct = (v, of) => `${(v / of) * 100}%`;
      const { width: W, height: H } = S.device;
      // data-cut (from `storeshots elements`): "surface" = a card/chip/bubble cut along its own
      // silhouette (kit keys out the colour behind it, see matteSurfaces); "frame" = content in
      // a container we draw: data-pad on all sides, data-radius, data-leave colour.
      const cut = el.dataset.cut, pad = cut === 'frame' ? Number(el.dataset.pad ?? 0) : 0;
      const margin = cut === 'surface' ? MATTE_MARGIN : 0;
      const [bx, by, bw, bh] = [x - pad - margin, y - pad - margin, w + 2 * (pad + margin), h + 2 * (pad + margin)];
      const box = { left: pct(s.x + bx * k, frame.width), top: pct(s.y + by * k, frame.height), width: pct(bw * k, frame.width), height: pct(bh * k, frame.height) };
      // data-leave="#1c1c1e": paint the source's spot in that colour, so a pop moved
      // away from its source leaves an empty slot instead of a duplicate
      // (data-leave-pad, default 8 capture px, grows the patch).
      if (el.dataset.leave) {
        const lp = Number(el.dataset.leavePad ?? 8) + pad;
        const hole = document.createElement('div');
        hole.className = 'pop-hole';
        Object.assign(hole.style, {
          left: pct(s.x + (x - lp) * k, frame.width), top: pct(s.y + (y - lp) * k, frame.height),
          width: pct((w + 2 * lp) * k, frame.width), height: pct((h + 2 * lp) * k, frame.height),
          background: el.dataset.leave,
          borderRadius: el.dataset.radius ? `${pct(Number(el.dataset.radius) + lp - pad, w + 2 * lp)} / ${pct(Number(el.dataset.radius) + lp - pad, h + 2 * lp)}` : '',
        });
        // Under every pop of the device (between the capture and the bezel).
        device.querySelector('.device-bezel').before(hole);
      }
      // Scale: at least a clear lift (1.12×), growing towards --pop-reach (the pop's width as a
      // share of the phone's), at most 1.45×.
      const reach = parseFloat(getComputedStyle(el).getPropertyValue('--pop-reach'));
      const ownW = (w + 2 * pad) * k;
      // Grows away from the screen edge it is near: a card under the status bar grows down.
      el.style.setProperty('--pop-oy', `${H === h ? 50 : Math.round((y / (H - h)) * 100)}%`);
      if (reach > 0) el.style.setProperty('--pop-scale', Math.min(1.45, Math.max(1.12, (reach * frame.width) / ownW)).toFixed(3));
      const r = Number(el.dataset.radius), url = S.shots[el.dataset.shot || device.dataset.shot] ?? '';
      if (cut === 'frame') {
        el.classList.add('framed');
        Object.assign(el.style, box, {
          padding: pct(pad * k, frame.width), boxSizing: 'border-box',
          borderRadius: Number.isFinite(r) ? `${pct(r, bw)} / ${pct(r, bh)}` : '',
          // Two layers: the crop inside the padding, the container colour under all of it
          // (a lone background-color would be clipped to the content box too).
          backgroundImage: `url("${url}"), linear-gradient(${el.dataset.leave ?? '#000'}, ${el.dataset.leave ?? '#000'})`,
          backgroundRepeat: 'no-repeat', backgroundOrigin: 'content-box, border-box', backgroundClip: 'content-box, border-box',
          backgroundSize: `${(W / w) * 100}% ${(H / h) * 100}%, 100% 100%`,
          backgroundPosition: `${W === w ? 0 : (x / (W - w)) * 100}% ${H === h ? 0 : (y / (H - h)) * 100}%, 0 0`,
        });
        // The content box is clipped to the container's inner rounded edge by an inner radius.
        el.style.setProperty('--frame-bg', el.dataset.leave ?? '#000');
        continue;
      }
      if (cut === 'surface') el.classList.add('matte');
      else if (el.dataset.radius && Number.isFinite(r)) box.borderRadius = `${pct(r, w)} / ${pct(r, h)}`;
      Object.assign(el.style, box, {
        backgroundImage: `url("${url}")`,
        backgroundSize: `${(W / bw) * 100}% ${(H / bh) * 100}%`,
        backgroundPosition: `${W === bw ? 0 : (bx / (W - bw)) * 100}% ${H === bh ? 0 : (by / (H - bh)) * 100}%`,
      });
    }
    for (const el of document.querySelectorAll('.screen[data-shot]')) {
      el.style.aspectRatio ||= `${S.device.width} / ${S.device.height}`;
      const capture = new Image();
      capture.src = shotURL(el);
      el.prepend(capture);
    }
    for (const el of document.querySelectorAll('img[data-shot]')) el.src = shotURL(el);
    for (const el of document.querySelectorAll('.zoom[data-shot]')) {
      const [x, y, w, h] = (el.dataset.crop ?? '').trim().split(/[\s,]+/).map(Number);
      if (![x, y, w, h].every(Number.isFinite)) { problems.push({ type: 'bad-crop', crop: el.dataset.crop, slide: slideOf(el) }); continue; }
      const { width: W, height: H } = S.device;
      Object.assign(el.style, {
        aspectRatio: `${w} / ${h}`,
        backgroundImage: `url("${shotURL(el)}")`,
        backgroundSize: `${(W / w) * 100}% auto`,
        backgroundPosition: `${W === w ? 0 : (x / (W - w)) * 100}% ${H === h ? 0 : (y / (H - h)) * 100}%`,
      });
    }
  }

  // Lines as rendered: distinct line boxes of the element's text.
  function lineCount(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const bottoms = [];
    for (const rect of range.getClientRects()) {
      if (rect.width < 1) continue;
      if (!bottoms.some(b => Math.abs(b - rect.bottom) < rect.height / 2)) bottoms.push(rect.bottom);
    }
    return bottoms.length;
  }

  // Height only counts when the design caps it with max-height: with a tight
  // line-height the glyphs overflow their line boxes on every headline.
  function overflows(el, maxLines) {
    const capped = getComputedStyle(el).maxHeight !== 'none';
    return el.scrollWidth > el.clientWidth + 1 || (capped && el.scrollHeight > el.clientHeight + 1) || (maxLines > 0 && lineCount(el) > maxLines);
  }

  // Solid text colour as [r, g, b], or null for gradient/transparent fills (not measurable).
  function textColour(el) {
    const cs = getComputedStyle(el);
    const fill = cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color;
    const m = fill.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.95)) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  // Every visible character's box, relative to its slide: what `check` uses to find letters
  // hidden behind a phone, texts running into each other and text too close to an edge.
  function letterBoxes(el, frame) {
    const boxes = [], range = document.createRange(), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && boxes.length < 400; node = walker.nextNode()) {
      for (let i = 0, n; i < node.data.length; i += n) {
        const c = String.fromCodePoint(node.data.codePointAt(i));
        n = c.length;
        if (/\s/.test(c)) continue;
        range.setStart(node, i); range.setEnd(node, i + n);
        const r = range.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        boxes.push({ c, x: Math.round(r.left - frame.left), y: Math.round(r.top - frame.top), width: Math.round(r.width), height: Math.round(r.height) });
      }
    }
    return boxes;
  }

  // Share of the text's letters drawn on top of a phone (over the app's own UI).
  function overPhone(el) {
    const range = document.createRange(), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let all = 0, over = 0;
    const style = document.createElement('style');
    style.textContent = '* { pointer-events: auto !important; }';
    document.head.append(style);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let i = 0; i < node.data.length; i++) {
        if (/\s/.test(node.data[i])) continue;
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (r.width < 1) continue;
        const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const self = stack.findIndex(e => el.contains(e)), phone = stack.findIndex(e => e.classList.contains('device') && !e.contains(el));
        all++;
        if (self >= 0 && phone > self) over++;
      }
    }
    style.remove();
    return all ? Math.round((over / all) * 100) / 100 : 0;
  }

  // Characters the design's own fonts don't have (they would fall back to a system font, or
  // to a box), and fonts that never loaded. A character is in the stack when it measures the
  // same with two different fallbacks behind it.
  const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|emoji|math|fangsong)$/i;
  const measure = document.createElement('canvas').getContext('2d');
  function glyphReport(el) {
    const missing = new Set(), fontsMissing = new Set(), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const cs = getComputedStyle(node.parentElement);
      const families = cs.fontFamily.split(',').map(f => f.trim()).filter(f => !GENERIC.test(f.replace(/["']/g, '')));
      if (!families.length) continue;
      const font = fallback => `${cs.fontStyle} ${cs.fontWeight} 100px ${families.join(', ')}, ${fallback}`;
      const differs = text => ['serif', 'sans-serif'].some(f => { measure.font = font('monospace'); const a = measure.measureText(text).width; measure.font = font(f); return Math.abs(a - measure.measureText(text).width) > 0.01; });
      if (differs('abcdefghijklmnopqrstuvwxyz0123456789')) { fontsMissing.add(families[0].replace(/["']/g, '')); continue; }
      for (const c of new Set(node.data.replace(/[\s\u200b-\u200d\u2060\ufe0f]/g, ''))) {
        if (/\p{Extended_Pictographic}/u.test(c)) continue;
        if (differs(c)) missing.add(c);
      }
    }
    return { missingGlyphs: [...missing].join(''), fontsMissing: [...fontsMissing] };
  }

  // The ink of a text's letters outside `skip`: each glyph's own ascent and descent around its
  // baseline (a range's box is the whole line's height, descender room included).
  function inkBoxes(el, skip) {
    const out = [], range = document.createRange(), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (skip?.contains(node)) continue;
      const cs = getComputedStyle(node.parentElement);
      measure.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      for (let i = 0, n; i < node.data.length; i += n) {
        const c = String.fromCodePoint(node.data.codePointAt(i));
        n = c.length;
        if (/\s/.test(c)) continue;
        range.setStart(node, i); range.setEnd(node, i + n);
        const r = range.getBoundingClientRect();
        if (r.width < 1) continue;
        const m = measure.measureText(c), base = r.top + m.fontBoundingBoxAscent;
        out.push({ c, left: r.left, right: r.right, top: base - m.actualBoundingBoxAscent, bottom: base + m.actualBoundingBoxDescent });
      }
    }
    return out;
  }

  function fit() {
    const texts = [];
    for (const el of document.querySelectorAll('[data-text]')) {
      const start = parseFloat(getComputedStyle(el).fontSize);
      const maxLines = Number(el.dataset.lines ?? 0);
      if (el.hasAttribute('data-fit')) {
        const min = Number(el.dataset.min ?? start * 0.6);
        let size = start;
        while (overflows(el, maxLines) && size > min) {
          size = Math.max(min, size * 0.97);
          el.style.fontSize = `${size}px`;
        }
      }
      // Gradient-filled text (background-clip: text) is marked so the renderer can remove it
      // in the pass that measures what is behind the text.
      for (const x of [el, ...el.querySelectorAll('*')]) { const cs = getComputedStyle(x); if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') x.dataset.clipText = ''; }
      const slide = el.closest('.slide'), box = el.getBoundingClientRect(), frame = slide?.getBoundingClientRect();
      texts.push({
        key: el.dataset.text, slide: slide?.id ?? null, role: el.dataset.role ?? 'text',
        startSize: start, fontSize: parseFloat(getComputedStyle(el).fontSize), lines: lineCount(el), maxLines,
        statement: !!el.closest('.caption.huge'),
        overflow: overflows(el, maxLines),
        outsideSlide: frame ? box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1 : false,
        box: frame ? { x: Math.round(box.left - frame.left), y: Math.round(box.top - frame.top), width: Math.round(box.width), height: Math.round(box.height) } : null,
        color: textColour(el),
        text: el.textContent, behind: el.hasAttribute('data-behind'), inDevice: !!el.closest('.device'),
        letters: frame ? letterBoxes(el, frame) : [],
        overPhone: frame ? overPhone(el) : 0,
        ...glyphReport(el),
      });
      // Accent words (pills, colour accents) are measured on their own.
      // Measured unrotated and inside its padding: a tilted pill's bounding box takes in
      // the field around it, which would read as the pill's own background.
      for (const em of el.querySelectorAll('em')) {
        const { rotate, transform } = em.style;
        em.style.rotate = 'none'; em.style.transform = 'none';
        const r = em.getBoundingClientRect(), cs = getComputedStyle(em);
        em.style.rotate = rotate; em.style.transform = transform;
        const pad = side => parseFloat(cs[`padding${side}`]) || 0;
        const b = { left: r.left + pad('Left'), top: r.top + pad('Top'), width: r.width - pad('Left') - pad('Right'), height: r.height - pad('Top') - pad('Bottom') };
        const full = em.getBoundingClientRect();
        if (!frame || b.width < 2) continue;
        // A pill (an accent with its own background) painted over the headline's other letters:
        // inline, it covers the descenders of the line above.
        if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') {
          const hit = inkBoxes(el, em).filter(g => g.left < r.right - 1 && g.right > r.left + 1 && g.top < r.bottom - 1 && g.bottom > r.top + 1);
          if (hit.length) problems.push({ type: 'pill-covers-letters', slide: slide?.id ?? null, key: el.dataset.text, letters: hit.map(g => g.c).join(''),
            by: Math.round(Math.max(...hit.map(g => Math.min(g.bottom, r.bottom) - Math.max(g.top, r.top)))) });
        }
        texts.push({ key: `${el.dataset.text}#em`, slide: slide?.id ?? null, role: 'accent', fontSize: parseFloat(getComputedStyle(em).fontSize), lines: 1, overflow: false, outsideSlide: false,
          box: { x: Math.round(b.left - frame.left), y: Math.round(b.top - frame.top), width: Math.round(b.width), height: Math.round(b.height) },
          // What the headline's own measurement skips: the whole pill as drawn.
          hole: { x: Math.round(full.left - frame.left), y: Math.round(full.top - frame.top), width: Math.round(full.width), height: Math.round(full.height) },
          color: textColour(em) });
      }
    }
    return texts;
  }

  // Surface pops are cut along the element's own silhouette: inside the crop (the element plus
  // MATTE_MARGIN capture px), everything reachable from the border through the colour behind
  // the element (data-leave) becomes transparent, with alpha ramping over the colour distance
  // so the app's own anti-aliased edge survives, and edge colours are un-mixed from that
  // background. The threshold follows how far the element's fill is from the background
  // (near-black on black needs a narrow ramp). A rim (--pop-rim, --pop-rim-width in capture px)
  // is the silhouette dilated, under the element; the shadow is filter: drop-shadow, which
  // follows the alpha.
  function matteSurfaces() {
    const parse = c => { const m = String(c).match(/\d+(\.\d+)?/g); return m ? m.slice(0, 4).map(Number) : null; };
    const colour = css => { const probe = document.createElement('i'); probe.style.color = css; document.body.append(probe); const v = parse(getComputedStyle(probe).color); probe.remove(); return v; };
    for (const el of document.querySelectorAll('.device > .pop.matte')) {
      const img = el.parentElement.querySelector('.device-screen > img');
      const [x, y, w, h] = el.dataset.crop.trim().split(/[\s,]+/).map(Number), M = MATTE_MARGIN;
      if (!img?.naturalWidth) continue;
      const cw = w + 2 * M, ch = h + 2 * M;
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, x - M, y - M, cw, ch, 0, 0, cw, ch);
      let data;
      try { data = ctx.getImageData(0, 0, cw, ch); } catch { continue; }
      const px = data.data, behind = colour(el.dataset.leave || '#000');
      const fill = el.dataset.fill ? colour(el.dataset.fill) : [px[((M + 2) * cw + M + (w >> 1)) * 4], px[((M + 2) * cw + M + (w >> 1)) * 4 + 1], px[((M + 2) * cw + M + (w >> 1)) * 4 + 2]];
      const dist = i => Math.max(Math.abs(px[i] - behind[0]), Math.abs(px[i + 1] - behind[1]), Math.abs(px[i + 2] - behind[2]));
      const dFill = Math.max(Math.abs(fill[0] - behind[0]), Math.abs(fill[1] - behind[1]), Math.abs(fill[2] - behind[2]));
      const hi = Math.max(3, Math.min(28, dFill * 0.7)), lo = hi * 0.2;
      const out = new Uint8Array(cw * ch), stack = [];
      for (let i = 0; i < cw; i++) stack.push(i, (ch - 1) * cw + i);
      for (let j = 0; j < ch; j++) stack.push(j * cw, j * cw + cw - 1);
      while (stack.length) {
        const p = stack.pop();
        if (out[p] || dist(p * 4) >= hi) continue;
        out[p] = 1;
        const px0 = p % cw, py0 = (p - px0) / cw;
        if (px0 > 0) stack.push(p - 1); if (px0 < cw - 1) stack.push(p + 1); if (py0 > 0) stack.push(p - cw); if (py0 < ch - 1) stack.push(p + cw);
      }
      const alpha = new Float32Array(cw * ch);
      for (let p = 0; p < cw * ch; p++) {
        const i = p * 4;
        if (!out[p]) { alpha[p] = 1; continue; }
        const a = Math.max(0, Math.min(1, (dist(i) - lo) / (hi - lo)));
        alpha[p] = a;
        if (a > 0.02) for (let ch3 = 0; ch3 < 3; ch3++) px[i + ch3] = Math.max(0, Math.min(255, (px[i + ch3] - (1 - a) * behind[ch3]) / a));
      }
      // Rim: the silhouette dilated by R (separable max), in the rim colour, under the element.
      const cs = getComputedStyle(el), rimCss = cs.getPropertyValue('--pop-rim').trim();
      const R = Math.round(parseFloat(cs.getPropertyValue('--pop-rim-width')) || 0), rim = rimCss && rimCss !== 'none' && R > 0 ? colour(rimCss) : null;
      let dil = null;
      if (rim) {
        const tmp = new Float32Array(cw * ch); dil = new Float32Array(cw * ch);
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { let m = 0; for (let d = -R; d <= R; d++) { const v = alpha[j * cw + Math.min(cw - 1, Math.max(0, i + d))]; if (v > m) m = v; } tmp[j * cw + i] = m; }
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { let m = 0; for (let d = -R; d <= R; d++) { const v = tmp[Math.min(ch - 1, Math.max(0, j + d)) * cw + i]; if (v > m) m = v; } dil[j * cw + i] = m; }
      }
      const rimA = rim ? (rim[3] ?? 1) : 0;
      for (let p = 0; p < cw * ch; p++) {
        const i = p * 4, a = alpha[p];
        if (!rim) { px[i + 3] = Math.round(a * 255); continue; }
        // Element over rim.
        const ra = dil[p] * rimA, oa = a + ra * (1 - a);
        for (let ch3 = 0; ch3 < 3; ch3++) px[i + ch3] = oa > 0 ? Math.round((px[i + ch3] * a + rim[ch3] * ra * (1 - a)) / oa) : 0;
        px[i + 3] = Math.round(oa * 255);
      }
      ctx.putImageData(data, 0, 0);
      Object.assign(el.style, { backgroundImage: `url("${c.toDataURL('image/png')}")`, backgroundSize: '100% 100%', backgroundPosition: '0 0' });
      el.classList.add('matted');
    }
  }

  // Glow fields take their light from a capture, which may be light or dark: measure the
  // part of the screen behind the caption and mark light ones (.on-light on the field and its
  // slide) so the design switches to dark text.
  function toneGlows() {
    const sections = [...document.querySelectorAll('.slide')];
    const glows = [...document.querySelectorAll('.glow-strip > img.glow')];
    document.querySelectorAll('.field').forEach((field, i) => {
      const img = glows[i], slide = sections[i];
      if (!img?.naturalWidth || !slide) return;
      const bottom = !!slide.querySelector('.caption.bottom');
      const c = document.createElement('canvas'); c.width = 12; c.height = 24;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 12, 24);
      let data;
      try { data = ctx.getImageData(0, bottom ? 15 : 0, 12, 9).data; } catch { return; }
      let sum = 0;
      for (let k = 0; k < data.length; k += 4) {
        const [r, g, b] = [data[k], data[k + 1], data[k + 2]].map(v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      if (sum / (data.length / 4) > 0.3) { field.classList.add('on-light'); slide.classList.add('on-light'); }
    });
  }

  // Zoom: the phone enlarged 1.3–1.6× (as top sets do; more reads as a cropped screenshot) and
  // moved sideways so its focus (data-focus, capture px) stays in view while one corner and
  // the two frame edges meeting there stay too, with background beside them: on the focus's
  // side, 12 % of the slide wide when the focus allows. The caption stays clear of the phone:
  // on top when the focus sits high on the screen (the phone then starts under the caption and
  // runs off the bottom), at the bottom when it sits low (the phone hangs from above the
  // slide). Whichever side allows the larger phone wins.
  const ZOOM = [1.3, 1.6], ZOOM_SIDE = 0.12;
  function zoomDevices() {
    const slides = [...document.querySelectorAll('.slide')], strip = document.querySelector('.strip')?.getBoundingClientRect();
    const slideW = slides[0]?.getBoundingClientRect().width;
    if (!slideW || !strip) return;
    const slideH = strip.height, gap = slideW * 0.05;
    for (const el of document.querySelectorAll('.device.d-zoom[data-focus]')) {
      const i = Number(el.style.getPropertyValue('--i')), slide = slides[i], caption = slide?.querySelector('.caption'), screen = el.querySelector('.device-screen');
      const [x, y, w, h] = el.dataset.focus.split(/[\s,]+/).map(Number);
      if (!caption || !screen || ![x, y, w, h].every(Number.isFinite)) { problems.push({ type: 'bad-focus', focus: el.dataset.focus, slide: slide?.id ?? null }); continue; }
      // Device-local, unscaled: the focus box and the phone's height.
      const D = el.offsetWidth, DH = el.offsetHeight, sx = screen.offsetWidth / S.device.width, sy = screen.offsetHeight / S.device.height;
      const fl = screen.offsetLeft + x * sx, fw = w * sx, ft = screen.offsetTop + y * sy, fb = ft + h * sy;
      // The kept side: the one the focus leans to; the focus must fit between that side's
      // background strip and the far edge (4 % margin).
      const keepLeft = el.dataset.side ? el.dataset.side === 'left' : fl + fw / 2 <= D / 2;
      const reach = keepLeft ? fl + fw : D - fl, fits = (slideW * (0.96 - ZOOM_SIDE)) / reach;
      const room = bottom => { caption.classList.toggle('bottom', bottom); const c = caption.getBoundingClientRect(); return bottom ? c.top - strip.top - gap : c.bottom - strip.top + gap; };
      const want = Math.min(ZOOM[1], Math.max(ZOOM[0], (slideW * 0.84) / fw), fits), edge = slideH * 0.03;
      const top = room(false), kTop = Math.min(want, (slideH - edge - top) / fb);
      const bottom = room(true), kBottom = Math.min(want, (bottom - edge) / (DH - ft));
      const below = kBottom > kTop * 1.05, k = Math.max(1, below ? kBottom : kTop);
      room(below);
      slide.classList.toggle('zoom-low', below);
      slide.classList.toggle('zoom-right', !keepLeft);
      if (k < 1.2) problems.push({ type: 'zoom-too-small', slide: slide.id, scale: Math.round(k * 100) / 100, warn: true });
      // The phone starts right under the caption (or ends right above it); spare room shows
      // more of the screen past the focus.
      const devTop = below ? bottom - DH * k : top, x0 = i * slideW;
      const devLeft = keepLeft
        ? Math.min(x0 + slideW * ZOOM_SIDE, x0 + slideW * 0.96 - (fl + fw) * k)
        : Math.max(x0 + slideW * (1 - ZOOM_SIDE) - D * k, x0 + slideW * 0.04 - fl * k);
      Object.assign(el.style, { width: `${D * k}px`, left: `${devLeft}px`, top: `${devTop}px` });
      // Cut by its own slide: nothing of it shows on the neighbours.
      const cutL = Math.max(0, x0 - devLeft), cutR = Math.max(0, devLeft + D * k - (x0 + slideW));
      el.style.clipPath = `inset(-${slideH}px ${cutR}px -${slideH}px ${cutL}px)`;
    }
  }

  // A 3D phone is as wide as its projection: shrink it (and centre it) until it fits its
  // slide with a margin of 4 %. Then any phone crossing a slide edge, other than the lean
  // (which crosses on purpose, as do devices with data-cross), is reported.
  // The part of a phone that is inside the slide's height, as [left, right] on screen:
  // probes down both edges on the phone's own plane, so tilted and 3D phones are judged by
  // what shows, not by a bounding box that includes corners below the slide.
  function visibleExtent(el, slideTop, slideBottom) {
    let left = Infinity, right = -Infinity;
    for (let k = 0; k <= 48; k++) for (const side of ['left', 'right']) {
      const p = document.createElement('div');
      Object.assign(p.style, { position: 'absolute', top: `${(k / 48) * el.offsetHeight}px`, [side]: '0', width: '1px', height: '1px', pointerEvents: 'none' });
      el.append(p);
      const r = p.getBoundingClientRect();
      p.remove();
      if (r.top < slideTop || r.top > slideBottom) continue;
      left = Math.min(left, r.left); right = Math.max(right, r.right);
    }
    return [left, right];
  }
  // Tilted and 3D phones that come too close to their slide's edges are scaled down a little
  // and recentred; anything still crossing is reported.
  function fitDevices() {
    const slides = [...document.querySelectorAll('.slide')], box = slides[0]?.getBoundingClientRect();
    if (!box) return;
    const slideW = box.width, devices = [...document.querySelectorAll('.device')];
    const slideOf = el => { const r = el.getBoundingClientRect(); return Math.floor((r.left + r.width / 2) / slideW); };
    for (const el of devices.filter(d => (d.classList.contains('is-3d') || d.classList.contains('d-lean')) && !d.hasAttribute('data-cross'))) {
      // A tilted phone needs a clear margin (7 %) or its corner reads as touching the next slide.
      const m = el.classList.contains('d-lean') ? 0.07 : 0.03;
      const i = slideOf(el), lo = i * slideW + slideW * m, hi = (i + 1) * slideW - slideW * m;
      for (let pass = 0; pass < 3; pass++) {
        const [l, r] = visibleExtent(el, box.top, box.bottom);
        if (l >= lo - 1 && r <= hi + 1) break;
        const factor = Math.min(1, (hi - lo) / (r - l)) * (parseFloat(el.style.scale) || 1);
        const shift = (lo + hi) / 2 - (l + r) / 2 + (parseFloat(el.style.translate) || 0);
        el.style.scale = factor.toFixed(4);
        el.style.translate = `${Math.round(shift)}px 0`;
      }
      // A tilted phone is centred on what shows of it (its lower corner is cut by the slide's
      // bottom edge), so its margins are equal.
      if (el.classList.contains('d-lean')) {
        const [l, r] = visibleExtent(el, box.top, box.bottom);
        const shift = (i * slideW + slideW / 2) - (l + r) / 2 + (parseFloat(el.style.translate) || 0);
        el.style.translate = `${Math.round(shift)}px 0`;
      }
    }
    for (const el of devices) {
      if (el.hasAttribute('data-cross')) continue;
      const i = slideOf(el), [l, r] = visibleExtent(el, box.top, box.bottom);
      if (l < i * slideW - 1 || r > (i + 1) * slideW + 1)
        problems.push({ type: 'device-crosses-edge', slide: slides[i]?.id ?? null, by: Math.round(Math.max(i * slideW - l, r - (i + 1) * slideW)), warn: true });
    }
  }

  // Pop-outs overhang the phone evenly or not at all. In the device's own (untransformed)
  // coordinates: a pop wider than ~90 % of the phone is centred on it, so it sticks out by
  // the same amount on both sides; a narrower one stays inside the phone's outline. A pop
  // whose symmetric overhang would cross its slide's edge is scaled down rather than pushed
  // sideways (pushing would make it lopsided again).
  const popScale = el => parseFloat(el.style.getPropertyValue('--pop-scale') || getComputedStyle(el).getPropertyValue('--pop-scale')) || 1.15;
  function centrePops() {
    const slideW = document.querySelector('.slide')?.getBoundingClientRect().width;
    for (const el of document.querySelectorAll('.device > .pop')) {
      const device = el.parentElement, D = device.offsetWidth, L = el.offsetLeft, w = el.offsetWidth;
      let s = popScale(el);
      // Room for an even overhang: the smaller gap between the phone and its slide's edges
      // (less a 3 % margin), in the device's own units.
      if (slideW) {
        const d = device.getBoundingClientRect(), i = Math.floor((d.left + d.width / 2) / slideW), unit = d.width / D;
        const room = Math.max(0, Math.min(d.left - i * slideW, (i + 1) * slideW - d.right) - slideW * 0.03) / unit;
        if (w * s > D + 2 * room) s = Math.max(1, (D + 2 * room) / w);
        // Never flush with the bezel: a pop clearly sticks out (≥ 3 % a side) or clearly sits
        // inside the phone (≤ 84 % of its width).
        // (3D poses aside: the lift towards the camera already makes the pop larger than the phone.)
        if (!device.classList.contains('is-3d') && w * s > D * 0.86 && w * s < D * 1.06) s = Math.max(1, Math.min(s, (D * 0.84) / w));
        el.style.setProperty('--pop-scale', s.toFixed(3));
      }
      const ox = parseFloat(getComputedStyle(el).transformOrigin) || w / 2;
      const left = L + ox * (1 - s), width = w * s, margin = D * 0.09;
      const target = width >= D * 0.9 ? (D - width) / 2 : Math.max(margin, Math.min(left, D - margin - width));
      el.style.setProperty('--pop-x', `${(target - left).toFixed(1)}px`);
    }
  }
  // The same rule checked on screen, where tilts, 3D poses and lifts move a pop off its
  // computed spot. The phone's edges are measured at the pop's own height (two probes on the
  // phone's plane), not from its bounding box: a tilted or perspective phone is wider at
  // one end. Wide pops get equal overhangs, narrow ones stay inside the phone.
  function phoneEdgesAt(device, y) {
    const probe = side => {
      const p = document.createElement('div');
      Object.assign(p.style, { position: 'absolute', top: `${y}px`, [side]: '0', width: '1px', height: '1px', pointerEvents: 'none' });
      device.append(p);
      const r = p.getBoundingClientRect();
      p.remove();
      return side === 'left' ? r.left : r.right;
    };
    return [probe('left'), probe('right')];
  }
  function evenOnScreen() {
    for (const el of document.querySelectorAll('.device > .pop')) {
      const device = el.parentElement, y = el.offsetTop + el.offsetHeight / 2;
      for (let pass = 0; pass < 4; pass++) {
        const r = el.getBoundingClientRect(), [left, right] = phoneEdgesAt(device, y), width = right - left;
        const unit = r.width / (el.offsetWidth * popScale(el)) || 1;
        let dx = 0;
        if (r.width >= width * 0.9) dx = (left + right) / 2 - (r.left + r.right) / 2;
        else {
          const inset = width * 0.08;
          if (r.left < left + inset) dx = left + inset - r.left;
          else if (r.right > right - inset) dx = right - inset - r.right;
        }
        if (Math.abs(dx) < 1) break;
        el.style.setProperty('--pop-x', `${((parseFloat(el.style.getPropertyValue('--pop-x')) || 0) + dx / unit).toFixed(1)}px`);
      }
    }
  }

  function keepPopsInside() {
    const slideW = document.querySelector('.slide')?.getBoundingClientRect().width;
    if (!slideW) return;
    for (const el of document.querySelectorAll('.device > .pop')) {
      for (let pass = 0; pass < 3; pass++) {
        const r = el.getBoundingClientRect(), d = el.parentElement.getBoundingClientRect();
        const i = Math.floor((d.left + d.width / 2) / slideW), lo = i * slideW + slideW * 0.03, hi = (i + 1) * slideW - slideW * 0.03;
        const over = Math.max(lo - r.left, r.right - hi, 0);
        if (over < 2) break; // rounding at the margin
        const s = popScale(el), shrunk = Math.max(1, s * (r.width - 2 * over) / r.width);
        if (shrunk < s - 0.001) { el.style.setProperty('--pop-scale', shrunk.toFixed(3)); centrePops(); continue; }
        // Even at 1× it does not fit (the element itself is wider than the room): last resort.
        el.style.setProperty('--pop-x', `${(parseFloat(el.style.getPropertyValue('--pop-x')) || 0) + (r.left < lo ? lo - r.left : hi - r.right)}px`);
        problems.push({ type: 'pop-too-wide', slide: document.querySelectorAll('.slide')[i]?.id ?? null, warn: true });
        break;
      }
    }
  }

  // Pieces (cut-outs) follow the rules from the design reviews: whole objects, enlarged over
  // their own source (never a second copy beside it), sticking out past the phone's edge,
  // never on top of each other, never near a slide edge or over the caption.
  // Without a spot of their own (data-over): a narrow piece (up to 56 % of the slide) keeps
  // its source covered and reaches out past the phone's edge on its source's side by a
  // quarter of its width, tilted outwards (data-tilt); a wide one is centred on its source.
  // Then each piece is kept inside its slide's free band, and pieces that touch shrink (the
  // larger first, never below 1.15× their source) until they don't.
  const PIECE_MARGIN = 0.04; // of the slide's width
  const pieceSlide = el => Number(el.style.getPropertyValue('--i'));
  function placePieces() {
    const slides = [...document.querySelectorAll('.slide')], strip = document.querySelector('.strip')?.getBoundingClientRect();
    const slideW = slides[0]?.getBoundingClientRect().width;
    if (!slideW || !strip) return;
    const slideH = strip.height, m = slideW * PIECE_MARGIN, groups = new Map();
    for (const el of document.querySelectorAll('.piece')) groups.set(pieceSlide(el), [...(groups.get(pieceSlide(el)) ?? []), el]);
    for (const [i, pieces] of groups) {
      const x0 = i * slideW, slide = slides[i], cap = slide?.querySelector('.caption')?.getBoundingClientRect(), capBottom = !!slide?.querySelector('.caption.bottom');
      const band = [capBottom || !cap ? m : cap.bottom - strip.top + m, capBottom && cap ? cap.top - strip.top - m : slideH - m];
      const device = [...document.querySelectorAll('.device:not(.d-fan)')].find(d => Number(d.style.getPropertyValue('--i')) === i);
      const dr = device?.getBoundingClientRect(), source = new Map();
      // The piece's centre for its current width.
      const place = el => {
        const s = source.get(el);
        if (!s) return;
        const pw = el.offsetWidth;
        let cx = s.cx;
        if (pw <= slideW * 0.56 && dr) {
          const phoneL = dr.left - strip.left, phoneR = dr.right - strip.left, middle = (phoneL + phoneR) / 2;
          const side = el.dataset.side || (s.cx < middle ? 'left' : 'right');
          if (side === 'right') cx = Math.min(s.l + pw, Math.max(s.r, phoneR + pw * 0.25)) - pw / 2;
          else cx = Math.max(s.r - pw, Math.min(s.l, phoneL - pw * 0.25)) + pw / 2;
          if (el.hasAttribute('data-tilt')) el.style.rotate = `${side === 'left' ? -3 : 3}deg`;
        }
        el.style.left = `${cx + (Number(el.dataset.shift) || 0) * slideW / 100}px`;
        el.style.top = `${s.cy}px`;
      };
      for (const el of pieces) {
        if (el.offsetWidth > slideW - 2 * m) el.style.width = `${slideW - 2 * m}px`;
        if (!el.hasAttribute('data-over')) continue;
        const zoom = el.querySelector('.zoom'), screen = (device?.dataset.shot === zoom.dataset.shot ? device : null)?.querySelector('.device-screen');
        if (!screen) continue;
        const [x, y, w, h] = zoom.dataset.crop.split(/[\s,]+/).map(Number), r = screen.getBoundingClientRect();
        const l = r.left - strip.left + (r.width * x) / S.device.width, rr = r.left - strip.left + (r.width * (x + w)) / S.device.width;
        source.set(el, { l, r: rr, cx: (l + rr) / 2, cy: r.top - strip.top + (r.height * (y + h / 2)) / S.device.height, w: rr - l });
        place(el);
      }
      // Inside the margins and the free band (on the drawn, tilted box).
      const box = el => { const b = el.getBoundingClientRect(); return { l: b.left - strip.left, r: b.right - strip.left, t: b.top - strip.top, b: b.bottom - strip.top }; };
      const keepIn = el => {
        const b = box(el), dx = Math.max(0, x0 + m - b.l) - Math.max(0, b.r - (x0 + slideW - m)), dy = Math.max(0, band[0] - b.t) - Math.max(0, b.b - band[1]);
        el.style.left = `${(parseFloat(el.style.left) || el.offsetLeft) + dx}px`;
        el.style.top = `${(parseFloat(el.style.top) || el.offsetTop) + dy}px`;
      };
      pieces.forEach(keepIn);
      for (let pass = 0; pass < 12; pass++) {
        const hit = pieces.flatMap((a, k) => pieces.slice(k + 1).map(c => [a, c])).find(([a, c]) => {
          const p = box(a), q = box(c);
          return !(p.l >= q.r + m / 2 || q.l >= p.r + m / 2 || p.t >= q.b + m / 2 || q.t >= p.b + m / 2);
        });
        if (!hit) break;
        const big = hit.sort((a, c) => c.offsetWidth - a.offsetWidth).find(el => el.offsetWidth * 0.92 >= (source.get(el)?.w ?? 0) * 1.15);
        if (!big) break;
        big.style.width = `${big.offsetWidth * 0.92}px`;
        place(big); keepIn(big);
      }
    }
  }

  // A character peeking over a phone's top edge needs room under the caption: styles set the
  // phone's top as a share of the slide, not by the caption's real height. The phone (and the
  // character) move down until the peeking part clears the caption.
  function roomForPeeks() {
    let moved = false;
    for (const art of document.querySelectorAll('.art.a-peek:not(.at-hang)')) {
      const i = Number(art.style.getPropertyValue('--i')), slide = document.querySelectorAll('.slide')[i];
      const cap = slide?.querySelector('.caption:not(.bottom)');
      const device = [...document.querySelectorAll('.device')].find(d => Number(d.style.getPropertyValue('--i')) === i);
      if (!cap || !device) continue;
      const dy = cap.getBoundingClientRect().bottom + slide.getBoundingClientRect().width * 0.03 - art.getBoundingClientRect().top;
      if (dy <= 0) continue;
      device.style.top = `${device.offsetTop + dy}px`;
      art.style.bottom = `${parseFloat(getComputedStyle(art).bottom) - dy}px`;
      moved = true;
    }
    if (moved) placePieces();
  }

  // The rules, measured where they can be: per slide at most two pieces, none on another or
  // near an edge, and none cut through the middle of something (busy capture on both sides of
  // a crop edge: the rest of a row, a picture, a paragraph).
  async function pieceProblems(slides) {
    const strip = document.querySelector('.strip')?.getBoundingClientRect(), slideW = document.querySelector('.slide')?.getBoundingClientRect().width;
    if (!strip || !slideW) return;
    const all = [...document.querySelectorAll('.piece')], images = new Map();
    const id = el => slides[pieceSlide(el)]?.id ?? null;
    for (const i of new Set(all.map(pieceSlide))) {
      const pieces = all.filter(el => pieceSlide(el) === i);
      if (pieces.length > 2) problems.push({ type: 'too-many-pieces', slide: id(pieces[0]), count: pieces.length, warn: true });
      for (const [k, a] of pieces.entries()) for (const c of pieces.slice(k + 1)) {
        const p = a.getBoundingClientRect(), q = c.getBoundingClientRect();
        const ix = Math.min(p.right, q.right) - Math.max(p.left, q.left), iy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
        if (ix > 2 && iy > 2) problems.push({ type: 'pieces-overlap', slide: id(a), by: [Math.round(ix), Math.round(iy)] });
      }
      // Text big enough to read: cap height of the biggest line ≥ 3 % of the slide's width,
      // of every line ≥ 2 % (what top sets do; below that a lift reads as texture in search).
      for (const el of pieces) {
        const zoom = el.querySelector('.zoom'), w = Number(zoom.dataset.crop.split(/[\s,]+/)[2]), k = zoom.offsetWidth / w / slideW * 100;
        const key = Number(el.dataset.key) * k, min = Number(el.dataset.min) * k, words = Number(el.dataset.words);
        if (key && (key < 3 || min < 2)) problems.push({ type: 'piece-text-small', slide: id(el), crop: zoom.dataset.crop.split(/[\s,]+/).map(Number), key: Math.round(key * 10) / 10, min: Math.round(min * 10) / 10, warn: true });
        if (words > 15) problems.push({ type: 'piece-wordy', slide: id(el), words, warn: true });
      }
      for (const el of pieces) {
        const b = el.getBoundingClientRect(), x0 = strip.left + i * slideW, near = Math.min(b.left - x0, x0 + slideW - b.right, b.top - strip.top, strip.bottom - b.bottom);
        if (near < slideW * 0.03) problems.push({ type: 'piece-near-edge', slide: id(el), by: Math.round(slideW * 0.03 - near), warn: true });
      }
    }
    for (const el of all) {
      const zoom = el.querySelector('.zoom'), url = S.shots[zoom.dataset.shot];
      if (!url) continue;
      if (!images.has(url)) { const img = new Image(); img.src = url; images.set(url, img.decode().then(() => img).catch(() => null)); }
      const img = await images.get(url);
      if (!img) continue;
      const [x, y, w, h] = zoom.dataset.crop.split(/[\s,]+/).map(Number), W = img.naturalWidth, H = img.naturalHeight, d = 4;
      // Steps along one line of capture pixels: text, icons and pictures make many, a gradient
      // or a lone divider few. Off the capture (the screen's own edge) counts as calm.
      const busy = (sx, sy, sw, sh) => {
        if (sx < 0 || sy < 0 || sx + sw > W || sy + sh > H) return false;
        const c = document.createElement('canvas'); c.width = sw; c.height = sh;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        let px;
        try { px = ctx.getImageData(0, 0, sw, sh).data; } catch { return false; }
        let steps = 0;
        for (let k = 4; k < px.length; k += 4) if (Math.max(Math.abs(px[k] - px[k - 4]), Math.abs(px[k + 1] - px[k - 3]), Math.abs(px[k + 2] - px[k - 2])) > 24) steps++;
        return steps > Math.max(8, (sw + sh) * 0.01);
      };
      // A side cuts through when the capture is busy 4 px outside it and 4 px inside it: a card
      // cropped along its own edge has calm padding inside, even over a busy picture.
      const lines = {
        top: [[x, y - d, w, 1], [x, y + d, w, 1]], bottom: [[x, y + h + d, w, 1], [x, y + h - d, w, 1]],
        left: [[x - d, y, 1, h], [x + d, y, 1, h]], right: [[x + w + d, y, 1, h], [x + w - d, y, 1, h]],
      };
      const cut = Object.entries(lines).filter(([, [outside, inside]]) => busy(...outside) && busy(...inside)).map(([side]) => side);
      if (cut.length) problems.push({ type: 'piece-cuts-through', slide: id(el), crop: [x, y, w, h], sides: cut });
      // Cropped a little wide, a card carries a strip of the screen beside it: a straight step in
      // colour along most of a side, 5 to 24 px (at most 4 % of the crop) inside it, with the
      // screen's own colour (as just outside the crop) beyond the step. A card's rim or shadow
      // differs from it; a wider band of the screen round a tile is a frame chosen on purpose.
      const m = 8, rx = Math.max(0, x - m), ry = Math.max(0, y - m), rw = Math.min(W, x + w + m) - rx, rh = Math.min(H, y + h + m) - ry;
      if (w < 20 || h < 20 || rw < 1 || rh < 1) continue;
      const c = document.createElement('canvas'); c.width = rw; c.height = rh;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);
      let px;
      try { px = ctx.getImageData(0, 0, rw, rh).data; } catch { continue; }
      // Capture px → index, or -1 off the region read.
      const at = (cx, cy) => (cx < rx || cy < ry || cx >= rx + rw || cy >= ry + rh ? -1 : ((cy - ry) * rw + cx - rx) * 4);
      const differ = (a, b, by) => a >= 0 && b >= 0 && Math.max(Math.abs(px[a] - px[b]), Math.abs(px[a + 1] - px[b + 1]), Math.abs(px[a + 2] - px[b + 2])) > by;
      const alike = (a, b) => a >= 0 && b >= 0 && !differ(a, b, 24);
      // A point at depth d from a side (negative: outside the crop), t along it.
      const point = (side, d, t) => (side === 'left' ? at(x + d, y + t) : side === 'right' ? at(x + w - 1 - d, y + t) : side === 'top' ? at(x + t, y + d) : at(x + t, y + h - 1 - d));
      for (const side of ['left', 'right', 'top', 'bottom']) {
        const along = side === 'left' || side === 'right' ? h : w, across = side === 'left' || side === 'right' ? w : h, deepest = Math.min(24, Math.round(across * 0.04));
        for (let d = 5; d <= deepest; d++) {
          let n = 0, steps = 0, screen = 0;
          for (let t = 0; t < along; t += 2, n++) {
            if (differ(point(side, d - 1, t), point(side, d, t), 30)) steps++;
            if (alike(point(side, Math.floor(d / 2), t), point(side, -3, t))) screen++;
          }
          if (steps / n < 0.6) continue;
          if (screen / n >= 0.6) problems.push({ type: 'piece-sliver', slide: id(el), crop: [x, y, w, h], side, by: d, warn: true });
          break;
        }
      }
    }
  }

  // Words on a phone's screen (OCR, S.words) that a slide's left or right edge cuts ("dziś" left
  // as "iś"), or that a card, a pop-out or art in front covers in part or touches (the "Kolejne
  // wywozy" heading under a lifted card). A word covered whole is hidden, which is fine, and a
  // pop-out's own spot is covered on purpose. Markers placed on the screen in capture px give
  // each word's place on the slide through every tilt and 3D pose.
  function screenProblems(slides) {
    const slideBox = document.querySelector('.slide')?.getBoundingClientRect();
    if (!slideBox || !S.words) return;
    const W = slideBox.width, pad = W * 0.004, found = new Set();
    const add = (type, slide, text, by) => {
      const key = `${type}\n${slide}\n${text}\n${by ?? ''}`;
      if (found.has(key)) return;
      found.add(key);
      problems.push({ type, slide, text, ...(by && { by }), warn: true });
    };
    // In front of the phones: pieces, pop-outs and art above the phone's layer (z-index 1).
    const covers = [...document.querySelectorAll('.piece, .device > .pop, .art')].filter(c => c.classList.contains('pop') || Number(getComputedStyle(c).zIndex) > 1);
    const alphas = new Map();
    const alphaOf = c => {
      if (c.tagName !== 'IMG' || !c.naturalWidth) return null;
      if (!alphas.has(c)) {
        const k = Math.min(1, 256 / Math.max(c.naturalWidth, c.naturalHeight)), cw = Math.max(1, Math.round(c.naturalWidth * k)), ch = Math.max(1, Math.round(c.naturalHeight * k));
        const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(c, 0, 0, cw, ch);
        let data = null;
        try { data = ctx.getImageData(0, 0, cw, ch).data; } catch { /* a file the canvas may not read */ }
        alphas.set(c, data && { data, cw, ch, mirror: /^-1/.test(getComputedStyle(c).scale) });
      }
      return alphas.get(c);
    };
    // Share of a box (8 × 4 points) that a cover hides: its box for cards, its opaque pixels for art.
    const share = (c, r) => {
      const b = c.getBoundingClientRect(), a = c.classList.contains('art') ? alphaOf(c) : null;
      let hit = 0;
      for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 8; gx++) {
        const x = r.left + ((gx + 0.5) / 8) * r.width, y = r.top + ((gy + 0.5) / 4) * r.height;
        if (x < b.left || x > b.right || y < b.top || y > b.bottom) continue;
        if (!a) { hit++; continue; }
        let fx = (x - b.left) / b.width;
        if (a.mirror) fx = 1 - fx;
        const px = Math.min(a.cw - 1, Math.floor(fx * a.cw)), py = Math.min(a.ch - 1, Math.floor(((y - b.top) / b.height) * a.ch));
        if (a.data[(py * a.cw + px) * 4 + 3] >= 128) hit++;
      }
      return hit / 32;
    };
    const kind = c => (c.classList.contains('piece') ? 'card' : c.classList.contains('pop') ? 'pop-out' : `art "${c.dataset.asset ?? ''}"`);
    for (const device of document.querySelectorAll('.device[data-shot]')) {
      const screen = device.querySelector('.device-screen'), list = S.words[device.dataset.shot];
      if (!screen || !list?.length) continue;
      const own = [...device.querySelectorAll(':scope > .pop')].map(p => (p.dataset.crop ?? '').trim().split(/[\s,]+/).map(Number));
      const marks = list.map(([x, y, w, h, text]) => {
        const m = document.createElement('i');
        Object.assign(m.style, { position: 'absolute', left: `${(x / S.device.width) * 100}%`, top: `${(y / S.device.height) * 100}%`, width: `${(w / S.device.width) * 100}%`, height: `${(h / S.device.height) * 100}%` });
        screen.append(m);
        return { m, text, box: [x, y, w, h] };
      });
      const rects = marks.map(({ m }) => m.getBoundingClientRect());
      marks.forEach(({ m }) => m.remove());
      // The slide the phone shows on: its spread half's, else its own (else where its middle is).
      const given = (device.closest('.spread-half') ?? device).style.getPropertyValue('--i').trim(), box = device.getBoundingClientRect();
      const i = given ? Number(given) : Math.floor((box.left + box.width / 2) / W), slide = slides[i]?.id ?? null;
      const x0 = i * W, x1 = (i + 1) * W, onSlide = covers.filter(c => (c.classList.contains('pop') ? c.parentElement === device : Number(c.style.getPropertyValue('--i')) === i));
      for (const [k, { text, box: [x, y, w, h] }] of marks.entries()) {
        const r = rects[k];
        if (r.bottom < slideBox.top || r.top > slideBox.bottom || r.width < 1 || r.right < x0 || r.left > x1) continue;
        if (own.some(([px, py, pw, ph]) => x >= px - 8 && y >= py - 8 && x + w <= px + pw + 8 && y + h <= py + ph + 8)) continue;
        if ([x0, x1].some(edge => r.left < edge - 2 && r.right > edge + 2)) add('screen-text-cut', slide, text);
        // What shows of the word on its slide, and a little round it (touching counts).
        const left = Math.max(r.left, x0), right = Math.min(r.right, x1), seen = { left, right, top: r.top, bottom: r.bottom, width: right - left, height: r.height };
        const grown = { left: left - pad, right: right + pad, top: r.top - pad, bottom: r.bottom + pad, width: right - left + 2 * pad, height: r.height + 2 * pad };
        for (const c of onSlide) if (share(c, grown) > 0 && share(c, seen) < 0.9) add('cover-hides-text', slide, text, kind(c));
      }
    }
  }

  // The sides of a cut-out where its subject runs into the picture's border (a run of opaque
  // pixels along 2 % of it or more): where its photo was cropped. Trimmed art keeps a clear
  // margin round a whole subject, so even a short run means a cut (a bin's side cropped for 9 %
  // of the picture's height still shows as a straight line). A picture opaque all round (a
  // photo, a card) is a rectangle, not a cut-out.
  function flatSides(img) {
    if (img.tagName !== 'IMG' || !img.naturalWidth) return [];
    const W = img.naturalWidth, H = img.naturalHeight;
    const run = (sx, sy, sw, sh) => {
      const c = document.createElement('canvas'); c.width = sw; c.height = sh;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      let px;
      try { px = ctx.getImageData(0, 0, sw, sh).data; } catch { return 0; }
      let best = 0, now = 0;
      for (let k = 3; k < px.length; k += 4) { now = px[k] >= 128 ? now + 1 : 0; best = Math.max(best, now); }
      return best / (sw * sh);
    };
    const share = { top: run(0, 0, W, 1), bottom: run(0, H - 1, W, 1), left: run(0, 0, 1, H), right: run(W - 1, 0, 1, H) };
    const flat = Object.keys(share).filter(side => share[side] >= 0.02);
    if (flat.length === 4) return [];
    return /^-1/.test(getComputedStyle(img).scale) ? flat.map(side => ({ left: 'right', right: 'left' })[side] ?? side) : flat;
  }

  window.__kit = (async () => {
    fill();
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {
      problems.push({ type: 'image-failed', src: decodeURIComponent(img.src).slice(-160), slide: slideOf(img) });
    })));
    toneGlows();
    zoomDevices();
    matteSurfaces();
    fitDevices();
    centrePops();
    evenOnScreen();
    keepPopsInside();
    placePieces();
    if (window.beforeFit) await window.beforeFit(S);
    const texts = fit();
    roomForPeeks();
    if (window.afterFit) await window.afterFit(S);
    const slides = [...document.querySelectorAll('.slide')].map((el, i) => ({ id: el.id || `slide-${i + 1}` }));
    await pieceProblems(slides);
    screenProblems(slides);
    // Phone geometry for `check`: its own size (before any pose) and where it sits in its slide.
    const slideBox = document.querySelector('.slide')?.getBoundingClientRect();
    const devices = slideBox ? [...document.querySelectorAll('.device:not(.twin)')].map(el => {
      const r = el.getBoundingClientRect(), i = Math.floor((r.left + r.width / 2) / slideBox.width);
      return { slide: slides[i]?.id ?? null, layout: [...el.classList].find(c => c.startsWith('d-'))?.slice(2) ?? null, width: el.offsetWidth,
        top: Math.round(r.top), bottom: Math.round(r.bottom), slideHeight: Math.round(slideBox.height),
        visible: (([l, rr]) => [Math.round(l - i * slideBox.width), Math.round(rr - i * slideBox.width)])(visibleExtent(el, slideBox.top, slideBox.bottom)), slideWidth: Math.round(slideBox.width), pose: el.classList.contains('is-3d') || /rotate|matrix/.test(getComputedStyle(el).transform + getComputedStyle(el).rotate) };
    }) : [];
    // Pop-out overhang past the phone's edges at the pop's height, for `check`.
    const pops = [...document.querySelectorAll('.device > .pop')].map(el => {
      const device = el.parentElement, r = el.getBoundingClientRect(), [left, right] = phoneEdgesAt(device, el.offsetTop + el.offsetHeight / 2);
      const i = slideBox ? Math.floor((device.getBoundingClientRect().left + device.getBoundingClientRect().width / 2) / slideBox.width) : 0;
      return { slide: slides[i]?.id ?? null, left: Math.round(left - r.left), right: Math.round(r.right - right), phone: Math.round(right - left) };
    });
    // Art cut by its slide's edge (a mascot losing its head): data-cross when it is meant to.
    // A cut-out is the other way round: where its photo was cropped (a person cut at the waist),
    // the slide's edge has to hide that straight line.
    if (slideBox) for (const el of document.querySelectorAll('.art, .closer-art')) {
      if (el.hasAttribute('data-cross')) continue;
      const r = el.getBoundingClientRect(), i = Math.floor((r.left + r.width / 2) / slideBox.width);
      const past = { left: i * slideBox.width - r.left, right: r.right - (i + 1) * slideBox.width, top: slideBox.top - r.top, bottom: r.bottom - slideBox.bottom };
      const flat = flatSides(el), slide = slides[i]?.id ?? null, asset = el.dataset.asset ?? null;
      const over = Math.max(...Object.entries(past).filter(([side]) => !flat.includes(side)).map(([, by]) => by));
      if (over > 2) problems.push({ type: 'art-cut-by-edge', slide, asset, by: Math.round(over), warn: true });
      const shows = flat.filter(side => past[side] < -2);
      if (shows.length) problems.push({ type: 'art-flat-edge', slide, asset, sides: shows, warn: true });
    }
    // How far art is blown up past its own pixels (captures and bezels are sized exactly;
    // vectors scale freely).
    const images = slideBox ? [...document.querySelectorAll('img')].filter(img => !img.closest('.device-screen') && !img.classList.contains('device-bezel') && !img.hasAttribute('data-shot') && img.naturalWidth && !/\.svg(\?|$)/i.test(img.src)).map(img => {
      const r = img.getBoundingClientRect(), i = Math.floor((r.left + r.width / 2) / slideBox.width);
      const fit = getComputedStyle(img).objectFit, sx = img.offsetWidth / img.naturalWidth, sy = img.offsetHeight / img.naturalHeight;
      const css = fit === 'cover' ? Math.max(sx, sy) : fit === 'contain' || fit === 'scale-down' ? Math.min(sx, sy) : Math.max(sx, sy);
      const scale = (r.width / (img.offsetWidth || 1)) || 1; // transforms (scale, 3D lift)
      return { slide: slides[i]?.id ?? null, asset: img.dataset.asset ?? null, src: decodeURIComponent(img.src).split('/').slice(-2).join('/'), natural: [img.naturalWidth, img.naturalHeight], upscale: Math.round(css * scale * 100) / 100 };
    }).filter(x => x.slide && x.upscale > 0) : [];
    return { slides, texts, problems, devices, pops, images };
  })();
})();
