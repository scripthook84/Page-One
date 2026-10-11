# Page One 1.0.0 — release notes

**Released:** October 11, 2026
**Platforms:** Linux (Ubuntu 22.04+, Debian 12+, Linux Mint, Pop!_OS), 64-bit `.deb`;
macOS 12 Monterey or later, universal `.dmg` for Apple Silicon and Intel
**License:** Apache License 2.0

The first release of Page One: a lightweight, open-source screenwriting app that formats to the
industry standard as you type, plans the story on a snap-to-grid board, and saves compact
`.pageone` files.

---

## Install

```bash
sudo apt install ./Page-One_1.0.0_amd64.deb
```

Installer size is about 2 MB. Page One needs WebKitGTK 4.1, which apt installs if it's missing.

**macOS:** open `Page-One_1.0.0_universal.dmg` and drag Page One onto Applications. If the build
isn't signed with an Apple Developer ID, the first launch needs **System Settings → Privacy &
Security → Open Anyway**.

On both, `.pageone` files are registered with the system and open on double-click.

---

## What's in 1.0.0

### Writing

- Live industry-standard pages: Courier 12 pt, US Letter, 1.5" left margin, 54 lines per page;
  dialogue 2.5–6.0", character cues 3.7", parentheticals 3.1–5.25", transitions ending at 7.5"
- Page breaks, (MORE) / (CONT'D) and automatic (CONT'D) shown in the editor as they print
- Element flow with Enter and Tab, an element list on an empty line, and Ctrl+0…9 shortcuts
- A flow bar that always shows what Enter and Tab will do next
- Suggestions for characters, extensions, scene intros, locations, times of day and transitions
- Dual dialogue side by side while you type (Ctrl+Alt+D)
- Scene-heading tidy-up (`int apartment day` → `INT. APARTMENT - DAY`) and self-closing brackets
- New scripts open on a blank scene heading
- Bold, italic and underline; non-printing notes; unlimited undo; find and replace; go to page;
  system spell checking; command palette (Ctrl+K)
- Day, Night and Midnight themes, with dark mode one click away at the top right
- Focus mode: full screen, blank page, with Fit width or 100–200 % from a toolbar at the bottom left

### Story board

- One snap grid: cards align by row and by column; inside each act the story reads left to right,
  then down, with a set number of cards per row
- Magic snap: drop on an empty cell to land there, or on a card to slide in before it while that
  act's later cards nudge along; empty cells stay until Tidy up
- Act lanes: act labels sit above the grid, start one card wide (the first covers the scenes already there), and stretch across columns by their
  right edge or move by dragging, snapping column by column; every card takes the colour of the act
  label above it, and each act's columns are tinted
- Adding, removing, moving or stretching an act never moves a card
- The screenplay reorders as soon as anything is dropped, as a single undo step
- Colour key with nine standard colours light enough for black text, writer-named and filterable;
  a card's own colour shows as a band along its top
- Synopses, colours and scene opening straight from the cards

### Organizing and production

- Scene navigator with page eighths, colours, synopses, filtering and drag-to-reorder;
  Alt+Shift+↑/↓ to move a scene
- Scene inspector, character list with stats and bios, dialogue tuner, rename character
- Reports for scenes, characters and locations, copyable as CSV
- Target length, running time estimate and words written today
- Scene numbers, omitted scenes, colour revisions with asterisks and header, standard title page,
  watermarked PDFs

### On the Mac

- Universal app for Apple Silicon and Intel, with the standard Page One, Edit and Window menus
- ⌘ and ⌥ in every shortcut label; ⌘Q asks to save changes before quitting
- Shortcuts that macOS reserves get Mac equivalents: find and replace ⌥⌘F, new beat ⌥⇧⌘3,
  note ⌥⇧⌘4, dual dialogue ⇧⌘D
- `.pageone` files open from Finder, including while Page One is already running

### Files

- `.pageone`: compact, checksummed binary format (documented in `docs/FILE-FORMAT.md`)
- Atomic saves, the last 20 versions kept as backups, autosave every minute, and recovery of
  unsaved work after a crash
- Import Fountain and Final Draft `.fdx`; export PDF (font embedded), `.fdx`, Fountain and text
- No network connections and no account

---

## Fixed during the 1.0 review

- Typing after Select All could land inside a hidden act line
- Ctrl+Z, Ctrl+B, Ctrl+I and Ctrl+U in text boxes (find, synopsis, colour key) acted on the script
- Copying across an act boundary duplicated the act when pasted
- The cursor could rest on a hidden act line after whole-script edits
- Notes exported to `.fdx` would have printed; sequences and beats exported at act level
- Adding or deleting an act moved cards on the board
- A card could sit under one act's label while belonging to another act
- A deleted act label stayed in the side panel until the next redraw
- The board position of the first card was lost on save
- Ctrl+B pressed right after Enter could be cancelled by a late cursor update
- Line wrapping now breaks after hyphens in both the editor and the PDF, so lines match exactly

---

## Known limitations

- No Windows build yet; it uses the same source but hasn't been tested.
- No real-time collaboration, track changes, page locking or A-pages yet.
- No PDF import, and no TV, multi-camera or stage templates yet.
- Very long unsplittable blocks (a dual-dialogue exchange longer than a page) run past the bottom
  margin rather than breaking.

---

## Design note

Page One's interface and interaction design are original to this project and are not based on the
interfaces of existing screenwriting apps. It follows the shared conventions of the craft — the
standard page format, element names, the usual Enter/Tab element flow and Ctrl+number element
shortcuts — and reads and writes the formats writers exchange.
