// Story board — a snap grid with act lanes.
//
// Every scene is a card in a grid cell. Act labels sit in a header row above the grid and span one
// or more columns; every card in an act's columns belongs to that act and takes its colour, so each
// act reads as a coloured lane running down the board. Drag a label to move it along the header, or
// its right edge to stretch it across more columns — it snaps column by column.
//
// Story order: acts left to right; inside each act the cards flow in story order through the lane,
// left to right across its columns, then down, with no gaps. A one-column label stacks its cards in
// a column; stretching the label lays them out across more columns. Drop a card anywhere in a lane
// and it takes that place in the sequence; the screenplay is reordered to match at once (one undo
// step).
//
// Stored per scene: meta.cell = [column, row]; per act: meta.band = [first column, width].

import { S, eighths } from './state.js';
import { splitEnding, trimBlock, finishReorder } from './reorder.js';
import { esc, textOf } from './editor.js';
import { COLORS, colorLabel } from './elements.js';
import * as dialogs from './dialogs.js';

const CW = 230, CH = 150, GX = 44, GY = 64, PAD = 40;
const HEAD_H = 34, TOP = 58;
const DEFAULT_ACT = '#d5d9df';

let zoom = 1;
let view = null;
let drag = null;
let justDragged = 0;

const root = () => document.getElementById('cards');
const st = () => S.project.settings;
// Inside each act the cards read in rows (left to right, then down); act lanes give the columns.
const mode = () => 'rows';
const span = () => Math.max(1, Math.min(12, +st().board_span || 5));
const colX = (c) => PAD + c * (CW + GX);
const rowY = (r) => PAD + TOP + r * (CH + GY);
const bandWidthPx = (w) => w * (CW + GX) - GX;

// ------------------------------------------------------------------ geometry of an act's lane

/** Columns [start, end] of each group: cards before the first act, then one group per act. */
function intervals(bands) {
  const out = [];
  out.push({ start: 0, end: bands.length ? bands[0][0] - 1 : Infinity });
  bands.forEach((b, k) => out.push({ start: b[0], end: k + 1 < bands.length ? bands[k + 1][0] - 1 : Infinity }));
  return out;
}

function groupOfCol(ivs, col) {
  for (let g = ivs.length - 1; g >= 0; g--) if (col >= ivs[g].start && col <= ivs[g].end) return g;
  return 0;
}

function readKey(c) { return mode() === 'rows' ? [c[1], c[0]] : [c[0], c[1]]; }
function cmpCells(a, b) { const x = readKey(a), y = readKey(b); return x[0] - y[0] || x[1] - y[1]; }

// ------------------------------------------------------------------ model: script → board

function legacyCell(slot) {
  const n = span();
  return mode() === 'rows' ? [slot % n, Math.floor(slot / n)] : [Math.floor(slot / n), slot % n];
}

/** Columns a lane has: the act label's width (the first, unlabelled lane: up to the first act). */
function laneWidth(gi, bands) {
  if (gi === 0) return Math.max(1, bands.length ? bands[0][0] : span());
  return Math.max(1, bands[gi - 1][1] | 0);
}

function buildModel() {
  const items = S.derived.scenes.map((sc, ord) => {
    const m = sc.meta || {};
    let cell = Array.isArray(m.cell) && m.cell.length === 2 ? [m.cell[0] | 0, m.cell[1] | 0] : null;
    if (!cell && Number.isInteger(m.slot) && sc.t === 'scene') cell = legacyCell(m.slot);
    return { si: ord, ord, sc, kind: sc.t === 'scene' ? 'card' : sc.lvl === 1 ? 'act' : 'seq', cell, storedCell: cell };
  });
  // groups in script order: cards before the first act, then each act with its scenes
  const groups = [{ act: null, cards: [] }];
  for (const it of items) {
    if (it.kind === 'act') groups.push({ act: it, cards: [] });
    else if (it.kind === 'card') groups[groups.length - 1].cards.push(it);
  }
  // bands: stored, or laid out after the previous lane, as wide as "cards per row" allows
  const fit = (n) => Math.max(1, Math.min(span(), n));
  let cursor = groups[0].cards.length ? fit(groups[0].cards.length) : 0;
  let prevStart = -1;
  const bands = [];
  groups.slice(1).forEach((g) => {
    const b = g.act.sc.meta && Array.isArray(g.act.sc.meta.band) ? g.act.sc.meta.band : null;
    let start = b ? b[0] | 0 : cursor;
    if (start <= prevStart) start = prevStart + 1;
    const width = b ? Math.max(1, b[1] | 0) : fit(g.cards.length);
    g.act.band = [start, width];
    bands.push(g.act.band);
    prevStart = start;
    cursor = start + width;
  });
  const ivs = intervals(bands);
  // widths: each act runs up to the next; the last act keeps the width of its label
  bands.forEach((b, k) => { if (k + 1 < bands.length) b[1] = bands[k + 1][0] - b[0]; });
  // cards flow through their act's lane in story order: left to right across the lane, then down
  groups.forEach((g, gi) => {
    const W = laneWidth(gi, bands);
    const start = gi === 0 ? 0 : bands[gi - 1][0];
    g.cards.forEach((c, k) => {
      c.cell = [start + (k % W), Math.floor(k / W)];
      c.group = gi;
      c.act = g.act;
    });
  });
  // sequences/beats ride above the next scene in their act
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.kind !== 'seq') continue;
    it.anchor = items.slice(k + 1).find((x) => x.kind === 'card') || null;
  }
  let n = 0;
  for (const g of groups.slice(1)) g.act.n = ++n;
  return { items, groups, bands, ivs };
}

// ------------------------------------------------------------------ board → script

/**
 * Rewrite the script from board positions: acts in band order, each act's scenes in reading order,
 * cards belonging to whichever act's columns they sit in. Saves every cell and band. One undo step.
 */
function commit(model, message) {
  const { items, bands } = model;
  const ivs = intervals(bands);
  const cards = items.filter((it) => it.kind === 'card');
  const acts = items.filter((it) => it.kind === 'act');
  const seqs = items.filter((it) => it.kind === 'seq');
  const byGroup = ivs.map(() => []);
  for (const c of cards) byGroup[groupOfCol(ivs, c.cell[0])].push(c);
  byGroup.forEach((list) => list.sort((a, b) => cmpCells(a.cell, b.cell)));
  const order = [];
  const pushCard = (c) => { for (const q of seqs) if (q.anchor === c) order.push(q); order.push(c); };
  byGroup[0].forEach(pushCard);
  acts.forEach((a, k) => { order.push(a); (byGroup[k + 1] || []).forEach(pushCard); });
  for (const q of seqs) if (!q.anchor || !order.includes(q.anchor)) order.push(q);

  const { body: paras, ending } = splitEnding(S.editor.paras());
  const byStart = [...items].sort((a, b) => a.sc.i - b.sc.i);
  const blocks = new Map();
  byStart.forEach((it, k) => {
    const end = k + 1 < byStart.length ? byStart[k + 1].sc.i : paras.length;
    const block = trimBlock(paras.slice(it.sc.i, Math.min(end, paras.length)).map((p) => ({ ...p })));
    const meta = { ...(block[0].meta || {}) };
    delete meta.slot; delete meta.pos;
    if (it.kind === 'card') meta.cell = [...it.cell];
    if (it.kind === 'act') meta.band = [...it.band];
    block[0].meta = meta;
    blocks.set(it, block);
  });
  const first = items.length ? Math.min(...items.map((it) => it.sc.i)) : paras.length;
  S.editor.replaceAll(finishReorder(paras.slice(0, first).concat(...order.map((it) => blocks.get(it))), ending));
  if (message) S.app.toast(message);
  S.app.refresh().then(() => renderBoard(true));
}

function cloneModel() {
  const items = view.items.map((it) => ({ ...it, cell: it.cell && [...it.cell], band: it.band && [...it.band] }));
  const map = new Map(view.items.map((it, k) => [it, items[k]]));
  for (const it of items) if (it.anchor) it.anchor = map.get(it.anchor) || null;
  const bands = items.filter((it) => it.kind === 'act').map((a) => a.band);
  return { items, bands };
}

/** Drop a card: it takes that place in the act's sequence and the lane closes up around it. */
function dropCard(item, cell) {
  const model = cloneModel();
  const me = model.items.find((x) => x.si === item.si);
  const ivs = intervals(model.bands);
  const g = groupOfCol(ivs, cell[0]);
  const W = laneWidth(g, model.bands);
  const start = g === 0 ? 0 : model.bands[g - 1][0];
  const list = model.items.filter((x) => x.kind === 'card' && x !== me && groupOfCol(ivs, x.cell[0]) === g).sort((a, b) => cmpCells(a.cell, b.cell));
  const at = Math.max(0, Math.min(list.length, cell[1] * W + Math.min(W - 1, cell[0] - start)));
  list.splice(at, 0, me);
  list.forEach((c, k) => { c.cell = [start + (k % W), Math.floor(k / W)]; });
  commit(model, 'Scene moved in the script. Ctrl+Z puts it back.');
}

function setBands(changes, message) {
  const model = cloneModel();
  for (const [item, start, width] of changes) {
    const a = model.items.find((x) => x.si === item.si);
    a.band[0] = start;
    if (width !== undefined) a.band[1] = width;
  }
  commit(model, message);
}

function dropSeq(item, targetCard) {
  const model = cloneModel();
  const q = model.items.find((x) => x.si === item.si);
  q.anchor = model.items.find((x) => x.si === targetCard.si) || null;
  commit(model, 'Moved.');
}

/** Neighbouring acts of an act label (acts tile the columns, so moving one moves a boundary). */
function neighbours(item) {
  const acts = view.items.filter((x) => x.kind === 'act');
  const k = acts.indexOf(item);
  return { prev: acts[k - 1] || null, next: acts[k + 1] || null, after: acts[k + 2] || null, last: k === acts.length - 1 };
}

// ------------------------------------------------------------------ render

function toolbar() {
  return `<div class="board-tools">
    <span class="seg" title="Cards per row before wrapping"><button id="bSpanLess" aria-label="Fewer per row">−</button><span class="zoomv" id="bSpan">5 per row</span><button id="bSpanMore" aria-label="More per row">+</button></span>
    <button class="btn" id="bAct" title="Create an act label (left panel)">+ Act label</button>
    <span class="seg"><button id="bZo" aria-label="Zoom out">−</button><span class="zoomv" id="bZv">100%</span><button id="bZi" aria-label="Zoom in">+</button></span>
    <span class="hint">Cards follow each other in story order inside their act's colour. Stretch an act label by its right edge to lay its cards across more columns.</span>
  </div>
  <div class="board-scroll" id="bScroll"><div class="board-sizer" id="bSizer"><div class="board-canvas" id="bCanvas"></div></div></div>`;
}

function linkPath(a, b) {
  const ax = colX(a.cell[0]), ay = rowY(a.cell[1]), bx = colX(b.cell[0]), by = rowY(b.cell[1]);
  const r = 10;
  if (ay === by && bx > ax) return `M${ax + CW},${ay + CH / 2} L${bx - 6},${by + CH / 2}`;
  if (ax === bx && by > ay) return `M${ax + CW / 2},${ay + CH} L${bx + CW / 2},${by - 6}`;
  if (by > ay) {
    const x1 = ax + CW / 2, y1 = ay + CH, x2 = bx + CW / 2, y2 = by - 6, my = ay + CH + GY / 2;
    const dir = x2 < x1 ? -1 : 1;
    return `M${x1},${y1} V${my - r} Q${x1},${my} ${x1 + dir * r},${my} H${x2 - dir * r} Q${x2},${my} ${x2},${my + r} V${y2}`;
  }
  if (bx > ax) {
    const x1 = ax + CW, y1 = ay + CH / 2, x2 = bx - 6, y2 = by + CH / 2, mx = ax + CW + GX / 2;
    const dir = y2 < y1 ? -1 : 1;
    if (y1 === y2) return `M${x1},${y1} L${x2},${y2}`;
    return `M${x1},${y1} H${mx - r} Q${mx},${y1} ${mx},${y1 + dir * r} V${y2 - dir * r} Q${mx},${y2} ${mx + r},${y2} H${x2}`;
  }
  return `M${ax + CW / 2},${ay} C${ax + CW / 2},${ay - 60} ${bx + CW / 2},${by + CH + 60} ${bx + CW / 2},${by + CH + 6}`;
}

export function renderBoard(force = false) {
  const box = root();
  if (!box || box.hidden || !S.project) return;
  if (!force && (drag || box.querySelector('.syn[contenteditable="true"]'))) return;
  if (!box.querySelector('.board-tools')) {
    box.innerHTML = toolbar();
    wire(box);
  }
  const model = buildModel();
  view = model;
  renderSide();

  const m = mode(), n = span();
  box.querySelector('#bSpan').textContent = `${n} per ${m === 'rows' ? 'row' : 'column'}`;
  box.querySelector('#bZv').textContent = `${Math.round(zoom * 100)}%`;
  const cards = model.items.filter((it) => it.kind === 'card');
  const acts = model.items.filter((it) => it.kind === 'act');

  const maxCol = Math.max(-1, ...cards.map((c) => c.cell[0]), ...acts.map((a) => a.band[0] + a.band[1] - 1));
  const maxRow = Math.max(-1, ...cards.map((c) => c.cell[1]));
  const cols = Math.max(maxCol + 1, m === 'rows' ? n : 1) + 1;
  const rows = Math.max(maxRow + 1, m === 'columns' ? n : 1) + 1;
  const w = colX(cols - 1) + CW + PAD * 2, h = rowY(rows - 1) + CH + PAD * 2;
  view.cols = cols;
  view.rows = rows;

  // act lanes (behind everything) and header labels
  let lanes = '', heads = '';
  for (const a of acts) {
    const color = (a.sc.meta && a.sc.meta.color) || DEFAULT_ACT;
    const x = colX(a.band[0]), bw = bandWidthPx(a.band[1]);
    lanes += `<div class="b-lane" data-si="${a.si}" style="left:${x - 10}px;top:${PAD + HEAD_H + 8}px;width:${bw + 20}px;height:${h - PAD * 2 - HEAD_H}px;--c:${esc(color)}"></div>`;
    heads += `<div class="b-act" data-si="${a.si}" style="left:${x}px;top:${PAD}px;width:${bw}px;--c:${esc(color)}" title="Drag to move this act; drag its right edge to cover more columns; click to edit">
      <b>ACT ${a.n}</b><span>${esc(a.sc.text || 'Untitled act')}</span><i class="b-resize" title="Drag to cover more or fewer columns" aria-hidden="true"></i></div>`;
  }

  // empty cells
  const occupied = new Set(cards.map((c) => c.cell.join()));
  let cells = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (occupied.has(`${c},${r}`)) continue;
    cells += `<div class="b-cell" style="left:${colX(c)}px;top:${rowY(r)}px"></div>`;
  }

  const order = [...cards].sort((x, y) => x.group - y.group || cmpCells(x.cell, y.cell));
  let links = '';
  for (let k = 0; k + 1 < order.length; k++) links += `<path d="${linkPath(order[k], order[k + 1])}" marker-end="url(#bArrow)"/>`;

  const curSi = S.app.currentSceneIndex(S.curPara);
  const filter = S.colorFilter || '';
  const underBand = (c) => c.act || null;
  const cardHtml = cards.map((it) => {
    const meta = it.sc.meta || {};
    const own = meta.color || '';
    const band = underBand(it);
    const body = band ? (band.sc.meta && band.sc.meta.color) || DEFAULT_ACT : own;
    const label = own ? colorLabel(S.project, own) : 'No colour';
    const x = colX(it.cell[0]), y = rowY(it.cell[1]);
    return `<div class="b-card${meta.omitted ? ' omit' : ''}${it.si === curSi ? ' cur' : ''}${filter && own !== filter ? ' dim' : ''}${own ? ' has-own' : ''}"
        data-si="${it.si}" style="left:${x}px;top:${y}px;${body ? `--c:${esc(body)};` : ''}${own ? `--own:${esc(own)}` : ''}">
      <header><span class="n">${esc(it.sc.number || '')}</span><span class="h">${esc(it.sc.text || 'Untitled scene')}</span></header>
      <button class="b-color" style="${own ? `--dot:${esc(own)}` : ''}" title="Scene colour: ${esc(label)}" aria-label="Scene colour: ${esc(label)}"></button>
      <div class="syn" spellcheck="true" data-ph="${esc((it.sc.first || 'Write a synopsis…').slice(0, 140))}">${esc(meta.synopsis || '')}</div>
      <footer><span>p. ${it.sc.page || ''}</span><span>${it.act ? `Act ${it.act.n} · ` : ''}${it.sc.eighths ? eighths(it.sc.eighths) + ' pg' : ''}</span></footer>
    </div>`;
  }).join('');

  // sequences / beats: a small tag above the scene they start at
  // several labels on one scene sit side by side in a row above it
  const stack = new Map();
  const perCard = new Map();
  for (const q of model.items) if (q.kind === 'seq' && q.anchor && q.anchor.cell) perCard.set(q.anchor.cell.join(), (perCard.get(q.anchor.cell.join()) || 0) + 1);
  let seqHtml = '';
  for (const q of model.items.filter((it) => it.kind === 'seq')) {
    const at = q.anchor ? q.anchor.cell : null;
    if (!at) continue;
    const k = stack.get(at.join()) || 0;
    stack.set(at.join(), k + 1);
    const qc = (q.sc.meta && q.sc.meta.color) || '';
    const tagW = Math.floor((CW - 6) / Math.min(3, perCard.get(at.join()))) - 3;
    seqHtml += `<div class="b-seq${qc ? ' tinted' : ''}" data-si="${q.si}" style="left:${colX(at[0]) + k * (tagW + 3)}px;top:${rowY(at[1]) - 30}px;max-width:${tagW}px;${qc ? `--c:${esc(qc)}` : ''}" title="${q.sc.lvl === 2 ? 'Sequence' : 'Beat'}: drag onto another scene to move it; click to edit">${esc(q.sc.text || 'Untitled')}</div>`;
  }

  const canvas = box.querySelector('#bCanvas');
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.transform = `scale(${zoom})`;
  box.querySelector('#bSizer').style.width = `${w * zoom}px`;
  box.querySelector('#bSizer').style.height = `${h * zoom}px`;
  canvas.innerHTML = `${lanes}${cells}<svg class="board-links" width="${w}" height="${h}" aria-hidden="true">
      <defs><marker id="bArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow" d="M0,0 L10,5 L0,10 z"/></marker></defs>${links}</svg>${heads}${seqHtml}${cardHtml}
    ${cards.length ? '' : `<p class="empty-hint" style="position:absolute;left:40px;top:${rowY(0) + 20}px">Scenes appear here as cards once the script has scene headings.</p>`}`;
}

// ------------------------------------------------------------------ interaction

function itemOf(el) {
  const si = +el.closest('[data-si]').dataset.si;
  return view.items.find((it) => it.si === si);
}

function cellAt(x, y) {
  const col = Math.max(0, Math.min(view.cols - 1, Math.round((x - PAD - CW / 2) / (CW + GX))));
  const row = Math.max(0, Math.min(view.rows - 1, Math.round((y - PAD - TOP - CH / 2) / (CH + GY))));
  return [col, row];
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

function showTarget(cell, insert) {
  const canvas = document.getElementById('bCanvas');
  let el = canvas.querySelector('.b-target');
  if (!el) { el = document.createElement('div'); el.className = 'b-target'; canvas.appendChild(el); }
  Object.assign(el.style, { left: `${colX(cell[0]) - 6}px`, top: `${rowY(cell[1]) - 6}px` });
  el.classList.toggle('insert', !!insert);
  el.dataset.tip = insert ? 'Slide in here' : 'Drop here';
}

/** Live preview while an act label is moved or stretched: labels, lanes and the cards they'd colour. */
function previewBands(list) {
  const canvas = document.getElementById('bCanvas');
  for (const [item, start, width] of list) {
    const head = canvas.querySelector(`.b-act[data-si="${item.si}"]`);
    const lane = canvas.querySelector(`.b-lane[data-si="${item.si}"]`);
    const x = colX(start), bw = bandWidthPx(width);
    if (head) { head.style.left = `${x}px`; head.style.width = `${bw}px`; head.querySelector('span').dataset.cols = width > 1 ? `${width} columns` : ''; }
    if (lane) { lane.style.left = `${x - 10}px`; lane.style.width = `${bw + 20}px`; }
  }
}

function wire(box) {
  box.addEventListener('click', (e) => {
    if (Date.now() - justDragged < 250) return;
    if (e.target.id === 'bSpanLess' || e.target.id === 'bSpanMore') {
      S.app.setSetting('board_span', Math.max(1, Math.min(12, span() + (e.target.id === 'bSpanMore' ? 1 : -1))));
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
    if (label && !e.target.closest('.b-resize')) { dialogs.sectionDialog({ para: itemOf(label).sc.i }); return; }
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

  const canvasXY = (e) => {
    const cr = document.getElementById('bCanvas').getBoundingClientRect();
    return [(e.clientX - cr.left) / zoom, (e.clientY - cr.top) / zoom];
  };

  box.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.b-card, .b-act, .b-seq');
    if (!el || e.button !== 0 || e.target.closest('.b-color') || e.target.closest('.syn[contenteditable="true"]')) return;
    closePopover();
    const it = itemOf(el);
    const kind = el.classList.contains('b-card') ? 'card' : el.classList.contains('b-act') ? (e.target.closest('.b-resize') ? 'resize' : 'band') : 'seq';
    const [px, py] = canvasXY(e);
    drag = { el, it, kind, px, py, ox: parseFloat(el.style.left), oy: parseFloat(el.style.top), moved: false, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const [px, py] = canvasXY(e);
    const dx = px - drag.px, dy = py - drag.py;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) { drag.moved = true; drag.el.classList.add('lifted'); box.classList.add('dragging'); }

    if (drag.kind === 'band' || drag.kind === 'resize') {
      const { prev, next, after, last } = neighbours(drag.it);
      const [s0, w0] = drag.it.band;
      const changes = [];
      if (drag.kind === 'band') {
        // move the act's start; the act before it grows or shrinks to meet it
        let start = Math.round((drag.ox + dx - PAD) / (CW + GX));
        start = Math.max(prev ? prev.band[0] + 1 : 0, Math.min(next ? next.band[0] - 1 : start, start));
        changes.push([drag.it, start, last ? Math.max(1, s0 + w0 - start) : next.band[0] - start]);
        if (prev) changes.push([prev, prev.band[0], start - prev.band[0]]);
      } else {
        // stretch the right edge: the boundary with the next act moves with it
        let width = Math.round((bandWidthPx(w0) + dx + GX) / (CW + GX));
        if (next) {
          const nextEnd = next.band[0] + next.band[1] - 1;
          width = Math.max(1, Math.min((after ? after.band[0] - 1 : nextEnd + 1000) - s0, width));
          const ns = s0 + width;
          changes.push([drag.it, s0, width]);
          changes.push([next, ns, Math.max(1, (after ? after.band[0] : Math.max(nextEnd + 1, ns + 1)) - ns)]);
        } else {
          width = Math.max(1, width);
          changes.push([drag.it, s0, width]);
        }
      }
      drag.changes = changes;
      previewBands(changes);
    } else {
      const x = Math.max(0, drag.ox + dx), y = Math.max(0, drag.oy + dy);
      drag.el.style.left = `${x}px`;
      drag.el.style.top = `${y}px`;
      if (drag.kind === 'card') {
        drag.cell = cellAt(x + CW / 2, y + CH / 2);
        const occ = view.items.find((it) => it.kind === 'card' && it !== drag.it && it.cell[0] === drag.cell[0] && it.cell[1] === drag.cell[1]);
        showTarget(drag.cell, occ);
      } else {
        drag.cell = cellAt(x + 20, y + 40 + CH / 2 - 20);
        const occ = view.items.find((it) => it.kind === 'card' && it.cell[0] === drag.cell[0] && it.cell[1] === drag.cell[1]);
        drag.target = occ || null;
        if (occ) showTarget(drag.cell, false);
      }
    }
    const sc = document.getElementById('bScroll');
    const r = sc.getBoundingClientRect();
    if (e.clientX > r.right - 40) sc.scrollLeft += 18; else if (e.clientX < r.left + 40) sc.scrollLeft -= 18;
    if (e.clientY > r.bottom - 40) sc.scrollTop += 18; else if (e.clientY < r.top + 40) sc.scrollTop -= 18;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    box.classList.remove('dragging');
    if (!d.moved) return;
    justDragged = Date.now();
    if (d.kind === 'card') {
      if (!d.cell || (d.cell[0] === d.it.cell[0] && d.cell[1] === d.it.cell[1])) { renderBoard(true); return; }
      dropCard(d.it, d.cell);
    } else if (d.kind === 'band' || d.kind === 'resize') {
      const ch = d.changes || [];
      if (!ch.length || ch.every(([it, st, w]) => it.band[0] === st && it.band[1] === w)) { renderBoard(true); return; }
      const w = ch[0][2];
      setBands(ch, d.kind === 'band' ? 'Act moved. The cards below it now belong to it.' : `${d.it.sc.text || 'Act'} now covers ${w} column${w > 1 ? 's' : ''}.`);
    } else {
      if (!d.target) { renderBoard(true); return; }
      dropSeq(d.it, d.target);
    }
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) { drag = null; box.classList.remove('dragging'); renderBoard(true); } });
}

export function resetBoardDom() {
  const box = root();
  if (box) box.innerHTML = '';
}

// ------------------------------------------------------------------ side panel: act labels + colour key

function sideEl(id) { return document.getElementById(id); }
let newActColor = '#f9e48f';

const NUM = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT'];

/** Fit the new-label form to the chosen type: act, sequence or beat. */
function syncTypeFields(actCount) {
  const lvl = +sideEl('actType').value || 1;
  const name = sideEl('actName');
  name.placeholder = lvl === 1 ? `ACT ${NUM[actCount] || actCount + 1}` : lvl === 2 ? 'The heist' : 'Midpoint';
  sideEl('actNameLabel').textContent = lvl === 1 ? 'Act name' : lvl === 2 ? 'Sequence name' : 'Beat name';
  sideEl('actAdd').textContent = lvl === 1 ? 'Add act label' : lvl === 2 ? 'Add sequence label' : 'Add beat label';
  const wrap = sideEl('actAtWrap');
  wrap.hidden = lvl === 1;
  if (lvl > 1) {
    const sel = sideEl('actAt');
    const prev = sel.value;
    const scenes = S.derived.scenes.filter((sc) => sc.t === 'scene');
    const cur = S.derived.scenes[S.app.currentSceneIndex(S.curPara)];
    // options are scene positions (1st, 2nd…), which stay put when a label is inserted above a scene
    sel.innerHTML = scenes.map((sc, k) => `<option value="${k}">${k + 1}. ${esc((sc.text || 'Untitled scene').slice(0, 42))}</option>`).join('');
    if (prev !== '' && +prev < scenes.length) sel.value = prev;
    else if (cur && cur.t === 'scene') sel.value = String(scenes.indexOf(cur));
  }
}

function renderSide() {
  const els = S.editor.els();
  const scenes = S.derived.scenes;
  const acts = scenes.filter((sc) => sc.t === 'section' && sc.lvl === 1);
  const labels = scenes.filter((sc) => sc.t === 'section');
  const list = sideEl('actList');
  // only hold off while the writer is typing an act's name; buttons never block a redraw
  const typing = (box) => box.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (!typing(list)) {
    let n = 0;
    list.innerHTML = labels.length ? labels.map((a) => {
      const lvl = a.lvl || 1;
      const tag = lvl === 1 ? `ACT ${++n}` : lvl === 2 ? 'SEQ' : 'BEAT';
      const kind = lvl === 1 ? 'act' : lvl === 2 ? 'sequence' : 'beat';
      const col = (a.meta && a.meta.color) || (lvl === 1 ? DEFAULT_ACT : '');
      return `<li data-i="${a.i}" data-lvl="${lvl}" class="lvl${lvl}" style="--c:${esc(col || '#e7e9ed')}">
        <button type="button" class="dot" title="Change colour" aria-label="Change colour"></button><b>${tag}</b>
        <input type="text" value="${esc(a.text)}" aria-label="${kind} name" title="${(() => { const it = view && view.items.find((x) => x.sc === a); return it && it.band ? `Columns ${it.band[0] + 1}${it.band[1] > 1 ? '–' + (it.band[0] + it.band[1]) : ''}` : ''; })()}">
        <button type="button" class="del" title="Remove this ${kind} label (its scenes stay)" aria-label="Remove ${kind} ${esc(a.text)}">✕</button></li>`;
    }).join('')
      : '<li class="empty-hint">No labels yet. Choose a type below and add the first one; an act appears on the board as ACT 1.</li>';
  }
  const form = sideEl('actNew');
  if (!typing(form)) {
    syncTypeFields(acts.length);
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
      const name = textOf(el) || 'Act';
      S.editor.pushUndo();
      el.remove();
      // gone from the side panel and the grid at once; remaining acts renumber
      li.remove();
      list.querySelectorAll('li[data-lvl="1"] b').forEach((b, n) => { b.textContent = `ACT ${n + 1}`; });
      if (!list.querySelector('li')) list.innerHTML = '<li class="empty-hint">No labels yet. Choose a type below and add the first one; an act appears on the board as ACT 1.</li>';
      document.querySelectorAll('#bCanvas .b-seq[data-si]').forEach((m) => { if (S.derived.scenes[+m.dataset.si] && S.derived.scenes[+m.dataset.si].i === +li.dataset.i) m.remove(); });
      document.querySelectorAll(`#bCanvas .b-act[data-si]`).forEach((m) => { if (S.derived.scenes[+m.dataset.si] && S.derived.scenes[+m.dataset.si].i === +li.dataset.i) m.remove(); });
      document.querySelectorAll('#bCanvas .b-act b').forEach((b, n) => { b.textContent = `ACT ${n + 1}`; });
      S.editor.changed(true);
      S.app.refresh().then(() => renderBoard(true));
      S.app.toast(`${name} removed. Its scenes stay where they are.`);
      return;
    }
    if (e.target.closest('.dot')) {
      // cycle through the standard colours
      const cur = (el._meta && el._meta.color) || '';
      const k = COLORS.findIndex((x) => x.c === cur);
      const next = COLORS[(k + 1) % COLORS.length].c;
      el._meta = { ...(el._meta || {}), color: next };
      li.style.setProperty('--c', next);
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
  sideEl('actType').addEventListener('change', () => {
    syncTypeFields(S.derived.scenes.filter((sc) => sc.t === 'section' && sc.lvl === 1).length);
    sideEl('actName').focus();
  });
  sideEl('actNew').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = sideEl('actName');
    const name = input.value.trim() || input.placeholder;
    const lvl = +sideEl('actType').value || 1;
    if (lvl > 1) {
      // a sequence or beat starts at the chosen scene; it never moves a card
      const sc = S.derived.scenes.filter((x) => x.t === 'scene')[+sideEl('actAt').value];
      const target = sc ? S.editor.els()[sc.i] : null;
      if (!target) { S.app.toast('Add a scene first: sequences and beats start at a scene.'); return; }
      S.editor.pushUndo();
      const el = S.editor.makeEl({ t: 'section', lvl, runs: [{ x: name }], meta: newActColor ? { color: newActColor } : {} });
      target.before(el);
      S.editor.changed(true);
      input.value = '';
      S.app.toast(`${lvl === 2 ? 'Sequence' : 'Beat'} “${name}” added above ${textOf(target) || 'the scene'}.`);
      S.app.refresh().then(() => renderBoard(true));
      return;
    }
    const items = view ? view.items : [];
    const cards = items.filter((x) => x.kind === 'card');
    const acts = items.filter((x) => x.kind === 'act');
    S.editor.pushUndo();
    let el;
    if (!acts.length) {
      // the first act starts over every card already on the board, so nothing moves
      const width = Math.max(1, ...cards.map((c) => c.cell[0] + 1));
      el = S.editor.makeEl({ t: 'section', lvl: 1, runs: [{ x: name }], meta: { color: newActColor, band: [0, width] } });
      const first = items.length ? S.editor.els()[Math.min(...items.map((x) => x.sc.i))] : null;
      if (first) first.before(el); else S.editor.root.appendChild(el);
    } else {
      // later acts start in the first free column on the right; drag or stretch them over cards
      const start = Math.max(...acts.map((a) => a.band[0] + a.band[1]), ...cards.map((c) => c.cell[0] + 1));
      el = S.editor.makeEl({ t: 'section', lvl: 1, runs: [{ x: name }], meta: { color: newActColor, band: [start, 1] } });
      S.editor.root.appendChild(el);
    }
    S.editor.changed(true);
    input.value = '';
    S.app.toast(acts.length ? `${name} added on the right. Drag it over the scenes it covers.` : `${name} added over your scenes.`);
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
