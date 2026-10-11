// Story board — a snap grid with act lanes.
//
// Every scene is a card in a grid cell. Act labels sit in a header row above the grid and span one
// or more columns; every card in an act's columns belongs to that act and takes its colour, so each
// act reads as a coloured lane running down the board. Drag a label to move it along the header, or
// its right edge to stretch it across more columns — it snaps column by column.
//
// Story order: acts left to right; inside each act the cards read in rows (left→right, then
// down). Drop a card on an empty cell and it lands there; drop it on
// a card and it slides in before it, nudging the following cards of that act along. The screenplay
// is reordered to match as soon as anything is dropped (one undo step).
//
// Stored per scene: meta.cell = [column, row]; per act: meta.band = [first column, width].

import { S, eighths } from './state.js';
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

/** Reading sequence of one group: cell ↔ position, in rows or columns order. */
function seqGeom(iv, cells) {
  const m = mode();
  const finite = Number.isFinite(iv.end);
  const width = finite ? iv.end - iv.start + 1 : 0;
  if (m === 'rows') {
    const W = finite ? width : Math.max(span(), ...cells.map((c) => c[0] - iv.start + 1));
    return {
      toIndex: (c) => c[1] * W + (c[0] - iv.start),
      toCell: (i) => [iv.start + (i % W), Math.floor(i / W)],
    };
  }
  const H = Math.max(span(), ...cells.map((c) => c[1] + 1));
  const cap = finite ? width * H : Infinity;
  return {
    toIndex: (c) => (c[1] < H ? (c[0] - iv.start) * H + c[1] : cap + (c[1] - H) * width + (c[0] - iv.start)),
    toCell: (i) => (i < cap ? [iv.start + Math.floor(i / H), i % H] : [iv.start + ((i - cap) % width), H + Math.floor((i - cap) / width)]),
  };
}

function readKey(c) { return mode() === 'rows' ? [c[1], c[0]] : [c[0], c[1]]; }
function cmpCells(a, b) { const x = readKey(a), y = readKey(b); return x[0] - y[0] || x[1] - y[1]; }

/** Longest increasing run of positions, so scenes moved in the script keep their neighbours put. */
function lisKeep(idx) {
  const n = idx.length, best = new Array(n).fill(0), prev = new Array(n).fill(-1);
  let top = -1;
  for (let k = 0; k < n; k++) {
    if (idx[k] === null) continue;
    best[k] = 1;
    for (let j = 0; j < k; j++) if (idx[j] !== null && idx[j] < idx[k] && best[j] + 1 > best[k]) { best[k] = best[j] + 1; prev[k] = j; }
    if (top < 0 || best[k] > best[top]) top = k;
  }
  const keep = new Set();
  for (let k = top; k >= 0; k = prev[k]) keep.add(k);
  return keep;
}

// ------------------------------------------------------------------ model: script → board

function legacyCell(slot) {
  const n = span();
  return mode() === 'rows' ? [slot % n, Math.floor(slot / n)] : [Math.floor(slot / n), slot % n];
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
  // bands: stored, or the next free columns; never overlapping, always in act order
  const preMax = Math.max(-1, ...groups[0].cards.filter((c) => c.cell).map((c) => c.cell[0]));
  let prevEnd = groups[0].cards.length ? Math.max(preMax, 0) : -1;
  const bands = [];
  // acts tile the columns: each runs up to the next act, so every card sits under its act's label
  let prevStart = groups[0].cards.length ? prevEnd : -1;
  groups.slice(1).forEach((g, k) => {
    const b = g.act.sc.meta && Array.isArray(g.act.sc.meta.band) ? g.act.sc.meta.band : null;
    let start = b ? b[0] | 0 : (k === 0 ? prevEnd + 1 : prevStart + 1);
    if (start <= prevStart) start = prevStart + 1;
    g.act.band = [start, b ? Math.max(1, b[1] | 0) : 1];
    bands.push(g.act.band);
    prevStart = start;
  });
  const ivs = intervals(bands);
  // cards: keep stored cells that sit in their act's lane in order; place the rest after their neighbours
  groups.forEach((g, gi) => {
    const iv = ivs[gi];
    const taken = new Set();
    const valid = (c) => c && c[0] >= iv.start && c[0] <= iv.end && !taken.has(c.join()) && (taken.add(c.join()), true);
    const ok = g.cards.map((c) => (valid(c.cell) ? c.cell : null));
    const geo = seqGeom(iv, ok.filter(Boolean));
    const idx = ok.map((c) => (c ? geo.toIndex(c) : null));
    const keep = lisKeep(idx);
    let last = -1;
    g.cards.forEach((c, k) => {
      const i = keep.has(k) && idx[k] > last ? idx[k] : last + 1;
      last = i;
      c.cell = geo.toCell(i);
      c.group = gi;
      c.act = g.act;
    });
  });
  // widths: up to the next act; the last act covers its stored width and all of its cards
  bands.forEach((b, k) => {
    if (k + 1 < bands.length) { b[1] = bands[k + 1][0] - b[0]; return; }
    const g = groups[k + 1];
    b[1] = Math.max(b[1], ...g.cards.map((c) => c.cell[0] - b[0] + 1), 1);
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

  const paras = S.editor.paras();
  const byStart = [...items].sort((a, b) => a.sc.i - b.sc.i);
  const blocks = new Map();
  byStart.forEach((it, k) => {
    const end = k + 1 < byStart.length ? byStart[k + 1].sc.i : paras.length;
    const block = paras.slice(it.sc.i, end).map((p) => ({ ...p }));
    const meta = { ...(block[0].meta || {}) };
    delete meta.slot; delete meta.pos;
    if (it.kind === 'card') meta.cell = [...it.cell];
    if (it.kind === 'act') meta.band = [...it.band];
    block[0].meta = meta;
    blocks.set(it, block);
  });
  const first = items.length ? Math.min(...items.map((it) => it.sc.i)) : paras.length;
  S.editor.replaceAll(paras.slice(0, first).concat(...order.map((it) => blocks.get(it))));
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

/** Drop a card: land in a free cell, or slide in and nudge that act's following cards along. */
function dropCard(item, cell) {
  const model = cloneModel();
  const me = model.items.find((x) => x.si === item.si);
  const ivs = intervals(model.bands);
  const g = groupOfCol(ivs, cell[0]);
  const others = model.items.filter((x) => x.kind === 'card' && x !== me && groupOfCol(ivs, x.cell[0]) === g);
  const occupied = others.find((x) => x.cell[0] === cell[0] && x.cell[1] === cell[1]);
  me.cell = [...cell];
  if (occupied) {
    const geo = seqGeom(ivs[g], [...others.map((x) => x.cell), cell]);
    const list = others.map((x) => ({ x, i: geo.toIndex(x.cell) })).sort((a, b) => a.i - b.i);
    let cur = geo.toIndex(cell);
    for (const o of list) {
      if (o.i < cur) continue;
      if (o.i === cur) { o.x.cell = geo.toCell(cur + 1); cur++; } else break;
    }
  }
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

function tidy() {
  const model = cloneModel();
  const ivs = intervals(model.bands);
  ivs.forEach((iv, g) => {
    const list = model.items.filter((x) => x.kind === 'card' && groupOfCol(ivs, x.cell[0]) === g).sort((a, b) => cmpCells(a.cell, b.cell));
    const geo = seqGeom(iv, []);
    list.forEach((c, k) => { c.cell = geo.toCell(k); });
  });
  commit(model, 'Gaps closed.');
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
    <button class="btn" id="bTidy" title="Close the empty cells inside each act">Tidy up</button>
    <button class="btn" id="bAct" title="Create an act label (left panel)">+ Act label</button>
    <span class="seg"><button id="bZo" aria-label="Zoom out">−</button><span class="zoomv" id="bZv">100%</span><button id="bZi" aria-label="Zoom in">+</button></span>
    <span class="hint">Drag an act label along the top, or its right edge to cover more columns. Cards take the colour of the act above them.</span>
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
  box.querySelector('#bTidy').disabled = !cards.length;

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
  const stack = new Map();
  let seqHtml = '';
  for (const q of model.items.filter((it) => it.kind === 'seq')) {
    const at = q.anchor ? q.anchor.cell : null;
    if (!at) continue;
    const k = stack.get(at.join()) || 0;
    stack.set(at.join(), k + 1);
    seqHtml += `<div class="b-seq" data-si="${q.si}" style="left:${colX(at[0]) + k * 8}px;top:${rowY(at[1]) - 30 - k * 4}px" title="${q.sc.lvl === 2 ? 'Sequence' : 'Beat'}: drag onto another scene to move it; click to edit">${esc(q.sc.text || 'Untitled')}</div>`;
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
    if (e.target.id === 'bTidy') { tidy(); return; }
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

function renderSide() {
  const els = S.editor.els();
  const scenes = S.derived.scenes;
  const acts = scenes.filter((sc) => sc.t === 'section' && sc.lvl === 1);
  const list = sideEl('actList');
  // only hold off while the writer is typing an act's name; buttons never block a redraw
  const typing = (box) => box.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (!typing(list)) {
    list.innerHTML = acts.length ? acts.map((a, n) => `<li data-i="${a.i}" style="--c:${esc((a.meta && a.meta.color) || DEFAULT_ACT)}">
        <button type="button" class="dot" title="Change colour" aria-label="Change colour"></button><b>ACT ${n + 1}</b>
        <input type="text" value="${esc(a.text)}" aria-label="Act ${n + 1} name" title="${(() => { const it = view && view.items.find((x) => x.sc === a); return it && it.band ? `Columns ${it.band[0] + 1}${it.band[1] > 1 ? '–' + (it.band[0] + it.band[1]) : ''}` : ''; })()}">
        <button type="button" class="del" title="Remove this act label (its scenes stay)" aria-label="Remove act ${n + 1}">✕</button></li>`).join('')
      : '<li class="empty-hint">No acts yet. Add the first one below; it appears on the board as ACT 1.</li>';
  }
  const form = sideEl('actNew');
  if (!typing(form)) {
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
      const name = textOf(el) || 'Act';
      S.editor.pushUndo();
      el.remove();
      // gone from the side panel and the grid at once; remaining acts renumber
      li.remove();
      list.querySelectorAll('li[data-i] b').forEach((b, n) => { b.textContent = `ACT ${n + 1}`; });
      if (!list.querySelector('li')) list.innerHTML = '<li class="empty-hint">No acts yet. Add the first one below; it appears on the board as ACT 1.</li>';
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
  sideEl('actNew').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = sideEl('actName');
    const name = input.value.trim() || input.placeholder;
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
