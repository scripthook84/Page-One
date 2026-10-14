// Page One desktop shell. All screenplay logic lives in `pageone-core`;
// this file wires it to native file dialogs, the window and the filesystem.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use pageone_core::{codec, fdx, fountain, layout, pdf, text, Project};

mod voice;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;

struct Launch(Mutex<Option<String>>);

/// Time of the last close request; a second request within 3 s always closes,
/// so the window can never get stuck if the page fails to answer.
static LAST_CLOSE: AtomicU64 = AtomicU64::new(0);

/// Set once the page has asked for its launch file; later files are sent as events.
static PAGE_READY: AtomicBool = AtomicBool::new(false);

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
        "pdf" | "board" | "outline" | "board+outline" => ("PDF", "pdf"),
        "fountain" => ("Fountain", "fountain"),
        "fdx" => ("Final Draft", "fdx"),
        "text" => ("Plain text", "txt"),
        "xlsx" => ("Excel workbook", "xlsx"),
        _ => ("Page One", "pageone"),
    };
    let clean: String = suggested
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '-' } else { c })
        .collect();
    let picked = app
        .dialog()
        .file()
        .set_title(match ext { "pageone" => "Save screenplay", "xlsx" => "Export reports", _ => "Export screenplay" })
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
fn export_file(path: String, kind: String, project: Project, watermark: String, only_rev: Option<u8>) -> Result<(), String> {
    let bytes = match kind.as_str() {
        "pdf" => pdf::render_pdf(
            &project,
            &pdf::PdfOptions { title_page: project.settings.title_page, watermark, rev_pages: project.settings.rev_pages, only_rev: only_rev.unwrap_or(0) },
        ),
        // story board and/or outline, landscape
        "board" | "outline" | "board+outline" => pageone_core::board_pdf::render_board_pdf(
            &project,
            pageone_core::board_pdf::BoardPrint { board: kind != "outline", outline: kind != "board" },
        ),
        "fountain" => fountain::export(&project).into_bytes(),
        "fdx" => fdx::export(&project).into_bytes(),
        "text" => text::export(&project).into_bytes(),
        other => return Err(format!("Unknown export format: {other}")),
    };
    std::fs::write(&path, bytes).map_err(|e| format!("Could not write {path}: {e}"))
}

/// Production reports as an Excel workbook (the page assembles the tables).
#[tauri::command]
fn export_xlsx(path: String, book: pageone_core::xlsx::Workbook) -> Result<(), String> {
    let bytes = pageone_core::xlsx::write(&book)?;
    std::fs::write(&path, bytes).map_err(|e| format!("Could not write {path}: {e}"))
}

#[tauri::command]
fn initial_file(state: State<Launch>) -> Option<String> {
    let mut g = state.0.lock().ok()?;
    PAGE_READY.store(true, Ordering::SeqCst);
    g.take()
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

/// Close or quit was asked for. The page asks "Save changes?" first and calls quit_app
/// when done; a second request within 3 s always quits, so nothing can get stuck.
/// Returns true when the caller should go ahead and close.
fn request_close(app: &tauri::AppHandle) -> bool {
    let now = pageone_core::now_secs();
    let last = LAST_CLOSE.swap(now, Ordering::SeqCst);
    if now.saturating_sub(last) <= 3 {
        return true;
    }
    match app.get_webview_window("main") {
        Some(w) => w.emit("close-requested", ()).is_err(),
        None => true,
    }
}

/// macOS menu bar. Edit holds Cut, Copy, Paste and Select All so the system's
/// clipboard keys reach the page; undo, formatting and the rest are handled by the page
/// itself. Quit goes through the page's "Save changes?" question.
#[cfg(target_os = "macos")]
fn mac_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
    let h = app.handle();
    let about = AboutMetadata {
        name: Some("Page One".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        copyright: Some("Apache License 2.0".into()),
        ..Default::default()
    };
    let app_menu = Submenu::with_items(
        h,
        "Page One",
        true,
        &[
            &PredefinedMenuItem::about(h, Some("About Page One"), Some(about))?,
            &PredefinedMenuItem::separator(h)?,
            &PredefinedMenuItem::services(h, None)?,
            &PredefinedMenuItem::separator(h)?,
            &PredefinedMenuItem::hide(h, Some("Hide Page One"))?,
            &PredefinedMenuItem::hide_others(h, None)?,
            &PredefinedMenuItem::show_all(h, None)?,
            &PredefinedMenuItem::separator(h)?,
            &MenuItem::with_id(h, "quit", "Quit Page One", true, Some("CmdOrCtrl+Q"))?,
        ],
    )?;
    let edit = Submenu::with_items(
        h,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::cut(h, None)?,
            &PredefinedMenuItem::copy(h, None)?,
            &PredefinedMenuItem::paste(h, None)?,
            &PredefinedMenuItem::select_all(h, None)?,
        ],
    )?;
    let window = Submenu::with_items(
        h,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(h, None)?,
            &PredefinedMenuItem::maximize(h, Some("Zoom"))?,
        ],
    )?;
    app.set_menu(Menu::with_items(h, &[&app_menu, &edit, &window])?)?;
    app.on_menu_event(|app, event| {
        if event.id() == "quit" && request_close(app) {
            app.exit(0);
        }
    });
    Ok(())
}

/// Absolute form of a path given on the command line. Windows' canonical form starts with
/// `\\?\` (e.g. `\\?\C:\Scripts\x.pageone`); drop that so paths read normally.
fn absolute(a: String) -> String {
    let Ok(p) = std::fs::canonicalize(&a) else { return a };
    let s = p.to_string_lossy().into_owned();
    match s.strip_prefix(r"\\?\") {
        Some(rest) if rest.starts_with(r"UNC\") => format!(r"\\{}", &rest[4..]),
        Some(rest) => rest.to_string(),
        None => s,
    }
}

fn main() {
    let launch = std::env::args().skip(1).find(|a| !a.starts_with('-')).map(absolute);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Launch(Mutex::new(launch)))
        .manage(voice::VoiceState::default())
        .setup(|app| {
            enable_spellcheck(app);
            #[cfg(target_os = "macos")]
            mac_menu(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            layout,
            pick_open,
            pick_save,
            export_xlsx,
            load_file,
            import_text,
            save_file,
            export_file,
            initial_file,
            quit_app,
            voice::voice_init,
            voice::voice_synth,
            voice::voice_lexicon
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !request_close(window.app_handle()) {
                    // the page asks "Save changes?" first and calls quit_app when done
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while starting Page One")
        .run(|_app, _event| {
            // macOS hands over files double-clicked in Finder as an event, not on the command line
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                for path in urls.iter().filter_map(|u| u.to_file_path().ok()) {
                    let path = path.to_string_lossy().into_owned();
                    // before the page has asked for its first file, it picks this up from Launch
                    let launch = _app.state::<Launch>();
                    let mut pending = launch.0.lock().unwrap();
                    if !PAGE_READY.load(Ordering::SeqCst) {
                        *pending = Some(path);
                    } else {
                        drop(pending);
                        let _ = _app.emit("open-file", path);
                    }
                }
            }
        });
}
