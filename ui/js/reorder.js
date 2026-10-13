// Shared clean-up for reordering scenes (story board drops, navigator drags, Alt+Shift+↑/↓).
//
// Moving a scene moves its paragraphs as a block. Two things must not travel with it:
//  - the script's closing lines ("THE END", "FADE OUT.") stay at the very end;
//  - blank paragraphs at the edges of a block, which would leave double or missing gaps once the
//    block lands elsewhere. Spacing before scene headings comes from the element (two blank lines,
//    as in Final Draft), never from typed blank lines.

const ENDING = /^(the end|end|fade out\.?|fade to black\.?|cut to black\.?|smash to black\.?|end credits\.?)$/i;

const text = (p) => (p.runs || []).map((r) => r.x).join('').trim();
const isBlank = (p) => !p.dual && text(p) === '' && p.t !== 'section' && p.t !== 'scene';

/** Split off the closing lines at the end of the script (and blank lines among them). */
export function splitEnding(paras) {
  let k = paras.length;
  while (k > 0) {
    const p = paras[k - 1];
    if (isBlank(p) || ((p.t === 'transition' || p.t === 'centered' || p.t === 'action') && ENDING.test(text(p)))) k--;
    else break;
  }
  // only treat them as an ending if at least one closing line was found
  const tail = paras.slice(k);
  if (!tail.some((p) => !isBlank(p))) return { body: paras, ending: [] };
  return { body: paras.slice(0, k), ending: tail.filter((p) => !isBlank(p)) };
}

/** Remove blank paragraphs that sit directly before a scene heading or section, and runs of blanks. */
export function tidyGaps(paras) {
  const out = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (isBlank(p)) {
      const next = paras.slice(i + 1).find((q) => !isBlank(q));
      if (!next || next.t === 'scene' || next.t === 'section') continue;
      if (out.length && isBlank(out[out.length - 1])) continue;
    }
    out.push(p);
  }
  return out;
}

/** Trim blank paragraphs from both ends of a moved block (its first paragraph is its heading). */
export function trimBlock(block) {
  let a = 0, b = block.length;
  while (b > 1 && isBlank(block[b - 1])) b--;
  // keep the heading itself even if empty
  while (a + 1 < b && a > 0 && isBlank(block[a])) a++;
  return block.slice(a, b);
}

/** Final pass after any reorder: closing lines back at the end, gaps tidied. */
export function finishReorder(paras, ending = []) {
  return tidyGaps(paras.concat(ending));
}
