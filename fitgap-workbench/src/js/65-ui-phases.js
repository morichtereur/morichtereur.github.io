/* ---------------------------------------------------------------------------
 * 65-ui-phases.js – lifecycle views: PLAN / PREPARE-readiness / RUN (read-only
 * taxonomy browser now, workshop mode in increment 2) / EVALUATE / QG2 /
 * HAND-OVER "coming next" states, plus Settings and the Feedback log.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG, U = FG.util, M = FG.model, UI = FG.ui, el = UI.el, state = UI.state;
  const V = UI.VIEWS;

  function noData(c, what) {
    c.appendChild(el('div.empty', UI.icon('inbox', 'ico'), el('h2', 'No data yet'), el('p', what + ' needs imported capture sheets. ', el('button.link', { onClick: () => UI.navigate('prepare.import') }, 'Import capture sheets'), ' or ', el('button.link', { onClick: () => UI.importDemo() }, 'try with demo data'), '.')));
  }

  V.plan = { crumb: () => ['1 Plan'], render(c) {
    const p = el('div.page', UI.pageHead('Plan', 'Portfolio, country set-up, sessions and participants for the fit-gap phase.'));
    p.appendChild(el('div.cards',
      UI.soonCard(2, 'PLAN-lite (pilot MVP)', ['Country set-up: country, entities (from import or manual), streams / sub-streams in scope (R2R, A2R-FAA, A2R-IA, I2P, I2C, ICO, MD)', 'Participant list: name, role, organisation (Local / GBS Ops / Transition / Process Expert) – owner fields pick from it', 'Session list: date, time slot, stream or MD, participants present, recording reference – started from the top bar, every change is tagged with it', 'Optional import of the programme planning workbook ("Fit Gap Workshops", sheet "New") with best-effort date/time parsing and a review table']),
      UI.soonCard(10, 'Full PLAN (after the pilot)', ['Portfolio view across countries with dates, process experts and status', 'Session planner: week grid (days × 30-min slots), drag sessions, lunch blocks, on-site / online flag, recording yes/no', 'Effort estimate per session from imported data (activities × entities × minutes per activity) with too-short-slot warnings', 'Exports: printable agenda, .ics per session, schedule slide for the kick-off deck', 'Milestones timeline: transition start, QG1, workshops, evaluate & decide, QG2, KT kick-off, QG3, QG4'])));
    c.appendChild(p);
  } };
  V['prepare.readiness'] = { crumb: () => ['2 Prepare', 'Readiness'], render(c) {
    const p = el('div.page', UI.pageHead('Readiness', 'Per session: is everything in place before the workshop starts?'));
    const s = state.session;
    if (s.files.length) {
      const t = M.totals(s);
      let filled = 0;
      for (const a of Object.values(s.assessments)) if (a.asIs.gap && a.asIs.gap !== 'EMPTY') filled++;
      const total = Object.keys(s.assessments).length || 1;
      p.appendChild(el('div.kpis', el('div.kpi.' + (U.pct(filled, total) > 90 ? 'ok' : 'warn'), el('div.v', U.pct(filled, total) + '%'), el('div.l', 'Ops pre-assessment filled (GAP)')), el('div.kpi', el('div.v', s.files.length), el('div.l', 'Capture sheets received')), el('div.kpi.none', el('div.v', s.files.reduce((a, f) => a + (f.stats.flowSheets || 0), 0)), el('div.l', 'Flow sheets found (images: increment 5)')), el('div.kpi.none', el('div.v', t.entities), el('div.l', 'Entities'))));
    }
    p.appendChild(UI.soonCard(10, 'Readiness checklist per session', ['Capture sheet received · Ops pre-assessment complete (% As-Is filled) · flows available (% of L3 with an image) · participants nominated · room / link sent', 'Traffic light per session', 'List of missing pre-fills to chase with GBS Ops before the session']));
    c.appendChild(p);
  } };
  V.evaluate = { crumb: () => ['4 Evaluate'], render(c) { c.appendChild(el('div.page', UI.pageHead('Evaluate', 'All deviations across entities and streams in one board – decide gap treatment.'), UI.soonCard(7, 'Evaluate board', ['All deviations grouped by resolution approach (Separate variant / Close before go-live / Lift & shift)', 'Status workflow Proposed → Aligned → Approved with named accountable owner', 'Escalation queue per level: L1 Transition Manager → L2 QG Committee / Transition Lead → L3 Project Leadership → SteerCo', 'Activity split view and gap analysis dashboard (Ops vs. workshop, change matrix, heatmap L2/L3 × entity, cross-entity view, gap drivers)']))); } };
  V.qg2 = { crumb: () => ['5 QG2 sign-off'], render(c) { c.appendChild(el('div.page', UI.pageHead('QG2 sign-off', 'Fit-gap conclusion per entity and stream.'), UI.soonCard(6, 'QG2 readiness view', ['Per entity and stream: % activities assessed, deviations by resolution approach, deviations without owner / justification / approval, open questions', 'Sign-off fields "Process Expert" and "GBS Operations" (name, date) per stream', 'A stream is QG2-ready only when all activities are assessed and every deviation has owner, resolution approach and approval status', 'Present mode: full-screen slides per stream (cover, scope, legend, per-L3 flow + swimlane + table, summaries, open points)']))); } };
  V.handover = { crumb: () => ['6 Hand-over'], render(c) { c.appendChild(el('div.page', UI.pageHead('Hand-over', 'Export package for knowledge transfer.'), UI.soonCard(4, 'Exports (pilot MVP)', ['Deviation log (.xlsx): one row per deviation with entity, stream, process, gap type, dimension, resolution approach, justification, owner, target date, escalation level, approval status, session, last change', 'Extra sheets: initiative candidates (standardization gaps → PE / WP3) and taxonomy change requests', 'Clean flat export (.xlsx): one row per entity × activity with all fields, workshop columns and action log', 'Printable summary (browser print → PDF)']), el('div', { style: { height: '1rem' } }), UI.soonCard(9, 'Write-back into the original workbooks', ['Patches Fit-Gap and Detailed Gap cells of the right entity block inside the original .xlsx via JSZip – formatting, images, validations and merges survive', 'Round-trip test: export, re-import, values match, opens in Excel without repair']))); } };

  /* ---------- RUN: read-only taxonomy browser (workshop mode comes in increment 2) ------ */
  V.run = { crumb: (st) => ['3 Run', st.params.stream || 'Workshop'], render(c) {
    const s = state.session;
    const page = el('div.page', { style: { maxWidth: 'none' } });
    page.appendChild(UI.pageHead('Workshop', 'Exception-based fit-gap sessions per stream, all entities side by side.'));
    if (!s.files.length) { noData(page, 'Workshop mode'); c.appendChild(page); return; }
    const streams = M.streamSummary(s);
    const ents = M.entityList(s);
    const procs = M.processList(s);
    const byId = Object.fromEntries(procs.map(p => [p.id, p]));
    // resolve params
    let stream = state.params.stream, l3 = state.params.l3, pid = state.params.pid;
    if (pid && byId[pid]) { let p = byId[pid]; while (p && p.level > 3) p = byId[p.parentId]; if (p) { l3 = p.id; stream = M.streamKey(p); } }
    if (stream === 'MD') { /* master data filter */ } else if (!stream || !streams.some(x => x.key === stream)) stream = streams.length ? streams[0].key : null;
    const inStream = (p) => stream === 'MD' ? p.isMasterData : M.streamKey(p) === stream;
    // tabs
    const tabs = el('div.tabs');
    for (const x of streams) tabs.appendChild(el('button' + (x.key === stream ? '.on' : ''), { onClick: () => UI.navigate('run', { stream: x.key }) }, x.key, ' ', el('span.muted', U.fmtInt(x.activities))));
    if (procs.some(p => p.isMasterData)) tabs.appendChild(el('button' + (stream === 'MD' ? '.on' : ''), { onClick: () => UI.navigate('run', { stream: 'MD' }), title: 'Master-data nodes across all streams (for the MD session)' }, 'MD · Master Data'));
    page.appendChild(tabs);
    page.appendChild(el('div.soon-card', { style: { marginBottom: '1rem', padding: '.7rem 1rem' } }, el('div.eyebrow', 'Coming next · increment 2'), el('div.small.muted', 'Workshop mode: Fit-Gap toggles and FTE, Detailed Gap fields with quick-pick chips, workshop gap type + rationale, deviation block, bulk "Confirm Ops NO GAP for this L3", keyboard flow, session timer, audit trail per activity. Below: the imported taxonomy and Ops pre-assessment, read-only, to check the parsing.')));
    // tree
    const nodes = procs.filter(p => !p.isActivity && inStream(p) && p.level >= 1).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    const acts = procs.filter(p => p.isActivity && inStream(p));
    const childActs = (nid) => acts.filter(a => { let p = a; while (p) { if (p.parentId === nid) return true; p = byId[p.parentId]; } return false; });
    const mixFor = (list) => { const mix = {}; for (const a of list) for (const e of ents) { const x = s.assessments[M.aKey(e.key, a.id)]; if (!x || x.importStatus === 'OUT_OF_SCOPE') continue; const g = x.asIs.gap || 'EMPTY'; mix[g] = (mix[g] || 0) + 1; } return mix; };
    const l3s = nodes.filter(p => p.level === 3 && childActs(p.id).length);
    if (!l3 || !byId[l3] || !inStream(byId[l3])) l3 = l3s.length ? l3s[0].id : null;
    state.params.stream = stream; state.params.l3 = l3; // keep resolved selection so crumb / next navigation are consistent
    const tree = el('div.tree');
    for (const n of nodes) {
      const list = childActs(n.id); if (!list.length) continue;
      tree.appendChild(el('button.node.l' + n.level + (n.id === l3 ? '.active' : ''), { onClick: () => UI.navigate('run', { stream, l3: n.id }), title: n.id + ' ' + n.name },
        el('span.pid', n.id), el('span.nm', n.name), el('span.mini', U.fmtInt(list.length), UI.stackBar(mixFor(list)))));
    }
    // main table for selected L3
    const main = el('div');
    const sel = pid && byId[pid] ? pid : null;
    if (l3) {
      const n = byId[l3]; const list = childActs(l3).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
      const mix = mixFor(list), totalMix = Object.values(mix).reduce((a, b) => a + b, 0);
      main.appendChild(el('div.card-head', el('div', el('div.eyebrow', 'L3 · ' + n.id), el('h2.serif', { style: { fontSize: 'var(--fs-lg)' } }, n.name)), el('span.stats', list.length + ' activities · Ops: ' + UI.gapOrder().filter(k => mix[k]).map(k => mix[k] + ' ' + UI.PILL_LABEL[k]).join(', '))));
      main.appendChild(el('div', { style: { margin: '.3rem 0 .8rem' } }, UI.stackBar(mix), UI.legend(mix)));
      void totalMix;
      const table = el('table.table.compact');
      table.appendChild(el('thead', el('tr', el('th', 'Process ID'), el('th', 'Activity'), el('th', 'To-Be'), ents.map(e => el('th', { title: e.displayName }, e.code || e.displayName)))));
      const tb = el('tbody');
      for (const a of list) {
        tb.appendChild(el('tr.clickable' + (a.id === sel ? '.selected' : ''), { onClick: () => UI.navigate('run', { stream, l3, pid: a.id }) }, el('td.pid', a.id), el('td', a.name, a.notes && a.notes.length ? el('span.pill.warn', { style: { marginLeft: '.4rem' }, title: a.notes.map(x => x.text).join('\n') }, 'note') : null), el('td', a.toBe ? UI.splitPill(a.toBe.le, a.toBe.gbs) : el('span.muted', '—')),
          ents.map(e => { const x = s.assessments[M.aKey(e.key, a.id)]; if (!x) return el('td', el('span.muted', '·')); if (x.importStatus === 'OUT_OF_SCOPE') return el('td', UI.gapPill('OUT_OF_SCOPE', { short: true })); return el('td', UI.gapPill(x.asIs.gap || 'EMPTY', { short: true })); })));
      }
      table.appendChild(tb);
      main.appendChild(el('div.card', { style: { padding: 0 } }, el('div.scroll-x', table)));
    } else main.appendChild(el('div.empty', el('h2', 'No activities in this stream')));
    const split = el('div.split' + (sel ? '.with-detail' : ''), tree, main);
    if (sel) split.appendChild(detailPanel(byId[sel], ents));
    page.appendChild(split);
    c.appendChild(page);
  } };

  function detailPanel(p, ents) {
    const s = state.session;
    const d = el('div.detail', el('div.eyebrow', 'Activity context · read-only'), el('h3', el('span.pid', p.id)), el('div', p.name), p.description ? el('p.small.muted', { style: { marginTop: '.3rem' } }, p.description) : null);
    const dl = el('dl');
    if (p.toBe) { dl.appendChild(el('dt', 'To-Be')); dl.appendChild(el('dd', UI.splitPill(p.toBe.le, p.toBe.gbs), ' ', el('span.small.muted', p.toBe.system || ''))); if (p.toBe.initiative) { dl.appendChild(el('dt', 'Initiative')); dl.appendChild(el('dd.small', p.toBe.initiative)); } }
    dl.appendChild(el('dt', 'Sources')); dl.appendChild(el('dd.small.muted', p.sources.join(', ')));
    if (p.subStream) { dl.appendChild(el('dt', 'Sub-stream')); dl.appendChild(el('dd.small', p.subStream)); }
    d.appendChild(dl);
    for (const e of ents) {
      const a = s.assessments[M.aKey(e.key, p.id)]; if (!a) continue;
      const sect = el('div.sect', el('div.eyebrow', e.displayName));
      const l = el('dl');
      l.appendChild(el('dt', 'Ops GAP')); l.appendChild(el('dd', a.importStatus === 'OUT_OF_SCOPE' ? UI.gapPill('OUT_OF_SCOPE') : UI.gapPill(a.asIs.gap || 'EMPTY'), a.asIs.gapRaw && a.asIs.gap !== 'NO_GAP' && a.asIs.gap !== 'HARMONIZATION' && a.asIs.gap !== 'STANDARDIZATION' && a.asIs.gap !== 'BOTH' ? el('span.xs.muted', ' "' + a.asIs.gapRaw + '"') : null));
      l.appendChild(el('dt', 'As-is split')); l.appendChild(el('dd', UI.splitPill(a.asIs.le, a.asIs.gbs), a.asIs.systems ? el('span.small.muted', ' ' + a.asIs.systems) : null));
      if (a.asIs.info) { l.appendChild(el('dt', 'Ops comment')); l.appendChild(el('dd.small', a.asIs.info)); }
      if (a.importStatusReason) { l.appendChild(el('dt', 'Status')); l.appendChild(el('dd.small.muted', a.importStatusReason)); }
      const presets = Object.entries(a.fitGapPreset || {}).filter(([, v]) => v !== null && v !== undefined).concat(Object.entries(a.detailedGapPreset || {}).filter(([, v]) => v !== null && v !== undefined));
      if (presets.length) { l.appendChild(el('dt', 'Pre-set')); l.appendChild(el('dd.small', presets.map(([k, v]) => k + ': ' + v).join(' · '))); }
      sect.appendChild(l); d.appendChild(sect);
    }
    if (p.notes && p.notes.length) d.appendChild(el('div.sect', el('div.eyebrow', 'Notes from file'), p.notes.map(n => el('p.small', el('span.pill.warn', 'note'), ' ', n.text, el('span.xs.muted', ' (' + (n.entityName || '') + ' · ' + n.block + '.' + n.field + ')')))));
    const ctxKeys = Object.keys(p.context || {});
    if (ctxKeys.length) { const sect = el('div.sect', el('div.eyebrow', 'Shared context')); for (const k of ctxKeys) { const dl2 = el('dl'); for (const [f, v] of Object.entries(p.context[k])) { dl2.appendChild(el('dt', f)); dl2.appendChild(el('dd.small', String(v))); } sect.appendChild(el('div.small', el('b', { style: { textTransform: 'capitalize' } }, k.replace(/([A-Z])/g, ' $1')), dl2)); } d.appendChild(sect); }
    d.appendChild(el('div.sect', el('button.link.small', { onClick: () => UI.navigate('run', { stream: state.params.stream, l3: state.params.l3 }) }, 'Close')));
    return d;
  }

  /* ---------- Settings ----------------------------------------------------------------- */
  V.settings = { crumb: () => ['Settings'], render(c) {
    const s = state.session, st = s.settings;
    const page = el('div.page', UI.pageHead('Settings', 'Everything client-specific lives here and in the imported files – nothing is hard-coded.'));
    const bind = (key, opts) => el('input.input', { type: (opts && opts.type) || 'text', value: st[key] || '', placeholder: (opts && opts.placeholder) || '', onChange: (e) => { const old = st[key]; st[key] = U.clean(e.target.value); if (key === 'editorInitials') st[key] = st[key].toUpperCase(); M.logChange(s, { kind: 'settings', field: key, old, new: st[key] }); UI.touch(); UI.render(); } });
    const card1 = el('div.card', el('div.card-head', el('h2', 'Client and country')),
      el('div.form-grid', el('div.field', el('label', 'Client name'), bind('clientName')), el('div.field', el('label', 'Country'), bind('country')), el('div.field', el('label', 'Workshop dates'), bind('workshopDates', { placeholder: 'e.g. CW43 · 19–23 Oct' })), el('div.field', el('label', 'Facilitators'), bind('facilitators')), el('div.field', el('label', 'Your initials (audit trail)'), bind('editorInitials'))));
    // logo
    const logoIn = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { st.logoDataUrl = r.result; UI.touch(); UI.render(); }; r.readAsDataURL(f); } });
    card1.appendChild(el('div.field', el('label', 'Client logo (cover slide)'), el('div.demo-row', st.logoDataUrl ? el('img', { src: st.logoDataUrl, alt: 'logo', style: { height: '2.2rem', border: '1px solid var(--line)', borderRadius: '4px', padding: '.2rem', background: '#fff' } }) : el('span.muted.small', 'none'), el('button.btn.sm', { onClick: () => logoIn.click() }, 'Upload'), st.logoDataUrl ? el('button.link.small', { onClick: () => { st.logoDataUrl = null; UI.touch(); UI.render(); } }, 'Remove') : null, logoIn)));
    page.appendChild(card1);
    // appearance
    const card2 = el('div.card', el('div.card-head', el('h2', 'Appearance')),
      el('div.demo-row', el('span.small', 'Theme'), el('div.toggle', el('button' + (st.theme !== 'dark' ? '.on' : ''), { onClick: () => { st.theme = 'light'; UI.applyTheme(); UI.touch(); UI.render(); } }, 'Light'), el('button' + (st.theme === 'dark' ? '.on' : ''), { onClick: () => { st.theme = 'dark'; UI.applyTheme(); UI.touch(); UI.render(); } }, 'Dark'))),
      el('div.demo-row', el('button.switch' + (st.screenShare ? '.on' : ''), { role: 'switch', 'aria-checked': st.screenShare ? 'true' : 'false', onClick: () => { st.screenShare = !st.screenShare; UI.applyTheme(); UI.touch(); UI.render(); } }), el('span.small', 'Screen-share mode: larger type and stronger lines for remote participants')));
    page.appendChild(card2);
    // stream scope
    const streams = M.streamSummary(s);
    const card3 = el('div.card', el('div.card-head', el('h2', 'Streams in scope'), el('span.stats', streams.length ? streams.length + ' detected' : 'import files first')));
    if (!streams.length) card3.appendChild(el('p.small.muted', 'Streams and sub-streams (A2R-FAA / A2R-IA) appear here after import. Toggling one off excludes its activities from totals, time budget and analysis.'));
    for (const x of streams) card3.appendChild(el('div.demo-row', { style: { margin: '.2rem 0' } }, el('button.switch' + (st.streamScope[x.key] !== false ? '.on' : ''), { role: 'switch', onClick: () => { st.streamScope[x.key] = st.streamScope[x.key] === false; M.logChange(s, { kind: 'settings', field: 'streamScope.' + x.key, old: !(st.streamScope[x.key]), new: st.streamScope[x.key] !== false }); UI.touch(); UI.render(); } }), el('span.pid', x.key), el('span.small.muted', U.fmtInt(x.activities) + ' activities')));
    page.appendChild(card3);
    // gap definitions
    const card4 = el('div.card', el('div.card-head', el('h2', 'Gap type definitions'), el('span.stats', 'shown as tooltip on every badge and on the legend slide')));
    for (const k of ['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA', 'OUT_OF_SCOPE']) card4.appendChild(el('div.field', el('label', UI.gapPill(k)), el('textarea.textarea', { style: { minHeight: '2.8rem' }, value: st.gapDefinitions[k] || '', onChange: (e) => { st.gapDefinitions[k] = U.clean(e.target.value); UI.touch(); } })));
    page.appendChild(card4);
    // participants placeholder
    page.appendChild(el('div', { style: { marginTop: '1rem' } }, UI.soonCard(2, 'Participants and sessions', ['Participant list (name, role, organisation) – owner fields pick from it', 'Session list (date, time, stream or MD, participants, recording) – started from the top bar; every change is tagged'])));
    // danger
    const card5 = el('div.card', { style: { marginTop: '1rem' } }, el('div.card-head', el('h2', 'Session data')), el('p.small.muted', 'Autosaved to this browser (IndexedDB). Use "Save session" in the top bar for a JSON backup at the end of every session block.'),
      el('div.demo-row', el('button.btn', { onClick: () => { FG.store.exportJson(s); UI.toast('Session JSON downloaded'); } }, 'Save session as JSON'),
        el('button.btn.danger', { onClick: async () => { const ok = await UI.confirmDialog('Start a new, empty session?', 'All imported data, settings and the audit trail in this browser are discarded. Download a JSON backup first.', 'Discard and start new', true); if (!ok) return; await FG.store.clear(); UI.newSession(); UI.touch(); UI.navigate('prepare.import'); UI.showWelcome(); } }, 'New empty session')),
      el('p.xs.muted', { style: { marginTop: '.6rem' } }, 'Session id ' + s.id + ' · created ' + new Date(s.createdAt).toLocaleString('en-GB') + ' · ' + s.audit.length + ' audit entries'));
    page.appendChild(card5);
    c.appendChild(page);
  } };

  /* ---------- Feedback log --------------------------------------------------------------- */
  V.feedback = { crumb: () => ['Feedback log'], render(c) {
    const s = state.session;
    const page = el('div.page', UI.pageHead('Pilot feedback log', 'Everything logged with the Feedback button, as an improvement backlog for after the pilot.'));
    if (!s.feedback.length) page.appendChild(el('div.empty', UI.icon('feedback', 'ico'), el('h2', 'No feedback yet'), el('p', 'Use the Feedback button in the top bar from any view.')));
    else {
      const table = el('table.table.compact');
      table.appendChild(el('thead', el('tr', el('th', 'When'), el('th', 'View'), el('th', 'Session'), el('th', 'Note'), el('th', ''))));
      table.appendChild(el('tbody', s.feedback.slice().reverse().map(f => el('tr', el('td.small.muted.nowrap', new Date(f.ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })), el('td.mono.small', f.view), el('td.small.muted', f.session || '—'), el('td', f.note), el('td', el('button.link.small', { onClick: () => { s.feedback = s.feedback.filter(x => x.id !== f.id); UI.touch(); UI.render(); } }, 'Remove'))))));
      page.appendChild(el('div.card', { style: { padding: 0 } }, el('div.scroll-x', table)));
      page.appendChild(el('div.demo-row', el('button.btn', { onClick: () => { const rows = [['timestamp', 'view', 'session', 'note']].concat(s.feedback.map(f => [f.ts, f.view, f.session || '', f.note])); const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n'); FG.store.downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv' }), 'fitgap-feedback.csv'); } }, 'Export backlog (.csv)')));
    }
    c.appendChild(page);
  } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
