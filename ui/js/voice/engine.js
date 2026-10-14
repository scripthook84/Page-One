// Built-in voices: one interface over two engines.
//  - Desktop app: the bundled ONNX Runtime runs the voice model natively (fast, multi-core).
//  - Browser preview: the same model runs in a Web Worker with ONNX Runtime Web.
// Text is turned into phonemes here (g2p.js); audio comes back as 24 kHz samples.

import { setLexicon, hasLexicon, speakable, phonemize, chunks } from './g2p.js';
import { VOCAB } from './vocab.js';

const T = window.__TAURI__;
const desktop = !!(T && T.core);
const RATE = 24000;

let voices = null;      // [{id, label, group, style, pitch}]
let loading = null;
let worker = null;
const pending = new Map();
let seq = 0;

function ids(ph) {
  const out = [];
  for (const ch of ph) { const v = VOCAB[ch]; if (v !== undefined) out.push(v); }
  return out;
}

async function loadLexicon() {
  if (hasLexicon()) return;
  let text;
  if (desktop) {
    const buf = await T.core.invoke('voice_lexicon');
    text = new TextDecoder().decode(buf instanceof ArrayBuffer ? buf : new Uint8Array(buf));
  } else {
    // stored gzipped next to the model
    const r = await fetch('voice/lexicon.json.gz');
    text = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
  }
  setLexicon(JSON.parse(text));
}

function workerCall(msg) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id });
  });
}

/** Load the voices (first call takes a few seconds). Resolves with the voice list. */
export function ready() {
  if (voices) return Promise.resolve(voices);
  if (loading) return loading;
  loading = (async () => {
    if (desktop) {
      const [meta] = await Promise.all([T.core.invoke('voice_init'), loadLexicon()]);
      voices = meta.voices;
    } else {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready' && pending.has(0)) { pending.get(0).resolve(m); pending.delete(0); return; }
        const p = pending.get(m.id);
        if (!p) { if (m.type === 'error' && pending.has(0)) { pending.get(0).reject(new Error(m.message)); pending.delete(0); } return; }
        pending.delete(m.id);
        if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
      };
      const init = new Promise((resolve, reject) => pending.set(0, { resolve, reject }));
      worker.postMessage({ type: 'init', base: new URL('../../voice/', import.meta.url).href, ortBase: new URL('../../vendor/ort/', import.meta.url).href });
      const [m] = await Promise.all([init, loadLexicon()]);
      voices = m.voices;
    }
    return voices;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

export function voiceList() { return voices || []; }
export function voiceById(id) { return (voices || []).find((v) => v.id === id) || null; }

async function synthChunk(ph, style, speed) {
  const tok = ids(ph);
  if (!tok.length) return new Float32Array(0);
  if (desktop) {
    const buf = await T.core.invoke('voice_synth', { ids: tok, style, speed });
    return new Float32Array(buf instanceof ArrayBuffer ? buf : new Uint8Array(buf).buffer);
  }
  const m = await workerCall({ type: 'synth', phonemes: ph, style, speed });
  return m.audio;
}

/**
 * Speak a line in a voice. Returns { samples: Float32Array, rate, playbackRate }.
 * Child voices are rendered slower and played back faster, which raises the pitch while
 * keeping a natural pace.
 */
export async function render(text, element, voiceId, speed = 1) {
  await ready();
  const v = voiceById(voiceId) || voices[0];
  const pitch = v.pitch || 1;
  const ph = phonemize(speakable(text, element));
  const parts = chunks(ph);
  const pieces = [];
  for (const c of parts) pieces.push(await synthChunk(c, v.style, Math.max(0.5, Math.min(2, speed / pitch))));
  // a short breath between pieces of a long line
  const gap = Math.round(RATE * 0.12);
  const total = pieces.reduce((n, p) => n + p.length, 0) + gap * Math.max(0, pieces.length - 1);
  const samples = new Float32Array(total);
  let at = 0;
  pieces.forEach((p, k) => { samples.set(p, at); at += p.length + (k < pieces.length - 1 ? gap : 0); });
  return { samples, rate: RATE, playbackRate: pitch };
}

export const isDesktopEngine = desktop;
