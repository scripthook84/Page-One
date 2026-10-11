//! Final Draft (.fdx) import and export, so scripts move freely between apps.

use crate::model::*;

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn fdx_type(t: Elem) -> &'static str {
    match t {
        Elem::Scene => "Scene Heading",
        Elem::Action => "Action",
        Elem::Character => "Character",
        Elem::Paren => "Parenthetical",
        Elem::Dialogue => "Dialogue",
        Elem::Transition => "Transition",
        Elem::Shot => "Shot",
        Elem::Lyric => "Lyrics",
        Elem::Centered => "Action",
        Elem::Section => "Outline 1",
        Elem::Note => "Note",
        Elem::General | Elem::Unknown => "General",
    }
}

fn texts(runs: &[Run]) -> String {
    let mut o = String::new();
    for r in runs {
        let mut st = Vec::new();
        if r.s & BOLD != 0 {
            st.push("Bold");
        }
        if r.s & ITALIC != 0 {
            st.push("Italic");
        }
        if r.s & UNDERLINE != 0 {
            st.push("Underline");
        }
        if st.is_empty() {
            o.push_str(&format!("<Text>{}</Text>", esc(&r.x)));
        } else {
            o.push_str(&format!("<Text Style=\"{}\">{}</Text>", st.join("+"), esc(&r.x)));
        }
    }
    o
}

fn para_xml(p: &Para, number: Option<&str>) -> String {
    let ty = match (p.t, p.lvl) {
        (Elem::Section, 2) => "Outline 2",
        (Elem::Section, 3) => "Outline 3",
        _ => fdx_type(p.t),
    };
    let mut attrs = format!("Type=\"{}\"", ty);
    if p.t == Elem::Centered {
        attrs.push_str(" Alignment=\"Center\"");
    }
    if let Some(n) = number {
        attrs.push_str(&format!(" Number=\"{}\"", esc(n)));
    }
    let mut inner = String::new();
    if p.t == Elem::Scene {
        if let Some(m) = &p.meta {
            if !m.synopsis.is_empty() || !m.color.is_empty() {
                inner.push_str("<SceneProperties");
                if !m.color.is_empty() {
                    inner.push_str(&format!(" Color=\"{}\"", esc(&m.color)));
                }
                inner.push_str(&format!(
                    "><Summary><Paragraph Type=\"General\"><Text>{}</Text></Paragraph></Summary></SceneProperties>",
                    esc(&m.synopsis)
                ));
            }
        }
    }
    let text = p.runs.clone();
    format!("    <Paragraph {attrs}>{inner}{}</Paragraph>\n", texts(&text))
}

pub fn export(p: &Project) -> String {
    let mut o = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n<FinalDraft DocumentType=\"Script\" Template=\"No\" Version=\"5\">\n  <Content>\n",
    );
    let mut scene_no = 0;
    let mut i = 0;
    while i < p.paras.len() {
        let para = &p.paras[i];
        // dual dialogue: [speech A][speech B (dual)] wrapped together
        if para.t == Elem::Character {
            let end = speech_end(&p.paras, i);
            if end < p.paras.len() && p.paras[end].t == Elem::Character && p.paras[end].dual {
                let end2 = speech_end(&p.paras, end);
                o.push_str("    <Paragraph><DualDialogue>\n");
                for q in &p.paras[i..end2] {
                    o.push_str(&para_xml(q, None));
                }
                o.push_str("    </DualDialogue></Paragraph>\n");
                i = end2;
                continue;
            }
        }
        let num = if para.t == Elem::Scene {
            scene_no += 1;
            let m = para.meta.as_ref().map(|m| m.num.clone()).unwrap_or_default();
            Some(if m.is_empty() { scene_no.to_string() } else { m })
        } else {
            None
        };
        o.push_str(&para_xml(para, if p.settings.scene_numbers { num.as_deref() } else { None }));
        i += 1;
    }
    o.push_str("  </Content>\n  <TitlePage>\n    <Content>\n");
    let tp = &p.title_page;
    let center = |o: &mut String, s: &str| {
        o.push_str(&format!("      <Paragraph Alignment=\"Center\" Type=\"Title\"><Text>{}</Text></Paragraph>\n", esc(s)));
    };
    let blank = |o: &mut String| o.push_str("      <Paragraph Type=\"Title\"><Text></Text></Paragraph>\n");
    for _ in 0..18 {
        blank(&mut o);
    }
    for l in tp.title.lines() {
        center(&mut o, &l.to_uppercase());
    }
    blank(&mut o);
    center(&mut o, &tp.credit);
    blank(&mut o);
    for l in tp.author.lines() {
        center(&mut o, l);
    }
    if !tp.source.is_empty() {
        blank(&mut o);
        for l in tp.source.lines() {
            center(&mut o, l);
        }
    }
    for _ in 0..12 {
        blank(&mut o);
    }
    for l in tp.contact.lines().chain(tp.draft.lines()) {
        o.push_str(&format!("      <Paragraph Alignment=\"Left\" Type=\"Title\"><Text>{}</Text></Paragraph>\n", esc(l)));
    }
    o.push_str("    </Content>\n  </TitlePage>\n</FinalDraft>\n");
    o
}

fn speech_end(paras: &[Para], i: usize) -> usize {
    let mut j = i + 1;
    while j < paras.len() && matches!(paras[j].t, Elem::Dialogue | Elem::Paren | Elem::Lyric) {
        j += 1;
    }
    j
}

fn elem_from(t: &str) -> (Elem, u8) {
    match t {
        "Scene Heading" => (Elem::Scene, 0),
        "Action" => (Elem::Action, 0),
        "Character" => (Elem::Character, 0),
        "Parenthetical" => (Elem::Paren, 0),
        "Dialogue" => (Elem::Dialogue, 0),
        "Transition" => (Elem::Transition, 0),
        "Shot" => (Elem::Shot, 0),
        "Lyrics" => (Elem::Lyric, 0),
        "New Act" | "Outline 1" => (Elem::Section, 1),
        "Sequence" | "Outline 2" => (Elem::Section, 2),
        "Outline 3" => (Elem::Section, 3),
        "End of Act" => (Elem::Centered, 0),
        "Summary" | "Note" | "Outline Body" => (Elem::Note, 0),
        _ => (Elem::General, 0),
    }
}

fn read_runs(node: roxmltree::Node) -> Vec<Run> {
    let mut runs: Vec<Run> = Vec::new();
    for t in node.children().filter(|c| c.has_tag_name("Text")) {
        let style = t.attribute("Style").unwrap_or("");
        let mut s = 0;
        if style.contains("Bold") {
            s |= BOLD;
        }
        if style.contains("Italic") {
            s |= ITALIC;
        }
        if style.contains("Underline") {
            s |= UNDERLINE;
        }
        let x: String = t.text().unwrap_or("").to_string();
        if x.is_empty() {
            continue;
        }
        match runs.last_mut() {
            Some(r) if r.s == s => r.x.push_str(&x),
            _ => runs.push(Run { x, s }),
        }
    }
    if runs.is_empty() {
        runs.push(Run::default());
    }
    runs
}

fn read_para(node: roxmltree::Node, out: &mut Vec<Para>, in_dual: &mut Option<usize>) {
    if let Some(dd) = node.children().find(|c| c.has_tag_name("DualDialogue")) {
        let mut chars = 0;
        for c in dd.children().filter(|c| c.has_tag_name("Paragraph")) {
            let before = out.len();
            read_para(c, out, in_dual);
            if out.len() > before && out[before].t == Elem::Character {
                chars += 1;
                if chars == 2 {
                    out[before].dual = true;
                }
            }
        }
        return;
    }
    let (t, lvl) = elem_from(node.attribute("Type").unwrap_or("General"));
    let mut p = Para { t, lvl, runs: read_runs(node), ..Default::default() };
    if t == Elem::General && node.attribute("Alignment") == Some("Center") {
        p.t = Elem::Centered;
    }
    if t == Elem::Scene {
        let mut meta = SceneMeta::default();
        if let Some(n) = node.attribute("Number") {
            let _ = n; // automatic numbering is kept; manual numbers are not forced
        }
        if let Some(sp) = node.children().find(|c| c.has_tag_name("SceneProperties")) {
            if let Some(c) = sp.attribute("Color") {
                meta.color = c.to_string();
            }
            if let Some(sum) = sp.descendants().find(|c| c.has_tag_name("Summary")) {
                let txt: Vec<String> = sum
                    .descendants()
                    .filter(|c| c.has_tag_name("Text"))
                    .filter_map(|c| c.text().map(|s| s.to_string()))
                    .collect();
                meta.synopsis = txt.join("").trim().to_string();
            }
        }
        if meta != SceneMeta::default() {
            p.meta = Some(meta);
        }
    }
    let _ = in_dual;
    out.push(p);
}

pub fn import(xml: &str) -> Result<Project, String> {
    let doc = roxmltree::Document::parse(xml).map_err(|e| format!("Not a valid Final Draft file: {e}"))?;
    let root = doc.root_element();
    if !root.has_tag_name("FinalDraft") {
        return Err("Not a Final Draft (.fdx) file.".into());
    }
    let mut p = Project { paras: vec![], ..Default::default() };
    if let Some(content) = root.children().find(|c| c.has_tag_name("Content")) {
        let mut dual = None;
        for node in content.children().filter(|c| c.has_tag_name("Paragraph")) {
            read_para(node, &mut p.paras, &mut dual);
        }
    }
    if let Some(tp) = root.children().find(|c| c.has_tag_name("TitlePage")) {
        let lines: Vec<String> = tp
            .descendants()
            .filter(|c| c.has_tag_name("Paragraph"))
            .map(|n| read_runs(n).iter().map(|r| r.x.clone()).collect::<String>().trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let mut it = lines.into_iter().peekable();
        if let Some(t) = it.next() {
            p.title_page.title = t;
        }
        if let Some(c) = it.peek() {
            let l = c.to_lowercase();
            if l.contains("by") || l.contains("written") || l.contains("teleplay") || l.contains("story") {
                p.title_page.credit = it.next().unwrap();
                if let Some(a) = it.next() {
                    p.title_page.author = a;
                }
            }
        }
        p.title_page.contact = it.collect::<Vec<_>>().join("\n");
    }
    if p.paras.is_empty() {
        p.paras.push(Para::new(Elem::Scene, ""));
    }
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip() {
        let mut p = Project::default();
        p.title_page.title = "Test & Co".into();
        p.title_page.author = "A. Writer".into();
        let mut dual = Para::new(Elem::Character, "BOB");
        dual.dual = true;
        p.paras = vec![
            Para::new(Elem::Scene, "INT. LAB - DAY"),
            Para { t: Elem::Action, runs: vec![Run { x: "Bold ".into(), s: BOLD }, Run { x: "<plain>".into(), s: 0 }], ..Default::default() },
            Para::new(Elem::Character, "ANN"),
            Para::new(Elem::Dialogue, "One."),
            dual,
            Para::new(Elem::Dialogue, "Two."),
        ];
        let x = export(&p);
        let q = import(&x).unwrap();
        assert_eq!(q.paras.len(), p.paras.len());
        assert!(q.paras[4].dual);
        assert_eq!(q.paras[1].runs, p.paras[1].runs);
        assert_eq!(q.title_page.title, "TEST & CO");
        assert_eq!(q.title_page.author, "A. Writer");
    }
}
