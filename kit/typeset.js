/*
  Microtypography for the copy, applied before it is set: done in code so the copy files stay
  plain and every locale gets the same care.
    ...            → …
    12-18, 9:00-17:00   → en dash
    " - "          → " – "
    5 min, 30 %    → the number never ends a line on its own (no-break space)
    pl, cs, sk     → one-letter words (w, z, i, a…) never end a line
    pl             → "…" → „…”; de → „…“; fr → « … »
*/
// eslint-disable-next-line no-unused-vars
function typeset(text, locale) {
  const lang = String(locale ?? '').toLowerCase().split(/[-_]/)[0];
  const NBSP = '\u00a0';
  let t = String(text)
    .replace(/\.\.\./g, '…')
    .replace(/(?<![\d\-–:])(\d{1,4}(?::\d\d)?)-(\d{1,4}(?::\d\d)?)(?![\d\-–:])/g, '$1–$2')
    .replace(/ - /g, ' – ')
    .replace(/(\d) (?=\S)/g, `$1${NBSP}`);
  const single = { pl: 'aiouwzAIOUWZ', cs: 'aikosuvzAIKOSUVZ', sk: 'aikosuvzAIKOSUVZ' }[lang];
  if (single) t = t.replace(new RegExp(`(^|[\\s(„"*])([${single}]) `, 'g'), `$1$2${NBSP}`).replace(new RegExp(`(^|[\\s(„"*])([${single}]) `, 'g'), `$1$2${NBSP}`);
  const quotes = { pl: ['„', '”'], de: ['„', '“'], cs: ['„', '“'], sk: ['„', '“'], fr: [`«${NBSP}`, `${NBSP}»`] }[lang];
  if (quotes) t = t.replace(/"([^"\n]+)"/g, `${quotes[0]}$1${quotes[1]}`);
  return t;
}
