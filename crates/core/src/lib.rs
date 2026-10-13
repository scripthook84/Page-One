//! Page One core: everything that is not UI.

pub mod codec;
pub mod fdx;
pub mod fountain;
pub mod layout;
pub mod model;
pub mod board_pdf;
pub mod xlsx;
pub mod pdf;
pub mod text;

pub use model::Project;

/// Import any supported foreign format, choosing by extension (or by sniffing content).
pub fn import_any(path_or_name: &str, bytes: &[u8]) -> Result<Project, String> {
    let lower = path_or_name.to_lowercase();
    if lower.ends_with(".pageone") || bytes.starts_with(codec::MAGIC) {
        return codec::decode(bytes).map_err(|e| e.to_string());
    }
    let text = String::from_utf8_lossy(bytes);
    if lower.ends_with(".fdx") || text.trim_start().starts_with("<?xml") && text.contains("<FinalDraft") {
        return fdx::import(&text);
    }
    // .fountain, .spmd, .txt — Fountain is a superset of plain screenplay text
    Ok(fountain::import(&text))
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
