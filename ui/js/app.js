// Page One — application shell: documents, menus, shortcuts, status, autosave.

import { api, isDesktop, stem } from './api.js';
import { Editor, textOf, runsOf, sliceRuns, concatRuns, esc } from './editor.js';
import { ELEMS, REVISIONS, cueName, sceneParts, IS_MAC, keyText, platformKeys } from './elements.js';
import { S, savePrefs, emptyProject, projectNow } from './state.js';
import * as panels from './panels.js';
import * as dialogs from './dialogs.js';

const $ = (s) => document.querySelector(s);

// ------------------------------------------------------------------ editor

const editor = new Editor($('#script'), $('#smart'), {
  onChange: (structural) => { markDirty(); S.derivedStale = true; if (editor.current) updateHint(editor.current); scheduleRefresh(structural ? 120 : 450); },
  onCaret: (el, i) => onCaret(el, i),
  onElement: () => onCaret(editor.current, editor.current ? editor.indexOf(editor.current) : 0),
  onStyle: (s) => { $('#stylePending').textContent = s ? ['', 'Bold', 'Italic', 'Bold italic', 'Underline', 'Bold underline', 'Italic underline', 'Bold italic underline'][s] + ' on' : ''; },
  smartData: () => {
    if (S.derivedStale) { computeDerived(editor.paras()); S.derivedStale = false; }
    return S.derived.smart;
  },
  importText: (t) => api.importText(t),
  addSection: (lvl) => {
    if (lvl === 1) { setView('cards'); setTimeout(() => { const n = document.getElementById('actName'); n && n.focus(); }, 50); }
    else dialogs.sectionDialog({ lvl });
  },
  learn: () => {},
});
S.editor = editor;

// ------------------------------------------------------------------ documents

function setTitleUI() {
  const t = (S.project.title_page.title || '').split('\n')[0].trim();
  $('#docTitle').textContent = t || S.name || 'Untitled';
  document.title = `${t || S.name || 'Untitled'}${S.dirty ? ' •' : ''} — Page One`;
  api.setWindowTitle(document.title);
}

function setSaveState() {
  const el = $('#saveState');
  el.classList.toggle('dirty', S.dirty);
  if (S.dirty) el.textContent = S.path || S.everSaved ? 'Unsaved changes' : 'Not saved yet';
  else el.textContent = S.lastSaved ? `Saved ${S.lastSaved.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'No changes';
  setTitleUI();
}

export function markDirty() {
  if (!S.dirty) { S.dirty = true; setSaveState(); }
}

function loadProject(project, { path = null, name = 'Untitled', imported = false, focus = 0 } = {}) {
  const base = emptyProject();
  S.project = {
    ...base, ...project,
    title_page: { ...base.title_page, ...(project.title_page || {}) },
    settings: { ...base.settings, ...(project.settings || {}) },
  };
  delete S.project.paras;
  S.path = path;
  S.name = name;
  S.dirty = imported;
  S.everSaved = !!path;
  S.lastSaved = null;
  S.sessionWords = null;
  editor.load(project.paras);
  editor.revLevel = S.project.settings.rev_level || 0;
  applySettingsUI();
  $('#projNotes').value = S.project.notes || '';
  $('#welcome').hidden = true;
  setView('script');
  setSaveState();
  refresh().then(() => {
    editor.root.focus();
    let f = Math.min(focus, editor.els().length - 1);
    while (f < editor.els().length - 1 && editor.els()[f].dataset.t === 'section') f++;
    editor.setSel(f, textOf(editor.els()[f]).length, f, textOf(editor.els()[f]).length, false);
    $('#desk').scrollTop = 0;
  });
  if (path) addRecent(path);
}

async function guardUnsaved() {
  if (!S.project || !S.dirty) return true;
  const r = await dialogs.confirmUnsaved(S.name);
  if (r === 'cancel') return false;
  if (r === 'save') return !!(await save());
  clearRecovery();
  return true;
}

// ------------------------------------------------------------------ crash recovery
// Unsaved work is mirrored every 20 seconds, so a crash or power cut never loses more than that.

const RECOVERY_KEY = 'pageone.recovery';
function writeRecovery() {
  if (!S.project || !S.dirty) return;
  try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({ t: Date.now(), name: S.name, path: S.path, project: projectNow() })); } catch { /* storage full or blocked */ }
}
function clearRecovery() {
  try { localStorage.removeItem(RECOVERY_KEY); } catch { /* ignore */ }
}
function readRecovery() {
  try { return JSON.parse(localStorage.getItem(RECOVERY_KEY) || 'null'); } catch { return null; }
}

async function newDoc() {
  if (!(await guardUnsaved())) return;
  const p = emptyProject();
  p.created = Math.floor(Date.now() / 1000);
  p.paras = [{ t: 'scene', runs: [{ x: '' }] }];
  loadProject(p, { name: 'Untitled', focus: 0 });
  toast('New screenplay. Start with a scene heading: type INT. or EXT.');
}

async function openDoc() {
  if (!(await guardUnsaved())) return;
  try {
    const r = await api.open();
    if (!r) return;
    loadProject(r.project, { path: r.path, name: stem(r.name), imported: r.imported });
    if (r.imported) toast(`Imported ${r.name}. Save to keep it as a Page One file.`);
  } catch (e) { dialogs.alert('Could not open the file', String(e.message || e)); }
}

async function openPath(path) {
  if (!(await guardUnsaved())) return;
  try {
    const r = await api.openPath(path);
    loadProject(r.project, { path: r.path, name: stem(r.name), imported: !r.path });
  } catch (e) {
    S.prefs.recent = S.prefs.recent.filter((x) => x !== path);
    savePrefs();
    renderRecent();
    dialogs.alert('Could not open the file', String(e.message || e));
  }
}

async function openSample() {
  if (!(await guardUnsaved())) return;
  const txt = await (await fetch('sample.fountain')).text();
  const p = await api.importText(txt);
  p.settings = { ...emptyProject().settings, scene_numbers: true };
  loadProject(p, { name: 'The Last Page' });
}

async function save(as = false) {
  if (!S.project) return null;
  try {
    const p = projectNow();
    const now = Math.floor(Date.now() / 1000);
    p.modified = now;
    if (!p.created) p.created = now;
    S.project.created = p.created;
    const suggested = S.project.title_page.title.split('\n')[0].trim() || S.name || 'Untitled';
    const path = await api.save(p, as ? null : S.path, suggested);
    if (!path) return null;
    if (isDesktop) { S.path = path; S.name = stem(path); addRecent(path); }
    S.everSaved = true;
    S.dirty = false;
    S.lastSaved = new Date();
    clearRecovery();
    setSaveState();
    return path;
  } catch (e) {
    dialogs.alert('Could not save', String(e.message || e));
    return null;
  }
}

async function closeDoc() {
  if (!(await guardUnsaved())) return;
  S.project = null;
  S.dirty = false;
  showWelcome();
}

async function quit() {
  if (!(await guardUnsaved())) return;
  if (isDesktop) api.quit(); else closeDoc();
}

function addRecent(path) {
  S.prefs.recent = [path, ...S.prefs.recent.filter((x) => x !== path)].slice(0, 8);
  savePrefs();
}

function renderRecent() {
  const r = $('#recent');
  if (!isDesktop || !S.prefs.recent.length) { r.innerHTML = ''; return; }
  r.innerHTML = `<h2>Recent</h2><ul>${S.prefs.recent.map((p) => `<li><button data-path="${esc(p)}"><span>${esc(stem(p))}</span><small>${esc(p)}</small></button></li>`).join('')}</ul>`;
}

function showWelcome() {
  renderRecent();
  const rec = readRecovery();
  const rb = $('#wRecover');
  rb.hidden = !rec;
  if (rec) {
    const when = new Date(rec.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    rb.innerHTML = `Recover unsaved changes <small style="font-weight:400;color:var(--muted)">${esc(rec.name || 'Untitled')}, ${esc(when)}</small>`;
  }
  document.title = 'Page One';
  api.setWindowTitle('Page One');
  $('#welcome').hidden = false;
  $('#wNew').focus();
}

// ------------------------------------------------------------------ derived data + layout

let refreshTimer = null, refreshDue = 0;
function scheduleRefresh(ms = 400) {
  // debounce, but never hold the page count back more than ~1.5 s while typing
  const now = Date.now();
  if (!refreshDue) refreshDue = now + 1500;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { refreshDue = 0; refresh(); }, Math.max(0, Math.min(ms, refreshDue - now)));
}

let layoutSeq = 0;
async function refresh() {
  if (!S.project) return;
  const paras = editor.paras();
  computeDerived(paras);
  S.derivedStale = false;
  const seq = ++layoutSeq;
  try {
    const lay = await api.layout({ ...S.project, paras });
    if (seq !== layoutSeq) return;
    S.layout = lay;
    editor.applyLayout(lay, S.project.settings);
    attachLayout();
  } catch (e) {
    if (!/Failed to fetch|NetworkError|aborted/i.test(String(e && e.message))) console.error(e); // a reload mid-request isn't an error
  }
  if (S.sessionWords === null) S.sessionWords = S.derived.words;
  panels.renderAll();
  updateStatus();
}

function computeDerived(paras) {
  const scenes = [], chars = new Map(), locs = new Map(), times = new Map(), trans = new Map();
  let words = 0, scene = -1, speaker = null;
  paras.forEach((p, i) => {
    const text = p.runs.map((r) => r.x).join('');
    if (p.t !== 'section' && p.t !== 'note') words += (text.match(/[A-Za-z0-9'’]+/g) || []).length;
    if (p.t === 'scene' || p.t === 'section') {
      scenes.push({ i, t: p.t, text, lvl: p.lvl || 1, meta: p.meta || {}, cast: new Set(), first: '' });
      if (p.t === 'scene') {
        scene = scenes.length - 1;
        const sp = sceneParts(text);
        if (sp.location) {
          const k = sp.location;
          const L = locs.get(k) || { name: k, intros: new Set(), times: new Set(), scenes: [] };
          if (sp.intro) L.intros.add(sp.intro.replace(/\.$/, ''));
          if (sp.time) L.times.add(sp.time);
          L.scenes.push(i);
          locs.set(k, L);
        }
        if (sp.time) times.set(sp.time, (times.get(sp.time) || 0) + 1);
      }
      speaker = null;
      return;
    }
    const cur = scenes[scene];
    if (p.t === 'character') {
      const n = cueName(text);
      if (!n) return;
      const C = chars.get(n) || { name: n, speeches: 0, words: 0, scenes: new Set(), first: i };
      C.speeches++;
      if (cur) { C.scenes.add(scene); cur.cast.add(n); }
      chars.set(n, C);
      speaker = C;
    } else if ((p.t === 'dialogue' || p.t === 'lyric') && speaker) {
      speaker.words += (text.match(/[A-Za-z0-9'’]+/g) || []).length;
    } else if (p.t !== 'paren') {
      speaker = null;
      if (p.t === 'action' && cur && !cur.first && text.trim()) cur.first = text.trim();
      if (p.t === 'transition' && text.trim()) trans.set(text.trim().toUpperCase(), 1);
    }
  });
  const characters = [...chars.values()].sort((a, b) => b.speeches - a.speeches);
  S.derived = {
    scenes, characters, words,
    locations: [...locs.values()].sort((a, b) => b.scenes.length - a.scenes.length),
    smart: {
      characters: characters.map((c) => c.name),
      locations: [...locs.values()].sort((a, b) => b.scenes.length - a.scenes.length).map((l) => l.name),
      times: [...times.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]),
      transitions: [...trans.keys()],
    },
  };
}

function attachLayout() {
  const lay = S.layout;
  const byPara = new Map(lay.scenes.map((s) => [s.para, s]));
  for (const sc of S.derived.scenes) {
    const s = byPara.get(sc.i);
    sc.page = lay.para_page[sc.i] || 1;
    if (s) { sc.number = s.number; sc.eighths = s.eighths; }
  }
  for (const c of S.derived.characters) c.firstPage = lay.para_page[c.first] || 1;
}

// ------------------------------------------------------------------ caret / status

function currentSceneIndex(pi) {
  let best = -1;
  for (let k = 0; k < S.derived.scenes.length; k++) {
    const sc = S.derived.scenes[k];
    if (sc.i > pi) break;
    if (sc.t === 'scene') best = k; // acts/sequences are navigator-only
  }
  return best;
}

function onCaret(el, i) {
  if (!el) return;
  S.curPara = i;
  updateHint(el);
  updateStatus();
  panels.onCaretScene(currentSceneIndex(i));
}

function updateHint(el) {
  const t = el.dataset.t;
  const E = ELEMS[t] || ELEMS.action;
  $('#elemChip').textContent = E.label.replace(/ \(.*/, '');
  const empty = textOf(el).trim() === '' || (t === 'paren' && textOf(el).trim() === '()');
  const lbl = (k) => (ELEMS[k] ? ELEMS[k].short : k);
  $('#nextHint').innerHTML = empty
    ? `<span><kbd>Tab</kbd> becomes <b>${lbl(E.empty)}</b></span><span><kbd>Enter</kbd> pick an element</span>`
    : `<span><kbd>Enter</kbd> <b>${lbl(E.enter)}</b></span><span><kbd>Tab</kbd> <b>${tabHint(t, textOf(el), E)}</b></span>`;
}

function tabHint(t, text, E) {
  if (t === 'scene') {
    const sp = sceneParts(text);
    if (sp.intro && !sp.location) return 'location';
    if (sp.intro && !text.includes(' - ')) return 'time of day';
  }
  return ELEMS[E.tab].short;
}

function updateStatus() {
  const lay = S.layout;
  if (!lay || !S.project) return;
  const total = lay.pages.length;
  const page = lay.para_page[S.curPara] || 1;
  $('#statPage').innerHTML = `Page <b>${page}</b> of <b>${total}</b>`;
  const last = lay.pages[total - 1];
  const fill = last && last.lines.length ? (last.lines[last.lines.length - 1].row + 1) / lay.lines_per_page : 0;
  const mins = Math.max(1, Math.round(total - 1 + fill));
  $('#statTime').innerHTML = `≈ <b>${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`}</b>`;
  const delta = S.sessionWords === null ? 0 : S.derived.words - S.sessionWords;
  $('#statWords').innerHTML = `<b>${S.derived.words.toLocaleString()}</b> words${delta > 0 ? ` (+${delta} today)` : ''}`;
  const si = currentSceneIndex(S.curPara);
  const sc = S.derived.scenes[si];
  $('#statScene').innerHTML = sc && sc.t === 'scene' && sc.number ? `Scene <b>${esc(sc.number)}</b>` : '';
  const target = S.project.settings.target_pages || 0;
  const tEl = $('#statTarget');
  tEl.hidden = !target;
  if (target) {
    tEl.style.setProperty('--pct', `${Math.min(100, (total / target) * 100)}%`);
    tEl.querySelector('span').textContent = `${total}/${target} pp`;
  }
  const rl = S.project.settings.rev_level || 0;
  const chip = $('#revChip');
  chip.hidden = !rl;
  if (rl) {
    chip.style.setProperty('--rev-color', REVISIONS[rl][1]);
    chip.querySelector('span').textContent = `${REVISIONS[rl][0]} revision`;
  }
}

// ------------------------------------------------------------------ settings / prefs

export function applySettingsUI() {
  const st = S.project ? S.project.settings : emptyProject().settings;
  document.body.classList.toggle('scene-space-2', (st.scene_space || 1) >= 2);
  document.body.classList.toggle('bold-scenes', !!st.bold_scenes);
  editor.revLevel = st.rev_level || 0;
  document.documentElement.style.setProperty('--rev-color', REVISIONS[st.rev_level || 0][1]);
  applyPrefs();
}

function applyPrefs() {
  const p = S.prefs;
  document.documentElement.dataset.theme = p.theme;
  if (!document.body.classList.contains('focus')) document.documentElement.style.setProperty('--zoom', p.zoom);
  document.body.classList.toggle('no-nav', !p.nav);
  document.body.classList.toggle('no-insp', !p.insp);
  document.body.classList.toggle('hide-notes', !p.showNotes);
  editor.typewriter = !!p.typewriter;
  if (p.theme !== 'day') p.darkTheme = p.theme;
  savePrefs();
  if (document.getElementById('themeBtn')) syncToolButtons();
  editor.scheduleDual();
}

function syncToolButtons() {
  const dark = S.prefs.theme !== 'day';
  const t = $('#themeBtn');
  t.setAttribute('aria-pressed', String(dark));
  t.title = keyText(dark ? 'Light mode (Ctrl+Shift+L)' : 'Dark mode (Ctrl+Shift+L)');
  t.querySelector('.i-moon').hidden = dark;
  t.querySelector('.i-sun').hidden = !dark;
  $('#focusBtn').setAttribute('aria-pressed', String(document.body.classList.contains('focus')));
}

function toggleDark() {
  setPref('theme', S.prefs.theme === 'day' ? (S.prefs.darkTheme || 'night') : 'day');
}

/** Focus mode: full screen, chrome hidden, the page zoomed to fill the screen, typewriter scrolling. */
async function toggleFocus(on = !document.body.classList.contains('focus')) {
  if (on && !S.project) return;
  document.body.classList.toggle('focus', on);
  if (on) {
    if (S.view !== 'script') setView('script');
    await api.setFullscreen(true);
    editor.typewriter = true;
    editor.root.focus();
    setTimeout(applyFocusZoom, 60); // after the window has gone full screen
  } else {
    await api.setFullscreen(false);
    applyPrefs();
    setTimeout(() => editor.scrollToCaret(), 80);
  }
  editor.scheduleDual();
  syncToolButtons();
}

// Focus-mode zoom: "fit" scales the page to the screen width; otherwise 100–200 %.
const PAPER_PX = 816 + 48; // 8.5 in at 96 dpi plus the desk margin

function focusZoomValue() {
  const fz = S.prefs.focusZoom ?? 'fit';
  if (fz === 'fit') return Math.max(1, Math.min(3, ($('#desk').clientWidth || window.innerWidth) / PAPER_PX));
  return Math.max(1, Math.min(2, +fz || 1.4));
}

function applyFocusZoom() {
  if (!document.body.classList.contains('focus')) return;
  const fz = S.prefs.focusZoom ?? 'fit';
  const z = focusZoomValue();
  document.documentElement.style.setProperty('--zoom', z.toFixed(3));
  const pct = Math.round(z * 100);
  $('#fzFit').setAttribute('aria-pressed', String(fz === 'fit'));
  $('#focusBar').classList.toggle('fit', fz === 'fit');
  $('#fzRange').value = String(Math.max(100, Math.min(200, pct)));
  $('#fzVal').textContent = `${pct}%`;
  editor.scheduleDual();
  setTimeout(() => editor.scrollToCaret(), 30);
}

function setFocusZoom(v) {
  S.prefs.focusZoom = v;
  savePrefs();
  applyFocusZoom();
}

function setPref(k, v) {
  S.prefs[k] = v;
  applyPrefs();
}

function setSetting(k, v) {
  S.project.settings[k] = v;
  markDirty();
  applySettingsUI();
  scheduleRefresh(50);
}

function zoom(d) {
  if (document.body.classList.contains('focus')) {
    setFocusZoom(d === 0 ? 1 : Math.max(1, Math.min(2, Math.round((focusZoomValue() + d) * 10) / 10)));
    return;
  }
  const z = d === 0 ? 1 : Math.min(2, Math.max(0.6, Math.round((S.prefs.zoom + d) * 10) / 10));
  setPref('zoom', z);
  toast(`Zoom ${Math.round(z * 100)}%`);
}

// ------------------------------------------------------------------ views

function setView(v) {
  S.view = v;
  document.body.classList.toggle('board-view', v === 'cards');
  for (const b of document.querySelectorAll('.views button')) b.setAttribute('aria-selected', String(b.dataset.view === v));
  $('#desk').hidden = v !== 'script';
  $('#cards').hidden = v !== 'cards';
  if (v === 'cards') panels.renderCards();
  else setTimeout(() => editor.root.focus(), 0);
}

// ------------------------------------------------------------------ script commands

function toggleDual() {
  const els = editor.els();
  let i = S.curPara;
  while (i > 0 && ['dialogue', 'paren', 'lyric'].includes(els[i].dataset.t)) i--;
  if (els[i].dataset.t !== 'character') { toast('Put the cursor in the second speech, then turn on dual dialogue.'); return; }
  let j = i - 1;
  while (j >= 0 && ['dialogue', 'paren', 'lyric'].includes(els[j].dataset.t)) j--;
  if (j < 0 || j === i - 1 || els[j].dataset.t !== 'character') {
    toast('Dual dialogue needs another speech directly before this one.');
    return;
  }
  editor.pushUndo();
  if (els[i].dataset.dual === '1') delete els[i].dataset.dual; else els[i].dataset.dual = '1';
  editor.changed(true, els[i]);
  toast(els[i].dataset.dual ? 'Dual dialogue on: these two speeches print side by side.' : 'Dual dialogue off.');
}

function omitScene() {
  const si = currentSceneIndex(S.curPara);
  const sc = S.derived.scenes[si];
  if (!sc || sc.t !== 'scene') { toast('Put the cursor in a scene first.'); return; }
  const el = editor.els()[sc.i];
  el._meta = { ...(el._meta || {}), omitted: !(el._meta && el._meta.omitted) };
  editor.decorate(el);
  markDirty();
  scheduleRefresh(50);
  toast(el._meta.omitted ? 'Scene omitted. It prints as OMITTED and keeps its number.' : 'Scene restored.');
}

function setRevision(level) {
  const prev = S.project.settings.rev_level;
  S.project.settings.rev_level = level;
  const date = new Date().toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' });
  const auto = /^(\w+) Revision – /.test(S.project.settings.header || '') || !S.project.settings.header;
  if (auto) S.project.settings.header = level ? `${REVISIONS[level][0]} Revision – ${date}` : '';
  markDirty();
  applySettingsUI();
  scheduleRefresh(50);
  if (level && level !== prev) toast(`${REVISIONS[level][0]} revision: changed lines get an asterisk in the margin.`);
}

function clearRevisions() {
  editor.pushUndo();
  for (const el of editor.els()) delete el.dataset.rev;
  markDirty();
  scheduleRefresh(50);
  toast('Revision marks cleared.');
}

function moveScene(dir) {
  const scenes = S.derived.scenes.filter((x) => x.t === 'scene');
  const si = currentSceneIndex(S.curPara);
  const cur = S.derived.scenes[si];
  if (!cur) return;
  const k = scenes.indexOf(cur);
  if (dir < 0 && k > 0) panels.moveBlock(cur.i, scenes[k - 1].i);
  else if (dir > 0 && k >= 0 && k < scenes.length - 1) panels.moveBlock(cur.i, k + 2 < scenes.length ? scenes[k + 2].i : editor.els().length);
  else { toast(dir < 0 ? 'This is already the first scene.' : 'This is already the last scene.'); return; }
  refresh();
}

function addElementHere(t, lvl) {
  const c = editor.caret();
  if (!c) return;
  editor.pushUndo();
  const n = editor.insertParaAfter(c.el, { t, runs: [{ x: '' }], lvl });
  editor.setSel(c.pi + 1, 0);
  editor.changed(true, n);
}

// ------------------------------------------------------------------ find & replace

const find = { matches: [], idx: -1 };

function openFind(replace = false) {
  if (S.view !== 'script') setView('script');
  const bar = $('#findbar');
  bar.hidden = false;
  $('#replaceInput').hidden = !replace;
  $('#replaceOne').hidden = !replace;
  $('#replaceAll').hidden = !replace;
  const sel = window.getSelection().toString();
  if (sel && !sel.includes('\n')) $('#findInput').value = sel;
  $('#findInput').focus();
  $('#findInput').select();
  runFind(false);
}

function closeFind() {
  $('#findbar').hidden = true;
  clearHighlights();
  const m = find.matches[find.idx];
  editor.root.focus();
  if (m) editor.setSel(m.pi, m.a, m.pi, m.b);
}

function clearHighlights() {
  if (window.CSS && CSS.highlights) { CSS.highlights.delete('find-all'); CSS.highlights.delete('find-cur'); }
}

function matchRange(m) {
  const el = editor.els()[m.pi];
  if (!el) return null;
  const a = editor.posAt(el, m.a), b = editor.posAt(el, m.b);
  const r = document.createRange();
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  return r;
}

function runFind(move = true) {
  const q = $('#findInput').value;
  const cs = $('#findCase').checked;
  find.matches = [];
  if (q) {
    const needle = cs ? q : q.toLowerCase();
    Array.from(editor.els()).forEach((el, pi) => {
      const hay = cs ? textOf(el) : textOf(el).toLowerCase();
      let k = hay.indexOf(needle);
      while (k >= 0) { find.matches.push({ pi, a: k, b: k + q.length }); k = hay.indexOf(needle, k + Math.max(1, q.length)); }
    });
  }
  if (!find.matches.length) { find.idx = -1; clearHighlights(); $('#findCount').textContent = q ? 'No matches' : ''; return; }
  if (find.idx < 0 || !move || find.idx >= find.matches.length) find.idx = Math.max(0, find.matches.findIndex((m) => m.pi >= S.curPara));
  showMatch();
}

// Matches are painted with the CSS Highlight API, so the caret and keyboard focus stay in the find box.
function showMatch() {
  const m = find.matches[find.idx];
  $('#findCount').textContent = `${find.idx + 1} of ${find.matches.length}`;
  if (!m) return;
  if (window.CSS && CSS.highlights && window.Highlight) {
    CSS.highlights.set('find-all', new Highlight(...find.matches.slice(0, 2000).map(matchRange).filter(Boolean)));
    CSS.highlights.set('find-cur', new Highlight(matchRange(m)));
  }
  const el = editor.els()[m.pi];
  const desk = $('#desk');
  const r = el.getBoundingClientRect(), dr = desk.getBoundingClientRect();
  if (r.top < dr.top + 80 || r.bottom > dr.bottom - 40) desk.scrollTop += r.top - dr.top - dr.height * 0.35;
}

function findStep(d) {
  if (!find.matches.length) runFind();
  if (!find.matches.length) return;
  find.idx = (find.idx + d + find.matches.length) % find.matches.length;
  showMatch();
}

function replaceIn(el, a, b, rep) {
  const runs = runsOf(el);
  const st = (() => { let k = 0; for (const r of runs) { if (a < k + r.x.length) return r.s || 0; k += r.x.length; } return 0; })();
  return concatRuns(concatRuns(sliceRuns(runs, 0, a), [{ x: rep, s: st }]), sliceRuns(runs, b));
}

function replaceOne() {
  const m = find.matches[find.idx];
  if (!m) return;
  editor.pushUndo();
  const el = editor.els()[m.pi];
  const nr = replaceIn(el, m.a, m.b, $('#replaceInput').value);
  editor.setRuns(el, nr);
  editor.changed(false, el);
  runFind(false);
}

function replaceAll() {
  if (!find.matches.length) return;
  editor.pushUndo();
  const rep = $('#replaceInput').value;
  const n = find.matches.length;
  for (let k = find.matches.length - 1; k >= 0; k--) {
    const m = find.matches[k];
    const el = editor.els()[m.pi];
    editor.setRuns(el, replaceIn(el, m.a, m.b, rep));
    editor.changed(false, el);
  }
  scheduleRefresh(50);
  runFind(false);
  toast(`Replaced ${n} ${n === 1 ? 'match' : 'matches'}.`);
}

// ------------------------------------------------------------------ export

async function doExport(kind, opts = {}) {
  try {
    const p = projectNow();
    if (opts.titlePage !== undefined) p.settings = { ...p.settings, title_page: opts.titlePage };
    if (opts.sceneNumbers !== undefined) p.settings = { ...p.settings, scene_numbers: opts.sceneNumbers };
    const name = S.project.title_page.title.split('\n')[0].trim() || S.name || 'Untitled';
    const out = await api.exportAs(kind, p, name, opts);
    if (out) toast(isDesktop ? `Exported ${out.split(/[\\/]/).pop()}` : 'Export downloaded.');
  } catch (e) {
    dialogs.alert('Export failed', String(e.message || e));
  }
}

// ------------------------------------------------------------------ commands & menus

const need = () => !!S.project;
export const COMMANDS = [
  // File
  { id: 'new', menu: 'File', label: 'New screenplay', keys: 'Ctrl+N', run: newDoc },
  { id: 'open', menu: 'File', label: 'Open or import…', keys: 'Ctrl+O', run: openDoc, hint: '.pageone, Fountain, Final Draft' },
  { id: 'save', menu: 'File', label: 'Save', keys: 'Ctrl+S', run: () => save(), when: need },
  { id: 'saveas', menu: 'File', label: 'Save as…', keys: 'Ctrl+Shift+S', run: () => save(true), when: need },
  { sep: true, menu: 'File' },
  { id: 'export', menu: 'File', label: 'Export…', keys: 'Ctrl+Shift+E', run: () => dialogs.exportDialog(doExport), when: need },
  { id: 'pdf', menu: 'File', label: 'Export PDF…', keys: 'Ctrl+P', run: () => dialogs.exportDialog(doExport, 'pdf'), when: need },
  { sep: true, menu: 'File' },
  { id: 'titlepage', menu: 'File', label: 'Title page…', keys: 'Ctrl+Shift+T', run: () => dialogs.titlePageDialog(), when: need },
  { id: 'setup', menu: 'File', label: 'Document setup…', run: () => dialogs.setupDialog(), when: need },
  { sep: true, menu: 'File' },
  { id: 'close', menu: 'File', label: 'Close script', keys: 'Ctrl+W', run: closeDoc, when: need },
  { id: 'quit', menu: 'File', label: 'Quit', keys: 'Ctrl+Q', run: quit },
  // Edit
  { id: 'undo', menu: 'Edit', label: 'Undo', keys: 'Ctrl+Z', run: () => editor.undo(), when: need },
  { id: 'redo', menu: 'Edit', label: 'Redo', keys: 'Ctrl+Shift+Z', run: () => editor.redo(), when: need },
  { sep: true, menu: 'Edit' },
  { id: 'selscene', menu: 'Edit', label: 'Select scene', keys: 'Ctrl+Shift+A', run: () => { editor.root.focus(); editor.selectScene(); }, when: need },
  { id: 'find', menu: 'Edit', label: 'Find…', keys: 'Ctrl+F', run: () => openFind(false), when: need },
  { id: 'replace', menu: 'Edit', label: 'Find and replace…', keys: 'Ctrl+H', run: () => openFind(true), when: need },
  { id: 'goto', menu: 'Edit', label: 'Go to page…', keys: 'Ctrl+G', run: () => dialogs.gotoDialog(), when: need },
  { sep: true, menu: 'Edit' },
  { id: 'bold', menu: 'Edit', label: 'Bold', keys: 'Ctrl+B', run: () => editor.toggleStyle(1), when: need },
  { id: 'italic', menu: 'Edit', label: 'Italic', keys: 'Ctrl+I', run: () => editor.toggleStyle(2), when: need },
  { id: 'underline', menu: 'Edit', label: 'Underline', keys: 'Ctrl+U', run: () => editor.toggleStyle(4), when: need },
  // View
  { id: 'v-script', menu: 'View', label: 'Script', keys: 'Ctrl+Alt+1', run: () => setView('script'), check: () => S.view === 'script', when: need },
  { id: 'v-cards', menu: 'View', label: 'Story board', keys: 'Ctrl+Alt+2', run: () => setView('cards'), check: () => S.view === 'cards', when: need },
  { sep: true, menu: 'View' },
  { id: 'nav', menu: 'View', label: 'Navigator', keys: 'Ctrl+Alt+N', run: () => setPref('nav', !S.prefs.nav), check: () => S.prefs.nav },
  { id: 'insp', menu: 'View', label: 'Scene inspector', keys: 'Ctrl+Alt+I', run: () => setPref('insp', !S.prefs.insp), check: () => S.prefs.insp },
  { id: 'notes', menu: 'View', label: 'Show notes', run: () => setPref('showNotes', !S.prefs.showNotes), check: () => S.prefs.showNotes },
  { sep: true, menu: 'View' },
  { id: 'focus', menu: 'View', label: 'Focus mode (full screen)', keys: 'Ctrl+Shift+F', run: () => toggleFocus(), check: () => document.body.classList.contains('focus'), when: need },
  { id: 'dark', menu: 'View', label: 'Dark mode', keys: 'Ctrl+Shift+L', run: () => toggleDark(), check: () => S.prefs.theme !== 'day' },
  { id: 'typewriter', menu: 'View', label: 'Typewriter scrolling', run: () => setPref('typewriter', !S.prefs.typewriter), check: () => S.prefs.typewriter },
  { sep: true, menu: 'View' },
  { id: 'zin', menu: 'View', label: 'Zoom in', keys: 'Ctrl+=', run: () => zoom(0.1) },
  { id: 'zout', menu: 'View', label: 'Zoom out', keys: 'Ctrl+-', run: () => zoom(-0.1) },
  { id: 'zreset', menu: 'View', label: 'Actual size', keys: 'Ctrl+Alt+0', run: () => zoom(0) },
  { sep: true, menu: 'View' },
  { id: 'th-day', menu: 'View', label: 'Day theme', run: () => setPref('theme', 'day'), check: () => S.prefs.theme === 'day' },
  { id: 'th-night', menu: 'View', label: 'Night theme', run: () => setPref('theme', 'night'), check: () => S.prefs.theme === 'night' },
  { id: 'th-mid', menu: 'View', label: 'Midnight theme (dark desk, white page)', run: () => setPref('theme', 'midnight'), check: () => S.prefs.theme === 'midnight' },
  // Script
  ...['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'centered', 'lyric', 'general'].map((t) => ({
    id: 'el-' + t, menu: 'Script', label: ELEMS[t].label, keys: 'Ctrl+' + ELEMS[t].key, run: () => { editor.root.focus(); editor.changeElement(t); }, when: need, check: () => editor.current && editor.current.dataset.t === t,
  })),
  { sep: true, menu: 'Script' },
  { id: 'sec1', menu: 'Script', label: 'New act label (board)…', keys: 'Ctrl+Shift+1', run: () => { setView('cards'); setTimeout(() => { const n = document.getElementById('actName'); n && n.focus(); }, 50); }, when: need },
  { id: 'sec2', menu: 'Script', label: 'New sequence here…', keys: 'Ctrl+Shift+2', run: () => dialogs.sectionDialog({ lvl: 2 }), when: need },
  { id: 'sec3', menu: 'Script', label: 'New beat here…', keys: 'Ctrl+Shift+3', run: () => dialogs.sectionDialog({ lvl: 3 }), when: need },
  { id: 'note', menu: 'Script', label: 'Note', keys: 'Ctrl+Shift+4', run: () => { editor.root.focus(); editor.changeElement('note'); }, when: need },
  { sep: true, menu: 'Script' },
  { id: 'sceneup', menu: 'Script', label: 'Move scene up', keys: 'Alt+Shift+ArrowUp', run: () => moveScene(-1), when: need },
  { id: 'scenedown', menu: 'Script', label: 'Move scene down', keys: 'Alt+Shift+ArrowDown', run: () => moveScene(1), when: need },
  { sep: true, menu: 'Script' },
  { id: 'dual', menu: 'Script', label: 'Dual dialogue', keys: 'Ctrl+Alt+D', run: toggleDual, when: need },
  { id: 'rename', menu: 'Script', label: 'Rename character…', run: () => dialogs.renameDialog(), when: need },
  { id: 'tuner', menu: 'Script', label: 'Dialogue tuner…', keys: 'Ctrl+Alt+T', run: () => dialogs.tunerDialog(), when: need },
  { id: 'reports', menu: 'Script', label: 'Reports…', keys: 'Ctrl+Shift+R', run: () => dialogs.reportsDialog(), when: need },
  // Production
  { id: 'scenenums', menu: 'Production', label: 'Scene numbers', run: () => setSetting('scene_numbers', !S.project.settings.scene_numbers), check: () => S.project && S.project.settings.scene_numbers, when: need },
  { id: 'omit', menu: 'Production', label: 'Omit current scene', run: omitScene, when: need },
  { sep: true, menu: 'Production' },
  ...REVISIONS.map(([name, color], i) => ({
    id: 'rev-' + i, menu: 'Production', label: i === 0 ? 'Revisions off' : `${name} revision`, color: i ? color : null, run: () => setRevision(i), check: () => S.project && (S.project.settings.rev_level || 0) === i, when: need,
  })),
  { id: 'clearrev', menu: 'Production', label: 'Clear revision marks', run: clearRevisions, when: need },
  // Help
  { id: 'shortcuts', menu: 'Help', label: 'Keyboard shortcuts', keys: 'F1', run: () => dialogs.shortcutsDialog() },
  { id: 'format', menu: 'Help', label: 'Screenplay format guide', run: () => dialogs.formatGuide() },
  { id: 'sample', menu: 'Help', label: 'Open the sample script', run: openSample },
  { id: 'about', menu: 'Help', label: 'About Page One', run: () => dialogs.aboutDialog() },
  // palette-only
  { id: 'palette', label: 'Command palette', keys: 'Ctrl+K', run: () => dialogs.palette(COMMANDS) },
];

const MENUS = ['File', 'Edit', 'View', 'Script', 'Production', 'Help'];

function buildMenus() {
  const nav = $('#menus');
  nav.innerHTML = MENUS.map((m) => `<div data-menu="${m}"><button aria-haspopup="true">${m}</button></div>`).join('');
  let open = null;
  const close = () => { if (open) { open.classList.remove('open'); open.querySelector('.menu-pop')?.remove(); open = null; } };
  const show = (wrap) => {
    close();
    open = wrap;
    wrap.classList.add('open');
    const list = COMMANDS.filter((c) => c.menu === wrap.dataset.menu);
    const ul = document.createElement('ul');
    ul.className = 'menu-pop';
    ul.innerHTML = list.map((c) => c.sep ? '<li class="sep"></li>' :
      `<li data-id="${c.id}" class="${c.check ? 'check' : ''} ${c.check && c.check() ? 'checked' : ''} ${c.when && !c.when() ? 'disabled' : ''}">${c.color ? `<i style="width:10px;height:10px;border-radius:2px;background:${c.color};box-shadow:0 0 0 1px var(--line)"></i>` : ''}<span>${esc(c.label)}</span>${c.keys ? `<kbd>${keyText(c.keys).replace("ArrowUp", "↑").replace("ArrowDown", "↓")}</kbd>` : ''}</li>`).join('');
    wrap.appendChild(ul);
  };
  nav.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) {
      e.preventDefault();
      const c = COMMANDS.find((x) => x.id === li.dataset.id);
      close();
      c && c.run();
      return;
    }
    const b = e.target.closest('div[data-menu] > button');
    if (b) {
      e.preventDefault();
      const wrap = b.parentElement;
      if (open === wrap) close(); else show(wrap);
    }
  });
  nav.addEventListener('mouseover', (e) => {
    const b = e.target.closest('div[data-menu] > button');
    if (b && open && open !== b.parentElement) show(b.parentElement);
  });
  document.addEventListener('mousedown', (e) => { if (open && !nav.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

// Mac: move shortcuts that macOS reserves for itself
for (const c of COMMANDS) if (c.keys) c.keys = platformKeys(c.keys);

function matchKeys(e, keys) {
  if (!keys) return false;
  const parts = keys.split('+');
  const key = parts.pop();
  const want = { Ctrl: false, Shift: false, Alt: false };
  for (const p of parts) want[p] = true;
  // AltGr (Windows/Linux European keyboards) reports Ctrl+Alt; it types characters, not shortcuts
  if (e.getModifierState && e.getModifierState('AltGraph')) return false;
  if ((e.ctrlKey || e.metaKey) !== want.Ctrl || e.shiftKey !== want.Shift || e.altKey !== want.Alt) return false;
  if (/^F\d+$/.test(key)) return e.key === key;
  if (/^\d$/.test(key)) return e.code === 'Digit' + key;
  if (key === '=') return e.key === '=' || e.key === '+' || e.code === 'Equal';
  if (key === '-') return e.key === '-' || e.key === '_' || e.code === 'Minus';
  if (e.key.toLowerCase() === key.toLowerCase()) return true;
  // on a Mac, Option turns letters into symbols (⌥N types "˜"), so match the physical key there
  return e.altKey && /^[a-z]$/i.test(key) && e.code === 'Key' + key.toUpperCase();
}

document.addEventListener('keydown', (e) => {
  // the desktop window must never reload (F5, Ctrl+R): it would drop unsaved work
  if (isDesktop && (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'r'))) { e.preventDefault(); return; }
  if (e.defaultPrevented) return;
  if (e.key === 'Escape') {
    if (!$('#findbar').hidden && $('#findbar').contains(document.activeElement)) { closeFind(); return; }
    if (document.body.classList.contains('focus') && !document.querySelector('.scrim') && !S.editor.smart) { toggleFocus(false); return; }
  }
  if (document.querySelector('.scrim')) return; // dialogs handle their own keys
  const inEditor = editor.root.contains(e.target);
  const t = e.target;
  const inOtherText = !inEditor && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  for (const c of COMMANDS) {
    if (c.sep || !matchKeys(e, c.keys)) continue;
    // script-editing shortcuts belong to the editor; in other text boxes the box's own Ctrl+Z, Ctrl+B… apply
    if (c.id.startsWith('el-') || /^sec[23]|^note$|^bold|^italic|^underline|^undo|^redo|^selscene/.test(c.id)) {
      if (!inEditor && !inOtherText && S.project && S.view === 'script') { e.preventDefault(); c.run(); }
      return;
    }
    if (c.when && !c.when()) return;
    e.preventDefault();
    c.run();
    return;
  }
});

// ------------------------------------------------------------------ wiring

function wire() {
  for (const b of document.querySelectorAll('.views button')) b.addEventListener('click', () => setView(b.dataset.view));
  $('#cmdBtn').addEventListener('click', () => dialogs.palette(COMMANDS));
  $('#themeBtn').addEventListener('click', toggleDark);
  $('#focusBtn').addEventListener('click', () => toggleFocus());
  $('#focusExit').addEventListener('click', () => toggleFocus(false));
  $('#fzFit').addEventListener('click', () => setFocusZoom('fit'));
  $('#fzRange').addEventListener('input', (e) => setFocusZoom(+e.target.value / 100));
  $('#fzOut').addEventListener('click', () => setFocusZoom(Math.max(1, Math.round((focusZoomValue() - 0.1) * 10) / 10)));
  $('#fzIn').addEventListener('click', () => setFocusZoom(Math.min(2, Math.round((focusZoomValue() + 0.1) * 10) / 10)));
  // keep the caret in the page, not on the toolbar
  $('#focusBar').addEventListener('mouseup', () => setTimeout(() => editor.root.focus(), 0));
  window.addEventListener('resize', () => { if ((S.prefs.focusZoom ?? 'fit') === 'fit') applyFocusZoom(); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('focus') && !isDesktop) toggleFocus(false); });
  window.addEventListener('resize', () => editor.scheduleDual());

  $('#docTitle').addEventListener('click', () => S.project && dialogs.titlePageDialog());
  $('#wNew').addEventListener('click', newDoc);
  $('#wOpen').addEventListener('click', openDoc);
  $('#wSample').addEventListener('click', openSample);
  $('#wRecover').addEventListener('click', () => {
    const rec = readRecovery();
    if (!rec) return;
    loadProject(rec.project, { path: rec.path, name: rec.name || 'Untitled', imported: true });
    toast('Recovered. Save to keep these changes.');
  });
  setInterval(writeRecovery, 20000);
  window.addEventListener('pagehide', writeRecovery);
  $('#recent').addEventListener('click', (e) => { const b = e.target.closest('button[data-path]'); if (b) openPath(b.dataset.path); });
  $('#elemChip').addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (!editor.current) return;
    editor.root.focus();
    editor.showElementPicker(editor.current);
  });
  $('#revChip').addEventListener('click', () => dialogs.palette(COMMANDS, 'revision'));
  $('#projNotes').addEventListener('input', (e) => { S.project.notes = e.target.value; markDirty(); });

  $('#findInput').addEventListener('input', () => { find.idx = -1; runFind(false); });
  $('#findInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); }
  });
  $('#replaceInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); replaceOne(); } });
  $('#findCase').addEventListener('change', () => runFind(false));
  $('#findNext').addEventListener('click', () => findStep(1));
  $('#findPrev').addEventListener('click', () => findStep(-1));
  $('#replaceOne').addEventListener('click', replaceOne);
  $('#replaceAll').addEventListener('click', replaceAll);
  $('#findClose').addEventListener('click', closeFind);

  api.onCloseRequested(() => quit());
  window.addEventListener('beforeunload', (e) => { if (!isDesktop && S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // autosave every minute once the script has a home on disk
  setInterval(() => {
    if (S.prefs.autosave && S.project && S.dirty && S.path && isDesktop && !document.querySelector('.scrim')) save();
  }, 60000);
}

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = keyText(msg);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// exported for panels/dialogs
S.app = { refresh, scheduleRefresh, markDirty, toast, setView, applySettingsUI, setSetting, setPref, onCaret, currentSceneIndex, save, doExport, setTitleUI };

/** Mac: show ⌘ ⌥ ⇧ in the labels written into the page itself. */
function platformLabels() {
  if (!IS_MAC) return;
  document.body.classList.add('mac');
  for (const el of document.querySelectorAll('[title]')) el.title = keyText(el.title);
  for (const el of document.querySelectorAll('kbd')) el.textContent = keyText(el.textContent);
}

async function start() {
  applyPrefs();
  buildMenus();
  wire();
  platformLabels();
  // a script double-clicked in Finder while Page One is already open (macOS)
  api.onOpenFile((path) => openPath(path));
  const initial = await api.initialFile().catch(() => null);
  if (initial) {
    try {
      const r = await api.openPath(initial);
      loadProject(r.project, { path: r.path, name: stem(r.name), imported: !r.path });
      return;
    } catch (e) {
      dialogs.alert('Could not open the file', String(e.message || e));
    }
  }
  const qs = new URLSearchParams(location.search);
  if (qs.has('sample')) { await openSample(); return; }
  if (qs.has('new')) { await newDoc(); return; }
  showWelcome();
}

start();
