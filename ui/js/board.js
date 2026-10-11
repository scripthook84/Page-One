// Story board — the "magic snap" grid.
//
// Every scene is a card in one grid. Cards always snap to a cell, by row and by column, and the
// grid's reading order *is* the story order: rows mode reads left→right then down, columns mode
// reads top→bottom then right. Drop a card on an empty cell and it lands there; drop it on an
// occupied cell and it slides in, nudging the following cards along to the next free cell.
// Empty cells you leave stay empty until you Tidy up.
//
// Acts (and sequences/beats) are markers that sit above the cell where they begin. Adding,
// removing, renaming or dragging one never moves a card — it only changes where the act starts.
//
// Positions are stored as a "slot" (cell number in reading order) on each scene and section.

import { S, eighths } from './state.js';
import { esc, textOf } from './editor.js';
import { COLORS, colorLabel } from './elements.js';
import * as dialogs from './dialogs.js';

const CW = 230, CH = 150, GX = 44, GY = 64, PAD = 40, TOP = 44;
const DEFAULT_ACT = '#d5d9df';

let zoom = 1;
let view = null;
let drag = null;
let justDragged = 0;

const root = () => document.getElementById('cards');
const st = () => S.project.settings;
const mode = () => (st().board_mode === 'columns' ? 'columns' : 'rows');
const span = () => Math.max(1, Math.min(12, +st().board_span || 5));

// ------------------------------------------------------------------ grid model

function cellOf(slot) {
  const n = span();
  return mode() === 'rows' ? { col: slot % n, row: Math.floor(slot / n) } : { col: Math.floor(slot / n), row: slot % n };
}
function slotOf(col, row) {
  const n = span();
  return mode() === 'rows' ? row * n + col : col * n + row;
}
function cellXY({ col, row }) {
  return { x: PAD + col * (CW + GX), y: PAD + TOP + row * (CH + GY) };
}
/** The cell under a point (canvas coordinates), clamped to the grid's fixed dimension. */
function cellAt(x, y) {
  let col = Math.round((x - PAD - CW / 2) / (CW + GX));
  let row = Math.round((y - PAD - TOP - CH / 2) / (CH + GY));
  col = Math.max(0, col);
  row = Math.max(0, row);
  if (mode() === 'rows') col = Math.min(span() - 1, col); else row = Math.min(span() - 1, row);
  return { col, row };
}

/** Longest increasing run of stored slots, so a scene moved in the script keeps its neighbours put. */
function lisKeep(cards) {
  const idx = cards.map((c, k) => (c.slot === null ? -1 : k)).filter((k) => k >= 0);
  const best = new Map(), prev = new Map();
  let top = -1;
  for (const k of idx) {
    best.set(k, 1); prev.set(k, -1);
    for (const j of idx) {
      if (j >= k) break;
      if (cards[j].slot < cards[k].slot && best.get(j) + 1 > best.get(k)) { best.set(k, best.get(j) + 1); prev.set(k, j); }
    }
    if (top < 0 || best.get(k) > best.get(top)) top = k;
  }
  const keep = new Set();
  for (let k = top; k >= 0; k = prev.get(k)) keep.add(k);
  return keep;
}

/** Items in script order with a valid slot each: cards strictly increasing, markers in between. */
function gridItems() {
  const items = S.derived.scenes.map((sc, ord) => ({
    si: ord, ord, sc,
    kind: sc.t === 'scene' ? 'card' : sc.lvl === 1 ? 'act' : 'seq',
    slot: sc.meta && Number.isInteger(sc.meta.slot) && sc.meta.slot >= 0 ? sc.meta.slot : null,
  }));
  const cards = items.filter((it) => it.kind === 'card');
  const keep = lisKeep(cards);
  let last = -1;
  cards.forEach((c, k) => {
    c.slot = keep.has(k) && c.slot > last ? c.slot : last + 1;
    last = c.slot;
  });
  // markers: after the previous card, no later than the next card
  let prevCard = -1;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.kind === 'card') { prevCard = it.slot; continue; }
    const next = items.slice(k + 1).find((x) => x.kind === 'card');
    const lo = prevCard + 1, hi = next ? next.slot : Infinity;
    let s = it.slot === null ? (next ? next.slot : prevCard + 1) : it.slot;
    it.slot = Math.min(Math.max(s, lo), hi === Infinity ? Math.max(s, lo) : hi);
  }
  // act membership and numbering
  let act = null, actNo = 0;
  for (const it of items) {
    if (it.kind === 'act') { actNo++; it.n = actNo; act = it; }
    if (it.kind === 'card') it.act = act;
  }
  return items;
}

/**
 * Make the script follow the grid: order items by slot (markers before the card in the same
 * cell), move whole scene blocks accordingly, and remember every slot. One undo step.
 */
function commitGrid(items, message) {
  const paras = S.editor.paras();
  const starts = items.map((it) => it.sc.i);
  const firstStart = Math.min(...starts);
  const byStart = [...items].sort((a, b) => a.sc.i - b.sc.i);
  const blocks = new Map();
  byStart.forEach((it, k) => {
    const end = k + 1 < byStart.length ? byStart[k + 1].sc.i : paras.length;
    const block = paras.slice(it.sc.i, end).map((p) => ({ ...p }));
    block[0].meta = { ...(block[0].meta || {}), slot: it.slot };
    delete block[0].meta.pos;
    blocks.set(it, block);
  });
  const order = [...items].sort((a, b) => a.slot - b.slot || (a.kind === 'card') - (b.kind === 'card') || a.ord - b.ord);
  const next = paras.slice(0, firstStart).concat(...order.map((it) => blocks.get(it)));
  S.editor.replaceAll(next);
  if (message) S.app.toast(message);
  S.app.refresh().then(() => renderBoard(true));
}

/** Drop a card into a cell: land in a free cell, or slide in and nudge the cards after it along. */
function dropCard(item, cell) {
  const items = view.items.map((x) => ({ ...x }));
  const me = items.find((x) => x.si === item.si);
  const target = slotOf(cell.col, cell.row);
  const cards = items.filter((x) => x.kind === 'card' && x !== me).sort((a, b) => a.slot - b.slot);
  for (const c of cards) c.old = c.slot;
  const markers = items.filter((x) => x.kind !== 'card');
  for (const m of markers) m.anchor = cards.find((c) => c.slot >= m.slot) || null;
  me.slot = target;
  let cur = target;
  for (const c of cards) {
    if (c.slot < target) continue;
    if (c.slot === cur) { c.slot = cur + 1; cur++; } else break;
  }
  // markers ride along with the card they head — except at the drop cell, where the new card joins that act
  for (const m of markers) if (m.anchor && m.slot !== target && m.slot === m.anchor.old && m.anchor.slot !== m.anchor.old) m.slot = m.anchor.slot;
  commitGrid(items, 'Scene moved in the script. Ctrl+Z puts it back.');
}

function dropMarker(item, cell) {
  const items = view.items.map((x) => ({ ...x }));
  items.find((x) => x.si === item.si).slot = slotOf(cell.col, cell.row);
  commitGrid(items, item.kind === 'act' ? 'Act now starts here. No scenes were moved.' : 'Moved.');
}

function tidy() {
  const items = view.items.map((x) => ({ ...x }));
  const cards = items.filter((x) => x.kind === 'card').sort((a, b) => a.slot - b.slot);
  const old = cards.map((c) => c.slot);
  cards.forEach((c, k) => { c.slot = k; });
  for (const it of items) {
    if (it.kind === 'card') continue;
    const k = old.findIndex((sl) => sl >= it.slot);
    it.slot = k < 0 ? cards.length : k;
  }
  commitGrid(items, 'Gaps closed.');
}

// ------------------------------------------------------------------ render

function toolbar() {
  return `<div class="board-tools">
    <div class="seg" role="group" aria-label="Reading order">
      <button data-mode="rows" title="Story reads left to right, then down">Rows</button>
      <button data-mode="columns" title="Story reads top to bottom, then right">Columns</button>
    </div>
    <span class="seg" title="How many cards fit in a row (or column)"><button id="bSpanLess" aria-label="Fewer per line">−</button><span class="zoomv" id="bSpan">5 per row</span><button id="bSpanMore" aria-label="More per line">+</button></span>
    <button class="btn" id="bTidy" title="Close the empty cells between cards">Tidy up</button>
    <button class="btn" id="bAct" title="Create an act label (left panel)">+ Act label</button>
    <span class="seg"><button id="bZo" aria-label="Zoom out">−</button><span class="zoomv" id="bZv">100%</span><button id="bZi" aria-label="Zoom in">+</button></span>
    <span class="hint">Cards snap to the grid. Drop on a card to slide in before it; acts mark where they start and never move cards.</span>
  </div>
  <div class="board-scroll" id="bScroll"><div class="board-sizer" id="bSizer"><div class="board-canvas" id="bCanvas"></div></div></div>`;
}

function linkPath(a, b) {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  const r = 10; // corner radius
  if (Math.abs(ay - by) < 2 && bx > ax) return `M${ax + CW},${ay + CH / 2} L${bx - 6},${by + CH / 2}`;
  if (Math.abs(ax - bx) < 2 && by > ay) return `M${ax + CW / 2},${ay + CH} L${bx + CW / 2},${by - 6}`;
  if (by > ay) {
    // next row: down into the gap, across, down into the card (elbows through the gutter)
    const x1 = ax + CW / 2, y1 = ay + CH, x2 = bx + CW / 2, y2 = by - 6;
    const my = ay + CH + GY / 2;
    const dir = x2 < x1 ? -1 : 1;
    return `M${x1},${y1} V${my - r} Q${x1},${my} ${x1 + dir * r},${my} H${x2 - dir * r} Q${x2},${my} ${x2},${my + r} V${y2}`;
  }
  // next column: out to the right gutter, up, into the card
  const x1 = ax + CW, y1 = ay + CH / 2, x2 = bx - 6, y2 = by + CH / 2;
  const mx = ax + CW + GX / 2;
  const dir = y2 < y1 ? -1 : 1;
  return `M${x1},${y1} H${mx - r} Q${mx},${y1} ${mx},${y1 + dir * r} V${y2 - dir * r} Q${mx},${y2} ${mx + r},${y2} H${x2}`;
}

export function renderBoard(force = false) {
  const box = root();
  if (!box || box.hidden || !S.project) return;
  if (!force && (drag || box.querySelector('.syn[contenteditable="true"]'))) return;
  if (!box.querySelector('.board-tools')) {
    box.innerHTML = toolbar();
    wire(box);
  }
  const items = gridItems();
  for (const it of items) Object.assign(it, cellXY(cellOf(it.slot)), cellOf(it.slot));
  view = { items };
  renderSide();

  const n = span(), m = mode();
  for (const b of box.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  box.querySelector('#bSpan').textContent = `${n} per ${m === 'rows' ? 'row' : 'column'}`;
  box.querySelector('#bZv').textContent = `${Math.round(zoom * 100)}%`;
  const cards = items.filter((it) => it.kind === 'card');
  const maxSlot = Math.max(0, ...items.map((it) => it.slot));
  box.querySelector('#bTidy').disabled = cards.every((c, k) => c.slot === k);

  // grid cells: everything used plus one spare row/column to drop into
  const lines = Math.ceil((maxSlot + 1) / n) + 1;
  const cols = m === 'rows' ? n : lines, rows = m === 'rows' ? lines : n;
  const occupied = new Set(cards.map((c) => c.slot));
  let cells = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const sl = slotOf(c, r);
    if (occupied.has(sl)) continue;
    const { x, y } = cellXY({ col: c, row: r });
    cells += `<div class="b-cell" data-slot="${sl}" style="left:${x}px;top:${y}px"></div>`;
  }

  const curSi = S.app.currentSceneIndex(S.curPara);
  const filter = S.colorFilter || '';
  let links = '';
  for (let k = 0; k + 1 < cards.length; k++) links += `<path d="${linkPath(cards[k], cards[k + 1])}" marker-end="url(#bArrow)"/>`;

  // markers grouped per cell, shown above it
  const marks = new Map();
  for (const it of items) if (it.kind !== 'card') { if (!marks.has(it.slot)) marks.set(it.slot, []); marks.get(it.slot).push(it); }
  let markHtml = '';
  for (const [slot, list] of marks) {
    const { x, y } = cellXY(cellOf(slot));
    markHtml += `<div class="b-marks" style="left:${x}px;top:${y - 40}px">${list.map((it) => {
      const meta = it.sc.meta || {};
      if (it.kind === 'act') {
        return `<div class="b-act" data-si="${it.si}" style="--c:${esc(meta.color || DEFAULT_ACT)}" title="Drag to change where this act starts; click to edit">
          <b>ACT ${it.n}</b><span>${esc(it.sc.text || 'Untitled act')}</span></div>`;
      }
      return `<div class="b-seq" data-si="${it.si}" title="${it.sc.lvl === 2 ? 'Sequence' : 'Beat'}: drag to move, click to edit">${esc(it.sc.text || 'Untitled')}</div>`;
    }).join('')}</div>`;
  }

  const cardHtml = cards.map((it) => {
    const meta = it.sc.meta || {};
    const c = meta.color || '';
    const label = c ? colorLabel(S.project, c) : 'No colour';
    const actColor = it.act ? (it.act.sc.meta && it.act.sc.meta.color) || DEFAULT_ACT : '';
    return `<div class="b-card${meta.omitted ? ' omit' : ''}${it.si === curSi ? ' cur' : ''}${filter && c !== filter ? ' dim' : ''}"
        data-si="${it.si}" style="left:${it.x}px;top:${it.y}px;${c ? `--c:${esc(c)};` : ''}${actColor ? `--act:${esc(actColor)}` : ''}">
      <header><span class="n">${esc(it.sc.number || '')}</span><span class="h">${esc(it.sc.text || 'Untitled scene')}</span></header>
      <button class="b-color" title="Colour: ${esc(label)}" aria-label="Colour: ${esc(label)}"></button>
      <div class="syn" spellcheck="true" data-ph="${esc((it.sc.first || 'Write a synopsis…').slice(0, 140))}">${esc(meta.synopsis || '')}</div>
      <footer><span>p. ${it.sc.page || ''}</span><span>${it.act ? `Act ${it.act.n} · ` : ''}${it.sc.eighths ? eighths(it.sc.eighths) + ' pg' : ''}</span></footer>
    </div>`;
  }).join('');

  const last = cellXY(m === 'rows' ? { col: n - 1, row: rows - 1 } : { col: cols - 1, row: n - 1 });
  const w = last.x + CW + PAD * 2, h = last.y + CH + PAD * 2;
  const canvas = box.querySelector('#bCanvas');
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.transform = `scale(${zoom})`;
  box.querySelector('#bSizer').style.width = `${w * zoom}px`;
  box.querySelector('#bSizer').style.height = `${h * zoom}px`;
  canvas.innerHTML = `${cells}<svg class="board-links" width="${w}" height="${h}" aria-hidden="true">
      <defs><marker id="bArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrow" d="M0,0 L10,5 L0,10 z"/></marker></defs>${links}</svg>${markHtml}${cardHtml}
    ${cards.length ? '' : '<p class="empty-hint" style="position:absolute;left:40px;top:130px">Scenes appear here as cards once the script has scene headings.</p>'}`;
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

function showTarget(cell, occupiedBy) {
  const canvas = document.getElementById('bCanvas');
  let el = canvas.querySelector('.b-target');
  if (!el) { el = document.createElement('div'); el.className = 'b-target'; canvas.appendChild(el); }
  const { x, y } = cellXY(cell);
  Object.assign(el.style, { left: `${x - 6}px`, top: `${y - 6}px` });
  el.classList.toggle('insert', !!occupiedBy);
  el.dataset.tip = occupiedBy ? 'Slide in here' : 'Drop here';
}

function wire(box) {
  box.addEventListener('click', (e) => {
    if (Date.now() - justDragged < 250) return;
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) { S.app.setSetting('board_mode', modeBtn.dataset.mode); return; }
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

  // dragging cards and act/sequence markers
  box.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.b-card, .b-act, .b-seq');
    if (!el || e.button !== 0 || e.target.closest('.b-color') || e.target.closest('.syn[contenteditable="true"]')) return;
    closePopover();
    const it = itemOf(el);
    const host = el.classList.contains('b-card') ? el : el.closest('.b-marks') && el;
    const r0 = host.getBoundingClientRect(), cr = document.getElementById('bCanvas').getBoundingClientRect();
    drag = { el: host, it, sx: e.clientX, sy: e.clientY, ox: (r0.left - cr.left) / zoom, oy: (r0.top - cr.top) / zoom, moved: false, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.sx) / zoom, dy = (e.clientY - drag.sy) / zoom;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.classList.add('lifted');
      if (drag.it.kind !== 'card') {
        // lift the marker out of its group so it can travel freely
        const canvas = document.getElementById('bCanvas');
        canvas.appendChild(drag.el);
        drag.el.style.position = 'absolute';
      }
      box.classList.add('dragging');
    }
    const x = Math.max(0, drag.ox + dx), y = Math.max(0, drag.oy + dy);
    drag.el.style.left = `${x}px`;
    drag.el.style.top = `${y}px`;
    const isCard = drag.it.kind === 'card';
    const cell = isCard ? cellAt(x + CW / 2, y + CH / 2) : cellAt(x + 40, y + 40 + 20);
    drag.cell = cell;
    const sl = slotOf(cell.col, cell.row);
    const occ = isCard && view.items.find((it) => it.kind === 'card' && it.slot === sl && it !== drag.it);
    showTarget(cell, occ);
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
    if (!d.cell) { renderBoard(true); return; }
    if (d.it.kind === 'card') {
      if (slotOf(d.cell.col, d.cell.row) === d.it.slot) { renderBoard(true); return; }
      dropCard(d.it, d.cell);
    } else {
      if (slotOf(d.cell.col, d.cell.row) === d.it.slot) { renderBoard(true); return; }
      dropMarker(d.it, d.cell);
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
        <input type="text" value="${esc(a.text)}" aria-label="Act ${n + 1} name">
        <button type="button" class="del" title="Remove this act label (its scenes stay)" aria-label="Remove act ${n + 1}">✕</button></li>`).join('')
      : '<li class="empty-hint">No acts yet. Add the first one below; it appears on the board as ACT 1.</li>';
  }
  const form = sideEl('actNew');
  if (!typing(form)) {
    const sel = sideEl('actBefore');
    // default: the current scene, unless an act already starts there — then the next scene that doesn't
    const sceneList = scenes.filter((sc) => sc.t === 'scene');
    const items = view ? view.items : [];
    const actSlots = new Set(items.filter((it) => it.kind === 'act').map((it) => it.slot));
    const startsAct = (sc) => { const it = items.find((x) => x.sc === sc); return it && actSlots.has(it.slot); };
    const curSc = scenes[S.app.currentSceneIndex(S.curPara)];
    let k = Math.max(0, sceneList.indexOf(curSc));
    while (k < sceneList.length && startsAct(sceneList[k])) k++;
    const cur = sceneList[k];
    sel.innerHTML = sceneList.map((sc) => `<option value="${sc.i}" ${cur && cur.i === sc.i ? 'selected' : ''}>${esc(sc.number || '')} ${esc((sc.text || 'Untitled scene').toUpperCase().slice(0, 40))}</option>`).join('') + `<option value="${els.length}" ${cur ? '' : 'selected'}>End of script</option>`;
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
