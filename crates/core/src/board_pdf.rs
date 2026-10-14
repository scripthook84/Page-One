//! Printable story board and outline: a landscape PDF of the scene cards, laid out act by act in
//! story order, followed by an outline of acts, sequences, beats and scenes with their synopses.

use crate::layout::layout;
use crate::model::*;
use crate::pdf::{pdf_string, Writer, BOLD_F, ITALIC_F, REGULAR};

const W: f64 = 792.0; // US Letter, landscape
const H: f64 = 612.0;
const M: f64 = 36.0; // half-inch margins
const COLS: usize = 4;
const GAP: f64 = 12.0;
const CARD_H: f64 = 124.0;
const DEFAULT_ACT: &str = "#d5d9df";

#[derive(Clone, Copy, Debug)]
pub struct BoardPrint {
    pub board: bool,
    pub outline: bool,
}

type Rgb = (f64, f64, f64);

fn hex(c: &str, fallback: Rgb) -> Rgb {
    let c = c.trim().trim_start_matches('#');
    if c.len() != 6 {
        return fallback;
    }
    let v = |i: usize| u8::from_str_radix(&c[i..i + 2], 16).map(|x| x as f64 / 255.0);
    match (v(0), v(2), v(4)) {
        (Ok(r), Ok(g), Ok(b)) => (r, g, b),
        _ => fallback,
    }
}

/// `k` of the colour, the rest white.
fn tint((r, g, b): Rgb, k: f64) -> Rgb {
    (1.0 - k + r * k, 1.0 - k + g * k, 1.0 - k + b * k)
}

/// Word-wrap to `width` characters (the face is monospaced), at most `max` lines with an ellipsis.
fn wrap(text: &str, width: usize, max: usize) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut cur = String::new();
    for word in text.split_whitespace() {
        let mut word = word.to_string();
        while word.chars().count() > width {
            if !cur.is_empty() {
                lines.push(std::mem::take(&mut cur));
            }
            let head: String = word.chars().take(width).collect();
            lines.push(head);
            word = word.chars().skip(width).collect();
        }
        if cur.is_empty() {
            cur = word;
        } else if cur.chars().count() + 1 + word.chars().count() <= width {
            cur.push(' ');
            cur.push_str(&word);
        } else {
            lines.push(std::mem::replace(&mut cur, word));
        }
    }
    if !cur.is_empty() {
        lines.push(cur);
    }
    if lines.len() > max {
        lines.truncate(max);
        if let Some(last) = lines.last_mut() {
            let keep: String = last.chars().take(width.saturating_sub(1)).collect();
            *last = format!("{}…", keep.trim_end());
        }
    }
    lines
}

fn eighths(n: u32) -> String {
    let (whole, part) = (n / 8, n % 8);
    match (whole, part) {
        (0, p) => format!("{p}/8 pg"),
        (w, 0) => format!("{w} pg"),
        (w, p) => format!("{w} {p}/8 pg"),
    }
}

#[derive(Default)]
struct Ops(Vec<u8>);

impl Ops {
    fn fill(&mut self, x: f64, top: f64, w: f64, h: f64, c: Rgb) {
        self.0.extend_from_slice(
            format!(
                "{:.3} {:.3} {:.3} rg {x:.2} {:.2} {w:.2} {h:.2} re f\n",
                c.0,
                c.1,
                c.2,
                H - top - h
            )
            .as_bytes(),
        );
    }
    fn frame(&mut self, x: f64, top: f64, w: f64, h: f64, c: Rgb) {
        self.0.extend_from_slice(
            format!(
                "{:.3} {:.3} {:.3} RG 0.6 w {x:.2} {:.2} {w:.2} {h:.2} re S\n",
                c.0,
                c.1,
                c.2,
                H - top - h
            )
            .as_bytes(),
        );
    }
    /// Text with its baseline `base` points from the top of the page. font: 1 regular, 2 bold, 3 italic.
    fn text(&mut self, x: f64, base: f64, size: f64, font: u8, s: &str, c: Rgb) {
        if s.is_empty() {
            return;
        }
        self.0.extend_from_slice(
            format!(
                "{:.3} {:.3} {:.3} rg BT /F{font} {size} Tf {x:.2} {:.2} Td ",
                c.0,
                c.1,
                c.2,
                H - base
            )
            .as_bytes(),
        );
        self.0.extend_from_slice(&pdf_string(s));
        self.0.extend_from_slice(b" Tj ET\n");
    }
    fn text_right(&mut self, right: f64, base: f64, size: f64, font: u8, s: &str, c: Rgb) {
        let w = s.chars().count() as f64 * size * 0.6;
        self.text(right - w, base, size, font, s, c);
    }
}

const INK: Rgb = (0.09, 0.10, 0.12);
const MUTED: Rgb = (0.40, 0.42, 0.47);
const LINE: Rgb = (0.70, 0.72, 0.76);

/// One scene as it appears on a card and in the outline.
struct Card {
    num: String,
    heading: String,
    synopsis: String,
    color: String,
    page: u32,
    eighths: u32,
    labels: Vec<(u8, String)>,
}

struct Group {
    act: Option<(usize, String, String)>, // number, name, colour
    cards: Vec<Card>,
}

fn collect(p: &Project) -> Vec<Group> {
    let lay = layout(p);
    let nums = crate::layout::scene_numbers_for(p);
    let info: std::collections::HashMap<usize, (u32, u32)> = lay
        .scenes
        .iter()
        .map(|s| (s.para, (s.page, s.eighths)))
        .collect();
    let mut groups = vec![Group {
        act: None,
        cards: Vec::new(),
    }];
    let mut pending: Vec<(u8, String)> = Vec::new();
    let mut acts = 0;
    for (i, para) in p.paras.iter().enumerate() {
        match para.t {
            Elem::Section if para.lvl <= 1 => {
                acts += 1;
                let color = para
                    .meta
                    .as_ref()
                    .map(|m| m.color.clone())
                    .filter(|c| !c.is_empty())
                    .unwrap_or_else(|| DEFAULT_ACT.into());
                groups.push(Group {
                    act: Some((acts, para.text().trim().to_string(), color)),
                    cards: Vec::new(),
                });
            }
            Elem::Section => pending.push((para.lvl, para.text().trim().to_string())),
            Elem::Scene => {
                let m = para.meta.clone().unwrap_or_default();
                // no synopsis yet: the scene's opening action stands in for it
                let synopsis = if !m.synopsis.trim().is_empty() {
                    m.synopsis.trim().to_string()
                } else {
                    p.paras[i + 1..]
                        .iter()
                        .take_while(|q| q.t != Elem::Scene && !(q.t == Elem::Section && q.lvl <= 1))
                        .find(|q| q.t == Elem::Action && !q.text().trim().is_empty())
                        .map(|q| q.text().trim().to_string())
                        .unwrap_or_default()
                };
                let (page, eighths) = info.get(&i).copied().unwrap_or((1, 0));
                groups.last_mut().unwrap().cards.push(Card {
                    num: nums[i].clone().unwrap_or_default(),
                    heading: if m.omitted {
                        "OMITTED".into()
                    } else {
                        para.text().trim().to_uppercase()
                    },
                    synopsis,
                    color: m.color.clone(),
                    page,
                    eighths,
                    labels: std::mem::take(&mut pending),
                });
            }
            _ => {}
        }
    }
    groups.retain(|g| g.act.is_some() || !g.cards.is_empty());
    groups
}

struct Pages {
    pages: Vec<Ops>,
    y: f64,
    title: String,
    kind: &'static str,
}

impl Pages {
    fn new_page(&mut self) {
        let mut o = Ops::default();
        o.text(M, M + 10.0, 13.0, 2, &self.title, INK);
        o.text_right(W - M, M + 10.0, 8.5, 1, self.kind, MUTED);
        o.fill(M, M + 18.0, W - 2.0 * M, 0.8, LINE);
        self.pages.push(o);
        self.y = M + 32.0;
    }
    fn cur(&mut self) -> &mut Ops {
        self.pages.last_mut().unwrap()
    }
    fn room(&mut self, need: f64) {
        if self.pages.is_empty() || self.y + need > H - M {
            self.new_page();
        }
    }
}

fn act_banner(pg: &mut Pages, act: &(usize, String, String), cont: bool) {
    let c = hex(&act.2, hex(DEFAULT_ACT, (0.8, 0.8, 0.8)));
    let y = pg.y;
    pg.cur().fill(M, y, W - 2.0 * M, 22.0, tint(c, 0.85));
    let label = format!(
        "ACT {}   {}{}",
        act.0,
        act.1.to_uppercase(),
        if cont { "  (continued)" } else { "" }
    );
    pg.cur().text(M + 9.0, y + 15.0, 10.0, 2, &label, INK);
    pg.y += 30.0;
}

fn draw_board(pg: &mut Pages, groups: &[Group]) {
    let card_w = (W - 2.0 * M - GAP * (COLS as f64 - 1.0)) / COLS as f64;
    let chars = ((card_w - 16.0) / (8.0 * 0.6)) as usize;
    let head_chars = ((card_w - 16.0) / (8.5 * 0.6)) as usize;
    for g in groups {
        pg.room(30.0 + CARD_H);
        if let Some(a) = &g.act {
            act_banner(pg, a, false);
        }
        let fill = g
            .act
            .as_ref()
            .map(|a| tint(hex(&a.2, (0.85, 0.86, 0.88)), 0.35))
            .unwrap_or((0.97, 0.97, 0.98));
        for row in g.cards.chunks(COLS) {
            if pg.y + CARD_H > H - M {
                pg.new_page();
                if let Some(a) = &g.act {
                    act_banner(pg, a, true);
                }
            }
            let top = pg.y;
            for (k, c) in row.iter().enumerate() {
                let x = M + k as f64 * (card_w + GAP);
                let o = pg.cur();
                o.fill(x, top, card_w, CARD_H, fill);
                if !c.color.is_empty() {
                    o.fill(x, top, card_w, 5.0, hex(&c.color, LINE));
                }
                o.frame(x, top, card_w, CARD_H, LINE);
                let mut base = top + 17.0;
                let head = if c.num.is_empty() {
                    c.heading.clone()
                } else {
                    format!("{}  {}", c.num, c.heading)
                };
                for l in wrap(&head, head_chars, 2) {
                    o.text(x + 8.0, base, 8.5, 2, &l, INK);
                    base += 10.5;
                }
                for (lvl, name) in c.labels.iter().take(2) {
                    let tag = format!("{} {}", if *lvl == 2 { "Sequence:" } else { "Beat:" }, name);
                    for l in wrap(&tag, chars, 1) {
                        o.text(x + 8.0, base, 7.5, 3, &l, MUTED);
                    }
                    base += 9.5;
                }
                base += 3.0;
                let room = ((top + CARD_H - 18.0 - base) / 10.0).floor().max(0.0) as usize + 1;
                for l in wrap(&c.synopsis, chars, room) {
                    o.text(x + 8.0, base, 8.0, 1, &l, INK);
                    base += 10.0;
                }
                o.text(
                    x + 8.0,
                    top + CARD_H - 7.0,
                    7.0,
                    1,
                    &format!("p. {}", c.page),
                    MUTED,
                );
                o.text_right(
                    x + card_w - 8.0,
                    top + CARD_H - 7.0,
                    7.0,
                    1,
                    &eighths(c.eighths),
                    MUTED,
                );
            }
            pg.y += CARD_H + GAP;
        }
        pg.y += 6.0;
    }
}

fn draw_outline(pg: &mut Pages, groups: &[Group]) {
    let text_x = M + 58.0;
    let right = W - M;
    let syn_chars = ((right - 90.0 - text_x) / (9.0 * 0.6)) as usize;
    for g in groups {
        if let Some(a) = &g.act {
            pg.room(40.0);
            pg.y += 6.0;
            let y = pg.y;
            pg.cur().fill(M, y - 10.0, 12.0, 12.0, hex(&a.2, LINE));
            pg.cur().text(
                M + 20.0,
                y,
                12.0,
                2,
                &format!("ACT {}   {}", a.0, a.1.to_uppercase()),
                INK,
            );
            pg.y += 20.0;
        }
        for c in &g.cards {
            for (lvl, name) in &c.labels {
                pg.room(30.0);
                let y = pg.y;
                if *lvl == 2 {
                    pg.cur().text(M + 20.0, y, 10.0, 2, name, INK);
                } else {
                    pg.cur().text(M + 32.0, y, 10.0, 3, name, MUTED);
                }
                pg.y += 15.0;
            }
            let syn = wrap(&c.synopsis, syn_chars, 6);
            pg.room(14.0 + syn.len() as f64 * 11.0 + 6.0);
            let y = pg.y;
            let o = pg.cur();
            if !c.color.is_empty() {
                o.fill(M + 20.0, y - 8.0, 4.0, 10.0, hex(&c.color, LINE));
            }
            o.text_right(text_x - 8.0, y, 9.5, 2, &c.num, INK);
            for (k, l) in wrap(
                &c.heading,
                ((right - 100.0 - text_x) / (9.5 * 0.6)) as usize,
                2,
            )
            .iter()
            .enumerate()
            {
                o.text(text_x, y + k as f64 * 11.0, 9.5, 2, l, INK);
            }
            o.text_right(right - 62.0, y, 8.5, 1, &format!("p. {}", c.page), MUTED);
            o.text_right(right, y, 8.5, 1, &eighths(c.eighths), MUTED);
            pg.y += if c.heading.chars().count() > ((right - 100.0 - text_x) / (9.5 * 0.6)) as usize
            {
                25.0
            } else {
                14.0
            };
            for l in syn {
                let y = pg.y;
                pg.cur().text(text_x, y, 9.0, 1, &l, MUTED);
                pg.y += 11.0;
            }
            pg.y += 7.0;
        }
    }
}

pub fn render_board_pdf(project: &Project, what: BoardPrint) -> Vec<u8> {
    let groups = collect(project);
    let title = project
        .title_page
        .title
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    let title = if title.is_empty() {
        "Untitled".to_string()
    } else {
        title
    };
    let mut all: Vec<Ops> = Vec::new();
    if what.board || !what.outline {
        let mut pg = Pages {
            pages: Vec::new(),
            y: 0.0,
            title: title.clone(),
            kind: "Story board",
        };
        pg.new_page();
        draw_board(&mut pg, &groups);
        all.extend(pg.pages);
    }
    if what.outline {
        let mut pg = Pages {
            pages: Vec::new(),
            y: 0.0,
            title: title.clone(),
            kind: "Outline",
        };
        pg.new_page();
        draw_outline(&mut pg, &groups);
        all.extend(pg.pages);
    }
    let total = all.len();
    for (k, o) in all.iter_mut().enumerate() {
        o.text_right(
            W - M,
            H - M + 18.0,
            7.5,
            1,
            &format!("{} / {}", k + 1, total),
            MUTED,
        );
    }

    // ---- assemble
    let mut pdf = Writer::new();
    let catalog = pdf.reserve();
    let pages_id = pdf.reserve();
    let mut fonts = Vec::new();
    for (i, (name, data, flags)) in [
        ("CourierPrime", REGULAR, 33),
        ("CourierPrime-Bold", BOLD_F, 33),
        ("CourierPrime-Italic", ITALIC_F, 97),
    ]
    .into_iter()
    .enumerate()
    {
        let file = pdf.reserve();
        pdf.stream(file, &format!("/Length1 {}", data.len()), data);
        let desc = pdf.reserve();
        pdf.obj(
            desc,
            format!(
                "<< /Type /FontDescriptor /FontName /{name} /Flags {flags} /FontBBox [-371 -257 1568 892] /ItalicAngle {} /Ascent 781 /Descent -342 /CapHeight 580 /StemV 80 /FontFile2 {file} 0 R >>",
                if flags == 97 { -12 } else { 0 }
            )
            .as_bytes(),
        );
        let font = pdf.reserve();
        let widths = vec!["600"; 224].join(" ");
        pdf.obj(
            font,
            format!("<< /Type /Font /Subtype /TrueType /BaseFont /{name} /FirstChar 32 /LastChar 255 /Widths [{widths}] /Encoding /WinAnsiEncoding /FontDescriptor {desc} 0 R >>").as_bytes(),
        );
        fonts.push(format!("/F{} {font} 0 R", i + 1));
    }
    let res = pdf.reserve();
    pdf.obj(
        res,
        format!("<< /Font << {} >> >>", fonts.join(" ")).as_bytes(),
    );
    let mut kids = Vec::new();
    for o in all {
        let content = pdf.reserve();
        pdf.stream(content, "", &o.0);
        let page = pdf.reserve();
        pdf.obj(page, format!("<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {W} {H}] /Resources {res} 0 R /Contents {content} 0 R >>").as_bytes());
        kids.push(format!("{page} 0 R"));
    }
    pdf.obj(
        pages_id,
        format!(
            "<< /Type /Pages /Kids [{}] /Count {} >>",
            kids.join(" "),
            kids.len()
        )
        .as_bytes(),
    );
    pdf.obj(
        catalog,
        format!("<< /Type /Catalog /Pages {pages_id} 0 R >>").as_bytes(),
    );
    let info = pdf.reserve();
    let mut ib = b"<< /Producer (Page One) /Creator (Page One) /Title ".to_vec();
    ib.extend_from_slice(&pdf_string(&format!("{title} - story board and outline")));
    ib.extend_from_slice(b" >>");
    pdf.obj(info, &ib);
    let xref = pdf.buf.len();
    let n = pdf.offsets.len();
    pdf.buf
        .extend_from_slice(format!("xref\n0 {n}\n0000000000 65535 f \n").as_bytes());
    for off in pdf.offsets[1..].to_vec() {
        pdf.buf
            .extend_from_slice(format!("{off:010} 00000 n \n").as_bytes());
    }
    pdf.buf.extend_from_slice(format!("trailer\n<< /Size {n} /Root {catalog} 0 R /Info {info} 0 R >>\nstartxref\n{xref}\n%%EOF\n").as_bytes());
    pdf.buf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wraps_and_truncates() {
        assert_eq!(
            wrap("one two three four", 9, 5),
            vec!["one two", "three", "four"]
        );
        let w = wrap("one two three four five six", 9, 2);
        assert_eq!(w.len(), 2);
        assert!(w[1].ends_with('…'));
    }

    #[test]
    fn board_pdf_is_valid() {
        let mut p = Project::default();
        let mut act = Para::new(Elem::Section, "Setup");
        act.lvl = 1;
        let mut seq = Para::new(Elem::Section, "The heist");
        seq.lvl = 2;
        p.paras = vec![act, seq];
        for i in 0..14 {
            let mut s = Para::new(Elem::Scene, &format!("INT. ROOM {i} - DAY"));
            s.meta = Some(SceneMeta {
                synopsis: "Something happens here, briefly.".into(),
                color: "#b9e3a5".into(),
                ..Default::default()
            });
            p.paras.push(s);
            p.paras.push(Para::new(Elem::Action, "A line."));
        }
        let b = render_board_pdf(
            &p,
            BoardPrint {
                board: true,
                outline: true,
            },
        );
        let s = String::from_utf8_lossy(&b);
        assert!(s.starts_with("%PDF-1.4"));
        assert!(s.contains("/MediaBox [0 0 792 612]"));
        assert!(s.trim_end().ends_with("%%EOF"));
        // 14 cards at 4 per row need two board pages; the outline adds at least one more
        assert!(s.matches("/Type /Page ").count() >= 3);
    }
}
