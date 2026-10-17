// PLAN-lite: country set-up, entities, streams in scope, participants, sessions,
// optional planning-workbook import with review table, gap definitions.

function TextInput({ value, onCommit, textarea, ...rest }) {
  const [v, setV] = useState(value ?? ''); const last = useRef(value);
  useEffect(() => { if (value !== last.current) { setV(value ?? ''); last.current = value; } }, [value]);
  const commit = () => { if ((v ?? '') !== (value ?? '')) { last.current = v; onCommit(v); } };
  const props = { value: v, onInput: e => setV(e.target.value), onBlur: commit, onKeyDown: e => { if (e.key === 'Enter' && !textarea) e.target.blur(); if (e.key === 'Escape') { setV(value ?? ''); e.target.blur(); } }, ...rest };
  return textarea ? html`<textarea class=${`textarea ${rest.class || ''}`} ...${props}></textarea>` : html`<input class=${`input ${rest.class || ''}`} ...${props} />`;
}

function fmtDate(d) { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}`; }
const WEEKDAY = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }) : '';

function effortEstimate(session, summary, ws) {
  const mins = session.settings.minutesPerActivity;
  const streams = ws.stream === 'MD' ? null : [ws.stream.replace(/-.*$/, '')];
  let noGap = 0, gap = 0;
  for (const a of Object.values(session.assessments)) {
    if (a.scope.outOfScope) continue;
    if (streams && !streams.includes(a.stream)) continue;
    if (ws.stream === 'MD' && !isMasterDataNode(session.processes[a.processId] || {})) continue;
    if (a.asIs.gap === GAP.NO_GAP) noGap++; else gap++;
  }
  return { noGap, gap, minutes: Math.round(noGap * mins.NO_GAP + gap * mins.GAP), planned: ws.start && ws.end ? minutesBetween(ws.start, ws.end) : null };
}

function icsFor(session, sessions) {
  const dt = (d, t) => d.replace(/-/g, '') + 'T' + (t || '09:00').replace(':', '') + '00';
  const esc = (x) => String(x || '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const ev = sessions.map(s => `BEGIN:VEVENT\r\nUID:${s.id}@gbs-fitgap-workbench\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z\r\nDTSTART:${dt(s.date, s.start)}\r\nDTEND:${dt(s.date, s.end || s.start)}\r\nSUMMARY:${esc(`Fit-gap workshop ${s.stream} – ${session.settings.clientName} ${session.settings.country}`)}\r\nDESCRIPTION:${esc(`Participants: ${s.participantIds.map(id => session.participants.find(p => p.id === id)?.name).filter(Boolean).join(', ')}${s.note ? ' · ' + s.note : ''}${s.recording ? ' · Recording: ' + s.recording : ''}`)}\r\nEND:VEVENT`).join('\r\n');
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//GBS Fit-Gap Workbench//EN\r\n${ev}\r\nEND:VCALENDAR\r\n`;
}
function toMin(t) { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; }
function toHM(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function mondayOf(d) { const x = new Date(d + 'T00:00:00'); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; }
function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function weekNo(d) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 86400000 + 1) / 7); }

function CalendarGrid({ session, updateSession, toast }) {
  const st = session.settings;
  const first = session.sessions[0]?.date || isoOf(new Date());
  const [week, setWeek] = useState(() => isoOf(mondayOf(first)));
  const [weekend, setWeekend] = useState(false);
  const days = Array.from({ length: weekend ? 7 : 5 }, (_, i) => { const d = new Date(week + 'T00:00:00'); d.setDate(d.getDate() + i); return isoOf(d); });
  const start = toMin(st.dayStart || '08:00'), end = toMin(st.dayEnd || '18:00'); const slots = []; for (let m = start; m < end; m += 30) slots.push(m);
  const shift = (n) => { const d = new Date(week + 'T00:00:00'); d.setDate(d.getDate() + 7 * n); setWeek(isoOf(d)); };
  const onDrop = (e, day, slot) => { e.preventDefault(); const id = e.dataTransfer.getData('text/session'); if (!id) return; updateSession(s => { const ws = s.sessions.find(x => x.id === id); if (!ws) return; const dur = ws.end ? toMin(ws.end) - toMin(ws.start) : 90; ws.date = day; ws.start = toHM(slot); ws.end = toHM(Math.min(end, slot + dur)); s.sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)); }); };
  const lunchS = toMin(st.lunch?.start || '12:00'), lunchE = toMin(st.lunch?.end || '13:00');
  const rowH = 1.35;
  return html`<div class="cal">
    <div class="sg-row" style="justify-content:space-between;margin-bottom:.5rem"><span class="sg-row" style="margin:0"><${IconButton} icon="chevron" label="Previous week" onClick=${() => shift(-1)} style="transform:rotate(90deg)" /><b>CW ${weekNo(new Date(week + 'T00:00:00'))} · ${fmtDate(days[0])} – ${fmtDate(days[days.length - 1])}</b><${IconButton} icon="chevron" label="Next week" onClick=${() => shift(1)} style="transform:rotate(-90deg)" /></span><span class="sg-row" style="margin:0"><${Switch} checked=${weekend} onChange=${setWeekend}>weekend</${Switch}><span class="muted small">drag a session onto a slot · lunch ${st.lunch?.start}–${st.lunch?.end}</span></span></div>
    <div class="cal-grid" style=${`grid-template-columns:4rem repeat(${days.length}, 1fr)`}>
      <div></div>${days.map(d => html`<div class="cal-day" key=${d}>${WEEKDAY(d)} <span class="muted">${fmtDate(d).slice(0, 5)}</span></div>`)}
      ${slots.map((m, ri) => html`<${Fragment} key=${m}><div class="cal-time" style=${`grid-row:${ri + 2};grid-column:1`}>${m % 60 === 0 ? toHM(m) : ''}</div>${days.map((d, di) => html`<div key=${d} class=${`cal-cell${m >= lunchS && m < lunchE ? ' lunch' : ''}`} onDragOver=${e => e.preventDefault()} onDrop=${e => onDrop(e, d, m)} style=${`height:${rowH}rem;grid-row:${ri + 2};grid-column:${di + 2}`}></div>`)}</${Fragment}>`)}
      ${session.sessions.filter(ws => days.includes(ws.date) && ws.start).map(ws => { const col = days.indexOf(ws.date) + 2; const top = (toMin(ws.start) - start) / 30; const h = Math.max(1, ((ws.end ? toMin(ws.end) : toMin(ws.start) + 90) - toMin(ws.start)) / 30); const active = ws.id === session.activeSessionId; return html`<div key=${ws.id} class=${`cal-ev${active ? ' active' : ''}`} draggable="true" onDragStart=${e => e.dataTransfer.setData('text/session', ws.id)} style=${`grid-column:${col};grid-row:${2 + Math.round(top)} / span ${Math.round(h)};`} title=${`${ws.start}–${ws.end} ${ws.stream}`}><b>${ws.stream}</b> <span class="mono">${ws.start}–${ws.end}</span><div class="small">${ws.participantIds.map(id => { const p = session.participants.find(x => x.id === id); return p ? `${p.name}${p.mode === 'online' ? ' ◌' : p.mode === 'onsite' ? ' ●' : ''}` : ''; }).filter(Boolean).join(', ')}${ws.recordingOn ? ' · REC' : ''}</div></div>`; })}
    </div>
    <div class="muted small" style="margin-top:.3rem">● on site · ◌ online · REC recorded</div>
  </div>`;
}

function Milestones({ session, updateSession }) {
  const ms = session.milestones || [];
  const dated = ms.filter(m => m.date).sort((a, b) => a.date.localeCompare(b.date));
  const w0 = dated.length ? weekNo(new Date(dated[0].date + 'T00:00:00')) : 0, w1 = dated.length ? weekNo(new Date(dated[dated.length - 1].date + 'T00:00:00')) : 0;
  const span = Math.max(1, w1 - w0 + 1);
  return html`<div>
    ${dated.length > 1 && html`<svg viewBox=${`0 0 600 70`} style="width:100%;max-width:50rem;font-family:var(--font-ui);font-size:9px"><line x1="20" x2="580" y1="30" y2="30" stroke="var(--line-strong)" />${dated.map((m, i) => { const w = weekNo(new Date(m.date + 'T00:00:00')); const x = 20 + 560 * (w - w0) / Math.max(1, span - 1); return html`<g key=${m.key}><circle cx=${x} cy="30" r="5" fill=${/qg/.test(m.key) ? 'var(--accent)' : 'var(--ink-2)'} /><text x=${x} y=${i % 2 ? 52 : 18} text-anchor="middle" fill="var(--ink)">${m.label}</text><text x=${x} y=${i % 2 ? 62 : 8} text-anchor="middle" fill="var(--ink-3)" font-family="var(--font-mono)">CW ${w}</text></g>`; })}</svg>`}
    <div class="fgrid" style="grid-template-columns:repeat(4,1fr)">${ms.map((m, i) => html`<${Field} key=${m.key} label=${m.label}><input class="input sm" type="date" value=${m.date} onChange=${e => updateSession(s => { s.milestones[i].date = e.target.value; })} /></${Field}>`)}</div>
    <p class="sg-note">QG1 and QG2 can be merged per country – leave one of the dates empty.</p>
  </div>`;
}

function PlanView({ session, summary, updateSession, toast }) {
  const st = session.settings;
  const setS = (k, v) => updateSession(s => { s.settings[k] = v; });
  const [pName, setPName] = useState(''), [pRole, setPRole] = useState(''), [pOrg, setPOrg] = useState('Local'), [pEnt, setPEnt] = useState(''), [pMode, setPMode] = useState('onsite');
  const [printAgenda, setPrintAgenda] = useState(null);
  const [ws, setWs] = useState({ date: '', start: '', end: '', stream: 'R2R', participantIds: [], recording: '', note: '' });
  const [plan, setPlan] = useState(null); const [planCountry, setPlanCountry] = useState('');
  const entities = Object.values(session.entities);
  const addParticipant = () => { if (!pName.trim()) return; updateSession(s => { s.participants.push({ id: newId('p'), name: pName.trim(), role: pRole.trim(), organisation: pOrg, entityCode: pEnt || null, mode: pMode }); }); setPName(''); setPRole(''); };
  const addSession = () => { if (!ws.date) { toast('Session needs a date'); return; } updateSession(s => { s.sessions.push({ id: newId('ws'), ...ws, startedAt: null, endedAt: null }); s.sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)); }); setWs({ ...ws, participantIds: [], recording: '', note: '' }); };
  const onPlanFile = async (e) => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    try { const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true }); const p = parsePlanningWorkbook(wb, { XLSX, fileName: f.name }); if (!p.ok) { toast(p.warnings[0].message); return; }
      const guess = p.countries.find(c => similarity(c, st.country) > 0.6) || p.countries[0] || '';
      setPlan({ ...p, sessions: p.sessions.map(s => ({ ...s, id: newId('ps'), include: true })) }); setPlanCountry(guess);
      updateSession(s => { s.portfolio = p.rows.map(r => ({ country: r.country, process: r.process, stream: r.stream, responsible: r.responsible, dateRaw: r.dateRaw, timeRaw: r.timeRaw, duration: r.duration, status: r.status, comment: r.comment, file: f.name })); });
    } catch (err) { toast(`Could not read ${f.name}: ${err.message}`); }
  };
  const planRows = plan ? plan.sessions.filter(s => !planCountry || s.country === planCountry) : [];
  const patchPlan = (id, patch) => setPlan(p => ({ ...p, sessions: p.sessions.map(s => s.id === id ? { ...s, ...patch, incomplete: false } : s) }));
  const addPlanned = () => { const rows = planRows.filter(s => s.include && s.date && s.stream); updateSession(s => { for (const r of rows) s.sessions.push({ id: newId('ws'), date: r.date, start: r.start, end: r.end, stream: r.stream, participantIds: [], recording: '', note: [r.process, r.responsible, r.comment, r.tz].filter(Boolean).join(' · '), startedAt: null, endedAt: null }); s.sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)); if (!s.settings.country && planCountry) s.settings.country = planCountry; }); toast(`${rows.length} sessions added`); setPlan(null); };
  const streamOptions = ['R2R', 'A2R-FAA', 'A2R-IA', 'A2R', 'I2P', 'I2C', 'ICO', 'MD'];
  const planDone = !!st.country && session.participants.length > 0 && session.sessions.length > 0;

  return html`<div>
    <${PageHead} eyebrow="1 · Plan & prepare" title=${st.country ? `${st.clientName || 'Client'} · ${st.country}` : 'Set up the country fit-gap'} lead="Country, entities, streams in scope, the people in the room and the session slots. Every workshop change is tagged with the active session, so set the sessions up before the first one starts." how=${html`<ol><li>Enter client, country and your initials (used in the audit trail).</li><li>Check the entities from the import and give them short display names.</li><li>Add participants – deviation owners and next-step owners are picked from this list.</li><li>Add sessions by hand or import the programme's planning workbook ("Fit Gap Workshops") and review the parsed rows.</li></ol>`} />
    ${planDone && html`<div class="sg-row" style="margin-bottom:1rem"><span class="status status-CONFIRMED_FIT">Plan complete – ${session.sessions.length} sessions, ${session.participants.length} participants</span></div>`}
    <div class="import-grid">
      <div style="display:grid;gap:1rem">
        <${Card} title="Country set-up">
          <div class="fgrid">
            <${Field} label="Client name" hint="Shown in headlines and slides"><${TextInput} value=${st.clientName} onCommit=${v => setS('clientName', v)} placeholder="e.g. Demo Group" /></${Field}>
            <${Field} label="Country" required><${TextInput} value=${st.country} onCommit=${v => setS('country', v)} placeholder="e.g. France" /></${Field}>
            <${Field} label="Your initials" required hint="Editor tag on every audit entry"><${TextInput} value=${st.editorInitials} onCommit=${v => setS('editorInitials', v.toUpperCase())} placeholder="MR" style="width:6rem" /></${Field}>
            <${Field} label="Facilitators" hint="Comma-separated"><${TextInput} value=${(st.facilitators || []).join(', ')} onCommit=${v => setS('facilitators', v.split(',').map(x => x.trim()).filter(Boolean))} /></${Field}>
            <${Field} label="Minutes per NO GAP activity" hint="Effort estimate per session"><${TextInput} class="num" value=${String(st.minutesPerActivity.NO_GAP)} onCommit=${v => updateSession(s => { s.settings.minutesPerActivity.NO_GAP = Number(v.replace(',', '.')) || 1.5; })} style="width:6rem" /></${Field}>
            <${Field} label="Minutes per gap activity"><${TextInput} class="num" value=${String(st.minutesPerActivity.GAP)} onCommit=${v => updateSession(s => { s.settings.minutesPerActivity.GAP = Number(v.replace(',', '.')) || 5; })} style="width:6rem" /></${Field}>
          </div>
        </${Card}>
        <${Card} title="Entities" stats=${[['from import', entities.length]]}>
          ${entities.length ? html`<table class="matrix"><thead><tr><th>Code</th><th style="text-align:left">Imported name</th><th style="text-align:left">Display name</th><th style="text-align:left">Country</th><th class="num">Files</th></tr></thead><tbody>
            ${entities.map(e => html`<tr key=${e.code}><td class="mono" style="text-align:left">${e.hasCode ? e.code : html`<span class="muted">no code</span>`}</td><td style="text-align:left">${e.name}</td><td style="text-align:left"><${TextInput} class="sm" value=${e.displayName || e.name} onCommit=${v => updateSession(s => { s.entities[e.code].displayName = v || e.name; })} /></td><td style="text-align:left"><${TextInput} class="sm" value=${e.country || st.country} onCommit=${v => updateSession(s => { s.entities[e.code].country = v; })} style="width:8rem" /></td><td class="num">${e.sources.length}</td></tr>`)}
          </tbody></table>` : html`<p class="muted small">Entities appear here after the capture sheets are imported (3 · Run → Import & data).</p>`}
        </${Card}>
        <${Card} title="Streams and sub-streams in scope">
          <div class="sg-row" style="gap:1rem">${SUB_STREAMS.map(s => html`<${Switch} key=${s} checked=${st.streamsInScope[s] !== false} onChange=${v => updateSession(x => { x.settings.streamsInScope[s] = v; })}>${s}${s.startsWith('A2R') || s === 'MD' ? '' : html`<span class="muted small"> · ${summary.activitiesByStream[s] || 0}</span>`}</${Switch}>`)}</div>
          <p class="sg-note">A2R is split into FAA (asset accounting) and IA (inventory accounting) by the L1/L2 names; MD is the cross-stream master-data session.</p>
        </${Card}>
        <${Card} title="Gap type definitions" stats=${[['shown as tooltip and legend slide', '']]}>
          <div style="display:grid;gap:.5rem">${['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH'].map(g => html`<div class="fgrid" style="grid-template-columns:11rem 1fr;align-items:start" key=${g}><${GapPill} value=${g} /><${TextInput} textarea class="sm" style="min-height:2.4rem" value=${st.gapDefinitions[g]} onCommit=${v => updateSession(s => { s.settings.gapDefinitions[g] = v; })} /></div>`)}</div>
        </${Card}>
      </div>
      <div style="display:grid;gap:1rem">
        <${Card} title="Participants" stats=${[['people', session.participants.length]]}>
          ${session.participants.length > 0 && html`<table class="matrix" style="margin-bottom:.75rem"><thead><tr><th style="text-align:left">Name</th><th style="text-align:left">Role</th><th style="text-align:left">Organisation</th><th style="text-align:left">Entity</th><th style="text-align:left">Mode</th><th></th></tr></thead><tbody>
            ${session.participants.map(p => html`<tr key=${p.id}><td style="text-align:left"><b>${p.name}</b></td><td style="text-align:left">${p.role}</td><td style="text-align:left">${p.organisation}</td><td style="text-align:left" class="muted">${p.entityCode ? (session.entities[p.entityCode]?.displayName || p.entityCode) : ''}</td><td style="text-align:left"><select class="select sm" style="width:auto" value=${p.mode || 'onsite'} onChange=${e => updateSession(s => { s.participants.find(x => x.id === p.id).mode = e.target.value; })}><option value="onsite">on site</option><option value="online">online</option></select></td><td><${IconButton} icon="x" label="Remove" onClick=${() => updateSession(s => { s.participants = s.participants.filter(x => x.id !== p.id); })} /></td></tr>`)}
          </tbody></table>`}
          <div class="fgrid" style="grid-template-columns:1.3fr 1fr 1fr 1fr 1fr auto;align-items:end">
            <${Field} label="Name"><input class="input sm" value=${pName} onInput=${e => setPName(e.target.value)} onKeyDown=${e => e.key === 'Enter' && addParticipant()} placeholder="Full name" /></${Field}>
            <${Field} label="Role"><input class="input sm" value=${pRole} onInput=${e => setPRole(e.target.value)} placeholder="e.g. GL accountant" /></${Field}>
            <${Field} label="Organisation"><select class="select sm" value=${pOrg} onChange=${e => setPOrg(e.target.value)}>${PARTICIPANT_ORG.map(o => html`<option value=${o}>${o}</option>`)}</select></${Field}>
            <${Field} label="Entity"><select class="select sm" value=${pEnt} onChange=${e => setPEnt(e.target.value)}><option value="">–</option>${entities.map(e => html`<option value=${e.code}>${e.displayName || e.name}</option>`)}</select></${Field}>
            <${Field} label="Mode"><select class="select sm" value=${pMode} onChange=${e => setPMode(e.target.value)}><option value="onsite">on site</option><option value="online">online</option></select></${Field}>
            <${Button} variant="outline" size="sm" onClick=${addParticipant}>Add</${Button}>
          </div>
        </${Card}>
        <${Card} title="Sessions" stats=${[['planned', session.sessions.length]]} actions=${html`<label class="btn btn-outline btn-sm" style="cursor:pointer"><${Icon} name="upload" /> Import planning workbook<input type="file" accept=".xlsx,.xlsm" style="display:none" onChange=${onPlanFile} /></label>`}>
          ${plan && html`<div class="card" style="margin-bottom:1rem;border-color:var(--accent)"><div class="card-head"><h3>Review parsed sessions · ${plan.fileName} / ${plan.sheetName}</h3><select class="select sm" style="width:auto" value=${planCountry} onChange=${e => setPlanCountry(e.target.value)}><option value="">All countries</option>${plan.countries.map(c => html`<option value=${c}>${c}</option>`)}</select></div><div class="card-body">
            <table class="matrix"><thead><tr><th></th><th style="text-align:left">Country</th><th style="text-align:left">Process</th><th style="text-align:left">Stream</th><th style="text-align:left">Date</th><th style="text-align:left">Start</th><th style="text-align:left">End</th><th style="text-align:left">Status</th></tr></thead><tbody>
              ${planRows.map(r => html`<tr key=${r.id} style=${r.incomplete ? 'background:var(--g-harm-soft)' : ''}><td><input type="checkbox" checked=${r.include} onChange=${e => patchPlan(r.id, { include: e.target.checked })} /></td><td style="text-align:left">${r.country}</td><td style="text-align:left">${r.process}<div class="muted small">${r.responsible}${r.tz ? ` · ${r.tz}` : ''}</div></td><td style="text-align:left"><select class="select sm" value=${r.stream} onChange=${e => patchPlan(r.id, { stream: e.target.value })}><option value="">?</option>${[...streamOptions, 'I2P T&E'].map(s => html`<option value=${s}>${s}</option>`)}</select></td><td style="text-align:left"><input class="input sm" type="date" value=${r.date} onChange=${e => patchPlan(r.id, { date: e.target.value })} /></td><td style="text-align:left"><input class="input sm" type="time" value=${r.start} onChange=${e => patchPlan(r.id, { start: e.target.value })} /></td><td style="text-align:left"><input class="input sm" type="time" value=${r.end} onChange=${e => patchPlan(r.id, { end: e.target.value })} /></td><td style="text-align:left" class="muted small">${r.status}</td></tr>`)}
            </tbody></table>
            <div class="sg-row" style="justify-content:flex-end;margin-top:.7rem"><span class="muted small">${planRows.filter(r => r.incomplete).length} row(s) need a fix (highlighted)</span><${Button} variant="text" size="sm" onClick=${() => setPlan(null)}>Discard</${Button}><${Button} variant="primary" size="sm" onClick=${addPlanned}>Add ${planRows.filter(r => r.include && r.date && r.stream).length} sessions</${Button}></div>
          </div></div>`}
          ${session.sessions.length > 0 && html`<table class="matrix" style="margin-bottom:.75rem"><thead><tr><th style="text-align:left">Date</th><th style="text-align:left">Time</th><th style="text-align:left">Stream</th><th style="text-align:left">Participants</th><th class="num">Est. min</th><th></th></tr></thead><tbody>
            ${session.sessions.map(s => { const est = effortEstimate(session, summary, s); const over = est.planned !== null && est.minutes > est.planned; const active = s.id === session.activeSessionId; return html`<tr key=${s.id} style=${active ? 'background:var(--accent-soft)' : ''}><td style="text-align:left"><b>${fmtDate(s.date)}</b> <span class="muted small">${WEEKDAY(s.date)}</span>${s.note && html`<div class="muted small">${s.note}</div>`}</td><td style="text-align:left" class="mono">${s.start}${s.end ? `–${s.end}` : ''}</td><td style="text-align:left"><${Tag} kind="GBS">${s.stream}</${Tag}></td><td style="text-align:left"><div class="chips">${session.participants.map(p => html`<${Chip} key=${p.id} active=${s.participantIds.includes(p.id)} onClick=${() => updateSession(x => { const ss = x.sessions.find(y => y.id === s.id); ss.participantIds = ss.participantIds.includes(p.id) ? ss.participantIds.filter(i => i !== p.id) : [...ss.participantIds, p.id]; })}>${p.name}</${Chip}>`)}</div></td><td class=${`num${over ? ' miss' : ''}`} title=${`${est.noGap} NO GAP × ${st.minutesPerActivity.NO_GAP} min + ${est.gap} gaps × ${st.minutesPerActivity.GAP} min`}>${est.minutes}${est.planned !== null ? html`<span class="muted"> / ${est.planned}</span>` : ''}</td><td style="white-space:nowrap"><label class="toggle" title="Recording"><input type="checkbox" checked=${!!s.recordingOn} onChange=${e => updateSession(x => { x.sessions.find(y => y.id === s.id).recordingOn = e.target.checked; })} /><i></i>REC</label> <${Button} variant=${active ? 'primary' : 'outline'} size="sm" onClick=${() => updateSession(x => { x.activeSessionId = active ? null : s.id; })}>${active ? 'Active' : 'Set active'}</${Button}> <${IconButton} icon="file" label="Agenda (print)" onClick=${() => setPrintAgenda(s.id)} /><${IconButton} icon="plan" label="Calendar file (.ics)" onClick=${() => downloadBlob(`${exportFileName(session, 'session-' + s.stream)}.ics`, new Blob([icsFor(session, [s])], { type: 'text/calendar' }))} /><${IconButton} icon="x" label="Remove" onClick=${() => updateSession(x => { x.sessions = x.sessions.filter(y => y.id !== s.id); if (x.activeSessionId === s.id) x.activeSessionId = null; })} /></td></tr>`; })}
          </tbody></table>`}
          <div class="fgrid" style="grid-template-columns:1fr 1fr 1fr 1fr auto;align-items:end">
            <${Field} label="Date"><input class="input sm" type="date" value=${ws.date} onChange=${e => setWs({ ...ws, date: e.target.value })} /></${Field}>
            <${Field} label="Start"><input class="input sm" type="time" value=${ws.start} onChange=${e => setWs({ ...ws, start: e.target.value })} /></${Field}>
            <${Field} label="End"><input class="input sm" type="time" value=${ws.end} onChange=${e => setWs({ ...ws, end: e.target.value })} /></${Field}>
            <${Field} label="Stream"><select class="select sm" value=${ws.stream} onChange=${e => setWs({ ...ws, stream: e.target.value })}>${streamOptions.map(s => html`<option value=${s}>${s}</option>`)}</select></${Field}>
            <${Button} variant="outline" size="sm" onClick=${addSession}>Add</${Button}>
            <${Field} label="Recording reference" class="full"><input class="input sm" value=${ws.recording} onInput=${e => setWs({ ...ws, recording: e.target.value })} placeholder="Teams link or file name" /></${Field}>
          </div>
          <div class="sg-row" style="margin-top:.6rem">${session.sessions.length > 0 && html`<${Button} variant="outline" size="sm" icon="plan" onClick=${() => downloadBlob(`${exportFileName(session, 'sessions')}.ics`, new Blob([icsFor(session, session.sessions)], { type: 'text/calendar' }))}>All sessions as .ics</${Button}><${Button} variant="outline" size="sm" icon="file" onClick=${() => setPrintAgenda('all')}>Schedule slide / agenda</${Button}>`}</div>
          <p class="sg-note">Estimated minutes = NO GAP activities × ${st.minutesPerActivity.NO_GAP} + gap activities × ${st.minutesPerActivity.GAP} (from the Ops pre-assessment, all entities, in-scope only). Red = slot too short.</p>
        </${Card}>
        ${session.sessions.length > 0 && html`<${Card} title="Session planner · week view"><${CalendarGrid} session=${session} updateSession=${updateSession} toast=${toast} /></${Card}>`}
        <${Card} title="Milestones" stats=${[['calendar weeks', '']]}><${Milestones} session=${session} updateSession=${updateSession} /></${Card}>
        ${session.portfolio?.length > 0 && html`<${Card} title="Portfolio · all countries in the planning workbook" stats=${[['rows', session.portfolio.length]]}><div style="overflow:auto;max-height:18rem"><table class="matrix"><thead><tr><th style="text-align:left">Country</th><th style="text-align:left">Process</th><th style="text-align:left">Responsible</th><th style="text-align:left">Date</th><th style="text-align:left">Time</th><th style="text-align:left">Status</th></tr></thead><tbody>${session.portfolio.map((r, i) => html`<tr key=${i} style=${similarity(r.country, st.country) > 0.6 ? 'background:var(--accent-soft)' : ''}><td style="text-align:left">${r.country}</td><td style="text-align:left">${r.process} ${r.stream && html`<span class="mono small muted">${r.stream}</span>`}</td><td style="text-align:left">${r.responsible}</td><td style="text-align:left" class="small">${r.dateRaw}</td><td style="text-align:left" class="small">${r.timeRaw}</td><td style="text-align:left" class="small">${r.status}</td></tr>`)}</tbody></table></div></${Card}>`}
      </div>
    </div>
    ${printAgenda && html`<${AgendaDialog} session=${session} summary=${summary} which=${printAgenda} onClose=${() => setPrintAgenda(null)} />`}
  </div>`;
}

function AgendaDialog({ session, summary, which, onClose }) {
  const ref = useRef(); useEffect(() => { ref.current?.showModal(); }, []);
  const list = which === 'all' ? session.sessions : session.sessions.filter(s => s.id === which);
  const st = session.settings;
  return html`<dialog ref=${ref} class="agenda" onClose=${onClose} onClick=${e => e.target === ref.current && onClose()}><div class="dlg-body print-area">
    <div class="eyebrow">Fit-gap workshops · ${st.clientName} · ${st.country}</div><h2 style="font-family:var(--font-serif);font-weight:500">${which === 'all' ? 'Workshop schedule' : 'Session agenda'}</h2>
    ${which === 'all' ? html`<table class="matrix"><thead><tr><th style="text-align:left">Date</th><th style="text-align:left">Time</th><th style="text-align:left">Stream</th><th style="text-align:left">Participants</th><th class="num">Activities</th></tr></thead><tbody>${list.map(s => { const est = effortEstimate(session, summary, s); return html`<tr key=${s.id}><td style="text-align:left"><b>${fmtDate(s.date)}</b> ${WEEKDAY(s.date)}</td><td style="text-align:left" class="mono">${s.start}–${s.end}</td><td style="text-align:left">${s.stream}${s.recordingOn ? ' · recorded' : ''}</td><td style="text-align:left" class="small">${s.participantIds.map(id => session.participants.find(p => p.id === id)?.name).filter(Boolean).join(', ')}</td><td class="num">${est.noGap + est.gap}</td></tr>`; })}</tbody></table>` : list.map(s => { const est = effortEstimate(session, summary, s); return html`<div key=${s.id}><p><b>${fmtDate(s.date)} ${WEEKDAY(s.date)} · ${s.start}–${s.end} · ${s.stream}</b>${s.recordingOn ? ' · this session is recorded' : ''}</p><ol><li>Welcome, objectives, gap-type definitions (5 min)</li><li>Per L3: Ops pre-assessment summary, confirm NO GAP in bulk, discuss flagged activities (${est.noGap} NO GAP, ${est.gap} gaps · est. ${est.minutes} min)</li><li>Deviations: dimension, resolution approach, owner, next steps</li><li>Open points and wrap-up (10 min)</li></ol><p class="small"><b>Participants:</b> ${s.participantIds.map(id => { const p = session.participants.find(x => x.id === id); return p ? `${p.name} (${p.organisation}${p.mode === 'online' ? ', online' : ''})` : ''; }).filter(Boolean).join(', ') || '–'}<br /><b>Facilitators:</b> ${(st.facilitators || []).join(', ') || '–'}${s.recording ? html`<br /><b>Recording:</b> ${s.recording}` : ''}${s.note ? html`<br /><b>Note:</b> ${s.note}` : ''}</p></div>`; })}
  </div><div class="dlg-actions no-print"><${Button} variant="text" onClick=${onClose}>Close</${Button}><${Button} variant="primary" onClick=${() => window.print()}>Print</${Button}></div></dialog>`;
}
