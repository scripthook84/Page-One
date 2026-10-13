// Production reports, laid out the way a production office reads a script:
//  - Scene report (the one-liner in script order): scene number, I/E, set, D/N, page, length in
//    eighths, cast ID numbers and names, a one-line description, and the act/sequence/beat.
//  - Cast list with ID numbers (1 = the part in the most scenes), speeches, words, pages, first
//    and last scene.
//  - Cast by scene: the cross-plot an AD builds the Day Out of Days from.
//  - Sets and locations: every set with its I/E, scenes, page count and times of day.
// The Reports dialog shows these tables; Export to Excel writes them to a formatted workbook.

import { S, eighths } from './state.js';
import { cueName, sceneParts, REVISIONS } from './elements.js';

const words = (t) => (t.match(/[A-Za-z0-9'’]+/g) || []).length;
const textOf = (p) => (p.runs || []).map((r) => r.x).join('');
const pages = (e8) => (e8 || 0) / 8;

/** INT / EXT / INT/EXT, the way a breakdown writes it. */
function ie(intro) {
  const t = (intro || '').toUpperCase().replace(/\.$/, '');
  if (/^(INT\.?\/EXT|EXT\.?\/INT|I\/E)/.test(t)) return 'INT/EXT';
  if (/^INT/.test(t)) return 'INT';
  if (/^(EXT|EST)/.test(t)) return 'EXT';
  return '';
}

const DAY = /\b(DAY|MORNING|AFTERNOON|NOON|MIDDAY|LATE DAY)\b/;
const NIGHT = /\b(NIGHT|EVENING|MIDNIGHT|LATE NIGHT)\b/;
const DAWN = /\b(DAWN|SUNRISE|FIRST LIGHT)\b/;
const DUSK = /\b(DUSK|SUNSET|TWILIGHT|MAGIC HOUR)\b/;
const SAME = /\b(CONTINUOUS|LATER|MOMENTS LATER|SAME|SAME TIME|MOMENTS? BEFORE)\b/;

/**
 * Day or night for the schedule. CONTINUOUS, LATER and the like carry the light of the scene
 * before, as a breakdown would.
 */
function dayNight(time, prev) {
  const t = (time || '').toUpperCase();
  if (DAWN.test(t)) return 'Dawn';
  if (DUSK.test(t)) return 'Dusk';
  if (NIGHT.test(t)) return 'Night';
  if (DAY.test(t)) return 'Day';
  if (SAME.test(t) || !t) return prev || '';
  return t.charAt(0) + t.slice(1).toLowerCase();
}

/** Everything the reports need, worked out from the script as it is now. */
export function collect() {
  const paras = S.editor.paras();
  const lay = S.layout;
  const byPara = new Map(((lay && lay.scenes) || []).map((s) => [s.para, s]));
  const scenes = [];
  const chars = new Map();
  let cur = null, speaker = null, act = '', seq = '', beat = '', dn = '';
  const ensure = (n) => {
    if (!chars.has(n)) chars.set(n, { name: n, speeches: 0, words: 0, speaks: new Set(), named: new Set(), firstPara: Infinity });
    return chars.get(n);
  };
  paras.forEach((p, i) => {
    const text = textOf(p);
    if (p.t === 'section') {
      const name = text.trim();
      if ((p.lvl || 1) === 1) { act = name; seq = ''; beat = ''; } else if (p.lvl === 2) { seq = name; beat = ''; } else beat = name;
      cur = null; speaker = null;
      return;
    }
    if (p.t === 'scene') {
      const sp = sceneParts(text);
      const L = byPara.get(i) || {};
      dn = dayNight(sp.time, dn);
      cur = {
        i, heading: text.trim(), number: L.number || '', ie: ie(sp.intro), set: sp.location, time: sp.time, dn,
        page: (lay && lay.para_page[i]) || 1, e8: L.eighths || 0, omitted: !!(p.meta && p.meta.omitted),
        synopsis: ((p.meta && p.meta.synopsis) || '').trim(), first: '', action: [], speaking: new Set(), act, seq, beat,
      };
      scenes.push(cur);
      speaker = null;
      return;
    }
    if (p.t === 'character') {
      const n = cueName(text);
      if (!n) return;
      const C = ensure(n);
      C.speeches++;
      C.firstPara = Math.min(C.firstPara, i);
      if (cur) { cur.speaking.add(n); C.speaks.add(cur); }
      speaker = C;
    } else if ((p.t === 'dialogue' || p.t === 'lyric') && speaker) {
      speaker.words += words(text);
    } else if (p.t !== 'paren') {
      speaker = null;
      if (p.t === 'action' && cur && text.trim()) {
        if (!cur.first) cur.first = text.trim();
        cur.action.push(text);
      }
    }
  });

  // characters who are in a scene without speaking: named in its action lines
  // (longest names first, and each match is blanked out, so "Young JUNE" is YOUNG JUNE, not JUNE)
  const names = [...chars.keys()].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
  const rx = new Map(names.map((n) => [n, new RegExp(`(^|[^A-Za-z0-9'’])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![A-Za-z0-9])`, 'gi')]));
  for (const sc of scenes) {
    sc.named = new Set();
    let all = sc.action.join('\n');
    if (!all) continue;
    for (const n of names) {
      const r = rx.get(n);
      r.lastIndex = 0;
      if (!r.test(all)) continue;
      all = all.replace(r, (m, pre) => pre + ' '.repeat(m.length - pre.length));
      if (!sc.speaking.has(n)) { sc.named.add(n); chars.get(n).named.add(sc); }
    }
  }

  // cast ID numbers: 1 is the part in the most scenes, then most speeches, then who comes first
  const cast = [...chars.values()].sort((a, b) =>
    (b.speaks.size + b.named.size) - (a.speaks.size + a.named.size) || b.speeches - a.speeches || b.words - a.words || a.firstPara - b.firstPara);
  cast.forEach((c, k) => { c.id = k + 1; });
  const idOf = new Map(cast.map((c) => [c.name, c.id]));
  const byId = (a, b) => idOf.get(a) - idOf.get(b);
  for (const sc of scenes) {
    sc.castNames = [...sc.speaking].sort(byId);
    sc.namedNames = [...sc.named].sort(byId);
    sc.castIds = [...sc.castNames, ...sc.namedNames].map((n) => idOf.get(n)).sort((a, b) => a - b);
    sc.label = sc.number || String(scenes.indexOf(sc) + 1);
    sc.description = sc.synopsis || (sc.first.length > 110 ? sc.first.slice(0, 107).replace(/\s+\S*$/, '') + '…' : sc.first);
  }
  const order = new Map(scenes.map((s, k) => [s, k]));
  for (const c of cast) {
    const all = [...c.speaks, ...c.named].sort((a, b) => order.get(a) - order.get(b));
    c.scenes = all;
    c.e8 = all.reduce((t, s) => t + (s.e8 || 0), 0);
    c.firstPage = c.firstPara < Infinity && lay ? lay.para_page[c.firstPara] || 1 : '';
  }

  // sets
  const sets = new Map();
  for (const sc of scenes) {
    if (sc.omitted || !sc.set) continue;
    const k = sc.set;
    const L = sets.get(k) || { name: k, ies: new Set(), scenes: [], e8: 0, dns: new Map() };
    if (sc.ie) L.ies.add(sc.ie);
    L.scenes.push(sc);
    L.e8 += sc.e8 || 0;
    if (sc.dn) L.dns.set(sc.dn, (L.dns.get(sc.dn) || 0) + 1);
    sets.set(k, L);
  }
  const setList = [...sets.values()].sort((a, b) => b.e8 - a.e8 || b.scenes.length - a.scenes.length);
  return { scenes, cast, sets: setList, totalPages: lay ? lay.pages.length : 0, words: S.derived.words };
}

const idList = (ids) => ids.join(', ');
const dnSummary = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (n > 1 ? `${k} (${n})` : k)).join(', ');

/** Tables for the Reports dialog (and for copying as CSV). */
export function tables(R = collect()) {
  return {
    scenes: {
      label: 'Scenes',
      head: ['Sc.', 'I/E', 'Set', 'D/N', 'Page', 'Pgs', 'Cast', 'Description'],
      rows: R.scenes.map((s) => s.omitted
        ? [s.label, '', 'OMITTED', '', s.page, 0, '', '']
        : [s.label, s.ie, s.set, s.dn, s.page, s.e8, idList(s.castIds), s.description]),
      fmt: [null, null, 'h', null, null, (v) => (v ? eighths(v) : ''), null, 'd'],
    },
    cast: {
      label: 'Cast',
      head: ['ID', 'Character', 'Scenes', 'Speaks in', 'Speeches', 'Words', 'Pgs', 'First sc.', 'Last sc.'],
      rows: R.cast.map((c) => [c.id, c.name, c.scenes.length, c.speaks.size, c.speeches, c.words, c.e8, (c.scenes[0] || {}).label || '', (c.scenes[c.scenes.length - 1] || {}).label || '']),
      fmt: [null, 'h', null, null, null, null, (v) => (v ? eighths(v) : ''), null, null],
    },
    sets: {
      label: 'Sets',
      head: ['Set', 'I/E', 'Scenes', 'Pgs', 'D/N', 'Scene numbers'],
      rows: R.sets.map((L) => [L.name, [...L.ies].join(', '), L.scenes.length, L.e8, dnSummary(L.dns), L.scenes.map((s) => s.label).join(', ')]),
      fmt: ['h', null, null, (v) => (v ? eighths(v) : ''), null, null],
    },
  };
}

function todayText() {
  return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const CAST_RED = '#B03A2E';   // breakdown colour for cast

/** The workbook for Export to Excel. */
export function workbook(R = collect()) {
  const tp = S.project.title_page || {};
  const st = S.project.settings || {};
  const title = (tp.title || S.name || 'Untitled').replace(/\.pageone$/i, '').trim();
  const rev = st.rev_level ? `${REVISIONS[st.rev_level][0]} revision` : '';
  const subtitle = [tp.draft, rev, `${R.totalPages} pages`, `exported ${todayText()}`].filter(Boolean).join(' · ');
  const live = R.scenes.filter((s) => !s.omitted);
  const count = (f) => live.filter(f).length;
  const totalE8 = live.reduce((t, s) => t + (s.e8 || 0), 0);
  const mins = R.totalPages;

  const summary = {
    name: 'Summary', heading: 'Summary', kind: 'summary',
    rows: [
      ['Script', null, 'section'],
      ['Title', title], ['Written by', tp.author || ''], ['Draft', tp.draft || ''], ['Revision', rev || 'None'], ['Exported', todayText()],
      ['', null],
      ['Length', null, 'section'],
      ['Pages', R.totalPages, 'int'],
      ['Scene pages (eighths)', pages(totalE8), 'eighths'],
      ['Estimated screen time', mins ? `About ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`} (a page a minute)` : ''],
      ['Words', R.words, 'int'],
      ['', null],
      ['Scenes', null, 'section'],
      ['Scenes', live.length, 'int'],
      ['Interior', count((s) => s.ie === 'INT'), 'int'],
      ['Exterior', count((s) => s.ie === 'EXT'), 'int'],
      ['Interior/exterior', count((s) => s.ie === 'INT/EXT'), 'int'],
      ['Day', count((s) => s.dn === 'Day'), 'int'],
      ['Night', count((s) => s.dn === 'Night'), 'int'],
      ['Dawn or dusk', count((s) => s.dn === 'Dawn' || s.dn === 'Dusk'), 'int'],
      ['Omitted', R.scenes.length - live.length, 'int'],
      ['', null],
      ['Cast and sets', null, 'section'],
      ['Speaking parts', R.cast.length, 'int'],
      ['Sets', R.sets.length, 'int'],
    ],
  };

  const scenes = {
    name: 'Scene Report', heading: 'Scene report (one-liner, script order)', freeze_cols: 1,
    note: 'Pgs in eighths of a page. Cast by ID number (see Cast List); IDs include characters named in the action. CONTINUOUS and LATER scenes take the day or night of the scene before.',
    columns: [
      { title: 'Sc.', width: 6, kind: 'center' },
      { title: 'I/E', width: 8, kind: 'center' },
      { title: 'Set', width: 26, kind: 'wrap' },
      { title: 'D/N', width: 8, kind: 'center' },
      { title: 'Time (as written)', width: 12, kind: 'wrap' },
      { title: 'Page', width: 6, kind: 'int' },
      { title: 'Pgs', width: 7, kind: 'eighths' },
      { title: 'Cast IDs', width: 12, kind: 'wrap', accent: CAST_RED },
      { title: 'Speaking', width: 20, kind: 'wrap', accent: CAST_RED },
      { title: 'Also in scene (named in action)', width: 18, kind: 'wrap', accent: CAST_RED },
      { title: 'Description', width: 44, kind: 'wrap' },
      { title: 'Act', width: 12, kind: 'wrap' },
      { title: 'Sequence', width: 13, kind: 'wrap' },
      { title: 'Beat', width: 13, kind: 'wrap' },
    ],
    rows: R.scenes.map((s) => s.omitted
      ? [s.label, '', 'OMITTED', '', '', s.page, null, '', '', '', '', s.act, s.seq, s.beat]
      : [s.label, s.ie, s.set, s.dn, s.time, s.page, pages(s.e8), idList(s.castIds), s.castNames.join(', '), s.namedNames.join(', '), s.description, s.act, s.seq, s.beat]),
    totals: { label: `${live.length} scenes`, sum: [6] },
  };

  const cast = {
    name: 'Cast List', heading: 'Cast list', freeze_cols: 2,
    note: 'ID numbers run from the part in the most scenes; the production office may renumber by billing. Pgs is the length of every scene the character is in.',
    columns: [
      { title: 'ID', width: 5, kind: 'int', accent: CAST_RED },
      { title: 'Character', width: 24, accent: CAST_RED },
      { title: 'Scenes', width: 8, kind: 'int' },
      { title: 'Speaks in', width: 9, kind: 'int' },
      { title: 'Speeches', width: 9, kind: 'int' },
      { title: 'Words', width: 8, kind: 'int' },
      { title: 'Pgs', width: 8, kind: 'eighths' },
      { title: 'First sc.', width: 9, kind: 'center' },
      { title: 'Last sc.', width: 9, kind: 'center' },
      { title: 'First page', width: 9, kind: 'int' },
      { title: 'Scene numbers', width: 40, kind: 'wrap' },
    ],
    rows: R.cast.map((c) => [c.id, c.name, c.scenes.length, c.speaks.size, c.speeches, c.words, pages(c.e8),
      (c.scenes[0] || {}).label || '', (c.scenes[c.scenes.length - 1] || {}).label || '', c.firstPage, c.scenes.map((s) => s.label).join(', ')]),
    totals: { label: `${R.cast.length} characters`, sum: [4, 5] },
  };

  const grid = {
    name: 'Cast by Scene', heading: 'Cast by scene', kind: 'grid', freeze_cols: 2,
    note: 'X speaks · • named in the action',
    columns: [
      { title: 'ID', width: 5, kind: 'int', accent: CAST_RED },
      { title: 'Character', width: 22, accent: CAST_RED },
      ...live.map((s) => ({ title: s.label, width: 4.6, kind: 'mark' })),
      { title: 'Scenes', width: 8, kind: 'int' },
    ],
    rows: R.cast.map((c) => [c.id, c.name, ...live.map((s) => (s.speaking.has(c.name) ? 'X' : s.named.has(c.name) ? '•' : '')), c.scenes.filter((s) => !s.omitted).length]),
  };

  const sets = {
    name: 'Sets', heading: 'Sets and locations', freeze_cols: 1,
    note: 'Each set as written in the scene headings, longest first.',
    columns: [
      { title: 'Set', width: 32, kind: 'wrap' },
      { title: 'I/E', width: 10, kind: 'center' },
      { title: 'Scenes', width: 8, kind: 'int' },
      { title: 'Pgs', width: 8, kind: 'eighths' },
      { title: 'D/N', width: 20, kind: 'wrap' },
      { title: 'Scene numbers', width: 40, kind: 'wrap' },
    ],
    rows: R.sets.map((L) => [L.name, [...L.ies].join(', '), L.scenes.length, pages(L.e8), dnSummary(L.dns), L.scenes.map((s) => s.label).join(', ')]),
    totals: { label: `${R.sets.length} sets`, sum: [2, 3] },
  };

  return { title, subtitle, sheets: [summary, scenes, cast, grid, sets] };
}
