# Page One 1.0.0 — release notes

**Released:** October 11, 2026 · **License:** Apache License 2.0

The first release of Page One: a lightweight, open-source screenwriting app, built by a screenwriter
for screenwriters. It formats to the industry standard as you type, plans the story on a snap-grid
storyboard, and saves compact `.pageone` files. Free, offline, no account.

---

## Downloads

| Platform | File | Requires |
|---|---|---|
| Windows | `Page-One_1.0.0_x64.msi` (2.4 MB) | Windows 10 or 11, 64-bit |
| macOS | `Page-One_1.0.0_universal.dmg` (5.3 MB) | macOS 12 Monterey or later, Apple Silicon or Intel |
| Linux | `Page-One_1.0.0_amd64.deb` (2.3 MB) | Ubuntu 22.04+, Debian 12+, Linux Mint, Pop!_OS (64-bit) |

## Install

**Windows.** Run the `.msi`. The installer isn't code-signed yet, so Windows SmartScreen may say
"Windows protected your PC": click **More info**, then **Run anyway**. Page One appears in the Start
menu and on the desktop. It uses Microsoft Edge WebView2, part of Windows 10 and 11; the installer
downloads it on the rare PC without it.

**macOS.** Open the `.dmg` and drag **Page One** onto **Applications**. The app isn't signed with an
Apple Developer ID yet, so the first launch needs **System Settings → Privacy & Security → Open
Anyway**. After that it opens normally.

**Linux.**

```bash
sudo apt install ./Page-One_1.0.0_amd64.deb
```

apt installs WebKitGTK 4.1 if it's missing.

On every platform, `.pageone` files open in Page One on double-click.

---

## What's in 1.0.0

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

- One snap grid: every scene is a card in a cell, linked to the next by an arrow; inside each act the
  story reads left to right, then down, with a set number of cards per row
- Magic snap: drop on an empty cell to land there, or on a card to slide in before it while that
  act's later cards nudge along; empty cells stay until Tidy up
- Act lanes: act labels sit above the grid and start one card wide (the first covers the scenes
  already there). Stretch one across more columns by its right edge, or drag it to move where the
  act begins; it snaps column by column
- Every card takes the colour of the act label above it, and each act's columns are tinted as a lane
- Adding, removing, moving or stretching an act never moves a card
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
