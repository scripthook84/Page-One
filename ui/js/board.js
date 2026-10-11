// Story board: every scene is a card on a canvas, linked to the next one in story order.
// Arrange them in one line or stacked in act columns; with auto-snap off, cards float
// wherever you drop them. Either way, the drop position decides the scene's place in the
// screenplay, and the script is reordered the moment you let go.

import { S, eighths } from './state.js';
import { esc, textOf } from './editor.js';
import { COLORS, colorLabel } from './elements.js';
import * as dialogs from './dialogs.js';
import { moveBlock } from './panels.js';

const CW = 230, CH = 150, GAP = 54, ACT_GAP = 46, PAD = 40;
const ACT_H = 40, SEQ_H = 24;
const LINE_ACT_Y = PAD, LINE_SEQ_Y = PAD + 52, LINE_CARD_Y = PAD + 88;
const COL_GAP = 80, COL_TOP = PAD + 56, ROW_GAP = 30;
const DEFAULT_ACT = '#d5d9df';

let zoom = 1;
let view = null;
let drag = null;
let justDragged = 0;

const root = () => document.getElementById('cards');
const st = () => S.project.settings;

// ------------------------------------------------------------------ layout

function computeLayout() {
  const mode = st().board_mode === 'columns' ? 'columns' : 'line';
  const snap = st().board_snap !== false;
  const scenes = S.derived.scenes;
  const items = [];
  let actNo = 0;

  if (mode === 'line') {
    let x = PAD, lastAct = null, seqRun = 0;
    scenes.forEach((sc, si) => {
      if (sc.t === 'section' && sc.lvl === 1) {
        if (items.length) x += ACT_GAP;
        actNo++;
        lastAct = { si, sc, kind: 'act', x, y: LINE_ACT_Y, w: CW, h: ACT_H, n: actNo, count: 0 };
        items.push(lastAct);
        seqRun = 0;
      } else if (sc.t === 'section') {
        items.push({ si, sc, kind: 'seq', x: x + seqRun * 14, y: LINE_SEQ_Y - seqRun * 4, w: CW, h: SEQ_H });
        seqRun++;
      } else {
        items.push({ si, sc, kind: 'card', x, y: LINE_CARD_Y, w: CW, h: CH });
        if (lastAct) { lastAct.w = x + CW - lastAct.x; lastAct.count++; }
        x += CW + GAP;
        seqRun = 0;
      }
    });
  } else {
    const hasActs = scenes.some((sc) => sc.t === 'section' && sc.lvl === 1);
    let col = -1, y = COL_TOP, inCol = 0, act = null;
    const colX = (c) => PAD + c * (CW + COL_GAP);
    scenes.forEach((sc, si) => {
      if (sc.t === 'section' && sc.lvl === 1) {
        col++;
        actNo++;
        act = { si, sc, kind: 'act', x: colX(col), y: PAD, w: CW, h: ACT_H, n: actNo, col, count: 0 };
        items.push(act);
        y = COL_TOP;
        inCol = 0;
        return;
      }
      if (col < 0 || (!hasActs && sc.t === 'scene' && inCol >= 4)) { col++; y = COL_TOP; inCol = 0; }
      if (sc.t === 'section') {
        items.push({ si, sc, kind: 'seq', x: colX(col), y, w: CW, h: SEQ_H, col });
        y += SEQ_H + 12;
      } else {
        items.push({ si, sc, kind: 'card', x: colX(col), y, w: CW, h: CH, col });
        y += CH + ROW_GAP;
        inCol++;
        if (act) act.count++;
      }
    });
  }

  for (const it of items) {
    it.sx = it.x;
    it.sy = it.y;
    const pos = it.kind === 'card' && it.sc.meta && it.sc.meta.pos;
    if (!snap && pos) { it.x = pos[0]; it.y = pos[1]; it.floating = true; }
  }
  let w = 0, h = 0;
  for (const it of items) { w = Math.max(w, it.x + it.w); h = Math.max(h, it.y + it.h); }
  return { mode, snap, items, w: w + PAD * 3, h: h + PAD * 3 };
}

// ------------------------------------------------------------------ render

function toolbar() {
  return `<div class="board-tools">
    <div class="seg" role="group" aria-label="Arrangement">
      <button data-mode="line" title="All scenes in one line, acts labelled above">Line</button>
      <button data-mode="columns" title="Each act stacked in its own column">Columns</button>
    </div>
    <label class="chk" title="On: cards snap into place. Off: drop cards anywhere; their order still follows position."><input type="checkbox" id="bSnap"> Auto-snap</label>
    <button class="btn" id="bTidy" title="Snap every floating card back into place">Tidy up</button>
    <button class="btn" id="bAct" title="Create an act label (left panel)">+ Act label</button>
    <span class="seg"><button id="bZo" aria-label="Zoom out">−</button><span class="zoomv" id="bZv">100%</span><button id="bZi" aria-label="Zoom in">+</button></span>
    <span class="hint">Drag cards to reorder the script, and act labels to change where an act starts. Click a card's text to write a synopsis; double-click to open the scene.</span>
  </div>
  <div class="board-scroll" id="bScroll"><div class="board-sizer" id="bSizer"><div class="board-canvas" id="bCanvas"></div></div></div>`;
}

function linkPath(a, b) {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  if (bx >= ax + CW - 2) {
    const x1 = ax + CW, y1 = ay + CH / 2, x2 = bx - 6, y2 = by + CH / 2;
    const d = Math.max(24, (x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + d},${y1} ${x2 - d},${y2} ${x2},${y2}`;
  }
  if (by >= ay + CH - 2 && Math.abs(bx - ax) < CW) {
    const x1 = ax + CW / 2, y1 = ay + CH, x2 = bx + CW / 2, y2 = by - 6;
    const d = Math.max(16, (y2 - y1) / 2);
    return `M${x1},${y1} C${x1},${y1 + d} ${x2},${y2 - d} ${x2},${y2}`;
  }
  const x1 = ax + CW / 2, y1 = ay + CH, x2 = bx + CW / 2, y2 = by - 6;
  return `M${x1},${y1} C${x1},${y1 + 90} ${x2},${y2 - 90} ${x2},${y2}`;
}

export function renderBoard(force = false) {
  const box = root();
  if (!box || box.hidden || !S.project) return;
  if (!force && (drag || box.querySelector('.syn[contenteditable="true"]'))) return;
  if (!box.querySelector('.board-tools')) {
    box.innerHTML = toolbar();
    wire(box);
  }
  view = computeLayout();
  for (const b of box.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === view.mode));
  box.querySelector('#bSnap').checked = view.snap;
  box.querySelector('#bTidy').disabled = !view.items.some((it) => it.floating);
  box.querySelector('#bZv').textContent = `${Math.round(zoom * 100)}%`;

  renderSide();
  const curSi = S.app.currentSceneIndex(S.curPara);
  const filter = S.colorFilter || '';
  const cards = view.items.filter((it) => it.kind === 'card');
  let links = '';
  for (let k = 0; k + 1 < cards.length; k++) links += `<path d="${linkPath(cards[k], cards[k + 1])}" marker-end="url(#bArrow)"/>`;

  const html = view.items.map((it) => {
    const m = it.sc.meta || {};
    if (it.kind === 'act') {
      return `<div class="b-act" data-si="${it.si}" style="left:${it.x}px;top:${it.y}px;width:${it.w}px;--c:${esc(m.color || DEFAULT_ACT)}" title="Click to rename or recolour this act">
        <b>ACT ${it.n}</b><span>${esc(it.sc.text || 'Untitled act')}</span><small>${it.count} sc</small></div>`;
    }
    if (it.kind === 'seq') {
      return `<div class="b-seq" data-si="${it.si}" style="left:${it.x}px;top:${it.y}px" title="${it.sc.lvl === 2 ? 'Sequence' : 'Beat'} — click to edit">${esc(it.sc.text || 'Untitled')}</div>`;
    }
    const c = m.color || '';
    const label = c ? colorLabel(S.project, c) : 'No colour';
    return `<div class="b-card${m.omitted ? ' omit' : ''}${it.floating ? ' floating' : ''}${it.si === curSi ? ' cur' : ''}${filter && c !== filter ? ' dim' : ''}"
        data-si="${it.si}" style="left:${it.x}px;top:${it.y}px;${c ? `--c:${esc(c)}` : ''}">
      <header><span class="n">${esc(it.sc.number || '')}</span><span class="h">${esc(it.sc.text || 'Untitled scene')}</span></header>
      <button class="b-color" title="Colour: ${esc(label)}" aria-label="Colour: ${esc(label)}"></button>
      <div class="syn" spellcheck="true" data-ph="${esc((it.sc.first || 'Write a synopsis…').slice(0, 140))}">${esc(m.synopsis || '')}</div>
      <footer><span>p. ${it.sc.page || ''}</span><span>${it.sc.eighths ? eighths(it.sc.eighths) + ' pg' : ''}</span></footer>
    </div>`;
  }).join('');

  const canvas = box.querySelector('#bCanvas');
  canvas.style.width = `${view.w}px`;
  canvas.style.height = `${view.h}px`;
  canvas.style.transform = `scale(${zoom})`;
  box.querySelector('#bSizer').style.width = `${view.w * zoom}px`;
  box.querySelector('#bSizer').style.height = `${view.h * zoom}px`;
  canvas.innerHTML = `<svg class="board-links" width="${view.w}" height="${view.h}" aria-hidden="true">
      <defs><marker id="bArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow" d="M0,0 L10,5 L0,10 z"/></marker></defs>${links}</svg>${html}
    ${cards.length ? '' : '<p class="empty-hint" style="position:absolute;left:40px;top:120px">Scenes appear here as cards once the script has scene headings.</p>'}`;
}

// ------------------------------------------------------------------ dropping

/** Where a card dropped with its centre at (cx, cy) belongs: paragraph index to insert before, and a marker. */
function dropTarget(cx, cy, dragged) {
  const nParas = S.editor.els().length;
  const others = view.items.filter((it) => it !== dragged);
  if (view.mode === 'line') {
    const keyed = others.map((it) => ({ it, key: it.kind === 'act' ? it.x - 1 : it.x + it.w / 2 })).sort((a, b) => a.key - b.key);
    const hit = keyed.find((k) => k.key > cx);
    const lastCard = [...others].reverse().find((it) => it.kind === 'card');
    let mx;
    if (hit) mx = hit.it.kind === 'act' ? hit.it.x - ACT_GAP / 2 - GAP / 4 : hit.it.x - GAP / 2;
    else mx = lastCard ? lastCard.x + CW + GAP / 2 : PAD;
    const my = hit ? (hit.it.kind === 'act' ? LINE_CARD_Y : hit.it.y) : (lastCard ? lastCard.y : LINE_CARD_Y);
    return { para: hit ? hit.it.sc.i : nParas, marker: { x: mx - 2, y: my - 8, w: 4, h: CH + 16 } };
  }
  // columns
  const cols = [...new Set(view.items.map((it) => it.col).filter((c) => c !== undefined))].sort((a, b) => a - b);
  const colX = (c) => PAD + c * (CW + COL_GAP);
  let col = cols[0] ?? 0, best = Infinity;
  for (const c of cols) { const d = Math.abs(colX(c) + CW / 2 - cx); if (d < best) { best = d; col = c; } }
  const inCol = others.filter((it) => it.col === col && it.kind !== 'act').sort((a, b) => a.y - b.y);
  const hit = inCol.find((it) => it.y + it.h / 2 > cy);
  if (hit) return { para: hit.sc.i, marker: { x: colX(col) - 6, y: hit.y - ROW_GAP / 2 - 2, w: CW + 12, h: 4 } };
  const next = view.items.find((it) => it.col !== undefined && it.col > col);
  const last = inCol[inCol.length - 1];
  const y = last ? last.y + last.h + ROW_GAP / 2 - 2 : COL_TOP - 8;
  return { para: next ? next.sc.i : nParas, marker: { x: colX(col) - 6, y, w: CW + 12, h: 4 } };
}

function showMarker(m) {
  const canvas = document.getElementById('bCanvas');
  let el = canvas.querySelector('.b-drop');
  if (!el) { el = document.createElement('div'); el.className = 'b-drop'; canvas.appendChild(el); }
  Object.assign(el.style, { left: `${m.x}px`, top: `${m.y}px`, width: `${m.w}px`, height: `${m.h}px` });
}

async function finishActDrag(d) {
  const x = parseFloat(d.el.style.left), y = parseFloat(d.el.style.top);
  const tgt = dropTarget(x + 1, view.mode === 'line' ? LINE_CARD_Y + CH / 2 : y + 60, d.it);
  if (!moveSection(d.it.sc.i, tgt.para)) renderBoard(true);
  else { await S.app.refresh(); renderBoard(true); }
}

/** Move just an act/sequence label (not its scenes): the act now starts before `before`. */
function moveSection(from, before) {
  if (before === from || before === from + 1) return false;
  const paras = S.editor.paras();
  const [p] = paras.splice(from, 1);
  const at = before > from ? before - 1 : before;
  paras.splice(at, 0, p);
  S.editor.replaceAll(paras);
  S.app.toast('Act boundary moved. Ctrl+Z puts it back.');
  return true;
}

async function finishDrag(d) {
  if (d.it.kind === 'act') { finishActDrag(d); return; }
  const card = d.el;
  const x = parseFloat(card.style.left), y = parseFloat(card.style.top);
  const it = d.it;
  const tgt = dropTarget(x + CW / 2, y + CH / 2, it);
  const el = S.editor.els()[it.sc.i];
  const meta = { ...(el._meta || {}) };
  if (view.snap) delete meta.pos; else meta.pos = [Math.round(x), Math.round(y)];
  el._meta = meta;
  const moved = moveBlock(it.sc.i, tgt.para);
  if (!moved) S.app.markDirty();
  await S.app.refresh();
  renderBoard(true);
}

// ------------------------------------------------------------------ interaction

function itemOf(el) {
  const si = +el.closest('[data-si]').dataset.si;
  return view.items.find((it) => it.si === si);
}

function colorPopover(btn, current, onPick) {
  closePopover();
  const canvas = document.getElementById('bCanvas');
  const card = btn.closest('.b-card');
  const pop = document.createElement('div');
  pop.className = 'b-pop';
  pop.innerHTML = [{ c: '', name: 'No colour' }, ...COLORS].map((k) =>
    `<button data-c="${k.c}" style="--c:${k.c || 'var(--paper)'}"><i></i>${esc(k.c ? colorLabel(S.project, k.c) : 'No colour')}${k.c === current ? ' ✓' : ''}</button>`).join('');
  pop.style.left = `${parseFloat(card.style.left) + CW - 30}px`;
  pop.style.top = `${parseFloat(card.style.top) + 28}px`;
  canvas.appendChild(pop);
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]');
    if (!b) return;
    closePopover();
    onPick(b.dataset.c);
  });
}
function closePopover() { document.querySelectorAll('.b-pop').forEach((p) => p.remove()); }

function setMeta(it, k, v) {
  const el = S.editor.els()[it.sc.i];
  el._meta = { ...(el._meta || {}), [k]: v };
  S.editor.decorate(el);
  S.app.markDirty();
}

function wire(box) {
  box.addEventListener('click', (e) => {
    if (Date.now() - justDragged < 250) return;
    const mode = e.target.closest('[data-mode]');
    if (mode) { S.app.setSetting('board_mode', mode.dataset.mode); return; }
    if (e.target.id === 'bTidy') {
      for (const it of view.items) if (it.floating) { const el = S.editor.els()[it.sc.i]; const m = { ...el._meta }; delete m.pos; el._meta = m; }
      S.app.markDirty();
      S.app.refresh().then(() => renderBoard(true));
      return;
    }
    if (e.target.id === 'bAct') { document.getElementById('actName').focus(); return; }
    if (e.target.id === 'bZi' || e.target.id === 'bZo') {
      zoom = Math.min(1.5, Math.max(0.4, Math.round((zoom + (e.target.id === 'bZi' ? 0.1 : -0.1)) * 10) / 10));
      renderBoard(true);
      return;
    }
    if (!e.target.closest('.b-pop')) closePopover();
    const label = e.target.closest('.b-act, .b-seq');
    if (label) { dialogs.sectionDialog({ para: itemOf(label).sc.i }); return; }
    const colorBtn = e.target.closest('.b-color');
    if (colorBtn) {
      const it = itemOf(colorBtn);
      colorPopover(colorBtn, (it.sc.meta || {}).color || '', (c) => { setMeta(it, 'color', c); S.app.refresh().then(() => renderBoard(true)); });
      return;
    }
    const syn = e.target.closest('.b-card .syn');
    if (syn && !syn.isContentEditable) {
      syn.contentEditable = 'true';
      syn.focus();
      const r = document.createRange();
      r.selectNodeContents(syn);
      r.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
  });
  box.addEventListener('change', (e) => {
    if (e.target.id === 'bSnap') S.app.setSetting('board_snap', e.target.checked);
  });
  box.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.b-card');
    if (!card || e.target.closest('.syn')) return;
    const it = itemOf(card);
    S.app.setView('script');
    S.editor.focusPara(it.sc.i, textOf(S.editor.els()[it.sc.i]).length);
  });
  box.addEventListener('input', (e) => {
    const syn = e.target.closest('.b-card .syn');
    if (!syn) return;
    setMeta(itemOf(syn), 'synopsis', syn.innerText.trim());
  });
  box.addEventListener('focusout', (e) => {
    const syn = e.target.closest && e.target.closest('.b-card .syn');
    if (!syn) return;
    syn.removeAttribute('contenteditable');
    S.app.scheduleRefresh(50);
  });
  box.addEventListener('keydown', (e) => {
    const syn = e.target.closest('.b-card .syn');
    if (syn && (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey))) { e.preventDefault(); syn.blur(); }
  });

  // dragging cards
  box.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.b-card, .b-act');
    if (!card || e.button !== 0 || e.target.closest('.b-color') || e.target.closest('.syn[contenteditable="true"]')) return;
    closePopover();
    const it = itemOf(card);
    drag = { el: card, it, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, moved: false, id: e.pointerId };
    card.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.sx) / zoom, dy = (e.clientY - drag.sy) / zoom;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    drag.el.classList.add('lifted');
    const x = Math.max(0, drag.ox + dx), y = Math.max(0, drag.oy + dy);
    drag.el.style.left = `${x}px`;
    drag.el.style.top = `${y}px`;
    const isAct = drag.it.kind === 'act';
    showMarker(dropTarget(isAct ? x + 1 : x + CW / 2, isAct ? (view.mode === 'line' ? LINE_CARD_Y + CH / 2 : y + 60) : y + CH / 2, drag.it).marker);
    // keep the card in view while dragging near the edges
    const sc = document.getElementById('bScroll');
    const r = sc.getBoundingClientRect();
    if (e.clientX > r.right - 40) sc.scrollLeft += 18; else if (e.clientX < r.left + 40) sc.scrollLeft -= 18;
    if (e.clientY > r.bottom - 40) sc.scrollTop += 18; else if (e.clientY < r.top + 40) sc.scrollTop -= 18;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    justDragged = Date.now();
    finishDrag(d);
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) { drag = null; renderBoard(true); } });
}

export function resetBoardDom() {
  const box = root();
  if (box) box.innerHTML = '';
}

// ------------------------------------------------------------------ side panel: act labels + colour key

function sideEl(id) { return document.getElementById(id); }
let newActColor = '#f9e48f';

function renderSide() {
  const els = S.editor.els();
  const scenes = S.derived.scenes;
  const acts = scenes.filter((sc) => sc.t === 'section' && sc.lvl === 1);
  const list = sideEl('actList');
  if (!list.contains(document.activeElement)) {
    list.innerHTML = acts.length ? acts.map((a, n) => `<li data-i="${a.i}" style="--c:${esc((a.meta && a.meta.color) || DEFAULT_ACT)}">
        <button type="button" class="dot" title="Change colour" aria-label="Change colour"></button><b>ACT ${n + 1}</b>
        <input type="text" value="${esc(a.text)}" aria-label="Act ${n + 1} name">
        <button type="button" class="del" title="Remove this act label (its scenes stay)" aria-label="Remove act ${n + 1}">✕</button></li>`).join('')
      : '<li class="empty-hint">No acts yet. Add the first one below; it appears on the board as ACT 1.</li>';
  }
  const form = sideEl('actNew');
  if (!form.contains(document.activeElement)) {
    const sel = sideEl('actBefore');
    const curSi = S.app.currentSceneIndex(S.curPara);
    const cur = scenes[curSi];
    sel.innerHTML = scenes.filter((sc) => sc.t === 'scene').map((sc) => `<option value="${sc.i}" ${cur && cur.i === sc.i ? 'selected' : ''}>${esc(sc.number || '')} ${esc((sc.text || 'Untitled scene').toUpperCase().slice(0, 40))}</option>`).join('') + `<option value="${els.length}">End of script</option>`;
    sideEl('actName').placeholder = `ACT ${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'][acts.length] || acts.length + 1}`;
    sideEl('actColors').innerHTML = COLORS.map((k) => `<button type="button" data-c="${k.c}" style="--c:${k.c}" class="${newActColor === k.c ? 'on' : ''}" title="${esc(colorLabel(S.project, k.c))}"></button>`).join('');
  }
  renderLegend();
}

function renderLegend() {
  const ul = sideEl('legend');
  if (ul.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const counts = new Map();
  for (const sc of S.derived.scenes) if (sc.t === 'scene' && sc.meta.color) counts.set(sc.meta.color, (counts.get(sc.meta.color) || 0) + 1);
  const labels = S.project.color_labels || {};
  ul.innerHTML = COLORS.map((k) => `<li style="--c:${k.c}">
      <button type="button" data-c="${k.c}" class="${S.colorFilter === k.c ? 'on' : ''}" title="${S.colorFilter === k.c ? 'Show all scenes' : 'Highlight ' + esc(colorLabel(S.project, k.c)) + ' scenes'}" aria-label="Highlight ${k.name} scenes"></button>
      <input type="text" data-c="${k.c}" value="${esc(labels[k.c] || '')}" placeholder="${k.name} — type a label" aria-label="${k.name} label">
      <span class="cnt">${counts.get(k.c) || ''}</span></li>`).join('');
  const note = sideEl('legendNote');
  note.hidden = !S.colorFilter;
  if (S.colorFilter) note.textContent = `Highlighting ${colorLabel(S.project, S.colorFilter)} scenes. Click the colour again to show all.`;
}

function actEl(li) { return S.editor.els()[+li.dataset.i]; }

function commitActName(input) {
  const el = actEl(input.closest('li'));
  const v = input.value.trim();
  if (!el || !v || v === textOf(el)) return;
  S.editor.pushUndo();
  S.editor.setRuns(el, [{ x: v }]);
  S.editor.changed(true, el);
}

function wireSide() {
  const list = sideEl('actList');
  list.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.target.tagName === 'INPUT' && e.key === 'Escape') { e.target.value = textOf(actEl(e.target.closest('li'))); e.target.blur(); }
  });
  list.addEventListener('focusout', (e) => { if (e.target.tagName === 'INPUT') commitActName(e.target); });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    const el = actEl(li);
    if (e.target.closest('.del')) {
      S.editor.pushUndo();
      el.remove();
      S.editor.changed(true);
      S.app.toast('Act label removed. Its scenes stay where they are.');
      return;
    }
    if (e.target.closest('.dot')) {
      // cycle through the standard colours
      const cur = (el._meta && el._meta.color) || '';
      const k = COLORS.findIndex((x) => x.c === cur);
      const next = COLORS[(k + 1) % COLORS.length].c;
      el._meta = { ...(el._meta || {}), color: next };
      S.app.markDirty();
      S.app.refresh().then(() => renderBoard(true));
    }
  });
  sideEl('actColors').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]');
    if (!b) return;
    newActColor = b.dataset.c;
    for (const x of sideEl('actColors').querySelectorAll('button')) x.classList.toggle('on', x === b);
  });
  sideEl('actNew').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = sideEl('actName');
    const name = input.value.trim() || input.placeholder;
    const before = +sideEl('actBefore').value;
    const els = S.editor.els();
    S.editor.pushUndo();
    const el = S.editor.makeEl({ t: 'section', lvl: 1, runs: [{ x: name }], meta: { color: newActColor } });
    if (before < els.length) els[before].before(el); else S.editor.root.appendChild(el);
    S.editor.changed(true);
    input.value = '';
    S.app.toast(`${name} added to the board.`);
    S.app.refresh().then(() => renderBoard(true));
  });

  const legend = sideEl('legend');
  legend.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]');
    if (!b) return;
    S.colorFilter = S.colorFilter === b.dataset.c ? '' : b.dataset.c;
    renderLegend();
    renderBoard(true);
  });
  legend.addEventListener('input', (e) => {
    const c = e.target.dataset.c;
    if (!c) return;
    S.project.color_labels = { ...(S.project.color_labels || {}), [c]: e.target.value };
    if (!e.target.value.trim()) delete S.project.color_labels[c];
    S.app.markDirty();
  });
  legend.addEventListener('focusout', () => renderBoard(true));
}

wireSide();
