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

function PlanView({ session, summary, updateSession, toast }) {
  const st = session.settings;
  const setS = (k, v) => updateSession(s => { s.settings[k] = v; });
  const [pName, setPName] = useState(''), [pRole, setPRole] = useState(''), [pOrg, setPOrg] = useState('Local'), [pEnt, setPEnt] = useState('');
  const [ws, setWs] = useState({ date: '', start: '', end: '', stream: 'R2R', participantIds: [], recording: '', note: '' });
  const [plan, setPlan] = useState(null); const [planCountry, setPlanCountry] = useState('');
  const entities = Object.values(session.entities);
  const addParticipant = () => { if (!pName.trim()) return; updateSession(s => { s.participants.push({ id: newId('p'), name: pName.trim(), role: pRole.trim(), organisation: pOrg, entityCode: pEnt || null }); }); setPName(''); setPRole(''); };
  const addSession = () => { if (!ws.date) { toast('Session needs a date'); return; } updateSession(s => { s.sessions.push({ id: newId('ws'), ...ws, startedAt: null, endedAt: null }); s.sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)); }); setWs({ ...ws, participantIds: [], recording: '', note: '' }); };
  const onPlanFile = async (e) => {
    const f = e.target.files[0]; if (!f) return; e.target.value = '';
    try { const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true }); const p = parsePlanningWorkbook(wb, { XLSX, fileName: f.name }); if (!p.ok) { toast(p.warnings[0].message); return; }
      const guess = p.countries.find(c => similarity(c, st.country) > 0.6) || p.countries[0] || '';
      setPlan({ ...p, sessions: p.sessions.map(s => ({ ...s, id: newId('ps'), include: true })) }); setPlanCountry(guess);
    } catch (err) { toast(`Could not read ${f.name}: ${err.message}`); }
  };
  const planRows = plan ? plan.sessions.filter(s => !planCountry || s.country === planCountry) : [];
  const patchPlan = (id, patch) => setPlan(p => ({ ...p, sessions: p.sessions.map(s => s.id === id ? { ...s, ...patch, incomplete: false } : s) }));
  const addPlanned = () => { const rows = planRows.filter(s => s.include && s.date && s.stream); updateSession(s => { for (const r of rows) s.sessions.push({ id: newId('ws'), date: r.date, start: r.start, end: r.end, stream: r.stream, participantIds: [], recording: '', note: [r.process, r.responsible, r.comment, r.tz].filter(Boolean).join(' · '), startedAt: null, endedAt: null }); s.sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)); if (!s.settings.country && planCountry) s.settings.country = planCountry; }); toast(`${rows.length} sessions added`); setPlan(null); };
  const streamOptions = ['R2R', 'A2R-FAA', 'A2R-IA', 'A2R', 'I2P', 'I2C', 'ICO', 'MD'];
  const planDone = !!st.country && session.participants.length > 0 && session.sessions.length > 0;

  return html`<div>
    <${PageHead} eyebrow="1 · Plan" title=${st.country ? `${st.clientName || 'Client'} · ${st.country}` : 'Set up the country fit-gap'} lead="Country, entities, streams in scope, the people in the room and the session slots. Every workshop change is tagged with the active session, so set the sessions up before the first one starts." how=${html`<ol><li>Enter client, country and your initials (used in the audit trail).</li><li>Check the entities from the import and give them short display names.</li><li>Add participants – deviation owners and next-step owners are picked from this list.</li><li>Add sessions by hand or import the programme's planning workbook ("Fit Gap Workshops") and review the parsed rows.</li></ol>`} />
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
          ${session.participants.length > 0 && html`<table class="matrix" style="margin-bottom:.75rem"><thead><tr><th style="text-align:left">Name</th><th style="text-align:left">Role</th><th style="text-align:left">Organisation</th><th style="text-align:left">Entity</th><th></th></tr></thead><tbody>
            ${session.participants.map(p => html`<tr key=${p.id}><td style="text-align:left"><b>${p.name}</b></td><td style="text-align:left">${p.role}</td><td style="text-align:left">${p.organisation}</td><td style="text-align:left" class="muted">${p.entityCode ? (session.entities[p.entityCode]?.displayName || p.entityCode) : ''}</td><td><${IconButton} icon="x" label="Remove" onClick=${() => updateSession(s => { s.participants = s.participants.filter(x => x.id !== p.id); })} /></td></tr>`)}
          </tbody></table>`}
          <div class="fgrid" style="grid-template-columns:1.3fr 1fr 1fr 1fr auto;align-items:end">
            <${Field} label="Name"><input class="input sm" value=${pName} onInput=${e => setPName(e.target.value)} onKeyDown=${e => e.key === 'Enter' && addParticipant()} placeholder="Full name" /></${Field}>
            <${Field} label="Role"><input class="input sm" value=${pRole} onInput=${e => setPRole(e.target.value)} placeholder="e.g. GL accountant" /></${Field}>
            <${Field} label="Organisation"><select class="select sm" value=${pOrg} onChange=${e => setPOrg(e.target.value)}>${PARTICIPANT_ORG.map(o => html`<option value=${o}>${o}</option>`)}</select></${Field}>
            <${Field} label="Entity"><select class="select sm" value=${pEnt} onChange=${e => setPEnt(e.target.value)}><option value="">–</option>${entities.map(e => html`<option value=${e.code}>${e.displayName || e.name}</option>`)}</select></${Field}>
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
            ${session.sessions.map(s => { const est = effortEstimate(session, summary, s); const over = est.planned !== null && est.minutes > est.planned; const active = s.id === session.activeSessionId; return html`<tr key=${s.id} style=${active ? 'background:var(--accent-soft)' : ''}><td style="text-align:left"><b>${fmtDate(s.date)}</b> <span class="muted small">${WEEKDAY(s.date)}</span>${s.note && html`<div class="muted small">${s.note}</div>`}</td><td style="text-align:left" class="mono">${s.start}${s.end ? `–${s.end}` : ''}</td><td style="text-align:left"><${Tag} kind="GBS">${s.stream}</${Tag}></td><td style="text-align:left"><div class="chips">${session.participants.map(p => html`<${Chip} key=${p.id} active=${s.participantIds.includes(p.id)} onClick=${() => updateSession(x => { const ss = x.sessions.find(y => y.id === s.id); ss.participantIds = ss.participantIds.includes(p.id) ? ss.participantIds.filter(i => i !== p.id) : [...ss.participantIds, p.id]; })}>${p.name}</${Chip}>`)}</div></td><td class=${`num${over ? ' miss' : ''}`} title=${`${est.noGap} NO GAP × ${st.minutesPerActivity.NO_GAP} min + ${est.gap} gaps × ${st.minutesPerActivity.GAP} min`}>${est.minutes}${est.planned !== null ? html`<span class="muted"> / ${est.planned}</span>` : ''}</td><td style="white-space:nowrap"><${Button} variant=${active ? 'primary' : 'outline'} size="sm" onClick=${() => updateSession(x => { x.activeSessionId = active ? null : s.id; })}>${active ? 'Active' : 'Set active'}</${Button}> <${IconButton} icon="x" label="Remove" onClick=${() => updateSession(x => { x.sessions = x.sessions.filter(y => y.id !== s.id); if (x.activeSessionId === s.id) x.activeSessionId = null; })} /></td></tr>`; })}
          </tbody></table>`}
          <div class="fgrid" style="grid-template-columns:1fr 1fr 1fr 1fr auto;align-items:end">
            <${Field} label="Date"><input class="input sm" type="date" value=${ws.date} onChange=${e => setWs({ ...ws, date: e.target.value })} /></${Field}>
            <${Field} label="Start"><input class="input sm" type="time" value=${ws.start} onChange=${e => setWs({ ...ws, start: e.target.value })} /></${Field}>
            <${Field} label="End"><input class="input sm" type="time" value=${ws.end} onChange=${e => setWs({ ...ws, end: e.target.value })} /></${Field}>
            <${Field} label="Stream"><select class="select sm" value=${ws.stream} onChange=${e => setWs({ ...ws, stream: e.target.value })}>${streamOptions.map(s => html`<option value=${s}>${s}</option>`)}</select></${Field}>
            <${Button} variant="outline" size="sm" onClick=${addSession}>Add</${Button}>
            <${Field} label="Recording reference" class="full"><input class="input sm" value=${ws.recording} onInput=${e => setWs({ ...ws, recording: e.target.value })} placeholder="Teams link or file name" /></${Field}>
          </div>
          <p class="sg-note">Estimated minutes = NO GAP activities × ${st.minutesPerActivity.NO_GAP} + gap activities × ${st.minutesPerActivity.GAP} (from the Ops pre-assessment, all entities, in-scope only). Red = slot too short.</p>
        </${Card}>
      </div>
    </div>
  </div>`;
}
