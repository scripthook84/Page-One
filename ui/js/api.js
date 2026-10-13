// Bridge to the Rust core. In the desktop app this goes through Tauri IPC;
// in a browser (development) it talks to `pageone-devserver` over HTTP.

const T = window.__TAURI__;
export const isDesktop = !!(T && T.core);

async function invoke(cmd, args) {
  return T.core.invoke(cmd, args);
}

/** While a native file dialog is open the page must not take keystrokes. */
async function withDialog(cmd, args) {
  const parts = document.querySelectorAll('body > header, body > main, body > footer, #welcome, #modalRoot');
  const active = document.activeElement;
  parts.forEach((p) => (p.inert = true));
  try {
    return await invoke(cmd, args);
  } finally {
    parts.forEach((p) => (p.inert = false));
    if (active && active.focus) active.focus();
  }
}

async function post(path, body, as = 'json') {
  const r = await fetch(path, {
    method: 'POST',
    body: typeof body === 'string' || body instanceof Uint8Array || body instanceof ArrayBuffer ? body : JSON.stringify(body),
  });
  if (as === 'json') {
    const j = await r.json();
    if (j && j.error) throw new Error(j.error);
    return j;
  }
  if (as === 'text') return r.text();
  return new Uint8Array(await r.arrayBuffer());
}

function download(name, data, type) {
  const blob = new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function pickBrowserFile(accept) {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}

export const api = {
  async layout(project) {
    return isDesktop ? invoke('layout', { project }) : post('/api/layout', project);
  },

  /** Ask for a script to open. Returns {path, name, project} or null. */
  async open(kind = 'any') {
    if (isDesktop) {
      const path = await withDialog('pick_open', { kind });
      if (!path) return null;
      const project = await invoke('load_file', { path });
      return { path: path.endsWith('.pageone') ? path : null, name: baseName(path), project, imported: !path.endsWith('.pageone') };
    }
    const f = await pickBrowserFile('.pageone,.fountain,.fdx,.txt,.spmd');
    if (!f) return null;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const project = await post('/api/import?name=' + encodeURIComponent(f.name), bytes);
    return { path: null, name: f.name, project, imported: !f.name.endsWith('.pageone') };
  },

  async openPath(path) {
    const project = await invoke('load_file', { path });
    return { path: path.endsWith('.pageone') ? path : null, name: baseName(path), project };
  },

  async importText(text) {
    if (isDesktop) return invoke('import_text', { text });
    return post('/api/import?name=paste.fountain', text);
  },

  /** Save as .pageone. `path` null → ask. Returns the saved path (or a name in the browser). */
  async save(project, path, suggested) {
    if (isDesktop) {
      if (!path) path = await withDialog('pick_save', { kind: 'pageone', suggested: suggested || 'Untitled' });
      if (!path) return null;
      if (!path.endsWith('.pageone')) path += '.pageone';
      await invoke('save_file', { path, project });
      return path;
    }
    const bytes = await post('/api/encode', project, 'bytes');
    const name = (suggested || 'Untitled') + '.pageone';
    download(name, bytes, 'application/octet-stream');
    return name;
  },

  async exportAs(kind, project, suggested, opts = {}) {
    const board = ['board', 'outline', 'board+outline'].includes(kind);
    const ext = board ? 'pdf' : { pdf: 'pdf', fountain: 'fountain', fdx: 'fdx', text: 'txt' }[kind];
    if (board) suggested = `${suggested || 'Untitled'} - ${kind === 'outline' ? 'Outline' : kind === 'board' ? 'Story board' : 'Board and outline'}`;
    if (isDesktop) {
      let path = await withDialog('pick_save', { kind, suggested: suggested || 'Untitled' });
      if (!path) return null;
      if (!path.toLowerCase().endsWith('.' + ext)) path += '.' + ext;
      await invoke('export_file', { path, kind, project, watermark: opts.watermark || '' });
      return path;
    }
    const as = ext === 'pdf' ? 'bytes' : 'text';
    const data = await post(board ? '/api/board?what=' + encodeURIComponent(kind) : '/api/' + kind, project, as);
    download(`${suggested || 'Untitled'}.${ext}`, data, ext === 'pdf' ? 'application/pdf' : 'text/plain');
    return suggested + '.' + ext;
  },

  async initialFile() {
    return isDesktop ? invoke('initial_file') : null;
  },

  async quit() {
    if (isDesktop) return invoke('quit_app');
  },

  setWindowTitle(t) {
    try { if (isDesktop && T.window) T.window.getCurrentWindow().setTitle(t); } catch { /* not critical */ }
  },

  async setFullscreen(on) {
    try {
      if (isDesktop && T.window) { await T.window.getCurrentWindow().setFullscreen(on); return; }
      if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch { /* full screen refused — focus mode still works in the window */ }
  },

  onCloseRequested(cb) {
    if (isDesktop && T.event) T.event.listen('close-requested', cb);
  },

  /** Files handed over by the system while running (Finder double-click on macOS). */
  onOpenFile(cb) {
    if (isDesktop && T.event) T.event.listen('open-file', (e) => e && e.payload && cb(e.payload));
  },
};

export function baseName(p) {
  return (p || '').split(/[\\/]/).pop();
}
export function stem(p) {
  return baseName(p).replace(/\.(pageone|fountain|fdx|txt|spmd)$/i, '');
}
