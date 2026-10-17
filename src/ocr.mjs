// OCR (optional, tesseract): the words of a capture with their boxes, and the size of the
// text inside a box, so a cut-out can be made big enough to read.
import { execFileSync } from 'node:child_process';

const TESS_LANG = { en: 'eng', pl: 'pol', de: 'deu', fr: 'fra', es: 'spa', it: 'ita', pt: 'por', nl: 'nld', sv: 'swe', da: 'dan', nb: 'nor', fi: 'fin', cs: 'ces', sk: 'slk', hu: 'hun', ro: 'ron', tr: 'tur', ru: 'rus', uk: 'ukr', ja: 'jpn', ko: 'kor', zh: 'chi_sim' };
let installedLangs;
export function ocrLanguages() {
  if (installedLangs === undefined) {
    try { installedLangs = execFileSync('tesseract', ['--list-langs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').slice(1).map(s => s.trim()).filter(Boolean); }
    catch { installedLangs = null; }
  }
  return installedLangs;
}

/** Words with boxes and confidence (0–100), or null without tesseract. */
export function ocr(file, locale = 'en') {
  const langs = ocrLanguages();
  if (!langs) return null;
  const wanted = [TESS_LANG[locale.split(/[-_]/)[0]], 'eng'].filter((l, i, a) => l && langs.includes(l) && a.indexOf(l) === i);
  const tsv = execFileSync('tesseract', [file, 'stdout', '--psm', '11', '-l', wanted.join('+') || 'eng', 'tsv'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 << 20 });
  return tsv.split('\n').slice(1).map(line => line.split('\t')).filter(c => c.length >= 12 && Number(c[10]) > 40 && c[11].trim())
    .map(c => ({ text: c[11].trim(), box: [Number(c[6]), Number(c[7]), Number(c[8]), Number(c[9])], conf: Number(c[10]) }));
}

const cache = new Map();
const ocrCached = (file, locale) => {
  const key = `${file}\n${locale}`;
  if (!cache.has(key)) cache.set(key, ocr(file, locale));
  return cache.get(key);
};

// A word's cap height in px from its box: the box runs from the top of the tallest letter to
// the bottom of the lowest, so descenders (g, p, y) make it about 1/0.74 of the cap height and
// words of x-height letters only say little. Words in pills come out as tall as the pill:
// width per letter caps it.
function capOf({ text, box: [, , w, h] }) {
  const letters = [...text.replace(/[^\p{L}\p{N}]/gu, '')].length || 1, byWidth = (w / letters) * 1.35;
  const byHeight = /[gjpqyQ(),;[\]{}|ąęç]/u.test(text) ? h * 0.74 : /[\p{Lu}\p{N}bdfhkltłż]/u.test(text) ? h * 0.97 : null;
  return byHeight == null ? { cap: byWidth, sure: false } : { cap: Math.min(byHeight, byWidth * 1.6), sure: true };
}
// Real words, not icons read as letters: three letters, or a number tesseract is sure of.
const isWord = wd => /\p{L}{3,}/u.test(wd.text) || (/\p{N}/u.test(wd.text) && wd.conf > 80);

/**
 * The text inside a box of a capture, in capture px: { key (cap height of its biggest line),
 * min (of its smallest), words, lines }, or null without tesseract or without words.
 */
export function textIn(file, box, locale = 'en') {
  const all = ocrCached(file, locale);
  if (!all) return null;
  const [x, y, w, h] = box, m = 4;
  return textStats(all.filter(wd => wd.box[0] >= x - m && wd.box[1] >= y - m && wd.box[0] + wd.box[2] <= x + w + m && wd.box[1] + wd.box[3] <= y + h + m));
}

/** textIn for words already picked: their lines and cap heights, or null. */
export function textStats(found) {
  const words = found.filter(isWord);
  if (!words.length) return null;
  const lines = [];
  for (const wd of [...words].sort((a, b) => a.box[1] + a.box[3] / 2 - (b.box[1] + b.box[3] / 2))) {
    const cy = wd.box[1] + wd.box[3] / 2, line = lines.find(l => Math.abs(l.cy - cy) < Math.min(l.h, wd.box[3]) * 0.5);
    if (line) line.words.push(wd); else lines.push({ cy, h: wd.box[3], words: [wd] });
  }
  const sized = lines.map(l => {
    const caps = l.words.map(capOf), sure = caps.filter(c => c.sure);
    const sorted = (sure.length ? sure : caps).map(c => c.cap).sort((a, b) => a - b);
    return { text: l.words.map(wd => wd.text).join(' '), cap: Math.round(sorted[Math.floor(sorted.length / 2)]) };
  });
  return { key: Math.max(...sized.map(l => l.cap)), min: Math.min(...sized.map(l => l.cap)), words: words.length, lines: sized };
}

/**
 * The words on a capture that a reader would notice cut or half-covered: real words read with
 * some confidence, as [x, y, w, h, text] in capture px. [] without tesseract.
 */
export function screenWords(file, locale = 'en') {
  return (ocrCached(file, locale) ?? []).filter(wd => isWord(wd) && wd.conf >= 60).map(wd => [...wd.box, wd.text]);
}
