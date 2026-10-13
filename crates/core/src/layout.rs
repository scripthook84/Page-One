//! Pagination — the single source of truth for page breaks, used by the editor's page
//! markers, the page count, reports, PDF and text export.
//!
//! All positions are in character cells: Courier 12 pt is 10 characters per inch
//! horizontally and 6 lines per inch vertically. Column 0 is the physical left edge
//! of the paper, so column 15 = 1.5", column 75 = 7.5".
//!
//! Industry-standard screenplay metrics:
//!   page 8.5" × 11", top/bottom margin 1.0" → 54 lines of body per page
//!   Scene Heading / Action / Shot / General  1.5" – 7.5"
//!   Character                                3.7"
//!   Parenthetical                            3.1" – 5.25"
//!   Dialogue                                 2.5" – 6.0"
//!   Transition                               right-aligned, ending at 7.5"
//!   Page number "2." flush right at 7.5", 0.5" from the top, none on page 1

use crate::model::*;
use serde::Serialize;

pub const COL_LEFT: u16 = 15;
pub const COL_RIGHT: u16 = 75;
pub const LETTER_LINES: usize = 54;
pub const A4_LINES: usize = 58;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Align {
    Left,
    Right,
    Center,
}

#[derive(Clone, Copy, Debug)]
pub struct Geom {
    pub left: u16,
    pub width: u16,
    pub before: usize,
    pub align: Align,
    /// Extra indent for wrapped lines (parentheticals hang inside the bracket).
    pub hang: u16,
}

pub fn geometry(t: Elem, s: &Settings) -> Geom {
    let g = |left, width, before, align| Geom { left, width, before, align, hang: 0 };
    match t {
        Elem::Scene => g(15, 60, s.scene_space.clamp(1, 2) as usize, Align::Left),
        Elem::Action | Elem::General | Elem::Unknown => g(15, 60, 1, Align::Left),
        Elem::Shot => g(15, 60, 1, Align::Left),
        Elem::Character => g(37, 38, 1, Align::Left),
        Elem::Paren => Geom { left: 31, width: 21, before: 0, align: Align::Left, hang: 1 },
        Elem::Dialogue => g(25, 35, 0, Align::Left),
        Elem::Lyric => g(25, 35, 0, Align::Left),
        Elem::Transition => g(55, 20, 1, Align::Right),
        Elem::Centered => g(15, 60, 1, Align::Center),
        Elem::Section | Elem::Note => g(15, 60, 1, Align::Left),
    }
}

/// Dual-dialogue column geometry: (character col, paren col, paren width, dialogue col, dialogue width)
fn dual_geom(right: bool) -> (u16, u16, u16, u16, u16) {
    if right {
        (53, 47, 22, 45, 28)
    } else {
        (23, 18, 22, 15, 28)
    }
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct OutRun {
    pub x: String,
    pub s: u8,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Line {
    pub row: u16,
    pub col: u16,
    pub runs: Vec<OutRun>,
    /// Source paragraph, or -1 for generated text such as (MORE).
    pub para: i32,
    /// Scene number printed in both margins on the first line of a scene heading.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_no: Option<String>,
    /// Revised line (asterisk in the right margin).
    pub star: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Page {
    pub n: u32,
    pub lines: Vec<Line>,
    /// Latest revision colour of any change on this page (0 = unrevised). Revised pages are issued
    /// on that colour of paper.
    pub rev: u8,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct SceneInfo {
    pub para: usize,
    pub number: String,
    pub page: u32,
    /// Length in eighths of a page.
    pub eighths: u32,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Layout {
    pub pages: Vec<Page>,
    /// For each paragraph: the page its first line is on (non-printing: page of the next printable).
    pub para_page: Vec<u32>,
    /// Paragraph indices that begin a new page (editor page-break markers), index i → page i+2.
    pub breaks: Vec<usize>,
    pub scenes: Vec<SceneInfo>,
    pub lines_per_page: usize,
}

// ---------------------------------------------------------------- word wrapping

type SChar = (char, u8);

fn styled_chars(p: &Para, upper: bool) -> Vec<SChar> {
    let mut v = Vec::new();
    for r in &p.runs {
        for c in r.x.chars() {
            let c = if c == '\t' { ' ' } else { c };
            if upper {
                for u in c.to_uppercase() {
                    v.push((u, r.s));
                }
            } else {
                v.push((c, r.s));
            }
        }
    }
    v
}

/// Greedy word wrap of styled characters to `width` columns. Hard newlines are honoured.
pub fn wrap(chars: &[SChar], width: usize, hang: usize) -> Vec<Vec<SChar>> {
    let mut lines: Vec<Vec<SChar>> = Vec::new();
    for hard in chars.split(|c| c.0 == '\n') {
        let mut cur: Vec<SChar> = Vec::new();
        let mut i = 0;
        let w = |lines_so_far: usize, cur_empty_line: bool| {
            let _ = cur_empty_line;
            if lines_so_far == 0 { width } else { width.saturating_sub(hang).max(1) }
        };
        let start_count = lines.len();
        // split into words keeping following spaces
        let mut words: Vec<&[SChar]> = Vec::new();
        while i < hard.len() {
            let s = i;
            while i < hard.len() && hard[i].0 != ' ' {
                i += 1;
                // a hyphen inside a word is a break opportunity ("hand-|painted"), like the editor
                if hard[i - 1].0 == '-' && i < hard.len() && hard[i].0.is_alphanumeric() && i - s > 1 && hard[i - 2].0 != '-' {
                    break;
                }
            }
            while i < hard.len() && hard[i].0 == ' ' {
                i += 1;
            }
            words.push(&hard[s..i]);
        }
        for word in words {
            let limit = w(lines.len() - start_count, cur.is_empty());
            let trimmed_len = word.iter().rposition(|c| c.0 != ' ').map(|p| p + 1).unwrap_or(0);
            if cur.len() + trimmed_len > limit && !cur.is_empty() {
                while cur.last().map(|c| c.0 == ' ').unwrap_or(false) {
                    cur.pop();
                }
                lines.push(std::mem::take(&mut cur));
            }
            let mut word = word;
            // a single word longer than the line: hard break it
            loop {
                let limit = w(lines.len() - start_count, cur.is_empty());
                let wl = word.iter().rposition(|c| c.0 != ' ').map(|p| p + 1).unwrap_or(0);
                if cur.is_empty() && wl > limit {
                    lines.push(word[..limit].to_vec());
                    word = &word[limit..];
                } else {
                    break;
                }
            }
            cur.extend_from_slice(word);
        }
        while cur.last().map(|c| c.0 == ' ').unwrap_or(false) {
            cur.pop();
        }
        lines.push(cur);
    }
    if lines.is_empty() {
        lines.push(Vec::new());
    }
    lines
}

fn to_runs(chars: &[SChar], extra_style: u8) -> Vec<OutRun> {
    let mut out: Vec<OutRun> = Vec::new();
    for &(c, s) in chars {
        let s = s | extra_style;
        match out.last_mut() {
            Some(r) if r.s == s => r.x.push(c),
            _ => out.push(OutRun { x: c.to_string(), s }),
        }
    }
    out
}

fn plain(text: &str) -> Vec<OutRun> {
    vec![OutRun { x: text.to_string(), s: 0 }]
}

// ---------------------------------------------------------------- blocks

/// A laid-out line relative to its block, before it is placed on a page.
#[derive(Clone, Debug)]
struct BLine {
    col: u16,
    runs: Vec<OutRun>,
    para: i32,
    star: bool,
    scene_no: Option<String>,
    /// Dialogue lines may be split between; a split point is allowed *after* this line.
    sentence_end: bool,
}

#[derive(Clone, Debug)]
struct Block {
    #[allow(dead_code)]
    para: usize,
    t: Elem,
    before: usize,
    /// Rows, each possibly holding two lines (dual dialogue).
    rows: Vec<Vec<BLine>>,
    /// Keep this block on the same page as the next one.
    keep_next: bool,
    /// Lines of the block that may be split (action/dialogue) — whole otherwise.
    splittable: bool,
    /// For dialogue: the speaker's cue (for CONT'D after a page break).
    speaker: Option<String>,
}

fn line_text(l: &[SChar]) -> String {
    l.iter().map(|c| c.0).collect()
}

fn ends_sentence(l: &[SChar]) -> bool {
    let t = line_text(l);
    let t = t.trim_end().trim_end_matches(['"', '\'', ')', '’', '”']);
    t.ends_with('.') || t.ends_with('?') || t.ends_with('!') || t.ends_with("--") || t.ends_with('…')
}

fn place_line(g: &Geom, idx: usize, l: &[SChar]) -> u16 {
    let len = l.len() as u16;
    match g.align {
        Align::Left => g.left + if idx > 0 { g.hang } else { 0 },
        Align::Right => (g.left + g.width).saturating_sub(len).max(g.left.min(COL_LEFT)),
        Align::Center => g.left + g.width.saturating_sub(len) / 2,
    }
}

fn para_block_lines(
    p: &Para,
    idx: usize,
    s: &Settings,
    cont_suffix: bool,
    scene_no: Option<String>,
    geom_override: Option<Geom>,
) -> Vec<BLine> {
    let g = geom_override.unwrap_or_else(|| geometry(p.t, s));
    let mut chars = styled_chars(p, p.t.uppercase());
    if p.t == Elem::Paren {
        let t = line_text(&chars);
        let t = t.trim();
        if !t.starts_with('(') {
            chars.insert(0, ('(', 0));
        }
        if !t.ends_with(')') {
            chars.push((')', 0));
        }
    }
    if p.t == Elem::Character && cont_suffix {
        for c in " (CONT'D)".chars() {
            chars.push((c, 0));
        }
    }
    if p.t == Elem::Transition {
        // trim so right alignment is exact
        while chars.last().map(|c| c.0 == ' ').unwrap_or(false) {
            chars.pop();
        }
    }
    let extra = match p.t {
        Elem::Scene if s.bold_scenes => BOLD,
        Elem::Lyric => ITALIC,
        _ => 0,
    };
    let wrapped = wrap(&chars, g.width as usize, g.hang as usize);
    let n = wrapped.len();
    wrapped
        .iter()
        .enumerate()
        .map(|(i, l)| BLine {
            col: place_line(&g, i, l),
            runs: to_runs(l, extra),
            para: idx as i32,
            star: p.rev > 0 && p.rev <= s.rev_level.max(p.rev),
            scene_no: if i == 0 { scene_no.clone() } else { None },
            sentence_end: i + 1 < n && ends_sentence(l),
        })
        .collect()
}

fn cue_name(text: &str) -> String {
    // "MAYA (V.O.)" → "MAYA"; "MAYA (CONT'D)" → "MAYA"
    let t = text.trim().to_uppercase();
    match t.find('(') {
        Some(i) => t[..i].trim().to_string(),
        None => t,
    }
    .trim_end_matches('^')
    .trim()
    .to_string()
}

/// Paragraph range [start, end) of the speech that starts at character paragraph `i`.
fn speech_end(paras: &[Para], i: usize) -> usize {
    let mut j = i + 1;
    while j < paras.len() && matches!(paras[j].t, Elem::Dialogue | Elem::Paren | Elem::Lyric | Elem::Note) {
        j += 1;
    }
    j
}

/// Scene number of every scene heading (None for other paragraphs): automatic 1, 2, 3…, with a
/// locked number (such as 12A) kept as typed and numbering continuing from it. Shared by the page,
/// the PDF and the Final Draft export so they always agree.
pub fn scene_numbers(paras: &[Para]) -> Vec<Option<String>> {
    let mut scene_nums: Vec<Option<String>> = vec![None; paras.len()];
    let mut n = 0u32;
    for (i, p) in paras.iter().enumerate() {
        if p.t == Elem::Scene {
            let manual = p.meta.as_ref().map(|m| m.num.trim().to_string()).unwrap_or_default();
            if manual.is_empty() {
                n += 1;
                scene_nums[i] = Some(n.to_string());
            } else {
                // 12A continues from 12, so the next scene is 13
                let digits: String = manual.chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Ok(v) = digits.parse::<u32>() {
                    n = v;
                }
                scene_nums[i] = Some(manual);
            }
        }
    }
    scene_nums
}

pub fn layout(project: &Project) -> Layout {
    let s = &project.settings;
    let paras = &project.paras;
    let lines_per_page = if s.page_size == "a4" { A4_LINES } else { LETTER_LINES };

    // ---- scene numbers
    let scene_nums = scene_numbers(paras);

    // ---- build blocks
    let mut blocks: Vec<Block> = Vec::new();
    let mut last_speaker: Option<String> = None;
    let mut i = 0;
    while i < paras.len() {
        let p = &paras[i];
        if !p.t.printable() {
            i += 1;
            continue;
        }
        if p.meta.as_ref().map(|m| m.omitted).unwrap_or(false) && p.t == Elem::Scene {
            // Omitted scene: print "OMITTED" heading, skip until next scene heading.
            let num = if s.scene_numbers { scene_nums[i].clone() } else { None };
            blocks.push(Block {
                para: i,
                t: Elem::Scene,
                before: geometry(Elem::Scene, s).before,
                rows: vec![vec![BLine {
                    col: COL_LEFT,
                    runs: plain("OMITTED"),
                    para: i as i32,
                    star: p.rev > 0,
                    scene_no: num,
                    sentence_end: false,
                }]],
                keep_next: false,
                splittable: false,
                speaker: None,
            });
            i += 1;
            while i < paras.len() && paras[i].t != Elem::Scene && paras[i].t != Elem::Section {
                i += 1;
            }
            continue;
        }
        match p.t {
            Elem::Scene => {
                last_speaker = None;
                let num = if s.scene_numbers { scene_nums[i].clone() } else { None };
                let lines = para_block_lines(p, i, s, false, num, None);
                blocks.push(Block {
                    para: i,
                    t: p.t,
                    before: geometry(p.t, s).before,
                    rows: lines.into_iter().map(|l| vec![l]).collect(),
                    keep_next: true,
                    splittable: false,
                    speaker: None,
                });
                i += 1;
            }
            Elem::Character => {
                let end = speech_end(paras, i);
                let pair_end = if end < paras.len() && paras[end].t == Elem::Character && paras[end].dual {
                    Some(speech_end(paras, end))
                } else {
                    None
                };
                let name = cue_name(&p.text());
                let has_cont = p.text().to_uppercase().contains("CONT'D");
                let auto_cont = s.conts && !has_cont && last_speaker.as_deref() == Some(name.as_str());

                if let Some(pe) = pair_end {
                    // dual dialogue: two columns, never split
                    let left = dual_column(paras, i, end, s, false, auto_cont);
                    let right_name = cue_name(&paras[end].text());
                    let right = dual_column(paras, end, pe, s, true, false);
                    let rows = left.len().max(right.len());
                    let mut out = Vec::new();
                    for r in 0..rows {
                        let mut row = Vec::new();
                        if let Some(l) = left.get(r) {
                            row.push(l.clone());
                        }
                        if let Some(l) = right.get(r) {
                            row.push(l.clone());
                        }
                        out.push(row);
                    }
                    blocks.push(Block {
                        para: i,
                        t: Elem::Character,
                        before: 1,
                        rows: out,
                        keep_next: false,
                        splittable: false,
                        speaker: None,
                    });
                    last_speaker = Some(right_name);
                    i = pe;
                    continue;
                }

                let cue = para_block_lines(p, i, s, auto_cont, None, None);
                blocks.push(Block {
                    para: i,
                    t: Elem::Character,
                    before: 1,
                    rows: cue.into_iter().map(|l| vec![l]).collect(),
                    keep_next: end > i + 1,
                    splittable: false,
                    speaker: None,
                });
                let speaker_cue = {
                    let t = p.text().trim().to_uppercase();
                    if t.contains("CONT'D") { t } else { format!("{t} (CONT'D)") }
                };
                for j in i + 1..end {
                    let q = &paras[j];
                    if !q.t.printable() {
                        continue;
                    }
                    let lines = para_block_lines(q, j, s, false, None, None);
                    let next_is_speech = (j + 1..end).any(|k| paras[k].t.printable());
                    blocks.push(Block {
                        para: j,
                        t: q.t,
                        before: 0,
                        rows: lines.into_iter().map(|l| vec![l]).collect(),
                        keep_next: q.t == Elem::Paren && next_is_speech,
                        splittable: q.t != Elem::Paren,
                        speaker: Some(speaker_cue.clone()),
                    });
                }
                last_speaker = Some(name);
                i = end;
            }
            _ => {
                let g = geometry(p.t, s);
                let lines = para_block_lines(p, i, s, false, None, None);
                blocks.push(Block {
                    para: i,
                    t: p.t,
                    before: g.before,
                    rows: lines.into_iter().map(|l| vec![l]).collect(),
                    keep_next: p.t == Elem::Shot,
                    splittable: matches!(p.t, Elem::Action | Elem::General | Elem::Dialogue | Elem::Lyric),
                    speaker: None,
                });
                i += 1;
            }
        }
    }

    // ---- paginate
    let max = lines_per_page;
    let mut pages: Vec<Vec<(usize, Vec<BLine>)>> = vec![Vec::new()]; // (row, row-lines)
    let mut used = 0usize;
    let mut page_first_block: Vec<Vec<usize>> = vec![Vec::new()]; // blocks starting on each page (for carry)
    // Track for each page the block index → rows placed, to allow carrying a keep-with-next block.
    let mut placed_rows: Vec<Vec<(usize, usize, usize)>> = vec![Vec::new()]; // (block, first row idx in page vec, count)

    let mut bi = 0;
    while bi < blocks.len() {
        let b = blocks[bi].clone();
        let before = if used == 0 { 0 } else { b.before };
        let need = b.rows.len();

        // how many lines must accompany this block on the same page (keep-with-next)
        let mut follow = 0;
        if b.keep_next {
            let mut k = bi + 1;
            let mut chain = 0;
            while k < blocks.len() && chain < 4 {
                let nb = &blocks[k];
                let nbefore = nb.before;
                let take = if nb.splittable { nb.rows.len().min(2) } else { nb.rows.len() };
                follow += nbefore + take;
                if !nb.keep_next {
                    break;
                }
                k += 1;
                chain += 1;
            }
        }

        let fits_self = used + before + need <= max;
        let place_whole = (fits_self && used + before + need + follow <= max)
            || (used == 0 && (fits_self || !b.splittable));
        if place_whole {
            // (an over-long unsplittable block at a page top simply fills its page)
            let start = pages.last().unwrap().len();
            used += before;
            for r in &b.rows {
                pages.last_mut().unwrap().push((used, r.clone()));
                used += 1;
            }
            placed_rows.last_mut().unwrap().push((bi, start, b.rows.len()));
            page_first_block.last_mut().unwrap().push(bi);
            bi += 1;
            continue;
        }

        // ---- does not fit: try to split
        let avail = max.saturating_sub(used + before);
        let is_dialogue = matches!(b.t, Elem::Dialogue | Elem::Lyric);
        let reserve = if is_dialogue && s.mores { 1 } else { 0 };
        if b.splittable && !fits_self && b.rows.len() >= 4 && avail >= 2 + reserve {
            let max_k = (avail - reserve).min(b.rows.len() - 2);
            // prefer a sentence boundary that keeps at least half of the room used; otherwise break
            // at the last line that fits (a speech is never pushed whole to the next page, which
            // would strand its character cue)
            let mut k = max_k;
            for cand in (2..=max_k).rev() {
                if cand * 2 < max_k {
                    break;
                }
                if b.rows[cand - 1].iter().any(|l| l.sentence_end) {
                    k = cand;
                    break;
                }
            }
            {
                let start = pages.last().unwrap().len();
                used += before;
                for r in &b.rows[..k] {
                    pages.last_mut().unwrap().push((used, r.clone()));
                    used += 1;
                }
                placed_rows.last_mut().unwrap().push((bi, start, k));
                if is_dialogue && s.mores {
                    pages.last_mut().unwrap().push((
                        used,
                        vec![BLine { col: 37, runs: plain("(MORE)"), para: -1, star: false, scene_no: None, sentence_end: false }],
                    ));
                }
                // new page with remainder
                pages.push(Vec::new());
                placed_rows.push(Vec::new());
                page_first_block.push(Vec::new());
                used = 0;
                if is_dialogue && s.mores {
                    if let Some(sp) = &b.speaker {
                        pages.last_mut().unwrap().push((
                            0,
                            vec![BLine { col: 37, runs: plain(sp), para: -1, star: false, scene_no: None, sentence_end: false }],
                        ));
                        used = 1;
                    }
                }
                let mut rest = b.clone();
                rest.rows = b.rows[k..].to_vec();
                rest.before = 0;
                blocks[bi] = rest;
                // the split remainder starts a page; record the break at this paragraph
                continue;
            }
        }

        // ---- break before this block, carrying keep-with-next blocks along
        let mut carry: Vec<usize> = Vec::new();
        {
            let pr = placed_rows.last().unwrap();
            let mut idx = pr.len();
            while idx > 0 {
                let (pb, _, cnt) = pr[idx - 1];
                let blk = &blocks[pb];
                if blk.keep_next && cnt == blk.rows.len() && idx - 1 > 0 {
                    carry.insert(0, pb);
                    idx -= 1;
                } else {
                    break;
                }
            }
            // also carry a dialogue fragment's character when the dialogue would be orphaned
        }
        if !carry.is_empty() {
            let first = carry[0];
            let pr = placed_rows.last_mut().unwrap();
            let cut_at = pr.iter().position(|x| x.0 == first).unwrap();
            let row_start = pr[cut_at].1;
            pr.truncate(cut_at);
            pages.last_mut().unwrap().truncate(row_start);
            page_first_block.last_mut().unwrap().retain(|x| *x < first);
            pages.push(Vec::new());
            placed_rows.push(Vec::new());
            page_first_block.push(Vec::new());
            used = 0;
            bi = first; // re-place carried blocks on the new page
            continue;
        }
        pages.push(Vec::new());
        placed_rows.push(Vec::new());
        page_first_block.push(Vec::new());
        used = 0;
    }

    // drop trailing empty page
    while pages.len() > 1 && pages.last().unwrap().is_empty() {
        pages.pop();
    }

    // ---- output
    let mut out_pages = Vec::new();
    let mut para_page = vec![0u32; paras.len()];
    let mut seen = vec![false; paras.len()];
    let mut breaks = Vec::new();
    for (pi, pg) in pages.iter().enumerate() {
        let mut lines = Vec::new();
        let mut first_para_on_page: Option<usize> = None;
        for (row, rl) in pg {
            for l in rl {
                if l.para >= 0 {
                    let p = l.para as usize;
                    if !seen[p] {
                        seen[p] = true;
                        para_page[p] = pi as u32 + 1;
                        if first_para_on_page.is_none() {
                            first_para_on_page = Some(p);
                        }
                    }
                }
                lines.push(Line {
                    row: *row as u16,
                    col: l.col,
                    runs: l.runs.clone(),
                    para: l.para,
                    scene_no: l.scene_no.clone(),
                    star: l.star,
                });
            }
        }
        if pi > 0 {
            breaks.push(first_para_on_page.unwrap_or(usize::MAX));
        }
        let rev = lines
            .iter()
            .filter(|l| l.para >= 0)
            .map(|l| paras.get(l.para as usize).map(|p| p.rev).unwrap_or(0))
            .max()
            .unwrap_or(0);
        out_pages.push(Page { n: pi as u32 + 1, lines, rev });
    }
    // non-printing / omitted paragraphs inherit the page of the next printed paragraph
    let last_page = out_pages.len() as u32;
    let mut next = last_page;
    for i in (0..paras.len()).rev() {
        if seen[i] {
            next = para_page[i];
        } else {
            para_page[i] = next.max(1);
        }
    }

    // ---- scene lengths in eighths
    let mut scenes = Vec::new();
    let scene_idx: Vec<usize> = (0..paras.len()).filter(|&i| paras[i].t == Elem::Scene).collect();
    // count rows per scene: walk all output lines, attribute to latest scene heading
    let mut row_counts = vec![0usize; scene_idx.len()];
    {
        // map para → scene ordinal
        let mut ord = vec![usize::MAX; paras.len()];
        let mut cur = usize::MAX;
        let mut si = 0;
        for i in 0..paras.len() {
            if si < scene_idx.len() && scene_idx[si] == i {
                cur = si;
                si += 1;
            }
            ord[i] = cur;
        }
        for pg in &out_pages {
            let mut last_row: Option<u16> = None;
            let mut last_scene = usize::MAX;
            for l in &pg.lines {
                if last_row == Some(l.row) {
                    continue; // dual-dialogue twin
                }
                let sc = if l.para >= 0 { ord[l.para as usize] } else { last_scene };
                if sc != usize::MAX {
                    // blank lines before this line belong to the scene too
                    let gap = match last_row {
                        Some(r) if last_scene == sc => (l.row - r) as usize,
                        _ => 1,
                    };
                    row_counts[sc] += gap;
                }
                last_row = Some(l.row);
                last_scene = sc;
            }
        }
    }
    for (k, &pi) in scene_idx.iter().enumerate() {
        let eighth = max as f64 / 8.0;
        let e = ((row_counts[k] as f64) / eighth).ceil().max(1.0) as u32;
        scenes.push(SceneInfo {
            para: pi,
            number: scene_nums[pi].clone().unwrap_or_default(),
            page: para_page[pi],
            eighths: e,
        });
    }

    Layout { pages: out_pages, para_page, breaks, scenes, lines_per_page }
}

fn dual_column(paras: &[Para], start: usize, end: usize, s: &Settings, right: bool, cont: bool) -> Vec<BLine> {
    let (cc, pc, pw, dc, dw) = dual_geom(right);
    let mut out = Vec::new();
    for j in start..end {
        let q = &paras[j];
        if !q.t.printable() {
            continue;
        }
        let g = match q.t {
            Elem::Character => Geom { left: cc, width: (75 - cc).min(30), before: 0, align: Align::Left, hang: 0 },
            Elem::Paren => Geom { left: pc, width: pw, before: 0, align: Align::Left, hang: 1 },
            _ => Geom { left: dc, width: dw, before: 0, align: Align::Left, hang: 0 },
        };
        out.extend(para_block_lines(q, j, s, cont && j == start, None, Some(g)));
    }
    out
}

/// Format a page count + runtime estimate, e.g. "112 pages · ~1h 52m".
pub fn runtime_minutes(layout: &Layout) -> u32 {
    let pages = layout.pages.len() as f64;
    let last_fill = layout
        .pages
        .last()
        .and_then(|p| p.lines.last())
        .map(|l| l.row as f64 / layout.lines_per_page as f64)
        .unwrap_or(0.0);
    ((pages - 1.0).max(0.0) + last_fill).round().max(1.0) as u32
}

#[cfg(test)]
mod tests {
    #[test]
    fn long_speech_breaks_with_more_and_contd() {
        // a speech longer than the rest of the page starts under its cue and breaks with (MORE)
        let mut p = Project::default();
        p.paras = vec![Para::new(Elem::Scene, "INT. ROOM - DAY")];
        for _ in 0..8 {
            p.paras.push(Para::new(Elem::Action, &"A man paces. ".repeat(6)));
        }
        p.paras.push(Para::new(Elem::Character, "BOB"));
        p.paras.push(Para::new(Elem::Paren, "(quietly)"));
        let speech: Vec<String> = (1..40).map(|i| format!("This is sentence number {i} of a very long speech that keeps going.")).collect();
        p.paras.push(Para::new(Elem::Dialogue, &speech.join(" ")));
        let lay = layout(&p);
        let page1 = &lay.pages[0];
        let text1: Vec<String> = page1.lines.iter().map(|l| l.runs.iter().map(|r| r.x.clone()).collect::<String>()).collect();
        assert!(text1.iter().any(|t| t == "BOB"), "cue stays on page 1: {text1:?}");
        assert!(text1.iter().any(|t| t == "(quietly)"));
        assert_eq!(text1.last().unwrap(), "(MORE)");
        let first2: String = lay.pages[1].lines[0].runs.iter().map(|r| r.x.clone()).collect();
        assert_eq!(first2, "BOB (CONT'D)");
        // every continuation page starts with the cue and carries a real share of the speech
        for pg in &lay.pages[1..] {
            let first: String = pg.lines[0].runs.iter().map(|r| r.x.clone()).collect();
            assert_eq!(first, "BOB (CONT'D)");
            assert!(pg.lines.len() >= 3);
        }

    }
    use super::*;

    fn proj(paras: Vec<Para>) -> Project {
        Project { paras, ..Default::default() }
    }

    #[test]
    fn element_positions() {
        let p = proj(vec![
            Para::new(Elem::Scene, "int. kitchen - night"),
            Para::new(Elem::Action, "Maya enters."),
            Para::new(Elem::Character, "maya"),
            Para::new(Elem::Paren, "quietly"),
            Para::new(Elem::Dialogue, "Hello?"),
            Para::new(Elem::Transition, "cut to:"),
        ]);
        let l = layout(&p);
        let lines = &l.pages[0].lines;
        assert_eq!(lines[0].col, 15);
        assert_eq!(lines[0].runs[0].x, "INT. KITCHEN - NIGHT");
        assert_eq!(lines[0].row, 0);
        assert_eq!(lines[1].row, 2); // one blank line
        assert_eq!(lines[2].col, 37);
        assert_eq!(lines[3].col, 31);
        assert_eq!(lines[3].runs[0].x, "(quietly)");
        assert_eq!(lines[4].col, 25);
        let tr = &lines[5];
        assert_eq!(tr.col + tr.runs[0].x.len() as u16, 75);
    }

    #[test]
    fn widths_respected() {
        let long = "word ".repeat(80);
        let p = proj(vec![Para::new(Elem::Character, "BOB"), Para::new(Elem::Dialogue, &long)]);
        let l = layout(&p);
        for line in &l.pages[0].lines[1..] {
            let len: usize = line.runs.iter().map(|r| r.x.chars().count()).sum();
            assert!(len <= 35);
        }
        let p = proj(vec![Para::new(Elem::Action, &long)]);
        for line in &layout(&p).pages[0].lines {
            let len: usize = line.runs.iter().map(|r| r.x.chars().count()).sum();
            assert!(len <= 60);
        }
    }

    #[test]
    fn pages_and_more_contd() {
        let mut paras = vec![Para::new(Elem::Scene, "INT. ROOM - DAY")];
        for _ in 0..24 {
            paras.push(Para::new(Elem::Action, "A line of action."));
        }
        paras.push(Para::new(Elem::Character, "ANN"));
        let sent = "This is a sentence that goes on. ".repeat(20);
        paras.push(Para::new(Elem::Dialogue, &sent));
        let l = layout(&proj(paras));
        assert!(l.pages.len() >= 2);
        for pg in &l.pages {
            assert!(pg.lines.iter().all(|x| (x.row as usize) < LETTER_LINES));
        }
        let p1 = &l.pages[0];
        assert_eq!(p1.lines.last().unwrap().runs[0].x, "(MORE)");
        assert_eq!(l.pages[1].lines[0].runs[0].x, "ANN (CONT'D)");
    }

    #[test]
    fn scene_heading_not_orphaned() {
        let mut paras = vec![];
        for _ in 0..26 {
            paras.push(Para::new(Elem::Action, "Action."));
        }
        // 26 actions = rows 0..50 ; heading at row 52 would be orphaned
        paras.push(Para::new(Elem::Scene, "EXT. STREET - DAY"));
        paras.push(Para::new(Elem::Action, "Cars.\nMore cars.\nEven more."));
        let l = layout(&proj(paras));
        assert_eq!(l.pages.len(), 2);
        assert_eq!(l.pages[1].lines[0].runs[0].x, "EXT. STREET - DAY");
        assert_eq!(l.breaks, vec![26]);
    }

    #[test]
    fn dual_never_split_across_pages() {
        let mut paras = vec![];
        for _ in 0..25 {
            paras.push(Para::new(Elem::Action, "Action."));
        }
        let mut bob = Para::new(Elem::Character, "BOB");
        bob.dual = true;
        paras.push(Para::new(Elem::Character, "ANN"));
        paras.push(Para::new(Elem::Dialogue, &"Words words words. ".repeat(6)));
        paras.push(bob);
        paras.push(Para::new(Elem::Dialogue, "Short."));
        let l = layout(&proj(paras));
        assert_eq!(l.pages.len(), 2);
        let p2 = &l.pages[1];
        assert_eq!(p2.lines[0].row, 0);
        assert_eq!(p2.lines[0].runs[0].x, "ANN");
        assert_eq!(p2.lines[1].runs[0].x, "BOB");
        for pg in &l.pages {
            assert!(pg.lines.iter().all(|x| (x.row as usize) < LETTER_LINES));
        }
    }

    #[test]
    fn hyphen_breaks() {
        let w = wrap(&"aaaa bbbb-cccc".chars().map(|c| (c, 0)).collect::<Vec<_>>(), 10, 0);
        let lines: Vec<String> = w.iter().map(|l| l.iter().map(|c| c.0).collect()).collect();
        assert_eq!(lines, vec!["aaaa bbbb-", "cccc"]);
        let w = wrap(&"x -- y".chars().map(|c| (c, 0)).collect::<Vec<_>>(), 60, 0);
        assert_eq!(w.len(), 1);
    }

    #[test]
    fn auto_contd() {
        let p = proj(vec![
            Para::new(Elem::Scene, "INT. A - DAY"),
            Para::new(Elem::Character, "ANN"),
            Para::new(Elem::Dialogue, "Hi."),
            Para::new(Elem::Action, "She sits."),
            Para::new(Elem::Character, "ANN"),
            Para::new(Elem::Dialogue, "Bye."),
        ]);
        let l = layout(&p);
        let cues: Vec<_> = l.pages[0].lines.iter().filter(|x| x.col == 37).map(|x| x.runs[0].x.clone()).collect();
        assert_eq!(cues, vec!["ANN", "ANN (CONT'D)"]);
    }

    #[test]
    fn dual_dialogue_side_by_side() {
        let mut b = Para::new(Elem::Character, "BOB");
        b.dual = true;
        let p = proj(vec![
            Para::new(Elem::Character, "ANN"),
            Para::new(Elem::Dialogue, "Left side."),
            b,
            Para::new(Elem::Dialogue, "Right side."),
        ]);
        let l = layout(&p);
        let rows: Vec<u16> = l.pages[0].lines.iter().map(|x| x.row).collect();
        assert_eq!(rows, vec![0, 0, 1, 1]);
    }
}
