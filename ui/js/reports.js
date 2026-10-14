// Production reports, aligned with Final Draft's reports and the scene fields production
// scheduling uses (Movie Magic Scheduling's breakdown sheet: Scenes, I/E, Set, TOD, Pg(s), Script
// Pgs, Script Day, Screen Time, Synopsis, Sequence, Comments):
//  - Summary: Final Draft's statistics (elements and their share, dialogue vs action, profanity)
//    plus scene counts by the four strip colours (day/night, interior/exterior).
//  - Scene report: the one-liner in script order.
//  - Cast list with ID numbers (1 = the part in the most scenes), counting scenes where a
//    character is named but doesn't speak, as Final Draft's cast report does.
//  - Cast by scene: the cross-plot an assistant director builds the Day Out of Days from.
//  - Dialogue: every speech by character, like Final Draft's character report, with monologues
//    over 100 words flagged.
//  - Sets: every set with its I/E, scenes, page count and times of day.
// The Reports dialog shows these tables; Export to Excel writes them to a formatted workbook.

import { S, eighths } from './state.js';
import { cueName, sceneParts, REVISIONS } from './elements.js';

const words = (t) => (t.match(/[A-Za-z0-9'’]+/g) || []).length;
const textOf = (p) => (p.runs || []).map((r) => r.x).join('');
const pages = (e8) => (e8 || 0) / 8;

/** The printed page number for a page index: 12, or with locked pages "12A" / "12-13". */
function pageLabel(lay, n) {
  const pg = lay && lay.pages[n - 1];
  if (!pg) return n;
  return /^\d+$/.test(pg.label) ? +pg.label : pg.label;
}

/** INT / EXT / INT/EXT, the way a breakdown writes it. */
function ie(intro) {
  const t = (intro || '').toUpperCase().replace(/\.$/, '');
  if (/^(INT\.?\/EXT|EXT\.?\/INT|I\/E)/.test(t)) return 'INT/EXT';
  if (/^INT/.test(t)) return 'INT';
  if (/^(EXT|EST)/.test(t)) return 'EXT';
  return '';
}

// Time of day in the values scheduling uses: Day, Night, Morning, Evening, Dawn, Dusk
const TOD = [
  ['Dawn', /\b(DAWN|SUNRISE|FIRST LIGHT|DAYBREAK)\b/],
  ['Dusk', /\b(DUSK|SUNSET|TWILIGHT|MAGIC HOUR|SUNDOWN)\b/],
  ['Morning', /\bMORNING\b/],
  ['Evening', /\bEVENING\b/],
  ['Night', /\b(NIGHT|MIDNIGHT)\b/],
  ['Day', /\b(DAY|AFTERNOON|NOON|MIDDAY|LATE DAY)\b/],
];
const SAME = /\b(CONTINUOUS|LATER|MOMENTS LATER|SAME|SAME TIME|MOMENTS? BEFORE|SIMULTANEOUS|INTERCUT)\b/;
const NEXT_DAY = /\b(NEXT|FOLLOWING)\s+(DAY|MORNING|NIGHT|EVENING|AFTERNOON)\b|\b(DAYS?|WEEKS?|MONTHS?|YEARS?)\s+LATER\b/;
const AWAY = /\b(FLASHBACK|FLASH BACK|DREAM|FANTASY|MEMORY|FLASH FORWARD|FLASH-FORWARD)\b/;
const NIGHTISH = new Set(['Night', 'Evening', 'Dusk']);
const MORNINGISH = new Set(['Dawn', 'Morning', 'Day']);

/** Time of day; CONTINUOUS, LATER and the like carry the time of the scene before, as a breakdown would. */
function timeOfDay(time, prev) {
  const t = (time || '').toUpperCase();
  for (const [name, rx] of TOD) if (rx.test(t)) return name;
  if (SAME.test(t) || !t) return prev || '';
  return t.charAt(0) + t.slice(1).toLowerCase();
}
const dayOrNight = (tod) => (NIGHTISH.has(tod) ? 'N' : 'D');

const PROFANITY = /\b(f+u+c+k\w*|motherf\w+|sh[i1]t\w*|bullshit|god ?damn\w*|damn\w*|bitch\w*|bastard\w*|asshole\w*|ass|piss\w*|cunt\w*|hell)\b/gi;

function mmss(e8) {
  const secs = Math.round(((e8 || 0) / 8) * 60);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** Everything the reports need, worked out from the script as it is now. */
export function collect() {
  const paras = S.editor.paras();
  const lay = S.layout;
  const byPara = new Map(((lay && lay.scenes) || []).map((s) => [s.para, s]));
  const scenes = [];
  const chars = new Map();
  let cur = null, speaker = null, act = '', seq = '', beat = '', tod = '', day = 0, lastTod = '';
  const speeches = [];   // one per cue: {name, ext, scene, page, parens, lines, words}
  let speech = null;
  const elementCount = {};
  let dialogueWords = 0, actionWords = 0;
  const profanity = new Map();
  const ensure = (n) => {
    if (!chars.has(n)) chars.set(n, { name: n, speeches: 0, words: 0, speaks: new Set(), named: new Set(), firstPara: Infinity });
    return chars.get(n);
  };
  paras.forEach((p, i) => {
    const text = textOf(p);
    if (p.t !== 'section' && p.t !== 'note' && text.trim()) {
      elementCount[p.t] = (elementCount[p.t] || 0) + 1;
      for (const m of text.matchAll(PROFANITY)) { const w = m[0].toLowerCase(); profanity.set(w, (profanity.get(w) || 0) + 1); }
    }
    if (p.t !== 'dialogue' && p.t !== 'paren' && p.t !== 'lyric') speech = null;
    if (cur && text.trim() && !['note', 'scene', 'section'].includes(p.t)) cur.lastPara = i;
    if (p.t === 'section') {
      const name = text.trim();
      if ((p.lvl || 1) === 1) { act = name; seq = ''; beat = ''; } else if (p.lvl === 2) { seq = name; beat = ''; } else beat = name;
      cur = null; speaker = null;
      return;
    }
    if (p.t === 'scene') {
      const sp = sceneParts(text);
      const L = byPara.get(i) || {};
      const away = AWAY.test(text.toUpperCase());
      const t = timeOfDay(sp.time, away ? '' : lastTod);
      let scriptDay;
      if (away) scriptDay = /DREAM|FANTASY/.test(text.toUpperCase()) ? 'Dream' : 'Flashback';
      else {
        if (!day || NEXT_DAY.test(text.toUpperCase()) || (NIGHTISH.has(lastTod) && MORNINGISH.has(t))) day++;
        scriptDay = `${dayOrNight(t)}${day}`;
        lastTod = t || lastTod;
      }
      tod = t;
      cur = {
        i, lastPara: i, heading: text.trim(), number: L.number || '', ie: ie(sp.intro), set: sp.location, time: sp.time, tod, scriptDay,
        notes: ((p.meta && p.meta.notes) || '').trim(),
        page: pageLabel(lay, (lay && lay.para_page[i]) || 1), e8: L.eighths || 0, omitted: !!(p.meta && p.meta.omitted),
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
      const ext = (text.match(/\(([^)]*)\)/g) || []).map((x) => x.slice(1, -1).trim().toUpperCase()).filter(Boolean).join(', ');
      speech = { name: n, ext, scene: cur, page: pageLabel(lay, (lay && lay.para_page[i]) || 1), parens: [], lines: [], words: 0 };
      speeches.push(speech);
      C.firstPara = Math.min(C.firstPara, i);
      if (cur) { cur.speaking.add(n); C.speaks.add(cur); }
      speaker = C;
    } else if ((p.t === 'dialogue' || p.t === 'lyric') && speaker) {
      const w = words(text);
      speaker.words += w;
      dialogueWords += w;
      if (speech) { speech.lines.push(text.trim()); speech.words += w; }
    } else if (p.t === 'paren') {
      if (speech && text.trim()) speech.parens.push(text.trim());
    } else {
      if (p.t === 'action') actionWords += words(text);
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
    c.firstPage = c.firstPara < Infinity && lay ? pageLabel(lay, lay.para_page[c.firstPara] || 1) : '';
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
    if (sc.tod) L.dns.set(sc.tod, (L.dns.get(sc.tod) || 0) + 1);
    sets.set(k, L);
  }
  const setList = [...sets.values()].sort((a, b) => b.e8 - a.e8 || b.scenes.length - a.scenes.length);
  for (const sc of scenes) {
    const a = (lay && lay.para_page[sc.i]) || 1, b = (lay && lay.para_page[sc.lastPara]) || a;
    sc.pageEnd = b;
    const la = pageLabel(lay, a), lb = pageLabel(lay, b);
    sc.pages = b > a ? `${String(la).split('-')[0]}-${String(lb).split('-').pop()}` : String(la);
  }
  return {
    scenes, cast, sets: setList, speeches, totalPages: lay ? lay.pages.length : 0, words: S.derived.words,
    elementCount, dialogueWords, actionWords, profanity, idOf,
  };
}

const idList = (ids) => ids.join(', ');
const todSummary = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (n > 1 ? `${k} (${n})` : k)).join(', ');

/** Tables for the Reports dialog (and for copying as CSV). */
export function tables(R = collect()) {
  return {
    scenes: {
      label: 'Scenes',
      head: ['Sc.', 'I/E', 'Set', 'TOD', 'Script day', 'Script pgs', 'Pgs', 'Cast', 'Synopsis'],
      rows: R.scenes.map((s) => s.omitted
        ? [s.label, '', 'OMITTED', '', '', s.pages, 0, '', '']
        : [s.label, s.ie, s.set, s.tod, s.scriptDay, s.pages, s.e8, idList(s.castIds), s.description]),
      fmt: [null, null, 'h', null, null, null, (v) => (v ? eighths(v) : ''), null, 'd'],
    },
    cast: {
      label: 'Cast',
      head: ['ID', 'Character', 'Scenes', 'Speaks in', 'Speeches', 'Words', 'Pgs', 'First sc.', 'Last sc.'],
      rows: R.cast.map((c) => [c.id, c.name, c.scenes.length, c.speaks.size, c.speeches, c.words, c.e8, (c.scenes[0] || {}).label || '', (c.scenes[c.scenes.length - 1] || {}).label || '']),
      fmt: [null, 'h', null, null, null, null, (v) => (v ? eighths(v) : ''), null, null],
    },
    sets: {
      label: 'Sets',
      head: ['Set', 'I/E', 'Scenes', 'Pgs', 'TOD', 'Scene numbers'],
      rows: R.sets.map((L) => [L.name, [...L.ies].join(', '), L.scenes.length, L.e8, todSummary(L.dns), L.scenes.map((s) => s.label).join(', ')]),
      fmt: ['h', null, null, (v) => (v ? eighths(v) : ''), null, null],
    },
  };
}

function todayText() {
  return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const CAST_RED = '#B03A2E';   // breakdown colour for cast

const ELEMENT_NAMES = [
  ['scene', 'Scene headings'], ['action', 'Action'], ['character', 'Character cues'], ['dialogue', 'Dialogue'],
  ['paren', 'Parentheticals'], ['transition', 'Transitions'], ['shot', 'Shots'], ['lyric', 'Lyrics'],
  ['centered', 'Centered text'], ['general', 'General'],
];

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
  const night = (s) => NIGHTISH.has(s.tod);
  const ext = (s) => s.ie === 'EXT' || s.ie === 'INT/EXT';
  const totalElems = Object.values(R.elementCount).reduce((a, b) => a + b, 0) || 1;
  const prof = [...R.profanity.entries()].sort((a, b) => b[1] - a[1]);
  const profTotal = prof.reduce((t, [, n]) => t + n, 0);
  const spokenWords = R.dialogueWords + R.actionWords || 1;
  const days = new Set(live.map((s) => s.scriptDay).filter((d) => /^[DN]\d+$/.test(d)).map((d) => d.slice(1)));
  const pct = (n, of) => `${n} (${Math.round((100 * n) / of)}%)`;

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
      ['Dialogue words', pct(R.dialogueWords, spokenWords)],
      ['Action words', pct(R.actionWords, spokenWords)],
      ['', null],
      ['Scenes', null, 'section'],
      ['Scenes', live.length, 'int'],
      ['Omitted', R.scenes.length - live.length, 'int'],
      ['Interior', count((s) => s.ie === 'INT'), 'int'],
      ['Exterior', count((s) => s.ie === 'EXT'), 'int'],
      ['Interior/exterior', count((s) => s.ie === 'INT/EXT'), 'int'],
      ['Day interior', count((s) => !night(s) && !ext(s)), 'int'],
      ['Day exterior', count((s) => !night(s) && ext(s)), 'int'],
      ['Night interior', count((s) => night(s) && !ext(s)), 'int'],
      ['Night exterior', count((s) => night(s) && ext(s)), 'int'],
      ['Script days (estimated)', days.size, 'int'],
      ['Flashbacks and dreams', count((s) => !/^[DN]\d+$/.test(s.scriptDay)), 'int'],
      ['', null],
      ['Cast and sets', null, 'section'],
      ['Speaking parts', R.cast.length, 'int'],
      ['Speeches', R.speeches.length, 'int'],
      ['Monologues (100+ words)', R.speeches.filter((x) => x.words >= 100).length, 'int'],
      ['Sets', R.sets.length, 'int'],
      ['', null],
      ['Elements', null, 'section'],
      ...ELEMENT_NAMES.filter(([k]) => R.elementCount[k]).map(([k, label]) => [label, pct(R.elementCount[k], totalElems)]),
      ['', null],
      ['Language', null, 'section'],
      ['Profanity', profTotal ? `${profTotal}: ${prof.map(([w, n]) => `${w} ${n}`).join(', ')}` : 'None'],
    ],
  };

  const scenes = {
    name: 'Scene Report', heading: 'Scene report (one-liner, script order)', freeze_cols: 1,
    note: 'TOD and Script day: CONTINUOUS and LATER keep the time of the scene before; a new script day starts at the morning after a night, or NEXT DAY / DAYS LATER. Script days are estimated from the headings. Pgs in eighths; screen time at a page a minute. Cast by ID (see Cast List), including characters named in the action.',
    columns: [
      { title: 'Sc.', width: 6, kind: 'center' },
      { title: 'I/E', width: 8, kind: 'center' },
      { title: 'Set', width: 24, kind: 'wrap' },
      { title: 'TOD', width: 9, kind: 'center' },
      { title: 'Time (as written)', width: 12, kind: 'wrap' },
      { title: 'Script day', width: 9, kind: 'center' },
      { title: 'Script pgs', width: 8, kind: 'center' },
      { title: 'Pgs', width: 7, kind: 'eighths' },
      { title: 'Screen time', width: 8, kind: 'center' },
      { title: 'Cast IDs', width: 10, kind: 'wrap', accent: CAST_RED },
      { title: 'Speaking', width: 18, kind: 'wrap', accent: CAST_RED },
      { title: 'Named in action', width: 16, kind: 'wrap', accent: CAST_RED },
      { title: 'Synopsis', width: 40, kind: 'wrap' },
      { title: 'Act', width: 11, kind: 'wrap' },
      { title: 'Sequence', width: 12, kind: 'wrap' },
      { title: 'Beat', width: 12, kind: 'wrap' },
      { title: 'Notes', width: 24, kind: 'wrap' },
    ],
    rows: R.scenes.map((s) => s.omitted
      ? [s.label, '', 'OMITTED', '', '', '', s.pages, null, '', '', '', '', '', s.act, s.seq, s.beat, s.notes]
      : [s.label, s.ie, s.set, s.tod, s.time, s.scriptDay, s.pages, pages(s.e8), mmss(s.e8), idList(s.castIds), s.castNames.join(', '), s.namedNames.join(', '), s.description, s.act, s.seq, s.beat, s.notes]),
    totals: { label: `${live.length} scenes`, sum: [7] },
  };

  const cast = {
    name: 'Cast List', heading: 'Cast list', freeze_cols: 2,
    note: 'ID numbers run from the part in the most scenes; the production office may renumber by billing. Scenes counts every scene a character is in, speaking or named in the action; Pgs is the length of those scenes.',
    columns: [
      { title: 'ID', width: 5, kind: 'int', accent: CAST_RED },
      { title: 'Character', width: 22, accent: CAST_RED },
      { title: 'Scenes', width: 8, kind: 'int' },
      { title: 'Speaks in', width: 9, kind: 'int' },
      { title: 'Not speaking', width: 9, kind: 'int' },
      { title: 'Speeches', width: 9, kind: 'int' },
      { title: 'Words', width: 8, kind: 'int' },
      { title: 'Longest speech (words)', width: 11, kind: 'int' },
      { title: 'Pgs', width: 8, kind: 'eighths' },
      { title: 'Script days', width: 14, kind: 'wrap' },
      { title: 'First sc.', width: 8, kind: 'center' },
      { title: 'Last sc.', width: 8, kind: 'center' },
      { title: 'First page', width: 8, kind: 'int' },
      { title: 'Scene numbers', width: 34, kind: 'wrap' },
    ],
    rows: R.cast.map((c) => {
      const longest = R.speeches.filter((x) => x.name === c.name).reduce((m, x) => Math.max(m, x.words), 0);
      const sdays = [...new Set(c.scenes.filter((s) => !s.omitted).map((s) => s.scriptDay).filter(Boolean))].join(', ');
      return [c.id, c.name, c.scenes.length, c.speaks.size, c.named.size, c.speeches, c.words, longest, pages(c.e8), sdays,
        (c.scenes[0] || {}).label || '', (c.scenes[c.scenes.length - 1] || {}).label || '', c.firstPage, c.scenes.map((s) => s.label).join(', ')];
    }),
    totals: { label: `${R.cast.length} characters`, sum: [5, 6] },
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

  const dialogue = {
    name: 'Dialogue', heading: 'Dialogue by character', freeze_cols: 2,
    note: 'Every speech in script order. Filter the Character column to print one part (sides for an actor). Speeches of 100 words or more are flagged as monologues.',
    columns: [
      { title: 'ID', width: 5, kind: 'int', accent: CAST_RED },
      { title: 'Character', width: 18, accent: CAST_RED },
      { title: 'Ext.', width: 8, kind: 'center' },
      { title: 'Sc.', width: 6, kind: 'center' },
      { title: 'Page', width: 6, kind: 'int' },
      { title: 'Parenthetical', width: 18, kind: 'wrap' },
      { title: 'Dialogue', width: 70, kind: 'wrap' },
      { title: 'Words', width: 7, kind: 'int' },
      { title: 'Monologue', width: 10, kind: 'center' },
    ],
    rows: R.speeches.map((x) => [R.idOf.get(x.name), x.name, x.ext, x.scene ? x.scene.label : '', x.page, x.parens.join(' '), x.lines.join(' '), x.words, x.words >= 100 ? 'Yes' : '']),
    totals: { label: `${R.speeches.length} speeches`, sum: [7] },
  };

  const sets = {
    name: 'Sets', heading: 'Sets and locations', freeze_cols: 1,
    note: 'Each set as written in the scene headings, with how many scenes use it (Final Draft’s location report), longest first.',
    columns: [
      { title: 'Set', width: 30, kind: 'wrap' },
      { title: 'I/E', width: 10, kind: 'center' },
      { title: 'Scenes', width: 8, kind: 'int' },
      { title: 'Pgs', width: 8, kind: 'eighths' },
      { title: 'TOD', width: 18, kind: 'wrap' },
      { title: 'Script days', width: 14, kind: 'wrap' },
      { title: 'Cast IDs', width: 12, kind: 'wrap', accent: CAST_RED },
      { title: 'Scene numbers', width: 30, kind: 'wrap' },
    ],
    rows: R.sets.map((L) => {
      const ids = [...new Set(L.scenes.flatMap((s) => s.castIds))].sort((a, b) => a - b);
      const sdays = [...new Set(L.scenes.map((s) => s.scriptDay).filter(Boolean))].join(', ');
      return [L.name, [...L.ies].join(', '), L.scenes.length, pages(L.e8), todSummary(L.dns), sdays, idList(ids), L.scenes.map((s) => s.label).join(', ')];
    }),
    totals: { label: `${R.sets.length} sets`, sum: [2, 3] },
  };

  return { title, subtitle, sheets: [summary, scenes, cast, grid, dialogue, sets] };
}
