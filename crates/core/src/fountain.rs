//! Fountain (https://fountain.io) import and export — the open plain-text screenplay format.

use crate::model::*;

// ---------------------------------------------------------------- export

fn runs_to_fountain(runs: &[Run]) -> String {
    let mut out = String::new();
    for r in runs {
        let mut t = r.x.replace('*', "\\*").replace('_', "\\_");
        if r.s & UNDERLINE != 0 {
            t = format!("_{t}_");
        }
        match r.s & (BOLD | ITALIC) {
            BOLD => t = format!("**{t}**"),
            ITALIC => t = format!("*{t}*"),
            3 => t = format!("***{t}***"),
            _ => {}
        }
        out.push_str(&t);
    }
    out
}

fn looks_like_scene(s: &str) -> bool {
    let u = s.trim_start().to_uppercase();
    [
        "INT.", "EXT.", "EST.", "INT/EXT", "INT./EXT", "I/E", "INT ", "EXT ", "EST ",
    ]
    .iter()
    .any(|p| u.starts_with(p))
}

fn is_all_caps(s: &str) -> bool {
    s.chars().any(|c| c.is_alphabetic()) && !s.chars().any(|c| c.is_lowercase())
}

pub fn export(p: &Project) -> String {
    let mut out = String::new();
    let tp = &p.title_page;
    let mut kv = |k: &str, v: &str| {
        if v.trim().is_empty() {
            return;
        }
        let lines: Vec<&str> = v.lines().collect();
        if lines.len() == 1 {
            out.push_str(&format!("{k}: {}\n", lines[0].trim()));
        } else {
            out.push_str(&format!("{k}:\n"));
            for l in lines {
                out.push_str(&format!("    {}\n", l.trim()));
            }
        }
    };
    kv("Title", &tp.title);
    kv("Credit", &tp.credit);
    kv("Author", &tp.author);
    kv("Source", &tp.source);
    kv("Draft date", &tp.draft);
    kv("Contact", &tp.contact);
    kv("Notes", &tp.notes);
    if !out.is_empty() {
        out.push('\n');
    }

    let mut prev: Option<Elem> = None;
    for para in &p.paras {
        let text = runs_to_fountain(&para.runs);
        let raw = para.text();
        let in_speech = matches!(para.t, Elem::Dialogue | Elem::Paren | Elem::Lyric)
            && matches!(
                prev,
                Some(Elem::Character | Elem::Dialogue | Elem::Paren | Elem::Lyric)
            );
        if !in_speech && prev.is_some() {
            out.push('\n');
        }
        match para.t {
            Elem::Scene => {
                let t = text.trim().to_uppercase();
                if looks_like_scene(&t) {
                    out.push_str(&t)
                } else {
                    out.push('.');
                    out.push_str(&t)
                }
                if let Some(m) = &para.meta {
                    if !m.num.is_empty() {
                        out.push_str(&format!(" #{}#", m.num));
                    }
                    if !m.synopsis.trim().is_empty() {
                        out.push_str(&format!("\n\n= {}", m.synopsis.trim().replace('\n', " ")));
                    }
                }
            }
            Elem::Character => {
                let t = text.trim().to_uppercase();
                let name_part = t.split('(').next().unwrap_or("");
                if !is_all_caps(name_part) || name_part.chars().any(|c| !c.is_ascii()) {
                    out.push('@');
                }
                out.push_str(&t);
                if para.dual {
                    out.push_str(" ^");
                }
            }
            Elem::Paren => {
                let t = text.trim();
                if t.starts_with('(') {
                    out.push_str(t)
                } else {
                    out.push_str(&format!("({t})"))
                }
            }
            Elem::Dialogue => out.push_str(&text),
            Elem::Lyric => {
                for (i, l) in text.lines().enumerate() {
                    if i > 0 {
                        out.push('\n');
                    }
                    out.push('~');
                    out.push_str(l);
                }
            }
            Elem::Transition => {
                let t = text.trim().to_uppercase();
                if t.ends_with("TO:") {
                    out.push_str(&t)
                } else {
                    out.push_str(&format!("> {t}"))
                }
            }
            Elem::Centered => out.push_str(&format!("> {} <", text.trim())),
            Elem::Shot => {
                // Fountain has no Shot element; an all-caps action line is the convention.
                out.push_str(&text.trim().to_uppercase());
            }
            Elem::Section => out.push_str(&format!(
                "{} {}",
                "#".repeat(para.lvl.clamp(1, 3) as usize),
                raw.trim()
            )),
            Elem::Note => out.push_str(&format!("[[{}]]", raw.trim())),
            Elem::Action | Elem::General | Elem::Unknown => {
                let first = raw.lines().next().unwrap_or("");
                if (is_all_caps(first) && !first.trim().is_empty())
                    || looks_like_scene(first)
                    || first.starts_with(['.', '>', '@', '~', '!', '#', '='])
                {
                    out.push('!');
                }
                out.push_str(&text);
            }
        }
        out.push('\n');
        prev = Some(para.t);
    }
    out
}

// ---------------------------------------------------------------- import

/// Parse Fountain emphasis into runs: ***bold italic***, **bold**, *italic*, _underline_.
pub fn parse_emphasis(s: &str) -> Vec<Run> {
    let chars: Vec<char> = s.chars().collect();
    let mut runs: Vec<Run> = Vec::new();
    let mut style = 0u8;
    let mut cur = String::new();
    let mut i = 0;
    let push = |runs: &mut Vec<Run>, cur: &mut String, style: u8| {
        if !cur.is_empty() {
            match runs.last_mut() {
                Some(r) if r.s == style => r.x.push_str(cur),
                _ => runs.push(Run {
                    x: cur.clone(),
                    s: style,
                }),
            }
            cur.clear();
        }
    };
    let has_closer = |from: usize, tok: &str| -> bool {
        let rest: String = chars[from..].iter().collect();
        rest.contains(tok)
    };
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' && i + 1 < chars.len() {
            cur.push(chars[i + 1]);
            i += 2;
            continue;
        }
        if c == '*' {
            let n = chars[i..].iter().take_while(|&&x| x == '*').count().min(3);
            let bits = match n {
                3 => BOLD | ITALIC,
                2 => BOLD,
                _ => ITALIC,
            };
            let tok = "*".repeat(n);
            if style & bits == bits {
                push(&mut runs, &mut cur, style);
                style &= !bits;
                i += n;
                continue;
            } else if has_closer(i + n, &tok) {
                push(&mut runs, &mut cur, style);
                style |= bits;
                i += n;
                continue;
            }
        }
        if c == '_' {
            if style & UNDERLINE != 0 {
                push(&mut runs, &mut cur, style);
                style &= !UNDERLINE;
                i += 1;
                continue;
            } else if has_closer(i + 1, "_") {
                push(&mut runs, &mut cur, style);
                style |= UNDERLINE;
                i += 1;
                continue;
            }
        }
        cur.push(c);
        i += 1;
    }
    push(&mut runs, &mut cur, style);
    if runs.is_empty() {
        runs.push(Run::default());
    }
    runs
}

fn para(t: Elem, text: &str) -> Para {
    Para {
        t,
        runs: parse_emphasis(text),
        ..Default::default()
    }
}

fn strip_notes_and_boneyard(src: &str) -> String {
    // remove /* boneyard */
    let mut s = String::with_capacity(src.len());
    let mut rest = src;
    while let Some(a) = rest.find("/*") {
        s.push_str(&rest[..a]);
        match rest[a..].find("*/") {
            Some(b) => rest = &rest[a + b + 2..],
            None => {
                rest = "";
            }
        }
    }
    s.push_str(rest);
    s
}

pub fn import(src: &str) -> Project {
    let src = src.replace("\r\n", "\n").replace('\r', "\n");
    let src = src.trim_start_matches('\u{feff}');
    let src = strip_notes_and_boneyard(src);
    let mut lines: Vec<&str> = src.split('\n').collect();
    let mut project = Project {
        paras: vec![],
        ..Default::default()
    };
    project.title_page.credit.clear();

    // ---- title page
    let is_key = |l: &str| {
        if let Some(i) = l.find(':') {
            let k = l[..i].trim().to_lowercase();
            [
                "title",
                "credit",
                "author",
                "authors",
                "source",
                "draft date",
                "date",
                "contact",
                "notes",
                "copyright",
            ]
            .contains(&k.as_str())
        } else {
            false
        }
    };
    if lines.first().map(|l| is_key(l)).unwrap_or(false) {
        let mut key = String::new();
        let mut n = 0;
        for l in &lines {
            if l.trim().is_empty() {
                break;
            }
            n += 1;
            let (k, v) = if !l.starts_with([' ', '\t']) && is_key(l) {
                let i = l.find(':').unwrap();
                key = l[..i].trim().to_lowercase();
                (key.clone(), l[i + 1..].trim().to_string())
            } else {
                (key.clone(), l.trim().to_string())
            };
            let plain: String = parse_emphasis(&v).iter().map(|r| r.x.clone()).collect();
            let field = match k.as_str() {
                "title" => &mut project.title_page.title,
                "credit" => &mut project.title_page.credit,
                "author" | "authors" => &mut project.title_page.author,
                "source" => &mut project.title_page.source,
                "draft date" | "date" => &mut project.title_page.draft,
                "contact" => &mut project.title_page.contact,
                _ => &mut project.title_page.notes,
            };
            if plain.is_empty() {
                continue;
            }
            if !field.is_empty() {
                field.push('\n');
            }
            field.push_str(&plain);
        }
        lines.drain(..n);
    }
    if project.title_page.credit.is_empty() {
        project.title_page.credit = "Written by".into();
    }

    let n = lines.len();
    let blank =
        |i: isize| -> bool { i < 0 || i as usize >= n || lines[i as usize].trim().is_empty() };
    let mut i = 0usize;
    while i < n {
        let raw = lines[i];
        let line = raw.trim_end();
        let t = line.trim();
        if t.is_empty() {
            i += 1;
            continue;
        }
        if t == "===" {
            i += 1;
            continue;
        }
        // sections / synopses / notes
        if t.starts_with('#') {
            let lvl = t.chars().take_while(|&c| c == '#').count().clamp(1, 3) as u8;
            let mut p = Para::new(Elem::Section, t.trim_start_matches('#').trim());
            p.lvl = lvl;
            project.paras.push(p);
            i += 1;
            continue;
        }
        if t.starts_with('=') && !t.starts_with("==") {
            let syn = t[1..].trim().to_string();
            if let Some(last) = project
                .paras
                .iter_mut()
                .rev()
                .find(|p| matches!(p.t, Elem::Scene | Elem::Section))
            {
                let m = last.meta.get_or_insert_with(Default::default);
                if !m.synopsis.is_empty() {
                    m.synopsis.push(' ');
                }
                m.synopsis.push_str(&syn);
            }
            i += 1;
            continue;
        }
        if t.starts_with("[[") && t.ends_with("]]") {
            project
                .paras
                .push(Para::new(Elem::Note, t[2..t.len() - 2].trim()));
            i += 1;
            continue;
        }
        // remove inline notes
        let owned;
        let t = if t.contains("[[") {
            let mut s = String::new();
            let mut r = t;
            while let Some(a) = r.find("[[") {
                s.push_str(&r[..a]);
                match r[a..].find("]]") {
                    Some(b) => r = &r[a + b + 2..],
                    None => r = "",
                }
            }
            s.push_str(r);
            owned = s.trim().to_string();
            owned.as_str()
        } else {
            t
        };
        // forced scene heading
        if (t.starts_with('.') && !t.starts_with(".."))
            || (looks_like_scene(t) && blank(i as isize - 1))
        {
            let mut h = if t.starts_with('.') && !looks_like_scene(t) {
                t[1..].trim().to_string()
            } else {
                t.trim_start_matches('.').to_string()
            };
            let mut num = String::new();
            if h.ends_with('#') {
                if let Some(a) = h[..h.len() - 1].rfind('#') {
                    num = h[a + 1..h.len() - 1].to_string();
                    h = h[..a].trim().to_string();
                }
            }
            let mut p = para(Elem::Scene, &h.to_uppercase());
            if !num.is_empty() {
                p.meta = Some(SceneMeta {
                    num,
                    ..Default::default()
                });
            }
            project.paras.push(p);
            i += 1;
            continue;
        }
        // centered
        if t.starts_with('>') && t.ends_with('<') {
            project
                .paras
                .push(para(Elem::Centered, t[1..t.len() - 1].trim()));
            i += 1;
            continue;
        }
        // transition
        if t.starts_with('>') {
            project.paras.push(para(Elem::Transition, t[1..].trim()));
            i += 1;
            continue;
        }
        if is_all_caps(t) && t.ends_with("TO:") && blank(i as isize - 1) && blank(i as isize + 1) {
            project.paras.push(para(Elem::Transition, t));
            i += 1;
            continue;
        }
        // lyrics
        if t.starts_with('~') {
            project.paras.push(para(Elem::Lyric, t[1..].trim_start()));
            i += 1;
            continue;
        }
        // character + dialogue
        let forced_char = t.starts_with('@');
        let name_part = t.trim_start_matches('@').trim_end_matches('^').trim();
        let cue_part = name_part.split('(').next().unwrap_or("");
        if !t.starts_with('!')
            && (forced_char
                || (is_all_caps(cue_part) && cue_part.chars().any(|c| c.is_alphabetic())))
            && blank(i as isize - 1)
            && !blank(i as isize + 1)
        {
            let mut p = para(Elem::Character, name_part);
            p.dual = t.ends_with('^');
            project.paras.push(p);
            i += 1;
            let mut dlg: Vec<String> = Vec::new();
            let flush = |dlg: &mut Vec<String>, project: &mut Project| {
                if !dlg.is_empty() {
                    project.paras.push(para(Elem::Dialogue, &dlg.join("\n")));
                    dlg.clear();
                }
            };
            while i < n && !lines[i].trim().is_empty() {
                let d = lines[i].trim();
                if d.starts_with('(') && d.ends_with(')') {
                    flush(&mut dlg, &mut project);
                    project.paras.push(para(Elem::Paren, d));
                } else if let Some(stripped) = d.strip_prefix('~') {
                    flush(&mut dlg, &mut project);
                    project.paras.push(para(Elem::Lyric, stripped.trim_start()));
                } else {
                    dlg.push(d.to_string());
                }
                i += 1;
            }
            flush(&mut dlg, &mut project);
            continue;
        }
        // action (may span lines until a blank line)
        let mut block: Vec<String> = vec![t.trim_start_matches('!').to_string()];
        i += 1;
        while i < n && !lines[i].trim().is_empty() {
            let l = lines[i].trim_end();
            if l.trim().starts_with("[[") && l.trim().ends_with("]]") {
                break;
            }
            block.push(l.trim_start_matches('!').to_string());
            i += 1;
        }
        project.paras.push(para(Elem::Action, &block.join("\n")));
    }
    if project.paras.is_empty() {
        project.paras.push(Para::new(Elem::Scene, ""));
    }
    project
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "Title: The Long Night\nAuthor: Jo Writer\n\nINT. DINER - NIGHT\n\nRain. *Lots* of **rain**.\n\nMAYA\n(whispering)\nIs he here?\n\nBOB ^\nNo.\n\nCUT TO:\n\n.FLASHBACK\n\n= She remembers.\n\n> THE END <\n";

    #[test]
    fn import_basic() {
        let p = import(SAMPLE);
        assert_eq!(p.title_page.title, "The Long Night");
        let ts: Vec<Elem> = p.paras.iter().map(|x| x.t).collect();
        assert_eq!(
            ts,
            vec![
                Elem::Scene,
                Elem::Action,
                Elem::Character,
                Elem::Paren,
                Elem::Dialogue,
                Elem::Character,
                Elem::Dialogue,
                Elem::Transition,
                Elem::Scene,
                Elem::Centered
            ]
        );
        assert!(p.paras[5].dual);
        assert_eq!(
            p.paras[1].runs[1],
            Run {
                x: "Lots".into(),
                s: ITALIC
            }
        );
        assert_eq!(p.paras[8].meta.as_ref().unwrap().synopsis, "She remembers.");
    }

    #[test]
    fn roundtrip() {
        let p = import(SAMPLE);
        let again = import(&export(&p));
        let a: Vec<(Elem, String)> = p.paras.iter().map(|x| (x.t, x.text())).collect();
        let b: Vec<(Elem, String)> = again.paras.iter().map(|x| (x.t, x.text())).collect();
        assert_eq!(a, b);
    }
}
