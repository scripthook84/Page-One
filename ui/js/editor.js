// The screenplay editor: one contenteditable column of typed paragraphs.
// The DOM is the live source of truth while typing; every structural edit
// (Enter, Tab, merges, multi-paragraph deletes, paste, formatting) is done
// here explicitly so paragraph types never get mangled by the browser.

import { ELEMS, INTROS, TIMES, EXTENSIONS, TRANSITIONS, ORDER, BOLD, ITALIC, UNDERLINE, cueName, sceneParts } from './elements.js';

// ------------------------------------------------------------------ runs helpers

export function runsText(runs) { return runs.map((r) => r.x).join(''); }

function toChars(runs) {
  const out = [];
  for (const r of runs) for (const c of r.x) out.push([c, r.s || 0]);
  return out;
}
function fromChars(chars) {
  const out = [];
  for (const [c, s] of chars) {
    const last = out[out.length - 1];
    if (last && last.s === s) last.x += c; else out.push({ x: c, s });
  }
  return out.length ? out : [{ x: '', s: 0 }];
}
export function sliceRuns(runs, a, b = Infinity) { return fromChars(toChars(runs).slice(a, b)); }
export function concatRuns(a, b) { return fromChars(toChars(a).concat(toChars(b))); }
function cleanRuns(runs) {
  const r = fromChars(toChars(runs));
  return r.map((x) => (x.s ? { x: x.x, s: x.s } : { x: x.x }));
}

// ------------------------------------------------------------------ DOM <-> runs

function styleOf(node, stop) {
  let s = 0;
  for (let n = node.parentNode; n && n !== stop; n = n.parentNode) {
    const tag = n.nodeName;
    if (tag === 'B' || tag === 'STRONG') s |= BOLD;
    else if (tag === 'I' || tag === 'EM') s |= ITALIC;
    else if (tag === 'U') s |= UNDERLINE;
    if (n.classList) {
      if (n.classList.contains('sb')) s |= BOLD;
      if (n.classList.contains('si')) s |= ITALIC;
      if (n.classList.contains('su')) s |= UNDERLINE;
    }
    const st = n.style;
    if (st) {
      if (st.fontWeight === 'bold' || +st.fontWeight >= 600) s |= BOLD;
      if (st.fontStyle === 'italic') s |= ITALIC;
      if ((st.textDecoration || '').includes('underline')) s |= UNDERLINE;
    }
  }
  return s;
}

export function runsOf(el) {
  const out = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const x = n.nodeValue.replace(/ /g, ' ').replace(/​/g, '');
    if (!x) continue;
    const s = styleOf(n, el);
    const last = out[out.length - 1];
    if (last && last.s === s) last.x += x; else out.push({ x, s });
  }
  return out.length ? out : [{ x: '', s: 0 }];
}

export function textOf(el) { return el.textContent.replace(/​/g, ''); }

function renderRuns(el, runs) {
  el.textContent = '';
  let any = false;
  for (const r of runs) {
    if (!r.x) continue;
    any = true;
    if (!r.s) { el.appendChild(document.createTextNode(r.x)); continue; }
    const span = document.createElement('span');
    if (r.s & BOLD) span.classList.add('sb');
    if (r.s & ITALIC) span.classList.add('si');
    if (r.s & UNDERLINE) span.classList.add('su');
    span.textContent = r.x;
    el.appendChild(span);
  }
  if (!any) el.appendChild(document.createElement('br'));
}

// ------------------------------------------------------------------ editor

export class Editor {
  constructor(root, popup, hooks) {
    this.root = root;
    this.popup = popup;
    this.hooks = hooks;
    this.undoStack = [];
    this.redoStack = [];
    this.typing = false;
    this.typingTimer = null;
    this.pendingStyle = null;
    this.revLevel = 0;
    this.current = null;
    this.smart = null; // {items, index, pick}
    this.typewriter = false;

    root.contentEditable = 'true';
    root.spellcheck = true;
    root.addEventListener('keydown', (e) => this.onKeyDown(e));
    root.addEventListener('beforeinput', (e) => this.onBeforeInput(e));
    root.addEventListener('input', () => this.onInput());
    root.addEventListener('paste', (e) => this.onPaste(e));
    root.addEventListener('copy', (e) => this.onCopy(e, false));
    root.addEventListener('cut', (e) => this.onCopy(e, true));
    root.addEventListener('dragstart', (e) => e.preventDefault());
    root.addEventListener('drop', (e) => e.preventDefault());
    root.addEventListener('mousedown', () => { this.closeTyping(); this.hideSmart(); });
    root.addEventListener('blur', () => setTimeout(() => { if (!this.popup.contains(document.activeElement)) this.hideSmart(); }, 150));
    document.addEventListener('selectionchange', () => this.onSelectionChange());
    popup.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const li = e.target.closest('[data-i]');
      if (li && this.smart) { this.smart.index = +li.dataset.i; this.acceptSmart(); }
    });
  }

  // ---------------------------------------------------------------- load / save

  load(paras) {
    const frag = document.createDocumentFragment();
    for (const p of paras && paras.length ? paras : [{ t: 'scene', runs: [{ x: '' }] }]) frag.appendChild(this.makeEl(p));
    this.root.textContent = '';
    this.root.appendChild(frag);
    this.scheduleDual();
    this.undoStack = [];
    this.redoStack = [];
    this.current = null;
  }

  makeEl(p) {
    const el = document.createElement('div');
    el.className = 'p';
    el.dataset.t = ELEMS[p.t] ? p.t : 'action';
    if (p.dual) el.dataset.dual = '1';
    if (p.rev) el.dataset.rev = p.rev;
    if (p.lvl) el.dataset.lvl = p.lvl;
    if (p.meta) el._meta = { ...p.meta };
    renderRuns(el, p.runs || [{ x: '' }]);
    this.decorate(el);
    return el;
  }

  /** Visual extras that depend on paragraph data. */
  decorate(el) {
    const m = el._meta;
    if (m && m.color) el.style.setProperty('--scene-color', m.color); else el.style.removeProperty('--scene-color');
    el.classList.toggle('omitted', !!(m && m.omitted));
    el.classList.toggle('empty', textOf(el) === '');
  }

  paraData(el) {
    const p = { t: el.dataset.t, runs: cleanRuns(runsOf(el)) };
    if (el.dataset.dual === '1') p.dual = true;
    if (+el.dataset.rev) p.rev = +el.dataset.rev;
    if (+el.dataset.lvl) p.lvl = +el.dataset.lvl;
    if (el._meta) {
      const m = {};
      for (const [k, v] of Object.entries(el._meta)) if (v || v === 0) m[k] = v;
      if (Object.keys(m).length) p.meta = m;
    }
    return p;
  }

  paras() { return Array.from(this.root.children, (el) => this.paraData(el)); }
  els() { return this.root.children; }
  indexOf(el) { return Array.prototype.indexOf.call(this.root.children, el); }

  // ---------------------------------------------------------------- selection

  paraOf(node) {
    while (node && node.parentNode !== this.root) {
      if (node === this.root || !node.parentNode) return null;
      node = node.parentNode;
    }
    return node;
  }

  offsetIn(el, node, offset) {
    const r = document.createRange();
    r.setStart(el, 0);
    try { r.setEnd(node, offset); } catch { return 0; }
    return r.toString().replace(/​/g, '').length;
  }

  posAt(el, off) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, last = null;
    while ((n = walk.nextNode())) {
      const len = n.nodeValue.length;
      if (off <= len) return { node: n, offset: off };
      off -= len;
      last = n;
    }
    if (last) return { node: last, offset: last.nodeValue.length };
    return { node: el, offset: 0 };
  }

  getSel() {
    const s = window.getSelection();
    if (!s.rangeCount) return null;
    const aEl = this.paraOf(s.anchorNode), fEl = this.paraOf(s.focusNode);
    if (!aEl || !fEl) {
      // selection on the root itself (e.g. after select all)
      if (s.anchorNode === this.root || s.focusNode === this.root) {
        const r = s.getRangeAt(0);
        const sEl = this.paraOf(r.startContainer) || this.root.children[Math.min(r.startOffset, this.root.children.length - 1)];
        const eEl = this.paraOf(r.endContainer) || this.root.children[Math.max(0, Math.min(r.endOffset, this.root.children.length) - 1)];
        if (!sEl || !eEl) return null;
        const so = this.paraOf(r.startContainer) ? this.offsetIn(sEl, r.startContainer, r.startOffset) : 0;
        const eo = this.paraOf(r.endContainer) ? this.offsetIn(eEl, r.endContainer, r.endOffset) : textOf(eEl).length;
        const sp = this.indexOf(sEl), ep = this.indexOf(eEl);
        return { sp, so, ep, eo, collapsed: sp === ep && so === eo, el: sEl };
      }
      return null;
    }
    let ap = this.indexOf(aEl), ao = this.offsetIn(aEl, s.anchorNode, s.anchorOffset);
    let fp = this.indexOf(fEl), fo = this.offsetIn(fEl, s.focusNode, s.focusOffset);
    const forward = ap < fp || (ap === fp && ao <= fo);
    const [sp, so, ep, eo] = forward ? [ap, ao, fp, fo] : [fp, fo, ap, ao];
    return { sp, so, ep, eo, collapsed: sp === ep && so === eo, el: this.root.children[sp] };
  }

  setSel(sp, so, ep = sp, eo = so, scroll = true) {
    const els = this.root.children;
    // the caret never rests on a hidden act/sequence line: use the nearest visible one
    const visible = (i, o) => {
      if (!els[i] || els[i].dataset.t !== 'section') return [i, o];
      for (let j = i + 1; j < els.length; j++) if (els[j].dataset.t !== 'section') return [j, 0];
      for (let j = i - 1; j >= 0; j--) if (els[j].dataset.t !== 'section') return [j, textOf(els[j]).length];
      return [i, o];
    };
    [sp, so] = visible(sp, so);
    [ep, eo] = visible(ep, eo);
    if (ep < sp || (ep === sp && eo < so)) { ep = sp; eo = so; }
    const a = els[sp], b = els[ep];
    if (!a || !b) return;
    const A = this.posAt(a, so), B = this.posAt(b, eo);
    const s = window.getSelection();
    const r = document.createRange();
    r.setStart(A.node, A.offset);
    r.setEnd(B.node, B.offset);
    s.removeAllRanges();
    s.addRange(r);
    if (scroll) this.scrollToCaret();
  }

  caret() {
    const s = this.getSel();
    if (!s) return null;
    return { el: this.root.children[s.sp], pi: s.sp, off: s.so, sel: s };
  }

  scrollToCaret() {
    const s = window.getSelection();
    if (!s.rangeCount) return;
    let rect = s.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.height && !rect.top)) {
      const el = this.paraOf(s.focusNode);
      if (!el) return;
      rect = el.getBoundingClientRect();
    }
    const desk = this.root.closest('.desk');
    const dr = desk.getBoundingClientRect();
    if (this.typewriter) {
      desk.scrollTop += rect.top - (dr.top + dr.height * 0.42);
      return;
    }
    if (rect.top < dr.top + 40) desk.scrollTop += rect.top - dr.top - 80;
    else if (rect.bottom > dr.bottom - 40) desk.scrollTop += rect.bottom - dr.bottom + 120;
  }

  // ---------------------------------------------------------------- undo

  snapshot() {
    const s = this.getSel();
    return { paras: this.paras(), sel: s ? [s.sp, s.so, s.ep, s.eo] : [0, 0, 0, 0] };
  }

  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 400) this.undoStack.shift();
    this.redoStack = [];
  }

  openTyping() {
    if (!this.typing) { this.pushUndo(); this.typing = true; }
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => (this.typing = false), 900);
  }
  closeTyping() { this.typing = false; clearTimeout(this.typingTimer); }

  restore(snap) {
    this.load(snap.paras);
    const [a, b, c, d] = snap.sel;
    this.root.focus();
    this.setSel(Math.min(a, this.root.children.length - 1), b, Math.min(c, this.root.children.length - 1), d);
    this.changed(true);
  }

  undo() {
    this.closeTyping();
    const u = this.undoStack.pop();
    if (!u) return;
    const keepUndo = this.undoStack, keepRedo = this.redoStack;
    keepRedo.push(this.snapshot());
    this.restore(u);
    this.undoStack = keepUndo;
    this.redoStack = keepRedo;
  }

  redo() {
    this.closeTyping();
    const r = this.redoStack.pop();
    if (!r) return;
    const keepUndo = this.undoStack, keepRedo = this.redoStack;
    keepUndo.push(this.snapshot());
    this.restore(r);
    this.undoStack = keepUndo;
    this.redoStack = keepRedo;
  }

  // ---------------------------------------------------------------- change notifications

  changed(structural = false, el = null) {
    if (el && this.revLevel > 0) el.dataset.rev = this.revLevel;
    if (el) this.decorate(el);
    this.scheduleDual();
    this.hooks.onChange(structural);
  }

  // ---------------------------------------------------------------- dual dialogue, live
  // Both speeches stay ordinary paragraphs (so typing, undo and the caret behave normally);
  // they are narrowed to the two print columns and the second speech is lifted beside the first.

  scheduleDual() {
    if (this.dualFrame) return;
    if (!this.root.querySelector('[data-dual="1"], .dl, .dr')) return;
    this.dualFrame = requestAnimationFrame(() => { this.dualFrame = null; this.layoutDual(); });
  }

  layoutDual() {
    for (const el of this.root.querySelectorAll('.dl, .dr')) {
      el.classList.remove('dl', 'dr');
      el.style.removeProperty('margin-top');
      el.style.removeProperty('padding-bottom');
    }
    const els = this.root.children;
    const speech = (el) => el && (el.dataset.t === 'dialogue' || el.dataset.t === 'paren' || el.dataset.t === 'lyric');
    const pairs = [];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.dataset.t !== 'character' || el.dataset.dual !== '1') continue;
      let j = i - 1;
      while (j >= 0 && speech(els[j])) j--;
      if (j < 0 || j === i - 1 || els[j].dataset.t !== 'character') continue;
      let k = i + 1;
      while (k < els.length && speech(els[k])) k++;
      const L = [], R = [];
      for (let n = j; n < i; n++) L.push(els[n]);
      for (let n = i; n < k; n++) R.push(els[n]);
      pairs.push([L, R]);
    }
    for (const [L, R] of pairs) { L.forEach((e) => e.classList.add('dl')); R.forEach((e) => e.classList.add('dr')); }
    for (const [L, R] of pairs) {
      const top = L[0].offsetTop;
      const last = L[L.length - 1];
      const lb = last.offsetTop + last.offsetHeight;
      const r0 = R[0];
      const cur = parseFloat(getComputedStyle(r0).marginTop) || 0;
      r0.style.setProperty('margin-top', `${cur - (r0.offsetTop - top)}px`, 'important');
      const rl = R[R.length - 1];
      const rb = rl.offsetTop + rl.offsetHeight;
      if (lb > rb) rl.style.setProperty('padding-bottom', `${lb - rb}px`);
    }
  }

  setRuns(el, runs) {
    renderRuns(el, runs);
    this.decorate(el);
  }

  setType(el, t, opts = {}) {
    if (!ELEMS[t]) return;
    const prev = el.dataset.t;
    if (prev === t && !opts.force) return;
    el.dataset.t = t;
    const txt = textOf(el);
    if (t === 'paren' && (txt.trim() === '' )) {
      this.setRuns(el, [{ x: '()', s: 0 }]);
      if (opts.caret !== false) this.setSel(this.indexOf(el), 1);
    } else if (prev === 'paren' && txt.trim() === '()') {
      this.setRuns(el, [{ x: '', s: 0 }]);
      if (opts.caret !== false) this.setSel(this.indexOf(el), 0);
    }
    if (t === 'section' && !+el.dataset.lvl) el.dataset.lvl = opts.lvl || 1;
    if (opts.lvl) el.dataset.lvl = opts.lvl;
    if (t !== 'section') delete el.dataset.lvl;
    if (t !== 'character') delete el.dataset.dual;
    this.changed(true, el);
    this.hooks.onElement && this.hooks.onElement(t);
  }

  /** Change the element of the current paragraph(s) — Ctrl+number, toolbar. */
  changeElement(t, lvl) {
    if (t === 'section') { this.hooks.addSection && this.hooks.addSection(lvl || 1); return; }
    const s = this.getSel();
    if (!s) return;
    this.closeTyping();
    this.pushUndo();
    for (let i = s.sp; i <= s.ep; i++) this.setType(this.root.children[i], t, { lvl, caret: s.sp === s.ep, force: !!lvl });
    this.updateSmart();
  }

  // ---------------------------------------------------------------- events

  onSelectionChange() {
    if (!this.root.contains(document.activeElement) && document.activeElement !== this.root) return;
    const s = this.getSel();
    if (!s) return;
    const el = this.root.children[s.ep];
    // a pending Ctrl+B/I/U lasts until the caret really moves away from where it was set
    // (selectionchange can arrive late, after the writer already pressed the shortcut)
    if (this.pendingStyle !== null && this.pendingAt && (this.pendingAt.el !== el || this.pendingAt.off !== s.eo || !s.collapsed)) {
      this.pendingStyle = null;
      this.pendingAt = null;
      this.hooks.onStyle && this.hooks.onStyle(0);
    }
    if (el !== this.current) {
      if (this.current) this.current.classList.remove('cur');
      this.current = el;
      el && el.classList.add('cur');
      this.hooks.onCaret && this.hooks.onCaret(el, s.ep);
    }
    if (this.typewriter) this.scrollToCaret();
  }

  onKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (this.smart) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveSmart(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      const blank = this.current && textOf(this.current).trim() === '';
      if (e.key === 'Tab' && blank && !this.smart.picker) {
        // Tab on a blank line keeps its element-cycling meaning even while suggestions show
        this.hideSmart();
      } else if ((e.key === 'Enter' || e.key === 'Tab') && !mod && !e.shiftKey) {
        e.preventDefault();
        this.acceptSmart(e.key);
        return;
      }
      if (this.smart && e.key === "Escape") { e.preventDefault(); this.hideSmart(); return; }
      if (this.smart && this.smart.picker && e.key.length === 1 && !mod) {
        // element picker: first letter jumps
        const k = e.key.toLowerCase();
        const i = this.smart.items.findIndex((x) => x.label.toLowerCase().startsWith(k));
        if (i >= 0) { e.preventDefault(); this.smart.index = i; this.acceptSmart(); }
        return;
      }
    }

    if (mod && !e.altKey) {
      const digit = e.code && e.code.startsWith('Digit') ? e.code.slice(5) : null;
      if (digit !== null) {
        e.preventDefault();
        if (e.shiftKey) {
          if (digit === '1' || digit === '2' || digit === '3') this.hooks.addSection && this.hooks.addSection(+digit);
          else if (digit === '4') this.changeElement('note');
          return;
        }
        const t = Object.keys(ELEMS).find((k) => ELEMS[k].key === digit);
        if (t) this.changeElement(t);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
      if (k === 'y') { e.preventDefault(); this.redo(); return; }
      if (k === 'b' && !e.shiftKey) { e.preventDefault(); this.toggleStyle(BOLD); return; }
      if (k === 'i' && !e.shiftKey) { e.preventDefault(); this.toggleStyle(ITALIC); return; }
      if (k === 'u' && !e.shiftKey) { e.preventDefault(); this.toggleStyle(UNDERLINE); return; }
      if (k === 'a' && e.shiftKey) { e.preventDefault(); this.selectScene(); return; }
    }

    if (e.key === 'Enter' && !mod && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) this.insertText('\n');
      else this.enter();
      return;
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      e.preventDefault();
      this.tab(e.shiftKey);
      return;
    }
    if (e.key === 'Backspace' && !mod) {
      const c = this.caret();
      if (!c) return;
      if (!c.sel.collapsed) { if (c.sel.sp !== c.sel.ep) { e.preventDefault(); this.pushUndo(); this.deleteSelection(); this.changed(true); } return; }
      const txt = textOf(c.el);
      if (c.el.dataset.t === 'paren' && txt === '()' && c.off <= 1) { e.preventDefault(); this.pushUndo(); this.removePara(c.el, -1); return; }
      if (c.off === 0) { e.preventDefault(); this.mergeBackward(c.el); }
      return;
    }
    if (e.key === 'Delete' && !mod) {
      const c = this.caret();
      if (!c) return;
      if (!c.sel.collapsed) { if (c.sel.sp !== c.sel.ep) { e.preventDefault(); this.pushUndo(); this.deleteSelection(); this.changed(true); } return; }
      if (c.off >= textOf(c.el).length) { e.preventDefault(); this.mergeForward(c.el); }
      return;
    }
    if (e.key === 'Escape') this.hideSmart();
    if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.startsWith('Page')) this.closeTyping();
  }

  onBeforeInput(e) {
    const t = e.inputType;
    if (t === 'historyUndo') { e.preventDefault(); this.undo(); return; }
    if (t === 'historyRedo') { e.preventDefault(); this.redo(); return; }
    if (t === 'insertParagraph') { e.preventDefault(); this.enter(); return; }
    if (t === 'insertLineBreak') { e.preventDefault(); this.insertText('\n'); return; }
    if (t === 'formatBold') { e.preventDefault(); this.toggleStyle(BOLD); return; }
    if (t === 'formatItalic') { e.preventDefault(); this.toggleStyle(ITALIC); return; }
    if (t === 'formatUnderline') { e.preventDefault(); this.toggleStyle(UNDERLINE); return; }
    if (t.startsWith('format')) { e.preventDefault(); return; }
    const s = this.getSel();
    if (!s) return;
    if (s.sp !== s.ep) {
      e.preventDefault();
      this.closeTyping();
      this.pushUndo();
      this.deleteSelection();
      if (t === 'insertText' || t === 'insertReplacementText') {
        const data = e.data ?? (e.dataTransfer && e.dataTransfer.getData('text/plain')) ?? '';
        if (data) this.insertText(data, false);
      }
      this.changed(true);
      return;
    }
    if (t === 'insertText' && this.pendingStyle !== null && e.data) {
      e.preventDefault();
      this.openTyping();
      this.insertText(e.data, false, this.pendingStyle);
      const c = this.caret();
      if (c) this.pendingAt = { el: c.el, off: c.off };
      return;
    }
    if (t === 'insertText' && e.data && /[\s.,!?]/.test(e.data)) { this.openTyping(); }
    else this.openTyping();
  }

  onInput() {
    this.normalize();
    const c = this.caret();
    if (!c) { this.changed(); return; }
    const el = c.el;
    const t = el.dataset.t;
    const txt = textOf(el);
    // Typing "int." / "ext." in an action line turns it into a scene heading.
    if (t === 'action' && /^(int|ext|est|i\/e|int\.?\/ext|ext\.?\/int)[.]\s?$/i.test(txt) && c.off === txt.length) {
      el.dataset.t = 'scene';
      this.hooks.onElement && this.hooks.onElement('scene');
    }
    // "(" at the start of an empty dialogue line starts a parenthetical.
    if (t === 'dialogue' && txt === '(') {
      el.dataset.t = 'paren';
      this.setRuns(el, [{ x: '()', s: 0 }]);
      this.setSel(c.pi, 1);
      this.hooks.onElement && this.hooks.onElement('paren');
    }
    this.changed(false, el);
    this.updateSmart();
  }

  /** Repair any structure the browser created behind our back. */
  normalize() {
    const root = this.root;
    let bad = false;
    for (const n of Array.from(root.childNodes)) {
      if (n.nodeType === 3) {
        if (!n.nodeValue.trim()) { n.remove(); continue; }
        const el = this.makeEl({ t: 'action', runs: [{ x: n.nodeValue }] });
        root.replaceChild(el, n);
        bad = true;
      } else if (n.nodeType === 1 && !(n.nodeName === 'DIV' && n.classList.contains('p'))) {
        const el = this.makeEl({ t: 'action', runs: runsOf(n) });
        root.replaceChild(el, n);
        bad = true;
      } else if (n.nodeType === 1) {
        // nested block elements inside a paragraph → flatten
        if (n.querySelector('div,p')) {
          const sel = this.getSel();
          this.setRuns(n, runsOf(n));
          bad = true;
          if (sel) this.setSel(sel.sp, sel.so);
        }
        if (!n.firstChild) n.appendChild(document.createElement('br'));
      }
    }
    if (!root.firstChild) root.appendChild(this.makeEl({ t: 'scene', runs: [{ x: '' }] }));
    return bad;
  }

  // ---------------------------------------------------------------- structural edits

  insertText(text, undo = true, style = null) {
    const c = this.caret();
    if (!c) return;
    if (undo) { this.closeTyping(); this.pushUndo(); }
    if (!c.sel.collapsed) this.deleteSelection();
    const cc = this.caret();
    const runs = runsOf(cc.el);
    const chars = toChars(runs);
    const st = style !== null ? style : (chars[cc.off - 1] ? chars[cc.off - 1][1] : 0);
    const ins = Array.from(text, (ch) => [ch, st]);
    chars.splice(cc.off, 0, ...ins);
    this.setRuns(cc.el, fromChars(chars));
    this.setSel(cc.pi, cc.off + ins.length);
    this.changed(false, cc.el);
    this.updateSmart();
  }

  deleteSelection() {
    const s = this.getSel();
    if (!s || s.collapsed) return;
    const els = this.root.children;
    // never let an edit land inside a hidden act/sequence line (e.g. after Select All)
    while (s.sp < s.ep && els[s.sp].dataset.t === 'section') { s.sp++; s.so = 0; }
    while (s.ep > s.sp && els[s.ep].dataset.t === 'section') { s.ep--; s.eo = textOf(els[s.ep]).length; }
    if (els[s.sp].dataset.t === 'section') return;
    const a = els[s.sp], b = els[s.ep];
    const left = sliceRuns(runsOf(a), 0, s.so);
    const right = sliceRuns(runsOf(b), s.eo);
    // whole first paragraph selected from its start → take the last paragraph's type
    if (s.so === 0 && s.sp !== s.ep && textOf(b).length > s.eo) a.dataset.t = b.dataset.t;
    // acts and sequences live in the navigator, so a page edit never deletes them
    for (let i = s.ep; i > s.sp; i--) { if (els[i].dataset.t !== 'section') els[i].remove(); }
    this.setRuns(a, concatRuns(left, right));
    this.setSel(s.sp, s.so);
    this.decorate(a);
  }

  removePara(el, dir) {
    const vis = Array.from(this.root.children).filter((x) => x.dataset.t !== 'section');
    if (vis.length === 1) { el.dataset.t = 'action'; this.setRuns(el, [{ x: '' }]); this.setSel(this.indexOf(el), 0); this.changed(true); return; }
    const prev = this.visibleSibling(el, -1), next = this.visibleSibling(el, 1);
    const target = dir < 0 ? prev || next : next || prev;
    el.remove();
    this.setSel(this.indexOf(target), target === prev ? textOf(target).length : 0);
    this.changed(true);
  }

  /** Nearest paragraph that is actually on the page (acts/sequences are navigator-only). */
  visibleSibling(el, dir) {
    let n = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    while (n && n.dataset.t === 'section') n = dir < 0 ? n.previousElementSibling : n.nextElementSibling;
    return n;
  }

  mergeBackward(el) {
    const prev = this.visibleSibling(el, -1);
    if (!prev) return;
    this.closeTyping();
    this.pushUndo();
    const txt = textOf(el);
    const pt = textOf(prev);
    if (txt === '') {
      el.remove();
      this.setSel(this.indexOf(prev), pt.length);
      this.changed(true);
      return;
    }
    if (pt === '' || (prev.dataset.t === 'paren' && pt === '()')) {
      prev.remove();
      this.setSel(this.indexOf(el), 0);
      this.changed(true);
      return;
    }
    const len = pt.length;
    this.setRuns(prev, concatRuns(runsOf(prev), runsOf(el)));
    el.remove();
    this.setSel(this.indexOf(prev), len);
    this.changed(true, prev);
  }

  mergeForward(el) {
    const next = this.visibleSibling(el, 1);
    if (!next) return;
    this.closeTyping();
    this.pushUndo();
    const i = this.indexOf(el);
    const len = textOf(el).length;
    if (len === 0) { el.remove(); this.setSel(this.indexOf(next), 0); this.changed(true); return; }
    void i;
    this.setRuns(el, concatRuns(runsOf(el), runsOf(next)));
    next.remove();
    this.setSel(i, len);
    this.changed(true, el);
  }

  insertParaAfter(el, p) {
    const n = this.makeEl(p);
    el.after(n);
    return n;
  }

  enter() {
    this.closeTyping();
    this.hideSmart();
    let c = this.caret();
    if (!c) return;
    this.pushUndo();
    if (!c.sel.collapsed) { this.deleteSelection(); c = this.caret(); }
    const el = c.el;
    let t = el.dataset.t;
    let txt = textOf(el);
    const empty = txt.trim() === '' || (t === 'paren' && txt.trim() === '()');
    if (empty && t !== 'action' && t !== 'general') {
      this.undoStack.pop();
      this.showElementPicker(el);
      return;
    }
    if (empty) {
      // Enter on an empty action line: offer the element list too (Final Draft behaviour)
      this.undoStack.pop();
      this.showElementPicker(el);
      return;
    }
    if (t === 'character' && /TO:$/i.test(txt.trim())) { el.dataset.t = t = 'transition'; }
    if (t === 'character' && txt.lastIndexOf('(') > txt.lastIndexOf(')') && c.off >= txt.length) {
      // close an open extension: OTIS (V.O. → OTIS (V.O.)
      this.setRuns(el, concatRuns(runsOf(el), [{ x: ')' }]));
      c = { ...c, off: c.off + 1 };
      txt = textOf(el);
    }
    if (t === 'scene' && c.off >= txt.length) {
      const tidy = tidyHeading(txt);
      if (tidy !== txt) {
        this.setRuns(el, [{ x: tidy }]);
        txt = tidy;
        c = { ...c, off: tidy.length };
      }
    }
    const runs = runsOf(el);
    let off = c.off;
    let atEnd = off >= txt.length;
    if (t === 'paren' && txt.slice(off) === ')') { atEnd = true; off = txt.length; }
    const left = sliceRuns(runs, 0, off), right = sliceRuns(runs, off);
    const newType = atEnd ? ELEMS[t].enter : t;
    this.setRuns(el, left);
    const n = this.insertParaAfter(el, { t: newType, runs: right, lvl: newType === 'section' ? +el.dataset.lvl || 1 : 0 });
    if (newType === 'paren' && runsText(right) === '') {
      this.setRuns(n, [{ x: '()' }]);
      this.setSel(c.pi + 1, 1);
    } else this.setSel(c.pi + 1, 0);
    this.changed(true, n);
    this.decorate(el);
    this.hooks.onElement && this.hooks.onElement(newType);
    this.updateSmart(true);
  }

  tab(shift) {
    this.closeTyping();
    const c = this.caret();
    if (!c) return;
    const el = c.el;
    const t = el.dataset.t;
    const txt = textOf(el);
    const empty = txt.trim() === '' || (t === 'paren' && txt.trim() === '()');
    if (shift) {
      // reverse of the empty-Tab cycle
      const back = Object.keys(ELEMS).find((k) => ELEMS[k].empty === t && ['scene', 'action', 'character', 'transition', 'dialogue', 'paren'].includes(k));
      this.pushUndo();
      this.setType(el, back || 'action');
      this.updateSmart(true);
      return;
    }
    if (empty) {
      this.pushUndo();
      this.setType(el, ELEMS[t].empty);
      this.updateSmart(true);
      return;
    }
    if (t === 'scene' && c.off >= txt.length) {
      const up = txt.toUpperCase();
      const introOnly = up.trim().match(/^(INT\.?\/EXT|EXT\.?\/INT|INT|EXT|EST|I\/E)\.?$/);
      if (introOnly) {
        this.pushUndo();
        const intro = INTROS.find((x) => x.replace(/[. ]/g, '') === introOnly[1].replace(/[. ]/g, '')) || introOnly[1] + '. ';
        this.setRuns(el, [{ x: intro }]);
        this.setSel(c.pi, intro.length);
        this.changed(false, el);
        this.updateSmart(true);
        return;
      }
      if (!up.includes(' - ') && sceneParts(up).intro) {
        this.pushUndo();
        const base = txt.replace(/\s+$/, '');
        this.setRuns(el, concatRuns(sliceRuns(runsOf(el), 0, base.length), [{ x: ' - ' }]));
        this.setSel(c.pi, base.length + 3);
        this.changed(false, el);
        this.updateSmart(true);
        return;
      }
    }
    if (c.off >= txt.length || (t === 'paren' && txt.slice(c.off) === ')')) {
      this.pushUndo();
      const nt = ELEMS[t].tab;
      const n = this.insertParaAfter(el, { t: nt, runs: [{ x: nt === 'paren' ? '()' : '' }] });
      this.setSel(c.pi + 1, nt === 'paren' ? 1 : 0);
      this.changed(true, n);
      this.hooks.onElement && this.hooks.onElement(nt);
      this.updateSmart(true);
    }
  }

  toggleStyle(bit) {
    const s = this.getSel();
    if (!s) return;
    if (s.collapsed) {
      const chars = toChars(runsOf(s.el));
      const cur = this.pendingStyle !== null ? this.pendingStyle : (chars[s.so - 1] ? chars[s.so - 1][1] : 0);
      this.pendingStyle = cur ^ bit;
      this.pendingAt = { el: s.el, off: s.so };
      this.hooks.onStyle && this.hooks.onStyle(this.pendingStyle);
      return;
    }
    this.closeTyping();
    this.pushUndo();
    const els = this.root.children;
    let all = true;
    const ranges = [];
    for (let i = s.sp; i <= s.ep; i++) {
      const chars = toChars(runsOf(els[i]));
      const a = i === s.sp ? s.so : 0, b = i === s.ep ? s.eo : chars.length;
      ranges.push([i, chars, a, b]);
      for (let k = a; k < b; k++) if (!(chars[k][1] & bit)) all = false;
    }
    for (const [i, chars, a, b] of ranges) {
      for (let k = a; k < b; k++) chars[k][1] = all ? chars[k][1] & ~bit : chars[k][1] | bit;
      this.setRuns(els[i], fromChars(chars));
      this.changed(false, els[i]);
    }
    this.setSel(s.sp, s.so, s.ep, s.eo, false);
  }

  selectScene() {
    const c = this.caret();
    if (!c) return;
    const els = this.root.children;
    let a = c.pi;
    while (a > 0 && els[a].dataset.t !== 'scene') a--;
    let b = c.pi + 1;
    while (b < els.length && els[b].dataset.t !== 'scene' && els[b].dataset.t !== 'section') b++;
    this.setSel(a, 0, b - 1, textOf(els[b - 1]).length);
  }

  // ---------------------------------------------------------------- clipboard

  onCopy(e, cut) {
    const s = this.getSel();
    if (!s || s.collapsed) return;
    const els = this.root.children;
    const list = [];
    for (let i = s.sp; i <= s.ep; i++) {
      if (els[i].dataset.t === 'section') continue; // acts stay put; copying never duplicates them
      const p = this.paraData(els[i]);
      const a = i === s.sp ? s.so : 0, b = i === s.ep ? s.eo : Infinity;
      p.runs = cleanRuns(sliceRuns(p.runs, a, b));
      delete p.meta;
      list.push(p);
    }
    e.preventDefault();
    if (!list.length) return;
    const plain = list.map((p) => {
      const t = runsText(p.runs);
      return ELEMS[p.t] && ELEMS[p.t].upper ? t.toUpperCase() : t;
    }).join(s.sp === s.ep ? '' : '\n\n');
    e.clipboardData.setData('text/plain', plain);
    if (s.sp !== s.ep || list[0].t !== 'action') e.clipboardData.setData('application/x-pageone', JSON.stringify(list));
    if (cut) {
      this.closeTyping();
      this.pushUndo();
      this.deleteSelection();
      this.changed(true);
    }
  }

  async onPaste(e) {
    e.preventDefault();
    const dt = e.clipboardData;
    const j = dt.getData('application/x-pageone');
    const txt = dt.getData('text/plain').replace(/\r\n?/g, '\n');
    if (j) {
      try { this.insertParas(JSON.parse(j)); return; } catch { /* fall through */ }
    }
    if (!txt) return;
    if (!txt.includes('\n')) { this.insertText(txt); return; }
    const c = this.caret();
    let paras;
    try {
      const p = await this.hooks.importText(txt);
      paras = p.paras;
    } catch {
      paras = txt.split(/\n{2,}/).map((x) => ({ t: 'action', runs: [{ x }] }));
    }
    if (c) this.setSel(c.sel.sp, c.sel.so, c.sel.ep, c.sel.eo, false);
    this.insertParas(paras);
  }

  insertParas(list) {
    if (!list || !list.length) return;
    this.closeTyping();
    this.pushUndo();
    let c = this.caret();
    if (!c) return;
    if (!c.sel.collapsed) { this.deleteSelection(); c = this.caret(); }
    const el = c.el;
    const runs = runsOf(el);
    const left = sliceRuns(runs, 0, c.off), right = sliceRuns(runs, c.off);
    if (list.length === 1) {
      const ins = list[0].runs;
      this.setRuns(el, concatRuns(concatRuns(left, ins), right));
      this.setSel(c.pi, c.off + runsText(ins).length);
      this.changed(true, el);
      return;
    }
    const leftEmpty = runsText(left).trim() === '';
    if (leftEmpty) el.dataset.t = list[0].t;
    this.setRuns(el, concatRuns(left, list[0].runs));
    if (list[0].meta && leftEmpty) el._meta = { ...list[0].meta };
    this.changed(false, el);
    let last = el;
    for (let k = 1; k < list.length; k++) {
      const p = { ...list[k] };
      if (k === list.length - 1) p.runs = concatRuns(p.runs, right);
      last = this.insertParaAfter(last, p);
      if (this.revLevel) last.dataset.rev = this.revLevel;
    }
    const li = this.indexOf(last);
    this.setSel(li, textOf(last).length - runsText(right).length);
    this.changed(true, last);
  }

  // ---------------------------------------------------------------- SmartType

  smartItems(el, txt) {
    const t = el.dataset.t;
    const d = this.hooks.smartData();
    const up = txt.toUpperCase();
    const pref = (list, p, max = 9) => list.filter((x) => x.startsWith(p) && x !== p).slice(0, max);
    if (t === 'scene') {
      const parts = sceneParts(up);
      if (!parts.intro) {
        if (!up.trim()) return { items: INTROS.map((x) => ({ label: x.trim(), value: x })), seg: 0 };
        const items = INTROS.filter((x) => x.startsWith(up) && x !== up);
        return { items: items.map((x) => ({ label: x.trim(), value: x })), seg: 0 };
      }
      const dash = up.lastIndexOf(' - ');
      if (dash < 0) {
        const start = up.indexOf(parts.intro) + parts.intro.length;
        const segStart = up.length - up.slice(start).trimStart().length;
        const p = up.slice(segStart);
        return { items: pref(d.locations, p).map((x) => ({ label: x, value: x, then: ' - ' })), seg: segStart };
      }
      const p = up.slice(dash + 3);
      const times = [...new Set([...d.times, ...TIMES])];
      return { items: (p ? pref(times, p) : times.slice(0, 9)).map((x) => ({ label: x, value: x })), seg: dash + 3 };
    }
    if (t === 'character') {
      const open = up.lastIndexOf('(');
      if (open >= 0 && !up.includes(')', open)) {
        const p = up.slice(open + 1);
        return { items: EXTENSIONS.filter((x) => x.startsWith(p) && x !== p).map((x) => ({ label: x, value: x + ')' })), seg: open + 1 };
      }
      const items = up.trim() ? pref(d.characters, up) : d.characters.slice(0, 9);
      return { items: items.map((x) => ({ label: x, value: x })), seg: 0 };
    }
    if (t === 'transition') {
      const items = up.trim() ? pref([...new Set([...d.transitions, ...TRANSITIONS])], up) : TRANSITIONS.slice(0, 9);
      return { items: items.map((x) => ({ label: x, value: x })), seg: 0 };
    }
    return null;
  }

  updateSmart(force = false) {
    const c = this.caret();
    if (!c || !c.sel.collapsed) return this.hideSmart();
    const txt = textOf(c.el);
    if (c.off < txt.length) return this.hideSmart();
    if (!force && !this.smart && txt === '') return this.hideSmart();
    const r = this.smartItems(c.el, txt);
    if (!r || !r.items.length) return this.hideSmart();
    this.smart = {
      items: r.items,
      index: 0,
      pick: (item) => {
        const el = c.el;
        const runs = sliceRuns(runsOf(el), 0, r.seg);
        const val = item.value + (item.then || '');
        this.setRuns(el, concatRuns(runs, [{ x: val }]));
        this.setSel(this.indexOf(el), r.seg + val.length);
        this.changed(false, el);
      },
    };
    this.renderSmart();
  }

  showElementPicker(el) {
    const items = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'centered', 'lyric', 'general', 'note']
      .map((k) => ({ label: ELEMS[k].label.replace(/ \(.*/, ''), value: k, key: ELEMS[k].key }));
    const cur = el.dataset.t;
    this.smart = {
      picker: true,
      items,
      index: Math.max(0, items.findIndex((x) => x.value === ELEMS[cur].enter)),
      pick: (item) => { this.pushUndo(); this.setType(el, item.value); this.updateSmart(true); },
    };
    this.renderSmart();
  }

  renderSmart() {
    const s = this.smart;
    const p = this.popup;
    p.innerHTML = s.items
      .map((it, i) => `<li data-i="${i}" class="${i === s.index ? 'on' : ''}"><span>${esc(it.label)}</span>${it.key ? `<kbd>Ctrl ${it.key}</kbd>` : ''}</li>`)
      .join('');
    p.classList.toggle('picker', !!s.picker);
    p.hidden = false;
    const sel = window.getSelection();
    let rect = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    if (!rect || (!rect.height && !rect.left)) {
      const el = this.current || this.root.firstChild;
      rect = el.getBoundingClientRect();
    }
    const ph = p.offsetHeight;
    let top = rect.bottom + 6;
    if (top + ph > window.innerHeight - 40) top = rect.top - ph - 6;
    p.style.top = `${Math.max(8, top)}px`;
    p.style.left = `${Math.min(window.innerWidth - p.offsetWidth - 12, Math.max(8, rect.left - 8))}px`;
  }

  moveSmart(d) {
    const s = this.smart;
    s.index = (s.index + d + s.items.length) % s.items.length;
    this.renderSmart();
  }

  acceptSmart() {
    const s = this.smart;
    if (!s) return;
    const item = s.items[s.index];
    this.hideSmart();
    if (!s.picker) { this.closeTyping(); this.pushUndo(); }
    s.pick(item);
    if (!s.picker) this.updateSmart();
  }

  hideSmart() {
    this.smart = null;
    this.popup.hidden = true;
  }

  // ---------------------------------------------------------------- whole-document operations

  /** Replace the document (keeps undo). */
  replaceAll(paras, sel) {
    this.closeTyping();
    this.pushUndo();
    const u = this.undoStack, r = this.redoStack;
    this.load(paras);
    this.undoStack = u; this.redoStack = r;
    if (sel) this.setSel(...sel);
    this.changed(true);
  }

  applyLayout(lay, settings) {
    const els = this.root.children;
    for (const el of this.root.querySelectorAll('.pb')) { el.classList.remove('pb'); delete el.dataset.pn; }
    lay.breaks.forEach((pi, k) => {
      const el = els[pi];
      if (el) { el.classList.add('pb'); el.dataset.pn = `${k + 2}.`; }
    });
    for (const s of lay.scenes) {
      const el = els[s.para];
      if (el) el.dataset.sn = settings.scene_numbers ? s.number : '';
    }
    // show the automatic (CONT'D) the printed page will carry
    const contd = new Set();
    for (const pg of lay.pages) for (const l of pg.lines) {
      if (l.para < 0) continue;
      const el = els[l.para];
      if (el && el.dataset.t === 'character' && l.runs.some((r) => r.x.includes("(CONT'D)")) && !/CONT'D/i.test(textOf(el))) contd.add(el);
    }
    for (const el of this.root.querySelectorAll('[data-contd]')) if (!contd.has(el)) delete el.dataset.contd;
    for (const el of contd) el.dataset.contd = '1';
    this.scheduleDual();
  }

  focusPara(i, off = 0) {
    while (this.root.children[i] && this.root.children[i].dataset.t === 'section') { i++; off = 0; }
    if (!this.root.children[i]) i = this.root.children.length - 1;
    const el = this.root.children[i];
    if (!el) return;
    this.root.focus();
    this.setSel(i, off, i, off, false);
    const desk = this.root.closest('.desk');
    const r = el.getBoundingClientRect(), dr = desk.getBoundingClientRect();
    desk.scrollTop += r.top - dr.top - dr.height * 0.25;
  }
}

/** "int apartment day" → "int. apartment - day": add the intro's period and the dash before a time of day. */
export function tidyHeading(txt) {
  let t = txt.replace(/\s+$/, '');
  const m = t.match(/^(int\.?\/ext|ext\.?\/int|int|ext|est|i\/e)(\.?)(\s+)(.*)$/i);
  if (!m) return txt;
  let rest = m[4];
  if (!rest.includes(' - ')) {
    const up = rest.toUpperCase();
    const time = TIMES.slice().sort((a, b) => b.length - a.length).find((x) => up.endsWith(' ' + x) && up.length > x.length + 1);
    if (time) rest = rest.slice(0, rest.length - time.length).replace(/[\s-]+$/, '') + ' - ' + rest.slice(rest.length - time.length);
  }
  return `${m[1]}.${' '}${rest}`.replace(/\.\. /, '. ');
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export { ORDER, cueName };
