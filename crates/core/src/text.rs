//! Plain-text export: the paginated script rendered in monospace with form feeds.

use crate::layout::{layout, COL_RIGHT};
use crate::model::*;

pub fn export(p: &Project) -> String {
    let lay = layout(p);
    let mut out = String::new();
    for (pi, page) in lay.pages.iter().enumerate() {
        if pi > 0 {
            out.push('\u{0c}');
            let num = format!("{}.", page.n);
            out.push_str(&" ".repeat(COL_RIGHT as usize - num.len() - 15));
            out.push_str(&num);
            out.push_str("\n\n");
        }
        let mut rows: Vec<String> = vec![String::new(); lay.lines_per_page];
        for l in &page.lines {
            let r = l.row as usize;
            if r >= rows.len() {
                rows.resize(r + 1, String::new());
            }
            let line = &mut rows[r];
            let col = l.col.saturating_sub(15) as usize;
            let cur = line.chars().count();
            if cur < col {
                line.push_str(&" ".repeat(col - cur));
            }
            for run in &l.runs {
                line.push_str(&run.x);
            }
        }
        while rows.last().map(|r| r.is_empty()).unwrap_or(false) {
            rows.pop();
        }
        for r in rows {
            out.push_str(r.trim_end());
            out.push('\n');
        }
    }
    out
}
