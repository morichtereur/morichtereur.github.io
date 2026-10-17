// EVALUATE: deviation board (grouped by resolution approach, approval workflow,
// escalation queue), activity split view, gap analysis dashboard.

const RES_COLS = [['UNDECIDED', 'Undecided'], ['SEPARATE_VARIANT', 'Separate variant'], ['CLOSE_BEFORE_GO_LIVE', 'Close before go-live'], ['LIFT_AND_SHIFT', 'Lift & shift']];
const APPROVAL_NEXT = { PROPOSED: 'ALIGNED', ALIGNED: 'APPROVED' };

function deviationList(session) {
  return Object.values(session.assessments).filter(a => !a.scope.outOfScope && GAP_TYPES_WITH_DEVIATION.has(effectiveGap(a))).map(a => ({ a, p: session.processes[a.processId], d: a.deviation || {}, gap: effectiveGap(a) }));
}

function DeviationBoard({ session, updateSession, toast, goActivity }) {
  const [stream, setStream] = useState(''); const [entity, setEntity] = useState(''); const [level, setLevel] = useState(''); const [limit, setLimit] = useState(40);
  const all = deviationList(session);
  const list = all.filter(x => (!stream || x.a.stream === stream) && (!entity || x.a.entityCode === entity) && (!level || (x.d.escalation || 'L1') === level));
  const setDev = (a, patch) => updateSession(s => applyChange(s, a.key, 'deviation', { dimensions: [], resolution: '', justification: '', ownerId: '', targetDate: '', escalation: 'L1', approval: 'PROPOSED', ...(s.assessments[a.key].deviation || {}), ...patch }));
  const queue = {}; for (const x of all) { const l = x.d.escalation || 'L1'; queue[l] = (queue[l] || 0) + ((x.d.approval || 'PROPOSED') !== 'APPROVED' && (x.d.approval || 'PROPOSED') !== 'REJECTED' ? 1 : 0); }
  return html`<div>
    <div class="actionbar"><select class="select sm" style="width:auto" value=${stream} onChange=${e => setStream(e.target.value)}><option value="">All streams</option>${STREAMS.map(s => html`<option value=${s}>${s}</option>`)}</select><select class="select sm" style="width:auto" value=${entity} onChange=${e => setEntity(e.target.value)}><option value="">All entities</option>${Object.values(session.entities).map(e => html`<option value=${e.code}>${e.displayName || e.name}</option>`)}</select>
      <span class="spacer"></span><span class="eyebrow">Escalation queue</span>${['', ...ESCALATION].map(l => html`<${Chip} key=${l} active=${level === l} onClick=${() => setLevel(l)}>${l ? `${ESCALATION_LABEL[l].split(' ')[0]} · ${queue[l] || 0} open` : 'All levels'}</${Chip}>`)}</div>
    <div class="board-cols">${RES_COLS.map(([key, label]) => { const col = list.filter(x => (x.d.resolution || 'UNDECIDED') === key); return html`<div class="board-col" key=${key}><div class="board-col-head"><b>${label}</b><span class="num muted">${col.length}</span></div>
      ${col.slice(0, limit).map(({ a, p, d, gap }) => html`<div class="dev-card" key=${a.key}>
        <div class="sg-row" style="margin:0;justify-content:space-between"><${GapPill} value=${gap} size="sm" /><span class=${`appr appr-${d.approval || 'PROPOSED'}`}>${d.approval || 'PROPOSED'}</span></div>
        <div style="margin:.3rem 0 .1rem"><a href="#" onClick=${e => { e.preventDefault(); goActivity(p); }}><span class="mono small">${a.processId}</span> ${p?.name}</a></div>
        <div class="muted small">${session.entities[a.entityCode]?.displayName || a.entityCode} · ${a.stream}${d.dimensions?.length ? ' · ' + d.dimensions.map(x => DIMENSION_LABEL[x]).join(', ') : ''}</div>
        ${a.workshop.rationale && html`<div class="small" style="margin-top:.2rem">${a.workshop.rationale}</div>`}
        <div class="small muted" style="margin-top:.2rem">${d.ownerId ? session.participants.find(x => x.id === d.ownerId)?.name : html`<span style="color:var(--flag)">no owner</span>`}${d.targetDate ? ' · ' + d.targetDate : ''} · ${ESCALATION_LABEL[d.escalation || 'L1'].split(' ')[0]}</div>
        <div class="sg-row" style="margin:.4rem 0 0;gap:.3rem">
          <select class="select sm" style="width:auto" value=${d.resolution || ''} onChange=${e => setDev(a, { resolution: e.target.value })}><option value="">approach…</option>${Object.keys(RESOLUTION).map(r => html`<option value=${r}>${RESOLUTION_LABEL[r]}</option>`)}</select>
          <select class="select sm" style="width:auto" value=${d.escalation || 'L1'} onChange=${e => setDev(a, { escalation: e.target.value })}>${ESCALATION.map(l => html`<option value=${l}>${l}</option>`)}</select>
          ${APPROVAL_NEXT[d.approval || 'PROPOSED'] && html`<${Button} variant="primary" size="sm" onClick=${() => setDev(a, { approval: APPROVAL_NEXT[d.approval || 'PROPOSED'] })}>→ ${APPROVAL_NEXT[d.approval || 'PROPOSED'][0] + APPROVAL_NEXT[d.approval || 'PROPOSED'].slice(1).toLowerCase()}</${Button}>`}
          ${(d.approval || 'PROPOSED') !== 'REJECTED' ? html`<${Button} variant="text" size="sm" onClick=${() => setDev(a, { approval: 'REJECTED' })}>Reject</${Button}>` : html`<${Button} variant="text" size="sm" onClick=${() => setDev(a, { approval: 'PROPOSED' })}>Reopen</${Button}>`}
        </div></div>`)}
      ${!col.length && html`<div class="muted small" style="padding:.5rem">–</div>`}${col.length > limit && html`<${Button} variant="text" size="sm" onClick=${() => setLimit(limit + 80)}>Show more (${col.length - limit} left)</${Button}>`}</div>`; })}</div>
  </div>`;
}

const CLS_COLOR = { MOVES_TO_GBS: 'var(--gbs)', STAYS_LOCAL: 'var(--local)', PLANNED_GBS_STAYS_LOCAL: 'var(--flag)', PLANNED_LOCAL_DONE_BY_GBS: 'var(--split)', OTHER_PARTY: 'var(--coe)', NOT_ASSESSED: 'var(--none)' };
function ActivitySplitView({ session, goActivity }) {
  const ents = Object.values(session.entities);
  // Default to the first entity/stream combination that actually has in-scope rows (real files often have entities without a given stream).
  const present = useMemo(() => STREAMS.filter(s => Object.values(session.processes).some(p => p.stream === s)), [session.processes]);
  const firstCombo = useMemo(() => { for (const s of present) for (const e of ents) if (Object.values(session.assessments).some(a => a.entityCode === e.code && a.stream === s && !a.scope.outOfScope)) return { e: e.code, s }; return { e: ents[0]?.code || '', s: present[0] || '' }; }, [session.assessments]);
  const [entity, setEntity] = useState(firstCombo.e); const [stream, setStream] = useState(firstCombo.s); const [cls, setCls] = useState('');
  const split = useMemo(() => entity ? activitySplit(session, entity, stream) : { rows: [], agg: [], totals: { cls: {}, fte: 0, total: 0 } }, [session, entity, stream]);
  const rows = cls ? split.rows.filter(r => r.cls === cls) : split.rows;
  const laneTag = (l) => l ? html`<${Tag} kind=${l} />` : html`<span class="muted small">–</span>`;
  return html`<div>
    <div class="actionbar"><select class="select sm" style="width:auto" value=${entity} onChange=${e => setEntity(e.target.value)}>${ents.map(e => html`<option value=${e.code}>${e.displayName || e.name}</option>`)}</select><select class="select sm" style="width:auto" value=${stream} onChange=${e => setStream(e.target.value)}>${present.map(s => html`<option value=${s}>${s}</option>`)}</select><span class="spacer"></span>${['', ...SPLIT_CLASS_KEYS].map(k => html`<${Chip} key=${k} active=${cls === k} onClick=${() => setCls(k)}>${k ? `${SPLIT_CLASS[k]} · ${split.totals.cls[k] || 0}` : `All · ${split.totals.total}`}</${Chip}>`)}</div>
    <div class="kpi-row">${SPLIT_CLASS_KEYS.slice(0, 4).map(k => html`<${Kpi} key=${k} value=${split.totals.cls[k] || 0} unit=${split.totals.total ? `· ${Math.round(100 * (split.totals.cls[k] || 0) / split.totals.total)} %` : ''} label=${SPLIT_CLASS[k]} color=${CLS_COLOR[k]} />`)}<${Kpi} value=${split.totals.fte.toFixed(1)} label="FTE entered (Fit-Gap)" color="var(--auto)" /></div>
    <div class="import-grid">
      <${Card} title="Per L2 / L3" stats=${[['nodes', split.agg.length]]}><table class="matrix"><thead><tr><th style="text-align:left">Node</th><th style="text-align:left">Classes</th><th class="num">Activities</th><th class="num">FTE</th></tr></thead><tbody>${split.agg.map(g => html`<tr key=${g.id}><td style=${`text-align:left;padding-left:${g.level === 2 ? 1.4 : 0.6}rem`}><span class="mono small">${g.id}</span> ${g.name}</td><td style="text-align:left"><div class="stack" style="width:12rem;display:inline-flex;vertical-align:middle">${SPLIT_CLASS_KEYS.filter(k => g.cls[k]).map(k => html`<i key=${k} style=${`width:${100 * g.cls[k] / g.total}%;background:${CLS_COLOR[k]}`} title=${`${SPLIT_CLASS[k]}: ${g.cls[k]}`}></i>`)}</div></td><td class="num">${g.total}</td><td class="num">${g.fte.toFixed(1)}</td></tr>`)}</tbody></table></${Card}>
      <${Card} title="Activities" stats=${[['shown', rows.length]]}><table class="matrix"><thead><tr><th style="text-align:left">Activity</th><th style="text-align:left">To-Be</th><th style="text-align:left">Ops as-is</th><th style="text-align:left">Workshop</th><th style="text-align:left">Class</th><th class="num">FTE</th></tr></thead><tbody>${rows.slice(0, 300).map(r => html`<tr key=${r.key}><td style="text-align:left"><a href="#" onClick=${e => { e.preventDefault(); goActivity(session.processes[r.processId]); }}><span class="mono small">${r.processId}</span> ${r.name}</a></td><td style="text-align:left">${laneTag(r.lanes.toBe)}</td><td style="text-align:left">${laneTag(r.lanes.ops)}</td><td style="text-align:left">${laneTag(r.lanes.workshop)}${r.lanes.other ? html` <${Tag} kind="OTHER">Other</${Tag}>` : ''}</td><td style="text-align:left"><span class="cls-pill" style=${`--c:${CLS_COLOR[r.cls]}`}>${SPLIT_CLASS[r.cls]}</span></td><td class="num">${r.fte || ''}</td></tr>`)}</tbody></table></${Card}>
    </div>
  </div>`;
}

function GapAnalysisView({ session, goActivity }) {
  const [entity, setEntity] = useState(''); const [stream, setStream] = useState(''); const [pick, setPick] = useState(null);
  const g = useMemo(() => gapAnalysis(session, { entityCode: entity || null, stream: stream || null }), [session, entity, stream]);
  const ents = Object.values(session.entities);
  const matrixKeys = GAP_ORDER.filter(k => g.matrix[k] || Object.values(g.matrix).some(r => r[k]));
  const picked = pick ? Object.values(session.assessments).filter(a => !a.scope.outOfScope && (!entity || a.entityCode === entity) && (!stream || a.stream === stream) && (a.asIs.gap || 'NOT_ASSESSED') === pick[0] && ((a.workshop.gapType ? a.workshop.gapType : (a.workshop.status === 'NOT_ASSESSED' ? 'NOT_ASSESSED' : (effectiveGap(a) || 'NOT_ASSESSED'))) === pick[1])) : [];
  const heatColor = (c) => { if (!c || !c.total) return 'transparent'; const share = c.gaps / c.total; return `color-mix(in srgb, var(--g-harm) ${Math.round(share * 85)}%, var(--panel))`; };
  const maxDriver = Math.max(1, ...Object.values(g.drivers));
  return html`<div>
    <div class="actionbar"><select class="select sm" style="width:auto" value=${entity} onChange=${e => setEntity(e.target.value)}><option value="">${session.settings.country || 'All entities'} total</option>${ents.map(e => html`<option value=${e.code}>${e.displayName || e.name}</option>`)}</select><select class="select sm" style="width:auto" value=${stream} onChange=${e => setStream(e.target.value)}><option value="">All streams</option>${STREAMS.map(s => html`<option value=${s}>${s}</option>`)}</select><span class="muted small">${g.n} assessments in scope · gaps on country side ${g.side.country} · GBS side ${g.side.gbs} · mixed ${g.side.mixed}</span></div>
    <div class="import-grid">
      <${Card} title="Distribution by gap type · Ops vs. workshop"><${OpsVsWorkshopChart} dist=${g.dist} /></${Card}>
      <${Card} title="Change matrix · Ops → workshop" stats=${[['click a cell to list', '']]}><table class="matrix heat"><thead><tr><th style="text-align:left">Ops ↓ / Workshop →</th>${matrixKeys.map(k => html`<th key=${k} class="num">${(GAP_LABEL[k] || 'Open').replace('IZATION', '.')}</th>`)}</tr></thead><tbody>${matrixKeys.map(o => html`<tr key=${o}><td style="text-align:left"><${GapPill} value=${o} size="sm" /></td>${matrixKeys.map(w => { const n = g.matrix[o]?.[w] || 0; return html`<td key=${w} class=${`num${n ? ' clickable' : ' zero'}${o !== w && n ? ' changed' : ''}`} onClick=${() => n && setPick([o, w])}>${n || '·'}</td>`; })}</tr>`)}</tbody></table>
        ${pick && html`<div style="margin-top:.6rem"><div class="eyebrow">${GAP_LABEL[pick[0]] || 'Not assessed'} → ${GAP_LABEL[pick[1]] || 'Not assessed'} · ${picked.length}</div><ul class="small" style="margin:.3rem 0 0;padding-left:1.1rem;max-height:12rem;overflow:auto">${picked.slice(0, 60).map(a => html`<li key=${a.key}><a href="#" onClick=${e => { e.preventDefault(); goActivity(session.processes[a.processId]); }}><span class="mono">${a.processId}</span> ${session.processes[a.processId]?.name}</a> <span class="muted">· ${session.entities[a.entityCode]?.displayName || a.entityCode}</span></li>`)}</ul></div>`}</${Card}>
      <${Card} title="Heatmap · L2 / L3 × entity (share of activities with a gap)"><div style="overflow:auto"><table class="matrix heat"><thead><tr><th style="text-align:left">Node</th>${ents.filter(e => !entity || e.code === entity).map(e => html`<th key=${e.code} class="num">${e.displayName || e.name}</th>`)}</tr></thead><tbody>${g.heat.map(h => html`<tr key=${h.id}><td style=${`text-align:left;padding-left:${h.level === 2 ? 1.4 : 0.6}rem`}><span class="mono small">${h.id}</span> ${h.name}</td>${ents.filter(e => !entity || e.code === entity).map(e => { const c = h.cells[e.code]; return html`<td key=${e.code} class="num" style=${`background:${heatColor(c)}`} title=${c ? `${c.gaps} of ${c.total}` : ''}>${c && c.total ? `${Math.round(100 * c.gaps / c.total)} %` : '·'}</td>`; })}</tr>`)}</tbody></table></div></${Card}>
      <div style="display:grid;gap:1rem">
        <${Card} title="Cross-entity" stats=${[['all entities', g.cross.all.length], ['one entity', g.cross.one.length], ['some', g.cross.some.length]]}><div class="sg-two"><div><div class="eyebrow">Gap in all entities → likely global-standard issue</div><ul class="small" style="padding-left:1.1rem;max-height:10rem;overflow:auto">${g.cross.all.map(b => html`<li key=${b.processId}><a href="#" onClick=${e => { e.preventDefault(); goActivity(session.processes[b.processId]); }}><span class="mono">${b.processId}</span> ${b.name}</a></li>`)}</ul></div><div><div class="eyebrow">Gap in one entity only → entity-specific</div><ul class="small" style="padding-left:1.1rem;max-height:10rem;overflow:auto">${g.cross.one.map(b => html`<li key=${b.processId}><a href="#" onClick=${e => { e.preventDefault(); goActivity(session.processes[b.processId]); }}><span class="mono">${b.processId}</span> ${b.name}</a> <span class="muted">· ${session.entities[b.gaps[0]]?.displayName || b.gaps[0]}</span></li>`)}</ul></div></div></${Card}>
        <${Card} title="Gap drivers · from Detailed Gap fields">${DETAILED_GAP_FIELDS.map(f => html`<div class="bar-row" key=${f}><span>${DETAILED_GAP_LABEL[f]}</span><span class="bar"><i style=${`width:${100 * g.drivers[f] / maxDriver}%;background:var(--accent)`}></i></span><b class="num">${g.drivers[f]}</b></div>`)}</${Card}>
      </div>
    </div>
    <div style="margin-top:1rem"><${Card} title="Top open points · for the Detailed Gap hand-over" stats=${[['open', g.openPoints.length]]}><table class="matrix"><thead><tr><th style="text-align:left">Activity</th><th style="text-align:left">Entity</th><th style="text-align:left">Status</th><th style="text-align:left">Gap</th><th style="text-align:left">Missing / next step</th><th style="text-align:left">Owner · due</th></tr></thead><tbody>${g.openPoints.slice(0, 40).map(o => html`<tr key=${o.key}><td style="text-align:left"><a href="#" onClick=${e => { e.preventDefault(); goActivity(session.processes[o.processId]); }}><span class="mono small">${o.processId}</span> ${o.name}</a></td><td style="text-align:left">${session.entities[o.entityCode]?.displayName || o.entityCode}</td><td style="text-align:left"><${StatusDot} status=${o.status} /></td><td style="text-align:left"><${GapPill} value=${o.gap || 'NOT_ASSESSED'} size="sm" /></td><td style="text-align:left" class="small">${o.nextStep || o.missing.join(', ')}</td><td style="text-align:left" class="small">${session.participants.find(p => p.id === o.owner)?.name || ''}${o.due ? ' · ' + o.due : ''}</td></tr>`)}</tbody></table></${Card}></div>
  </div>`;
}

function EvaluatePage({ session, updateSession, toast, goActivity }) {
  const hasData = Object.keys(session.assessments).length > 0;
  if (!hasData) return html`<${PageHead} eyebrow="3 · Results" title="Results" /><${EmptyState} icon="evaluate" title="No assessments yet" text="Import the capture sheets and run the workshops first." />`;
  const [open, setOpen] = useState({ board: true, split: false, analysis: true });
  const tog = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));
  return html`<div>
    <${PageHead} eyebrow="3 · Results" title="Deviations, activity split and gap analysis" lead="Decide every deviation on the board (approach, owner, approval). Below: where the gaps cluster and what moves to GBS as planned." />
    <div style="display:grid;gap:1.25rem">
      <${Card} title="Deviation board" stats=${[['deviations', deviationList(session).length]]} open=${open.board} onToggle=${() => tog('board')}><${DeviationBoard} session=${session} updateSession=${updateSession} toast=${toast} goActivity=${goActivity} /></${Card}>
      <${Card} title="Gap analysis" open=${open.analysis} onToggle=${() => tog('analysis')}><${GapAnalysisView} session=${session} goActivity=${goActivity} /></${Card}>
      <${Card} title="Activity split · what moves to GBS as planned" open=${open.split} onToggle=${() => tog('split')}><${ActivitySplitView} session=${session} goActivity=${goActivity} /></${Card}>
    </div>
  </div>`;
}
