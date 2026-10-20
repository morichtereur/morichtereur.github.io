/* ---------------------------------------------------------------------------
 * 60-ui-import.js – PREPARE › Import capture sheets: drop zone, per-file
 * progress, sheet picker, import summary (files, entities × streams, counts,
 * gap distribution, warnings, unmapped values, notes, re-import diff review,
 * detected structure per file).
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG, U = FG.util, M = FG.model, UI = FG.ui, el = UI.el, state = UI.state;
  let processing = false;
  const tick = () => new Promise(r => setTimeout(r, 30));

  function addFiles(files) {
    let n = 0;
    for (const f of files) {
      if (!/\.xls[xm]$/i.test(f.name)) { UI.toast('Skipped ' + f.name + ' – only .xlsx / .xlsm capture sheets are supported', { flag: true }); continue; }
      state.importQueue.push({ id: U.uid('q'), file: f, name: f.name, size: f.size, status: 'queued', progress: 0 }); n++;
    }
    if (n) { UI.render(); processQueue(); }
  }
  async function processQueue() {
    if (processing) return; processing = true;
    try {
      for (const item of state.importQueue) { if (item.status === 'queued') await processItem(item); }
    } finally { processing = false; }
    UI.render();
    const done = state.importQueue.filter(i => i.status === 'done').length;
    if (done && !state.importQueue.some(i => i.status === 'pick')) {
      const diffs = state.session.pendingDiffs.length;
      UI.toast(done + ' file(s) imported' + (diffs ? ' · ' + diffs + ' changed Ops value(s) to review' : ''), { action: 'Clear list', onAction: () => { state.importQueue = state.importQueue.filter(i => i.status !== 'done'); UI.render(); } });
    }
  }
  async function processItem(item) {
    const XLSX = root.XLSX;
    try {
      item.status = 'reading'; item.progress = 15; UI.render(); await tick();
      const buf = item.buffer || await item.file.arrayBuffer();
      item.buffer = buf;
      item.status = 'parsing'; item.progress = 45; UI.render(); await tick();
      const wb = item.wb || XLSX.read(buf, { type: 'array', cellStyles: false, cellHTML: false, cellText: false });
      item.wb = wb;
      const res = FG.parser.parseWorkbook(wb, { fileName: item.name, sheetName: item.sheetName });
      if (!res.ok && res.needsPick) { item.status = 'pick'; item.candidates = res.needsPick; UI.render(); return; }
      if (!res.ok) { item.status = 'error'; item.error = res.error; UI.render(); return; }
      item.status = 'merging'; item.progress = 80; UI.render(); await tick();
      item.summary = M.mergeImport(state.session, res);
      item.stats = res.stats; item.warnings = res.warnings.length;
      item.status = 'done'; item.progress = 100;
      item.wb = null; item.buffer = null;
      UI.touch();
    } catch (e) {
      item.status = 'error'; item.error = (e && e.message) || String(e);
    }
    UI.render();
  }
  function importDemo() {
    const XLSX = root.XLSX;
    const files = FG.demo.buildWorkbooks(XLSX).map(f => { const out = XLSX.write(f.wb, { type: 'array', bookType: 'xlsx' }); return new File([out], f.name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); });
    if (!state.session.settings.clientName) state.session.settings.clientName = 'Demo Group';
    if (!state.session.settings.country) state.session.settings.country = 'France';
    addFiles(files);
  }
  UI.importDemo = importDemo;
  UI.addFiles = addFiles;

  /* ---------- rendering --------------------------------------------------------- */
  function dropzone() {
    const input = el('input', { type: 'file', multiple: true, accept: '.xlsx,.xlsm', onChange: (e) => { addFiles(Array.from(e.target.files)); e.target.value = ''; } });
    const dz = el('div.dropzone', { tabindex: 0, role: 'button', 'aria-label': 'Drop capture sheets here or press Enter to choose files',
      onClick: () => input.click(), onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
      onDragover: (e) => { e.preventDefault(); dz.classList.add('over'); }, onDragleave: () => dz.classList.remove('over'),
      onDrop: (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles(Array.from(e.dataTransfer.files)); } },
      UI.icon('inbox', 'ico'), el('h2', 'Drop all capture sheets here'), el('p.muted.small', 'R2R, A2R, I2P, I2C, ICO, I2C_CMD – all at once. Newer versions of a file can be re-imported: workshop results are never overwritten, changed Ops values are shown for review.'),
      el('div.demo-row', { style: { justifyContent: 'center' } }, el('button.btn.primary', { onClick: (e) => { e.stopPropagation(); input.click(); } }, 'Choose files'), el('button.link', { onClick: (e) => { e.stopPropagation(); importDemo(); } }, 'Try with demo data')), input);
    return dz;
  }
  function fileQueue() {
    if (!state.importQueue.length) return null;
    const list = el('div.filelist');
    for (const it of state.importQueue) {
      const row = el('div.filerow' + (it.status === 'error' ? '.error' : it.status === 'done' ? '.done' : ''));
      row.appendChild(UI.icon('file', 'ico'));
      const st = { queued: 'Queued', reading: 'Reading file…', parsing: 'Detecting structure…', merging: 'Merging into session…', pick: 'Several candidate sheets – pick one', error: 'Error: ' + it.error, done: it.summary ? (it.summary.isReimport ? 'Re-imported' : 'Imported') + ' · ' + U.fmtInt(it.stats.activities) + ' activities · ' + it.stats.entities + ' entities · ' + U.fmtInt(it.stats.assessments) + ' assessments' + (it.stats.outOfScope ? ' · ' + U.fmtInt(it.stats.outOfScope) + ' out of scope' : '') + (it.warnings ? ' · ' + it.warnings + ' warning(s)' : '') + (it.summary.diffs.length ? ' · ' + it.summary.diffs.length + ' change(s) to review' : '') : 'Imported' }[it.status];
      row.appendChild(el('div', el('div.nm', it.name), el('div.st', st)));
      row.appendChild(el('div.xs.muted.mono', Math.round(it.size / 1024) + ' KB'));
      const busy = ['reading', 'parsing', 'merging'].includes(it.status);
      row.appendChild(el('div.prog' + (busy ? '.busy' : ''), el('span', { style: { width: it.progress + '%' } })));
      if (it.status === 'pick') {
        const pick = el('div.pick', el('span.muted', 'Sheets starting with "Fit-Gap":'));
        for (const c of it.candidates) pick.appendChild(el('button.btn.sm', { onClick: () => { it.sheetName = c; it.status = 'queued'; UI.render(); processQueue(); } }, c));
        row.appendChild(pick);
      }
      list.appendChild(row);
    }
    return list;
  }

  function kpi(v, label, cls, small) { return el('div.kpi' + (cls ? '.' + cls : ''), el('div.v', U.fmtInt(v), small ? el('small', small) : null), el('div.l', label)); }

  function summary() {
    const s = state.session;
    if (!s.files.length) return null;
    const t = M.totals(s);
    const warnCount = s.files.reduce((a, f) => a + f.warnings.filter(w => w.level === 'warn' || w.level === 'error').length, 0);
    const frag = document.createDocumentFragment();
    frag.appendChild(el('div.eyebrow', { style: { margin: '1.6rem 0 .6rem' } }, 'Import summary'));
    frag.appendChild(el('div.kpis',
      kpi(s.files.length, 'Files'), kpi(t.entities, 'Entities'), kpi(t.activities, 'Activities in scope'), kpi(t.assessments, 'Entity × activity assessments', 'ok'),
      kpi(t.outOfScope, 'Out of scope (excluded)', 'none'),
      kpi(warnCount, 'Parsing warnings', warnCount ? 'issue' : 'ok'), kpi(s.pendingDiffs.length, 'Ops changes to review', s.pendingDiffs.length ? 'issue' : 'ok')));
    if (s.pendingDiffs.length) frag.appendChild(diffCard());
    frag.appendChild(el('div.cards', matrixCard(), gapCard()));
    frag.appendChild(filesCard());
    const warnCard = warningsCard(); if (warnCard) frag.appendChild(warnCard);
    const um = unmappedCard(); if (um) frag.appendChild(um);
    const nc = notesCard(); if (nc) frag.appendChild(nc);
    return frag;
  }

  function matrixCard() {
    const s = state.session, m = M.entityStreamMatrix(s);
    const table = el('table.table.compact');
    table.appendChild(el('thead', el('tr', el('th', 'Entity'), m.streams.map(x => el('th.num', x.key)), el('th.num', 'Total'))));
    const tb = el('tbody');
    for (const e of m.entities) {
      const row = m.cells[e.key] || {};
      const tot = Object.values(row).reduce((a, b) => a + b, 0);
      const name = el('input.input.sm', { type: 'text', value: e.displayName, title: 'Display name (editable)', onChange: (ev) => { const old = e.displayName; e.displayName = U.clean(ev.target.value) || e.name; M.logChange(s, { kind: 'edit', field: 'entity.displayName', entityKey: e.key, old, new: e.displayName }); UI.touch(); UI.renderSidebar && UI.renderSidebar(); } });
      tb.appendChild(el('tr', el('td', el('div', { style: { display: 'flex', gap: '.5rem', alignItems: 'center' } }, el('span.pid.muted', e.code || '—'), name, e.needsConfirmation ? el('span.pill.warn', { title: 'No 6-digit code in the file – matched by name. Rename or confirm.' }, 'confirm') : null)),
        m.streams.map(x => el('td.num', row[x.key] ? U.fmtInt(row[x.key]) : el('span.muted', '·'))), el('td.num', el('b', U.fmtInt(tot)))));
    }
    table.appendChild(tb);
    return el('div.card', el('div.card-head', el('h2', 'Entities × streams'), el('span.stats', 'assessments per cell')), el('div.scroll-x', table), el('p.xs.muted', { style: { marginTop: '.6rem' } }, 'Entities are merged across files by their 6-digit code. Display names can be edited here; the change is logged.'));
  }

  function gapCard() {
    const s = state.session, streams = M.streamSummary(s), t = M.totals(s);
    const card = el('div.card', el('div.card-head', el('h2', 'Ops pre-assessment by stream'), el('span.stats', 'GAP column, excluding out of scope')));
    const table = el('table.table.compact');
    table.appendChild(el('thead', el('tr', el('th', 'Stream'), el('th.num', 'Activities'), el('th.num', 'Assessed'), el('th.num', 'OOS'), el('th', { style: { width: '40%' } }, 'Ops GAP mix'))));
    const tb = el('tbody');
    for (const x of streams) tb.appendChild(el('tr.clickable', { onClick: () => UI.navigate('run', { stream: x.key }) }, el('td', el('span.pid', x.key), x.masterData ? el('span.xs.muted', ' · ' + x.masterData + ' MD') : null), el('td.num', U.fmtInt(x.activities)), el('td.num', U.fmtInt(x.assessments)), el('td.num', x.outOfScope ? U.fmtInt(x.outOfScope) : el('span.muted', '·')), el('td', UI.stackBar(x.gapMix))));
    table.appendChild(tb);
    card.appendChild(table);
    // overall bars as inline SVG
    const order = UI.gapOrder().filter(k => t.gapMix[k]);
    const total = Object.values(t.gapMix).reduce((a, b) => a + b, 0) || 1;
    const rowH = 22, w = 420, labelW = 150;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${order.length * rowH + 4}`); svg.setAttribute('width', '100%'); svg.style.marginTop = '.8rem'; svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Ops gap distribution, all streams');
    const max = Math.max.apply(null, order.map(k => t.gapMix[k])) || 1;
    order.forEach((k, i) => {
      const y = i * rowH + 2, v = t.gapMix[k], bw = Math.max(2, (w - labelW - 60) * v / max);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = `<text x="${labelW - 8}" y="${y + 14}" text-anchor="end" font-size="10" font-family="IBM Plex Mono, monospace" fill="currentColor" opacity=".75">${UI.PILL_LABEL[k]}</text><rect x="${labelW}" y="${y + 3}" width="${bw}" height="${rowH - 8}" rx="2" class="sw-${k}" fill="currentColor"></rect><text x="${labelW + bw + 6}" y="${y + 14}" font-size="10" font-family="IBM Plex Mono, monospace" fill="currentColor">${U.fmtInt(v)} · ${U.pct(v, total)}%</text>`;
      g.querySelector('rect').setAttribute('style', `fill: var(--gap-${{ NO_GAP: 'none', HARMONIZATION: 'harm', STANDARDIZATION: 'stand', BOTH: 'both', NA: 'na', OUT_OF_SCOPE: 'oos', UNCLEAR: 'unclear', EMPTY: 'empty' }[k]})`);
      svg.appendChild(g);
    });
    card.appendChild(el('div.eyebrow', { style: { marginTop: '1rem' } }, 'All streams · ' + U.fmtInt(total) + ' assessments'));
    card.appendChild(svg);
    return card;
  }

  function filesCard() {
    const s = state.session;
    const card = el('div.card', el('div.card-head', el('h2', 'Files and detected structure'), el('span.stats', s.files.length + ' file(s) · profile #1')));
    const table = el('table.table.compact');
    table.appendChild(el('thead', el('tr', el('th', 'File'), el('th', 'Sheet'), el('th.num', 'Header row'), el('th.num', 'Entities'), el('th.num', 'Activities'), el('th.num', 'Assessments'), el('th.num', 'OOS'), el('th.num', 'Flows'), el('th', 'Warnings'), el('th', 'Imported'))));
    const tb = el('tbody');
    for (const f of s.files) {
      const w = f.warnings.filter(x => x.level !== 'info').length, i = f.warnings.length - w;
      const tr = el('tr.clickable', { onClick: () => { const d = tb.querySelector('[data-detail="' + f.id + '"]'); d.classList.toggle('hidden'); } },
        el('td', el('b', f.name), f.version > 1 ? el('span.pill.info', { style: { marginLeft: '.4rem' } }, 'v' + f.version) : null), el('td.mono.small', f.sheetName), el('td.num', f.structure.headerRow), el('td.num', f.stats.entities), el('td.num', U.fmtInt(f.stats.activities)), el('td.num', U.fmtInt(f.stats.assessments)), el('td.num', f.stats.outOfScope ? U.fmtInt(f.stats.outOfScope) : '·'), el('td.num', f.stats.flowSheets || '·'),
        el('td', w ? el('span.pill.warn', w + ' warn') : null, i ? el('span.pill.neutral', { style: { marginLeft: '.3rem' } }, i + ' info') : null, !w && !i ? el('span.pill.ok', 'clean') : null),
        el('td.small.muted', new Date(f.importedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })));
      tb.appendChild(tr);
      tb.appendChild(el('tr.hidden', { dataset: { detail: f.id } }, el('td', { colspan: 10, style: { background: 'var(--bg)' } }, structureDetail(f))));
    }
    table.appendChild(tb);
    card.appendChild(el('div.scroll-x', table));
    card.appendChild(el('p.xs.muted', { style: { marginTop: '.6rem' } }, 'Click a file to see how its layout was detected (blocks, entity labels, column → field mapping). Re-importing a newer version of a file replaces its entry here and keeps all workshop results.'));
    return card;
  }
  function structureDetail(f) {
    const st = f.structure;
    const wrap = el('div', { style: { padding: '.4rem 0' } });
    wrap.appendChild(el('div.small', el('b', 'Header row ' + st.headerRow), ' · id columns: level ', el('span.pid', st.idCols.level), ' · ID ', el('span.pid', st.idCols.id), ' · name ', el('span.pid', st.idCols.name), ' · description ', el('span.pid', st.idCols.description),
      ' · sheets ignored: ', el('span.muted', st.sheets.ignored.map(x => x.name + ' (' + x.reason + ')').join(', ') || 'none'), ' · flow sheets: ', el('span.muted', st.sheets.flows.join(', ') || 'none')));
    const table = el('table.table.compact', { style: { marginTop: '.5rem' } });
    table.appendChild(el('thead', el('tr', el('th', 'Block'), el('th', 'Entity'), el('th', 'Columns'), el('th', 'Title cell'), el('th', 'Field → column'), el('th', 'Unmapped columns'))));
    const tb = el('tbody');
    for (const b of st.blocks) {
      tb.appendChild(el('tr', el('td', el('b', b.label)), el('td.small', b.entity ? (b.entity.code ? b.entity.code + ' ' : '') + b.entity.name : el('span.muted', 'shared')), el('td.mono.small', b.colStartLetter + '–' + b.colEndLetter), el('td.small.muted', b.title),
        el('td.small', Object.entries(b.fields).map(([k, v]) => el('span.chip', { style: { cursor: 'default', marginRight: '.25rem', marginBottom: '.2rem' }, title: v.header }, k, el('span.pid.muted', v.letter)))),
        el('td.small.muted', b.unmapped.length ? b.unmapped.map(u => U.colLetter(u.col) + ' "' + u.header + '"').join(', ') : '·')));
    }
    table.appendChild(tb);
    wrap.appendChild(el('div.scroll-x', table));
    if (f.warnings.length) wrap.appendChild(el('ul.small', { style: { margin: '.5rem 0 0 1rem', padding: 0 } }, f.warnings.map(w => el('li', el('span.pill.' + (w.level === 'warn' || w.level === 'error' ? 'warn' : 'neutral'), w.level), ' ', el('span.mono.muted', w.code), ' ', w.msg))));
    return wrap;
  }

  function warningsCard() {
    const s = state.session;
    const all = [];
    for (const f of s.files) for (const w of f.warnings) all.push({ ...w, file: f.name });
    if (!all.length) return null;
    const sorted = all.sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.level] - { error: 0, warn: 1, info: 2 }[b.level]));
    const card = el('div.card', el('div.card-head', el('h2', 'Parsing report'), el('span.stats', all.length + ' message(s)')));
    const table = el('table.table.compact');
    table.appendChild(el('thead', el('tr', el('th', 'Level'), el('th', 'File'), el('th', 'Code'), el('th', 'Message'))));
    table.appendChild(el('tbody', sorted.map(w => el('tr', el('td', el('span.pill.' + (w.level === 'info' ? 'neutral' : w.level === 'error' ? 'flag' : 'warn'), w.level)), el('td.small', w.file), el('td.mono.small.muted', w.code), el('td.small', w.msg)))));
    card.appendChild(el('div.scroll-x', table));
    return card;
  }
  function unmappedCard() {
    const s = state.session;
    const rows = [];
    for (const f of s.files) {
      for (const [v, n] of Object.entries(f.unmapped.gap || {})) rows.push({ kind: 'GAP', value: v, n, file: f.name, mapped: 'UNCLEAR' });
      for (const [v, n] of Object.entries(f.unmapped.yn || {})) rows.push({ kind: 'Y/N', value: v, n, file: f.name, mapped: 'kept as text' });
      for (const [v, n] of Object.entries(f.unmapped.num || {})) rows.push({ kind: 'FTE', value: v, n, file: f.name, mapped: 'ignored' });
    }
    if (!rows.length) return null;
    const card = el('div.card', el('div.card-head', el('h2', 'Unmapped values'), el('span.stats', rows.length + ' distinct value(s)')), el('p.small.muted', 'Values the normaliser did not recognise. GAP values are imported as UNCLEAR; add a mapping to the template profile if a value is systematic.'));
    const table = el('table.table.compact');
    table.appendChild(el('thead', el('tr', el('th', 'Field'), el('th', 'Value in file'), el('th.num', 'Count'), el('th', 'File'), el('th', 'Imported as'))));
    table.appendChild(el('tbody', rows.map(r => el('tr', el('td.mono.small', r.kind), el('td', el('code', r.value)), el('td.num', U.fmtInt(r.n)), el('td.small', r.file), el('td.small.muted', r.mapped)))));
    card.appendChild(el('div.scroll-x', table));
    return card;
  }
  function notesCard() {
    const s = state.session;
    const notes = [];
    for (const p of M.processList(s)) for (const n of (p.notes || [])) notes.push({ ...n, process: p });
    if (!notes.length) return null;
    const card = el('div.card', el('div.card-head', el('h2', 'Instruction text found in Fit-Gap / Detailed Gap cells'), el('span.stats', notes.length + ' note(s)')), el('p.small.muted', 'Imported as notes on the activity, not as values. Shown in the activity context in workshop mode.'));
    const table = el('table.table.compact');
    table.appendChild(el('thead', el('tr', el('th', 'Process ID'), el('th', 'Activity'), el('th', 'Entity'), el('th', 'Field'), el('th', 'Text'), el('th', 'Cell'))));
    table.appendChild(el('tbody', notes.slice(0, 200).map(n => el('tr.clickable', { onClick: () => UI.navigate('run', { pid: n.processId }) }, el('td.pid', n.processId), el('td.small', n.process.name), el('td.small', n.entityName || n.entityKey), el('td.mono.small', n.block + '.' + n.field), el('td.small', n.text), el('td.mono.small.muted', n.cell + ' · ' + n.file)))));
    card.appendChild(el('div.scroll-x', table));
    return card;
  }
  function diffCard() {
    const s = state.session;
    const card = el('div.card', { style: { borderColor: 'var(--flag)' } }, el('div.card-head', el('h2', 'Changed Ops pre-assessment values – review'), el('span.stats', s.pendingDiffs.length + ' change(s) from re-imported file(s)')),
      el('p.small.muted', 'A newer version of a file carries different Ops values for these entity × activity rows. Workshop results are untouched either way. "Apply" updates the Ops as-is value (logged in the audit trail); "Keep" leaves the current value.'));
    const table = el('table.table.compact');
    table.appendChild(el('thead', el('tr', el('th', 'Entity'), el('th', 'Process ID'), el('th', 'Field'), el('th', 'Current'), el('th', 'New (file)'), el('th', 'File'), el('th', ''))));
    const fmt = (v, field) => field === 'gap' || field === 'status' ? (v ? UI.gapPill(v) : el('span.muted', '—')) : el('span', v === null || v === undefined ? el('span.muted', '—') : String(v));
    const entName = (k) => (s.entities[k] && s.entities[k].displayName) || k;
    table.appendChild(el('tbody', s.pendingDiffs.slice(0, 300).map(d => el('tr', el('td.small', entName(d.entityKey)), el('td.pid', d.processId), el('td.mono.small', d.kind + '.' + d.field), el('td', fmt(d.old, d.field)), el('td', fmt(d.new, d.field)), el('td.small.muted', d.file),
      el('td.nowrap', el('button.btn.sm', { onClick: () => { M.resolveDiff(s, d.id, true); UI.touch(); UI.render(); } }, 'Apply'), ' ', el('button.link.small', { onClick: () => { M.resolveDiff(s, d.id, false); UI.touch(); UI.render(); } }, 'Keep'))))));
    card.appendChild(el('div.scroll-x', table));
    card.appendChild(el('div.demo-row', el('button.btn.primary.sm', { onClick: () => { const n = s.pendingDiffs.length; for (const d of s.pendingDiffs.slice()) M.resolveDiff(s, d.id, true); UI.touch(); UI.render(); UI.toast(n + ' Ops value(s) updated'); } }, 'Apply all'), el('button.btn.sm', { onClick: () => { for (const d of s.pendingDiffs.slice()) M.resolveDiff(s, d.id, false); UI.touch(); UI.render(); } }, 'Keep all current values')));
    return card;
  }

  UI.VIEWS['prepare.import'] = {
    crumb: () => ['2 Prepare', 'Import capture sheets'],
    render(c) {
      const page = el('div.page');
      page.appendChild(UI.pageHead('Import capture sheets', 'Load the pre-filled capture sheets from GBS Operations. The parser detects the layout from cell text (template profile #1), merges all files into one model and reports what it could not map.',
        el('div', el('ol', el('li', 'Drop all workbooks at once. The main sheet is the one whose name starts with "Fit-Gap"; old copies (…old, …vold, …_v2) are ignored.'),
          el('li', 'The header row is detected by the "Process Level" cell; blocks (To-Be, Ops As-Is, Fit-Gap, Detailed Gap, shared blocks) by their titles; entities by the "6-digit code + name" labels above the blocks; fields by fuzzy sub-header matching.'),
          el('li', 'Data rows need a numeric level 0–5 and a valid Process ID. GAP values are normalised (typos, case); "Out of scope" marks the activity for that entity; instruction text becomes a note.'),
          el('li', 'One assessment per entity × Process ID, however many files contain it (I2C_CMD overlaps I2C). Re-importing a newer file never overwrites workshop results – Ops changes are listed for review.')))));
      page.appendChild(dropzone());
      const q = fileQueue(); if (q) page.appendChild(q);
      const sm = summary(); if (sm) page.appendChild(sm);
      else page.appendChild(el('div.empty', UI.icon('inbox', 'ico'), el('h2', 'Nothing imported yet'), el('p', 'Import the capture sheets or ', el('button.link', { onClick: importDemo }, 'try with demo data'), ' to see the summary and the detected structure.')));
      c.appendChild(page);
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
