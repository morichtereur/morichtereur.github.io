/* ---------------------------------------------------------------------------
 * 66-ui-workshop.js – RUN: workshop mode. Exception-based flow per L3, all
 * entities side by side, inline expansion with Fit-Gap, Detailed Gap,
 * workshop gap type + rationale, deviation block, status, comment/next step,
 * audit per activity, keyboard-first, bulk confirm with undo.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG, U = FG.util, M = FG.model, W = FG.workshop, UI = FG.ui, el = UI.el, state = UI.state;
  const ws = { entity: 'all', walkAll: false, open: null, sel: null };
  UI.ws = ws;
  const GAP_OPTS = ['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA', 'UNCLEAR'];

  function rerender() {
    const c = document.querySelector('.content'); const top = c ? c.scrollTop : 0;
    const ae = document.activeElement; const f = ae && ae.dataset ? ae.dataset.f : null;
    UI.render();
    const c2 = document.querySelector('.content'); if (c2) c2.scrollTop = top;
    if (f) { const n = document.querySelector('[data-f="' + CSS.escape(f) + '"]'); if (n) n.focus(); }
  }
  function set(key, path, value, opts) { const changed = W.setField(state.session, key, path, value, opts); if (changed) UI.touch(); if (changed && !(opts && opts.silent)) rerender(); return changed; }

  function ctx() {
    const s = state.session; const streams = M.streamSummary(s); const procs = M.processList(s); const byId = s.processes;
    let stream = state.params.stream, l3 = state.params.l3, pid = state.params.pid;
    if (pid && byId[pid]) { let p = byId[pid]; while (p && p.level > 3) p = byId[p.parentId]; if (p) { l3 = p.id; stream = M.streamKey(p); } ws.open = pid; ws.sel = pid; delete state.params.pid; }
    if (stream !== 'MD' && (!stream || !streams.some(x => x.key === stream))) stream = streams.length ? streams[0].key : null;
    const inStream = (p) => stream === 'MD' ? p.isMasterData : M.streamKey(p) === stream;
    const allEnts = M.entityList(s);
    const ents = ws.entity === 'all' ? allEnts : allEnts.filter(e => e.key === ws.entity);
    if (!ents.length) { ws.entity = 'all'; }
    const entKeys = (ws.entity === 'all' ? allEnts : ents).map(e => e.key);
    const nodes = procs.filter(p => !p.isActivity && inStream(p) && p.level >= 1).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    const l3s = nodes.filter(p => p.level === 3 && W.descendants(s, p.id).some(x => x.isActivity));
    if (!l3 || !byId[l3] || !inStream(byId[l3])) l3 = l3s.length ? l3s[0].id : null;
    state.params.stream = stream; state.params.l3 = l3;
    const acts = l3 ? W.descendants(s, l3).filter(p => p.isActivity).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })) : [];
    if (ws.sel && !acts.some(a => a.id === ws.sel)) ws.sel = acts.length ? acts[0].id : null;
    if (!ws.sel && acts.length) ws.sel = acts[0].id;
    if (ws.open && !acts.some(a => a.id === ws.open)) ws.open = null;
    return { s, streams, byId, stream, l3, nodes, l3s, allEnts, ents, entKeys, acts, inStream };
  }

  function leaveCheck(c, cb) {
    const incomplete = [];
    for (const p of c.acts) for (const e of c.ents) { const a = c.s.assessments[M.aKey(e.key, p.id)]; if (!a || !a.workshop.changedAt) continue; const cp = W.completeness(a, p); if (!cp.done) incomplete.push(p.id + ' · ' + e.displayName + ': ' + cp.missing.join(', ')); }
    if (!incomplete.length) { cb(); return; }
    UI.confirmDialog(incomplete.length + ' assessment(s) in ' + c.l3 + ' are incomplete', incomplete.slice(0, 6).join(' — ') + (incomplete.length > 6 ? ' …' : ''), 'Leave anyway').then(ok => { if (ok) cb(); });
  }
  function go(params) { const c = ctx(); leaveCheck(c, () => { ws.open = null; ws.sel = null; UI.navigate('run', { stream: c.stream, ...params }); }); }

  /* ---------- small widgets ------------------------------------------------------------ */
  function yn(a, field, lg, label) {
    const v = a.workshop.fitGap[field];
    const b = el('button' + (v === 'Y' ? '.Y' : v === 'N' ? '.N' : ''), { 'data-f': a.key + '|fg.' + field, title: (label || field) + ': click to toggle Y / N', onClick: (e) => { e.stopPropagation(); set(a.key, 'fitGap.' + field, v === 'Y' ? 'N' : 'Y'); } }, lg ? (label || field) + ' ' : '', el('b', v === 'Y' ? 'Y' : v === 'N' ? 'N' : '·'));
    return b;
  }
  function ynGroup(a, lg) { return el('div.yn' + (lg ? '.lg' : ''), yn(a, 'local', lg, lg ? 'Local accounting' : 'L'), yn(a, 'other', lg, lg ? 'Other' : 'O'), yn(a, 'gbs', lg, lg ? 'GBS' : 'G')); }
  function fteInput(a) {
    return el('input.input', { type: 'number', step: '0.05', min: '0', placeholder: 'FTE', title: 'FTE for this activity in this entity', value: a.workshop.fitGap.fte === null || a.workshop.fitGap.fte === undefined ? '' : a.workshop.fitGap.fte, 'data-f': a.key + '|fte', onClick: (e) => e.stopPropagation(), onChange: (e) => { const v = e.target.value === '' ? null : parseFloat(e.target.value); set(a.key, 'fitGap.fte', isNaN(v) ? null : v); } });
  }
  function gapSelect(a, full) {
    const cur = a.workshop.gapType; const shown = cur || (a.asIs.gap && a.asIs.gap !== 'OUT_OF_SCOPE' && a.asIs.gap !== 'EMPTY' ? a.asIs.gap : '');
    const sel = el('select.gapsel.g-' + (shown || 'EMPTY'), { 'data-f': a.key + '|gap', title: cur ? 'Workshop gap type' : 'Pre-filled from Ops GAP – confirm or change', style: cur ? null : { borderStyle: 'dashed' }, onClick: (e) => e.stopPropagation(), onChange: (e) => { e.stopPropagation(); set(a.key, 'gapType', e.target.value || null); } },
      el('option', { value: '' }, '– gap type –'), GAP_OPTS.map(g => el('option', { value: g, selected: shown === g }, full ? UI.PILL_LABEL[g] : FG.GAP_TYPES[g].short)));
    return sel;
  }
  function dot(cp) { return el('span.dot' + (cp.done ? '.done' : cp.missing.length < 5 ? '.part' : ''), { title: cp.done ? 'Complete' : 'Missing: ' + cp.missing.join(', ') }); }
  function diffMark(a) { const w = a.workshop; const marks = []; if (w.gapType && a.asIs.gap && w.gapType !== a.asIs.gap && a.asIs.gap !== 'EMPTY') marks.push('gap ≠ Ops'); if (w.fitGap.local !== null && w.fitGap.gbs !== null && a.asIs.le !== null && a.asIs.gbs !== null && (w.fitGap.local !== a.asIs.le || w.fitGap.gbs !== a.asIs.gbs)) marks.push('split ≠ Ops'); return marks.length ? el('span.diff', { title: 'Workshop result differs from the Ops pre-assessment: ' + marks.join(', ') }, '≠ Ops') : null; }
  function ownerSelect(a, path, value, label) {
    const s = state.session; const names = s.participants.map(p => p.name);
    const sel = el('select.select', { 'data-f': a.key + '|' + path, onChange: (e) => { if (e.target.value === '__other') { const v = prompt('Owner name:'); if (v) set(a.key, path, U.clean(v)); else rerender(); } else set(a.key, path, e.target.value || null); } },
      el('option', { value: '' }, '– ' + (label || 'owner') + ' –'), names.map(n => el('option', { value: n, selected: value === n }, n)), value && !names.includes(value) ? el('option', { value, selected: true }, value) : null, el('option', { value: '__other' }, 'Other…'));
    return sel;
  }
  function textInput(a, path, value, ph, multi) {
    const n = el(multi ? 'textarea.textarea' : 'input.input', { 'data-f': a.key + '|' + path, placeholder: ph || '', value: value || '', style: multi ? { minHeight: '3rem' } : null, onInput: (e) => { W.setField(state.session, a.key, path, U.clean(e.target.value) || null, { silent: true }); UI.touch(); }, onChange: () => rerender(), onKeydown: (e) => { if (e.key === 'Escape') e.target.blur(); } });
    return n;
  }

  /* ---------- panel per entity (expanded row) ---------------------------------------- */
  function panel(c, p, e) {
    const s = c.s, a = s.assessments[M.aKey(e.key, p.id)]; if (!a) return el('div.panel', el('div.ph', el('h4', e.displayName)), el('p.small.muted', 'Not in this file for this entity.'));
    const w = a.workshop, cp = W.completeness(a, p), sg = W.suggest(a, p), quick = W.quickValues(s);
    const pn = el('div.panel');
    const head = el('div.ph', el('h4', e.displayName), w.status ? el('span.pill.' + W.STATUS[w.status].cls, W.STATUS[w.status].label) : null, diffMark(a));
    if (sg.confirmFit) head.appendChild(el('button.btn.sm.primary', { title: 'Fit-Gap = To-Be and Ops NO GAP: confirm as fit, Detailed Gap n/a (key C)', onClick: () => { W.confirmFit(s, a.key); UI.touch(); rerender(); } }, 'Confirm as fit'));
    pn.appendChild(head);
    pn.appendChild(el('div.demo-row', { style: { margin: '0 0 .3rem' } }, el('button.link.small', { onClick: () => { const n = W.applyToAllEntities(s, a.key); UI.touch(); rerender(); UI.toast('Applied to ' + n + ' other entit' + (n === 1 ? 'y' : 'ies')); } }, 'Apply to all entities'), el('button.link.small', { onClick: () => { const r = W.copyDetailedGapFromPrevious(s, a.key); if (r) { UI.touch(); rerender(); UI.toast('Detailed Gap copied from ' + r); } else UI.toast('No previous activity with Detailed Gap in this L3'); } }, 'Copy Detailed Gap from previous')));
    // context
    const dl = el('dl.ctx');
    dl.appendChild(el('dt', 'To-Be')); dl.appendChild(el('dd', UI.splitPill(p.toBe && p.toBe.le, p.toBe && p.toBe.gbs), p.toBe && p.toBe.system ? ' ' + p.toBe.system : '', p.toBe && p.toBe.initiative ? el('span.muted', ' · ' + p.toBe.initiative) : null));
    dl.appendChild(el('dt', 'Ops')); dl.appendChild(el('dd', a.importStatus === 'OUT_OF_SCOPE' ? UI.gapPill('OUT_OF_SCOPE') : UI.gapPill(a.asIs.gap || 'EMPTY'), ' ', UI.splitPill(a.asIs.le, a.asIs.gbs), a.asIs.systems ? ' ' + a.asIs.systems : '', a.asIs.gapRaw && a.asIs.gap === 'UNCLEAR' ? el('span.muted', ' "' + a.asIs.gapRaw + '"') : null));
    if (a.asIs.info) { dl.appendChild(el('dt', 'Ops note')); dl.appendChild(el('dd', a.asIs.info)); }
    const presets = Object.entries(a.fitGapPreset || {}).concat(Object.entries(a.detailedGapPreset || {})).filter(([, v]) => v !== null && v !== undefined);
    if (presets.length) { dl.appendChild(el('dt', 'Pre-set')); dl.appendChild(el('dd', presets.map(([k, v]) => k + ': ' + v).join(' · '))); }
    const notes = (p.notes || []).filter(n => n.entityKey === e.key); if (notes.length) { dl.appendChild(el('dt', 'File note')); dl.appendChild(el('dd', notes.map(n => n.text).join(' · '))); }
    pn.appendChild(dl);
    // step 1
    const st1 = el('div.step', el('div.eyebrow', 'Step 1 · Fit-Gap', cp.fitGapDone ? null : el('span.req', 'required')));
    st1.appendChild(el('div.fg', ynGroup(a, true), el('label', 'FTE'), fteInput(a)));
    if (sg.splitDelta) st1.appendChild(el('div.hint' + (sg.harmonization ? '.sug' : ''), sg.splitDelta, sg.harmonization ? el('button.btn.sm', { onClick: () => set(a.key, 'gapType', 'HARMONIZATION') }, 'Set HARMONIZATION') : null));
    pn.appendChild(st1);
    // gap type + rationale
    const needsRat = w.gapType && (w.gapType !== 'NO_GAP' || (a.asIs.gap && w.gapType !== a.asIs.gap));
    const gt = el('div.step', el('div.eyebrow', 'Workshop gap type', !w.gapType ? el('span.req', 'required') : null));
    gt.appendChild(el('div.fg', gapSelect(a, true), a.asIs.gap && w.gapType && w.gapType !== a.asIs.gap ? el('span.xs.muted', 'Ops: ' + UI.PILL_LABEL[a.asIs.gap]) : null));
    gt.appendChild(el('div', { style: { marginTop: '.4rem' } }, textInput(a, 'rationale', w.rationale, needsRat ? 'Rationale (required: not NO GAP or differs from Ops)' : 'Rationale (optional)'), needsRat && !w.rationale ? el('div.missing', 'Rationale required') : null));
    if (w.gapType === 'STANDARDIZATION' || w.gapType === 'BOTH') {
      const inits = W.initiatives(s);
      gt.appendChild(el('div.hint', el('span.pill.info', 'Initiative candidate (PE / WP3)'), el('select.select', { style: { width: 'auto' }, 'data-f': a.key + '|init', onChange: (ev) => set(a.key, 'initiative', ev.target.value || null) }, el('option', { value: '' }, '– link to existing initiative –'), inits.map(i => el('option', { value: i, selected: w.initiative === i }, i)), el('option', { value: '__new', selected: w.initiative === '__new' }, 'New initiative candidate'))));
    }
    pn.appendChild(gt);
    // step 2
    const st2 = el('div.step', el('div.eyebrow', 'Step 2 · Detailed Gap', cp.detailedGapDone ? null : el('span.req', W.GAP_IS_GAP(w.gapType) ? 'at least one field' : 'or n/a'), el('span.grow', { style: { flex: 1 } }), el('button.chip' + (w.detailedGap.na ? '.on' : ''), { 'data-f': a.key + '|na', onClick: () => set(a.key, 'detailedGap.na', !w.detailedGap.na) }, 'n/a for all')));
    for (const [k, label] of W.DG_FIELDS) {
      const v = w.detailedGap[k];
      const inp = textInput(a, 'detailedGap.' + k, v, w.detailedGap.na && !v ? 'n/a' : '…');
      const chips = el('div.chips', (quick[k] || []).filter(q => q !== v).slice(0, 5).map(q => el('button.chip', { tabindex: -1, onClick: () => set(a.key, 'detailedGap.' + k, v ? v + ' / ' + q : q) }, q)), v !== 'n/a' ? el('button.chip', { tabindex: -1, title: 'Not applicable', onClick: () => set(a.key, 'detailedGap.' + k, 'n/a') }, 'n/a') : null);
      st2.appendChild(el('div.dgf', el('label', label), el('div', inp, chips)));
    }
    pn.appendChild(st2);
    // deviation
    if (W.GAP_IS_GAP(w.gapType)) {
      const d = w.deviation || { dimensions: [], resolution: null, justification: null, owner: null, targetDate: null, escalation: 'L1', approval: 'PROPOSED' };
      if (!w.deviation) { w.deviation = d; }
      const dev = el('div.dev', el('div.eyebrow', 'Deviation', el('span.req', 'owner + resolution required')));
      dev.appendChild(el('div.fg', { style: { marginBottom: '.5rem' } }, el('span.xs.muted', 'Dimension'), W.DIMENSIONS.map(dim => el('button.chip' + (d.dimensions.includes(dim) ? '.on' : ''), { 'data-f': a.key + '|dim' + dim, onClick: () => set(a.key, 'deviation.dimensions', d.dimensions.includes(dim) ? d.dimensions.filter(x => x !== dim) : d.dimensions.concat([dim])) }, dim))));
      const grid = el('div.form-grid');
      grid.appendChild(el('div.field', el('label', 'Resolution approach'), el('select.select', { 'data-f': a.key + '|res', onChange: (ev) => set(a.key, 'deviation.resolution', ev.target.value || null) }, el('option', { value: '' }, '–'), Object.entries(W.RESOLUTION).map(([k, l]) => el('option', { value: k, selected: d.resolution === k }, l)))));
      grid.appendChild(el('div.field', el('label', 'Accountable owner'), ownerSelect(a, 'deviation.owner', d.owner)));
      grid.appendChild(el('div.field', el('label', 'Target date'), el('input.input', { type: 'date', 'data-f': a.key + '|tgt', value: d.targetDate || '', onChange: (ev) => set(a.key, 'deviation.targetDate', ev.target.value || null) })));
      grid.appendChild(el('div.field', el('label', 'Escalation level'), el('select.select', { 'data-f': a.key + '|esc', onChange: (ev) => set(a.key, 'deviation.escalation', ev.target.value) }, Object.entries(W.ESCALATION).map(([k, l]) => el('option', { value: k, selected: d.escalation === k }, l)))));
      grid.appendChild(el('div.field', el('label', 'Approval'), el('select.select', { 'data-f': a.key + '|appr', onChange: (ev) => set(a.key, 'deviation.approval', ev.target.value) }, Object.entries(W.APPROVAL).map(([k, l]) => el('option', { value: k, selected: d.approval === k }, l)))));
      dev.appendChild(grid);
      dev.appendChild(el('div.field', el('label', 'Justification' + (d.resolution === 'SEPARATE_VARIANT' ? ' (required for separate variant)' : '')), textInput(a, 'deviation.justification', d.justification, 'Valid, documented reason (legal, tax, regulatory …)', true)));
      pn.appendChild(dev);
    }
    // status
    const stt = el('div.step', el('div.eyebrow', 'Workshop status', !w.status ? el('span.req', 'required') : null));
    stt.appendChild(el('div.statuses', Object.entries(W.STATUS).map(([k, v]) => el('button' + (w.status === k ? '.on' : ''), { 'data-f': a.key + '|st' + k, onClick: () => set(a.key, 'status', w.status === k ? null : k) }, el('kbd', v.key), v.label))));
    stt.appendChild(el('div', { style: { marginTop: '.5rem' } }, textInput(a, 'comment', w.comment, w.status === 'OUT_OF_SCOPE' ? 'Reason for out of scope (required)' : 'Comment (Enter key opens this)', true)));
    stt.appendChild(el('div.fg', { style: { marginTop: '.4rem' } }, el('label', 'Next step'), textInput(a, 'nextStep', w.nextStep, 'Action'), ownerSelect(a, 'owner', w.owner, 'owner'), el('input.input', { type: 'date', style: { width: 'auto' }, 'data-f': a.key + '|due', value: w.due || '', onChange: (ev) => set(a.key, 'due', ev.target.value || null) })));
    pn.appendChild(stt);
    // taxonomy request + history
    const tx = el('details', { style: { marginTop: '.5rem' } }, el('summary.link.small', { style: { cursor: 'pointer' } }, 'Log taxonomy change request'));
    const txc = el('input.input', { placeholder: 'Proposed change (missing / duplicate / wrong activity)' }), txr = el('input.input', { placeholder: 'Reason', style: { marginTop: '.3rem' } });
    tx.appendChild(el('div', { style: { marginTop: '.4rem' } }, txc, txr, el('div.demo-row', el('button.btn.sm', { onClick: () => { if (!U.clean(txc.value)) return; W.addTaxonomyRequest(s, { processId: p.id, entityKey: e.key, change: txc.value, reason: txr.value }); UI.touch(); rerender(); UI.toast('Taxonomy change request logged (' + s.taxonomyRequests.length + ')'); } }, 'Log request'))));
    pn.appendChild(tx);
    const hist = s.audit.filter(x => x.entityKey === e.key && x.processId === p.id);
    const hd = el('details', { style: { marginTop: '.3rem' } }, el('summary.link.small', { style: { cursor: 'pointer' } }, 'History (' + hist.length + ')'));
    hd.appendChild(el('ul.hist', hist.slice().reverse().slice(0, 50).map(x => el('li', el('span.mono', new Date(x.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })), ' ', x.editor ? x.editor + ' · ' : '', x.kind !== 'edit' ? x.kind + ' · ' : '', (x.field || '').replace('workshop.', ''), ': ', JSON.stringify(x.old), ' → ', JSON.stringify(x.new)))));
    pn.appendChild(hd);
    pn.appendChild(el('div.missing' + (cp.done ? '.ok' : ''), cp.done ? '✓ Complete' : 'Missing: ' + cp.missing.join(', ')));
    return pn;
  }

  /* ---------- cell per entity (table row) ---------------------------------------------- */
  function cell(c, p, e) {
    const a = c.s.assessments[M.aKey(e.key, p.id)];
    if (!a) return el('td', el('span.muted', '·'));
    const w = a.workshop;
    if (a.importStatus === 'OUT_OF_SCOPE' && !w.status) return el('td', el('div.cell', el('div.top', UI.gapPill('OUT_OF_SCOPE', { short: true }), el('span.oos', { title: a.importStatusReason }, 'pre-set')), el('button.link.small', { onClick: (ev) => { ev.stopPropagation(); ws.open = p.id; ws.sel = p.id; set(a.key, 'status', 'OPEN_QUESTION'); } }, 'override…')));
    if (w.status === 'OUT_OF_SCOPE') return el('td', el('div.cell', el('div.top', UI.gapPill('OUT_OF_SCOPE', { short: true }), el('span.oos', 'workshop')), el('span.xs.muted', w.comment || el('span.diff', 'reason missing'))));
    const cp = W.completeness(a, p);
    return el('td', el('div.cell', el('div.top', dot(cp), gapSelect(a), diffMark(a), w.status ? el('span.pill.' + W.STATUS[w.status].cls, { title: W.STATUS[w.status].label }, W.STATUS[w.status].label.split(' ')[0]) : null), el('div.bot', ynGroup(a), fteInput(a))));
  }

  /* ---------- main render -------------------------------------------------------------- */
  function render(c) {
    const cx = ctx(); const s = cx.s;
    const page = el('div.page', { style: { maxWidth: 'none' } });
    if (!s.files.length) { page.appendChild(UI.pageHead('Workshop')); page.appendChild(el('div.empty', UI.icon('inbox', 'ico'), el('h2', 'No data yet'), el('p', 'Workshop mode needs imported capture sheets. ', el('button.link', { onClick: () => UI.navigate('prepare.import') }, 'Import capture sheets'), ' or ', el('button.link', { onClick: () => UI.importDemo() }, 'try with demo data'), '.'))); c.appendChild(page); return; }
    // tabs
    const tabs = el('div.tabs');
    for (const x of cx.streams) tabs.appendChild(el('button' + (x.key === cx.stream ? '.on' : ''), { onClick: () => go({ stream: x.key }) }, x.key, ' ', el('span.muted', U.fmtInt(x.activities))));
    if (M.processList(s).some(p => p.isMasterData)) tabs.appendChild(el('button' + (cx.stream === 'MD' ? '.on' : ''), { onClick: () => go({ stream: 'MD' }), title: 'Master-data nodes across all streams (MD session)' }, 'MD · Master Data'));
    page.appendChild(tabs);
    // bar
    const entSel = el('select.select', { onChange: (e) => { ws.entity = e.target.value; rerender(); } }, el('option', { value: 'all', selected: ws.entity === 'all' }, 'All entities side by side'), cx.allEnts.map(e => el('option', { value: e.key, selected: ws.entity === e.key }, (e.code ? e.code + ' ' : '') + e.displayName)));
    const mode = el('div.toggle', el('button' + (!ws.walkAll ? '.on' : ''), { onClick: () => { ws.walkAll = false; rerender(); }, title: 'Confirm Ops NO GAP in bulk, discuss only flagged rows' }, 'Exception-based'), el('button' + (ws.walkAll ? '.on' : ''), { onClick: () => { ws.walkAll = true; rerender(); }, title: 'Walk every activity (streams with time, e.g. R2R)' }, 'Walk all'));
    const eligible = cx.acts.reduce((n, p) => n + cx.entKeys.filter(ek => { const a = s.assessments[M.aKey(ek, p.id)]; return a && a.importStatus !== 'OUT_OF_SCOPE' && !a.workshop.status && a.asIs.gap === 'NO_GAP'; }).length, 0);
    const bulk = el('button.btn.primary', { disabled: !eligible || !cx.l3, title: 'Accept all Ops NO GAP rows of this L3 for ' + (ws.entity === 'all' ? 'all entities' : 'the selected entity') + ' as confirmed fit (logged as bulk confirmation, undo in the toast)', onClick: () => { const u = W.bulkConfirm(s, cx.l3, cx.entKeys); UI.touch(); rerender(); UI.toast(u.keys.length + ' assessment(s) confirmed as fit for ' + cx.l3, { action: 'Undo', onAction: () => { W.undoBulk(s, u); UI.touch(); rerender(); } }); } }, 'Confirm Ops NO GAP for this L3', eligible ? el('span.mono', ' ' + eligible) : null);
    page.appendChild(el('div.ws-bar', entSel, mode, el('div.grow'), bulk));
    // tree
    const tree = el('div.tree');
    for (const n of cx.nodes) {
      const pr = W.nodeProgress(s, n.id, cx.entKeys); if (!pr.activities) continue;
      tree.appendChild(el('button.node.l' + n.level + (n.id === cx.l3 ? '.active' : ''), { onClick: () => { if (n.level === 3) go({ l3: n.id }); else { const first = cx.l3s.find(x => x.id.startsWith(n.id + '.')); if (first) go({ l3: first.id }); } }, title: n.id + ' ' + n.name + ' · ' + pr.complete + '/' + pr.assessments + ' complete · ' + pr.openGaps + ' open gaps · fit-gap ' + pr.fitGapDone + ' · detailed ' + pr.detailedGapDone + (pr.fte.withFte ? ' · FTE ' + pr.fte.total.toFixed(2) + ' (' + pr.fte.gbs.toFixed(2) + ' GBS)' : '') },
        el('span.pid', n.id), el('span.nm', n.name), el('span.prog', pr.complete + '/' + pr.assessments), pr.openGaps ? el('span.og', pr.openGaps + '!') : null, el('span.mini', UI.stackBar(pr.workshopMix))));
    }
    // main
    const main = el('div');
    if (cx.l3) {
      const n = cx.byId[cx.l3]; const pr = W.progress(s, cx.acts, cx.entKeys);
      const opsList = UI.gapOrder().filter(k => pr.opsMix[k]).map(k => pr.opsMix[k] + ' ' + UI.PILL_LABEL[k]).join(', ');
      const head = el('div.l3-head',
        el('div', el('div.eyebrow', 'L3 · ' + n.id + ' · ' + W.ancestors(s, n).reverse().map(x => x.name).join(' › ')), el('h2', n.name), el('div.sum', el('b', cx.acts.length), ' activities · Ops: ' + (opsList || 'nothing pre-assessed') + ' · ', el('b', pr.complete + '/' + pr.assessments), ' complete', pr.openGaps ? [' · ', el('b', pr.openGaps), ' open gap(s)'] : null, pr.openQuestions ? [' · ', el('b', pr.openQuestions), ' open question(s)'] : null, pr.changed ? [' · ', el('b', pr.changed), ' changed vs. Ops'] : null, pr.outOfScope ? [' · ', el('b', pr.outOfScope), ' out of scope'] : null),
          el('div.sum', { title: 'FTE impact: FTE entered in Fit-Gap, allocated to the lane(s) the workshop chose (To-Be when not yet assessed). Planned GBS = FTE of activities whose To-Be is GBS.' }, 'FTE impact: ', el('b', pr.fte.total.toFixed(2)), ' total · ', el('b', pr.fte.gbs.toFixed(2)), ' → GBS · ', el('b', pr.fte.local.toFixed(2)), ' local', pr.fte.other ? [' · ', el('b', pr.fte.other.toFixed(2)), ' other'] : null, ' · planned GBS ', el('b', pr.fte.plannedGbs.toFixed(2)), pr.fte.withFte ? el('span.muted', ' (' + pr.fte.withFte + ' with FTE)') : el('span.muted', ' (no FTE entered yet)'))),
        el('div.acts', el('span.xs.muted', 'Flow image: increment 5')),
        el('div.bars', el('span', 'Ops'), UI.stackBar(pr.opsMix), el('span', 'Workshop'), UI.stackBar(pr.workshopMix)));
      main.appendChild(head);
      const table = el('table.ws-table');
      table.appendChild(el('thead', el('tr', el('th', { style: { minWidth: '13rem' } }, 'Activity'), el('th', 'To-Be'), cx.ents.map(e => el('th.ent', e.code || '', el('small', e.displayName))))));
      const tb = el('tbody');
      for (const p of cx.acts) {
        const as = cx.ents.map(e => s.assessments[M.aKey(e.key, p.id)]).filter(Boolean);
        const allFit = as.length && as.every(a => a.workshop.status === 'CONFIRMED_FIT' || (a.importStatus === 'OUT_OF_SCOPE' && !a.workshop.status));
        const tr = el('tr.act' + (p.id === ws.sel ? '.sel' : '') + (!ws.walkAll && allFit ? '.done-all' : ''), { dataset: { pid: p.id }, onClick: () => { ws.sel = p.id; ws.open = ws.open === p.id ? null : p.id; rerender(); } },
          el('td.name', el('div.nm', p.name, (p.notes || []).length ? el('span.pill.warn.notes', { title: p.notes.map(x => x.text).join('\n') }, 'note') : null), el('div.pid', p.id, p.description ? el('span.muted', ' · ' + p.description.slice(0, 90) + (p.description.length > 90 ? '…' : '')) : null)),
          el('td', UI.splitPill(p.toBe && p.toBe.le, p.toBe && p.toBe.gbs), p.toBe && p.toBe.system ? el('div.xs.muted', p.toBe.system) : null),
          cx.ents.map(e => cell(cx, p, e)));
        tb.appendChild(tr);
        if (ws.open === p.id) tb.appendChild(el('tr.expand', el('td', { colspan: 2 + cx.ents.length }, el('div.panels', cx.ents.map(e => panel(cx, p, e))))));
      }
      table.appendChild(tb);
      main.appendChild(el('div.ws-wrap', table));
      main.appendChild(el('div.kbd-hints', el('span', el('kbd.k', '↑↓'), ' activity'), el('span', el('kbd.k', 'Enter'), ' open + comment'), el('span', el('kbd.k', 'E'), ' expand / collapse'), el('span', el('kbd.k', '1–5'), ' status'), el('span', el('kbd.k', 'C'), ' confirm as fit'), el('span', el('kbd.k', 'Tab'), ' next field'), el('span', el('kbd.k', 'Esc'), ' leave field / collapse')));
    } else main.appendChild(el('div.empty', el('h2', 'No activities in this stream')));
    page.appendChild(el('div.split', tree, main));
    c.appendChild(page);
    if (ws.sel) setTimeout(() => { const r = document.querySelector('tr.act.sel'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' }); }, 0);
  }

  /* ---------- keyboard --------------------------------------------------------------------- */
  document.addEventListener('keydown', (e) => {
    if (state.view !== 'run' || !state.session || !state.session.files.length) return;
    const t = e.target, tag = t && t.tagName;
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (inField) { if (e.key === 'Escape') { t.blur(); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open], .cmdk-back')) return;
    const cx = ctx(); if (!cx.acts.length) return;
    const idx = cx.acts.findIndex(a => a.id === ws.sel);
    const sel = cx.acts[idx]; const keysFor = (p) => cx.ents.map(x => M.aKey(x.key, p.id)).filter(k => cx.s.assessments[k]);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const ni = Math.max(0, Math.min(cx.acts.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1))); ws.sel = cx.acts[ni].id; if (ws.open) ws.open = ws.sel; rerender(); return; }
    if (e.key === 'Escape') { if (ws.open) { ws.open = null; rerender(); } return; }
    if (!sel) return;
    if (e.key === 'Enter') { e.preventDefault(); ws.open = sel.id; rerender(); const k = keysFor(sel)[0]; const n = k && document.querySelector('[data-f="' + CSS.escape(k + '|comment') + '"]'); if (n) n.focus(); return; }
    if (e.key === 'e' || e.key === 'E') { ws.open = ws.open === sel.id ? null : sel.id; rerender(); return; }
    if (e.key === 'c' || e.key === 'C') { let n = 0; for (const k of keysFor(sel)) { const a = cx.s.assessments[k]; if (a.importStatus === 'OUT_OF_SCOPE' && !a.workshop.status) continue; if (W.suggest(a, cx.byId[sel.id]).confirmFit || a.asIs.gap === 'NO_GAP') { W.confirmFit(cx.s, k); n++; } } if (n) { UI.touch(); rerender(); UI.toast(n + ' confirmed as fit'); } else UI.toast('Confirm as fit needs Ops NO GAP or a Fit-Gap split equal to To-Be'); return; }
    const st = Object.entries(W.STATUS).find(([, v]) => v.key === e.key);
    if (st) { for (const k of keysFor(sel)) W.setField(cx.s, k, 'status', st[0]); UI.touch(); if (st[0] === 'OUT_OF_SCOPE') ws.open = sel.id; rerender(); return; }
  });

  UI.VIEWS.run = { crumb: (st) => ['3 Run', st.params.stream || 'Workshop', st.params.l3 || ''].filter(Boolean), render };
})(typeof globalThis !== 'undefined' ? globalThis : window);
