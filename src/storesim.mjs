// A simulated App Store on an iPhone screen at real size (440×956 pt): the search results
// with the app between real competitors, and its product page with the screenshot carousel.
// Light and dark. Interactive in a browser (scroll, swipe the carousel, tap the result, the
// moon switch), so a set is judged where it will be seen, next to what it competes with.
//
// A listing: { name, subtitle, icon, rating, ratings, seller, shots: [url…], ours? }.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const T = {
  en: { search: 'Search', get: 'Get', ratings: n => `${n} Ratings`, age: 'Age', years: '4+', chart: 'Chart', developer: 'Developer', preview: 'Preview', whatsNew: "What's New", version: 'Version 2.4', description: 'Description', today: 'Today', games: 'Games', apps: 'Apps', arcade: 'Arcade' },
  pl: { search: 'Szukaj', get: 'Pobierz', ratings: n => `Oceny: ${n}`, age: 'Wiek', years: '4+', chart: 'Ranking', developer: 'Twórca', preview: 'Podgląd', whatsNew: 'Co nowego', version: 'Wersja 2.4', description: 'Opis', today: 'Dzisiaj', games: 'Gry', apps: 'Aplikacje', arcade: 'Arcade' },
};

const count = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n ?? 0));
const stars = r => [0, 1, 2, 3, 4].map(i => `<i style="--f:${Math.max(0, Math.min(1, (r ?? 4.6) - i)) * 100}%"></i>`).join('');

function icon(l, size) {
  return l.icon ? `<img class="icon" src="${esc(l.icon)}" style="width:${size}px;height:${size}px;border-radius:${size * 0.225}px">`
    : `<div class="icon" style="width:${size}px;height:${size}px;border-radius:${size * 0.225}px;background:linear-gradient(135deg,#9aa,#677)"></div>`;
}

function result(l, t, i) {
  return `<section class="result${l.ours ? ' ours' : ''}" ${l.ours ? 'onclick="show(\'page\')"' : ''}>
    <div class="row">${icon(l, 62)}<div class="meta"><b>${esc(l.name)}</b><span>${esc(l.subtitle ?? l.seller ?? '')}</span><div class="stars">${stars(l.rating)}<em>${count(l.ratings)}</em></div></div><button>${t.get}</button></div>
    <div class="thumbs">${(l.shots ?? []).slice(0, 3).map(s => `<img src="${esc(s)}" loading="eager">`).join('')}</div>
  </section>`;
}

/** The whole simulator as one HTML document. */
export function storeSimHTML({ listing, competitors = [], locale = 'en', query, view = 'search', dark = false, fontBase = null }) {
  // Our app gets an ordinary, believable rating: a bare "0" would mark it out among real apps.
  const t = T[locale?.slice(0, 2)] ?? T.en, ours = { rating: 4.7, ratings: 1200, ...listing, ours: true };
  const results = [competitors[0], ours, ...competitors.slice(1)].filter(Boolean);
  const fonts = fontBase ? ['Regular:400', 'Medium:500', 'Semibold:600', 'Bold:700', 'Heavy:800'].map(w => { const [n, wt] = w.split(':'); return `@font-face{font-family:SFD;src:url("${fontBase}/SF-Pro-Display-${n}.otf");font-weight:${wt}}`; }).join('') : '';
  return `<!doctype html><html lang="${esc(locale)}"><meta charset="utf-8"><meta name="viewport" content="width=440">
<style>${fonts}
:root { --bg: #fff; --fg: #000; --grey: #8a8a8e; --fill: #efeff0; --sep: rgba(60,60,67,.18); --btn: #eeeef3; --blue: #0a7aff; --card: #fff; }
.dark { --bg: #000; --fg: #fff; --grey: #8d8d93; --fill: #1c1c1e; --sep: rgba(84,84,88,.6); --btn: #2c2c2e; --blue: #3b97ff; --card: #1c1c1e; }
* { box-sizing: border-box; } html, body { margin: 0; background: var(--bg); }
body { width: 440px; height: 956px; overflow: hidden; color: var(--fg); font-family: ${fontBase ? 'SFD, ' : ''}-apple-system, system-ui, "Inter", sans-serif; -webkit-font-smoothing: antialiased; }
.view { position: absolute; inset: 0; overflow-y: auto; scrollbar-width: none; padding-bottom: 96px; } .view::-webkit-scrollbar { display: none; }
.hidden { display: none; }
.status { height: 54px; display: flex; justify-content: space-between; align-items: center; padding: 14px 34px 0 46px; font-weight: 600; font-size: 17px; }
.status i { display: inline-block; width: 27px; height: 13px; border: 1.5px solid currentColor; border-radius: 4px; opacity: .9; }
h1 { margin: 6px 20px 0; font-size: 34px; font-weight: 700; letter-spacing: .2px; }
.field { margin: 10px 20px 4px; height: 38px; border-radius: 11px; background: var(--fill); display: flex; align-items: center; gap: 7px; padding: 0 10px; color: var(--fg); font-size: 17px; }
.field svg { flex: none; }
.result { padding: 16px 20px 18px; border-bottom: .5px solid var(--sep); }
.result.ours { cursor: pointer; }
.row { display: flex; align-items: center; gap: 12px; }
.icon { flex: none; display: block; object-fit: cover; box-shadow: 0 0 0 .5px var(--sep); }
.meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.meta b { font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta span { font-size: 13px; color: var(--grey); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stars { display: flex; align-items: center; gap: 1px; margin-top: 3px; }
.stars i { width: 11px; height: 11px; background: linear-gradient(90deg, var(--grey) var(--f), color-mix(in srgb, var(--grey) 30%, transparent) var(--f)); clip-path: polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); }
.stars em { font-style: normal; font-size: 11px; color: var(--grey); margin-left: 4px; }
button { border: 0; background: var(--btn); color: var(--blue); font-weight: 700; font-size: 15px; font-family: inherit; padding: 6px 20px; border-radius: 999px; flex: none; }
.thumbs { display: flex; gap: 8px; margin-top: 14px; }
.thumbs img { width: calc((400px - 16px) / 3); height: auto; align-self: flex-start; border-radius: 11px; border: .5px solid var(--sep); display: block; }
.head { display: flex; gap: 16px; padding: 8px 20px 0; }
.head .meta b { font-size: 21px; white-space: normal; } .head .meta span { font-size: 15px; }
.head button { background: var(--blue); color: #fff; margin-top: auto; align-self: flex-start; }
.info { display: flex; margin: 22px 0 0; padding: 12px 0; border-top: .5px solid var(--sep); border-bottom: .5px solid var(--sep); overflow: hidden; }
.info div { flex: 1; text-align: center; border-left: .5px solid var(--sep); font-size: 11px; color: var(--grey); text-transform: uppercase; letter-spacing: .3px; }
.info div:first-child { border: 0; } .info b { display: block; font-size: 19px; color: var(--grey); margin: 3px 0 1px; text-transform: none; letter-spacing: 0; }
h2 { margin: 22px 20px 12px; font-size: 22px; font-weight: 700; }
.carousel { display: flex; gap: 10px; overflow-x: auto; padding: 0 20px; scroll-snap-type: x mandatory; scroll-padding: 20px; scrollbar-width: none; }
.carousel::-webkit-scrollbar { display: none; }
.carousel img { width: 232px; height: auto; align-self: flex-start; flex: none; border-radius: 20px; border: .5px solid var(--sep); scroll-snap-align: start; display: block; }
.text { margin: 0 20px; color: var(--grey); font-size: 15px; line-height: 1.4; }
.back { color: var(--blue); font-size: 17px; padding: 4px 14px 0; cursor: pointer; display: inline-block; }
.tabs { position: absolute; left: 0; right: 0; bottom: 0; height: 84px; display: flex; justify-content: space-around; padding-top: 10px; font-size: 10px; color: var(--grey);
  background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(20px); border-top: .5px solid var(--sep); }
.tabs span { display: flex; flex-direction: column; align-items: center; gap: 4px; } .tabs span::before { content: ""; width: 26px; height: 22px; border-radius: 7px; background: currentColor; opacity: .55; }
.tabs .on { color: var(--blue); } .tabs .on::before { opacity: 1; }
</style>
<body class="${dark ? 'dark' : ''}">
<div class="view${view === 'search' ? '' : ' hidden'}" id="search">
  <div class="status"><span>9:41</span><i></i></div>
  <h1>${t.search}</h1>
  <div class="field"><svg width="16" height="16" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="5" fill="none" stroke="currentColor" stroke-width="2" opacity=".6"/><path d="M10.5 10.5 15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".6"/></svg>${esc(query ?? listing.name)}</div>
  ${results.map((l, i) => result(l, t, i)).join('\n')}
</div>
<div class="view${view === 'page' ? '' : ' hidden'}" id="page">
  <div class="status"><span>9:41</span><i></i></div>
  <span class="back" onclick="show('search')">‹ ${t.search}</span>
  <div class="head">${icon(ours, 118)}<div class="meta"><b>${esc(ours.name)}</b><span>${esc(ours.subtitle ?? '')}</span><button>${t.get}</button></div></div>
  <div class="info"><div>${t.ratings(count(ours.ratings ?? 1200))}<b>${(ours.rating ?? 4.7).toFixed(1)}</b><span class="stars" style="justify-content:center">${stars(ours.rating)}</span></div><div>${t.age}<b>${t.years}</b></div><div>${t.chart}<b>#12</b></div><div>${t.developer}<b style="font-size:14px;margin-top:7px">${esc((ours.seller ?? ours.name).split(/[\s:,–-]/)[0])}</b></div></div>
  <h2>${t.preview}</h2>
  <div class="carousel">${(ours.shots ?? []).map(s => `<img src="${esc(s)}">`).join('')}</div>
  <h2>${t.whatsNew}</h2><p class="text">${t.version}</p>
  <h2>${t.description}</h2><p class="text">${esc(ours.description ?? ours.subtitle ?? '')}</p>
</div>
<nav class="tabs"><span>${t.today}</span><span>${t.games}</span><span>${t.apps}</span><span>${t.arcade}</span><span class="on">${t.search}</span></nav>
<script>
function show(v) { for (const id of ['search', 'page']) document.getElementById(id).classList.toggle('hidden', id !== v); parent.postMessage({ view: v }, '*'); }
addEventListener('message', e => { if (e.data?.dark !== undefined) document.body.classList.toggle('dark', e.data.dark); if (e.data?.view) show(e.data.view); });
</script>`;
}
