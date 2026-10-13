//! Development server: serves `ui/` and exposes the same core functions the desktop app
//! uses, over HTTP, so the interface can be developed and tested in an ordinary browser.
//! Run: cargo run -p pageone-core --features devserver -- ui 8787

use pageone_core::*;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let root = std::path::PathBuf::from(args.get(1).cloned().unwrap_or_else(|| "ui".into()));
    let port = args.get(2).cloned().unwrap_or_else(|| "8787".into());
    let server = std::sync::Arc::new(tiny_http::Server::http(format!("127.0.0.1:{port}")).expect("bind"));
    eprintln!("Page One dev server on http://127.0.0.1:{port}");
    let workers: Vec<_> = (0..6)
        .map(|_| {
            let server = server.clone();
            let root = root.clone();
            std::thread::spawn(move || serve(&server, &root))
        })
        .collect();
    for w in workers {
        let _ = w.join();
    }
}

fn serve(server: &tiny_http::Server, root: &std::path::Path) {
    while let Ok(mut req) = server.recv() {
        let url = req.url().to_string();
        let mut body = Vec::new();
        let _ = req.as_reader().read_to_end(&mut body);
        let json = |v: serde_json::Value| {
            tiny_http::Response::from_string(v.to_string())
                .with_header("Content-Type: application/json".parse::<tiny_http::Header>().unwrap())
        };
        let bytes_resp = |b: Vec<u8>, ct: &str| {
            tiny_http::Response::from_data(b).with_header(format!("Content-Type: {ct}").parse::<tiny_http::Header>().unwrap())
        };
        let parse = || serde_json::from_slice::<Project>(&body);
        let res = match url.as_str() {
            "/api/layout" => match parse() {
                Ok(p) => json(serde_json::to_value(layout::layout(&p)).unwrap()),
                Err(e) => json(serde_json::json!({ "error": e.to_string() })),
            },
            "/api/encode" => match parse() {
                Ok(p) => bytes_resp(codec::encode(&p), "application/octet-stream"),
                Err(e) => json(serde_json::json!({ "error": e.to_string() })),
            },
            u if u.starts_with("/api/board") => match parse() {
                Ok(p) => {
                    let what = pageone_core::board_pdf::BoardPrint { board: !u.contains("what=outline"), outline: u.contains("outline") };
                    bytes_resp(pageone_core::board_pdf::render_board_pdf(&p, what), "application/pdf")
                }
                Err(e) => json(serde_json::json!({ "error": e.to_string() })),
            },
            "/api/xlsx" => match serde_json::from_slice::<pageone_core::xlsx::Workbook>(&body) {
                Ok(b) => match pageone_core::xlsx::write(&b) {
                    Ok(bytes) => bytes_resp(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                    Err(e) => json(serde_json::json!({ "error": e })),
                },
                Err(e) => json(serde_json::json!({ "error": e.to_string() })),
            },
            "/api/pdf" => match parse() {
                Ok(p) => {
                    let opts = pdf::PdfOptions { title_page: p.settings.title_page, watermark: String::new(), rev_pages: p.settings.rev_pages };
                    bytes_resp(pdf::render_pdf(&p, &opts), "application/pdf")
                }
                Err(e) => json(serde_json::json!({ "error": e.to_string() })),
            },
            "/api/fountain" => match parse() {
                Ok(p) => bytes_resp(fountain::export(&p).into_bytes(), "text/plain; charset=utf-8"),
                Err(e) => json(serde_json::json!({ "error": e.to_string() })),
            },
            "/api/fdx" => match parse() {
                Ok(p) => bytes_resp(fdx::export(&p).into_bytes(), "application/xml"),
                Err(e) => json(serde_json::json!({ "error": e.to_string() })),
            },
            "/api/text" => match parse() {
                Ok(p) => bytes_resp(text::export(&p).into_bytes(), "text/plain; charset=utf-8"),
                Err(e) => json(serde_json::json!({ "error": e.to_string() })),
            },
            u if u.starts_with("/api/import") => {
                let name = u.split("name=").nth(1).unwrap_or("x.fountain").to_string();
                match import_any(&name, &body) {
                    Ok(p) => json(serde_json::to_value(p).unwrap()),
                    Err(e) => json(serde_json::json!({ "error": e })),
                }
            }
            _ => {
                let rel = url.split('?').next().unwrap().trim_start_matches('/');
                let rel = if rel.is_empty() { "index.html" } else { rel };
                // voice assets live beside the desktop shell (bundled as resources there)
                let path = match rel.strip_prefix("voice/") {
                    Some(v) => root.parent().unwrap_or(root).join("src-tauri").join("voice").join(v),
                    None => root.join(rel),
                };
                if rel.contains("..") {
                    tiny_http::Response::from_string("no").with_status_code(403)
                } else {
                    match std::fs::read(path) {
                        Ok(b) => {
                            let ct = match rel.rsplit('.').next().unwrap_or("") {
                                "html" => "text/html; charset=utf-8",
                                "js" | "mjs" => "text/javascript",
                                "wasm" => "application/wasm",
                                "json" => "application/json",
                                "css" => "text/css",
                                "ttf" => "font/ttf",
                                "png" => "image/png",
                                "svg" => "image/svg+xml",
                                _ => "application/octet-stream",
                            };
                            bytes_resp(b, ct)
                        }
                        Err(_) => tiny_http::Response::from_string("not found").with_status_code(404),
                    }
                }
            }
        };
        // cross-origin isolation, as in the desktop app, so the voice engine can use threads
        let res = res
            .with_header("Cross-Origin-Opener-Policy: same-origin".parse::<tiny_http::Header>().unwrap())
            .with_header("Cross-Origin-Embedder-Policy: require-corp".parse::<tiny_http::Header>().unwrap());
        let _ = req.respond(res);
    }
}
