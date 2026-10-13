// Voice engine worker: runs the Kokoro-82M model (Apache-2.0) with ONNX Runtime Web (MIT),
// entirely on this computer. Messages:
//   {type:'init', base, ortBase}                 -> {type:'ready', voices} | {type:'error', message}
//   {type:'synth', id, phonemes, style, speed}   -> {type:'audio', id, audio, rate} | {type:'error', id, message}
import * as ort from '../../vendor/ort/ort.wasm.min.mjs';
import { VOCAB } from './vocab.js';

let session = null;
let meta = null;
let styleBytes = null; // float16 voice styles
const styles = new Map();

function f16(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}

function styleOf(name) {
  if (styles.has(name)) return styles.get(name);
  const k = meta.order.indexOf(name);
  if (k < 0) throw new Error(`Unknown voice ${name}`);
  const n = meta.rows * meta.dim;
  const u16 = new Uint16Array(styleBytes, k * n * 2, n);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = f16(u16[i]);
  styles.set(name, out);
  return out;
}

async function init({ base, ortBase }) {
  ort.env.wasm.wasmPaths = ortBase;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  const [model, voices, info] = await Promise.all([
    fetch(base + 'model.onnx').then((r) => { if (!r.ok) throw new Error('Voice model missing'); return r.arrayBuffer(); }),
    fetch(base + 'voices.bin').then((r) => r.arrayBuffer()),
    fetch(base + 'voices.json').then((r) => r.json()),
  ]);
  meta = info;
  styleBytes = voices;
  session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  return { voices: info.voices, threads: ort.env.wasm.numThreads };
}

async function synth({ phonemes, style, speed }) {
  const ids = [];
  for (const ch of phonemes) { const v = VOCAB[ch]; if (v !== undefined) ids.push(v); }
  if (!ids.length) return new Float32Array(0);
  if (ids.length > 510) throw new Error('Line too long to speak in one go');
  const st = styleOf(style);
  const row = st.subarray(ids.length * meta.dim, (ids.length + 1) * meta.dim);
  const tokens = new ort.Tensor('int64', BigInt64Array.from([0, ...ids, 0].map(BigInt)), [1, ids.length + 2]);
  const out = await session.run({ tokens, style: new ort.Tensor('float32', Float32Array.from(row), [1, meta.dim]), speed: new ort.Tensor('float32', Float32Array.from([speed]), [1]) });
  return out.audio.data;
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') self.postMessage({ type: 'ready', ...(await init(m)) });
    else if (m.type === 'synth') {
      const t0 = performance.now();
      const audio = await synth(m);
      self.postMessage({ type: 'audio', id: m.id, audio, rate: 24000, ms: performance.now() - t0 }, [audio.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
};
