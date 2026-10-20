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
    page.appendChild(el('div.card', el('div.card-head', el('h2', 'Streams in scope, entities, participants, sessions')), el('p.small.muted', 'Maintained under ', el('button.link', { onClick: () => UI.navigate('plan') }, '1 Plan'), '.')));
    // gap definitions
    const card4 = el('div.card', el('div.card-head', el('h2', 'Gap type definitions'), el('span.stats', 'shown as tooltip on every badge and on the legend slide')));
    for (const k of ['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA', 'OUT_OF_SCOPE']) card4.appendChild(el('div.field', el('label', UI.gapPill(k)), el('textarea.textarea', { style: { minHeight: '2.8rem' }, value: st.gapDefinitions[k] || '', onChange: (e) => { st.gapDefinitions[k] = U.clean(e.target.value); UI.touch(); } })));
    page.appendChild(card4);
    // participants placeholder
    page.appendChild(el('div', { style: { marginTop: '1rem' } }, UI.soonCard(2, 'Participants and sessions', ['Participant list (name, role, organisation) – owner fields pick from it', 'Session list (date, time, stream or MD, participants, recording) – started from the top bar; every change is tagged'])));
    // danger
    const card5 = el('div.card', { style: { marginTop: '1rem' } }, el('div.card-head', el('h2', 'Session data')), el('p.small.muted', 'Autosaved to this browser (IndexedDB). Use "Save session" in the top bar for a JSON backup at the end of every session block.'),
      el('div.demo-row', el('button.btn', { onClick: () => { FG.store.exportJson(s); UI.toast('Session JSON downloaded'); } }, 'Save session as JSON'),
        el('button.btn', { onClick: () => { const rows = [['timestamp', 'kind', 'entity', 'processId', 'field', 'old', 'new', 'session', 'editor']].concat(s.audit.map(a => [a.ts, a.kind, a.entityKey || '', a.processId || '', a.field || '', a.old === undefined ? '' : JSON.stringify(a.old), a.new === undefined ? '' : JSON.stringify(a.new), a.session || '', a.editor || ''])); const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n'); FG.store.downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv' }), 'fitgap-audit-trail.csv'); } }, 'Export audit trail (.csv)'),
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
