# The .pageone file format (version 1)

A `.pageone` file is a small binary container around one screenplay.

```
offset  size  field
0       6     magic: 50 47 31 F0 9F 8E  ("PG1" + 3 bytes that are not valid UTF-8 text)
6       1     format version (1)
7       1     flags (reserved, 0)
8       4     CRC-32 of the uncompressed payload, little-endian
12      4     length of the uncompressed payload, little-endian
16      …     raw DEFLATE stream (RFC 1951, no zlib or gzip header)
```

The payload is a [MessagePack](https://msgpack.org) map with named fields:

```text
Project {
  version: 1,
  title_page: { title, credit, author, source, draft, contact, notes },   // strings
  paras: [ Para ],
  settings: {
    scene_numbers: bool, conts: bool, mores: bool, scene_space: 1|2, bold_scenes: bool,
    page_size: "letter"|"a4", rev_level: 0..8, header: string, title_page: bool, target_pages: int,
    board_mode: "rows"|"columns", board_span: int (cards per row/column), board_snap: bool (unused)
  },
  notes: string,
  characters: [ { name, color, bio } ],
  smart: [ string ],
  color_labels: { "#rrggbb": string },   // the writer's names for scene colours
  created: unix seconds, modified: unix seconds
}

Para {
  t: "scene"|"action"|"character"|"paren"|"dialogue"|"transition"|"shot"
     |"general"|"centered"|"lyric"|"section"|"note",
  runs: [ { x: text, s: style bits (1 bold, 2 italic, 4 underline; omitted when 0) } ],
  dual: bool      // on a character: printed beside the previous speech (omitted when false)
  rev: 0..8       // revision colour that last changed this paragraph (omitted when 0)
  lvl: 1..3       // section depth: act, sequence, beat (omitted when 0)
  meta: { color, synopsis, notes, num, omitted, cell, band }   // scene headings and sections (optional)
                  // cell = [column, row] of a scene card on the story board
                  // band = [first column, width] of an act label on the story board
                  // slot and pos = legacy board positions, read for old files only
}
```

Readers must ignore unknown fields and treat missing fields as their defaults, so newer files keep
opening in older versions wherever possible. A file whose version byte is higher than the reader
supports is refused with a message to update.

Saving writes to a temporary file in the same folder, syncs it to disk, and renames it over the
original.

The reference implementation is `crates/core/src/codec.rs`.
