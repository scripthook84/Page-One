//! Production reports as an Excel workbook (.xlsx).
//!
//! The page assembles the report tables (it already knows the scenes, cast and locations); this
//! module lays them out the way production offices expect: a title block, a frozen header row
//! with filters, page lengths in eighths that still add up (stored as pages, shown as "1 3/8"),
//! totals as live formulas, and landscape print setup that repeats the header on every page.

use rust_xlsxwriter::{
    Color, DocProperties, Format, FormatAlign, FormatBorder, Formula, IgnoreError, Workbook as XlsxBook, Worksheet, XlsxError,
};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize, Debug, Default)]
#[serde(default)]
pub struct Workbook {
    /// Script title, used for the file properties and every sheet's title block.
    pub title: String,
    /// Second line under each sheet title, e.g. "Draft · Blue revision · exported 13 Oct 2026".
    pub subtitle: String,
    pub sheets: Vec<Sheet>,
}

#[derive(Deserialize, Debug, Default)]
#[serde(default)]
pub struct Sheet {
    pub name: String,
    pub heading: String,
    /// A note under the heading (what the sheet shows, how it was worked out).
    pub note: String,
    pub columns: Vec<Column>,
    pub rows: Vec<Vec<Value>>,
    pub totals: Option<Totals>,
    /// Columns kept in view when scrolling sideways.
    pub freeze_cols: u16,
    /// "table" (default), "summary" (label/value pairs) or "grid" (cast by scene).
    pub kind: String,
}

#[derive(Deserialize, Debug, Default)]
#[serde(default)]
pub struct Column {
    pub title: String,
    pub width: f64,
    /// text | wrap | int | eighths | center | mark
    pub kind: String,
    /// Header colour (hex), e.g. the breakdown colour for cast.
    pub accent: String,
}

#[derive(Deserialize, Debug, Default)]
#[serde(default)]
pub struct Totals {
    pub label: String,
    /// Columns that get a SUM formula.
    pub sum: Vec<usize>,
    /// Columns that get a COUNTA formula (e.g. how many scenes).
    pub count: Vec<usize>,
}

const HEAD_ROW: u32 = 3;

struct Styles {
    title: Format,
    sub: Format,
    note: Format,
    head: Format,
    text: Format,
    wrap: Format,
    int: Format,
    eighths: Format,
    center: Format,
    mark: Format,
    mark_soft: Format,
    total_label: Format,
    total_int: Format,
    total_eighths: Format,
    label: Format,
}

fn border(f: Format) -> Format {
    f.set_border(FormatBorder::Thin).set_border_color(Color::RGB(0xD5D9DE))
}

fn styles() -> Styles {
    let base = || border(Format::new().set_font_size(10).set_align(FormatAlign::Top));
    Styles {
        title: Format::new().set_bold().set_font_size(15),
        sub: Format::new().set_font_size(10).set_font_color(Color::RGB(0x5B6470)),
        note: Format::new().set_italic().set_font_size(9).set_font_color(Color::RGB(0x7A828C)),
        head: border(
            Format::new()
                .set_bold()
                .set_font_size(10)
                .set_font_color(Color::White)
                .set_background_color(Color::RGB(0x2F3640))
                .set_align(FormatAlign::VerticalCenter)
                .set_text_wrap(),
        ),
        text: base(),
        wrap: base().set_text_wrap(),
        int: base().set_align(FormatAlign::Right),
        // pages stored as a number of pages, shown in eighths: 0.375 -> "3/8", 1.25 -> "1 2/8"
        eighths: base().set_num_format("# ?/8").set_align(FormatAlign::Right),
        center: base().set_align(FormatAlign::Center),
        mark: base().set_align(FormatAlign::Center).set_bold().set_font_color(Color::RGB(0x9B1C1C)).set_background_color(Color::RGB(0xF8D7D5)),
        mark_soft: base().set_align(FormatAlign::Center).set_font_color(Color::RGB(0x5B6470)).set_background_color(Color::RGB(0xEEF0F3)),
        total_label: border(Format::new().set_bold().set_font_size(10).set_background_color(Color::RGB(0xEEF0F3))),
        total_int: border(Format::new().set_bold().set_font_size(10).set_background_color(Color::RGB(0xEEF0F3)).set_align(FormatAlign::Right)),
        total_eighths: border(
            Format::new().set_bold().set_font_size(10).set_background_color(Color::RGB(0xEEF0F3)).set_num_format("# ?/8").set_align(FormatAlign::Right),
        ),
        label: border(Format::new().set_bold().set_font_size(10).set_background_color(Color::RGB(0xF4F5F7))),
    }
}

fn hex(s: &str) -> Option<Color> {
    let h = s.trim_start_matches('#');
    u32::from_str_radix(h, 16).ok().filter(|_| h.len() == 6).map(Color::RGB)
}

/// Excel sheet names: at most 31 characters, none of []:*?/\ .
fn sheet_name(s: &str) -> String {
    let clean: String = s.chars().map(|c| if "[]:*?/\\".contains(c) { '-' } else { c }).collect();
    let t: String = clean.trim().chars().take(31).collect();
    if t.is_empty() { "Sheet".into() } else { t }
}

fn col_letter(mut c: u16) -> String {
    let mut s = Vec::new();
    loop {
        s.push((b'A' + (c % 26) as u8) as char);
        if c < 26 {
            break;
        }
        c = c / 26 - 1;
    }
    s.iter().rev().collect()
}

/// About how many lines a text wraps to in a column of `width` characters (10 pt text).
fn wrapped_lines(text: &str, width: f64) -> usize {
    let per = (width * 1.05).max(4.0) as usize;
    text.split('\n')
        .map(|para| {
            let (mut lines, mut len) = (1usize, 0usize);
            for word in para.split_whitespace() {
                let w = word.chars().count();
                if len > 0 && len + 1 + w > per {
                    lines += 1;
                    len = w;
                } else {
                    len += if len > 0 { w + 1 } else { w };
                }
                while len > per {
                    lines += 1;
                    len -= per;
                }
            }
            lines
        })
        .sum::<usize>()
        .max(1)
}

fn write_value(ws: &mut Worksheet, r: u32, c: u16, v: &Value, kind: &str, st: &Styles) -> Result<(), XlsxError> {
    let fmt = match kind {
        "wrap" => &st.wrap,
        "int" => &st.int,
        "eighths" => &st.eighths,
        "center" => &st.center,
        "mark" => match v.as_str() {
            Some("") | None => &st.center,
            Some(m) if m.eq_ignore_ascii_case("x") => &st.mark,
            _ => &st.mark_soft,
        },
        _ => &st.text,
    };
    match v {
        Value::Number(n) => {
            ws.write_number_with_format(r, c, n.as_f64().unwrap_or(0.0), fmt)?;
        }
        Value::Null => {
            ws.write_blank(r, c, fmt)?;
        }
        Value::Bool(b) => {
            ws.write_string_with_format(r, c, if *b { "Yes" } else { "" }, fmt)?;
        }
        Value::String(s) if s.is_empty() => {
            ws.write_blank(r, c, fmt)?;
        }
        Value::String(s) => {
            ws.write_string_with_format(r, c, s, fmt)?;
        }
        other => {
            ws.write_string_with_format(r, c, other.to_string(), fmt)?;
        }
    }
    Ok(())
}

fn title_block(ws: &mut Worksheet, book: &Workbook, sheet: &Sheet, st: &Styles) -> Result<(), XlsxError> {
    let heading = if book.title.is_empty() { sheet.heading.clone() } else { format!("{} — {}", book.title, sheet.heading) };
    ws.write_string_with_format(0, 0, &heading, &st.title)?;
    ws.set_row_height(0, 22)?;
    ws.write_string_with_format(1, 0, &book.subtitle, &st.sub)?;
    if !sheet.note.is_empty() {
        ws.write_string_with_format(2, 0, &sheet.note, &st.note)?;
    }
    Ok(())
}

fn print_setup(ws: &mut Worksheet, book: &Workbook, sheet: &Sheet, last_col: u16) -> Result<(), XlsxError> {
    ws.set_landscape();
    ws.set_paper_size(1); // US Letter, the screenplay standard
    ws.set_margins(0.4, 0.4, 0.6, 0.6, 0.3, 0.3);
    // one page wide, as many tall as needed (the summary fits on one page)
    ws.set_print_fit_to_pages(1, if sheet.kind == "summary" { 1 } else { 0 });
    if sheet.kind != "summary" {
        ws.set_repeat_rows(HEAD_ROW, HEAD_ROW)?;
        ws.set_print_area(0, 0, HEAD_ROW + sheet.rows.len() as u32 + 1, last_col)?;
    }
    let title = book.title.replace('&', "&&");
    ws.set_header(&format!("&L&\"-,Bold\"{title}&R{}", sheet.heading.replace('&', "&&")));
    ws.set_footer("&LPage One&RPage &P of &N");
    Ok(())
}

fn write_table(ws: &mut Worksheet, book: &Workbook, sheet: &Sheet, st: &Styles) -> Result<(), XlsxError> {
    title_block(ws, book, sheet, st)?;
    let ncols = sheet.columns.len() as u16;
    if ncols == 0 {
        return Ok(());
    }
    for (c, col) in sheet.columns.iter().enumerate() {
        let c = c as u16;
        let mut head = match hex(&col.accent) {
            Some(color) => st.head.clone().set_background_color(color),
            None => st.head.clone(),
        };
        if matches!(col.kind.as_str(), "center" | "mark") {
            head = head.set_align(FormatAlign::Center);
        }
        ws.write_string_with_format(HEAD_ROW, c, &col.title, &head)?;
        ws.set_column_width(c, if col.width > 0.0 { col.width } else { 12.0 })?;
    }
    ws.set_row_height(HEAD_ROW, if sheet.kind == "grid" { 30 } else { 28 })?;
    for (i, row) in sheet.rows.iter().enumerate() {
        let r = HEAD_ROW + 1 + i as u32;
        let mut lines = 1usize;
        for (c, col) in sheet.columns.iter().enumerate() {
            let v = row.get(c).unwrap_or(&Value::Null);
            write_value(ws, r, c as u16, v, &col.kind, st)?;
            if col.kind == "wrap" {
                lines = lines.max(wrapped_lines(v.as_str().unwrap_or(""), if col.width > 0.0 { col.width } else { 12.0 }));
            }
        }
        // set the height of wrapped rows, so every spreadsheet app shows the whole text
        if lines > 1 {
            ws.set_row_height(r, 13.0 * lines as f64 + 2.0)?;
        }
    }
    let first = HEAD_ROW + 1;
    let last = HEAD_ROW + sheet.rows.len() as u32;
    if let Some(t) = &sheet.totals {
        if !sheet.rows.is_empty() {
            let r = last + 1;
            for c in 0..ncols {
                ws.write_blank(r, c, &st.total_label)?;
            }
            ws.write_string_with_format(r, 0, &t.label, &st.total_label)?;
            // live formulas, with the value already worked out so every app shows it before recalculating
            for &c in &t.sum {
                let cl = col_letter(c as u16);
                let f = if sheet.columns.get(c).map(|x| x.kind.as_str()) == Some("eighths") { &st.total_eighths } else { &st.total_int };
                let total: f64 = sheet.rows.iter().filter_map(|row| row.get(c).and_then(|v| v.as_f64())).sum();
                let formula = Formula::new(format!("=SUM({cl}{}:{cl}{})", first + 1, last + 1)).set_result(format!("{total}"));
                ws.write_formula_with_format(r, c as u16, formula, f)?;
            }
            for &c in &t.count {
                let cl = col_letter(c as u16);
                let n = sheet.rows.iter().filter(|row| row.get(c).is_some_and(|v| !v.is_null() && v.as_str() != Some(""))).count();
                let formula = Formula::new(format!("=COUNTA({cl}{}:{cl}{})", first + 1, last + 1)).set_result(format!("{n}"));
                ws.write_formula_with_format(r, c as u16, formula, &st.total_int)?;
            }
        }
    }
    // scene numbers are text on purpose ("12A"); don't flag them as numbers stored as text
    ws.ignore_error_range(HEAD_ROW, 0, last.max(HEAD_ROW) + 1, ncols - 1, IgnoreError::NumberStoredAsText)?;
    ws.set_freeze_panes(HEAD_ROW + 1, sheet.freeze_cols)?;
    if !sheet.rows.is_empty() && sheet.kind != "grid" {
        ws.autofilter(HEAD_ROW, 0, last, ncols - 1)?;
    }
    print_setup(ws, book, sheet, ncols - 1)
}

fn write_summary(ws: &mut Worksheet, book: &Workbook, sheet: &Sheet, st: &Styles) -> Result<(), XlsxError> {
    title_block(ws, book, sheet, st)?;
    ws.set_column_width(0, 30)?;
    ws.set_column_width(1, 44)?;
    let mut r = HEAD_ROW;
    for row in &sheet.rows {
        let label = row.first().and_then(|v| v.as_str()).unwrap_or("");
        let value = row.get(1).unwrap_or(&Value::Null);
        let kind = row.get(2).and_then(|v| v.as_str()).unwrap_or("text");
        if label.is_empty() && value.is_null() {
            r += 1; // a gap between groups
            continue;
        }
        if kind == "section" {
            ws.write_string_with_format(r, 0, label, &st.head)?;
            ws.write_blank(r, 1, &st.head)?;
        } else {
            ws.write_string_with_format(r, 0, label, &st.label)?;
            write_value(ws, r, 1, value, if kind == "int" || kind == "eighths" { kind } else { "text" }, st)?;
        }
        r += 1;
    }
    print_setup(ws, book, sheet, 1)
}

/// Build the workbook. Returns the .xlsx file's bytes.
pub fn write(book: &Workbook) -> Result<Vec<u8>, String> {
    let st = styles();
    let mut wb = XlsxBook::new();
    let props = DocProperties::new()
        .set_title(&book.title)
        .set_subject("Production reports")
        .set_comment("Made with Page One")
        .set_category("Screenplay reports");
    wb.set_properties(&props);
    let mut used = std::collections::HashSet::new();
    for sheet in &book.sheets {
        let ws = wb.add_worksheet();
        let mut name = sheet_name(&sheet.name);
        while !used.insert(name.to_lowercase()) {
            name = sheet_name(&format!("{} {}", name.chars().take(27).collect::<String>(), used.len()));
        }
        ws.set_name(&name).map_err(|e| e.to_string())?;
        let res = if sheet.kind == "summary" { write_summary(ws, book, sheet, &st) } else { write_table(ws, book, sheet, &st) };
        res.map_err(|e| format!("{}: {e}", sheet.name))?;
    }
    wb.save_to_buffer().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_a_workbook() {
        let book: Workbook = serde_json::from_value(serde_json::json!({
            "title": "The Last Page",
            "subtitle": "Draft · exported 13 Oct 2026",
            "sheets": [
                { "name": "Summary", "heading": "Summary", "kind": "summary",
                  "rows": [["Script", null, "section"], ["Pages", 3, "int"], ["", null], ["Scenes", 4, "int"]] },
                { "name": "Scene Report", "heading": "Scene report", "freeze_cols": 1,
                  "columns": [{"title": "Sc.", "width": 6, "kind": "center"}, {"title": "Set", "width": 30},
                              {"title": "Pgs", "width": 7, "kind": "eighths"}, {"title": "Cast", "accent": "#C0392B"}],
                  "rows": [["1", "DESERT HIGHWAY", 0.125, "JUNE"], ["2", "LAST PAGE BINDERY", 1.0, "OTIS, JUNE"]],
                  "totals": {"label": "2 scenes", "sum": [2]} },
                { "name": "Cast by Scene", "heading": "Cast by scene", "kind": "grid",
                  "columns": [{"title": "#"}, {"title": "1", "kind": "mark"}, {"title": "2", "kind": "mark"}],
                  "rows": [[1, "X", "•"]] }
            ]
        }))
        .unwrap();
        let bytes = write(&book).unwrap();
        assert_eq!(&bytes[..2], b"PK");
        assert!(bytes.len() > 4000);
        assert_eq!(wrapped_lines("short", 20.0), 1);
        assert_eq!(wrapped_lines(&"word ".repeat(40), 20.0), 10);
        assert_eq!(col_letter(0), "A");
        assert_eq!(col_letter(25), "Z");
        assert_eq!(col_letter(26), "AA");
        assert_eq!(sheet_name("Cast: by/scene [all] with a very long name indeed"), "Cast- by-scene -all- with a ver");
    }
}
