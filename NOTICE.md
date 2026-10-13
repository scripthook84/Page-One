# Third-party notices

Page One is distributed under the Apache License 2.0. It includes or bundles the following
third-party components, each under its own licence.

| Component | Use in Page One | Licence |
|---|---|---|
| Courier Prime (The Courier Prime Project Authors) | Screenplay font in the editor and PDFs | SIL Open Font License 1.1 (`crates/core/fonts/OFL.txt`) |
| Kokoro-82M v1.0 (hexgrad), ONNX export by thewh1teagle/kokoro-onnx | Built-in voice model and voice styles | Apache License 2.0 |
| misaki (hexgrad) | US English pronunciation dictionaries | Apache License 2.0 |
| CMU Pronouncing Dictionary (Carnegie Mellon University) | Pronunciations of names | BSD 2-Clause |
| ONNX Runtime 1.20.1 (Microsoft) | Runs the voice model in the desktop app | MIT |
| ONNX Runtime Web 1.20.1 (Microsoft) | Runs the voice model in the browser preview | MIT |
| ort (pyke.io) | Rust bindings to ONNX Runtime | MIT or Apache License 2.0 |
| Tauri (The Tauri Programme) | Desktop framework | MIT or Apache License 2.0 |

The voice files are assembled by `scripts/build_voice_assets.py` from the components above and
bundled with the installers; they are not stored in this repository.
