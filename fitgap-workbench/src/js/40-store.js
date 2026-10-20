/* ---------------------------------------------------------------------------
 * 40-store.js – persistence: IndexedDB autosave (wrapped in try/catch; the
 * app must work even if IndexedDB is unavailable on file://) and JSON
 * save/load for continuing on another laptop.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG || (root.FG = {});
  const DB = 'fitgap-workbench', STORE = 'sessions', KEY = 'current';

  function openDb() {
    return new Promise((resolve, reject) => {
      try {
        if (!root.indexedDB) return reject(new Error('IndexedDB not available'));
        const req = root.indexedDB.open(DB, 1);
        req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
      } catch (e) { reject(e); }
    });
  }
  async function save(session) {
    try {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(JSON.parse(JSON.stringify(session)), KEY);
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('aborted'));
      });
      db.close();
      return { ok: true };
    } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
  }
  async function load() {
    try {
      const db = await openDb();
      const v = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(KEY);
        r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error);
      });
      db.close();
      return { ok: true, session: v };
    } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e), session: null }; }
  }
  async function clear() {
    try { const db = await openDb(); await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); db.close(); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  }

  function sessionFileName(session) {
    const c = (session.settings.clientName || 'fitgap').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const k = (session.settings.country || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const d = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return ['fitgap', c, k, d].filter(Boolean).join('_') + '.json';
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function exportJson(session) {
    const blob = new Blob([JSON.stringify(session, null, 1)], { type: 'application/json' });
    downloadBlob(blob, sessionFileName(session));
  }
  function parseJson(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: 'File is not valid JSON' }; }
    const err = FG.model.validateSession(obj);
    if (err) return { ok: false, error: err };
    return { ok: true, session: FG.model.upgradeSession(obj) };
  }

  FG.store = { save, load, clear, exportJson, parseJson, downloadBlob, sessionFileName };
})(typeof globalThis !== 'undefined' ? globalThis : window);
