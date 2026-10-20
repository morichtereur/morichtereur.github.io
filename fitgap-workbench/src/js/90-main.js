/* ---------------------------------------------------------------------------
 * 90-main.js – boot: restore the session from IndexedDB (or start new), apply
 * theme, render, show the welcome dialog on first start.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG, UI = FG.ui;
  async function boot() {
    const t = (() => { try { return localStorage.getItem('fg-theme'); } catch (e) { return null; } })();
    if (t) document.documentElement.dataset.theme = t;
    const r = await FG.store.load();
    if (r.ok && r.session && !FG.model.validateSession(r.session)) { UI.state.session = FG.model.upgradeSession(r.session); UI.applyTheme(); }
    else { UI.newSession(); if (!r.ok) UI.state.saveStatus = 'error', UI.state.saveError = r.error; }
    UI.render();
    if (!r.ok) UI.toast('Autosave is not available in this browser (' + r.error + '). Use "Save session" for JSON backups.', { flag: true, timeout: 8000 });
    if (!UI.state.session.settings.welcomeDone && !UI.state.session.files.length) UI.showWelcome();
    root.FG_READY = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : window);
