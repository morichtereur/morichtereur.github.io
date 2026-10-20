/* ---------------------------------------------------------------------------
 * 62-ui-plan.js – PLAN-lite: country set-up (entities, streams in scope),
 * participants, workshop sessions, optional planning-workbook import.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';
  const FG = root.FG, U = FG.util, M = FG.model, W = FG.workshop, UI = FG.ui, el = UI.el, state = UI.state;
  let review = null; // planning workbook review state

  function streamOptions(s) { const keys = M.streamSummary(s).map(x => x.key); if (!keys.includes('MD')) keys.push('MD'); for (const k of ['R2R', 'A2R-FAA', 'A2R-IA', 'I2P', 'I2C', 'ICO']) if (!keys.includes(k)) keys.push(k); return keys; }

  function countryCard() {
    const s = state.session, st = s.settings;
    const bind = (key, ph) => el('input.input', { value: st[key] || '', placeholder: ph || '', onChange: (e) => { const old = st[key]; st[key] = U.clean(e.target.value); M.logChange(s, { kind: 'settings', field: key, old, new: st[key] }); UI.touch(); UI.render(); } });
    const card = el('div.card', el('div.card-head', el('h2', 'Country set-up')),
      el('div.form-grid', el('div.field', el('label', 'Client'), bind('clientName')), el('div.field', el('label', 'Country'), bind('country', 'e.g. France')), el('div.field', el('label', 'Workshop dates'), bind('workshopDates', 'e.g. CW43 · 19–23 Oct')), el('div.field', el('label', 'Facilitators'), bind('facilitators'))));
    const ents = M.entityList(s);
    const t = el('table.table.compact');
    t.appendChild(el('thead', el('tr', el('th', 'Code'), el('th', 'Display name'), el('th', 'Country'), el('th', 'Files'), el('th', ''))));
    t.appendChild(el('tbody', ents.map(e => el('tr', el('td.pid', e.code || '—'), el('td', el('input.input.sm', { value: e.displayName, onChange: (ev) => { const old = e.displayName; e.displayName = U.clean(ev.target.value) || e.name; M.logChange(s, { kind: 'edit', field: 'entity.displayName', entityKey: e.key, old, new: e.displayName }); UI.touch(); UI.render(); } })), el('td', el('input.input.sm', { value: e.country || '', placeholder: st.country || '', onChange: (ev) => { e.country = U.clean(ev.target.value); UI.touch(); } })), el('td.small.muted', (e.sources || []).length + (e.needsConfirmation ? ' · confirm' : '')), el('td', e.sources && e.sources.length ? null : el('button.link.small', { onClick: () => { delete s.entities[e.key]; UI.touch(); UI.render(); } }, 'Remove'))))));
    const addRow = () => { const code = U.clean(prompt('Entity code (6 digits, optional):') || ''); const name = U.clean(prompt('Entity name:') || ''); if (!name) return; const key = code || 'name:' + U.key(name); if (s.entities[key]) { UI.toast('Entity exists'); return; } s.entities[key] = { key, code: code || null, name, displayName: name, country: st.country || '', sources: [], needsConfirmation: !code }; M.logChange(s, { kind: 'plan', field: 'entity.add', old: null, new: name }); UI.touch(); UI.render(); };
    card.appendChild(el('div.eyebrow', { style: { margin: '.8rem 0 .4rem' } }, 'Entities'));
    card.appendChild(ents.length ? el('div.scroll-x', t) : el('p.small.muted', 'No entities yet – they come from the imported files, or add them manually.'));
    card.appendChild(el('div.demo-row', el('button.btn.sm', { onClick: addRow }, 'Add entity manually')));
    const streams = M.streamSummary(s);
    card.appendChild(el('div.eyebrow', { style: { margin: '.8rem 0 .4rem' } }, 'Streams / sub-streams in scope'));
    if (!streams.length) card.appendChild(el('p.small.muted', 'Appear after import. Toggling one off excludes its activities from totals, time budget and analysis.'));
    for (const x of streams) card.appendChild(el('div.demo-row', { style: { margin: '.2rem 0' } }, el('button.switch' + (st.streamScope[x.key] !== false ? '.on' : ''), { role: 'switch', onClick: () => { st.streamScope[x.key] = st.streamScope[x.key] === false; M.logChange(s, { kind: 'settings', field: 'streamScope.' + x.key, old: !(st.streamScope[x.key]), new: st.streamScope[x.key] !== false }); UI.touch(); UI.render(); } }), el('span.pid', x.key), el('span.small.muted', U.fmtInt(x.activities) + ' activities' + (x.masterData ? ' · ' + x.masterData + ' master data' : ''))));
    return card;
  }

  function participantsCard() {
    const s = state.session;
    const card = el('div.card', el('div.card-head', el('h2', 'Participants'), el('span.stats', s.participants.length + ' people · owner fields pick from this list')));
    if (s.participants.length) {
      const t = el('table.table.compact');
      t.appendChild(el('thead', el('tr', el('th', 'Name'), el('th', 'Role'), el('th', 'Organisation'), el('th', 'E-mail'), el('th', ''))));
      t.appendChild(el('tbody', s.participants.map(p => el('tr', el('td', el('b', p.name)), el('td.small', p.role), el('td', el('span.pill.' + ({ Local: 'local', 'GBS Ops': 'gbs', Transition: 'info', 'Process Expert': 'mixed' }[p.organisation] || 'neutral'), p.organisation)), el('td.small.muted', p.email), el('td', el('button.link.small', { onClick: () => { W.removeParticipant(s, p.id); UI.touch(); UI.render(); } }, 'Remove'))))));
      card.appendChild(el('div.scroll-x', t));
    }
    const name = el('input.input.sm', { placeholder: 'Name', 'data-f': 'p-name' }), role = el('input.input.sm', { placeholder: 'Role, e.g. Chief accountant' }), org = el('select.select', { style: { width: 'auto', padding: '.22rem 1.4rem .22rem .45rem', fontSize: 'var(--fs-xs)' } }, W.ORG.map(o => el('option', { value: o }, o))), email = el('input.input.sm', { placeholder: 'E-mail (optional)' });
    const add = () => { if (!U.clean(name.value)) { name.focus(); return; } W.addParticipant(s, { name: name.value, role: role.value, organisation: org.value, email: email.value }); UI.touch(); UI.render(); setTimeout(() => { const n = document.querySelector('[data-f="p-name"]'); if (n) n.focus(); }, 0); };
    [name, role, email].forEach(i => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); }));
    card.appendChild(el('div.demo-row', { style: { marginTop: '.6rem' } }, name, role, org, email, el('button.btn.sm', { onClick: add }, 'Add')));
    return card;
  }

  function sessionsCard() {
    const s = state.session;
    const card = el('div.card', el('div.card-head', el('h2', 'Workshop sessions'), el('span.stats', s.sessions.length + ' session(s) · start one from the top bar; every change is tagged with it')));
    if (s.sessions.length) {
      const t = el('table.table.compact');
      t.appendChild(el('thead', el('tr', el('th', 'Date'), el('th', 'Time'), el('th', 'Stream'), el('th', 'Title'), el('th', 'Participants'), el('th', 'Recording'), el('th', 'Status'), el('th', ''))));
      t.appendChild(el('tbody', s.sessions.map(x => {
        const parts = el('div.chips', s.participants.map(p => el('button.chip' + ((x.participants || []).includes(p.id) ? '.on' : ''), { title: p.organisation, onClick: () => { x.participants = (x.participants || []).includes(p.id) ? x.participants.filter(i => i !== p.id) : (x.participants || []).concat([p.id]); UI.touch(); UI.render(); } }, p.name.split(' ')[0])));
        const active = s.activeSessionId === x.id;
        return el('tr' + (active ? '.selected' : ''), el('td', el('input.input.sm', { type: 'date', value: x.date, onChange: (e) => { x.date = e.target.value; UI.touch(); UI.render(); } })),
          el('td.nowrap', el('input.input.sm', { type: 'time', value: x.start, style: { width: '6.2rem' }, onChange: (e) => { x.start = e.target.value; UI.touch(); } }), ' – ', el('input.input.sm', { type: 'time', value: x.end, style: { width: '6.2rem' }, onChange: (e) => { x.end = e.target.value; UI.touch(); } })),
          el('td', el('select.select', { style: { width: 'auto', padding: '.2rem 1.4rem .2rem .4rem', fontSize: 'var(--fs-xs)' }, onChange: (e) => { x.stream = e.target.value; UI.touch(); UI.render(); } }, [''].concat(streamOptions(s)).map(k => el('option', { value: k, selected: x.stream === k }, k || '(all)')))),
          el('td', el('input.input.sm', { value: x.title, placeholder: 'e.g. R2R part 2 of 3', onChange: (e) => { x.title = U.clean(e.target.value); UI.touch(); } })),
          el('td', parts), el('td', el('input.input.sm', { value: x.recording, placeholder: 'link / file', onChange: (e) => { x.recording = U.clean(e.target.value); UI.touch(); } })),
          el('td', el('span.pill.' + ({ planned: 'neutral', running: 'ok', done: 'info' }[x.status] || 'neutral'), x.status)),
          el('td.nowrap', active ? el('button.btn.sm', { onClick: () => { W.endSession(s); UI.touch(); UI.render(); UI.promptBackup && UI.promptBackup(); } }, 'End') : el('button.btn.sm', { onClick: () => { W.startSession(s, x.id); UI.touch(); UI.render(); UI.navigate('run', { stream: x.stream || undefined }); } }, x.status === 'done' ? 'Resume' : 'Start'), ' ', el('button.link.small', { onClick: () => { W.removeSession(s, x.id); UI.touch(); UI.render(); } }, 'Remove')));
      })));
      card.appendChild(el('div.scroll-x', t));
    }
    const date = el('input.input.sm', { type: 'date', value: new Date().toISOString().slice(0, 10) }), start = el('input.input.sm', { type: 'time', value: '14:00', style: { width: '6.2rem' } }), end = el('input.input.sm', { type: 'time', value: '15:30', style: { width: '6.2rem' } });
    const stream = el('select.select', { style: { width: 'auto', padding: '.22rem 1.4rem .22rem .45rem', fontSize: 'var(--fs-xs)' } }, streamOptions(s).map(k => el('option', { value: k }, k)));
    const title = el('input.input.sm', { placeholder: 'Title (optional)' });
    card.appendChild(el('div.demo-row', { style: { marginTop: '.6rem' } }, date, start, el('span.muted', '–'), end, stream, title, el('button.btn.sm', { onClick: () => { W.addSession(s, { date: date.value, start: start.value, end: end.value, stream: stream.value, title: title.value }); UI.touch(); UI.render(); } }, 'Add session')));
    // planning workbook import
    const fileIn = el('input', { type: 'file', accept: '.xlsx,.xlsm', style: { display: 'none' }, onChange: async (e) => { const f = e.target.files[0]; if (!f) return; const buf = await f.arrayBuffer(); const wb = root.XLSX.read(buf, { type: 'array', cellDates: false }); const r = FG.planning.parsePlanningWorkbook(wb); if (!r.ok) { UI.toast(r.error, { flag: true }); return; } review = { file: f.name, ...r, rows: r.rows.map(x => ({ ...x, include: !s.settings.country || U.key(x.country) === U.key(s.settings.country) || U.has(x.country, s.settings.country) })) }; UI.render(); e.target.value = ''; } });
    card.appendChild(el('div.demo-row', { style: { marginTop: '.4rem' } }, el('button.link', { onClick: () => fileIn.click() }, 'Import the programme planning workbook ("Fit Gap Workshops")'), el('span.xs.muted', 'sheet "New" · free-text dates and times are parsed best-effort, then reviewed below'), fileIn));
    if (review) card.appendChild(reviewTable());
    return card;
  }
  function reviewTable() {
    const s = state.session;
    const wrap = el('div.review', { style: { marginTop: '.8rem' } }, el('div.eyebrow', 'Review · ' + review.file + ' · sheet ' + review.sheet + ' · ' + review.rows.length + ' row(s)'), el('p.xs.muted', 'Fix dates, times and streams where parsing failed, untick what you do not need, then create the sessions. Rows of other countries are unticked by default.'));
    const t = el('table.table.compact');
    t.appendChild(el('thead', el('tr', el('th', ''), el('th', 'Country'), el('th', 'Process → stream'), el('th', 'Responsible'), el('th', 'Date / time in file'), el('th', 'Sessions (editable)'), el('th', 'Status'), el('th', 'Flags'))));
    t.appendChild(el('tbody', review.rows.map(r => el('tr', el('td', el('input', { type: 'checkbox', checked: r.include, onChange: (e) => { r.include = e.target.checked; } })), el('td.small', r.country), el('td', el('div.small', r.process), el('select.select', { onChange: (e) => { r.stream = e.target.value; } }, [''].concat(streamOptions(s)).map(k => el('option', { value: k, selected: r.stream === k }, k || '?')))), el('td.small', r.responsible),
      el('td.xs.muted', r.dateRaw, el('br'), r.timeRaw, r.durationMin ? el('span', ' · ' + r.durationMin + ' min') : null),
      el('td', r.sessions.map((x, i) => el('div', { style: { display: 'flex', gap: '.25rem', marginBottom: '.2rem' } }, el('input.input', { type: 'date', value: x.date, onChange: (e) => { x.date = e.target.value; } }), el('input.input', { type: 'time', value: x.start, style: { width: '5.6rem' }, onChange: (e) => { x.start = e.target.value; } }), el('input.input', { type: 'time', value: x.end, style: { width: '5.6rem' }, onChange: (e) => { x.end = e.target.value; } }), el('button.link.small', { onClick: () => { r.sessions.splice(i, 1); UI.render(); } }, '×'))), el('button.link.small', { onClick: () => { r.sessions.push({ date: r.sessions[0] ? r.sessions[0].date : '', start: '', end: '' }); UI.render(); } }, '+ slot')),
      el('td.xs', r.status), el('td.xs', r.flags.map(f => el('span.pill.warn', { style: { marginRight: '.2rem' } }, f)))))));
    wrap.appendChild(el('div.scroll-x', t));
    wrap.appendChild(el('div.demo-row', el('button.btn.primary.sm', { onClick: () => { let n = 0; for (const r of review.rows) { if (!r.include) continue; for (const x of r.sessions) { if (!x.date) continue; W.addSession(s, { date: x.date, start: x.start, end: x.end, stream: r.stream, title: r.process + (r.responsible ? ' · ' + r.responsible : ''), notes: [r.comment, r.tz ? 'time zone ' + r.tz : ''].filter(Boolean).join(' · '), source: review.file, country: r.country }); n++; } } review = null; UI.touch(); UI.render(); UI.toast(n + ' session(s) created'); } }, 'Create sessions'), el('button.link', { onClick: () => { review = null; UI.render(); } }, 'Discard')));
    return wrap;
  }

  UI.VIEWS.plan = { crumb: () => ['1 Plan'], render(c) {
    const page = el('div.page');
    page.appendChild(UI.pageHead('Plan', 'Country set-up, participants and the session list – the minimum needed so that every workshop change is tagged with a session.', el('div', el('ol', el('li', 'Check client, country and the entities (from the import) and switch off streams that are not in scope.'), el('li', 'Enter the participants once; owner fields in the workshop pick from this list.'), el('li', 'Add sessions by hand or import the programme planning workbook; start a session from the top bar when the workshop begins.')))));
    page.appendChild(countryCard()); page.appendChild(participantsCard()); page.appendChild(sessionsCard());
    page.appendChild(el('div', { style: { marginTop: '1rem' } }, UI.soonCard(10, 'Full PLAN (after the pilot)', ['Portfolio view across countries with dates, process experts and status', 'Session planner: week grid (days × 30-min slots), drag sessions, lunch blocks, on-site / online flag, recording yes/no', 'Effort estimate per session from imported data with too-short-slot warnings', 'Printable agenda, .ics per session, schedule slide; milestones timeline'])));
    c.appendChild(page);
  } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
