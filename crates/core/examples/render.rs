//! cargo run -p pageone-core --example render -- input.(fountain|fdx|pageone) out.pdf [out.pageone]
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let bytes = std::fs::read(&a[1]).unwrap();
    let mut p = pageone_core::import_any(&a[1], &bytes).unwrap();
    if std::env::var("SCENENUMS").is_ok() { p.settings.scene_numbers = true; }
    let opts = pageone_core::pdf::PdfOptions { title_page: true, watermark: String::new(), rev_pages: true };
    std::fs::write(&a[2], pageone_core::pdf::render_pdf(&p, &opts)).unwrap();
    if let Some(o) = a.get(3) { pageone_core::codec::save_to_path(&p, std::path::Path::new(o)).unwrap(); }
    let l = pageone_core::layout::layout(&p);
    println!("pages {} breaks {:?}", l.pages.len(), l.breaks);
}
