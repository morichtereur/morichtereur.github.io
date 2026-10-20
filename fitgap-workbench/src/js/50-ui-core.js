/* ---------------------------------------------------------------------------
 * 50-ui-core.js – app shell: state, DOM helpers, sidebar, top bar, KPI strip,
 * toasts, dialogs, command palette, feedback, theme, autosave wiring.
 * Views register themselves in FG.ui.VIEWS[id] = { crumb(), render(container) }.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG || (root.FG = {});
  const U = FG.util, M = FG.model;

  const state = { session: null, view: 'prepare.import', params: {}, collapsed: false, saveStatus: 'idle', saveError: null, importQueue: [], welcomeOpen: false, popover: null, cmdk: null };
  const VIEWS = {};

  const ICONS = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0 4 4m-4-4-4 4M4 17v3h16v-3"/></svg>',
    feedback: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 2 0 4 0a3 3 0 0 0 3-3 10 10 0 0 0-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>',
    plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    prepare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10M9 12h10M9 19h10M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2"/></svg>',
    run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 4l14 8-14 8z"/></svg>',
    evaluate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
    qg2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></svg>',
    handover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 7"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 14h5l1 2h4l1-2h5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  };
  function icon(name, cls) { const w = document.createElement('span'); w.innerHTML = ICONS[name] || ''; const s = w.firstElementChild; if (s && cls) s.setAttribute('class', cls); return s || document.createTextNode(''); }

  /** el('div.card#x', {attrs, on: {...}}, children...) – tiny DOM builder. */
  function el(spec, attrs, ...children) {
    if (attrs && (attrs instanceof Node || typeof attrs !== 'object' || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
    const parts = spec.split(/(?=[.#])/);
    const node = document.createElement(parts[0] || 'div');
    for (const p of parts.slice(1)) { if (p[0] === '.') node.classList.add(p.slice(1)); else if (p[0] === '#') node.id = p.slice(1); }
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in node && typeof v !== 'string' && k !== 'value') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    children.forEach(add);
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  /* ---------- gap pills, bars, legends ---------------------------------------- */
  const PILL_LABEL = { NO_GAP: 'NO GAP', HARMONIZATION: 'HARMONIZATION', STANDARDIZATION: 'STANDARDIZATION', BOTH: 'BOTH GAPS', NA: 'N/A', OUT_OF_SCOPE: 'OUT OF SCOPE', UNCLEAR: 'UNCLEAR', EMPTY: 'NOT PRE-ASSESSED' };
  function gapPill(code, opts) {
    code = code || 'EMPTY'; opts = opts || {};
    const def = state.session && state.session.settings.gapDefinitions[code];
    const label = opts.short ? (FG.GAP_TYPES[code] || FG.GAP_TYPES.EMPTY).short : (PILL_LABEL[code] || code);
    return el('span.pill.g-' + code, { title: def || PILL_LABEL[code] || code }, label, opts.count !== undefined ? el('b', U.fmtInt(opts.count)) : null);
  }
  function gapOrder() { return Object.keys(FG.GAP_TYPES).sort((a, b) => FG.GAP_TYPES[a].order - FG.GAP_TYPES[b].order); }
  function stackBar(mix, opts) {
    opts = opts || {};
    const total = Object.values(mix || {}).reduce((a, b) => a + b, 0);
    const bar = el('div.stack' + (opts.lg ? '.lg' : ''), { title: total ? gapOrder().filter(k => mix[k]).map(k => PILL_LABEL[k] + ' ' + mix[k]).join(' · ') : 'no data' });
    if (!total) return bar;
    for (const k of gapOrder()) { if (!mix[k]) continue; bar.appendChild(el('span.sw-' + k, { style: { width: (mix[k] / total * 100) + '%' } })); }
    return bar;
  }
  function legend(mix) {
    const total = Object.values(mix || {}).reduce((a, b) => a + b, 0);
    return el('div.legend', gapOrder().filter(k => mix[k]).map(k => el('span', el('i.sw-' + k), PILL_LABEL[k] + ' ', el('b.mono', U.pct(mix[k], total) + '%'))));
  }
  function splitPill(le, gbs) {
    const l = le === 'Y', g = gbs === 'Y';
    if (l && g) return el('span.pill.mixed', 'MIXED');
    if (g) return el('span.pill.gbs', 'GBS');
    if (l) return el('span.pill.local', 'LOCAL');
    return el('span.pill.neutral', '–');
  }

  /* ---------- toasts, dialogs ------------------------------------------------ */
  function toastHost() { let h = document.querySelector('.toast-host'); if (!h) { h = el('div.toast-host'); document.body.appendChild(h); } return h; }
  function toast(msg, opts) {
    opts = opts || {};
    const t = el('div.toast' + (opts.flag ? '.flag' : ''), el('span', msg));
    if (opts.action) t.appendChild(el('button.link', { onClick: () => { t.remove(); opts.onAction && opts.onAction(); } }, opts.action));
    toastHost().appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .2s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 220); }, opts.timeout || 4500);
    return t;
  }
  function confirmDialog(title, body, okLabel, danger) {
    return new Promise((resolve) => {
      const d = el('dialog.dlg');
      const close = (v) => { d.close(); d.remove(); resolve(v); };
      d.appendChild(el('div.dlg-body', el('h1', title), el('p.muted', body), el('div.actions', el('button.btn' + (danger ? '.danger' : '.primary'), { onClick: () => close(true) }, okLabel || 'OK'), el('button.link', { onClick: () => close(false) }, 'Cancel'))));
      d.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
      document.body.appendChild(d); d.showModal();
    });
  }

  /* ---------- theme ------------------------------------------------------------ */
  function applyTheme() {
    const s = state.session ? state.session.settings : {};
    const theme = s.theme || 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('screen-share', !!s.screenShare);
    try { localStorage.setItem('fg-theme', theme); } catch (e) { /* ignore */ }
  }
  function toggleTheme() { state.session.settings.theme = state.session.settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); touch(); render(); }

  /* ---------- persistence wiring ----------------------------------------------- */
  const autosave = U.debounce(async () => {
    const r = await FG.store.save(state.session);
    state.saveStatus = r.ok ? 'saved' : 'error'; state.saveError = r.ok ? null : r.error;
    renderSaveState();
  }, 700);
  /** Call after any change to the session. */
  function touch() { if (!state.session) return; state.session.updatedAt = U.nowIso(); state.saveStatus = 'saving'; renderSaveState(); autosave(); }
  function renderSaveState() {
    const n = document.querySelector('.savestate'); if (!n) return;
    n.className = 'savestate ' + state.saveStatus;
    n.title = state.saveStatus === 'error' ? 'Autosave failed: ' + state.saveError + ' – use "Save session" to download a JSON backup.' : 'Autosave to this browser (IndexedDB)';
    n.lastChild.textContent = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Not saved' }[state.saveStatus] || '';
  }
  function loadSessionObject(obj) {
    state.session = obj; applyTheme(); state.view = obj.files.length ? 'prepare.import' : 'prepare.import'; state.params = {};
    render(); touch();
  }
  function newSession() { state.session = M.createSession(); const t = (() => { try { return localStorage.getItem('fg-theme'); } catch (e) { return null; } })(); if (t) state.session.settings.theme = t; applyTheme(); }
  function hasData() { return state.session && state.session.files.length > 0; }

  /* ---------- navigation ---------------------------------------------------------- */
  function navigate(view, params) { if (!VIEWS[view]) view = 'prepare.import'; state.view = view; state.params = params || {}; state.popover = null; render(); const c = document.querySelector('.content'); if (c) c.scrollTop = 0; }

  const PHASES = [
    { id: 'plan', num: '1', label: 'Plan', view: 'plan', icon: 'plan', soon: true },
    { id: 'prepare', num: '2', label: 'Prepare', view: 'prepare.import', icon: 'prepare', subs: [{ label: 'Import capture sheets', view: 'prepare.import' }, { label: 'Readiness', view: 'prepare.readiness', soon: true }], done: () => hasData() },
    { id: 'run', num: '3', label: 'Run', view: 'run', icon: 'run', soon: true },
    { id: 'evaluate', num: '4', label: 'Evaluate', view: 'evaluate', icon: 'evaluate', soon: true },
    { id: 'qg2', num: '5', label: 'QG2 sign-off', view: 'qg2', icon: 'qg2', soon: true },
    { id: 'handover', num: '6', label: 'Hand-over', view: 'handover', icon: 'handover', soon: true },
  ];

  /* ---------- render ------------------------------------------------------------- */
  function render() {
    const app = document.getElementById('app');
    app.className = 'app' + (state.collapsed ? ' collapsed' : '');
    renderSidebar(); renderTopbar(); renderStrip(); renderContent(); renderOverlays();
  }
  function renderSidebar() {
    const side = clear(document.querySelector('.side'));
    const s = state.session, st = s.settings;
    const sub = [st.clientName, st.country].filter(Boolean).join(' · ') || 'No client set – see Settings';
    side.appendChild(el('div.side-brand', el('div.mark', 'FG'), el('div.txt', el('div.name', 'GBS Fit-Gap Workbench'), el('div.sub', { title: sub }, sub))));
    const scroll = el('div.side-scroll');
    // streams
    const streams = M.streamSummary(s);
    scroll.appendChild(el('div.eyebrow', 'Streams'));
    if (!streams.length) scroll.appendChild(el('div.side-item.sub', { style: { paddingLeft: '1rem', cursor: 'default' } }, 'No streams yet – import capture sheets'));
    for (const x of streams) {
      const active = state.view === 'run' && state.params.stream === x.key;
      const b = el('button.side-stream' + (active ? '.active' : ''), { onClick: () => navigate('run', { stream: x.key }), title: `${x.key}: ${x.activities} activities · ${x.assessments} assessments · ${x.outOfScope} out of scope` },
        el('div.row', el('span.k', x.key), el('span.c', U.fmtInt(x.activities))),
        (() => { const bar = el('div.bar'); const tot = Object.values(x.gapMix).reduce((a, b) => a + b, 0); for (const k of gapOrder()) if (x.gapMix[k]) bar.appendChild(el('span.sw-' + k, { style: { width: (x.gapMix[k] / tot * 100) + '%' } })); return bar; })());
      scroll.appendChild(b);
    }
    // lifecycle
    scroll.appendChild(el('div.eyebrow', 'Lifecycle'));
    for (const p of PHASES) {
      const active = state.view === p.view || (p.subs && p.subs.some(x => x.view === state.view)) || state.view.startsWith(p.id + '.');
      const done = p.done && p.done();
      scroll.appendChild(el('button.side-item' + (active ? '.active' : ''), { onClick: () => navigate(p.view), title: p.label },
        el('span.num', p.num), icon(p.icon, 'ico'), el('span.lbl', p.label), done ? el('span.chk', icon('check', 'ico')) : (p.soon ? el('span.soon', 'next') : null)));
      if (p.subs && active && !state.collapsed) for (const sx of p.subs) scroll.appendChild(el('button.side-item.sub' + (state.view === sx.view ? '.active' : ''), { onClick: () => navigate(sx.view) }, el('span.lbl', sx.label), sx.soon ? el('span.soon', 'next') : null));
    }
    side.appendChild(scroll);
    const foot = el('div.side-foot');
    foot.appendChild(el('button.side-item' + (state.view === 'settings' ? '.active' : ''), { onClick: () => navigate('settings'), title: 'Settings' }, icon('settings', 'ico'), el('span.lbl', 'Settings')));
    foot.appendChild(el('button.side-item' + (state.view === 'stylesheet' ? '.active' : ''), { onClick: () => navigate('stylesheet'), title: 'Style sheet' }, icon('palette', 'ico'), el('span.lbl', 'Style sheet')));
    foot.appendChild(el('button.side-item' + (state.view === 'feedback' ? '.active' : ''), { onClick: () => navigate('feedback'), title: 'Feedback log' }, icon('feedback', 'ico'), el('span.lbl', 'Feedback log'), el('span.cnt', String(s.feedback.length))));
    foot.appendChild(el('div.ver', 'build ' + (root.FG_BUILD || 'dev') + ' · offline'));
    side.appendChild(foot);
  }
  function renderTopbar() {
    const top = clear(document.querySelector('.topbar'));
    const v = VIEWS[state.view];
    const crumb = (v && v.crumb ? v.crumb(state) : [state.view]);
    top.appendChild(el('button.iconbtn', { title: 'Toggle sidebar', onClick: () => { state.collapsed = !state.collapsed; render(); } }, icon(state.collapsed ? 'menu' : 'collapse')));
    const c = el('div.crumb');
    crumb.forEach((x, i) => { if (i) c.appendChild(el('span.sep', '›')); c.appendChild(i === crumb.length - 1 ? el('b', x) : el('span', x)); });
    top.appendChild(c);
    top.appendChild(el('div.grow'));
    top.appendChild(el('button.searchbtn', { onClick: openCmdk, title: 'Jump to entity, stream, process ID or view' }, icon('search'), el('span', 'Jump to…'), el('kbd', 'Ctrl K')));
    const ss = el('div.savestate.' + state.saveStatus, el('span.dot'), el('span', '')); top.appendChild(ss);
    top.appendChild(el('button.iconbtn', { title: 'Save session as JSON (backup / continue on another laptop)', onClick: () => { FG.store.exportJson(state.session); toast('Session JSON downloaded'); } }, icon('download')));
    const fileIn = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: async (e) => { const f = e.target.files[0]; if (!f) return; await loadJsonFile(f); e.target.value = ''; } });
    top.appendChild(fileIn);
    top.appendChild(el('button.iconbtn', { title: 'Load session JSON', onClick: () => fileIn.click() }, icon('upload')));
    top.appendChild(el('button.iconbtn', { title: 'Toggle light / dark theme', onClick: toggleTheme }, icon(state.session.settings.theme === 'dark' ? 'sun' : 'moon')));
    top.appendChild(el('button.btn.sm', { onClick: openFeedback, title: 'Log pilot feedback for this view' }, icon('feedback', 'ico'), 'Feedback'));
    renderSaveState();
  }
  function renderStrip() {
    const strip = clear(document.querySelector('.strip'));
    if (!hasData()) { strip.classList.add('hidden'); return; }
    strip.classList.remove('hidden');
    const t = M.totals(state.session);
    const client = (state.session.settings.clientName || '').toUpperCase();
    const assessedPct = t.assessments ? U.pct(t.assessed, t.assessments) : 0;
    const head = el('div.kpi-head', el('b', U.fmtInt(t.assessments)), 'assessments', el('span.muted', ' · ' + U.fmtInt(t.activities) + ' activities × ' + t.entities + ' entities' + (t.outOfScope ? ' · ' + U.fmtInt(t.outOfScope) + ' out of scope' : '') + (client ? ' · ' + client : '') + ' · ' + assessedPct + '% assessed'));
    strip.appendChild(head);
    strip.appendChild(legend(t.gapMix));
    strip.appendChild(stackBar(t.gapMix, { lg: true }));
  }
  function renderContent() {
    const c = clear(document.querySelector('.content'));
    const v = VIEWS[state.view];
    if (!v) { c.appendChild(el('div.empty', 'Unknown view')); return; }
    v.render(c, state);
  }
  function renderOverlays() {
    document.querySelectorAll('.popover, .cmdk-back').forEach(n => n.remove());
    if (state.popover === 'feedback') document.querySelector('.main').appendChild(feedbackPopover());
    if (state.cmdk) document.body.appendChild(cmdkOverlay());
  }

  /* ---------- feedback ------------------------------------------------------------ */
  function openFeedback() { state.popover = state.popover === 'feedback' ? null : 'feedback'; renderOverlays(); const t = document.querySelector('.popover textarea'); if (t) t.focus(); }
  function feedbackPopover() {
    const ta = el('textarea.textarea', { placeholder: 'What is missing, confusing or slow in this view? Logged with view, time and active session.' });
    const submit = () => { const note = U.clean(ta.value); if (!note) return; M.addFeedback(state.session, state.view, note); touch(); state.popover = null; renderOverlays(); renderSidebar(); toast('Feedback logged (' + state.session.feedback.length + ' total)'); };
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(); if (e.key === 'Escape') { state.popover = null; renderOverlays(); } });
    return el('div.popover', el('h3', 'Pilot feedback · ', el('span.mono.muted', state.view)), ta,
      el('div.demo-row', { style: { margin: '.5rem 0 0' } }, el('button.btn.primary.sm', { onClick: submit }, 'Log feedback'), el('button.link', { onClick: () => { state.popover = null; renderOverlays(); } }, 'Cancel'), el('span.xs.muted', 'Ctrl+Enter')));
  }

  /* ---------- command palette ------------------------------------------------------- */
  function cmdkIndex() {
    const s = state.session, items = [];
    for (const p of PHASES) items.push({ kind: 'view', label: p.num + ' ' + p.label, go: () => navigate(p.view) });
    for (const x of [['Settings', 'settings'], ['Style sheet', 'stylesheet'], ['Feedback log', 'feedback'], ['Import capture sheets', 'prepare.import']]) items.push({ kind: 'view', label: x[0], go: () => navigate(x[1]) });
    for (const x of M.streamSummary(s)) items.push({ kind: 'stream', label: x.key + ' · ' + x.activities + ' activities', go: () => navigate('run', { stream: x.key }) });
    for (const e of M.entityList(s)) items.push({ kind: 'entity', label: (e.code ? e.code + ' ' : '') + e.displayName, go: () => navigate('run', { entity: e.key }) });
    for (const p of M.processList(s)) items.push({ kind: 'L' + p.level, label: p.id + ' ' + p.name, go: () => navigate('run', { pid: p.id }) });
    return items;
  }
  function openCmdk() { state.cmdk = { q: '', idx: 0 }; renderOverlays(); const i = document.querySelector('.cmdk input'); if (i) i.focus(); }
  function cmdkOverlay() {
    const all = cmdkIndex();
    const q = U.key(state.cmdk.q);
    const hits = (q ? all.filter(x => U.key(x.label).includes(q)) : all.slice(0, 12)).slice(0, 40);
    const input = el('input', { type: 'text', placeholder: 'Type an entity, stream, process ID, activity or view…', value: state.cmdk.q });
    const list = el('ul');
    const closeK = () => { state.cmdk = null; renderOverlays(); };
    hits.forEach((h, i) => list.appendChild(el('li' + (i === state.cmdk.idx ? '.active' : ''), { onClick: () => { closeK(); h.go(); } }, el('span.kind', h.kind), el('span', h.label))));
    if (!hits.length) list.appendChild(el('li.muted', 'No matches'));
    input.addEventListener('input', () => { state.cmdk.q = input.value; state.cmdk.idx = 0; const o = cmdkOverlay(); document.querySelector('.cmdk-back').replaceWith(o); const ni = o.querySelector('input'); ni.focus(); ni.setSelectionRange(ni.value.length, ni.value.length); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeK();
      else if (e.key === 'ArrowDown') { e.preventDefault(); state.cmdk.idx = Math.min(hits.length - 1, state.cmdk.idx + 1); list.querySelectorAll('li').forEach((li, i) => li.classList.toggle('active', i === state.cmdk.idx)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); state.cmdk.idx = Math.max(0, state.cmdk.idx - 1); list.querySelectorAll('li').forEach((li, i) => li.classList.toggle('active', i === state.cmdk.idx)); }
      else if (e.key === 'Enter') { const h = hits[state.cmdk.idx]; if (h) { closeK(); h.go(); } }
    });
    const back = el('div.cmdk-back', { onClick: (e) => { if (e.target === back) closeK(); } }, el('div.cmdk', input, list, el('div.foot', el('span', el('kbd.k', '↑↓'), ' navigate'), el('span', el('kbd.k', '↵'), ' open'), el('span', el('kbd.k', 'Esc'), ' close'))));
    return back;
  }

  /* ---------- welcome dialog ----------------------------------------------------------- */
  function showWelcome() {
    if (state.welcomeOpen) return;
    state.welcomeOpen = true;
    const s = state.session.settings;
    const client = el('input.input', { type: 'text', value: s.clientName || '', placeholder: 'Client name as used in the files' });
    const country = el('input.input', { type: 'text', value: s.country || '', placeholder: 'e.g. France' });
    const initials = el('input.input', { type: 'text', value: s.editorInitials || '', placeholder: 'e.g. MR – tagged on every change', maxlength: 4, style: { width: '8rem' } });
    const d = el('dialog.dlg');
    const save = () => { s.clientName = U.clean(client.value); s.country = U.clean(country.value); s.editorInitials = U.clean(initials.value).toUpperCase(); s.welcomeDone = true; touch(); };
    const close = () => { d.close(); d.remove(); state.welcomeOpen = false; };
    const fileIn = el('input', { type: 'file', accept: '.json', style: { display: 'none' }, onChange: async (e) => { const f = e.target.files[0]; if (!f) return; close(); await loadJsonFile(f); } });
    d.appendChild(el('div.dlg-body',
      el('div.eyebrow', 'GBS Fit-Gap Workbench'),
      el('h1', 'Which transition are you working on?'),
      el('p.muted', 'Everything below is stored in the session only – nothing client-specific lives in the tool.'),
      el('div.form-grid', el('div.field', el('label', 'Client'), client), el('div.field', el('label', 'Country'), country)),
      el('div.field', el('label', 'Your initials'), initials, el('span.hint', 'Used for the audit trail (who changed what).')),
      el('div.actions', el('button.btn.primary', { onClick: () => { save(); close(); navigate('prepare.import'); } }, 'Import capture sheets'),
        el('button.link', { onClick: () => fileIn.click() }, 'Load a saved session'),
        el('button.link', { onClick: () => { save(); close(); navigate('prepare.import'); FG.ui.importDemo && FG.ui.importDemo(); } }, 'Try with demo data'),
        el('span.spacer'), el('button.link', { onClick: () => { save(); close(); } }, 'Skip')), fileIn));
    d.addEventListener('cancel', (e) => { e.preventDefault(); save(); close(); });
    document.body.appendChild(d); d.showModal(); client.focus();
  }
  async function loadJsonFile(f) {
    const text = await f.text();
    const r = FG.store.parseJson(text);
    if (!r.ok) { toast('Could not load session: ' + r.error, { flag: true }); return; }
    if (hasData()) { const ok = await confirmDialog('Replace the current session?', 'The session currently open in this browser will be replaced by "' + f.name + '". Download a JSON backup first if you are unsure.', 'Replace', true); if (!ok) return; }
    loadSessionObject(r.session);
    toast('Session loaded: ' + r.session.files.length + ' file(s), ' + Object.keys(r.session.assessments).length + ' assessments');
  }

  /* ---------- global keys ---------------------------------------------------------------- */
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (state.cmdk) { state.cmdk = null; renderOverlays(); } else openCmdk(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); FG.store.exportJson(state.session); toast('Session JSON downloaded'); }
  });

  function pageHead(title, lede, how) {
    const h = el('div.page-head', el('h1', title), lede ? el('p.lede', lede) : null);
    if (how) h.appendChild(el('details.how', el('summary', 'How this works'), el('div.body', how)));
    return h;
  }
  function soonCard(num, title, items, lede) {
    return el('div.soon-card', el('div.eyebrow', 'Coming next · increment ' + num), el('h2', title), lede ? el('p.muted.small', { style: { marginTop: '.3rem' } }, lede) : null, el('ul', items.map(i => el('li', i))));
  }

  FG.ui = { state, VIEWS, el, icon, clear, navigate, render, touch, toast, confirmDialog, gapPill, stackBar, legend, splitPill, gapOrder, PILL_LABEL, applyTheme, toggleTheme, newSession, loadSessionObject, loadJsonFile, hasData, showWelcome, openCmdk, openFeedback, pageHead, soonCard, PHASES };
})(typeof globalThis !== 'undefined' ? globalThis : window);
