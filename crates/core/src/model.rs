//! The screenplay document model shared by the app, the file format and every exporter.

use serde::{Deserialize, Serialize};

/// Paragraph (element) types. Names follow industry usage; `Section` and `Note`
/// never print — they exist to organise the draft on screen.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
#[serde(rename_all = "lowercase")]
pub enum Elem {
    Scene,
    #[default]
    Action,
    Character,
    Paren,
    Dialogue,
    Transition,
    Shot,
    General,
    Centered,
    Lyric,
    /// Outline heading (Act / Sequence / Beat) — non-printing.
    Section,
    /// Writer's note — non-printing.
    Note,
    #[serde(other)]
    Unknown,
}

impl Elem {
    pub fn printable(self) -> bool {
        !matches!(self, Elem::Section | Elem::Note)
    }
    pub fn uppercase(self) -> bool {
        matches!(self, Elem::Scene | Elem::Character | Elem::Transition | Elem::Shot)
    }
    pub fn label(self) -> &'static str {
        match self {
            Elem::Scene => "Scene Heading",
            Elem::Action => "Action",
            Elem::Character => "Character",
            Elem::Paren => "Parenthetical",
            Elem::Dialogue => "Dialogue",
            Elem::Transition => "Transition",
            Elem::Shot => "Shot",
            Elem::General | Elem::Unknown => "General",
            Elem::Centered => "Centered",
            Elem::Lyric => "Lyric",
            Elem::Section => "Section",
            Elem::Note => "Note",
        }
    }
}

pub const BOLD: u8 = 1;
pub const ITALIC: u8 = 2;
pub const UNDERLINE: u8 = 4;

/// A run of text sharing one style (bit set of BOLD | ITALIC | UNDERLINE).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct Run {
    pub x: String,
    #[serde(skip_serializing_if = "is_zero")]
    pub s: u8,
}

fn is_zero(v: &u8) -> bool {
    *v == 0
}
fn is_false(v: &bool) -> bool {
    !*v
}

/// Extra data a scene heading (or section) carries for the navigator and cards.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct SceneMeta {
    #[serde(skip_serializing_if = "String::is_empty")]
    pub color: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub synopsis: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub notes: String,
    /// Locked / manual scene number (e.g. "12A"). Empty = automatic.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub num: String,
    #[serde(skip_serializing_if = "is_false")]
    pub omitted: bool,
    /// Free position on the story board when auto-snap is off.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pos: Option<[f32; 2]>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct Para {
    pub t: Elem,
    pub runs: Vec<Run>,
    /// On a Character paragraph: this speech sits beside the previous one (dual dialogue).
    #[serde(skip_serializing_if = "is_false")]
    pub dual: bool,
    /// Revision level that last touched this paragraph (0 = none).
    #[serde(skip_serializing_if = "is_zero")]
    pub rev: u8,
    /// Section depth (1 = Act, 2 = Sequence, 3 = Beat).
    #[serde(skip_serializing_if = "is_zero")]
    pub lvl: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<SceneMeta>,
}

impl Para {
    pub fn new(t: Elem, text: &str) -> Self {
        Para { t, runs: vec![Run { x: text.to_string(), s: 0 }], ..Default::default() }
    }
    pub fn text(&self) -> String {
        self.runs.iter().map(|r| r.x.as_str()).collect()
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct TitlePage {
    pub title: String,
    pub credit: String,
    pub author: String,
    pub source: String,
    pub draft: String,
    pub contact: String,
    pub notes: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub scene_numbers: bool,
    /// Automatic (CONT'D) on a character who keeps talking after action.
    pub conts: bool,
    /// (MORE)/(CONT'D) when dialogue breaks across pages.
    pub mores: bool,
    /// Two blank lines before scene headings instead of one.
    pub scene_space: u8,
    pub bold_scenes: bool,
    pub page_size: String,
    /// Active revision colour index (0 = revisions off).
    pub rev_level: u8,
    pub header: String,
    pub title_page: bool,
    pub target_pages: u32,
    /// Story board arrangement: "line" or "columns".
    pub board_mode: String,
    /// Story board cards snap into place (false = free-floating).
    pub board_snap: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            scene_numbers: false,
            conts: true,
            mores: true,
            scene_space: 1,
            bold_scenes: false,
            page_size: "letter".into(),
            rev_level: 0,
            header: String::new(),
            title_page: true,
            target_pages: 110,
            board_mode: "line".into(),
            board_snap: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(default)]
pub struct CharacterCard {
    pub name: String,
    pub color: String,
    pub bio: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Project {
    pub version: u32,
    pub title_page: TitlePage,
    pub paras: Vec<Para>,
    pub settings: Settings,
    pub notes: String,
    pub characters: Vec<CharacterCard>,
    /// Writer-added SmartType entries (locations, extensions, transitions …).
    pub smart: Vec<String>,
    /// Writer's names for the scene colours, e.g. "#b9e4a8" → "B story".
    pub color_labels: std::collections::BTreeMap<String, String>,
    pub created: u64,
    pub modified: u64,
}

impl Default for Project {
    fn default() -> Self {
        Project {
            version: 1,
            title_page: TitlePage { credit: "Written by".into(), ..Default::default() },
            paras: vec![Para::new(Elem::Scene, "")],
            settings: Settings::default(),
            notes: String::new(),
            characters: vec![],
            smart: vec![],
            color_labels: Default::default(),
            created: 0,
            modified: 0,
        }
    }
}

/// Revision colours in the WGA/production order.
pub const REVISIONS: &[(&str, &str)] = &[
    ("None", "#ffffff"),
    ("Blue", "#7fb2ff"),
    ("Pink", "#ff9ecb"),
    ("Yellow", "#ffe066"),
    ("Green", "#8fdb8f"),
    ("Goldenrod", "#e8b33f"),
    ("Buff", "#e9d8a6"),
    ("Salmon", "#ff9e85"),
    ("Cherry", "#e0475b"),
];
