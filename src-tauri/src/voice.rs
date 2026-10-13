//! Built-in voices for table-read playback: the Kokoro-82M v1.0 model (Apache-2.0) run natively
//! with Microsoft's ONNX Runtime (MIT), both bundled with the app. Nothing leaves the computer.
//!
//! The page turns text into phoneme token ids (see ui/js/voice); this side turns token ids, a
//! voice style and a speed into 24 kHz audio.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;
use tauri::Manager;

const ROWS: usize = 510;
const DIM: usize = 256;

pub struct Engine {
    session: Session,
    order: Vec<String>,
    styles: Vec<u16>, // float16 bits, ROWS x DIM per voice style
}

#[derive(Default)]
pub struct VoiceState(pub Mutex<Option<Engine>>);

fn lib_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "onnxruntime.dll"
    } else if cfg!(target_os = "macos") {
        "libonnxruntime.dylib"
    } else {
        "libonnxruntime.so"
    }
}

/// Folder with the bundled voice files: the app's resources, or `src-tauri/voice` in development.
pub fn voice_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(r) = app.path().resource_dir() {
        candidates.push(r.join("voice"));
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("voice"));
    candidates.into_iter().find(|d| d.join("model.onnx").exists())
}

fn f16_to_f32(h: u16) -> f32 {
    let sign = if h & 0x8000 != 0 { -1.0 } else { 1.0 };
    let exp = ((h >> 10) & 0x1f) as i32;
    let frac = (h & 0x3ff) as f32;
    match exp {
        0 => sign * 2f32.powi(-14) * (frac / 1024.0),
        31 => {
            if frac == 0.0 {
                sign * f32::INFINITY
            } else {
                f32::NAN
            }
        }
        e => sign * 2f32.powi(e - 15) * (1.0 + frac / 1024.0),
    }
}

impl Engine {
    pub fn load(dir: &Path) -> Result<Engine, String> {
        let lib = dir.join(lib_name());
        ort::init_from(lib.to_string_lossy().to_string()).with_name("page-one").commit().map_err(|e| format!("Voice engine: {e}"))?;
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).clamp(2, 6) - 1;
        let session = Session::builder()
            .and_then(|b| b.with_optimization_level(GraphOptimizationLevel::Level3))
            .and_then(|b| b.with_intra_threads(threads))
            .and_then(|b| b.commit_from_file(dir.join("model.onnx")))
            .map_err(|e| format!("Voice model: {e}"))?;
        let meta: serde_json::Value = serde_json::from_slice(&std::fs::read(dir.join("voices.json")).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        let order = meta["order"].as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default();
        let bytes = std::fs::read(dir.join("voices.bin")).map_err(|e| e.to_string())?;
        let styles = bytes.chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect();
        Ok(Engine { session, order, styles })
    }

    /// Speak phoneme token ids (without padding) in a voice style; returns 24 kHz mono samples.
    pub fn synth(&self, ids: &[i64], style: &str, speed: f32) -> Result<Vec<f32>, String> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        if ids.len() > ROWS {
            return Err("Line too long to speak in one go".into());
        }
        let k = self.order.iter().position(|s| s == style).ok_or_else(|| format!("Unknown voice {style}"))?;
        let row = (k * ROWS + ids.len()) * DIM;
        let style_vec: Vec<f32> = self.styles[row..row + DIM].iter().map(|&h| f16_to_f32(h)).collect();
        let mut tokens = Vec::with_capacity(ids.len() + 2);
        tokens.push(0i64);
        tokens.extend_from_slice(ids);
        tokens.push(0);
        let n = tokens.len();
        let t_tokens = Tensor::from_array(([1usize, n], tokens.into_boxed_slice())).map_err(|e| e.to_string())?;
        let t_style = Tensor::from_array(([1usize, DIM], style_vec.into_boxed_slice())).map_err(|e| e.to_string())?;
        let t_speed = Tensor::from_array(([1usize], vec![speed].into_boxed_slice())).map_err(|e| e.to_string())?;
        let inputs = ort::inputs!["tokens" => t_tokens, "style" => t_style, "speed" => t_speed].map_err(|e| e.to_string())?;
        let out = self.session.run(inputs).map_err(|e| e.to_string())?;
        let (_, data) = out["audio"].try_extract_raw_tensor::<f32>().map_err(|e| e.to_string())?;
        Ok(data.to_vec())
    }
}

/// Load the engine (first call only) and return the voice list.
#[tauri::command]
pub async fn voice_init(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = voice_dir(&app).ok_or("The voice files aren't installed with this copy of Page One.")?;
    let state = app.state::<VoiceState>();
    let ready = state.0.lock().map(|g| g.is_some()).unwrap_or(false);
    if !ready {
        let d = dir.clone();
        let engine = tauri::async_runtime::spawn_blocking(move || Engine::load(&d)).await.map_err(|e| e.to_string())??;
        *state.0.lock().map_err(|e| e.to_string())? = Some(engine);
    }
    serde_json::from_slice(&std::fs::read(dir.join("voices.json")).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// Synthesize one line; the audio comes back as raw little-endian f32 samples at 24 kHz.
#[tauri::command]
pub async fn voice_synth(app: tauri::AppHandle, ids: Vec<i64>, style: String, speed: f32) -> Result<tauri::ipc::Response, String> {
    let handle = app.clone();
    let samples = tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<VoiceState>();
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        let engine = guard.as_ref().ok_or("Voices aren't loaded yet")?;
        engine.synth(&ids, &style, speed.clamp(0.5, 2.0))
    })
    .await
    .map_err(|e| e.to_string())??;
    let mut bytes = Vec::with_capacity(samples.len() * 4);
    for s in samples {
        bytes.extend_from_slice(&s.to_le_bytes());
    }
    Ok(tauri::ipc::Response::new(bytes))
}

/// The pronunciation dictionary for the page's phonemizer.
#[tauri::command]
pub async fn voice_lexicon(app: tauri::AppHandle) -> Result<tauri::ipc::Response, String> {
    let dir = voice_dir(&app).ok_or("The voice files aren't installed with this copy of Page One.")?;
    std::fs::read(dir.join("lexicon.json")).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs only where the voice files and the ONNX Runtime library sit in src-tauri/voice.
    #[test]
    fn speaks() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("voice");
        if !dir.join(lib_name()).exists() {
            eprintln!("voice files not present; skipped");
            return;
        }
        let e = Engine::load(&dir).unwrap();
        let ids: Vec<i64> = vec![50, 83, 54, 156, 57, 135, 16, 81, 102, 61, 16, 102, 68, 16, 123, 156, 43, 102, 54];
        let t = std::time::Instant::now();
        let a = e.synth(&ids, "af_heart", 1.0).unwrap();
        let secs = a.len() as f32 / 24000.0;
        eprintln!("{secs:.2}s of audio in {:?}", t.elapsed());
        assert!(secs > 0.5 && secs < 5.0);
        assert!(a.iter().any(|x| x.abs() > 0.01));
    }
}
