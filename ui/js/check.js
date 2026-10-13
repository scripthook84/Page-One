// Script check: finds formatting slips a reader or a producer would notice.
// Pure function over the paragraphs, so it is easy to test; the dialog lives in dialogs.js.

import { cueName } from './elements.js';

const textOf = (p) => (p.runs || []).map((r) => r.x).join('');
const SPEECH = new Set(['paren', 'dialogue', 'lyric']);
const HEADING = /^(int\.?\/ext\.?|ext\.?\/int\.?|i\/e\.?|int\.|ext\.|int |ext |est\.|est )/i;
const ENDING = /^(the end|end|fade out\.?|fade to black\.?|cut to black\.?)$/i;

function dist(a, b) {
  // edit distance (with swapped letters), small strings only
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    // two neighbouring letters swapped (OTSI for OTIS) count as one slip
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}

/**
 * Returns issues in script order: { i, level: 'error' | 'warn' | 'tip', kind, msg, fix? }.
 * `fix` is { type: 'delete' } or { type: 'rename', to } when the slip can be put right in one click.
 */
export function checkScript(paras) {
  const out = [];
  const printable = (p) => p && p.t !== 'section' && p.t !== 'note';
  const nextPrintable = (i) => { for (let k = i + 1; k < paras.length; k++) if (printable(paras[k])) return k; return -1; };
  const prevPrintable = (i) => { for (let k = i - 1; k >= 0; k--) if (printable(paras[k])) return k; return -1; };

  // character names and how often each is used
  const counts = new Map();
  for (const p of paras) if (p.t === 'character') { const n = cueName(textOf(p)); if (n) counts.set(n, (counts.get(n) || 0) + 1); }

  paras.forEach((p, i) => {
    if (!printable(p)) return;
    const raw = textOf(p);
    const t = raw.trim();
    const nx = nextPrintable(i), pv = prevPrintable(i);
    const next = nx >= 0 ? paras[nx] : null, prev = pv >= 0 ? paras[pv] : null;

    if (t === '' && !p.dual) {
      if (p.t === 'scene') out.push({ i, level: 'error', kind: 'heading', msg: 'Empty scene heading.', fix: { type: 'delete' } });
      else if (p.t === 'character') out.push({ i, level: 'error', kind: 'cue', msg: 'Empty character cue.', fix: { type: 'delete' } });
      else out.push({ i, level: 'warn', kind: 'blank', msg: 'Blank line typed with Enter. Spacing comes from the elements, so this adds an extra gap.', fix: { type: 'delete' } });
      return;
    }

    switch (p.t) {
      case 'scene':
        if (!HEADING.test(t)) out.push({ i, level: 'warn', kind: 'heading', msg: 'Scene heading doesn’t start with INT. or EXT.' });
        else if (!/\s[-–—]\s*\S/.test(t)) out.push({ i, level: 'tip', kind: 'heading', msg: 'Scene heading has no time of day (such as – DAY or – NIGHT).' });
        if (next && next.t === 'scene') out.push({ i, level: 'warn', kind: 'heading', msg: 'Scene has no content before the next scene heading.' });
        break;
      case 'character': {
        if (!next || !SPEECH.has(next.t)) out.push({ i, level: 'error', kind: 'cue', msg: `${cueName(t) || 'Character'} has no dialogue after the cue.` });
        if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length) out.push({ i, level: 'warn', kind: 'cue', msg: 'Character extension has an unclosed bracket, like (V.O.' });
        const name = cueName(t);
        const n = counts.get(name) || 0;
        if (name && n <= 2) {
          let best = null;
          for (const [other, c] of counts) {
            if (other === name || c < 3 || c < n * 2) continue;
            if (dist(name, other) <= (name.length > 4 ? 2 : 1) && (!best || c > counts.get(best))) best = other;
          }
          if (best) out.push({ i, level: 'warn', kind: 'name', msg: `${name} appears ${n === 1 ? 'once' : 'twice'}. Did you mean ${best}?`, fix: { type: 'rename', from: name, to: best } });
        }
        break;
      }
      case 'paren':
        if (!/^\(.*\)$/.test(t)) out.push({ i, level: 'warn', kind: 'paren', msg: 'Parenthetical isn’t wrapped in brackets.' });
        // falls through: a parenthetical must sit inside a speech too
      case 'dialogue':
      case 'lyric':
        if (!prev || !(prev.t === 'character' || SPEECH.has(prev.t))) out.push({ i, level: 'error', kind: 'speech', msg: `${p.t === 'paren' ? 'Parenthetical' : 'Dialogue'} without a character cue above it.` });
        if (p.t === 'paren' && (!next || !SPEECH.has(next.t) || next.t === 'paren')) out.push({ i, level: 'warn', kind: 'paren', msg: 'Parenthetical isn’t followed by dialogue.' });
        break;
      case 'transition':
        if (!ENDING.test(t) && next && next.t !== 'scene') out.push({ i, level: 'tip', kind: 'transition', msg: 'Transition isn’t followed by a scene heading.' });
        if (!/:$/.test(t) && !ENDING.test(t) && !/^(fade in|fade out)/i.test(t)) out.push({ i, level: 'tip', kind: 'transition', msg: 'Transitions usually end with a colon, like CUT TO:' });
        break;
      case 'action':
        if (t.length > 6 * 60) out.push({ i, level: 'tip', kind: 'action', msg: 'Long action paragraph (more than 6 lines). Shorter blocks read faster.' });
        break;
      default:
    }
  });
  return out;
}
