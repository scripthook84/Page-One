// Table read: plays the script aloud with the built-in voices, from the cursor on.
// The narrator reads scene headings, action and transitions; each character speaks their
// dialogue in the voice assigned to them (chosen automatically until the writer picks one).

import { S } from './state.js';
import { cueName } from './elements.js';
import * as engine from './voice/engine.js';

const $ = (s) => document.querySelector(s);
const textOf = (p) => (p.runs || []).map((r) => r.x).join('');

// ------------------------------------------------------------------ casting

const FEMALE = new Set('ANN ANNA ANNE AMY ALICE ALEX ANGELA BETH BETTY CARLA CAROL CLAIRE DANA DIANA DORIS ELLA ELLEN EMILY EMMA EVA EVE GRACE HANNAH HELEN IRIS JANE JEN JENNY JESS JILL JOAN JOY JUDY JULIA JUNE KAREN KATE KATHY KELLY LAURA LEAH LILY LINDA LISA LUCY MAGGIE MARIA MARIE MARY MAYA MEG MIA MOLLY MONICA NANCY NINA NORA OLIVIA PAM PAULA PEG RACHEL RITA ROSA ROSE RUTH SAM SARA SARAH SOPHIE SUE SUSAN TESS TINA VERA ZOE MOM MOTHER MA GRANDMA AUNT SISTER WOMAN GIRL LADY QUEEN WIFE NURSE WAITRESS'.split(' '));
const MALE = new Set('ADAM AL ALAN ANDY BEN BILL BOB BRAD CARL CHARLIE CHRIS DAN DAVE DAVID ED FRANK FRED GARY GEORGE GREG HANK HARRY JACK JAKE JAMES JASON JIM JOE JOHN JON JOSH KEN KEVIN LEO LEWIS LOU LUKE MARK MATT MAX MIKE NICK OTIS PAUL PETE PETER PHIL RAY RAYMOND RICK ROB ROGER RON SAUL SCOTT SETH STEVE TED TOM TONY WALT WILL DAD FATHER PA GRANDPA UNCLE BROTHER MAN BOY GUY KING HUSBAND COP DETECTIVE OFFICER SHERIFF PRIEST'.split(' '));
const CHILD = /\b(YOUNG|LITTLE|KID|CHILD|BOY|GIRL|TEEN|BABY|SON|DAUGHTER)\b/;

function guess(name) {
  const words = name.split(/\s+/);
  const child = CHILD.test(name);
  if (words.some((w) => FEMALE.has(w)) || /\bGIRL\b|\bDAUGHTER\b/.test(name)) return child ? 'c_girl' : 'female';
  if (words.some((w) => MALE.has(w)) || /\bBOY\b|\bSON\b/.test(name)) return child ? 'c_boy' : 'male';
  if (child) return /A$|E$|IE$/.test(words[words.length - 1]) ? 'c_girl' : 'c_boy';
  return /(A|IA|IE|INE|ELLE|ETTE|Y)$/.test(words[0]) ? 'female' : null;
}

/** Voice for each speaking character: the writer's choice, else a distinct automatic one. */
export function castVoices() {
  const chosen = new Map((S.project.characters || []).filter((c) => c.voice).map((c) => [c.name, c.voice]));
  const order = [];
  for (const p of S.editor.paras()) if (p.t === 'character') { const n = cueName(textOf(p)); if (n && !order.includes(n)) order.push(n); }
  const list = engine.voiceList();
  const narrator = S.project.settings.narrator_voice || 'narrator';
  const narratorStyle = (engine.voiceById(narrator) || {}).style;
  const pool = (g) => list.filter((v) => v.group === g && v.style !== narratorStyle).map((v) => v.id);
  const used = new Set(chosen.values());
  const next = { female: 0, male: 0 };
  const out = new Map();
  for (const name of order) {
    if (chosen.has(name)) { out.set(name, chosen.get(name)); continue; }
    let g = guess(name);
    if (g === 'c_girl' || g === 'c_boy') { out.set(name, g); continue; }
    if (!g) g = (next.female <= next.male) ? 'female' : 'male';
    const ids = pool(g);
    let pick = ids.find((id) => !used.has(id)) || ids[next[g] % Math.max(1, ids.length)];
    next[g]++;
    used.add(pick);
    out.set(name, pick);
  }
  return out;
}

// ------------------------------------------------------------------ the read

let ctx = null;
let queue = [];      // [{i, text, element, voice}]
let pos = 0;
let playing = false;
let paused = false;
let source = null;
const cache = new Map(); // index -> Promise<rendered>
let speakingEl = null;
let runId = 0;

function buildQueue(from) {
  const paras = S.editor.paras();
  const st = S.project.settings;
  const narrator = st.narrator_voice || 'narrator';
  const cast = castVoices();
  // the speaker in effect where the read starts
  let speaker = null;
  for (let k = from; k >= 0; k--) {
    if (paras[k].t === 'character') { speaker = cueName(textOf(paras[k])); break; }
    if (!['dialogue', 'paren', 'lyric'].includes(paras[k].t)) break;
  }
  const out = [];
  for (let i = from; i < paras.length; i++) {
    const p = paras[i];
    const text = textOf(p).trim();
    if (p.t === 'character') { speaker = cueName(text); continue; }
    if (!text || p.t === 'section' || p.t === 'note') continue;
    if (p.t === 'scene' && !st.read_headings) continue;
    if (p.t === 'paren' && !st.read_parens) continue;
    if (p.t === 'transition' && !st.read_transitions) continue;
    if (p.meta && p.meta.omitted) continue;
    const voice = (p.t === 'dialogue' || p.t === 'lyric') && speaker ? cast.get(speaker) || narrator : narrator;
    out.push({ i, text: p.t === 'paren' ? text.replace(/^\(|\)$/g, '') : text, element: p.t, voice, who: (p.t === 'dialogue' || p.t === 'lyric') ? speaker : 'Narrator' });
  }
  return out;
}

function renderAt(k) {
  if (!cache.has(k) && queue[k]) {
    const q = queue[k];
    cache.set(k, engine.render(q.text, q.element, q.voice, S.project.settings.read_speed || 1));
  }
  return cache.get(k);
}

function prefetch(k) { for (let j = k; j < Math.min(queue.length, k + 3); j++) renderAt(j); }

function highlight(i) {
  if (speakingEl) speakingEl.classList.remove('speaking');
  speakingEl = i == null ? null : S.editor.els()[i] || null;
  if (speakingEl) {
    speakingEl.classList.add('speaking');
    const r = speakingEl.getBoundingClientRect(), desk = $('#desk').getBoundingClientRect();
    if (r.top < desk.top + 40 || r.bottom > desk.bottom - 90) speakingEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function status(text) { const s = $('#plStatus'); if (s) s.textContent = text; }

function syncBar() {
  const bar = $('#player');
  bar.hidden = !playing && !paused;
  $('#plPlay').textContent = playing && !paused ? '❚❚' : '▶';
  $('#plPlay').setAttribute('aria-label', playing && !paused ? 'Pause' : 'Play');
  document.body.classList.toggle('reading', playing);
}

async function playFrom(k, run) {
  while (run === runId && k < queue.length) {
    pos = k;
    const q = queue[k];
    prefetch(k);
    let r;
    try {
      if (!cache.has(k) || !(await Promise.race([cache.get(k).then(() => true), new Promise((res) => setTimeout(() => res(false), 60))]))) status('Preparing the next line…');
      r = await renderAt(k);
    } catch (e) {
      status(String(e.message || e));
      stop(false);
      S.app.toast(`Playback stopped: ${e.message || e}`);
      return;
    }
    if (run !== runId) return;
    highlight(q.i);
    status(`${q.who}${S.layout ? ` · p. ${S.layout.para_page[q.i] || 1}` : ''}`);
    if (r.samples.length) {
      const buf = ctx.createBuffer(1, r.samples.length, r.rate);
      buf.copyToChannel(r.samples, 0);
      await new Promise((resolve) => {
        source = ctx.createBufferSource();
        source.buffer = buf;
        source.playbackRate.value = r.playbackRate;
        source.connect(ctx.destination);
        source.onended = resolve;
        source.start();
      });
      source = null;
    }
    cache.delete(k - 2);
    if (run !== runId) return;
    // a beat between lines, a longer one before a new scene
    const nextEl = queue[k + 1];
    await new Promise((res) => setTimeout(res, nextEl && nextEl.element === 'scene' ? 600 : q.element === 'scene' ? 350 : 220));
    k++;
  }
  if (run === runId) { stop(false); S.app.toast('End of the script.'); }
}

export async function play(fromPara) {
  if (!S.project) return;
  if (paused) { paused = false; await ctx.resume(); syncBar(); return; }
  if (playing) { paused = true; await ctx.suspend(); syncBar(); return; }
  const start = Math.max(0, fromPara ?? S.curPara ?? 0);
  const sp = $('#plSpeed');
  sp.value = [...sp.options].some((o) => +o.value === +(S.project.settings.read_speed || 1)) ? String(+(S.project.settings.read_speed || 1)) : '1';
  playing = true; paused = false;
  syncBar();
  status('Loading the voices… (a few seconds the first time)');
  try {
    await engine.ready();
  } catch (e) {
    playing = false; syncBar();
    S.app.toast(`Voices aren't available: ${e.message || e}`);
    return;
  }
  ctx = ctx || new AudioContext();
  await ctx.resume();
  queue = buildQueue(start);
  cache.clear();
  if (!queue.length) { stop(false); S.app.toast('Nothing to read from here.'); return; }
  playFrom(0, ++runId);
}

export function stop(clearHighlight = true) {
  runId++;
  playing = false; paused = false;
  if (source) { try { source.onended = null; source.stop(); } catch { /* already ended */ } source = null; }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  cache.clear();
  if (clearHighlight || true) highlight(null);
  syncBar();
}

function jump(d) {
  if (!playing) return;
  const k = Math.max(0, Math.min(queue.length - 1, pos + d));
  if (source) { try { source.onended = null; source.stop(); } catch { /* ended */ } source = null; }
  if (paused) { paused = false; ctx.resume(); }
  syncBar();
  playFrom(k, ++runId);
}

export function isPlaying() { return playing; }

/** Speak one sample line in a voice (for choosing voices). */
export async function preview(voiceId, line) {
  await engine.ready();
  ctx = ctx || new AudioContext();
  await ctx.resume();
  const r = await engine.render(line || 'This is how I sound reading your script.', 'dialogue', voiceId, S.project.settings.read_speed || 1);
  const buf = ctx.createBuffer(1, r.samples.length, r.rate);
  buf.copyToChannel(r.samples, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.playbackRate.value = r.playbackRate; src.connect(ctx.destination); src.start();
}

export function wire() {
  $('#plPlay').addEventListener('click', () => play());
  $('#plStop').addEventListener('click', () => stop());
  $('#plPrev').addEventListener('click', () => jump(-1));
  $('#plNext').addEventListener('click', () => jump(1));
  $('#plSpeed').addEventListener('change', (e) => { S.project.settings.read_speed = +e.target.value; S.app.markDirty(); cache.clear(); });
  $('#plVoices').addEventListener('click', () => S.app.voicesDialog());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && playing && !document.querySelector('.scrim')) stop(); });
}
