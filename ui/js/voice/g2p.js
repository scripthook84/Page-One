// Text → phonemes for the built-in voices, in the phoneme alphabet Kokoro was trained on.
// Words come from the bundled pronunciation dictionary (misaki, Apache-2.0, plus the CMU
// Pronouncing Dictionary, BSD-2-Clause, for names); anything missing falls back to spelling
// rules. Screenplay shorthand (INT., EXT., V.O., CUT TO:) is read the way a narrator would.

let LEX = null;

export function setLexicon(obj) { LEX = obj; }
export function hasLexicon() { return !!LEX; }

// ------------------------------------------------------------------ text clean-up

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function under100(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''); }
function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + ' hundred' + (r ? ' and ' : '') : '') + (r || !h ? under100(r) : '');
}
export function numberWords(n) {
  if (n === 0) return 'zero';
  const parts = [];
  for (const [v, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
    if (n >= v) { parts.push(under1000(Math.floor(n / v)) + ' ' + name); n %= v; }
  }
  if (n) parts.push(under1000(n));
  return parts.join(' ');
}
function yearWords(y) {
  const a = Math.floor(y / 100), b = y % 100;
  if (y >= 2000 && y < 2010) return numberWords(y);
  return under100(a) + ' ' + (b === 0 ? 'hundred' : b < 10 ? 'oh ' + ONES[b] : under100(b));
}
const ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
function ordinal(n) {
  const w = numberWords(n), last = w.split(/[\s-]/).pop();
  const o = ORD[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
  return w.slice(0, w.length - last.length) + o;
}

const ABBR = [
  [/\bMr\./g, 'Mister'], [/\bMrs\./g, 'Missus'], [/\bMs\./g, 'Miz'], [/\bDr\./g, 'Doctor'], [/\bSt\./g, 'Saint'],
  [/\bJr\./g, 'Junior'], [/\bSr\./g, 'Senior'], [/\bvs\.?/gi, 'versus'], [/\betc\./gi, 'et cetera'], [/\bOK\b/g, 'okay'],
  [/\bTV\b/g, 'T V'], [/\bFBI\b/g, 'F B I'], [/\bCIA\b/g, 'C I A'], [/\bUSA\b/g, 'U S A'], [/\bLA\b/g, 'L A'], [/\bNYC\b/g, 'New York City'],
  [/&/g, ' and '], [/%/g, ' percent'], [/\$(\d+)/g, '$1 dollars'], [/#/g, 'number '],
];

/** Plain words a narrator would say for a line of a given element. */
export function speakable(text, element) {
  let t = String(text || '');
  if (element === 'scene') {
    t = t.replace(/^\s*(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?)\s*/i, 'Interior, exterior. ')
      .replace(/^\s*INT\.?\s+/i, 'Interior. ').replace(/^\s*EXT\.?\s+/i, 'Exterior. ').replace(/^\s*EST\.?\s+/i, 'Establishing. ')
      .replace(/\s+[-–—]+\s+/g, '. ').replace(/\(([^)]*)\)/g, ', $1');
    t = t.toLowerCase().replace(/(^|[.,]\s*)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }
  if (element === 'transition') t = t.replace(/:\s*$/, '.').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  for (const [re, w] of ABBR) t = t.replace(re, w);
  t = t.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, (m, n) => ordinal(+n));
  // decades and ages: 30s → thirties, '80s → eighties
  t = t.replace(/['’]?\b([2-9]0)s\b/g, (m, n) => numberWords(+n).replace(/y$/, 'ies'));
  t = t.replace(/\b(1[0-9]|20)(\d\d)s\b/g, (m, a, b) => yearWords(+(a + b)).replace(/y$/, 'ie') + 's');
  t = t.replace(/\b(1[1-9]\d\d|20\d\d)\b/g, (m) => yearWords(+m));
  t = t.replace(/\b(\d+):(\d\d)\b/g, (m, h, mm) => numberWords(+h) + ' ' + (+mm === 0 ? "o'clock" : +mm < 10 ? 'oh ' + numberWords(+mm) : numberWords(+mm)));
  t = t.replace(/\b\d{1,3}(,\d{3})+\b/g, (m) => numberWords(+m.replace(/,/g, '')));
  t = t.replace(/\b\d+\b/g, (m) => numberWords(+m));
  t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s*--\s*/g, ' — ').replace(/\.{3}/g, '…');
  // brackets read as a short pause
  t = t.replace(/\s*\(\s*/g, ', ').replace(/\s*\)\s*([.,!?;:]?)/g, (m, p) => (p || ',') + ' ').replace(/,\s*([.,!?;:])/g, '$1').replace(/^,\s*/, '');
  return t.replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------------ words → phonemes

const LETTERS = { a: 'ˈA', b: 'bˈi', c: 'sˈi', d: 'dˈi', e: 'ˈi', f: 'ˈɛf', g: 'ʤˈi', h: 'ˈAʧ', i: 'ˈI', j: 'ʤˈA', k: 'kˈA', l: 'ˈɛl', m: 'ˈɛm', n: 'ˈɛn', o: 'ˈO', p: 'pˈi', q: 'kjˈu', r: 'ˈɑɹ', s: 'ˈɛs', t: 'tˈi', u: 'jˈu', v: 'vˈi', w: 'dˈʌbᵊljˌu', x: 'ˈɛks', y: 'wˈI', z: 'zˈi' };

// spelling rules for words the dictionaries lack (rare names, invented words)
const RULES = [
  ['tion', 'ʃən'], ['sion', 'ʒən'], ['ough', 'ɔ'], ['augh', 'ɔ'], ['eigh', 'A'], ['igh', 'I'], ['tch', 'ʧ'], ['dge', 'ʤ'],
  ['sch', 'sk'], ['ch', 'ʧ'], ['sh', 'ʃ'], ['th', 'θ'], ['ph', 'f'], ['wh', 'w'], ['ck', 'k'], ['ng', 'ŋ'], ['qu', 'kw'], ['gh', 'ɡ'],
  ['ee', 'i'], ['ea', 'i'], ['oo', 'u'], ['ai', 'A'], ['ay', 'A'], ['oa', 'O'], ['oe', 'O'], ['ou', 'W'], ['ow', 'O'], ['oi', 'Y'], ['oy', 'Y'],
  ['au', 'ɔ'], ['aw', 'ɔ'], ['ew', 'u'], ['ie', 'i'], ['ue', 'u'], ['ui', 'u'], ['ar', 'ɑɹ'], ['er', 'əɹ'], ['ir', 'ɜɹ'], ['or', 'ɔɹ'], ['ur', 'ɜɹ'],
  ['a', 'æ'], ['e', 'ɛ'], ['i', 'ɪ'], ['o', 'ɑ'], ['u', 'ʌ'], ['y', 'i'],
  ['b', 'b'], ['c', 'k'], ['d', 'd'], ['f', 'f'], ['g', 'ɡ'], ['h', 'h'], ['j', 'h'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['p', 'p'],
  ['r', 'ɹ'], ['s', 's'], ['t', 't'], ['v', 'v'], ['w', 'w'], ['x', 'ks'], ['z', 'z'],
];
const VOWEL = /[ɑæʌɔəɛɜɪiuʊAIOWYaeiou]/;

export function spell(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  // silent final e lengthens the vowel before it (cake, mine, rope)
  let magic = null;
  const m = w.match(/^(.*?)([aeiou])([bcdfgklmnprstvz])e$/);
  if (m && m[1].length) { magic = { a: 'A', e: 'i', i: 'I', o: 'O', u: 'u' }[m[2]]; w = m[1] + '\u0001' + m[3]; }
  let out = '';
  for (let i = 0; i < w.length;) {
    if (w[i] === '\u0001') { out += magic; i++; continue; }
    if (w[i] === 'c' && /[eiy]/.test(w[i + 1] || '')) { out += 's'; i++; continue; }
    if (w[i] === 'g' && /[eiy]/.test(w[i + 1] || '') && i > 0) { out += 'ʤ'; i++; continue; }
    if (w[i] === 'y' && i === 0) { out += 'j'; i++; continue; }
    if (w[i] === 'y' && i === w.length - 1 && w.length > 2) { out += 'i'; i++; continue; }
    const r = RULES.find(([g]) => w.startsWith(g, i));
    if (!r) { i++; continue; }
    // doubled consonants sound once
    if (out && r[1] === out.slice(-r[1].length) && !VOWEL.test(r[1])) { i += r[0].length; continue; }
    out += r[1];
    i += r[0].length;
  }
  const v = out.search(VOWEL);
  return v < 0 ? out : out.slice(0, v) + 'ˈ' + out.slice(v);
}

function look(w) {
  if (!LEX) return null;
  return LEX[w] || LEX[w.toLowerCase()] || LEX[w[0].toUpperCase() + w.slice(1).toLowerCase()] || null;
}

const VOICELESS = /[ptkfθ]$/;
const SIBILANT = /(s|z|ʃ|ʒ|ʧ|ʤ)$/;

export function wordPhonemes(word) {
  if (!word) return '';
  const hit = look(word);
  if (hit) return hit;
  // possessive and contracted forms
  const pos = word.match(/^(.+?)['’]s$/i);
  if (pos) {
    const base = wordPhonemes(pos[1]);
    return base + (SIBILANT.test(base) ? 'ᵻz' : VOICELESS.test(base) ? 's' : 'z');
  }
  if (/-/.test(word)) return word.split('-').filter(Boolean).map(wordPhonemes).join(' ');
  // short all-capital words that aren't in the dictionary are spelled out (FBI, NYPD)
  if (/^[A-Z]{2,4}$/.test(word)) return [...word.toLowerCase()].map((c) => LETTERS[c]).join(' ');
  // plural of a known word
  const pl = word.match(/^(.+?)(e?s)$/i);
  if (pl) { const b = look(pl[1]); if (b) return b + (SIBILANT.test(b) ? 'ᵻz' : VOICELESS.test(b) ? 's' : 'z'); }
  return spell(word);
}

const PUNCT = new Set([',', '.', '!', '?', ';', ':', '—', '…', '"', '(', ')']);

/** Phonemes for a clean line of text, with punctuation kept for phrasing. */
export function phonemize(text) {
  const tokens = text.match(/[A-Za-zÀ-ÿ]+(?:['’-][A-Za-zÀ-ÿ]+)*|[,.!?;:—…"()]/g) || [];
  let out = '';
  for (const tok of tokens) {
    if (PUNCT.has(tok)) { out = out.replace(/ $/, '') + tok + ' '; continue; }
    const p = wordPhonemes(tok.normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (p) out += p + ' ';
  }
  return out.trim();
}

/** Split phonemes into pieces the model accepts (it takes up to 510 tokens at a time). */
export function chunks(phonemes, max = 400) {
  if (phonemes.length <= max) return phonemes ? [phonemes] : [];
  const parts = phonemes.split(/(?<=[.!?…;])\s+/);
  const out = [];
  let cur = '';
  for (let p of parts) {
    while (p.length > max) {
      const cut = p.lastIndexOf(' ', max) > 0 ? p.lastIndexOf(' ', max) : max;
      if (cur) { out.push(cur); cur = ''; }
      out.push(p.slice(0, cut));
      p = p.slice(cut).trim();
    }
    if ((cur + ' ' + p).trim().length > max) { out.push(cur); cur = p; } else cur = (cur + ' ' + p).trim();
  }
  if (cur) out.push(cur);
  return out;
}
