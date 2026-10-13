// Table Read: plays the script aloud with the built-in voices, from the cursor on.
// The narrator reads scene headings, action and transitions; each character speaks their
// dialogue in the voice assigned to them (chosen automatically until the writer picks one).

import { S, savePrefs } from './state.js';
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

// ------------------------------------------------------------------ the room
// Every sound goes into `bus`, which feeds a dry path and a convolution reverb. Live mode turns
// the reverb up and spreads the cast a little left and right as if around a table. The waveform box reads the loudness straight from the line's samples,
// so it adds no work to the audio thread.

let ctx = null;
let bus, dry, wet;
let env = null;     // loudness of the line now playing, every 20 ms, for the waveform box

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A small, warm room: early reflections and a darkening tail of about 1.2 seconds. */
function roomImpulse(ac) {
  const sr = ac.sampleRate, len = Math.floor(sr * 1.6);
  const buf = ac.createBuffer(2, len, sr);
  const r = rng(7);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const k = 0.62 - 0.5 * Math.min(1, t / 1.2);      // the tail loses its highs as it dies
      lp += k * ((r() * 2 - 1) - lp);
      d[i] = lp * Math.exp(-5.6 * t) * Math.min(1, t / 0.008);
    }
    for (const [ms, a] of [[6, .55], [11, .42], [17, .34], [24, .27], [33, .2], [45, .14]]) {
      const at = Math.floor(sr * (ms + (ch ? 1.7 : 0)) / 1000);
      d[at] += (ch ^ (ms & 1) ? -a : a);
    }
  }
  return buf;
}

function audio() {
  if (!ctx) {
    // larger buffers: a busy computer never makes the read stutter
    ctx = new AudioContext({ latencyHint: 'playback' });
    const master = ctx.createGain(); master.connect(ctx.destination);
    dry = ctx.createGain(); dry.connect(master);
    const conv = ctx.createConvolver(); conv.buffer = roomImpulse(ctx);
    wet = ctx.createGain(); conv.connect(wet); wet.connect(master);
    bus = ctx.createGain(); bus.connect(dry); bus.connect(conv);
    applyLive(true);
  }
  return ctx;
}

const live = () => !!S.prefs.trLive;

function applyLive(now) {
  if (!ctx) return;
  const t = ctx.currentTime, tc = now ? 0.001 : 0.15;
  wet.gain.setTargetAtTime(live() ? 0.34 : 0, t, tc);
  dry.gain.setTargetAtTime(live() ? 0.9 : 1, t, tc);
}

/** Where each voice sits around the table in live mode: narrator centre, the cast spread out. */
function seat(who) {
  if (!live() || !who || who === 'Narrator') return 0;
  const k = castOrder.indexOf(who);
  if (k < 0) return 0;
  const spots = [-0.3, 0.3, -0.16, 0.16, -0.42, 0.42, -0.06, 0.06];
  return spots[k % spots.length];
}

function playBuffer(buf, rate = 1, pan = 0) {
  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(p).connect(bus);
    src.onended = () => { if (source === src) source = null; if (env && env.src === src) env = null; resolve(); };
    source = src;
    src.start();
    env = envelope(buf, rate, src);
  });
}

// ------------------------------------------------------------------ the waveform box

let raf = 0;
const levels = new Array(40).fill(0);
let level = 0;

function envelope(buf, rate, src) {
  const d = buf.getChannelData(0), hop = Math.round(buf.sampleRate * 0.02), out = new Float32Array(Math.ceil(d.length / hop));
  for (let k = 0; k < out.length; k++) {
    let sum = 0;
    const end = Math.min(d.length, (k + 1) * hop);
    for (let i = k * hop; i < end; i++) sum += d[i] * d[i];
    out[k] = Math.sqrt(sum / hop);
  }
  return { src, levels: out, t0: ctx.currentTime, step: 0.02 / rate };
}

function whoColor(who) {
  if (!who || who === 'Narrator') return '';
  const c = (S.project.characters || []).find((x) => x.name === who);
  return (c && c.color) || '';
}

function sizeWave() {
  const desk = $('#desk');
  desk.style.setProperty('--desk-h', `${desk.clientHeight}px`);
}

// a dozen frames a second, on a timer rather than every display frame: the read itself stays
// smooth on modest computers
const FRAME = 80;
let drawnQuiet = false;
let waveColor = '#c93b36';
function draw() {
  raf = 0;
  const box = $('#trWaveBox');
  if (box.hidden) return;
  const cv = $('#twCanvas'), g = cv.getContext('2d');
  if (ctx && !paused) {
    let rms = 0;
    if (env) { const k = Math.floor((ctx.currentTime - env.t0) / env.step); rms = k >= 0 && k < env.levels.length ? env.levels[k] : 0; }
    const target = playing ? Math.min(1, rms * 5.2) : 0;
    level += (target - level) * (target > level ? 0.75 : 0.4);
  }
  levels.push(level); levels.shift();
  if (levels.every((v) => v < 0.004) && drawnQuiet) { raf = setTimeout(draw, FRAME); return; }   // nothing new to show
  drawnQuiet = levels.every((v) => v < 0.004);
  if (cv.width !== Math.round(cv.clientWidth * devicePixelRatio)) { cv.width = Math.round(cv.clientWidth * devicePixelRatio); cv.height = Math.round(cv.clientHeight * devicePixelRatio); }
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const step = W / levels.length, bw = Math.max(3, step * 0.58), mid = H / 2;
  g.fillStyle = waveColor;
  for (let k = 0; k < levels.length; k++) {
    const v = levels[k];
    const h = Math.max(bw, v * (H - 16));
    g.globalAlpha = 0.25 + 0.75 * (k / levels.length);
    const x = k * step + (step - bw) / 2;
    if (g.roundRect) { g.beginPath(); g.roundRect(x, mid - h / 2, bw, h, bw / 2); g.fill(); } else g.fillRect(x, mid - h / 2, bw, h);
  }
  g.globalAlpha = 1;
  raf = setTimeout(draw, FRAME);
}

function showWave(on) {
  const box = $('#trWaveBox');
  box.hidden = !on;
  if (on) { sizeWave(); if (!raf) raf = setTimeout(draw, 0); }
  else if (raf) { clearTimeout(raf); raf = 0; }
}

function waveLine(q) {
  if (!q) return;
  const card = $('.tr-wave-card');
  const col = whoColor(q.who);
  if (col) card.style.setProperty('--who', col); else card.style.removeProperty('--who');
  waveColor = col || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || waveColor;
  $('#twWho').textContent = q.who === 'Narrator' ? 'Narrator' : q.who || 'Narrator';
  const page = S.layout && S.layout.para_page[q.i];
  $('#twWhere').textContent = `${page ? `Page ${page} · ` : ''}line ${pos + 1} of ${queue.length}`;
  $('#twLine').textContent = q.text;
}

// ------------------------------------------------------------------ the read

let queue = [];      // [{i, text, element, voice, who}]
let castOrder = [];
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
  castOrder = [...cast.keys()];
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
    const spoken = (p.t === 'dialogue' || p.t === 'lyric') && speaker;
    const voice = spoken ? cast.get(speaker) || narrator : narrator;
    out.push({ i, text: p.t === 'paren' ? text.replace(/^\(|\)$/g, '') : text, element: p.t, voice, who: spoken ? speaker : 'Narrator' });
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
    if (r.top < desk.top + 70 || r.bottom > desk.bottom - 60) speakingEl.scrollIntoView({ block: 'center', behavior: $('#trWaveBox').hidden ? 'smooth' : 'auto' });
  }
}

function status(text) { const s = $('#plStatus'); if (s) s.textContent = text; }

function syncBar() {
  const on = playing || paused;
  $('#trDock').classList.toggle('on', on);
  $('#trControls').hidden = !on;
  const icon = playing && !paused ? '❚❚' : '▶';
  const label = playing && !paused ? 'Pause' : 'Play';
  for (const id of ['#plPlay', '#twPlay']) { $(id).textContent = icon; $(id).setAttribute('aria-label', label); }
  $('#trLive').checked = live();
  $('#trWave').checked = !!S.prefs.trWave;
  showWave(on && !!S.prefs.trWave);
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
      stop();
      S.app.toast(`Table Read stopped: ${e.message || e}`);
      return;
    }
    if (run !== runId) return;
    const page = S.layout ? S.layout.para_page[q.i] || 1 : null;
    highlight(q.i);
    waveLine(q);
    status(`${q.who}${page ? ` · p. ${page}` : ''}`);
    if (r.samples.length) {
      const buf = ctx.createBuffer(1, r.samples.length, r.rate);
      buf.copyToChannel(r.samples, 0);
      await playBuffer(buf, r.playbackRate, seat(q.who));
    }
    cache.delete(k - 2);
    if (run !== runId) return;
    // a beat between lines, a longer one before a new scene
    const nextEl = queue[k + 1];
    await new Promise((res) => setTimeout(res, nextEl && nextEl.element === 'scene' ? 600 : q.element === 'scene' ? 350 : 220));
    k++;
  }
  if (run === runId) { stop(); S.app.toast('End of the script.'); }
}

/** Start reading from the cursor (or a paragraph); while reading, pause or resume. */
export async function play(fromPara) {
  if (!S.project) return;
  if (paused) { paused = false; await ctx.resume(); syncBar(); return; }
  if (playing) { paused = true; await ctx.suspend(); syncBar(); return; }
  const start = Math.max(0, fromPara ?? S.curPara ?? 0);
  const sp = $('#plSpeed');
  sp.value = [...sp.options].some((o) => +o.value === +(S.project.settings.read_speed || 1)) ? String(+(S.project.settings.read_speed || 1)) : '1';
  playing = true; paused = false;
  syncBar();
  status('Loading the voices…');
  try {
    await engine.ready();
  } catch (e) {
    playing = false; syncBar();
    S.app.toast(`Voices aren't available: ${e.message || e}`);
    return;
  }
  audio();
  await ctx.resume();
  queue = buildQueue(start);
  cache.clear();
  if (!queue.length) { stop(); S.app.toast('Nothing to read from here.'); return; }
  playFrom(0, ++runId);
}

export function stop() {
  runId++;
  playing = false; paused = false;
  if (source) { try { source.onended = null; source.stop(); } catch { /* already ended */ } source = null; }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  cache.clear();
  highlight(null);
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

export function setLive(on) {
  S.prefs.trLive = !!on; savePrefs();
  applyLive();
  syncBar();
}

export function setWave(on) {
  S.prefs.trWave = !!on; savePrefs();
  syncBar();
  if (on && queue[pos] && (playing || paused)) waveLine(queue[pos]);
}

/** Speak one sample line in a voice (for choosing voices). */
export async function preview(voiceId, line) {
  await engine.ready();
  audio();
  await ctx.resume();
  const r = await engine.render(line || 'This is how I sound reading your script.', 'dialogue', voiceId, S.project.settings.read_speed || 1);
  const buf = ctx.createBuffer(1, r.samples.length, r.rate);
  buf.copyToChannel(r.samples, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.playbackRate.value = r.playbackRate; src.connect(bus); src.start();
}

export function wire() {
  $('#trStart').addEventListener('click', () => play());
  for (const [a, b] of [['#plPlay', '#twPlay'], ['#plStop', '#twStop'], ['#plPrev', '#twPrev'], ['#plNext', '#twNext']]) {
    const fn = { '#plPlay': () => play(), '#plStop': () => stop(), '#plPrev': () => jump(-1), '#plNext': () => jump(1) }[a];
    $(a).addEventListener('click', fn);
    $(b).addEventListener('click', fn);
  }
  $('#plSpeed').addEventListener('change', (e) => { S.project.settings.read_speed = +e.target.value; S.app.markDirty(); cache.clear(); });
  $('#plVoices').addEventListener('click', () => S.app.voicesDialog());
  $('#trLive').addEventListener('change', (e) => setLive(e.target.checked));
  $('#trWave').addEventListener('change', (e) => setWave(e.target.checked));
  $('#twClose').addEventListener('click', () => setWave(false));
  window.addEventListener('resize', () => { if (!$('#trWaveBox').hidden) sizeWave(); });
  // keep the cursor where it was: pressing a dock button shouldn't move the start point
  $('#trDock').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (playing || paused) && !document.querySelector('.scrim')) stop(); });
  syncBar();
}
