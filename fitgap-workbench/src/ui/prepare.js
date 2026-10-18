// PREPARE: readiness checklist and traffic light per planned session, list of missing pre-fills.

function PreparePage({ session, updateSession, toast }) {
  const fbn = useMemo(() => flowsByNode(session), [session.flows]);
  const [open, setOpen] = useState(null);
  if (!session.sessions.length) return html`<${PageHead} icon="prepare" eyebrow="1 · Plan & prepare · readiness" title="Readiness per session" /><${EmptyState} icon="prepare" title="No sessions planned" text="Add sessions in 1 · Plan – readiness is checked per session." />`;
  const lightColor = { green: 'var(--ok)', amber: 'var(--g-harm)', red: 'var(--flag)' };
  return html`<div>
    <${PageHead} icon="prepare" eyebrow="1 · Plan & prepare · readiness" title="Readiness per session" lead="Capture sheet received, Ops pre-assessment complete, flows available, participants nominated, room or link sent. The list of missing pre-fills is what to chase with GBS Operations before the session." />
    <div style="display:grid;gap:1rem">${session.sessions.map(ws => { const r = prepareReadiness(session, ws, fbn); return html`<div class="card" key=${ws.id}><div class="card-head"><span class="light" style=${`background:${lightColor[r.light]}`}></span><h3>${ws.date} ${ws.start}${ws.end ? '–' + ws.end : ''} · ${ws.stream}</h3><span class="muted small">${r.activities} activities in scope</span></div><div class="card-body">
      <div class="checks">${r.checks.map(c => html`<div class=${`check ${c.ok ? 'ok' : c.warn ? 'warn' : 'bad'}`} key=${c.key}><${Icon} name=${c.ok ? 'check' : 'alert'} size=${14} /><span>${c.label}</span><span class="muted small">${c.detail}</span>${c.key === 'room' && html`<label class="toggle" style="margin-left:auto"><input type="checkbox" checked=${!!ws.roomSent} onChange=${e => updateSession(s => { s.sessions.find(x => x.id === ws.id).roomSent = e.target.checked; })} /><i></i>sent</label>`}</div>`)}</div>
      ${r.missing.length > 0 && html`<div style="margin-top:.6rem"><${Button} variant="text" size="sm" onClick=${() => setOpen(open === ws.id ? null : ws.id)}>${open === ws.id ? 'Hide' : 'Show'} ${r.missing.length} missing Ops pre-fills</${Button}> <${Button} variant="text" size="sm" onClick=${() => { navigator.clipboard?.writeText(r.missing.map(m => `${m.processId}\t${m.name}\t${session.entities[m.entityCode]?.displayName || m.entityCode}`).join('\n')).then(() => toast('Chase list copied')); }}>Copy chase list</${Button}>
        ${open === ws.id && html`<table class="matrix" style="margin-top:.4rem"><thead><tr><th style="text-align:left">Process ID</th><th style="text-align:left">Activity</th><th style="text-align:left">Entity</th></tr></thead><tbody>${r.missing.slice(0, 200).map((m, i) => html`<tr key=${i}><td class="mono" style="text-align:left">${m.processId}</td><td style="text-align:left">${m.name}</td><td style="text-align:left">${session.entities[m.entityCode]?.displayName || m.entityCode}</td></tr>`)}</tbody></table>`}</div>`}
    </div></div>`; })}</div>
  </div>`;
}
