<img width="250" height="250" alt="Page One" src="https://github.com/user-attachments/assets/390777f1-1224-4a7b-99df-b0c0c13637b6" />

# Page One 1.1

A lightweight, open-source, offline screenwriting app built by a screenwriter for screenwriters. Formats scripts to industry standards, offers a snap-to-grid storyboard, exports PDFs and Excel reports, and includes an offline neural text-to-speech table read. Free, no account required, Apache 2.0.

**Version 1.1.0** · Windows (.msi) · macOS (.dmg) · Linux (.deb)

---

## Highlights

- **Industry-Standard Pages:** Real-time page breaks, (MORE)/(CONT'D), and dual dialogue on US Letter or BBC A4.
- **Smart Formatting:** Enter/Tab flow through elements with autocomplete for names, locations, and times.
- **Snap-to-Grid Storyboard:** Drag scene cards across color-coded act lanes to instantly reorder the script.
- **Table Read:** Offline text-to-speech using 17 character voices and a narrator via an embedded Kokoro engine.
- **Draft & Production:** Lock pages and scene numbers, track color revisions with margin asterisks, and export revised pages.
- **Production Reports:** Export `.xlsx` workbooks for one-liners, cast lists, day-out-of-days charts, dialogue, and sets.
- **Script Check:** Catch formatting slips and fix them in one click.
- **Open Formats:** Compact `.pageone` binary files, plus Fountain and Final Draft (`.fdx`) support.

---

## Writing

- **Formats:** Choose US Screenplay or BBC/UK A4 upon creation.
- **Page Layout:** Courier 12 pt, precise margins, and exact line spacing matching Final Draft.
- **Element Flow:** Use Enter/Tab or shortcuts ($\text{Ctrl}+0\text{--}9$) to cycle elements. The Flow bar always shows next steps.
- **Assistance:** Suggestions for characters, extensions, and times of day. Shortcuts handle transitions and parentheticals.
- **Environment:** Day/Night themes, distraction-free Focus Mode, unlimited undo, command palette ($\text{Ctrl}+\text{K}$), and spell check.

---

## Storyboard

- **Grid Layout:** Cards ordered by act, left to right. Drag-and-drop automatically reorders the script.
- **Act Lanes:** Header rows let you stretch acts across columns, coloring lanes dynamically.
- **Labels & Colors:** Add acts, sequences, and beats. Use nine light color codes with custom meanings (e.g., "Flashback").
- **Export:** Print the board and outline as a landscape PDF.

---

## Organizing

- **Navigator & Inspector:** Filter scenes, view lengths in eighths of a page, adjust custom numbers, and track speaker statistics.
- **Tools:** Dialogue tuner, character renaming, target length progress bars, script check ($\text{Ctrl}+\text{Shift}+\text{K}$), and watermarked printing.

---

## Production reports

Export `.xlsx` spreadsheets matching industry scheduling standards:
- **Summary:** Title, page count, screen time estimate, action/dialogue split, scene counts, and profanity.
- **Scene, Cast, & Sets Reports:** One-liners, cast lists, cast-by-scene charts, character dialogue lines, and set breakdowns.

---

## Draft and Production

- **Draft Mode:** Free-flowing pages and renumbering while writing.
- **Production Mode:** Locks the script:
  - **Locked Pages & Numbers:** Pages keep numbers using A-pages (12A); cut scenes are marked OMITTED.
  - **Revisions:** Follow standard color order (Blue, Pink, Yellow, etc.) with margin asterisks, colored headers, and title page updates.
  - **Workflows:** Export changed pages only or lock them to advance to the next revision color.

---

## Table Read

- **Offline Engine:** Runs entirely locally via the Kokoro voice model and ONNX Runtime—no internet or account needed.
- **Controls & Views:** Highlighted lines, adjustable speed ($0.8\text{--}1.5\times$), a Live Mode with acoustic reverb, and a Waveform visualizer.
- **Cast Voices:** 17 neural character voices (male, female, child) and 2 narrator voices, auto-assigned or customized per character.

---

## Files

- **Format:** Compact `.pageone` binary files (deflated MessagePack).
- **Safety:** Autosaves every minute, backs up the last 20 versions, and recovers unsaved work after crashes.
- **Compatibility:** Full import/export for Fountain and Final Draft (`.fdx`) files. Zero network connections.

---

## Page One vs Final Draft

| Feature | Page One 1.1 | Final Draft 13 |
|---|---|---|
| **Price** | Free, Open Source (Apache 2.0) | \$199.99 / \$99.99 per year |
| **Platforms** | Windows, macOS, Linux | Windows, macOS |
| **Accounts** | None | Required sign-in |
| **Storyboard** | Snap-grid with color-coded act lanes | Beat Board & Outline Editor |
| **Table Read** | 17 built-in neural voices (offline) | OS speech control voices |
| **File Support** | `.pageone`, `.fdx`, Fountain | `.fdx` native |

---

## Install

- **Windows:** Run `Page-One_1.1.0_x64.msi` (uses WebView2).
- **Linux:** `sudo apt install ./Page-One_1.1.0_amd64.deb` (requires WebKitGTK 4.1).
- **macOS:** Open `.dmg` and drag to Applications (Supports Apple Silicon and Intel).

---

## Build from source

Requires Rust (stable), Node.js 18+, and platform build tools.
```bash
npm install
npm run build      # Build target installers
npm test           # Run core tests
npm run preview    # Preview interface in browser
```

---

## Design

Original interface design prioritizing writer ergonomics while maintaining standard screenplay conventions and full file compatibility with Fountain and Final Draft.

---

## Credits and license

Distributed under Apache License 2.0. Built with Rust, Tauri, Courier Prime font, and the Kokoro-82M neural speech model. Independent project not endorsed by Final Draft, Inc.
respective owners.
