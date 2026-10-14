# Page One 1.1.0 — release notes

**Released:** October 13, 2026 · **License:** Apache License 2.0

Page One 1.1 reads your script aloud with built-in voices, checks your formatting, prints the board
and outline, and brings pages, spacing and Final Draft files even closer to the industry standard.

---

## Downloads

| Platform | File | Requires |
|---|---|---|
| Linux | `Page-One_1.1.0_amd64.deb` (about 85 MB) | Ubuntu 22.04+, Debian 12+, Linux Mint, Pop!_OS (64-bit) |

This build is Linux only. Windows (`.msi`) and macOS (`.dmg`) installers for 1.1 will follow.

The installer is larger than 1.0's because the voices are built in, so Table Read works offline
from the first launch.

## Install

**Windows.** Run the `.msi`. The installer isn't code-signed yet, so Windows SmartScreen may say
"Windows protected your PC": click **More info**, then **Run anyway**.

**macOS.** Open the `.dmg` and drag **Page One** onto **Applications**. The app isn't signed with an
Apple Developer ID yet, so the first launch needs **System Settings → Privacy & Security → Open
Anyway**.

**Linux.**

```bash
sudo apt install ./Page-One_1.1.0_amd64.deb
```

Installing 1.1 over 1.0 keeps your scripts, settings and backups.

---

## What's new in 1.1

### Table Read with built-in voices

- Click **Table Read** at the top centre, above the page (Ctrl+Shift+P), and Page One reads the
  script aloud starting where the cursor is, with the line being read highlighted and kept in view.
  While reading, the bar has pause, previous and next line, stop and speed (0.8–1.5×).
- **Live mode** (a checkbox in the bar): a touch of room reverb and the cast seated a little left
  and right as if around a table.
- **Waveform** (a checkbox in the bar): a listening box over the page with the speaker, the line and
  its waveform, with its own play controls.
- A narrator reads scene headings, action and transitions; each character speaks in their own voice.
  Seventeen character voices (eight women and seven men, American and British, plus a girl and a
  boy) and two narrator voices are built in.
- Characters are cast automatically, with a child's voice for names like YOUNG JUNE and distinct
  voices for everyone else, until you choose. Pick and audition a voice for each character in
  **Settings**, next to Table Read, or from a character in the Characters panel; choices are saved
  with the script.
- Choose whether the narrator reads scene headings, transitions and parentheticals.
- Everything runs on your computer: no account, no internet, nothing uploaded.

### Script check

- **Script → Script check…** (Ctrl+Shift+K) lists formatting slips, each with a Go button:
  - character cues with no dialogue, and dialogue or parentheticals with no cue
  - scene headings without INT./EXT. or a time of day, and empty scenes
  - parentheticals not in brackets, and transitions not followed by a scene
  - stray blank lines, and misspelled character names (OTSI for OTIS)
- Blank lines and misspelled names are fixed in one click; there's also "Remove all blank lines".

### Story board

- **Labels by type.** Choose Act, Sequence or Beat first, then name and colour it. A sequence or
  beat starts at the scene you pick, and its colour shows on the board. The side panel lists every
  label.
- **Cards in order.** Inside each act's colour lane the cards follow each other in story order, left
  to right and then down, with no gaps. Drop a card anywhere in a lane to give it that place in the
  story. The Tidy up button is gone; the board is always tidy.
- **Print board & outline** (File menu, or Export → Board & outline): a landscape PDF of the cards,
  act by act in their colours, and an outline of acts, sequences, beats and scenes with synopses,
  page numbers and lengths.

### Production reports in Excel

- **File → Export reports (Excel)…** (also in Script → Reports) writes an `.xlsx` workbook whose
  fields match Final Draft's reports and the scene fields production scheduling uses:
  - **Summary:** title, draft, revision, pages, estimated screen time, dialogue and action word
    share, scene counts (interior, exterior, and day/night × interior/exterior, the four strip
    colours), estimated script days, monologues, each element's count and share, and profanity,
    like Final Draft's statistics report.
  - **Scene report:** the one-liner in script order: scene number, I/E, set, time of day (Day,
    Night, Morning, Evening, Dawn, Dusk), time as written, script day (D1, N1…), script pages
    (e.g. 12-13), length in eighths, screen time, cast ID numbers, who speaks, who is named in the
    action, synopsis (or the first action line), act, sequence, beat and scene notes.
  - **Cast list:** ID numbers (1 is the part in the most scenes), scenes in and scenes spoken in
    (like Final Draft's cast report, scenes where a character doesn't speak count too), speeches,
    words, longest speech, page count, script days, first and last scene.
  - **Cast by scene:** the chart an assistant director builds the Day Out of Days from: X where a
    character speaks, • where they're named in the action.
  - **Dialogue:** every speech by character with its extension (V.O., O.S.), scene, page and
    parenthetical, and monologues of 100+ words flagged, like Final Draft's character report.
    Filter one character to print their sides.
  - **Sets:** every set with its I/E, scenes, page count, times of day, script days and cast.
- Page lengths are real numbers shown as eighths ("1 3/8"), so they add up; totals are live
  formulas. Headers stay in view, every column filters, and each sheet prints landscape on US
  Letter with the header row on every page.
- CONTINUOUS, LATER and similar scenes keep the time of the scene before. A new script day starts
  with the morning after a night, or NEXT DAY / DAYS LATER; flashbacks and dreams are kept apart.
  Script days are an estimate from the headings for the script supervisor to confirm.
- The Reports dialog shows the same scene, cast and set tables, still copyable as CSV.

### US or BBC format for a new screenplay

- **File → New screenplay** asks for the format: US (Letter paper, Final Draft's standard) or
  BBC / UK (A4 paper). The paper size can be changed later in Document setup.

### Draft and Production modes, with locked pages

- A **Draft | Production** switch beside the script's title. Draft is for writing. Production locks
  the script the way a shooting script is locked, after a short explanation of what will happen.
- **Locked pages:** every page keeps its number. Text that no longer fits goes onto A pages (12A,
  12B, and 12AA where needed) and later pages don't move; a shortened page keeps its gap; a page
  whose text is all cut folds into the page before as a range ("12-13"); text added before page 1
  goes on A1. A page that starts in the middle of a speech keeps its (MORE) and (CONT'D).
- **Locked scene numbers:** new scenes take A numbers (12A, A1 before the first scene). Cutting a
  scene leaves it as OMITTED with its number, and scenes can't be moved while the script is locked
  (on the page, in the navigator or on the board).
- **Title page revision list:** the White draft and each revision colour with its date, at the
  bottom right.
- **Revisions** start with Blue: asterisks on changed lines, changed pages in colour, and a dated
  revision header. In Production, colours advance only in order, scene numbers stay on, and
  revision marks can't be cleared.
- **Production → Export revised pages** prints only the pages changed in the current colour, ready
  to send out. **Lock revised pages, start next colour** locks them (A pages included) and moves
  on to Pink, Yellow and so on.
- **Back to Draft** unlocks and renumbers everything for a new full draft.
- Page numbers like 12A show on the page, in the status bar and in the reports.

### Pages, production and Final Draft files

- Two blank lines before scene headings, Final Draft's standard, for new scripts (Document setup
  switches between one and two).
- Revised pages are shown on screen and printed in their revision colour, a solid page of blue,
  pink, yellow and so on, like revision pages issued on coloured paper. Production → Revised pages
  in colour turns it off.
- Final Draft (.fdx) export now carries Final Draft's page layout, header, element settings and
  scene-number options, with the same scene numbers as the printed page. Importing an .fdx keeps
  locked scene numbers, turns numbering on and reads the file's scene-heading spacing.
- The start screen is a small box centred on the blank page instead of covering the window.
- The top bar is cleaner: the round app icon sits in the corner in place of the name.

## Fixed in 1.1

- Pages on screen now match the printed page exactly: every sheet is drawn full size (11" Letter
  or A4) with a 1" top and bottom margin and the page number half an inch down, even when a page
  ends early. Before, the gap between pages could cover the last lines of a page.
- A long speech after a character cue was pushed to later pages, leaving the cue alone on a page;
  it now starts under its cue and breaks with (MORE) and (CONT'D) as in Final Draft
- After a locked scene number such as 12A, the next scene was numbered 2 instead of 13
- Moving scenes could carry "THE END" into the middle of the script, or leave doubled or missing
  gaps above scene headings
- Several labels on one card overlapped on the board

## Answering the most common Final Draft 13 complaints

- **Lost work after crashes:** atomic saves, the last 20 versions as backups, autosave every minute
  and crash recovery (since 1.0).
- **Outline and script out of sync:** the board, navigator and outline are the script; there is
  nothing to send back and forth, and nothing is duplicated.
- **Can't print the planning views:** Print board & outline, in landscape.
- **Formatting mistakes slip through:** Script check.
- **Price, activation limits and paid upgrades:** Page One is free and open source, with no
  activation and no account.

---

## Also in Page One (from 1.0)

### Writing

- Live industry-standard pages: Courier 12 pt, US Letter, 1.5" left margin, 54 lines per page;
  dialogue 2.5–6.0", character cues 3.7", parentheticals 3.1–5.25", transitions ending at 7.5";
  page numbers from page 2
- Page breaks, (MORE) / (CONT'D) and automatic (CONT'D) shown in the editor exactly as they print
- Element flow with Enter and Tab, an element list on an empty line, and Ctrl+0…9 shortcuts
- A flow bar that always shows what Enter and Tab will do next
- Suggestions for characters, extensions, scene intros, locations, times of day and transitions
- Dual dialogue side by side while you type
- Scene-heading tidy-up (`int apartment day` → `INT. APARTMENT - DAY`) and self-closing brackets
- New scripts open on a blank scene heading
- Bold, italic and underline; non-printing notes; unlimited undo; find and replace; go to page;
  spell checking; command palette (Ctrl+K)
- Day, Night and Midnight themes, with dark mode one click away at the top right
- Focus mode: full screen on a blank page, with Fit width or 100–200 % from a toolbar at the
  bottom left

### Storyboard

- Every scene is a card, linked to the next by an arrow, flowing in story order through its act's
  colour lane
- Act lanes: act labels sit above the grid; stretch one across more columns by its right edge, or
  drag it to move where the act begins; it snaps column by column
- Every card takes the colour of the act label above it, and each act's columns are tinted as a lane
- The screenplay reorders as soon as anything is dropped, as a single undo step
- Colour key with nine standard colours light enough for black text, named by you and filterable;
  a card's own colour shows as a band along its top
- Write synopses, set colours and open scenes straight from the cards
- Acts live on the board and in the navigator, never on the printed page

### Organizing and production

- Scene navigator with page eighths, colours, synopses, filtering and drag-to-reorder;
  Alt+Shift+↑/↓ moves a scene
- Scene inspector, character list with stats and bios, dialogue tuner, rename character
- Reports for scenes, characters and locations, copyable as CSV
- Target length, running-time estimate and words written today
- Scene numbers, omitted scenes, colour revisions with asterisks and a revision header, a standard
  title page, and watermarked PDFs

### Files

- `.pageone`: a compact, checksummed binary format, documented in `docs/FILE-FORMAT.md`
- Atomic saves, the last 20 versions kept as backups, autosave every minute, and recovery of
  unsaved work after a crash
- Import Fountain and Final Draft `.fdx`; export PDF (font embedded), `.fdx`, Fountain and text
- No network connections and no account

### On Windows

- 64-bit installer with Start menu and desktop shortcuts and a standard uninstaller
- Saving waits a moment and retries if OneDrive or antivirus software is holding the file
- Backups are kept in `%APPDATA%\app.pageone.desktop\backups`

### On the Mac

- One app for Apple Silicon and Intel, with the standard Page One, Edit and Window menus
- ⌘ ⌥ ⇧ in every shortcut label, and ⌘Q asks to save changes before quitting
- Shortcuts that macOS keeps for itself have Mac equivalents: find and replace ⌥⌘F, new beat ⌥⇧⌘3,
  note ⌥⇧⌘4, dual dialogue ⇧⌘D
- `.pageone` files open from Finder, even while Page One is already running
- Backups are kept in `~/Library/Application Support/app.pageone.desktop/backups`

### On Linux

- Spell checking in your system language
- Backups are kept in `~/.local/share/app.pageone.desktop/backups`

---

## Fixed during the 1.0 review

**Script**

- Typing after Select All could land inside a hidden act line
- The cursor could rest on a hidden act line after whole-script edits
- Copying across an act boundary duplicated the act when pasted
- Ctrl+B pressed right after Enter could be cancelled by a late cursor update
- Ctrl+Z, Ctrl+B, Ctrl+I and Ctrl+U in other text boxes (find, synopsis, colour key) acted on the
  script
- Line wrapping now breaks after hyphens in both the editor and the PDF, so lines match exactly
- Notes exported to `.fdx` would have printed; sequences and beats exported at act level

**Storyboard**

- Adding or deleting an act moved cards
- A card could sit under one act's label while belonging to another act
- A deleted act label stayed in the side panel until the next redraw
- The board position of the first card was lost on save
- The separate Rows / Columns switch was removed; act lanes now give the board its columns

**All platforms**

- On European keyboards, AltGr (which counts as Ctrl+Alt) could trigger shortcuts instead of
  typing characters such as `}` or `@`
- F5 or Ctrl+R could reload the window and drop unsaved work
- File paths opened at launch on Windows showed a `\\?\` prefix

---

## Known limitations

- The Windows and Mac installers aren't signed yet, so each system asks once before the first launch.
- The table read speaks American and British English. The child voices are adult voices raised in
  pitch, and words outside the pronunciation dictionary are read by spelling rules.
- The Windows and Mac builds are new; please report anything that behaves differently from Linux.
- No real-time collaboration, track changes, page locking or A-pages yet.
- No PDF import, and no TV, multi-camera or stage templates yet.
- A single block that can't be split (such as a dual-dialogue exchange longer than a page) runs past
  the bottom margin rather than breaking.

---

## Design note

Page One's interface and interaction design are original to this project and are not based on the
interfaces of existing screenwriting apps. It follows the shared conventions of the craft — the
standard page format, element names, the usual Enter/Tab element flow and Ctrl+number element
shortcuts — and reads and writes the formats writers exchange.
