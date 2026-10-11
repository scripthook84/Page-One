// Dialogs: title page, setup, export, reports, dialogue tuner, rename, palette, help.

import { S, eighths, projectNow } from './state.js';
import { esc, textOf } from './editor.js';
import { ELEMS, cueName, sceneParts } from './elements.js';

const root = () => document.getElementById('modalRoot');

/** Open a modal. `buttons`: [{label, value, primary, danger}]. Resolves with the clicked value (or null on dismiss). */
export function modal({ title, body, buttons = [{ label: 'Close', value: null }], wide = false, onOpen, cls = '' }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title || '')}">
      ${title ? `<header><h2>${esc(title)}</h2><button class="x" aria-label="Close" data-v="__x">✕</button></header>` : ''}
      <div class="body"></div>
      ${buttons.length ? `<footer>${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</footer>` : ''}
    </div>`;
    const bodyEl = scrim.querySelector('.body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    root().appendChild(scrim);
    const done = (v) => {
      scrim.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(v);
    };
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) done(null); });
    scrim.addEventListener('click', (e) => {
      if (e.target.closest('[data-v="__x"]')) done(null);
      const b = e.target.closest('footer [data-i]');
      if (b) {
        const spec = buttons[+b.dataset.i];
        if (spec.validate && !spec.validate(bodyEl)) return;
        done(spec.value !== undefined ? spec.value : spec.label);
      }
    });
    scrim.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const p = buttons.findIndex((b) => b.primary);
        if (p >= 0) { e.preventDefault(); scrim.querySelector(`footer [data-i="${p}"]`).click(); }
      }
    });
    const first = scrim.querySelector('input, textarea, select') || scrim.querySelector('footer .primary') || scrim.querySelector('footer button');
    setTimeout(() => first && first.focus(), 0);
    if (onOpen) onOpen(bodyEl, done);
  });
}

export function alert(title, msg) {
  return modal({ title, body: `<p style="margin:0">${esc(msg)}</p>`, buttons: [{ label: 'OK', primary: true }] });
}

export function confirmUnsaved(name) {
  return modal({
    title: 'Save changes?',
    body: `<p style="margin:0">“${esc(name || 'Untitled')}” has changes that haven’t been saved.</p>`,
    buttons: [
      { label: 'Don’t save', value: 'discard', danger: true },
      { label: 'Cancel', value: 'cancel' },
      { label: 'Save', value: 'save', primary: true },
    ],
  }).then((v) => v || 'cancel');
}

// ------------------------------------------------------------------ title page

export async function titlePageDialog() {
  const tp = { ...S.project.title_page };
  const body = document.createElement('div');
  body.className = 'grid2';
  body.style.gridTemplateColumns = '1fr 220px';
  body.innerHTML = `<div class="opts">
      <label class="field"><span>Title</span><input type="text" data-k="title" value="${esc(tp.title)}" placeholder="The title of your script"></label>
      <label class="field"><span>Credit</span><input type="text" data-k="credit" value="${esc(tp.credit)}" list="credits"></label>
      <datalist id="credits"><option>Written by</option><option>Screenplay by</option><option>Teleplay by</option><option>Story by</option><option>by</option></datalist>
      <label class="field"><span>Author(s)</span><textarea rows="2" data-k="author">${esc(tp.author)}</textarea></label>
      <label class="field"><span>Source material</span><input type="text" data-k="source" value="${esc(tp.source)}" placeholder="Based on the novel by…"></label>
      <div class="grid2">
        <label class="field"><span>Contact (bottom left)</span><textarea rows="4" data-k="contact" placeholder="Name&#10;Phone&#10;Email">${esc(tp.contact)}</textarea></label>
        <div class="opts">
          <label class="field"><span>Draft date</span><input type="text" data-k="draft" value="${esc(tp.draft)}" placeholder="${esc(new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))}"></label>
          <label class="field"><span>Notes (bottom right)</span><textarea rows="2" data-k="notes" placeholder="WGA registration…">${esc(tp.notes)}</textarea></label>
        </div>
      </div>
    </div>
    <div class="tp-preview" aria-label="Preview"></div>`;
  const preview = () => {
    const pv = body.querySelector('.tp-preview');
    const lh = 100 / 66; // % per line (11in × 6 lines)
    const top = (row) => `${(6 + row) * lh}%`;
    let html = '';
    let row = 22;
    for (const l of tp.title.split('\n').filter((x) => x.trim())) { html += `<div style="top:${top(row)}">${esc(l.toUpperCase())}</div>`; row++; }
    row++;
    if (tp.credit.trim()) { html += `<div style="top:${top(row)}">${esc(tp.credit)}</div>`; row += 2; }
    for (const l of tp.author.split('\n').filter((x) => x.trim())) { html += `<div style="top:${top(row)}">${esc(l)}</div>`; row++; }
    if (tp.source.trim()) html += `<div style="top:${top(row + 2)}">${esc(tp.source)}</div>`;
    const c = tp.contact.split('\n');
    c.forEach((l, i) => { html += `<div class="bl" style="top:${top(53 - c.length + 1 + i)}">${esc(l)}</div>`; });
    const r = [...tp.notes.split('\n').filter((x) => x), ...(tp.draft ? [tp.draft] : [])];
    r.forEach((l, i) => { html += `<div class="br" style="top:${top(53 - r.length + 1 + i)}">${esc(l)}</div>`; });
    pv.innerHTML = html;
  };
  body.addEventListener('input', (e) => { const k = e.target.dataset.k; if (k) { tp[k] = e.target.value; preview(); } });
  preview();
  const v = await modal({ title: 'Title page', body, wide: true, buttons: [{ label: 'Cancel', value: null }, { label: 'Save title page', value: 'ok', primary: true }] });
  if (v === 'ok') {
    S.project.title_page = tp;
    S.app.markDirty();
    S.app.setTitleUI();
  }
}

// ------------------------------------------------------------------ document setup

export async function setupDialog() {
  const st = { ...S.project.settings };
  const p = S.prefs;
  const body = `<div class="grid2">
    <div class="opts">
      <h3 style="margin:0;font-size:13px">Page</h3>
      <label class="field"><span>Paper</span><select data-k="page_size"><option value="letter">US Letter (8.5 × 11 in)</option><option value="a4">A4</option></select></label>
      <label class="field"><span>Target length (pages)</span><input type="number" min="0" max="400" data-k="target_pages" value="${st.target_pages}"></label>
      <label class="field"><span>Header text (top left of every page)</span><input type="text" data-k="header" value="${esc(st.header)}" placeholder="e.g. Blue Revision – 10/11/26"></label>
      <label class="chk"><input type="checkbox" data-k="title_page" ${st.title_page ? 'checked' : ''}> Include title page in exports</label>
    </div>
    <div class="opts">
      <h3 style="margin:0;font-size:13px">Format</h3>
      <label class="chk"><input type="checkbox" data-k="scene_numbers" ${st.scene_numbers ? 'checked' : ''}> Scene numbers</label>
      <label class="chk"><input type="checkbox" data-k="scene_space" ${st.scene_space >= 2 ? 'checked' : ''}> Two blank lines before scene headings</label>
      <label class="chk"><input type="checkbox" data-k="bold_scenes" ${st.bold_scenes ? 'checked' : ''}> Bold scene headings</label>
      <label class="chk"><input type="checkbox" data-k="conts" ${st.conts ? 'checked' : ''}> Automatic (CONT'D) when a character keeps talking after action</label>
      <label class="chk"><input type="checkbox" data-k="mores" ${st.mores ? 'checked' : ''}> (MORE) and (CONT'D) when dialogue breaks across pages</label>
      <h3 style="margin:8px 0 0;font-size:13px">App</h3>
      <label class="chk"><input type="checkbox" data-pref="autosave" ${p.autosave ? 'checked' : ''}> Save automatically every minute</label>
    </div>
  </div>
  <p class="hint">Layout follows Final Draft’s defaults: Courier 12 pt, 1.5 in left margin, 1 in right, top and bottom margins, 54 lines per page; dialogue 2.5–6.0 in, character cues at 3.7 in, parentheticals 3.1–5.25 in, transitions end at 7.5 in.</p>`;
  await modal({
    title: 'Document setup', body, wide: true,
    buttons: [{ label: 'Done', value: 'ok', primary: true }],
    onOpen: (b) => { b.querySelector('[data-k="page_size"]').value = st.page_size; },
  });
}

// Setup changes apply live (the page re-flows as you toggle).
document.addEventListener('change', (e) => {
  const scrim = e.target.closest('.scrim');
  if (!scrim || !scrim.querySelector('[aria-label="Document setup"]')) return;
  const k = e.target.dataset.k, pref = e.target.dataset.pref;
  if (pref) { S.app.setPref(pref, e.target.checked); return; }
  if (!k) return;
  scrim._pending = scrim._pending || {};
  let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (k === 'scene_space') v = v ? 2 : 1;
  if (k === 'target_pages') v = Math.max(0, parseInt(v, 10) || 0);
  scrim._pending[k] = v;
  // apply immediately — settings are cheap to change and the page updates live
  S.app.setSetting(k, v);
});
document.addEventListener('input', (e) => {
  const scrim = e.target.closest('.scrim');
  if (!scrim || !scrim.querySelector('[aria-label="Document setup"]')) return;
  const k = e.target.dataset.k;
  if (k === 'header') S.app.setSetting('header', e.target.value);
});

// ------------------------------------------------------------------ export

export async function exportDialog(doExport, preset = 'pdf') {
  const st = S.project.settings;
  const body = `<div class="radios">
      <label><input type="radio" name="fmt" value="pdf"><span>PDF<small>Print-ready, industry format</small></span></label>
      <label><input type="radio" name="fmt" value="fdx"><span>Final Draft<small>.fdx for Final Draft, Fade In, WriterDuet</small></span></label>
      <label><input type="radio" name="fmt" value="fountain"><span>Fountain<small>Plain-text screenplay markup</small></span></label>
      <label><input type="radio" name="fmt" value="text"><span>Plain text<small>Formatted pages as .txt</small></span></label>
    </div>
    <div class="opts" id="pdfOpts">
      <label class="chk"><input type="checkbox" id="xTitle" ${st.title_page ? 'checked' : ''}> Include title page</label>
      <label class="chk"><input type="checkbox" id="xNums" ${st.scene_numbers ? 'checked' : ''}> Scene numbers</label>
      <label class="field"><span>Watermark (optional)</span><input type="text" id="xWm" placeholder="e.g. DRAFT, or the reader’s name"></label>
    </div>`;
  let opts = {};
  const v = await modal({
    title: 'Export', body,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Export', value: 'ok', primary: true, validate: (b) => {
      opts = {
        kind: b.querySelector('input[name="fmt"]:checked').value,
        titlePage: b.querySelector('#xTitle').checked,
        sceneNumbers: b.querySelector('#xNums').checked,
        watermark: b.querySelector('#xWm').value.trim(),
      };
      return true;
    } }],
    onOpen: (b) => {
      b.querySelector(`input[value="${preset}"]`).checked = true;
      const sync = () => { b.querySelector('#pdfOpts').hidden = !['pdf', 'text'].includes(b.querySelector('input[name="fmt"]:checked').value); b.querySelector('#xWm').parentElement.hidden = b.querySelector('input[name="fmt"]:checked').value !== 'pdf'; };
      b.addEventListener('change', sync);
      sync();
    },
  });
  if (v === 'ok') doExport(opts.kind, opts);
}

// ------------------------------------------------------------------ acts / sequences / beats

const LEVELS = ['', 'Act', 'Sequence', 'Beat'];

/**
 * Acts, sequences and beats organise the script in the navigator and on the cards; they never
 * appear on the page. New ones are inserted before the scene the cursor is in.
 * opts: { lvl } to create, or { para } (paragraph index of an existing section) to edit.
 */
export async function sectionDialog(opts = {}) {
  const els = S.editor.els();
  const editing = opts.para !== undefined ? els[opts.para] : null;
  const meta = editing ? { ...(editing._meta || {}) } : {};
  let lvl = editing ? +editing.dataset.lvl || 1 : opts.lvl || 1;
  const count = Array.from(els).filter((e) => e.dataset.t === 'section' && (+e.dataset.lvl || 1) === lvl).length;
  const ordinals = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
  const suggested = editing ? textOf(editing) : `${LEVELS[lvl]} ${lvl === 1 ? (ordinals[count] || count + 1) : count + 1}`;
  let name = suggested, syn = meta.synopsis || '';
  const v = await modal({
    title: editing ? `Edit ${LEVELS[lvl].toLowerCase()}` : `New ${LEVELS[lvl].toLowerCase()}`,
    body: `<p class="hint" style="margin:0">${editing ? '' : 'Starts before the scene your cursor is in. '}Acts, sequences and beats organise the navigator and index cards. They never appear on the script page.</p>
      <label class="field"><span>Name</span><input type="text" id="sn" value="${esc(suggested)}"></label>
      <label class="field"><span>Level</span><select id="sl">${[1, 2, 3].map((k) => `<option value="${k}" ${k === lvl ? 'selected' : ''}>${LEVELS[k]}</option>`).join('')}</select></label>
      <label class="field"><span>Summary (optional)</span><textarea id="ss" rows="3" placeholder="What this part of the story does.">${esc(syn)}</textarea></label>`,
    buttons: [
      ...(editing ? [{ label: 'Delete', value: 'delete', danger: true }] : []),
      { label: 'Cancel', value: null },
      { label: editing ? 'Save' : 'Add', value: 'ok', primary: true, validate: (b) => {
        name = b.querySelector('#sn').value.trim(); lvl = +b.querySelector('#sl').value; syn = b.querySelector('#ss').value.trim();
        return !!name;
      } },
    ],
  });
  if (!v) return;
  const ed = S.editor;
  ed.closeTyping();
  ed.pushUndo();
  if (v === 'delete') {
    editing.remove();
  } else if (editing) {
    ed.setRuns(editing, [{ x: name }]);
    editing.dataset.lvl = lvl;
    editing._meta = { ...meta, synopsis: syn };
  } else {
    // insert before the scene heading that contains the cursor (or before the cursor's line)
    let i = Math.min(S.curPara, els.length - 1);
    let k = i;
    while (k >= 0 && els[k].dataset.t !== 'scene') k--;
    if (k >= 0) i = k;
    while (i > 0 && els[i - 1].dataset.t === 'section' && (+els[i - 1].dataset.lvl || 1) > lvl) i--;
    const el = ed.makeEl({ t: 'section', lvl, runs: [{ x: name }], meta: syn ? { synopsis: syn } : undefined });
    els[i].before(el);
  }
  ed.changed(true);
  S.app.toast(v === 'delete' ? `${LEVELS[lvl]} removed. Its scenes stay where they are.` : editing ? `${name} saved.` : `${name} added to the navigator.`);
}

// ------------------------------------------------------------------ go to page

export async function gotoDialog() {
  const lay = S.layout;
  if (!lay) return;
  let n = 0;
  const v = await modal({
    title: 'Go to page',
    body: `<label class="field"><span>Page (1–${lay.pages.length})</span><input type="number" id="gp" min="1" max="${lay.pages.length}" value="${lay.para_page[S.curPara] || 1}"></label>`,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Go', value: 'go', primary: true, validate: (b) => { n = +b.querySelector('#gp').value; return n >= 1; } }],
  });
  if (v !== 'go') return;
  const idx = lay.para_page.findIndex((p) => p >= n);
  S.app.setView('script');
  S.editor.focusPara(idx < 0 ? lay.para_page.length - 1 : idx);
}

// ------------------------------------------------------------------ reports

export async function reportsDialog(tab = 'scenes') {
  const d = S.derived;
  const lay = S.layout;
  const tables = {
    scenes: {
      head: ['#', 'Scene', 'Page', 'Length', 'Speaking'],
      rows: d.scenes.filter((s) => s.t === 'scene').map((s) => [s.number, s.text, s.page, s.eighths, [...s.cast].join(', ')]),
      fmt: [null, 'h', null, (v) => (v ? eighths(v) : ''), null],
    },
    characters: {
      head: ['Character', 'Speeches', 'Words', 'Scenes', 'First page'],
      rows: d.characters.map((c) => [c.name, c.speeches, c.words, c.scenes.size, c.firstPage || '']),
      fmt: ['h', null, null, null, null],
    },
    locations: {
      head: ['Location', 'Int/Ext', 'Scenes', 'Pages', 'Times of day'],
      rows: d.locations.map((l) => {
        const e8 = l.scenes.reduce((a, i) => a + ((lay.scenes.find((s) => s.para === i) || {}).eighths || 0), 0);
        return [l.name, [...l.intros].join(', '), l.scenes.length, e8, [...l.times].join(', ')];
      }),
      fmt: ['h', null, null, (v) => (v ? eighths(v) : ''), null],
    },
  };
  const totalPages = lay ? lay.pages.length : 0;
  const ints = d.scenes.filter((s) => s.t === 'scene' && /^INT/i.test(s.text)).length;
  const exts = d.scenes.filter((s) => s.t === 'scene' && /^EXT/i.test(s.text)).length;
  const nights = d.scenes.filter((s) => s.t === 'scene' && /NIGHT/i.test(sceneParts(s.text).time)).length;
  const body = document.createElement('div');
  body.innerHTML = `<p class="hint" style="margin:0">${totalPages} pages, ${d.scenes.filter((s) => s.t === 'scene').length} scenes (${ints} interior, ${exts} exterior, ${nights} night), ${d.characters.length} speaking characters, ${d.locations.length} locations.</p>
    <div class="tabs" style="padding:0">${Object.keys(tables).map((k) => `<button data-tab="${k}" aria-selected="${k === tab}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <div style="max-height:55vh;overflow:auto" id="rep"></div>`;
  let sort = { col: null, dir: 1 };
  const draw = () => {
    const T = tables[tab];
    let rows = T.rows.slice();
    if (sort.col !== null) rows.sort((a, b) => {
      const x = a[sort.col], y = b[sort.col];
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
    });
    body.querySelector('#rep').innerHTML = `<table class="report"><thead><tr>${T.head.map((h, i) => `<th data-col="${i}">${h}${sort.col === i ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((v, i) => { const f = T.fmt[i]; return `<td class="${f === 'h' ? 'h' : ''}">${esc(typeof f === 'function' ? f(v) : v ?? '')}</td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="${T.head.length}" class="hint">Nothing to report yet.</td></tr>`}</tbody></table>`;
  };
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; sort = { col: null, dir: 1 }; for (const b of body.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b === t)); draw(); }
    const th = e.target.closest('th[data-col]');
    if (th) { const c = +th.dataset.col; sort = { col: c, dir: sort.col === c ? -sort.dir : 1 }; draw(); }
  });
  draw();
  const v = await modal({ title: 'Reports', body, wide: true, buttons: [{ label: 'Copy as CSV', value: 'csv' }, { label: 'Close', value: null, primary: true }] });
  if (v === 'csv') {
    const T = tables[tab];
    const csv = [T.head, ...T.rows.map((r) => r.map((v, i) => (typeof T.fmt[i] === 'function' ? T.fmt[i](v) : v)))].map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    try { await navigator.clipboard.writeText(csv); S.app.toast('Report copied. Paste it into a spreadsheet.'); } catch { S.app.toast('Could not reach the clipboard.'); }
  }
}

// ------------------------------------------------------------------ dialogue tuner

export async function tunerDialog(name) {
  const chars = S.derived.characters.map((c) => c.name);
  if (!chars.length) { alert('Dialogue tuner', 'No one has spoken yet. Write some dialogue first.'); return; }
  name = name || (() => {
    const els = S.editor.els();
    for (let i = S.curPara; i >= 0; i--) if (els[i].dataset.t === 'character') return cueName(textOf(els[i]));
    return chars[0];
  })();
  if (!chars.includes(name)) name = chars[0];
  const body = document.createElement('div');
  body.innerHTML = `<p class="hint" style="margin:0">Read one character’s lines on their own to tune their voice. Edits go straight into the script.</p>
    <label class="field"><span>Character</span><select id="tc">${chars.map((c) => `<option ${c === name ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <div class="tuner" id="tl" style="max-height:55vh;overflow:auto"></div>`;
  const edits = new Map();
  const draw = () => {
    const els = S.editor.els();
    const out = [];
    let scene = '';
    for (let i = 0; i < els.length; i++) {
      const t = els[i].dataset.t;
      if (t === 'scene') scene = textOf(els[i]);
      if (t === 'character' && cueName(textOf(els[i])) === name) {
        for (let j = i + 1; j < els.length && ['dialogue', 'paren', 'lyric'].includes(els[j].dataset.t); j++) {
          if (els[j].dataset.t === 'paren') continue;
          out.push(`<div class="speech"><span class="ctx">${esc(scene || 'No scene')} · p. ${S.layout ? S.layout.para_page[j] : ''}</span><textarea rows="2" data-pi="${j}">${esc(edits.has(j) ? edits.get(j) : textOf(els[j]))}</textarea></div>`);
        }
      }
    }
    body.querySelector('#tl').innerHTML = out.join('') || '<p class="hint">No lines.</p>';
    for (const ta of body.querySelectorAll('textarea')) ta.style.height = Math.max(44, ta.scrollHeight + 2) + 'px';
  };
  body.addEventListener('change', (e) => { if (e.target.id === 'tc') { name = e.target.value; draw(); } });
  body.addEventListener('input', (e) => { if (e.target.dataset.pi) edits.set(+e.target.dataset.pi, e.target.value); });
  draw();
  const v = await modal({ title: 'Dialogue tuner', body, wide: true, buttons: [{ label: 'Cancel', value: null }, { label: 'Apply changes', value: 'ok', primary: true }] });
  if (v !== 'ok' || !edits.size) return;
  S.editor.pushUndo();
  const els = S.editor.els();
  for (const [pi, txt] of edits) {
    if (textOf(els[pi]) === txt) continue;
    S.editor.setRuns(els[pi], [{ x: txt }]);
    S.editor.changed(false, els[pi]);
  }
  S.app.scheduleRefresh(50);
  S.app.toast(`Updated ${edits.size} ${edits.size === 1 ? 'line' : 'lines'}.`);
}

// ------------------------------------------------------------------ rename character

export async function renameDialog(name) {
  const chars = S.derived.characters.map((c) => c.name);
  if (!chars.length) { alert('Rename character', 'There are no characters to rename yet.'); return; }
  let from = name || chars[0], to = '', inAction = true;
  const v = await modal({
    title: 'Rename character',
    body: `<label class="field"><span>Character</span><select id="rf">${chars.map((c) => `<option ${c === from ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="field"><span>New name</span><input type="text" id="rt" placeholder="New name" style="text-transform:uppercase"></label>
      <label class="chk"><input type="checkbox" id="ra" checked> Also change the name in action, parentheticals and dialogue</label>`,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Rename', value: 'ok', primary: true, validate: (b) => {
      from = b.querySelector('#rf').value; to = b.querySelector('#rt').value.trim(); inAction = b.querySelector('#ra').checked;
      return !!to;
    } }],
  });
  if (v !== 'ok') return;
  const T = to.toUpperCase();
  const title = (s) => s.charAt(0) + s.slice(1).toLowerCase();
  const reCaps = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  const reTitle = new RegExp(`\\b${title(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
  const paras = S.editor.paras();
  let n = 0;
  for (const p of paras) {
    if (p.t === 'character') {
      const txt = p.runs.map((r) => r.x).join('');
      if (cueName(txt) === from) {
        const rest = txt.trim().slice(txt.trim().toUpperCase().indexOf(from) + from.length);
        p.runs = [{ x: T + rest }];
        n++;
      }
    } else if (inAction && ['action', 'dialogue', 'paren', 'general', 'shot', 'scene', 'lyric', 'transition'].includes(p.t)) {
      for (const r of p.runs) {
        const before = r.x;
        r.x = r.x.replace(reCaps, T).replace(reTitle, title(T));
        if (r.x !== before) n++;
      }
    }
  }
  for (const c of S.project.characters || []) if (c.name === from) c.name = T;
  S.editor.replaceAll(paras);
  S.app.toast(`Renamed ${from} to ${T} in ${n} ${n === 1 ? 'place' : 'places'}.`);
}

// ------------------------------------------------------------------ command palette

export function palette(commands, query = '') {
  const items = commands.filter((c) => !c.sep && c.id !== 'palette' && (!c.when || c.when()));
  const body = document.createElement('div');
  body.innerHTML = `<input type="text" id="pq" placeholder="Type a command…" value="${esc(query)}" aria-label="Command"><ul id="pl"></ul>`;
  let idx = 0, shown = items;
  const draw = () => {
    const q = body.querySelector('#pq').value.toLowerCase().trim();
    shown = items.filter((c) => !q || (`${c.menu || ''} ${c.label}`).toLowerCase().includes(q) || q.split(/\s+/).every((w) => (`${c.menu || ''} ${c.label}`).toLowerCase().includes(w)));
    idx = Math.min(idx, Math.max(0, shown.length - 1));
    body.querySelector('#pl').innerHTML = shown.map((c, i) => `<li data-i="${i}" class="${i === idx ? 'on' : ''}"><span>${esc(c.label)}</span><small>${esc(c.menu || '')}</small>${c.keys ? `<kbd>${c.keys}</kbd>` : ''}</li>`).join('') || '<li><span class="hint">No matching command</span></li>';
    const on = body.querySelector('li.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  };
  return modal({
    body, buttons: [], cls: 'palette',
    onOpen: (b, done) => {
      const input = b.querySelector('#pq');
      input.addEventListener('input', () => { idx = 0; draw(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % Math.max(1, shown.length); draw(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + shown.length) % Math.max(1, shown.length); draw(); }
        if (e.key === 'Enter') { e.preventDefault(); const c = shown[idx]; done(null); if (c) setTimeout(() => c.run(), 0); }
      });
      b.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) { const c = shown[+li.dataset.i]; done(null); setTimeout(() => c.run(), 0); } });
      draw();
    },
  });
}

// ------------------------------------------------------------------ help

export function shortcutsDialog() {
  const rows = [
    ['Writing', [
      ['Enter', 'New paragraph — the next element follows screenplay flow'],
      ['Tab', 'Switch element on an empty line, or add the next element'],
      ['Shift+Tab', 'Switch element backwards'],
      ['Shift+Enter', 'Line break inside a paragraph'],
      ['Enter on an empty line', 'Pick any element from a list (type its first letter)'],
      ['INT. / EXT.', 'Typing either on an action line makes it a scene heading'],
      ['( on an empty dialogue line', 'Starts a parenthetical'],
      ['↑ ↓ then Enter or Tab', 'Choose a SmartType suggestion (characters, locations, times, transitions)'],
    ]],
    ['Elements', ORDER_SHORT()],
    ['Script', [
      ['Ctrl+B / I / U', 'Bold, italic, underline'],
      ['Ctrl+Alt+D', 'Dual dialogue for the speech under the cursor'],
      ['Ctrl+Alt+T', 'Dialogue tuner'],
      ['Ctrl+Shift+R', 'Reports'],
      ['Ctrl+Shift+A', 'Select the current scene'],
      ['Ctrl+F / Ctrl+H', 'Find / find and replace'],
      ['Ctrl+G', 'Go to page'],
    ]],
    ['App', [
      ['Ctrl+K', 'Command palette — every command, searchable'],
      ['Ctrl+N / O / S', 'New, open, save'],
      ['Ctrl+P', 'Export PDF'],
      ['Ctrl+Alt+1 / 2', 'Script view / index cards'],
      ['Ctrl+Shift+F', 'Focus mode (Esc leaves)'],
      ['Ctrl+= / Ctrl+-', 'Zoom'],
    ]],
  ];
  const body = `<div class="grid2">${rows.map(([h, list]) => `<div><h3 style="margin:0 0 6px;font-size:13px">${h}</h3><table class="report"><tbody>${list.map(([k, d]) => `<tr><td style="white-space:nowrap"><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>`;
  return modal({ title: 'Keyboard shortcuts', body, wide: true, buttons: [{ label: 'Close', primary: true }] });
}

function ORDER_SHORT() {
  return ['general', 'scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'centered', 'lyric']
    .map((k) => [`Ctrl+${ELEMS[k].key}`, ELEMS[k].label])
    .concat([['Ctrl+Shift+1 / 2 / 3', 'New act, sequence or beat (navigator and cards only — never on the page)'], ['Ctrl+Shift+4', 'Note (never prints)']]);
}

export function formatGuide() {
  const body = `<table class="report"><thead><tr><th>Element</th><th>Position on the page</th><th>Notes</th></tr></thead><tbody>
    <tr><td>Page</td><td>US Letter, 1.5 in left, 1 in top/right/bottom</td><td>Courier 12 pt, 10 characters per inch, 54 lines. One page ≈ one minute.</td></tr>
    <tr><td>Scene heading</td><td>1.5 – 7.5 in</td><td>All caps. INT./EXT. LOCATION - TIME. Never left alone at the foot of a page.</td></tr>
    <tr><td>Action</td><td>1.5 – 7.5 in</td><td>Present tense, what we see and hear.</td></tr>
    <tr><td>Character</td><td>3.7 in</td><td>All caps. Extensions: (V.O.), (O.S.), (CONT'D).</td></tr>
    <tr><td>Parenthetical</td><td>3.1 – 5.25 in</td><td>A few words of direction, inside dialogue.</td></tr>
    <tr><td>Dialogue</td><td>2.5 – 6.0 in</td><td>Breaks across pages with (MORE) and (CONT'D).</td></tr>
    <tr><td>Transition</td><td>Right edge at 7.5 in</td><td>All caps: CUT TO:, DISSOLVE TO:.</td></tr>
    <tr><td>Page number</td><td>0.5 in from top, flush right</td><td>“2.” style. None on page 1.</td></tr>
    <tr><td>Title page</td><td>Title ~3.75 in below the top margin</td><td>Credit and author two lines apart, contact bottom left.</td></tr>
  </tbody></table>`;
  return modal({ title: 'Screenplay format', body, wide: true, buttons: [{ label: 'Close', primary: true }] });
}

export function aboutDialog() {
  const body = `<div style="display:flex;gap:16px;align-items:center"><img src="icon.png" width="64" height="64" alt="" style="border-radius:14px">
    <div><h2 style="margin:0;font-size:18px">Page One 1.0</h2><p class="hint" style="margin:4px 0 0">A lightweight, open-source screenwriting app. Apache License 2.0.</p></div></div>
    <p style="margin:0">Scripts are saved as compact <b>.pageone</b> files. Page One opens and exports Fountain and Final Draft (.fdx), and exports industry-format PDF.</p>
    <p class="hint" style="margin:0">Courier Prime by Quote-Unquote Apps, SIL Open Font License. Built on the Novelcraft desktop framework (Rust + Tauri).</p>`;
  return modal({ title: 'About', body, buttons: [{ label: 'Close', primary: true }] });
}

export { projectNow };
