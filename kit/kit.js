/*
  Fills a design from window.SHOTS, then fits the text. The renderer awaits
  window.__kit, which resolves to { slides, texts, problems }.

  Markup a design can use:
    <section class="slide" id="hero">                one store screenshot, in order
    <h1 data-text="hero.title" data-fit data-role="title" data-lines="2" data-min="110">
        copy/<locale>.json value; *word* → <em>, \n → line break; shrinks until it
        fits its width, data-lines and (if set) its CSS max-height
    <div class="device" data-shot="upcoming" [data-frame="iphone-18-pro-max/silver"]>
        <div class="pop" data-crop="x y w h" [data-radius="43"]>   pop-out, see below
        capture inside the Apple bezel (width from CSS, height from the bezel)
    <div class="screen" data-shot="upcoming">       capture alone, device aspect ratio
    <img data-shot="upcoming">                       capture as a plain image
    <div class="zoom" data-shot="upcoming" data-crop="x y w h">
        crop of the capture in capture pixels, scaled to the element's width
    <img data-app-icon>, <span data-app-name>        from screenshots.json "app"
  Hooks: window.beforeFit / window.afterFit (async) for design-specific layout.
*/
(() => {
  const S = window.SHOTS;
  const MATTE_MARGIN = 12; // capture px around a surface pop: room for the rim and the keyed edge
  const problems = [];
  const lookup = (object, path) => path.split('.').reduce((o, key) => o?.[key], object);
  const escape = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rich = text => escape(text).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
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
      const slide = el.closest('.slide'), box = el.getBoundingClientRect(), frame = slide?.getBoundingClientRect();
      texts.push({
        key: el.dataset.text, slide: slide?.id ?? null, role: el.dataset.role ?? 'text',
        startSize: start, fontSize: parseFloat(getComputedStyle(el).fontSize), lines: lineCount(el),
        overflow: overflows(el, maxLines),
        outsideSlide: frame ? box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1 : false,
        box: frame ? { x: Math.round(box.left - frame.left), y: Math.round(box.top - frame.top), width: Math.round(box.width), height: Math.round(box.height) } : null,
        color: textColour(el),
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

  window.__kit = (async () => {
    fill();
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {
      problems.push({ type: 'image-failed', src: decodeURIComponent(img.src).slice(-160), slide: slideOf(img) });
    })));
    toneGlows();
    matteSurfaces();
    fitDevices();
    centrePops();
    evenOnScreen();
    keepPopsInside();
    if (window.beforeFit) await window.beforeFit(S);
    const texts = fit();
    if (window.afterFit) await window.afterFit(S);
    const slides = [...document.querySelectorAll('.slide')].map((el, i) => ({ id: el.id || `slide-${i + 1}` }));
    // Phone geometry for `check`: its own size (before any pose) and where it sits in its slide.
    const slideBox = document.querySelector('.slide')?.getBoundingClientRect();
    const devices = slideBox ? [...document.querySelectorAll('.device')].map(el => {
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
    return { slides, texts, problems, devices, pops };
  })();
})();
