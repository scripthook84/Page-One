// Element definitions and the Enter / Tab element flow (the industry's standard conventions).

/** True on macOS, where Cmd stands in for Ctrl (append ?mac to preview the Mac labels in a browser). */
export const IS_MAC = /Mac|iPhone|iPad/.test((typeof navigator !== 'undefined' && (navigator.platform || navigator.userAgent)) || '')
  || (typeof location !== 'undefined' && /[?&]mac\b/.test(location.search));

/** Shortcuts macOS keeps for itself (⌘H hides the app, ⇧⌘3/4 take screenshots, ⌥⌘D hides the Dock)
 * get Mac replacements, following Mac conventions where one exists (⌥⌘F for find and replace). */
const MAC_REMAP = { 'Ctrl+H': 'Ctrl+Alt+F', 'Ctrl+Shift+3': 'Ctrl+Alt+Shift+3', 'Ctrl+Shift+4': 'Ctrl+Alt+Shift+4', 'Ctrl+Alt+D': 'Ctrl+Shift+D' };

/** The shortcut that triggers a command on this platform. */
export function platformKeys(keys) {
  return IS_MAC && keys && MAC_REMAP[keys] ? MAC_REMAP[keys] : keys;
}

/** Shortcut text for this platform: on a Mac "Ctrl+Shift+S" reads "⇧⌘S" and "Ctrl+Alt+1" reads "⌥⌘1". */
export function keyText(s) {
  if (!IS_MAC || !s) return s;
  return String(s).replace(/\b(?:Ctrl\+H|Ctrl\+Shift\+[34]|Ctrl\+Alt\+D)(?![\w+])/g, (m) => MAC_REMAP[m]).replace(/(?:\b(?:Ctrl|Alt|Shift)[+ ])+/g, (m) => {
    const has = (k) => new RegExp('\\b' + k + '[+ ]').test(m);
    return (has('Alt') ? '⌥' : '') + (has('Shift') ? '⇧' : '') + (has('Ctrl') ? '⌘' : '');
  });
}

export const ELEMS = {
  scene:      { label: 'Scene Heading', short: 'Scene',      key: '1', enter: 'action',   tab: 'action',    empty: 'action',     upper: true },
  action:     { label: 'Action',        short: 'Action',     key: '2', enter: 'action',   tab: 'character', empty: 'character' },
  character:  { label: 'Character',     short: 'Character',  key: '3', enter: 'dialogue', tab: 'paren',     empty: 'transition', upper: true },
  paren:      { label: 'Parenthetical', short: 'Paren',      key: '4', enter: 'dialogue', tab: 'dialogue',  empty: 'dialogue' },
  dialogue:   { label: 'Dialogue',      short: 'Dialogue',   key: '5', enter: 'action',   tab: 'paren',     empty: 'paren' },
  transition: { label: 'Transition',    short: 'Transition', key: '6', enter: 'scene',    tab: 'scene',     empty: 'scene',      upper: true },
  shot:       { label: 'Shot',          short: 'Shot',       key: '7', enter: 'action',   tab: 'action',    empty: 'action',     upper: true },
  centered:   { label: 'Centered',      short: 'Centered',   key: '8', enter: 'action',   tab: 'action',    empty: 'action' },
  lyric:      { label: 'Lyric',         short: 'Lyric',      key: '9', enter: 'lyric',    tab: 'dialogue',  empty: 'dialogue' },
  general:    { label: 'General',       short: 'General',    key: '0', enter: 'general',  tab: 'action',    empty: 'action' },
  section:    { label: 'Section (Act / Sequence)', short: 'Section', key: '⇧1', enter: 'scene', tab: 'scene', empty: 'scene' },
  note:       { label: 'Note (doesn’t print)', short: 'Note', key: '⇧4', enter: 'action', tab: 'action', empty: 'action' },
};

export const ORDER = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'centered', 'lyric', 'general', 'section', 'note'];

export const INTROS = ['INT. ', 'EXT. ', 'INT./EXT. ', 'EXT./INT. ', 'I/E. ', 'EST. '];
export const TIMES = ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME TIME', 'SUNSET', 'SUNRISE'];
export const EXTENSIONS = ["V.O.", "O.S.", "O.C.", "CONT'D", "PRE-LAP", "FILTERED", "ON PHONE", "INTO PHONE", "SUBTITLED"];
export const TRANSITIONS = ['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'FADE OUT.', 'FADE TO BLACK.', 'FADE IN:', 'INTERCUT WITH:', 'BACK TO:', 'TIME CUT:', 'CUT TO BLACK.'];

/** Standard scene colours: the rainbow, light enough to read black text on. */
export const COLORS = [
  { c: '#f7b2b2', name: 'Red' },
  { c: '#fbcb97', name: 'Orange' },
  { c: '#f9e48f', name: 'Yellow' },
  { c: '#b9e3a5', name: 'Green' },
  { c: '#a8d0f4', name: 'Blue' },
  { c: '#bdb8f2', name: 'Indigo' },
  { c: '#dcb5ef', name: 'Violet' },
  { c: '#f5b8d5', name: 'Pink' },
  { c: '#d5d9df', name: 'Gray' },
];
export const SCENE_COLORS = ['', ...COLORS.map((x) => x.c)];

/** The writer's label for a colour, or the colour's name. */
export function colorLabel(project, c) {
  const l = project && project.color_labels && project.color_labels[c];
  if (l && l.trim()) return l.trim();
  const k = COLORS.find((x) => x.c === c);
  return k ? k.name : 'No colour';
}

export const REVISIONS = [
  ['None', '#ffffff'], ['Blue', '#7fb2ff'], ['Pink', '#ff9ecb'], ['Yellow', '#ffe066'], ['Green', '#8fdb8f'],
  ['Goldenrod', '#e8b33f'], ['Buff', '#e9d8a6'], ['Salmon', '#ff9e85'], ['Cherry', '#e0475b'],
];

export const BOLD = 1, ITALIC = 2, UNDERLINE = 4;

export function cueName(text) {
  let t = (text || '').trim().toUpperCase();
  const i = t.indexOf('(');
  if (i >= 0) t = t.slice(0, i);
  return t.replace(/\^$/, '').trim();
}

export function sceneParts(text) {
  const t = (text || '').toUpperCase();
  const m = t.match(/^((?:INT\.?\/EXT|EXT\.?\/INT|INT|EXT|EST|I\/E)\.?\s*)(.*)$/);
  if (!m) return { intro: '', location: t.split(' - ')[0].trim(), time: t.includes(' - ') ? t.split(' - ').slice(1).join(' - ').trim() : '' };
  const rest = m[2];
  const dash = rest.lastIndexOf(' - ');
  return {
    intro: m[1].trim(),
    location: (dash >= 0 ? rest.slice(0, dash) : rest).trim(),
    time: dash >= 0 ? rest.slice(dash + 3).trim() : '',
  };
}
