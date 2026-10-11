<img width="128" height="128" alt="Page One" src="ui/icon.png" />

# Page One

Page One is a lightweight, open-source screenwriting app. It formats your script to the industry
standard as you type, keeps your whole story in view with a scene navigator and index cards, and
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
  heading. Type `(` on a dialogue line to start a parenthetical; the brackets close themselves.
- **Ctrl+0…9** switch elements: General, Scene, Action, Character, Parenthetical, Dialogue,
  Transition, Shot, Centered, Lyric.
- **Automatic (MORE) / (CONT'D)** when dialogue breaks across pages (split at a sentence), and
  automatic (CONT'D) when a character keeps talking after action. Scene headings and character
  cues are never left alone at the bottom of a page.
- **Dual dialogue** (Ctrl+Alt+D), bold, italic and underline, a soft line break with Shift+Enter.
- **Acts, sequences and beats stay off the page.** As in a real script, structure headings never
  appear in the screenplay. Add them with **+ Act** in the navigator (or Ctrl+Shift+1/2/3) and they
  divide the scene list and the index-card board; click one to rename it, give it a summary, or
  delete it, and drag it to move the whole act. Notes (Ctrl+Shift+4) are collected on the Notes tab
  and never print.
- Focus mode, typewriter scrolling, and Day, Night and Midnight themes (Midnight pairs a dark desk
  with a white page). Zoom is 60–200%.
- Unlimited undo, find and replace, go to page, and spell checking from your system dictionary.

## Organizing

- **Navigator.** Scene list with numbers, length in eighths of a page, colours and synopses. Filter
  it, click to jump, and drag to reorder scenes or whole acts.
- **Index cards.** Each scene is a ruled 3×5 card with its colour, synopsis, page and length. Drag
  cards to restructure the script; acts and sequences divide the board.
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
  anything is lost.
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
| Ctrl+Shift+1/2/3, Ctrl+Shift+4 | New act, sequence or beat (navigator only), note |
| Ctrl+K | Command palette — every command, searchable |
| Ctrl+Alt+1 / Ctrl+Alt+2 | Script / index cards |
| Ctrl+Alt+D, Ctrl+Alt+T, Ctrl+Shift+R | Dual dialogue, dialogue tuner, reports |
| Ctrl+F, Ctrl+H, Ctrl+G | Find, replace, go to page |
| Ctrl+S, Ctrl+Shift+S, Ctrl+P | Save, save as, export PDF |
| Ctrl+Shift+F | Focus mode (Esc leaves) |

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
