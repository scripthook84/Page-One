//! Final Draft (.fdx) import and export, so scripts move freely between apps.

use crate::model::*;

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
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
            o.push_str(&format!(
                "<Text Style=\"{}\">{}</Text>",
                st.join("+"),
                esc(&r.x)
            ));
        }
    }
    o
}

fn para_xml(p: &Para, number: Option<&str>) -> String {
    let omitted = p.t == Elem::Scene && p.meta.as_ref().map(|m| m.omitted).unwrap_or(false);
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
    // an omitted scene keeps its number and prints OMITTED, as on the page
    let text = if omitted {
        vec![Run {
            x: "OMITTED".into(),
            s: 0,
        }]
    } else {
        p.runs.clone()
    };
    format!(
        "    <Paragraph {attrs}>{inner}{}</Paragraph>\n",
        texts(&text)
    )
}

const FONT: &str = r##"<FontSpec AdornmentStyle="0" Background="#FFFFFFFFFFFF" Color="#000000000000" Font="Courier Final Draft" RevisionID="0" Size="12" Style="{style}"/>"##;

/// Page layout, page-number header and element settings in Final Draft's own form, carrying
/// Page One's industry-standard metrics so Final Draft opens the script exactly as it prints here.
fn settings_xml(p: &Project) -> String {
    let s = &p.settings;
    let font = |style: &str| FONT.replace("{style}", style);
    let mut o = String::new();
    o.push_str("  <HeaderAndFooter FooterFirstPage=\"Yes\" FooterVisible=\"No\" HeaderFirstPage=\"No\" HeaderVisible=\"Yes\" StartingPage=\"1\">\n");
    o.push_str("    <Header>\n      <Paragraph Alignment=\"Right\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.50\" RightIndent=\"-1.00\" SpaceBefore=\"0\" Spacing=\"1\" StartsNewPage=\"No\">\n");
    if !s.header.trim().is_empty() {
        o.push_str(&format!(
            "        <Text Style=\"\">{}    </Text>\n",
            esc(s.header.trim())
        ));
    }
    o.push_str("        <DynamicLabel Type=\"Page #\"/>\n        <Text Style=\"\">.</Text>\n      </Paragraph>\n    </Header>\n");
    o.push_str("    <Footer>\n      <Paragraph Alignment=\"Right\" FirstIndent=\"0.00\" Leading=\"Regular\" LeftIndent=\"1.50\" RightIndent=\"-1.00\" SpaceBefore=\"0\" Spacing=\"1\" StartsNewPage=\"No\">\n        <Text Style=\"\"></Text>\n      </Paragraph>\n    </Footer>\n  </HeaderAndFooter>\n");
    // 1" top and bottom, page number 0.5" from the top, US Letter or A4
    let (w, h) = if s.page_size == "a4" {
        ("8.27", "11.69")
    } else {
        ("8.50", "11.00")
    };
    o.push_str(&format!(
        "  <PageLayout BackgroundColor=\"#FFFFFFFFFFFF\" BottomMargin=\"72\" BreakDialogueAndActionAtSentences=\"Yes\" DocumentLeading=\"Normal\" FooterMargin=\"36\" ForegroundColor=\"#000000000000\" HeaderMargin=\"36\" InvisiblesColor=\"#808080808080\" TopMargin=\"72\" UsesSmartQuotes=\"Yes\">\n    <AutoCastList AddParentheses=\"Yes\" AutomaticallyGenerate=\"No\" CastListElement=\"Cast List\"/>\n  </PageLayout>\n  <PageSize Height=\"{h}\" Width=\"{w}\"/>\n"
    ));
    let scene_style = if s.bold_scenes {
        "Bold+AllCaps"
    } else {
        "AllCaps"
    };
    let scene_before = (12 * s.scene_space.clamp(1, 2) as u32).to_string();
    // (type, style, alignment, first indent, left, right, space before, return key, shortcut)
    let elems: [(&str, &str, &str, &str, &str, &str, &str, &str, &str); 9] = [
        (
            "General", "", "Left", "0.00", "1.50", "7.50", "0", "General", "0",
        ),
        (
            "Scene Heading",
            scene_style,
            "Left",
            "0.00",
            "1.50",
            "7.50",
            &scene_before,
            "Action",
            "1",
        ),
        (
            "Action", "", "Left", "0.00", "1.50", "7.50", "12", "Action", "2",
        ),
        (
            "Character",
            "AllCaps",
            "Left",
            "0.00",
            "3.70",
            "7.50",
            "12",
            "Dialogue",
            "3",
        ),
        (
            "Parenthetical",
            "",
            "Left",
            "-0.10",
            "3.20",
            "5.25",
            "0",
            "Dialogue",
            "4",
        ),
        (
            "Dialogue", "", "Left", "0.00", "2.50", "6.00", "0", "Action", "5",
        ),
        (
            "Transition",
            "AllCaps",
            "Right",
            "0.00",
            "5.50",
            "7.50",
            "12",
            "Scene Heading",
            "6",
        ),
        (
            "Shot", "AllCaps", "Left", "0.00", "1.50", "7.50", "12", "Action", "7",
        ),
        (
            "Lyrics", "Italic", "Left", "0.00", "2.50", "6.00", "0", "Lyrics", "9",
        ),
    ];
    for (ty, style, align, first, left, right, before, ret, key) in elems {
        o.push_str(&format!(
            "  <ElementSettings Type=\"{ty}\">\n    {}\n    <ParagraphSpec Alignment=\"{align}\" FirstIndent=\"{first}\" Leading=\"Regular\" LeftIndent=\"{left}\" RightIndent=\"{right}\" SpaceBefore=\"{before}\" Spacing=\"1\" StartsNewPage=\"No\"/>\n    <Behavior PaginateAs=\"{ty}\" ReturnKey=\"{ret}\" Shortcut=\"{key}\"/>\n  </ElementSettings>\n",
            font(style)
        ));
    }
    o
}

/// (MORE)/(CONT'D) and scene-number placement, after the title page as Final Draft writes them.
fn options_xml(p: &Project) -> String {
    let s = &p.settings;
    let yn = |b: bool| if b { "Yes" } else { "No" };
    format!(
        "  <MoresAndContinueds>\n    {}\n    <DialogueBreaks AutomaticCharacterContinueds=\"{}\" BottomOfPage=\"{}\" DialogueBottom=\"(MORE)\" DialogueTop=\"(CONT'D)\" TopOfNext=\"{}\"/>\n    <SceneBreaks ContinuedNumber=\"No\" SceneBottom=\"(CONTINUED)\" SceneBottomOfPage=\"No\" SceneTop=\"CONTINUED:\" SceneTopOfNext=\"No\"/>\n  </MoresAndContinueds>\n  <SceneNumberOptions LeftLocation=\"0.90\" NumberScheme=\"1A\" RightLocation=\"7.80\" ShowNumbersOnLeft=\"Yes\" ShowNumbersOnRight=\"Yes\"/>\n",
        FONT.replace("{style}", ""),
        yn(s.conts),
        yn(s.mores),
        yn(s.mores)
    )
}

pub fn export(p: &Project) -> String {
    let mut o = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\" ?>\n<FinalDraft DocumentType=\"Script\" Template=\"No\" Version=\"5\">\n  <Content>\n",
    );
    // the same numbers the printed page carries (locked numbers such as 12A included)
    let nums = crate::layout::scene_numbers_for(p);
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
        let locked = para
            .meta
            .as_ref()
            .map(|m| !m.num.trim().is_empty())
            .unwrap_or(false);
        let num = if para.t == Elem::Scene && (p.settings.scene_numbers || locked) {
            nums[i].as_deref()
        } else {
            None
        };
        o.push_str(&para_xml(para, num));
        i += 1;
    }
    o.push_str("  </Content>\n");
    o.push_str(&settings_xml(p));
    o.push_str("  <TitlePage>\n    <Content>\n");
    let tp = &p.title_page;
    let center = |o: &mut String, s: &str| {
        o.push_str(&format!(
            "      <Paragraph Alignment=\"Center\" Type=\"Title\"><Text>{}</Text></Paragraph>\n",
            esc(s)
        ));
    };
    let blank =
        |o: &mut String| o.push_str("      <Paragraph Type=\"Title\"><Text></Text></Paragraph>\n");
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
        o.push_str(&format!(
            "      <Paragraph Alignment=\"Left\" Type=\"Title\"><Text>{}</Text></Paragraph>\n",
            esc(l)
        ));
    }
    o.push_str("    </Content>\n  </TitlePage>\n");
    o.push_str(&options_xml(p));
    o.push_str("</FinalDraft>\n");
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
    let mut p = Para {
        t,
        lvl,
        runs: read_runs(node),
        ..Default::default()
    };
    if t == Elem::General && node.attribute("Alignment") == Some("Center") {
        p.t = Elem::Centered;
    }
    if t == Elem::Scene {
        let mut meta = SceneMeta::default();
        if let Some(n) = node.attribute("Number") {
            // kept for now; after the whole file is read, numbers that match the automatic
            // sequence are released and only locked ones (12A, or out of sequence) stay
            meta.num = n.trim().to_string();
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
    let doc = roxmltree::Document::parse(xml)
        .map_err(|e| format!("Not a valid Final Draft file: {e}"))?;
    let root = doc.root_element();
    if !root.has_tag_name("FinalDraft") {
        return Err("Not a Final Draft (.fdx) file.".into());
    }
    let mut p = Project {
        paras: vec![],
        ..Default::default()
    };
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
            .map(|n| {
                read_runs(n)
                    .iter()
                    .map(|r| r.x.clone())
                    .collect::<String>()
                    .trim()
                    .to_string()
            })
            .filter(|s| !s.is_empty())
            .collect();
        let mut it = lines.into_iter().peekable();
        if let Some(t) = it.next() {
            p.title_page.title = t;
        }
        if let Some(c) = it.peek() {
            let l = c.to_lowercase();
            if l.contains("by")
                || l.contains("written")
                || l.contains("teleplay")
                || l.contains("story")
            {
                p.title_page.credit = it.next().unwrap();
                if let Some(a) = it.next() {
                    p.title_page.author = a;
                }
            }
        }
        p.title_page.contact = it.collect::<Vec<_>>().join("\n");
    }
    release_auto_numbers(&mut p);
    // spacing before scene headings, as the file sets it (24 pt = two blank lines)
    for es in root.children().filter(|c| {
        c.has_tag_name("ElementSettings") && c.attribute("Type") == Some("Scene Heading")
    }) {
        if let Some(ps) = es.children().find(|c| c.has_tag_name("ParagraphSpec")) {
            if let Some(sb) = ps
                .attribute("SpaceBefore")
                .and_then(|v| v.parse::<u32>().ok())
            {
                p.settings.scene_space = if sb >= 24 { 2 } else { 1 };
            }
        }
        if let Some(fs) = es.children().find(|c| c.has_tag_name("FontSpec")) {
            p.settings.bold_scenes = fs
                .attribute("Style")
                .map(|v| v.contains("Bold"))
                .unwrap_or(false);
        }
    }
    if p.paras.is_empty() {
        p.paras.push(Para::new(Elem::Scene, ""));
    }
    Ok(p)
}

/// Final Draft stores a number on every scene once numbering is on. Keep only the numbers that
/// differ from the automatic sequence (locked ones such as 12A), so the rest renumber as usual.
fn release_auto_numbers(p: &mut Project) {
    let mut any = false;
    let mut last = 0u32;
    for para in p.paras.iter_mut().filter(|x| x.t == Elem::Scene) {
        let Some(m) = para.meta.as_mut() else {
            last += 1;
            continue;
        };
        if m.num.is_empty() {
            last += 1;
            continue;
        }
        any = true;
        let expected = (last + 1).to_string();
        if m.num == expected {
            m.num.clear();
            last += 1;
        } else {
            let digits: String = m.num.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(v) = digits.parse::<u32>() {
                last = v;
            }
        }
    }
    if any {
        p.settings.scene_numbers = true;
    }
    for para in p.paras.iter_mut() {
        if para
            .meta
            .as_ref()
            .map(|m| *m == SceneMeta::default())
            .unwrap_or(false)
        {
            para.meta = None;
        }
    }
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
            Para {
                t: Elem::Action,
                runs: vec![
                    Run {
                        x: "Bold ".into(),
                        s: BOLD,
                    },
                    Run {
                        x: "<plain>".into(),
                        s: 0,
                    },
                ],
                ..Default::default()
            },
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

    #[test]
    fn scene_numbers_and_settings() {
        let mut p = Project::default();
        p.settings.scene_numbers = true;
        let mut locked = Para::new(Elem::Scene, "INT. B - DAY");
        locked.meta = Some(SceneMeta {
            num: "12A".into(),
            ..Default::default()
        });
        let mut omitted = Para::new(Elem::Scene, "INT. C - DAY");
        omitted.meta = Some(SceneMeta {
            omitted: true,
            ..Default::default()
        });
        p.paras = vec![
            Para::new(Elem::Scene, "INT. A - DAY"),
            Para::new(Elem::Action, "One."),
            locked,
            Para::new(Elem::Action, "Two."),
            omitted,
            Para::new(Elem::Scene, "EXT. D - NIGHT"),
        ];
        let x = export(&p);
        // numbers as printed: 1, 12A, 13 (omitted keeps its number), 14
        assert!(
            x.contains(r#"<Paragraph Type="Scene Heading" Number="1">"#),
            "{x}"
        );
        assert!(x.contains(r#"Number="12A""#));
        assert!(x.contains(r#"Number="13"><Text>OMITTED</Text>"#), "{x}");
        assert!(x.contains(r#"Number="14""#));
        assert!(x.contains("<SceneNumberOptions"));
        assert!(x.contains(r#"<ElementSettings Type="Scene Heading">"#));
        assert!(x.contains(r#"SpaceBefore="24""#)); // two blank lines, Final Draft's default
        assert!(x.contains(r#"LeftIndent="2.50" RightIndent="6.00""#)); // dialogue
        let q = import(&x).unwrap();
        assert!(q.settings.scene_numbers);
        assert_eq!(q.settings.scene_space, 2);
        let nums: Vec<String> = q
            .paras
            .iter()
            .filter(|x| x.t == Elem::Scene)
            .map(|x| x.meta.as_ref().map(|m| m.num.clone()).unwrap_or_default())
            .collect();
        // only the locked number stays; the rest number themselves
        assert_eq!(nums, vec!["", "12A", "", ""]);
        // without numbering switched on, no numbers are written
        p.settings.scene_numbers = false;
        p.paras[2].meta = None;
        assert!(!export(&p).contains(" Number=\""));
    }
}
