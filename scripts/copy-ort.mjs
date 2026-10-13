// Copies the ONNX Runtime Web files the voice engine needs into ui/vendor/ort (MIT licence).
// Runs after `npm install`; the files are not kept in git.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const out = join(root, 'ui', 'vendor', 'ort');
if (!existsSync(src)) { console.log('onnxruntime-web not installed; skipping'); process.exit(0); }
mkdirSync(out, { recursive: true });
for (const f of ['ort.wasm.min.js', 'ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copyFileSync(join(src, f), join(out, f));
// ONNX Runtime Web is MIT licensed (Microsoft); its notice ships with the app in NOTICE.md
console.log('ONNX Runtime Web copied to ui/vendor/ort');
