# Page One 1.0.0 — release notes

**Released:** October 11, 2026
**Platform:** Linux (Ubuntu 22.04+, Debian 12+, Linux Mint, Pop!_OS), 64-bit `.deb`
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
`.pageone` files are registered with the system and open on double-click.

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

- One snap grid: cards align by row and by column; choose rows or columns as the reading order and
  how many cards per line
- Magic snap: drop on an empty cell to land there, or on a card to slide in before it while later
  cards nudge along; empty cells stay until Tidy up
- The screenplay reorders as soon as a card is dropped, as a single undo step
- Act labels are created and edited on the board (name, colour, starting scene) and never move
  cards; each card shows its act colour
- Colour key with nine standard colours light enough for black text, writer-named and filterable
- Synopses, colours and scene opening straight from the cards

### Organizing and production

- Scene navigator with page eighths, colours, synopses, filtering and drag-to-reorder;
  Alt+Shift+↑/↓ to move a scene
- Scene inspector, character list with stats and bios, dialogue tuner, rename character
- Reports for scenes, characters and locations, copyable as CSV
- Target length, running time estimate and words written today
- Scene numbers, omitted scenes, colour revisions with asterisks and header, standard title page,
  watermarked PDFs

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
- A deleted act label stayed in the side panel until the next redraw
- The board position of the first card was lost on save
- Ctrl+B pressed right after Enter could be cancelled by a late cursor update
- Line wrapping now breaks after hyphens in both the editor and the PDF, so lines match exactly

---

## Known limitations

- Linux only for now. Windows and macOS builds use the same source but haven't been tested.
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
