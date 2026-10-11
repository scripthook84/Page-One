// Shared application state.

export const PREFS_DEFAULT = {
  theme: 'day', zoom: 1, autosave: true, typewriter: false, nav: true, insp: true, showNotes: true, recent: [],
};

function loadPrefs() {
  try {
    return { ...PREFS_DEFAULT, ...JSON.parse(localStorage.getItem('pageone.prefs') || '{}') };
  } catch {
    return { ...PREFS_DEFAULT };
  }
}

export const S = {
  project: null,       // everything except paragraphs (those live in the editor)
  path: null,          // .pageone path on disk (desktop), null if never saved
  name: 'Untitled',
  dirty: false,
  layout: null,
  editor: null,
  view: 'script',
  derived: { scenes: [], characters: [], locations: [], words: 0, smart: { characters: [], locations: [], times: [], transitions: [] } },
  curPara: 0,
  prefs: loadPrefs(),
  sessionWords: null,
  app: null,           // filled by app.js: { refresh, markDirty, ... }
};

export function savePrefs() {
  try { localStorage.setItem('pageone.prefs', JSON.stringify(S.prefs)); } catch { /* private mode */ }
}

export function emptyProject() {
  return {
    version: 1,
    title_page: { title: '', credit: 'Written by', author: '', source: '', draft: '', contact: '', notes: '' },
    paras: [{ t: 'scene', runs: [{ x: '' }] }],
    settings: {
      scene_numbers: false, conts: true, mores: true, scene_space: 1, bold_scenes: false,
      page_size: 'letter', rev_level: 0, header: '', title_page: true, target_pages: 110,
    },
    notes: '', characters: [], smart: [], created: 0, modified: 0,
  };
}

/** The full project with current paragraphs, ready for the Rust core. */
export function projectNow() {
  return { ...S.project, paras: S.editor.paras() };
}

export function eighths(n) {
  const whole = Math.floor(n / 8), rest = n % 8;
  if (!whole) return `${rest}/8`;
  return rest ? `${whole} ${rest}/8` : `${whole}`;
}
