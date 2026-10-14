//! A small, dependency-light PDF writer for laid-out screenplay pages.
//! Embeds Courier Prime (SIL OFL) — a Courier 12 pt metric-compatible face —
//! so the PDF looks identical on every machine.

use crate::layout::{layout, Layout, Page, COL_RIGHT};
use crate::model::*;
use flate2::{write::ZlibEncoder, Compression};
use std::io::Write;

pub(crate) const REGULAR: &[u8] = include_bytes!("../fonts/CourierPrime-Regular.ttf");
pub(crate) const BOLD_F: &[u8] = include_bytes!("../fonts/CourierPrime-Bold.ttf");
pub(crate) const ITALIC_F: &[u8] = include_bytes!("../fonts/CourierPrime-Italic.ttf");
const BOLDITALIC_F: &[u8] = include_bytes!("../fonts/CourierPrime-BoldItalic.ttf");

/// 10 characters per inch.
const CELL_W: f64 = 7.2;
/// 6 lines per inch.
const LINE_H: f64 = 12.0;
/// Distance from the top of a line cell to the text baseline at 12 pt.
const BASELINE: f64 = 9.4;
const TOP_MARGIN: f64 = 72.0;

#[derive(Default, Clone)]
pub struct PdfOptions {
    pub title_page: bool,
    pub watermark: String,
    /// Print revised pages on their revision colour (solid page background).
    pub rev_pages: bool,
    /// Only the pages changed in this revision (its colour index), as production sends them out.
    /// 0 prints every page.
    pub only_rev: u8,
}

/// Revision paper colours in the standard order (index 0 = white), as RGB 0–1. Light enough that
/// black text prints legibly, like the coloured paper revision pages are issued on.
pub const REV_PAPER: [(f64, f64, f64); 9] = [
    (1.0, 1.0, 1.0),
    (0.780, 0.866, 1.000), // Blue
    (1.000, 0.835, 0.902), // Pink
    (1.000, 0.957, 0.659), // Yellow
    (0.800, 0.941, 0.784), // Green
    (0.957, 0.847, 0.522), // Goldenrod
    (0.945, 0.890, 0.741), // Buff
    (1.000, 0.808, 0.741), // Salmon
    (0.957, 0.698, 0.729), // Cherry
];

pub(crate) fn zip(data: &[u8]) -> Vec<u8> {
    let mut e = ZlibEncoder::new(Vec::new(), Compression::default());
    e.write_all(data).unwrap();
    e.finish().unwrap()
}

/// Map a char to Windows-1252 (WinAnsiEncoding).
fn winansi(c: char) -> u8 {
    let u = c as u32;
    if (0x20..0x7f).contains(&u) || (0xa0..=0xff).contains(&u) {
        return u as u8;
    }
    match c {
        '€' => 0x80,
        '‚' => 0x82,
        'ƒ' => 0x83,
        '„' => 0x84,
        '…' => 0x85,
        '†' => 0x86,
        '‡' => 0x87,
        'ˆ' => 0x88,
        '‰' => 0x89,
        'Š' => 0x8a,
        '‹' => 0x8b,
        'Œ' => 0x8c,
        'Ž' => 0x8e,
        '‘' => 0x91,
        '’' => 0x92,
        '“' => 0x93,
        '”' => 0x94,
        '•' => 0x95,
        '–' => 0x96,
        '—' => 0x97,
        '˜' => 0x98,
        '™' => 0x99,
        'š' => 0x9a,
        '›' => 0x9b,
        'œ' => 0x9c,
        'ž' => 0x9e,
        'Ÿ' => 0x9f,
        _ => b'?',
    }
}

pub(crate) fn pdf_string(s: &str) -> Vec<u8> {
    let mut out = vec![b'('];
    for c in s.chars() {
        let b = winansi(c);
        if b == b'(' || b == b')' || b == b'\\' {
            out.push(b'\\');
        }
        out.push(b);
    }
    out.push(b')');
    out
}

pub(crate) struct Writer {
    pub(crate) buf: Vec<u8>,
    pub(crate) offsets: Vec<usize>,
}

impl Writer {
    pub(crate) fn new() -> Self {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
        Writer {
            buf,
            offsets: vec![0],
        }
    }
    pub(crate) fn reserve(&mut self) -> usize {
        self.offsets.push(0);
        self.offsets.len() - 1
    }
    pub(crate) fn obj(&mut self, id: usize, body: &[u8]) {
        self.offsets[id] = self.buf.len();
        self.buf
            .extend_from_slice(format!("{id} 0 obj\n").as_bytes());
        self.buf.extend_from_slice(body);
        self.buf.extend_from_slice(b"\nendobj\n");
    }
    pub(crate) fn stream(&mut self, id: usize, dict_extra: &str, data: &[u8]) {
        let z = zip(data);
        let mut body = format!(
            "<< /Length {} /Filter /FlateDecode {} >>\nstream\n",
            z.len(),
            dict_extra
        )
        .into_bytes();
        body.extend_from_slice(&z);
        body.extend_from_slice(b"\nendstream");
        self.obj(id, &body);
    }
}

struct Canvas {
    ops: Vec<u8>,
    height: f64,
}

impl Canvas {
    fn text(&mut self, row: f64, col: f64, text: &str, style: u8) {
        if text.is_empty() {
            return;
        }
        let font = match style & (BOLD | ITALIC) {
            0 => "F1",
            BOLD => "F2",
            ITALIC => "F3",
            _ => "F4",
        };
        let x = col * CELL_W;
        let y = self.height - TOP_MARGIN - row * LINE_H - BASELINE;
        self.ops
            .extend_from_slice(format!("BT /{font} 12 Tf {x:.2} {y:.2} Td ").as_bytes());
        self.ops.extend_from_slice(&pdf_string(text));
        self.ops.extend_from_slice(b" Tj ET\n");
        if style & UNDERLINE != 0 {
            let w = text.chars().count() as f64 * CELL_W;
            self.ops.extend_from_slice(
                format!(
                    "0.6 w {x:.2} {:.2} m {:.2} {:.2} l S\n",
                    y - 1.6,
                    x + w,
                    y - 1.6
                )
                .as_bytes(),
            );
        }
    }
}

fn page_dims(size: &str) -> (f64, f64) {
    if size == "a4" {
        (595.28, 841.89)
    } else {
        (612.0, 792.0)
    }
}

fn title_page_ops(tp: &TitlePage, canvas: &mut Canvas) {
    let center = |canvas: &mut Canvas, row: f64, s: &str, style: u8| {
        let len = s.chars().count() as f64;
        let col = 15.0 + (60.0 - len).max(0.0) / 2.0;
        canvas.text(row, col, s, style);
    };
    // Title ~3.75" below the top margin, centred; byline and author two lines apart.
    let mut row = 22.0;
    for l in tp.title.lines().filter(|l| !l.trim().is_empty()) {
        center(canvas, row, &l.trim().to_uppercase(), 0);
        row += 1.0;
    }
    row += 1.0;
    if !tp.credit.trim().is_empty() {
        center(canvas, row, tp.credit.trim(), 0);
        row += 2.0;
    }
    for l in tp.author.lines().filter(|l| !l.trim().is_empty()) {
        center(canvas, row, l.trim(), 0);
        row += 1.0;
    }
    if !tp.source.trim().is_empty() {
        row += 2.0;
        for l in tp.source.lines() {
            center(canvas, row, l.trim(), 0);
            row += 1.0;
        }
    }
    // Contact bottom-left, ending on the last body line (1" bottom margin).
    let contact: Vec<&str> = tp.contact.lines().collect();
    let last_row = 53.0;
    let start = last_row - contact.len() as f64 + 1.0;
    for (i, l) in contact.iter().enumerate() {
        canvas.text(start + i as f64, 15.0, l, 0);
    }
    // Draft date / notes bottom-right.
    let mut right: Vec<String> = tp.notes.lines().map(|s| s.to_string()).collect();
    if !tp.draft.trim().is_empty() {
        right.push(tp.draft.trim().to_string());
    }
    let start = last_row - right.len() as f64 + 1.0;
    for (i, l) in right.iter().enumerate() {
        let col = COL_RIGHT as f64 - l.chars().count() as f64;
        canvas.text(start + i as f64, col, l, 0);
    }
}

fn body_page_ops(p: &Page, project: &Project, canvas: &mut Canvas) {
    let s = &project.settings;
    // Page number "2." flush right at 7.5", 0.5" from the top; none on page 1.
    // (with locked pages the number may be "12A" or a range such as "12-13")
    if p.label != "1" && !p.label.is_empty() {
        let num = format!("{}.", p.label);
        canvas.text(-3.0, COL_RIGHT as f64 - num.len() as f64, &num, 0);
    }
    if !s.header.trim().is_empty() {
        canvas.text(-3.0, 15.0, s.header.trim(), 0);
    }
    for l in &p.lines {
        let mut col = l.col as f64;
        for r in &l.runs {
            canvas.text(l.row as f64, col, &r.x, r.s);
            col += r.x.chars().count() as f64;
        }
        if let Some(n) = &l.scene_no {
            let len = n.chars().count() as f64;
            canvas.text(l.row as f64, 13.0 - len, n, 0);
            canvas.text(l.row as f64, 78.0, n, 0);
        }
        if l.star {
            canvas.text(l.row as f64, 76.5, "*", 0);
        }
    }
}

pub fn render_pdf(project: &Project, opts: &PdfOptions) -> Vec<u8> {
    let lay: Layout = layout(project);
    let (w, h) = page_dims(&project.settings.page_size);
    let mut pdf = Writer::new();
    let catalog = pdf.reserve();
    let pages_id = pdf.reserve();
    let info = pdf.reserve();

    // ---- fonts: embed only the faces this script uses (regular always)
    let mut used = [true, false, false, false];
    for p in &lay.pages {
        for l in &p.lines {
            for r in &l.runs {
                used[match r.s & (BOLD | ITALIC) {
                    0 => 0,
                    BOLD => 1,
                    ITALIC => 2,
                    _ => 3,
                }] = true;
            }
        }
    }
    if !opts.watermark.trim().is_empty() {
        used[1] = true;
    }
    let mut font_refs = Vec::new();
    for (i, (name, data, italic, bold)) in [
        ("CourierPrime", REGULAR, false, false),
        ("CourierPrime-Bold", BOLD_F, false, true),
        ("CourierPrime-Italic", ITALIC_F, true, false),
        ("CourierPrime-BoldItalic", BOLDITALIC_F, true, true),
    ]
    .into_iter()
    .enumerate()
    {
        if !used[i] {
            continue;
        }
        let file = pdf.reserve();
        pdf.stream(file, &format!("/Length1 {}", data.len()), data);
        let desc = pdf.reserve();
        let flags = 1 | 32 | if italic { 64 } else { 0 };
        pdf.obj(
            desc,
            format!(
                "<< /Type /FontDescriptor /FontName /{name} /Flags {flags} /FontBBox [-371 -257 1568 892] \
                 /ItalicAngle {} /Ascent 781 /Descent -342 /CapHeight 580 /StemV {} /FontFile2 {file} 0 R >>",
                if italic { -12 } else { 0 },
                if bold { 140 } else { 80 }
            )
            .as_bytes(),
        );
        let font = pdf.reserve();
        let widths = vec!["600"; 224].join(" ");
        pdf.obj(
            font,
            format!(
                "<< /Type /Font /Subtype /TrueType /BaseFont /{name} /FirstChar 32 /LastChar 255 \
                 /Widths [{widths}] /Encoding /WinAnsiEncoding /FontDescriptor {desc} 0 R >>"
            )
            .as_bytes(),
        );
        font_refs.push(format!("/F{} {font} 0 R", i + 1));
    }
    let res = pdf.reserve();
    pdf.obj(
        res,
        format!("<< /Font << {} >> >>", font_refs.join(" ")).as_bytes(),
    );

    // ---- pages
    let mut page_ids = Vec::new();
    let mut canvases = Vec::new();
    if opts.title_page && opts.only_rev == 0 && !project.title_page.title.trim().is_empty() {
        let mut c = Canvas {
            ops: Vec::new(),
            height: h,
        };
        title_page_ops(&project.title_page, &mut c);
        canvases.push(c);
    }
    for p in &lay.pages {
        if opts.only_rev > 0 && p.rev != opts.only_rev {
            continue;
        }
        let mut c = Canvas {
            ops: Vec::new(),
            height: h,
        };
        if opts.rev_pages && p.rev > 0 {
            // the whole page in its revision colour, under the text
            let (r, g, b) = REV_PAPER[(p.rev as usize).min(REV_PAPER.len() - 1)];
            c.ops.extend_from_slice(
                format!("q {r:.3} {g:.3} {b:.3} rg 0 0 {w:.2} {h:.2} re f Q\n").as_bytes(),
            );
        }
        body_page_ops(p, project, &mut c);
        canvases.push(c);
    }
    for mut c in canvases {
        if !opts.watermark.trim().is_empty() {
            let wm = opts.watermark.trim();
            let mut ops = format!(
                "q 0.85 g BT /F2 54 Tf 0.7071 0.7071 -0.7071 0.7071 {:.1} {:.1} Tm ",
                w / 2.0 - wm.chars().count() as f64 * 54.0 * 0.6 * 0.3536,
                h / 2.0 - wm.chars().count() as f64 * 54.0 * 0.6 * 0.3536
            )
            .into_bytes();
            ops.extend_from_slice(&pdf_string(wm));
            ops.extend_from_slice(b" Tj ET Q\n");
            ops.extend_from_slice(&c.ops);
            c.ops = ops;
        }
        let content = pdf.reserve();
        pdf.stream(content, "", &c.ops);
        let page = pdf.reserve();
        pdf.obj(
            page,
            format!(
                "<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {w} {h}] /Resources {res} 0 R /Contents {content} 0 R >>"
            )
            .as_bytes(),
        );
        page_ids.push(page);
    }
    let kids: Vec<String> = page_ids.iter().map(|i| format!("{i} 0 R")).collect();
    pdf.obj(
        pages_id,
        format!(
            "<< /Type /Pages /Kids [{}] /Count {} >>",
            kids.join(" "),
            page_ids.len()
        )
        .as_bytes(),
    );
    pdf.obj(
        catalog,
        format!("<< /Type /Catalog /Pages {pages_id} 0 R >>").as_bytes(),
    );
    let mut info_body = b"<< /Producer (Page One) /Creator (Page One) /Title ".to_vec();
    info_body.extend_from_slice(&pdf_string(
        project
            .title_page
            .title
            .lines()
            .next()
            .unwrap_or("Screenplay"),
    ));
    info_body.extend_from_slice(b" /Author ");
    info_body.extend_from_slice(&pdf_string(
        project.title_page.author.lines().next().unwrap_or(""),
    ));
    info_body.extend_from_slice(b" >>");
    pdf.obj(info, &info_body);

    // ---- xref
    let xref = pdf.buf.len();
    let n = pdf.offsets.len();
    pdf.buf
        .extend_from_slice(format!("xref\n0 {n}\n0000000000 65535 f \n").as_bytes());
    for off in &pdf.offsets[1..] {
        pdf.buf
            .extend_from_slice(format!("{off:010} 00000 n \n").as_bytes());
    }
    pdf.buf.extend_from_slice(
        format!("trailer\n<< /Size {n} /Root {catalog} 0 R /Info {info} 0 R >>\nstartxref\n{xref}\n%%EOF\n").as_bytes(),
    );
    pdf.buf
}
