// Home / "Start here": the five steps with status and one action each, demo data, session file.

async function loadDemoData(updateSession, toast, onDone) {
  toast('Building demo workbooks…');
  const files = await generateDemoWorkbooks(XLSX, JSZip);
  let procs = {};
  for (const f of files) {
    const wb = XLSX.read(f.data, { type: 'array' });
    const parsed = parseCaptureWorkbook(wb, { XLSX, fileName: f.name });
    if (!parsed.ok) continue;
    updateSession(s => { mergeParsedWorkbook(s, parsed); procs = s.processes; });
  }
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d; })();
  const iso = (d, plus = 0) => { const x = new Date(d); x.setDate(x.getDate() + plus); return x.toISOString().slice(0, 10); };
  updateSession(s => {
    Object.assign(s.settings, { clientName: DEMO_PLAN.clientName, country: DEMO_PLAN.country, editorInitials: s.settings.editorInitials || DEMO_PLAN.editorInitials });
    if (!s.settings.logoDataUrl) { s.settings.logoDataUrl = DEMO_PLAN.logoDataUrl; s.settings.logoOnDark = false; s.settings.logoSource = 'workbook:demo'; s.settings.brandColor = s.settings.brandColor || DEMO_PLAN.brandColor; }
    if (!s.participants.length) s.participants = DEMO_PLAN.participants.map(([name, role, organisation, entityCode, mode]) => ({ id: newId('p'), name, role, organisation, entityCode, mode }));
    if (!s.sessions.length) { s.sessions = DEMO_PLAN.sessions.map(([stream, start, end], i) => ({ id: newId('ws'), date: iso(monday, i === 2 ? 1 : 0), start, end, stream, participantIds: s.participants.map(p => p.id), recording: '', note: 'demo', recordingOn: true, roomSent: i === 0, startedAt: null, endedAt: null })); }
    for (const e of Object.values(s.entities)) e.country = 'France';
    s.milestones = (s.milestones || []).map((m, i) => ({ ...m, date: m.date || iso(monday, [-28, -14, 0, 7, 14, 21, 70, 100][i] || 0) }));
  });
  toast('Demo data loaded: 3 entities, 5 streams, 540 assessments');
  onDone && onDone();
}

function HomePage({ session, summary, updateSession, toast, go, onReplaceSession }) {
  const st = session.settings; const inp = useRef(); const [busy, setBusy] = useState(false);
  const hasData = session.files.length > 0;
  const inScope = Object.values(session.assessments).filter(a => !a.scope.outOfScope); const assessed = inScope.filter(a => a.workshop.status !== 'NOT_ASSESSED').length;
  const devs = Object.values(session.assessments).filter(a => !a.scope.outOfScope && GAP_TYPES_WITH_DEVIATION.has(effectiveGap(a))); const decided = devs.filter(a => a.deviation?.resolution && a.deviation?.ownerId).length;
  const q = qg2Readiness(session); const ready = q.streams.filter(s => q.perStream[s].ready).length;
  const planOk = !!st.country && session.participants.length > 0 && session.sessions.length > 0;
  const steps = [
    { n: 1, title: 'Import the capture sheets', text: 'Drop the pre-filled workbooks from GBS Operations (R2R, A2R, I2P, I2C, ICO, I2C_CMD). The tool reads entities, activities and the Ops pre-assessment.', status: hasData ? `${session.files.length} files · ${summary.assessments} entity × activity rows` : 'Nothing imported yet', state: hasData ? 'done' : 'todo', action: hasData ? 'Add or re-import files' : 'Import files', go: () => go('run', 'import') },
    { n: 2, title: 'Set up country, people and sessions', text: 'Client, country, your initials for the audit trail, the people in the room (owners are picked from this list) and the session slots.', status: planOk ? `${st.clientName || 'Client'} · ${st.country} · ${session.participants.length} people · ${session.sessions.length} sessions` : [st.country ? null : 'country', session.participants.length ? null : 'participants', session.sessions.length ? null : 'sessions'].filter(Boolean).join(', ') + ' missing', state: planOk ? 'done' : hasData ? 'next' : 'todo', action: planOk ? 'Edit set-up' : 'Set up', go: () => go('plan') },
    { n: 3, title: 'Run the workshops', text: 'One row per activity, the entities side by side. Accept the "no gap" pre-assessments in bulk, then discuss only the flagged rows. Every change is logged.', status: hasData ? `${assessed} of ${inScope.length} assessed (${Math.round(100 * assessed / Math.max(1, inScope.length))} %)` : 'Needs imported files', state: !hasData ? 'todo' : assessed === inScope.length ? 'done' : assessed ? 'progress' : 'next', action: 'Open workshop', go: () => go('run', 'workshop'), disabled: !hasData },
    { n: 4, title: 'Evaluate and decide gap treatment', text: 'All deviations on one board: resolution approach, accountable owner, approval. Plus activity split and gap analysis.', status: hasData ? `${decided} of ${devs.length} deviations have approach and owner` : '–', state: !hasData ? 'todo' : devs.length && decided === devs.length ? 'done' : decided ? 'progress' : assessed ? 'next' : 'todo', action: 'Open board', go: () => go('results'), disabled: !hasData },
    { n: 5, title: 'Sign off QG2 and hand over', text: 'Readiness per entity and stream, sign-off fields, then the hand-over package and the write-back into the original workbooks.', status: hasData ? `${ready} of ${q.streams.length} streams QG2-ready` : '–', state: !hasData ? 'todo' : ready === q.streams.length && q.streams.length ? 'done' : decided ? 'next' : 'todo', action: 'QG2 & hand-over', go: () => go('signoff'), disabled: !hasData },
  ];
  const next = steps.find(s => s.state === 'next' || s.state === 'progress') || steps.find(s => s.state === 'todo');
  const onLoad = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const loaded = deserializeSession(await f.text()); onReplaceSession(loaded); } catch (err) { toast(`Not a session file: ${err.message}`); } };
  const streams = STREAMS.filter(x => Object.values(session.processes).some(p => p.stream === x));
  const STEP_ICON = { 1: 'upload', 2: 'users', 3: 'run', 4: 'evaluate', 5: 'qg2' };
  return html`<div class="home">
    <div class="hero">
      <div class="hero-main">
        <div class="eyebrow" style="color:inherit;opacity:.75">GBS Fit-Gap Workbench${st.clientName ? ` · ${st.clientName} · ${st.country}` : ''}</div>
        <h1>${hasData ? (st.clientName ? `${st.clientName} · ${st.country || ''}` : 'Where you are') : 'Start here'}</h1>
        <p class="lead">${hasData ? 'Five steps from capture sheets to QG2 sign-off. Pick up where you left off.' : 'Five steps from capture sheets to QG2 sign-off. Import your files, or try the tool with demo data first.'}</p>
        ${hasData && html`<div class="hero-stats">
          <div class="hero-stat"><${Icon} name="building" size=${15} /><b>${summary.entities.length}</b><span>entities</span></div>
          <div class="hero-stat"><${Icon} name="layers" size=${15} /><b>${streams.length}</b><span>streams</span></div>
          <div class="hero-stat"><${Icon} name="grid" size=${15} /><b>${Object.values(summary.activitiesByStream || {}).reduce((a, b) => a + b, 0)}</b><span>activities</span></div>
          <div class="hero-stat"><${Icon} name="check" size=${15} /><b>${Math.round(100 * assessed / Math.max(1, inScope.length))}<small>%</small></b><span>assessed</span></div>
          <div class="hero-stat"><${Icon} name="flag" size=${15} /><b>${devs.length}</b><span>deviations</span></div>
        </div>`}
      </div>
      <div class="hero-side">${st.logoDataUrl ? html`<${ClientLogo} settings=${st} height=${40} />` : html`<${Mark} size=${56} radius=${12} />`}</div>
    </div>
    ${next && html`<div class="next-banner"><span class="eyebrow">Next</span><b>${next.n} · ${next.title}</b><${Button} variant="primary" size="sm" onClick=${next.go} disabled=${next.disabled}>${next.action}</${Button}></div>`}
    <div class="home-grid">
      <div class="steps">${steps.map(s => html`<div class=${`hstep hstep-${s.state}`} key=${s.n}><div class="step-n">${s.state === 'done' ? html`<${Icon} name="check" size=${16} />` : html`<${Icon} name=${STEP_ICON[s.n]} size=${16} />`}<span class="step-num">${s.n}</span></div><div class="step-body"><h3>${s.title}</h3><p>${s.text}</p><div class="step-status">${s.status}</div></div><div class="step-action"><${Button} variant=${s.state === 'next' || s.state === 'progress' ? 'primary' : 'outline'} size="sm" onClick=${s.go} disabled=${s.disabled}>${s.action}</${Button}></div></div>`)}</div>
      <div class="home-side">
        <div class="card"><div class="card-body">
          <div class="eyebrow" style="margin-bottom:.4rem">Quick start</div>
          ${!hasData && html`<p class="small muted">No client data at hand? Load a fictional "Demo Group" with three entities and all five streams.</p><${Button} variant="primary" icon="run" disabled=${busy} onClick=${async () => { setBusy(true); try { await loadDemoData(updateSession, toast, () => go('run', 'workshop')); } finally { setBusy(false); } }}>${busy ? 'Loading demo…' : 'Try with demo data'}</${Button}><hr />`}
          <p class="small muted">Everything you do is saved in this browser automatically. Download the session file at the end of each day and to continue on another laptop.</p>
          <div class="sg-row"><${Button} variant="outline" size="sm" icon="file" onClick=${() => downloadTemplates(session, toast)}>Excel templates</${Button}><${Button} variant="outline" size="sm" icon="save" disabled=${!hasData} onClick=${() => { downloadSessionJson(session); toast('Session file downloaded'); }}>Save session file</${Button}><${Button} variant="outline" size="sm" icon="upload" onClick=${() => inp.current.click()}>Load session file…</${Button}><input ref=${inp} type="file" accept=".json" style="display:none" onChange=${onLoad} /></div>
        </div></div>
        <div class="card"><div class="card-body"><div class="eyebrow" style="margin-bottom:.4rem">Good to know</div><ul class="small muted" style="margin:0;padding-left:1.1rem;display:grid;gap:.3rem"><li>Works offline – no network, no server.</li><li><span class="mono">Ctrl K</span> jumps to any entity, stream or activity.</li><li>In the workshop: <span class="mono">↑ ↓</span> rows, <span class="mono">C</span> confirm as fit, <span class="mono">1–5</span> status, <span class="mono">Enter</span> comment.</li><li>Versions of a workbook re-sent later are merged, never duplicated. Workshop results are never overwritten.</li><li>The <b>Feedback</b> button (top bar) logs improvement notes into the session file.</li></ul></div></div>
      </div>
    </div>
  </div>`;
}
