// Page One desktop shell. All screenplay logic lives in `pageone-core`;
// this file wires it to native file dialogs, the window and the filesystem.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pageone_core::{codec, fdx, fountain, layout, pdf, text, Project};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;

struct Launch(Mutex<Option<String>>);

/// Time of the last close request; a second request within 3 s always closes,
/// so the window can never get stuck if the page fails to answer.
static LAST_CLOSE: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
fn layout(project: Project) -> layout::Layout {
    layout::layout(&project)
}

#[tauri::command]
async fn pick_open(app: tauri::AppHandle, kind: String) -> Option<String> {
    let _ = kind;
    let picked = app
        .dialog()
        .file()
        .set_title("Open a screenplay")
        .add_filter("Screenplays", &["pageone", "fountain", "fdx", "spmd", "txt"])
        .add_filter("Page One", &["pageone"])
        .add_filter("Fountain", &["fountain", "spmd", "txt"])
        .add_filter("Final Draft", &["fdx"])
        .blocking_pick_file()?;
    picked.into_path().ok().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
async fn pick_save(app: tauri::AppHandle, kind: String, suggested: String) -> Option<String> {
    let (label, ext) = match kind.as_str() {
        "pdf" => ("PDF", "pdf"),
        "fountain" => ("Fountain", "fountain"),
        "fdx" => ("Final Draft", "fdx"),
        "text" => ("Plain text", "txt"),
        _ => ("Page One", "pageone"),
    };
    let clean: String = suggested
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '-' } else { c })
        .collect();
    let picked = app
        .dialog()
        .file()
        .set_title(if ext == "pageone" { "Save screenplay" } else { "Export screenplay" })
        .set_file_name(format!("{clean}.{ext}"))
        .add_filter(label, &[ext])
        .blocking_save_file()?;
    picked.into_path().ok().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn load_file(path: String) -> Result<Project, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read {path}: {e}"))?;
    pageone_core::import_any(&path, &bytes)
}

#[tauri::command]
fn import_text(text: String) -> Project {
    fountain::import(&text)
}

/// Keep the last 20 versions of each script in the app's data folder.
fn backup_previous(app: &tauri::AppHandle, path: &Path) {
    if !path.exists() {
        return;
    }
    let Ok(dir) = app.path().app_data_dir() else { return };
    let dir = dir.join("backups");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("script").to_string();
    let stamp = pageone_core::now_secs();
    let _ = std::fs::copy(path, dir.join(format!("{stem}.{stamp}.pageone")));
    if let Ok(rd) = std::fs::read_dir(&dir) {
        let mut mine: Vec<PathBuf> = rd
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with(&format!("{stem}.")) && n.ends_with(".pageone"))
                    .unwrap_or(false)
            })
            .collect();
        mine.sort();
        while mine.len() > 20 {
            let _ = std::fs::remove_file(mine.remove(0));
        }
    }
}

#[tauri::command]
fn save_file(app: tauri::AppHandle, path: String, project: Project) -> Result<(), String> {
    let p = PathBuf::from(&path);
    backup_previous(&app, &p);
    codec::save_to_path(&project, &p).map_err(|e| format!("Could not save {path}: {e}"))
}

#[tauri::command]
fn export_file(path: String, kind: String, project: Project, watermark: String) -> Result<(), String> {
    let bytes = match kind.as_str() {
        "pdf" => pdf::render_pdf(&project, &pdf::PdfOptions { title_page: project.settings.title_page, watermark }),
        "fountain" => fountain::export(&project).into_bytes(),
        "fdx" => fdx::export(&project).into_bytes(),
        "text" => text::export(&project).into_bytes(),
        other => return Err(format!("Unknown export format: {other}")),
    };
    std::fs::write(&path, bytes).map_err(|e| format!("Could not write {path}: {e}"))
}

#[tauri::command]
fn initial_file(state: State<Launch>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// WebKitGTK ships with spell checking off; turn it on for the writer's language.
#[cfg(target_os = "linux")]
fn enable_spellcheck(app: &tauri::App) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.with_webview(|wv| {
            use webkit2gtk::{WebContextExt, WebViewExt};
            if let Some(ctx) = wv.inner().context() {
                let lang = std::env::var("LANG")
                    .ok()
                    .and_then(|l| l.split('.').next().map(|s| s.to_string()))
                    .filter(|s| !s.is_empty() && s != "C" && s != "POSIX")
                    .unwrap_or_else(|| "en_US".into());
                ctx.set_spell_checking_enabled(true);
                ctx.set_spell_checking_languages(&[lang.as_str(), "en_US"]);
            }
        });
    }
}

#[cfg(not(target_os = "linux"))]
fn enable_spellcheck(_app: &tauri::App) {}

fn main() {
    let launch = std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .map(|a| std::fs::canonicalize(&a).map(|p| p.to_string_lossy().into_owned()).unwrap_or(a));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Launch(Mutex::new(launch)))
        .setup(|app| {
            enable_spellcheck(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            layout,
            pick_open,
            pick_save,
            load_file,
            import_text,
            save_file,
            export_file,
            initial_file,
            quit_app
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let now = pageone_core::now_secs();
                let last = LAST_CLOSE.swap(now, Ordering::SeqCst);
                if now.saturating_sub(last) <= 3 {
                    return; // asked twice: close
                }
                // Let the page ask "Save changes?" first; it calls quit_app when done.
                api.prevent_close();
                let _ = window.emit("close-requested", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Page One");
}
