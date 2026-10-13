// Navigator (scenes / characters / notes), scene inspector and the index-card board.

import { S, eighths, projectNow } from './state.js';
import { esc, textOf } from './editor.js';
import { SCENE_COLORS, ELEMS, COLORS, colorLabel, keyText } from './elements.js';
import * as dialogs from './dialogs.js';
import { renderBoard } from './board.js';
import { splitEnding, trimBlock, finishReorder } from './reorder.js';

const $ = (s) => document.querySelector(s);
let curScene = -1;
let navTab = 'scenes';

// ------------------------------------------------------------------ tabs

for (const b of document.querySelectorAll('.nav .tabs button')) {
  b.addEventListener('click', () => {
    navTab = b.dataset.tab;
    for (const x of document.querySelectorAll('.nav .tabs button')) x.setAttribute('aria-selected', String(x === b));
    for (const t of ['scenes', 'characters', 'notes']) $('#pane-' + t).hidden = t !== navTab;
    renderAll();
  });
}

export function renderAll() {
  if (!S.project) return;
  // paragraph indices shift when scenes move or acts are added: re-anchor to the caret's element
  if (S.editor.current && S.editor.current.parentNode) S.curPara = S.editor.indexOf(S.editor.current);
  curScene = S.app.currentSceneIndex(S.curPara);
  renderScenes();
  if (navTab === 'characters') renderCharacters();
  if (navTab === 'notes') renderNotes();
  renderInspector();
  if (S.view === 'cards') renderCards();
}

export function onCaretScene(si) {
  if (si === curScene) return;
  curScene = si;
  const list = $('#sceneList');
  for (const li of list.querySelectorAll('li.cur')) li.classList.remove('cur');
  const li = list.querySelector(`li[data-si="${si}"]`);
  if (li) {
    li.classList.add('cur');
    const r = li.getBoundingClientRect(), pr = list.parentElement.getBoundingClientRect();
    if (r.top < pr.top + 40 || r.bottom > pr.bottom) li.scrollIntoView({ block: 'nearest' });
  }
  renderInspector();
}

// ------------------------------------------------------------------ scenes list

function sceneLabel(sc) {
  if (sc.t === 'section') return sc.text || 'Untitled section';
  return sc.text || 'Untitled scene';
}

function renderScenes() {
  const q = ($('#sceneFilter').value || '').trim().toUpperCase();
  const list = $('#sceneList');
  const scenes = S.derived.scenes;
  if (!scenes.length) {
    list.innerHTML = '<li class="empty-hint" style="display:block;cursor:default">Scenes appear here as you write headings. Type INT. or EXT. on a new line to start one.</li>';
    return;
  }
  list.innerHTML = scenes.map((sc, si) => {
    if (q && sc.t === 'scene' && !sc.text.toUpperCase().includes(q) && !(sc.meta.synopsis || '').toUpperCase().includes(q)) return '';
    if (sc.t === 'section') {
      return `<li class="sec" data-si="${si}" data-lvl="${sc.lvl}" draggable="true" title="Click to rename; drag to move the whole ${['', 'act', 'sequence', 'beat'][sc.lvl] || 'act'}"><span class="h">${esc(sceneLabel(sc))}</span><span class="pg">p. ${sc.page || ''}</span>${sc.meta.synopsis ? `<span class="s">${esc(sc.meta.synopsis)}</span>` : ''}</li>`;
    }
    const color = sc.meta.color ? `style="--c:${esc(sc.meta.color)}"` : '';
    return `<li data-si="${si}" ${color} class="${si === curScene ? 'cur' : ''} ${sc.meta.omitted ? 'omit' : ''}" draggable="true">
      <span class="n">${esc(sc.number || '')}</span><span class="h">${esc(sceneLabel(sc))}</span>
      <span class="pg">${sc.eighths ? eighths(sc.eighths) : ''}</span>
      ${sc.meta.synopsis ? `<span class="s">${esc(sc.meta.synopsis)}</span>` : ''}</li>`;
  }).join('');
}

$('#sceneFilter').addEventListener('input', renderScenes);
$('#sceneList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-si]');
  if (!li) return;
  const sc = S.derived.scenes[+li.dataset.si];
  if (sc.t === 'section') { dialogs.sectionDialog({ para: sc.i }); return; }
  if (S.view !== 'script') S.app.setView('script');
  S.editor.focusPara(sc.i, textOf(S.editor.els()[sc.i]).length);
});
wireDrag($('#sceneList'), 'li[data-si]');

// ------------------------------------------------------------------ moving scenes

/** Paragraph range [a, b) that belongs to the scene/section at paragraph a. */
function blockRange(paras, a) {
  const p = paras[a];
  let b = a + 1;
  if (p.t === 'section') {
    const lvl = p.lvl || 1;
    while (b < paras.length && !(paras[b].t === 'section' && (paras[b].lvl || 1) <= lvl)) b++;
  } else {
    while (b < paras.length && paras[b].t !== 'scene' && paras[b].t !== 'section') b++;
  }
  return [a, b];
}

export function moveBlock(from, before) {
  const all = S.editor.paras();
  const { body: paras, ending } = splitEnding(all);
  if (from >= paras.length) return false;
  const [a, b] = blockRange(paras, from);
  before = Math.min(before, paras.length);
  if (before >= a && before <= b) return false;
  const block = trimBlock(paras.slice(a, b));
  const rest = paras.slice(0, a).concat(paras.slice(b));
  const at = before > a ? before - (b - a) : before;
  rest.splice(at, 0, ...block);
  const out = finishReorder(rest, ending);
  // keep the cursor on the moved heading
  const head = out.indexOf(block[0]);
  S.editor.replaceAll(out, [Math.max(0, head), 0, Math.max(0, head), 0]);
  S.app.toast('Scene moved in the script. Ctrl+Z puts it back.');
  return true;
}

function wireDrag(container, selector) {
  let dragging = null;
  container.addEventListener('dragstart', (e) => {
    const el = e.target.closest(selector);
    if (!el) return;
    dragging = el;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.dataset.si);
  });
  container.addEventListener('dragend', () => {
    if (dragging) dragging.classList.remove('dragging');
    for (const x of container.querySelectorAll('.drag-over')) x.classList.remove('drag-over');
    dragging = null;
  });
  container.addEventListener('dragover', (e) => {
    const el = e.target.closest(selector);
    if (!dragging) return;
    e.preventDefault();
    for (const x of container.querySelectorAll('.drag-over')) if (x !== el) x.classList.remove('drag-over');
    if (el && el !== dragging) el.classList.add('drag-over');
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const el = e.target.closest(selector);
    if (!dragging) return;
    const from = S.derived.scenes[+dragging.dataset.si];
    if (el && el !== dragging) {
      const to = S.derived.scenes[+el.dataset.si];
      moveBlock(from.i, to.i);
    } else if (!el) {
      moveBlock(from.i, S.editor.els().length);
    }
  });
}

// ------------------------------------------------------------------ characters

let openChar = null;

function renderCharacters() {
  const list = $('#charList');
  const chars = S.derived.characters;
  if (!chars.length) {
    list.innerHTML = '<li class="empty-hint">Characters appear once they speak. Press Tab on an empty action line to write a character cue.</li>';
    return;
  }
  const max = chars[0].speeches || 1;
  const cards = new Map((S.project.characters || []).map((c) => [c.name, c]));
  list.innerHTML = chars.map((c) => {
    const card = cards.get(c.name) || {};
    const col = card.color ? `style="--c:${esc(card.color)}"` : '';
    return `<li data-name="${esc(c.name)}" ${col}>
      <div class="row"><span class="dot"></span><span class="name">${esc(c.name)}</span>
      <span class="stat">${c.speeches} lines · ${c.scenes.size} sc</span></div>
      <div class="bar-meter"><i style="width:${(c.speeches / max) * 100}%"></i></div>
      ${openChar === c.name ? `<div class="detail">
        <span class="hint">${c.words.toLocaleString()} words of dialogue. First speaks on page ${c.firstPage || 1}.</span>
        <div class="swatches">${SCENE_COLORS.map((x) => `<button data-c="${x}" style="--c:${x || 'transparent'}" class="${(card.color || '') === x ? 'on' : ''}" title="${x ? 'Colour' : 'No colour'}"></button>`).join('')}</div>
        <textarea rows="4" data-bio placeholder="Who they are, what they want, how they talk…">${esc(card.bio || '')}</textarea>
        <div class="btns"><button class="btn" data-act="tuner">Dialogue tuner</button><button class="btn" data-act="rename">Rename…</button><button class="btn" data-act="first">Go to first line</button><button class="btn" data-act="voice" title="Choose the voice that reads ${esc(c.name)} in a table read">Voice…</button></div>
      </div>` : ''}
    </li>`;
  }).join('');
}

function charCard(name) {
  S.project.characters = S.project.characters || [];
  let c = S.project.characters.find((x) => x.name === name);
  if (!c) { c = { name, color: '', bio: '' }; S.project.characters.push(c); }
  return c;
}

$('#charList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-name]');
  if (!li) return;
  const name = li.dataset.name;
  const sw = e.target.closest('.swatches button');
  if (sw) { charCard(name).color = sw.dataset.c; S.app.markDirty(); renderCharacters(); return; }
  const act = e.target.closest('[data-act]');
  if (act) {
    if (act.dataset.act === 'tuner') dialogs.tunerDialog(name);
    if (act.dataset.act === 'rename') dialogs.renameDialog(name);
    if (act.dataset.act === 'voice') dialogs.voicesDialog();
    if (act.dataset.act === 'first') {
      const c = S.derived.characters.find((x) => x.name === name);
      S.app.setView('script');
      S.editor.focusPara(c.first);
    }
    return;
  }
  if (e.target.closest('.row')) { openChar = openChar === name ? null : name; renderCharacters(); }
});
$('#charList').addEventListener('input', (e) => {
  if (!e.target.matches('[data-bio]')) return;
  const name = e.target.closest('li').dataset.name;
  charCard(name).bio = e.target.value;
  S.app.markDirty();
});

// ------------------------------------------------------------------ notes

function renderNotes() {
  const els = S.editor.els();
  const items = [];
  for (let i = 0; i < els.length; i++) if (els[i].dataset.t === 'note') items.push([i, textOf(els[i])]);
  $('#noteList').innerHTML = items.length
    ? items.map(([i, t]) => `<li data-pi="${i}" style="display:block"><span class="s" style="display:block">${esc(t || '(empty note)')}</span><span class="pg">p. ${S.layout ? S.layout.para_page[i] : ''}</span></li>`).join('')
    : '<li class="empty-hint" style="display:block;cursor:default">No notes yet. ' + keyText('Ctrl+Shift+4') + ' adds a note that never prints.</li>';
}
$('#noteList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-pi]');
  if (!li) return;
  S.app.setView('script');
  S.editor.focusPara(+li.dataset.pi);
});

// ------------------------------------------------------------------ inspector

let inspFor = null;

export function renderInspector(force = false) {
  const box = $('#inspector');
  if (!S.project) { box.innerHTML = ''; return; }
  const sc = S.derived.scenes[curScene];
  // don't rebuild while the writer is typing in one of its fields
  if (!force && box.contains(document.activeElement) && inspFor === (sc && sc.i)) {
    const facts = box.querySelector('.facts');
    if (facts && sc) facts.innerHTML = factsHtml(sc);
    return;
  }
  inspFor = sc ? sc.i : null;
  if (!sc) {
    box.innerHTML = `<div class="insp"><h3>Scene</h3><p class="hint">Click inside a scene to see its synopsis, colour and notes here.</p>${titleBlock()}</div>`;
    return;
  }
  const m = sc.meta || {};
  const isScene = sc.t === 'scene';
  box.innerHTML = `<div class="insp">
    <div class="heading" style="${m.color ? `border-left:4px solid ${esc(m.color)}` : ''}">${esc(sc.text || (isScene ? 'Untitled scene' : 'Untitled section'))}</div>
    ${isScene ? `<dl class="facts">${factsHtml(sc)}</dl>` : ''}
    <label class="field"><span>Synopsis (shows on the index card)</span><textarea rows="4" data-k="synopsis" placeholder="What happens, in a sentence or two.">${esc(m.synopsis || '')}</textarea></label>
    <div class="field"><span>Colour${m.color ? `: ${esc(colorLabel(S.project, m.color))}` : ''}</span><div class="swatches">${SCENE_COLORS.map((x) => `<button data-c="${x}" style="--c:${x || 'transparent'}" class="${(m.color || '') === x ? 'on' : ''}" title="${esc(x ? colorLabel(S.project, x) : 'No colour')}"></button>`).join('')}</div></div>
    <label class="field"><span>Notes</span><textarea rows="5" data-k="notes" placeholder="Research, ideas, what to fix…">${esc(m.notes || '')}</textarea></label>
    ${isScene ? `<label class="field"><span>Scene number</span><input type="text" data-k="num" value="${esc(m.num || '')}" placeholder="Automatic (${esc(sc.number || '')})"></label>
      <label class="chk"><input type="checkbox" data-k="omitted" ${m.omitted ? 'checked' : ''}> Omitted (prints as OMITTED, keeps its number)</label>` : ''}
  </div>`;
}

function factsHtml(sc) {
  const cast = [...(sc.cast || [])];
  return `<dt>Scene</dt><dd>${esc(sc.number || '—')}</dd>
    <dt>Page</dt><dd>${sc.page || '—'}</dd>
    <dt>Length</dt><dd>${sc.eighths ? eighths(sc.eighths) + ' pg' : '—'}</dd>
    <dt>Speaking</dt><dd><span class="cast">${cast.length ? cast.map((c) => `<span>${esc(c)}</span>`).join('') : '—'}</span></dd>`;
}

function titleBlock() {
  const lay = S.layout;
  if (!lay) return '';
  return `<dl class="facts" style="margin-top:8px"><dt>Pages</dt><dd>${lay.pages.length}</dd><dt>Scenes</dt><dd>${S.derived.scenes.filter((s) => s.t === 'scene').length}</dd><dt>Characters</dt><dd>${S.derived.characters.length}</dd></dl>`;
}

function setMeta(k, v) {
  const sc = S.derived.scenes[curScene];
  if (!sc) return;
  const el = S.editor.els()[sc.i];
  el._meta = { ...(el._meta || {}), [k]: v };
  sc.meta = el._meta;
  S.editor.decorate(el);
  S.app.markDirty();
  S.app.scheduleRefresh(k === 'num' || k === 'omitted' ? 200 : 600);
}

$('#inspector').addEventListener('input', (e) => {
  const k = e.target.dataset.k;
  if (!k) return;
  setMeta(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
});
$('#inspector').addEventListener('click', (e) => {
  const sw = e.target.closest('.swatches button');
  if (!sw) return;
  setMeta('color', sw.dataset.c);
  renderInspector(true);
  renderScenes();
});

// ------------------------------------------------------------------ story board

export function renderCards() { renderBoard(); }

export { projectNow, ELEMS };
