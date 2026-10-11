<img width="250" height="250" alt="Page One" src="https://github.com/user-attachments/assets/390777f1-1224-4a7b-99df-b0c0c13637b6" />


# Page One

A lightweight, open-source screenwriting app. Built by a screenwriter for screenwriters. Page One formats your script to the industry
standard as you type, lays your story out on a snap-to-grid story board, and exports print-ready
PDF. It's free, works offline, needs no account, and the installer is about 2 MB.

**Version 1.0.0** · Linux (.deb) · Apache License 2.0

---

## Highlights

- **Industry-standard pages, live.** Page breaks, (MORE) and (CONT'D), and dual dialogue appear in
  the editor exactly as they print.
- **Writes the format for you.** Enter and Tab move through scene heading, action, character,
  parenthetical, dialogue and transition; suggestions fill in names, locations and times of day.
- **A story board that snaps.** Scenes are cards on one grid. Drag a card and the script reorders
  the moment you let go.
- **Acts off the page.** Act labels live on the board and in the navigator, never in the script.
- **Focus mode.** One click for a full-screen blank page, sized to fit or from 100 to 200 %.
- **Your files, your format.** Compact `.pageone` files, plus Fountain and Final Draft (`.fdx`)
  in and out.

---

## Writing

- **The page.** Courier 12 pt on US Letter: 1.5" left margin, 1" top, right and bottom, 54 lines per
  page. Dialogue runs 2.5–6.0", character cues sit at 3.7", parentheticals at 3.1–5.25", and
  transitions end at 7.5". Page numbers ("2.") start on page 2.
- **Element flow.** Enter continues the scene the way scripts are written: scene heading to action,
  character to dialogue, transition to scene heading. Tab on an empty line cycles through action,
  character, transition and scene heading; Enter on an empty line lists every element.
  **Ctrl+0…9** switch elements directly.
- **Flow bar.** The bar at the bottom always shows the current element and what Enter and Tab will
  do next.
- **Suggestions.** Character names (most frequent first), extensions such as (V.O.) and (O.S.), scene
  intros, locations you've used, times of day and transitions.
- **Small things that save time.** `int.` or `ext.` on an action line becomes a scene heading;
  `int apartment day` is tidied to `INT. APARTMENT - DAY`; `(` on a dialogue line starts a
  parenthetical and closes the brackets for you; an open extension like `OTIS (V.O.` is closed on
  Enter.
- **Dual dialogue** (Ctrl+Alt+D) side by side while you type, in the columns it prints in.
- **Automatic (CONT'D)** when a character keeps talking after action, shown on the page. Scene
  headings and character cues are never stranded at the foot of a page; dialogue breaks at a
  sentence with (MORE) and (CONT'D).
- Bold, italic, underline; Shift+Enter for a line break inside a paragraph; notes that never print.
- **Dark mode** and **focus mode** at the top right. Focus mode goes full screen on a blank sheet,
  keeps the line you're writing centred, and has a small toolbar at the bottom left for **Fit width**
  or **100–200 %**. Esc leaves.
- Unlimited undo, find and replace, go to page, spell checking from your system dictionary, and a
  command palette (Ctrl+K) that finds every command.

## Storyboard

- **One grid.** Every scene is a card that snaps to a cell, by row and by column, linked to the next
  scene by an arrow. Inside each act the story reads in **rows** (left to right, then down) or
  **columns** (top to bottom, then right); set how many cards fit per row or column.
- **Magic snap.** Drop a card on an empty cell and it lands there. Drop it on a card and it slides
  in before it, nudging that act's following cards along. Empty cells stay until **Tidy up**. The
  screenplay reorders as soon as you let go; Ctrl+Z puts it back.
- **Act lanes.** Act labels sit in a header row above the grid; a new label is one card wide. Drag a
  label's right edge to stretch it across more columns, or drag the label to move where the act
  begins; it snaps column by column. Acts sit side by side, so every card is under exactly one act
  label, belongs to that act, and takes its colour, and each act's columns are tinted as a lane. A
  card's own scene colour shows as a band along its top.
- **Acts never move cards.** Create ACT 1, ACT 2 … in the panel on the left with a name and a
  colour; the first act covers the scenes already on the board and later ones start in the first free
  column on the right. Rename, recolour or remove them in place. Adding, removing, moving or
  stretching an act changes which act a card belongs to, never where the card is.
- **Colour key.** Nine standard colours (red, orange, yellow, green, blue, indigo, violet, pink,
  gray), all light enough for black text. Name what each one means ("B story", "Flashback") and click
  a colour to highlight its scenes.
- Click a card's text to write its synopsis, its dot to colour it, double-click to open the scene.

## Organizing and production

- **Navigator.** The scene list with numbers, length in eighths of a page, colours and synopses;
  filter it, click to jump, drag to reorder. Alt+Shift+↑/↓ moves the current scene.
- **Scene inspector.** Synopsis, colour, notes, a locked scene number (such as 12A) and an omit
  option for the scene under the cursor, plus who speaks in it.
- **Characters.** Lines, words and scenes per speaker, with a colour and bio for each.
- **Dialogue tuner.** One character's lines on their own, editable in place.
- **Rename character** in cues and, if you like, everywhere the name appears.
- **Reports.** Scenes, characters and locations (interior/exterior, day/night, page eighths),
  sortable and copyable as CSV.
- **Target length.** Progress toward your page goal, a running time estimate (1 page ≈ 1 minute)
  and the words written today.
- **Production.** Scene numbers in both margins, omitted scenes, revision mode in the standard
  colour order (Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry) with asterisks and a
  revision header, a title page laid out to standard metrics, and watermarked PDFs.

## Files

- **`.pageone`** is a compact binary file: a magic header, a CRC-32 checksum and a DEFLATE-compressed
  MessagePack document. A feature script is typically 30–60 KB, about a third of its plain-text
  size, and other programs won't open it as text. The format is documented in
  [docs/FILE-FORMAT.md](docs/FILE-FORMAT.md); it's open, not encrypted.
- Saving writes a temporary file and renames it over the original, so a crash can't leave a
  half-written script. The last 20 versions of each script are kept in
  `~/.local/share/app.pageone.desktop/backups`.
- Autosave runs every minute once a script has a home on disk. Unsaved work — even a script that
  was never saved — is mirrored every 20 seconds, and the start screen offers to recover it after a
  crash.
- **Import:** Fountain (`.fountain`, `.spmd`, `.txt`) and Final Draft (`.fdx`). Pasting Fountain
  text formats it.
- **Export:** PDF with the font embedded, Final Draft `.fdx`, Fountain and formatted plain text.
- Page One makes no network connections.

---

## How Page One compares

| | **Page One** | **Final Draft 13** | **Fade In** |
|---|---|---|---|
| Price | Free, open source (Apache 2.0) | $199.99 one-time, or $99.99/year as Final Draft Suite | $79.95 one-time, updates free |
| Linux | Yes (.deb) | No | Yes |
| Windows and macOS | Yes| Yes | Yes |
| Phone and tablet | No | Final Draft Go for iOS, sold separately | Fade In Mobile for iOS and Android, sold separately |
| Account or activation | None | Sign-in; two computers active at once | License key |
| Formats as you type (element flow, suggestions) | Yes | Yes | Yes |
| Live page breaks with (MORE) / (CONT'D) | Yes | Yes | Yes |
| Dual dialogue | Yes, side by side while you type | Yes | Yes |
| Planning view | Snap-grid story board with colour-coded act lanes you stretch across columns; drag cards to reorder the script live | Beat Board, Outline Editor and index cards | Index cards |
| Colour key with your own labels | Yes | — | — |
| Dialogue tuner | Yes | — | Yes |
| Revision colours | Yes | Yes | Yes |
| Page locking and A-pages | No | Yes | Yes |
| Real-time collaboration | No | Yes | Yes |
| Fountain | Opens and saves | Not listed in the Final Draft 13 User Guide | Opens and saves |
| Final Draft .fdx | Opens and saves | Native format | Opens and saves |
| Own file format | `.pageone`: compact binary, documented | `.fdx` (XML) | `.fadein` (zipped XML) |

Prices and platforms are as published by each vendor in October 2026 (the Final Draft store and
knowledge base, and Fade In's product listing). Final Draft feature entries come from the
Final Draft 13 User Guide. "—" means the feature isn't offered or wasn't found in the sources
checked. Check each vendor's site for current details.

### Not in Page One yet

- Real-time collaboration, track changes, page locking and A-pages
- PDF import; templates for TV, multi-camera and stage formats
- Production tagging and scheduling exports
- Phone and tablet apps; Windows and macOS builds are possible from the same source but untested

---

## Install

On Ubuntu, Debian, Linux Mint or Pop!_OS:

```bash
sudo apt install ./Page-One_1.0.0_amd64.deb
```

Page One appears in your applications menu, and `.pageone` files open with it on double-click. It
needs WebKitGTK 4.1 (`libwebkit2gtk-4.1-0`, included in Ubuntu 22.04+ and Debian 12+); apt installs
it if it's missing. To remove it: `sudo apt remove page-one`.

## Build from source

You need [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 18+, and on Linux:

```bash
sudo apt install build-essential pkg-config file patchelf libwebkit2gtk-4.1-dev \
  libgtk-3-dev libssl-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev
```

```bash
npm install
npm run build      # target/release/bundle/deb/Page One_1.0.0_amd64.deb
npm test           # core tests: file format, pagination, Fountain, FDX
npm run preview    # the interface in a browser at http://127.0.0.1:8787
```

| Path | Contents |
|---|---|
| `crates/core` | Everything that isn't interface, in Rust: document model, `.pageone` codec, pagination (the single source of page breaks), and the PDF, Fountain, FDX and text exporters |
| `src-tauri` | Desktop shell: native file dialogs, saving with backups, file association, packaging |
| `ui` | Interface in plain HTML, CSS and JavaScript modules, no build step |
| `docs` | File format specification and screenshots |
| `samples` | An example script in Fountain and `.pageone` |

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for what's in this release.

---

## Design

Page One's interface and interaction design are original work for this project. The layout, visual
style, flow bar, story board and its snap grid, act labels, colour key, focus mode and the rest of
the user experience were designed from scratch; they are not copied from or modelled on the
interfaces of Final Draft, Fade In or other screenwriting apps.

What Page One does share with every screenwriting tool are the conventions of the craft itself: the
industry-standard page format and measurements, the names of screenplay elements, the usual
scene-heading → action → character → dialogue flow with Enter and Tab, the familiar Ctrl+number
shortcuts for switching elements, and the file formats writers exchange (Fountain, and `.fdx` so
writers can move their own scripts between apps). These keyboard conventions are kept on purpose,
so writers coming from other tools feel at home.

## Credits and license

Page One is distributed under the Apache License 2.0 (see [LICENSE](LICENSE)). It is built on the
Novelcraft desktop framework (Rust and Tauri).

Courier Prime © The Courier Prime Project Authors, used under the SIL Open Font License 1.1
(`crates/core/fonts/OFL.txt`).

Page One is an independent project, not affiliated with or endorsed by Final Draft, Inc., the
makers of Fade In, or the Fountain project. Final Draft and Fade In are trademarks of their
respective owners.
