<img width="128" height="128" alt="Page One" src="ui/icon.png" />

# Page One

Page One is a lightweight, open-source screenwriting app. It formats your script to the industry
standard as you type, keeps your whole story in view with a scene navigator and a story board, and
exports print-ready PDF. It takes the parts writers like most in Final Draft and Fade In, combines
them, and leaves the rest out.

It is free, works offline, needs no account, and the installer is about 2 MB.

**Version 1.0** · Linux (.deb) · built on the Novelcraft desktop framework (Rust + Tauri)

---

## Writing

- **Industry-standard page, live.** Courier 12 pt, 1.5" left margin, 1" top, right and bottom
  margins, 54 lines per page. Dialogue sits at 2.5–6.0", character cues at 3.7", parentheticals at
  3.1–5.25", and transitions end at 7.5". Page breaks appear in the editor exactly where they fall in
  the PDF.
- **Enter and Tab flow** (Final Draft defaults). Enter after a scene heading gives Action, after a
  character gives Dialogue, and after a transition gives a Scene Heading. Tab on an empty line
  cycles the element: Action → Character → Transition → Scene. Enter on an empty line opens the
  element list.
- **Flow bar.** The bar at the bottom always shows the current element and what Enter and Tab will
  do next, so new writers learn screenplay structure as they type.
- **SmartType.** Suggestions for character names (most frequent first), extensions such as
  (V.O.), (O.S.) and (CONT'D), scene intros, locations you've used, times of day and transitions.
  Tab inside a scene heading moves from INT. to the location to the time.
- **Shortcuts that save keystrokes.** Type `int.` or `ext.` on an action line and it becomes a scene
  heading, and `int apartment day` is tidied to `INT. APARTMENT - DAY` when you press Enter. Type `(`
  on a dialogue line to start a parenthetical; the brackets close themselves.
- **New scripts open on a blank scene heading**, ready to type.
- **Ctrl+0…9** switch elements: General, Scene, Action, Character, Parenthetical, Dialogue,
  Transition, Shot, Centered, Lyric.
- **Automatic (MORE) / (CONT'D)** when dialogue breaks across pages (split at a sentence), and
  automatic (CONT'D) when a character keeps talking after action — shown live on the page. Scene
  headings and character cues are never left alone at the bottom of a page.
- **Dual dialogue, live** (Ctrl+Alt+D). The two speeches sit side by side in the editor in exactly
  the columns they print in, and you keep typing in either one.
- Bold, italic and underline, and a soft line break with Shift+Enter.
- **Acts stay off the page.** As in a real script, ACT ONE, ACT TWO and the like never appear in
  the screenplay; they are made and edited on the story board and also divide the navigator's scene
  list. Notes (Ctrl+Shift+4) are collected on the Notes tab and never print.
- **Dark mode and focus mode, one click away** at the top right. Focus mode goes full screen on a
  completely blank sheet (no holes, no panels, the line you're writing kept centred). A small
  toolbar at the bottom left switches between **Fit width** and a **100–200 %** text size; Esc
  leaves. Day, Night and Midnight themes (Midnight pairs a dark desk with a white page); zoom
  60–200%.
- Unlimited undo, find and replace, go to page, and spell checking from your system dictionary.

## Organizing

- **Navigator.** Scene list with numbers, length in eighths of a page, colours and synopses. Filter
  it, click to jump, and drag to reorder scenes or whole acts. Alt+Shift+↑/↓ moves the current scene.
- **Story board — a magic snap grid.** Every scene is a card in one grid, linked by arrows in story
  order. Cards always snap to a cell, by row and by column. Choose whether the story reads in
  **rows** (left to right, then down) or **columns** (top to bottom, then right), and how many cards
  fit per row or column. Drop a card on an empty cell and it lands there; drop it on a card and it
  slides in before it, nudging the cards after it along to the next free cell. Empty cells you leave
  stay empty until **Tidy up**. The grid's reading order is the story order, so the screenplay is
  reordered the moment you let go (Ctrl+Z puts it back). Click a card's text to write its synopsis,
  its dot to colour it, and double-click to open the scene.
- **Act labels** (board panel, left). Create ACT 1, ACT 2 … labels with a name, a colour and the
  scene they start before; rename, recolour or remove them in place, or drag an act label to another
  cell to change where the act begins. Acts are markers above the grid: adding, removing or moving
  one never moves a card. Each card shows its act's colour along its top edge.
- **Colour key** (board panel, left). The nine standard colours — red, orange, yellow, green, blue,
  indigo, violet, pink, gray, all light enough for black text. Type what each one means ("B story",
  "Flashback"); click a colour to highlight its scenes on the board.
- **Scene inspector.** Synopsis, colour, notes, a locked scene number (such as 12A), and an omit
  option for the scene under the cursor, plus who speaks in it.
- **Characters.** Lines, words and scenes for every speaker, a colour and bio for each, and jump to
  their first line.
- **Dialogue tuner.** Read and edit one character's lines on their own to tune their voice.
- **Rename character** in cues and, optionally, everywhere the name appears.
- **Reports.** Scene, character and location breakdowns (interior/exterior, day/night, page
  eighths), sortable and copyable as CSV.
- **Target length.** A progress bar toward your page goal, a running time estimate (1 page ≈ 1
  minute) and the words written today.

## Production

- Scene numbers in both margins, locked or manual numbers, and omitted scenes.
- Revision mode in the standard colour order (Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon,
  Cherry). Changed lines get an asterisk in the right margin and a revision header.
- Title page with title, credit, author, source, contact (bottom left) and draft date (bottom
  right), laid out to standard metrics with a live preview.
- Watermarked PDF exports for readers.

## Files

- **.pageone** is Page One's own format. It is a compact binary container: a magic header, a
  CRC-32 checksum and a DEFLATE-compressed MessagePack document. A feature script is typically
  30–60 KB, a fraction of the plain-text size, and other programs won't open it as text. The
  format is documented in [docs/FILE-FORMAT.md](docs/FILE-FORMAT.md). Page One is open source, so
  the format is open too; it is not encryption.
- Saving writes a temporary file and renames it over the original, so a crash can't leave a
  half-written script. The previous 20 versions of each script are kept in
  `~/.local/share/app.pageone.desktop/backups`.
- Autosave runs every minute once a script has been saved, and you are asked to save before
  anything is lost. Unsaved work, even in a script that was never saved, is mirrored every 20
  seconds; after a crash, the welcome screen offers to recover it.
- **Import:** Fountain (`.fountain`, `.spmd`, `.txt`) and Final Draft (`.fdx`). Pasting Fountain
  text formats it automatically.
- **Export:** PDF (with the Courier Prime font embedded), Final Draft `.fdx`, Fountain and formatted
  plain text.
- Page One makes no network connections.

## Keyboard

| Keys | Action |
|---|---|
| Enter / Tab / Shift+Tab | Next element / cycle element / cycle back |
| Ctrl+0…9 | General, Scene, Action, Character, Paren, Dialogue, Transition, Shot, Centered, Lyric |
| Ctrl+Shift+1, Ctrl+Shift+2/3, Ctrl+Shift+4 | New act label (board), sequence or beat, note |
| Ctrl+K | Command palette — every command, searchable |
| Ctrl+Alt+1 / Ctrl+Alt+2 | Script / story board |
| Alt+Shift+↑ / ↓ | Move the current scene up / down |
| Ctrl+Alt+D, Ctrl+Alt+T, Ctrl+Shift+R | Dual dialogue, dialogue tuner, reports |
| Ctrl+F, Ctrl+H, Ctrl+G | Find, replace, go to page |
| Ctrl+S, Ctrl+Shift+S, Ctrl+P | Save, save as, export PDF |
| Ctrl+Shift+F, Ctrl+Shift+L | Focus mode (full screen; Esc leaves), dark mode |

---

## How Page One compares

| | **Page One** | **Final Draft 13** | **Fade In** |
|---|---|---|---|
| Price | Free, open source (Apache 2.0) | $199.99 one-time, or $99.99/year as Final Draft Suite | $79.95 one-time, updates free |
| Linux | Yes (.deb) | No | Yes |
| Windows and macOS | Build from source (not yet tested) | Yes | Yes |
| Phone and tablet | No | Final Draft Go for iOS, sold separately | Fade In Mobile for iOS and Android, sold separately |
| Account or activation | None | Sign-in; two computers active at once | License key |
| Formats as you type (Enter/Tab flow, SmartType) | Yes | Yes | Yes |
| Live page breaks with (MORE) / (CONT'D) | Yes | Yes | Yes |
| Dual dialogue | Yes, side by side while you type | Yes | Yes |
| Planning view | Snap-grid story board (rows or columns), act labels that never move cards, drag to reorder the script live | Beat Board, Outline Editor and index cards | Index cards |
| Colour key with your own labels | Yes | — | — |
| Dialogue tuner | Yes | — | Yes |
| Revision colours | Yes | Yes | Yes |
| Page locking and A-pages | No | Yes | Yes |
| Real-time collaboration | No | Yes | Yes |
| Fountain | Opens and saves | Not listed in the Final Draft 13 User Guide | Opens and saves |
| Final Draft .fdx | Opens and saves | Native format | Opens and saves |
| Own file format | `.pageone`: compact binary, documented | `.fdx` (XML) | `.fadein` (zipped XML) |

Prices and platforms are as published by each vendor in October 2026 (the Final Draft store and
knowledge base, and Fade In's product listing). Feature entries for Final Draft come from the
Final Draft 13 User Guide; "—" means the feature isn't offered or wasn't found in the sources
checked. Check each vendor's site for current details.

### What Page One doesn't do yet

- Real-time collaboration, track changes, and page locking with A-pages
- PDF import, and templates for TV, multi-camera and stage formats
- Production tagging and scheduling exports
- Phone and tablet apps; Windows and macOS builds are possible from the same source but untested

---

## Install

### Ubuntu, Debian, Linux Mint, Pop!_OS

```bash
sudo apt install ./Page-One_1.0.0_amd64.deb
```

Page One appears in your applications menu, and `.pageone` files open with it on double-click. To
remove it: `sudo apt remove page-one`.

It needs WebKitGTK 4.1 (`libwebkit2gtk-4.1-0`), which ships with Ubuntu 22.04+, Debian 12+ and
current Mint and Pop!_OS; apt installs it automatically if it's missing.

---

## Building from source

Requirements: [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 18+, and on Linux:

```bash
sudo apt install build-essential pkg-config file patchelf libwebkit2gtk-4.1-dev \
  libgtk-3-dev libssl-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev
```

```bash
npm install
npm run build          # → target/release/bundle/deb/Page One_1.0.0_amd64.deb
npm test               # core tests: format, pagination, Fountain, FDX
npm run preview        # interface in a browser at http://127.0.0.1:8787 (no install needed)
```

### Layout of the source

| Path | What it is |
|---|---|
| `crates/core` | Everything that isn't UI, in Rust: the document model, the `.pageone` codec, pagination (the one source of truth for page breaks), and the PDF, Fountain, FDX and text exporters |
| `src-tauri` | The desktop shell: native file dialogs, saving with backups, file association, packaging |
| `ui` | The interface: plain HTML, CSS and JavaScript modules, no build step |
| `ui/js/editor.js` | The screenplay editor — element flow, SmartType, undo, clipboard |
| `samples` | An example script in Fountain and `.pageone` |

---

## Credits and license

Page One is distributed under the Apache License 2.0 (see [LICENSE](LICENSE)). It is built on the
Novelcraft desktop framework.

Courier Prime © The Courier Prime Project Authors, used under the SIL Open Font License 1.1
(`crates/core/fonts/OFL.txt`).

Page One is an independent project and is not affiliated with Final Draft, Inc., Fade In
(GCC Productions) or the Fountain project. Final Draft is a trademark of its owner; `.fdx` support
exists so writers can move their own scripts between apps.
