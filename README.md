<img width="250" height="250" alt="Page One" src="https://github.com/user-attachments/assets/390777f1-1224-4a7b-99df-b0c0c13637b6" />

# Page One

A lightweight, open-source screenwriting app. Built by a screenwriter for screenwriters. Page One formats your script to the industry
standard as you type, in US or BBC (A4) format, lays your story out on a snap-to-grid story board, and
exports print-ready PDF. When the script goes into production it locks pages and scene numbers and
tracks colour revisions. It's free, works offline, needs no account, and reads your script aloud with
built-in voices that run on its own speech engine, with no internet connection.

**Version 1.1.0** · Windows (.msi) · macOS (.dmg) · Linux (.deb) · Apache License 2.0

---

## Highlights

- **Industry-standard pages, live.** Page breaks, (MORE) and (CONT'D), and dual dialogue appear in
  the editor exactly as they print, on US Letter or BBC / UK A4.
- **Writes the format for you.** Enter and Tab move through scene heading, action, character,
  parenthetical, dialogue and transition; suggestions fill in names, locations and times of day.
- **A story board that snaps.** Scenes are cards on one grid. Drag a card and the script reorders
  the moment you let go.
- **Acts off the page.** Act labels live on the board and in the navigator, never in the script.
- **Focus mode.** One click for a full-screen blank page, sized to fit or from 100 to 200 %.
- **Table Read.** Built-in, natural-sounding voices read the script aloud from the cursor: a narrator
  for action and a voice for every character, men, women and children. The voices and the speech
  engine are built into the app, so a table read works fully offline. Live mode puts the read in a
  room.
- **Draft and Production modes.** Write freely in Draft; switch to Production to lock pages (12A,
  12B), lock scene numbers (OMITTED, 12A) and issue colour revisions.
- **Production reports in Excel.** A scene one-liner, cast list, cast-by-scene chart, dialogue and
  sets, with the fields Final Draft and scheduling software use.
- **Script check.** Finds formatting slips before a reader does, and fixes many in one click.
- **Your files, your format.** Compact `.pageone` files, plus Fountain and Final Draft (`.fdx`)
  in and out.

---
<img width="2880" height="1800" alt="01-script-view" src="https://github.com/user-attachments/assets/655acf88-85ac-4f9e-86eb-6163b4617c03" />

## Writing

- **Two formats.** File → New screenplay asks which one you're writing:
  - **US screenplay:** US Letter (8.5 × 11"), Final Draft's standard, 54 lines of text per page.
  - **BBC / UK screenplay:** A4 paper, as BBC Writersroom and UK producers expect, with the same
    screenplay layout and 58 lines of text per page.

  The paper size can be changed later in Document setup.
- **The page.** Courier 12 pt with a 1.5" left margin and 1" top, right and bottom, two blank lines
  before each scene heading, as in Final Draft. Dialogue runs 2.5–6.0", character cues sit at 3.7",
  parentheticals at 3.1–5.25", and transitions end at 7.5". Page numbers ("2.") start on page 2,
  half an inch from the top. Every sheet on screen is drawn at the full size of the paper, so what
  you see is what prints, line for line.
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
- **Day and Night themes.** The button at the top right switches to Night, a dark desk and page
  that's easy on the eyes after dark.
- **Focus mode**, also at the top right, goes full screen on a blank sheet, keeps the line you're
  writing centred and hides everything else, Table Read included. A small toolbar at the bottom left
  sets **Fit width** or **100–200 %**, and a button at the bottom right switches between Day and
  Night. Esc leaves.
- Unlimited undo, find and replace, go to page, spell checking from your system dictionary, and a
  command palette (Ctrl+K) that finds every command.

<img width="2880" height="1800" alt="06-storyboard" src="https://github.com/user-attachments/assets/25196abe-b33d-4b63-9309-7e4c47e6014c" />

## Storyboard

- **One grid.** Every scene is a card, linked to the next scene by an arrow. Inside each act the
  cards follow each other in story order through the act's colour lane, left to right and then
  down, with no gaps.
- **Drag to reorder.** Drop a card anywhere in a lane and it takes that place in the story; the
  screenplay reorders as soon as you let go, with scene spacing kept exact and "THE END" kept at the
  end. Ctrl+Z puts it back.
- **Act lanes.** Act labels sit in a header row above the grid; a new label is one card wide. Drag a
  label's right edge to stretch it across more columns, or drag the label to move where the act
  begins; it snaps column by column. Acts sit side by side, so every card is under exactly one act
  label, belongs to that act, and takes its colour, and each act's columns are tinted as a lane. A
  card's own scene colour shows as a band along its top.
- **Labels: acts, sequences and beats.** In the panel on the left, choose the type first, then
  name and colour the label; a sequence or beat starts at the scene you pick. A one-column act label
  stacks its cards in a column; stretch it to lay them across more columns. Rename, recolour or
  remove labels in place.
- **Colour key.** Nine standard colours (red, orange, yellow, green, blue, indigo, violet, pink,
  gray), all light enough for black text. Name what each one means ("B story", "Flashback") and click
  a colour to highlight its scenes.
- Click a card's text to write its synopsis, its dot to colour it, double-click to open the scene.
- **Print the board and outline** as a landscape PDF: cards by act in their colours, and an outline
  of acts, sequences, beats and scenes with synopses (File → Print board & outline).

## Organizing

- **Navigator.** The scene list with numbers, length in eighths of a page, colours and synopses;
  filter it, click to jump, drag to reorder. Alt+Shift+↑/↓ moves the current scene.
- **Scene inspector.** Synopsis, colour, notes, a scene number of your own (such as 12A) and an omit
  option for the scene under the cursor, plus who speaks in it.
- **Characters.** Lines, words and scenes per speaker, with a colour and bio for each.
- **Dialogue tuner.** One character's lines on their own, editable in place.
- **Rename character** in cues and, if you like, everywhere the name appears.
- **Target length.** Progress toward your page goal, a running time estimate (1 page ≈ 1 minute)
  and the words written today.
- **Script check** (Ctrl+Shift+K). Character cues with no dialogue, dialogue with no cue, scene
  headings without INT./EXT. or a time of day, unwrapped parentheticals, stray blank lines and
  misspelled character names (OTSI for OTIS), each with a Go button and, where it's safe, a Fix.
- **Printing.** Scene numbers in both margins, a title page laid out to standard metrics, and
  watermarked PDFs.

## Production reports

File → Export reports (Excel) writes an `.xlsx` workbook with the fields of Final Draft's reports
and production scheduling:

- **Summary:** title, draft, pages, estimated screen time, dialogue and action share, interior and
  exterior day and night scene counts, script days, monologues, element counts and profanity.
- **Scene report** (the one-liner): scene number, I/E, set, time of day, script day (D1, N1…),
  script pages (12-13, 12A), length in eighths, screen time, cast ID numbers, synopsis and act.
- **Cast list:** ID numbers, scenes, speeches, words, page count, script days, first and last scene.
- **Cast by scene:** the chart a Day Out of Days is built from.
- **Dialogue:** every speech by character, with extension, scene, page and parenthetical; filter one
  character to print their sides.
- **Sets:** every set with its scenes, page count, times of day and cast.

Headers stay in view, columns filter, page counts add up in eighths, and every sheet prints in
landscape. The same tables are in Script → Reports, copyable as CSV.
## Draft and Production

A **Draft | Production** switch beside the script's title moves it between two modes. Before
locking, Page One explains in a few lines what Production will do.

**Draft** is for writing: pages and scene numbers flow freely and renumber as you go.

**Production** locks the script the way a shooting script is locked:

- **Locked pages.** Every page keeps its number.
  - Text that no longer fits goes onto an A page (12A, 12B, then 12AA where needed) and the pages
    after it don't move.
  - A page you shorten keeps its gap.
  - A page whose text is all cut folds into the page before as a range ("12-13").
  - Text added before page 1 goes on A1.
  - A page that starts mid-speech keeps its (MORE) and (CONT'D).
- **Locked scene numbers.**
  - A new scene takes the number before it with a letter (12A; A1 before the first scene).
  - A scene you cut stays in the script as OMITTED, so its number is never reused.
  - Scenes keep their order on the page, in the navigator and on the board, since moving one would
    scramble the locked pages.
- **Colour revisions** in the standard order: Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon,
  Cherry.
  - Changed lines get an asterisk in the right margin.
  - Changed pages show and print in the revision colour, like pages issued on coloured paper
    (Production → Revised pages in colour turns this off).
  - The header carries the colour and date.
  - The title page lists the White draft and each revision with its date, at the bottom right.
  - Colours advance only in order, and revision marks can't be cleared while the script is locked.
- **Page labels everywhere.** Page numbers like 12A show on the page, in the status bar, in the
  PDF and in the reports.

Sending out a revision and starting a new draft:

- **Export revised pages** prints only the pages changed in the current colour, ready to send out.
- **Lock revised pages, start next colour** locks those pages, A pages included, and moves on to the
  next colour.
- **Back to Draft** (flip the switch) unlocks and renumbers everything, for a new full draft.

## Table Read

Table Read has its own built-in voices and its own speech engine inside the app, so it works fully
offline: nothing is sent anywhere, and no internet connection or account is needed.

- Click **Table Read** at the top centre, above the page (Ctrl+Shift+P), and the script is read aloud
  starting where the cursor is. The line being read is highlighted and kept in view. While reading,
  the bar has pause, previous and next line, stop, speed (0.8–1.5×), **Live mode** and **Waveform**.
- **Live mode** puts the read in a small room: a touch of reverb and the cast seated a little left and
  right as if around a table.
- **Waveform** opens a listening box over the page with the speaker's name, the line being read and
  its waveform, plus its own play controls. Close it and the read carries on.
- **A voice for everyone.** A narrator reads scene headings, action and transitions; every character
  speaks in their own voice. Seventeen character voices are built in (eight women and seven men
  with American and British accents, and a girl and a boy, made by raising an adult voice's pitch)
  plus two narrator voices. Characters are cast
  automatically (YOUNG JUNE gets a child's voice) until you choose; pick and audition a voice for
  each character in **Settings**, next to Table Read, or from a character in the Characters panel.
  Choices are saved with the script.
- Choose whether the narrator reads scene headings, transitions and parentheticals.
- The speech engine is built from the open-source Kokoro voice model and ONNX Runtime, packed into
  the installer, so every line is spoken on your computer.

<img width="2880" height="1800" alt="10-export" src="https://github.com/user-attachments/assets/98297632-fc20-4c00-9b1e-98741e3b8705" />

## Files

- **`.pageone`** is a compact binary file: a magic header, a CRC-32 checksum and a DEFLATE-compressed
  MessagePack document. A feature script is typically 30–60 KB, about a third of its plain-text
  size, and other programs won't open it as text. The format is documented in
  [docs/FILE-FORMAT.md](docs/FILE-FORMAT.md); it's open, not encrypted.
- Saving writes a temporary file and renames it over the original, so a crash can't leave a
  half-written script. The last 20 versions of each script are kept in a `backups` folder:
  `%APPDATA%\app.pageone.desktop\backups` on Windows,
  `~/Library/Application Support/app.pageone.desktop/backups` on a Mac and
  `~/.local/share/app.pageone.desktop/backups` on Linux.
- Autosave runs every minute once a script has a home on disk. Unsaved work — even a script that
  was never saved — is mirrored every 20 seconds, and the start screen offers to recover it after a
  crash.
- **Import:** Fountain (`.fountain`, `.spmd`, `.txt`) and Final Draft (`.fdx`). Pasting Fountain
  text formats it.
- **Export:** PDF with the font embedded, Final Draft `.fdx` (with Final Draft's page layout,
  element settings and scene numbers), Fountain, formatted plain text, and the story board and
  outline as a landscape PDF.
- Page One makes no network connections.

---

## Page One vs Final Draft

| | **Page One 1.1** | **Final Draft 13** |
|---|---|---|
| Price | Free, open source (Apache 2.0) | $199.99 one-time, or $99.99/year as Final Draft Suite |
| Platforms | Windows (.msi), macOS (.dmg, Apple Silicon and Intel), Linux (.deb) | Windows and macOS |
| Phone and tablet | No | Final Draft Go for iOS, sold separately |
| Account or activation | None | Sign-in; two computers active at once |
| Formats as you type (element flow, suggestions) | Yes | Yes |
| Live page breaks with (MORE) / (CONT'D) | Yes, on screen exactly as printed | Yes |
| Dual dialogue | Yes, side by side while you type | Yes |
| US and BBC / UK (A4) screenplay formats | Yes, chosen when you start a script | Yes, through page setup and templates |
| Templates for TV, multi-camera and stage | Screenplay only | Yes, many |
| Planning view | Snap-grid story board with colour-coded act lanes; dragging a card reorders the script live | Beat Board, Outline Editor and index cards |
| Print the board and outline | Yes, landscape PDF | Index cards and outline print |
| Colour key with your own labels | Yes | — |
| Dialogue tuner | Yes | — |
| Table read with a voice per character | Yes: 17 built-in neural voices including children, plus two narrators, on its own offline engine on every platform; Live mode and waveform view | Yes, with the operating system's voices (Speech Control) |
| Formatting check | Script check, with one-click fixes | Format Assistant |
| Draft and Production modes | Yes, one switch | Separate locking commands |
| Locked pages and A-pages (12A, A1, ranges) | Yes | Yes |
| Locked scene numbers, A-scenes, OMITTED | Yes | Yes |
| Colour revisions | Yes: asterisks, dated header, pages in colour, revised-pages-only export, revision list on the title page | Yes |
| Production reports | Excel workbook: summary, scene one-liner with script days, cast list with IDs, cast by scene, dialogue, sets | Scene, location, character and cast reports |
| Production tagging (props, wardrobe…) | No | Yes |
| Track changes | No | Yes |
| Real-time collaboration | No | Yes |
| Fountain | Opens and saves | Not listed in the Final Draft 13 User Guide |
| Final Draft .fdx | Opens and saves, with Final Draft's page layout and scene numbers | Native format |
| Own file format | `.pageone`: compact binary, documented | `.fdx` (XML) |
| Backups and crash recovery | Last 20 versions, autosave every minute, recovery of never-saved work | Backups and autosave |
| Network connections | None | Sign-in, updates and collaboration |


### Future Improvements

- Real-time collaboration and track changes
- Production tagging (props, wardrobe, vehicles) and scheduling exports
- Templates for TV, multi-camera and stage formats
- PDF import
- More languages and accents for the table read
- Phone and tablet apps

---

## Install

The installers are 82–98 MB (Windows about 82 MB, Linux about 84 MB, macOS about 98 MB, since it
holds both Apple Silicon and Intel code). Most of that is the built-in voices and speech engine.

### Windows

Windows 10 or 11, 64-bit.

1. Run `Page-One_1.1.0_x64.msi`.
2. The installer isn't code-signed yet, so Windows SmartScreen may say "Windows protected your PC":
   click **More info**, then **Run anyway**. Follow the installer; Page One appears in the Start menu.

`.pageone` files open in Page One on double-click. Page One uses Microsoft Edge WebView2, which is
part of Windows 10 and 11; on the rare PC without it, the installer downloads it. To remove Page One,
use **Settings → Apps → Installed apps**.

### Linux

On Ubuntu, Debian, Linux Mint or Pop!_OS:

```bash
sudo apt install ./Page-One_1.1.0_amd64.deb
```

Page One appears in your applications menu, and `.pageone` files open with it on double-click. It
needs WebKitGTK 4.1 (`libwebkit2gtk-4.1-0`, included in Ubuntu 22.04+ and Debian 12+); apt installs
it if it's missing. To remove it: `sudo apt remove page-one`.

### macOS

Requires macOS 12 Monterey or later, on Apple Silicon or Intel.

1. Open `Page-One_1.1.0_universal.dmg` and drag **Page One** onto **Applications**.
2. The first time, open it from Applications. If the build isn't signed with an Apple Developer ID,
   macOS says it can't check the app: open **System Settings → Privacy & Security**, scroll down
   and click **Open Anyway** next to Page One (on macOS 14 and earlier you can instead Control-click
   the app and choose **Open**). After that it opens normally.

`.pageone` files open in Page One on double-click. On a Mac, ⌘ takes the place of Ctrl in every
shortcut and ⌥ (Option) the place of Alt. A few shortcuts macOS keeps for itself have Mac
equivalents: find and replace is ⌥⌘F, a new beat ⌥⇧⌘3, a note ⌥⇧⌘4 and dual dialogue ⇧⌘D. Every
shortcut is listed under Help → Keyboard shortcuts (F1).

## Build from source

You need [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 18+, and on Linux:

```bash
sudo apt install build-essential pkg-config file patchelf libwebkit2gtk-4.1-dev \
  libgtk-3-dev libssl-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev
```

On a Mac you need Rust, Node.js and Xcode's command-line tools (`xcode-select --install`). On
Windows you need Rust, Node.js and the Visual Studio C++ Build Tools ("Desktop development with C++").

The built-in voices are not kept in git. `scripts/build_voice_assets.py` assembles them into
`src-tauri/voice/` from their open-source releases (the workflow below shows the exact downloads):
the Kokoro-82M model and voices, the misaki and CMU pronunciation dictionaries, and Microsoft's ONNX
Runtime 1.20.1 library for your platform.

```bash
npm install
npm run build      # target/release/bundle/deb/Page One_1.1.0_amd64.deb
npm run build:mac  # on a Mac: target/universal-apple-darwin/release/bundle/dmg/Page One_1.1.0_universal.dmg
npm run build:win  # on Windows: target/release/bundle/msi/Page One_1.1.0_x64_en-US.msi
npm test           # core tests: file format, pagination, locked pages, Fountain, FDX
npm run preview    # the interface in a browser at http://127.0.0.1:8787
```

| Path | Contents |
|---|---|
| `crates/core` | Everything that isn't interface, in Rust: document model, `.pageone` codec, pagination and locked pages (the single source of page breaks), and the PDF, Excel, Fountain, FDX and text exporters |
| `src-tauri` | Desktop shell: native file dialogs, saving with backups, file association, packaging |
| `ui` | Interface in plain HTML, CSS and JavaScript modules, no build step |
| `docs` | File format specification and screenshots |
| `samples` | An example script in Fountain and `.pageone` |

For the Mac universal build, add both Rust targets once:
`rustup target add aarch64-apple-darwin x86_64-apple-darwin`.

**GitHub Actions.** `.github/workflows/build.yml` builds the `.msi` on Windows, the universal `.dmg`
on macOS and the `.deb` on Ubuntu, and publishes all three on the 1.1.0 release page. Builds run
only when started by hand (Actions → Build → Run workflow), not on every push. Without Apple credentials the Mac app is ad-hoc signed. To sign it with your
Developer ID and have Apple notarize it (so it opens without a warning), add these repository
secrets: `APPLE_CERTIFICATE` (your Developer ID Application certificate exported as .p12, base64),
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` (e.g. `Developer ID Application: Name (TEAMID)`),
and for notarization `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID`.

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

The built-in voices use [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad (Apache
License 2.0) with pronunciations from [misaki](https://github.com/hexgrad/misaki) (Apache License
2.0) and the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) (BSD 2-Clause), run
by [ONNX Runtime](https://github.com/microsoft/onnxruntime) (MIT) through the
[ort](https://github.com/pykeio/ort) crate (MIT or Apache 2.0), and ONNX Runtime Web (MIT) in the
browser preview. See [NOTICE.md](NOTICE.md).

Page One is an independent project, not affiliated with or endorsed by Final Draft, Inc., the
makers of Fade In, or the Fountain project. Final Draft and Fade In are trademarks of their
respective owners.
