// Workshop mode: one process tree over all streams, L1–L3 progress, one row per L4 activity
// with entity columns, inline expansion with Fit-Gap → Detailed Gap → Deviation,
// bulk confirmation, keyboard-first entry, audit history per activity.

const STATUS_KEYS = ['CONFIRMED_FIT', 'CHANGED_VS_OPS', 'GAP_CONFIRMED', 'OPEN_QUESTION', 'OUT_OF_SCOPE'];
const GAP_CHOICES = ['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA', 'UNCLEAR'];

function splitValues(v) { return normText(v).split(/[\/,;+&]| and /i).map(x => x.trim()).filter(x => x && x.toLowerCase() !== 'n/a'); }
function topValues(list, n = 6) { const c = new Map(); for (const v of list) c.set(v, (c.get(v) || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]); }

/** Frequent values per Detailed Gap field for the quick-pick chips (systems from the Ops As-Is, the rest from workshop entries). */
function useQuickPicks(session, stream) {
  return useMemo(() => {
    const sys = [], wf = [], byField = Object.fromEntries(DETAILED_GAP_FIELDS.map(f => [f, []]));
    for (const a of Object.values(session.assessments)) {
      if (stream && a.stream !== stream) continue;
      sys.push(...splitValues(a.asIs.systems));
      if (session.processes[a.processId]?.toBe?.system) sys.push(...splitValues(session.processes[a.processId].toBe.system));
      for (const f of DETAILED_GAP_FIELDS) if (a.detailedGap[f] && a.detailedGap[f] !== NA) byField[f].push(a.detailedGap[f].trim());
    }
    const picks = {};
    for (const f of DETAILED_GAP_FIELDS) picks[f] = topValues([...(f === 'itSystems' ? sys : f === 'workflowTools' ? wf : []), ...byField[f]], 6);
    return picks;
  }, [session.assessments, stream]);
}

function laneTags(local, gbs, other) {
  const t = []; if (local === true) t.push(['LOCAL', 'Local']); if (other === true) t.push(['OTHER', 'Other']); if (gbs === true) t.push(['GBS', 'GBS']);
  if (!t.length) return html`<span class="muted small">${local === null && gbs === null ? '?' : 'none'}</span>`;
  return t.map(([k, l]) => html`<${Tag} kind=${k} key=${k}>${l}</${Tag}>`);
}
const ynText = (v) => v === true ? 'Y' : v === false ? 'N' : v && v.text ? v.text : '–';

function TreePanel({ tree, selectedId, onSelect, session, entityFilter, collapsed, toggle, pace, index }) {
  const Node = ({ n, depth }) => {
    const acts = activitiesOf(n); const s = nodeStats(session, acts, entityFilter, index);
    const isLeaf = n.activities.length > 0; const open = !collapsed.has(n.id);
    const pct = s.total ? Math.round(100 * s.assessed / s.total) : 0;
    return html`<div>
      <button class=${`tree-node${selectedId === n.id ? ' sel' : ''}${!n.parentId ? ' root' : ''}`} style=${`padding-left:${0.5 + depth * 0.8}rem`} onClick=${() => isLeaf ? onSelect(n.id) : toggle(n.id)}>
        ${!isLeaf && n.children.length ? html`<span class=${`tw${open ? ' open' : ''}`}><${Icon} name="chevron" size=${12} /></span>` : html`<span class="tw"></span>`}
        <span class="tn">${!n.parentId && html`<span class="tree-ico"><${Icon} name=${streamIcon(n.stream)} size=${13} /></span>`}${(() => { const pid = n.level < 4 ? n.id.replace(/ \(\d+\)$/, '') : n.id; return String(n.name || '').startsWith(pid) ? html`<span class="pid">${pid}</span>${n.name.slice(pid.length)}` : html`<span class="pid">${pid}</span> ${n.name}`; })()}</span>
        <span class="tp"><span class="num">${s.assessed}/${s.total}</span>${s.openGaps ? html`<span class="og" title="open gaps">${s.openGaps}</span>` : null}</span>
        <span class="tb"><i style=${`width:${pct}%`}></i></span>
      </button>
      ${open && n.children.map(c => html`<${Node} n=${c} depth=${depth + 1} key=${c.id} />`)}
    </div>`;
  };
  return html`<aside class="tree"><div class="eyebrow" style="padding:.6rem .6rem .3rem">Process tree</div>${tree.map(n => html`<${Node} n=${n} depth=${0} key=${n.id} />`)}${!tree.length && html`<p class="muted small" style="padding:.6rem">No activities in scope.</p>`}</aside>`;
}

function HistoryList({ session, akey }) {
  const entries = session.audit.filter(e => e.key === akey).slice().reverse();
  if (!entries.length) return html`<p class="muted small">No changes yet.</p>`;
  const who = (e) => `${e.editor || '–'}${e.sessionId ? ' · ' + (session.sessions.find(s => s.id === e.sessionId)?.date || e.sessionId) : ''}`;
  return html`<table class="layout-table"><tbody>${entries.slice(0, 40).map((e, i) => html`<tr key=${i}><td class="mono">${new Date(e.ts).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td class="mono">${e.field}</td><td>${fmtVal(e.old)} → <b>${fmtVal(e.new)}</b>${e.bulkId ? html` <span class="muted">(bulk)</span>` : null}</td><td class="muted">${who(e)}</td></tr>`)}</tbody></table>`;
}
function fmtVal(v) { if (v === null || v === undefined || v === '') return '–'; if (typeof v === 'object') return JSON.stringify(v); return String(v); }

function ExpandedCell({ session, a, process, updateSession, picks, participants, prevKey, toast, commentRef, onAsk }) {
  const key = a.key;
  const set = (path, v) => updateSession(s => applyChange(s, key, path, v));
  const c = completeness(a); const gap = effectiveGap(a); const delta = splitDelta(a, process); const suggestion = suggestGapType(a, process);
  const tb = process?.toBe || {}; const dev = a.deviation || {};
  const setDev = (patch) => updateSession(s => applyChange(s, key, 'deviation', { dimensions: [], resolution: '', justification: '', ownerId: '', targetDate: '', escalation: 'L1', approval: 'PROPOSED', initiativeCandidate: false, linkedInitiative: '', ...(s.assessments[key].deviation || {}), ...patch }));
  const [showHist, setShowHist] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [tcr, setTcr] = useState(null);
  const owners = participants;
  const myTcrs = session.taxonomyChangeRequests.filter(t => t.processId === a.processId);
  const ChipsField = ({ f, label }) => { const v = a.detailedGap[f] || ''; return html`<${Field} label=${label}>
    <div class="chips" style="margin-bottom:.25rem">${picks[f].map(p => html`<${Chip} key=${p} active=${v === p || (v.includes(p) && v !== NA)} onClick=${() => set(`detailedGap.${f}`, v === p ? '' : p)}>${p}</${Chip}>`)}<${Chip} na active=${v === NA} onClick=${() => set(`detailedGap.${f}`, v === NA ? '' : NA)}>n/a</${Chip}></div>
    <${TextInput} class="sm" value=${v === NA ? '' : v} onCommit=${x => set(`detailedGap.${f}`, x)} placeholder=${v === NA ? 'n/a' : 'Free text'} /></${Field}>`; };
  return html`<div class="expand-inner">
    <div class="block ctx">
      <h4>Context · ${session.entities[a.entityCode]?.displayName || a.entityCode}</h4>
      <dl class="kv">
        <dt>To-Be</dt><dd>${laneTags(tb.le, tb.gbs, false)} ${tb.system && html`<span class="muted small">· ${tb.system}</span>`}</dd>
        ${tb.initiative && html`<dt>Initiative</dt><dd><span class="mono small">${tb.initiative}</span></dd>`}
        <dt>Ops as-is</dt><dd>${laneTags(a.asIs.le, a.asIs.gbs, false)} ${a.asIs.systems && html`<span class="muted small">· ${a.asIs.systems}</span>`}</dd>
        <dt>Ops GAP</dt><dd><${GapPill} value=${a.asIs.gap || 'NOT_ASSESSED'} size="sm" definitions=${session.settings.gapDefinitions} /> ${a.asIs.gapRaw && a.asIs.gapRaw !== GAP_LABEL[a.asIs.gap] && html`<span class="muted small">"${a.asIs.gapRaw}"</span>`}</dd>
        ${a.asIs.info && html`<dt>Ops note</dt><dd>${a.asIs.info}</dd>`}
        ${process?.description && html`<dt>Description</dt><dd class="muted">${process.description}</dd>`}
        ${a.notes.map((n, i) => html`<dt key=${i}>Note</dt><dd class="diff-note">${n.text} <span class="muted">(${n.field})</span></dd>`)}
        ${process?.context && Object.entries(process.context).map(([k, ex]) => Object.entries(ex).map(([h, v]) => html`<dt key=${k + h}>${k.toLowerCase()} · ${h}</dt><dd class="muted">${v}</dd>`))}
      </dl>
      <div style="margin-top:.6rem" class="sg-row">
        ${a.scope.outOfScope ? html`<${Button} variant="outline" size="sm" onClick=${() => { updateSession(s => { applyChange(s, key, 'scope', { outOfScope: false, source: 'workshop', reason: 'included in the workshop' }); applyChange(s, key, 'workshop.status', WORKSHOP_STATUS.NOT_ASSESSED); }); }}>Include in scope</${Button}>` : html`<${Button} variant="text" size="sm" onClick=${() => { updateSession(s => { applyChange(s, key, 'scope', { outOfScope: true, source: 'workshop', reason: 'set out of scope in the workshop' }); applyChange(s, key, 'workshop.status', WORKSHOP_STATUS.OUT_OF_SCOPE); }); }}>Mark out of scope</${Button}>`}
        <${Button} variant="text" size="sm" onClick=${() => setShowHist(!showHist)}>History (${session.audit.filter(e => e.key === key).length})</${Button}>
        <${Button} variant="text" size="sm" onClick=${() => { let n = 0; updateSession(s => { n = applyToAllEntities(s, key); }); toast(`Applied to the other entities (${n} fields)`); }}>Apply to all entities</${Button}>
        <${Button} variant="text" size="sm" onClick=${() => setTcr(tcr ? null : { proposedChange: '', reason: '' })}>Taxonomy change request${myTcrs.length ? ` (${myTcrs.length})` : ''}</${Button}>
        ${onAsk && html`<${Button} variant="outline" size="sm" icon="spark" onClick=${() => onAsk(key)}>Ask AI</${Button}>`}
      </div>
      ${tcr && html`<div class="fgrid" style="margin-top:.5rem;grid-template-columns:1fr"><${Field} label="Proposed change" hint="The taxonomy is not edited – the request goes to the agreed change path"><input class="input sm" value=${tcr.proposedChange} onInput=${e => setTcr({ ...tcr, proposedChange: e.target.value })} placeholder="e.g. split into two activities / remove duplicate / rename" /></${Field}><${Field} label="Reason"><input class="input sm" value=${tcr.reason} onInput=${e => setTcr({ ...tcr, reason: e.target.value })} /></${Field}><div class="sg-row" style="margin:0"><${Button} variant="primary" size="sm" disabled=${!tcr.proposedChange.trim()} onClick=${() => { updateSession(s => { s.taxonomyChangeRequests.push({ id: newId('tcr'), processId: a.processId, proposedChange: tcr.proposedChange.trim(), reason: tcr.reason.trim(), raisedBy: s.settings.editorInitials, sessionId: s.activeSessionId, ts: new Date().toISOString() }); }); setTcr(null); toast('Taxonomy change request logged'); }}>Log request</${Button}><${Button} variant="text" size="sm" onClick=${() => setTcr(null)}>Cancel</${Button}></div></div>`}
      ${myTcrs.length > 0 && html`<ul class="small muted" style="margin:.4rem 0 0;padding-left:1.1rem">${myTcrs.map(t => html`<li key=${t.id}>${t.proposedChange}${t.reason ? ` – ${t.reason}` : ''}</li>`)}</ul>`}
      ${showHist && html`<div style="margin-top:.5rem"><${HistoryList} session=${session} akey=${key} /></div>`}
      ${!c.complete && !c.outOfScope && html`<div class="missing"><b>Missing:</b> ${c.missing.join(' · ')}</div>`}
      ${c.complete && !c.outOfScope && html`<div class="missing ok">Complete</div>`}
    </div>
    ${a.scope.outOfScope ? html`<div class="block"><h4>Out of scope</h4><p class="muted small">${a.scope.source === 'workshop' ? a.scope.reason : 'Pre-set as out of scope in the capture sheet.'} Excluded from progress, time budget and analysis.</p></div>` : html`
    <div class="block">
      <h4><span class="step">1</span> Who performs this activity today?</h4>
      <div class="fgrid">
        <${Field} label="Local Accounting (the entity)" required><${YN} value=${a.fitGap.local} onChange=${v => set('fitGap.local', v)} name="Local Accounting" /></${Field}>
        <${Field} label="GBS (shared service centre)" required><${YN} value=${a.fitGap.gbs} onChange=${v => set('fitGap.gbs', v)} name="GBS" /></${Field}>
        <${Field} label="Other party (e.g. external provider)"><${YN} value=${a.fitGap.other} onChange=${v => set('fitGap.other', v)} name="Other" /></${Field}>
        <${Field} label=${effortMode(session) === 'hours' ? 'Effort (hours per month)' : 'Effort (FTE)'} hint="optional"><${EffortField} session=${session} a=${a} updateSession=${updateSession} /></${Field}>
      </div>
      <h4 style="margin-top:.8rem"><span class="step">2</span> Is there a gap vs. the global standard?</h4>
      <div class="fgrid">
        <${Field} label="Gap type" required><select class="select sm" value=${a.workshop.gapType || ''} onChange=${e => set('workshop.gapType', e.target.value || null)}><option value="">${a.asIs.gap ? `(Ops: ${GAP_LABEL[a.asIs.gap]})` : '– choose –'}</option>${GAP_CHOICES.map(g => html`<option value=${g}>${GAP_LABEL[g]}</option>`)}</select></${Field}>
        <${Field} label="Why? (short rationale)" required=${c.missing.includes('Rationale')} error=${c.missing.includes('Rationale') ? 'Needed for any gap, or when you change the pre-assessment' : null}><${TextInput} class=${`sm${c.missing.includes('Rationale') ? ' invalid' : ''}`} value=${a.workshop.rationale} onCommit=${v => set('workshop.rationale', v)} placeholder="Short reason" /></${Field}>
      </div>
      ${delta.known && delta.differs && html`<div class="diff-note" style="margin-top:.5rem">To-Be: ${delta.toBe} → Workshop: ${delta.workshop}${suggestion && suggestion !== gap ? html` — suggest <b>${GAP_LABEL[suggestion]}</b> <${Button} variant="text" size="sm" onClick=${() => set('workshop.gapType', suggestion)}>Apply</${Button}>` : ''}</div>`}
      ${delta.known && !delta.differs && a.asIs.gap === GAP.HARMONIZATION && suggestion === GAP.NO_GAP && html`<div class="diff-note" style="margin-top:.5rem">Split matches To-Be – Ops HARMONIZATION not confirmed? <${Button} variant="text" size="sm" onClick=${() => set('workshop.gapType', GAP.NO_GAP)}>Set NO GAP</${Button}></div>`}
      ${a.workshop.status !== WORKSHOP_STATUS.CONFIRMED_FIT && (a.asIs.gap === GAP.NO_GAP || gap === GAP.NO_GAP) && html`<div style="margin-top:.6rem"><${Button} variant="primary" size="sm" kbd="C" onClick=${() => { updateSession(s => confirmFit(s, key, process)); }}>Confirm as fit</${Button}><span class="muted small" style="margin-left:.5rem">no gap · split as planned · details n/a</span></div>`}
    </div>
    <div class="block">
      <h4><span class="step">3</span> Details · systems, tools, legal, language, controls ${gap === GAP.NO_GAP || gap === GAP.NA ? html`<span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">optional for no gap</span>` : html`<span class="req" style="color:var(--flag)">at least one field</span>`}</h4>
      ${(gap === GAP.NO_GAP || gap === GAP.NA) && !showDetails && !detailedGapFilled(a).length ? html`<${Button} variant="text" size="sm" onClick=${() => setShowDetails(true)}>Add details anyway</${Button}>` : html`<div class="fgrid">${DETAILED_GAP_FIELDS.map(f => html`<${ChipsField} key=${f} f=${f} label=${DETAILED_GAP_LABEL[f]} />`)}</div>`}
      <div class="sg-row" style="margin-top:.5rem">${(showDetails || !(gap === GAP.NO_GAP || gap === GAP.NA) || detailedGapFilled(a).length > 0) && prevKey && html`<${Button} variant="outline" size="sm" icon="copy" onClick=${() => { let n = 0; updateSession(s => { n = copyDetailedGap(s, prevKey, key); }); toast(n ? `${n} fields copied from the previous activity` : 'Previous activity has no Detailed Gap values'); }}>Copy from previous activity</${Button}>`}<${Button} variant="text" size="sm" onClick=${() => updateSession(s => { for (const f of DETAILED_GAP_FIELDS) if (!s.assessments[key].detailedGap[f]) applyChange(s, key, `detailedGap.${f}`, NA); })}>Mark empty fields n/a</${Button}></div>
    </div>
    ${GAP_TYPES_WITH_DEVIATION.has(gap) && html`<div class="block dev">
      <h4><span class="step">4</span> How do we resolve this deviation?</h4>
      <div class="fgrid">
        <${Field} label="Dimension" required><div class="chips">${Object.keys(DIMENSION).map(d => html`<${Chip} key=${d} active=${(dev.dimensions || []).includes(d)} onClick=${() => setDev({ dimensions: (dev.dimensions || []).includes(d) ? dev.dimensions.filter(x => x !== d) : [...(dev.dimensions || []), d] })}>${DIMENSION_LABEL[d]}</${Chip}>`)}</div></${Field}>
        <${Field} label="Resolution approach" required><select class="select sm" value=${dev.resolution || ''} onChange=${e => setDev({ resolution: e.target.value })}><option value="">– choose –</option>${Object.keys(RESOLUTION).map(r => html`<option value=${r}>${RESOLUTION_LABEL[r]}</option>`)}</select></${Field}>
        <${Field} label="Accountable owner" required hint=${owners.length ? null : 'Add participants in 1 · Plan'}><select class="select sm" value=${dev.ownerId || ''} onChange=${e => setDev({ ownerId: e.target.value })}><option value="">– choose –</option>${owners.map(p => html`<option value=${p.id}>${p.name} · ${p.organisation}</option>`)}</select></${Field}>
        <${Field} label="Target date"><input class="input sm" type="date" value=${dev.targetDate || ''} onChange=${e => setDev({ targetDate: e.target.value })} /></${Field}>
        <${Field} label="Escalation level"><select class="select sm" value=${dev.escalation || 'L1'} onChange=${e => setDev({ escalation: e.target.value })}>${ESCALATION.map(l => html`<option value=${l}>${ESCALATION_LABEL[l]}</option>`)}</select></${Field}>
        <${Field} label="Approval status"><select class="select sm" value=${dev.approval || 'PROPOSED'} onChange=${e => setDev({ approval: e.target.value })}>${APPROVAL.map(l => html`<option value=${l}>${l[0] + l.slice(1).toLowerCase()}</option>`)}</select></${Field}>
        <${Field} label="Justification" required=${dev.resolution === 'SEPARATE_VARIANT'} class="full" hint=${dev.resolution === 'SEPARATE_VARIANT' ? 'Mandatory for a separate variant: legal, tax or regulatory reason' : null}><${TextInput} textarea class="sm" style="min-height:2.6rem" value=${dev.justification || ''} onCommit=${v => setDev({ justification: v })} /></${Field}>
        ${(gap === GAP.STANDARDIZATION || gap === GAP.BOTH) && html`<${Field} label="Initiative candidate (PE / WP3)" class="full"><div class="sg-row" style="margin:0"><${Switch} checked=${dev.initiativeCandidate !== false} onChange=${v => setDev({ initiativeCandidate: v })}>Initiative candidate</${Switch}>${tb.initiative && html`<${Chip} active=${dev.linkedInitiative === tb.initiative} onClick=${() => setDev({ linkedInitiative: dev.linkedInitiative === tb.initiative ? '' : tb.initiative })}>Link to existing: ${tb.initiative}</${Chip}>`}<${TextInput} class="sm" style="width:14rem" value=${dev.linkedInitiative || ''} onCommit=${v => setDev({ linkedInitiative: v })} placeholder="Existing initiative ID" /></div></${Field}>`}
      </div>
    </div>`}
    <div class="block">
      <h4><span class="step">5</span> Status & next step</h4>
      <div class="fgrid">
        <${Field} label="Workshop status" required hint="Keys 1–5"><select class="select sm" value=${a.workshop.status} onChange=${e => set('workshop.status', e.target.value)}><option value="NOT_ASSESSED">Not assessed</option>${STATUS_KEYS.map((s, i) => html`<option value=${s}>${i + 1} · ${WORKSHOP_STATUS_LABEL[s]}</option>`)}</select></${Field}>
        <${Field} label="Comment" class="full"><${TextInput} textarea class="sm" style="min-height:2.6rem" value=${a.workshop.comment} onCommit=${v => set('workshop.comment', v)} ref=${commentRef} placeholder="Enter opens this field" /></${Field}>
        <${Field} label="Next step"><${TextInput} class="sm" value=${a.workshop.nextStep} onCommit=${v => set('workshop.nextStep', v)} /></${Field}>
        <${Field} label="Owner"><select class="select sm" value=${a.workshop.owner || ''} onChange=${e => set('workshop.owner', e.target.value)}><option value="">–</option>${owners.map(p => html`<option value=${p.id}>${p.name}</option>`)}</select></${Field}>
        <${Field} label="Due"><input class="input sm" type="date" value=${a.workshop.due || ''} onChange=${e => set('workshop.due', e.target.value)} /></${Field}>
      </div>
    </div>`}
  </div>`;
}

function EntityCell({ a, process, onOpen, open, updateSession, onFit, onGap }) {
  if (!a) return html`<td class="ent"><span class="muted small">—</span></td>`;
  const gap = effectiveGap(a); const c = completeness(a); const differs = gapDiffersFromOps(a);
  const stop = (e) => e.stopPropagation();
  if (a.scope.outOfScope) return html`<td class=${`ent${open ? ' open' : ''}`} onClick=${e => { stop(e); onOpen(); }}><div class="cell"><${GapPill} value="OUT_OF_SCOPE" size="sm" /><span class="muted small">click to include</span></div></td>`;
  const confirmed = a.workshop.status === WORKSHOP_STATUS.CONFIRMED_FIT;
  const l = lanesOf(a, process);
  return html`<td class=${`ent${open ? ' open' : ''}`} onClick=${e => { stop(e); onOpen(); }}>
    <div class="cell">
      <div class="top"><${GapPill} value=${gap || 'NOT_ASSESSED'} size="sm" />${differs && html`<span class="diff-note">was ${GAP_LABEL[a.asIs.gap] || '–'}</span>`}${l.workshop && html`<${Tag} kind=${l.workshop} />`}${c.complete ? html`<span class="complete" title="Complete"><${Icon} name="check" size=${13} /></span>` : c.touched ? html`<span class="incomplete" title=${c.missing.join(', ')}><${Icon} name="alert" size=${13} /></span>` : null}</div>
      ${confirmed ? html`<div class="quick"><${StatusDot} status=${a.workshop.status} /><button class="lnk" onClick=${e => { stop(e); onOpen(); }}>change</button></div>`
        : a.workshop.status === WORKSHOP_STATUS.NOT_ASSESSED ? html`<div class="quick"><button class="qbtn fit" title="Confirm as fit: no gap, split as planned (key C)" onClick=${e => { stop(e); onFit(); }}><${Icon} name="check" size=${13} /> Fit</button><button class="qbtn gap" title="There is a deviation – open the details" onClick=${e => { stop(e); onGap(); }}>Gap…</button><button class="qbtn q" title="Open question (key 4)" onClick=${e => { stop(e); updateSession(s => applyChange(s, a.key, 'workshop.status', WORKSHOP_STATUS.OPEN_QUESTION)); }}>?</button></div>`
        : html`<div class="quick"><${StatusDot} status=${a.workshop.status} />${!c.complete && html`<button class="lnk" onClick=${e => { stop(e); onOpen(); }}>complete</button>`}</div>`}
    </div></td>`;
}

function WorkshopView({ session, summary, updateSession, toast, ui, setUi, onPresent, onAsk }) {
  const [panel, setPanel] = useState(() => store.get('fg.panel', 'none'));
  const choosePanel = (v) => { setPanel(v); store.set('fg.panel', v); };
  const rawUpdate = updateSession;
  // Every workshop change is tagged with a session; start one automatically when none is active.
  const autoStarted = useRef(false);
  updateSession = (fn) => rawUpdate(s => { if (!s.activeSessionId) { const today = new Date().toISOString().slice(0, 10); let ws = s.sessions.find(x => x.date === today && x.stream === stream); if (!ws) { const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; ws = { id: newId('ws'), date: today, start: hm, end: '', stream, participantIds: [], recording: '', note: 'started automatically', startedAt: now.toISOString(), endedAt: null }; s.sessions.push(ws); } s.activeSessionId = ws.id; if (!ws.startedAt) ws.startedAt = new Date().toISOString(); if (!autoStarted.current) { autoStarted.current = true; setTimeout(() => toast(`Session ${ws.date} · ${ws.stream} started automatically – change it in the top bar`), 0); } } fn(s); });
  const st = session.settings;
  const streamsWithData = STREAMS.filter(s => summary.activitiesByStream[s]);
  const inScope = streamsWithData.filter(s => s === 'A2R' ? (st.streamsInScope['A2R-FAA'] !== false || st.streamsInScope['A2R-IA'] !== false) : st.streamsInScope[s] !== false);
  const mdOnly = !!ui.md;
  const entityFilter = ui.entity && session.entities[ui.entity] ? ui.entity : null;
  const entities = Object.values(session.entities).filter(e => !entityFilter || e.code === entityFilter);
  // One tree over every stream in scope (roots = streams); "master data only" filters across streams.
  const tree = useMemo(() => {
    if (mdOnly) return buildTree(session, null, { masterDataOnly: true });
    return inScope.flatMap(sName => {
      let t = buildTree(session, sName);
      if (sName === 'A2R') { const dropFAA = st.streamsInScope['A2R-FAA'] === false, dropIA = st.streamsInScope['A2R-IA'] === false; const isIA = n => /inventor/i.test(n.name), isFAA = n => /asset|fixed/i.test(n.name) && !isIA(n); const prune = (ns) => ns.filter(n => !((dropFAA && isFAA(n)) || (dropIA && isIA(n)))).map(n => ({ ...n, children: prune(n.children) })); t = prune(t); }
      return t;
    });
  }, [session.processes, inScope.join(), st.streamsInScope, mdOnly]);
  const leaves = useMemo(() => { const out = []; const walk = (n) => { if (n.activities.length) out.push(n); n.children.forEach(walk); }; tree.forEach(walk); return out; }, [tree]);
  const index = useMemo(() => indexAssessments(session), [session.assessments]);
  const node = leaves.find(n => n.id === ui.l3) || leaves[0];
  const stream = node ? node.stream : (inScope[0] || 'R2R');
  const picks = useQuickPicks(session, stream === 'MD' ? null : stream);
  // Collapse every stream root except the one holding the selected node.
  const [collapsed, setCollapsed] = useState(() => new Set());
  useEffect(() => { if (!node) return; setCollapsed(c => { const n = new Set(c); for (const r of tree) if (!r.parentId && !activitiesOf(r).some(p => p.parentId === node.id)) n.add(r.id); if (node) { let cur = session.processes[node.id]; while (cur) { n.delete(cur.id); cur = session.processes[cur.parentId]; } } return n; }); }, [tree, node?.id]);
  const toggleNode = (id) => setCollapsed(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const mode = ui.mode || (stream === 'R2R' ? 'walk' : 'exceptions');
  const commentRef = useRef();
  if (!node) return html`<div><${EmptyState} icon="info" title="Nothing to assess" text="Either every stream is out of scope (1 · Plan & prepare) or the imported files hold no activities." /></div>`;

  const acts = node.activities;
  const stats = nodeStats(session, acts, entityFilter, index);
  const keyOf = (e, p) => assessmentKey(e.code, p.id);
  const rowFlagged = (p) => entities.some(e => { const a = session.assessments[keyOf(e, p)]; if (!a || a.scope.outOfScope) return false; return !(a.asIs.gap === GAP.NO_GAP && (a.workshop.status === WORKSHOP_STATUS.NOT_ASSESSED || a.workshop.status === WORKSHOP_STATUS.CONFIRMED_FIT) && !a.workshop.changedAt) || a.workshop.status === WORKSHOP_STATUS.OPEN_QUESTION; });
  const rows = mode === 'exceptions' ? acts.filter(p => rowFlagged(p) || p.id === ui.expanded) : acts;
  const hidden = acts.length - rows.length;
  const expanded = ui.expanded && rows.find(p => p.id === ui.expanded) ? ui.expanded : null;
  const expandedEntity = ui.expandedEntity && entities.some(e => e.code === ui.expandedEntity) ? ui.expandedEntity : (entities[0] && entities[0].code);
  const selected = ui.selected && rows.find(p => p.id === ui.selected) ? ui.selected : (rows[0] && rows[0].id);
  const open = (pid, ecode) => setUi({ ...ui, expanded: ui.expanded === pid && ui.expandedEntity === ecode ? null : pid, expandedEntity: ecode, selected: pid });
  const bulk = () => { const keys = acts.flatMap(p => entities.map(e => keyOf(e, p))); let res; updateSession(s => { res = bulkConfirmNoGap(s, keys, s.processes); }); if (!res.count) { toast('No Ops NO GAP rows left to confirm'); return; } toast(`${res.count} activities confirmed as fit`, { actionLabel: 'Undo', onAction: () => { updateSession(s => undoBulk(s, res.bulkId)); toast('Bulk confirmation undone'); }, ttl: 8000 }); };
  const leaveCheck = (nextId) => { const incomplete = acts.flatMap(p => entities.map(e => session.assessments[keyOf(e, p)])).filter(a => a && !a.scope.outOfScope && a.workshop.changedAt && !completeness(a).complete).length; if (incomplete) toast(`${node.id}: ${incomplete} assessment${incomplete > 1 ? 's' : ''} with missing fields`); setUi({ ...ui, l3: nextId, expanded: null, selected: null }); };

  // Keyboard: ↑/↓ row, Enter expand + comment, 1–5 status, C confirm as fit, Esc collapse.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase(); if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const idx = rows.findIndex(p => p.id === selected);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = rows[Math.min(rows.length - 1, Math.max(0, idx + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) setUi({ ...ui, selected: n.id, expanded: ui.expanded ? n.id : null }); return; }
      if (e.key === 'Escape') { setUi({ ...ui, expanded: null }); return; }
      if (!selected) return;
      if (e.key === 'Enter') { e.preventDefault(); if (expanded === selected) { commentRef.current?.focus(); } else { setUi({ ...ui, expanded: selected, expandedEntity }); setTimeout(() => commentRef.current?.focus(), 50); } return; }
      const targets = expanded === selected && entityFilter === null && ui.expandedEntity ? [ui.expandedEntity] : entities.map(x => x.code);
      if (/^[1-5]$/.test(e.key)) { const status = STATUS_KEYS[Number(e.key) - 1]; updateSession(s => { for (const c of targets) applyChange(s, assessmentKey(c, selected), 'workshop.status', status); }); return; }
      if (e.key.toLowerCase() === 'c') { let n = 0; updateSession(s => { for (const c of targets) { const a = s.assessments[assessmentKey(c, selected)]; if (a && (a.asIs.gap === GAP.NO_GAP || effectiveGap(a) === GAP.NO_GAP) && confirmFit(s, a.key, s.processes[selected])) n++; } }); toast(n ? `Confirmed as fit (${n})` : 'Confirm as fit applies to Ops NO GAP rows'); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [rows, selected, expanded, expandedEntity, entities, ui]);

  const opsSummary = Object.entries(stats.ops).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${n} ${GAP_LABEL[g] || 'not assessed'}`).join(', ');
  const prevKeyFor = (p, ecode) => { const i = acts.findIndex(x => x.id === p.id); return i > 0 ? assessmentKey(ecode, acts[i - 1].id) : null; };
  const crumbsNode = [...(function up(n) { const out = []; let cur = session.processes[n.parentId]; while (cur) { out.unshift(cur); cur = session.processes[cur.parentId]; } return out; })(node)];

  return html`<div class="ws">
    <div class="ws-toolbar">
      <${Switch} checked=${mdOnly} onChange=${v => setUi({ ...ui, md: v, l3: null, expanded: null })}>Master data only</${Switch}>
      <span style="flex:1"></span>
      <select class="select sm" style="width:auto;align-self:center" value=${entityFilter || ''} onChange=${e => setUi({ ...ui, entity: e.target.value || null, expanded: null })}><option value="">All entities</option>${Object.values(session.entities).map(e => html`<option value=${e.code}>${e.displayName || e.name}</option>`)}</select>
      <div class="yn" style="align-self:center;margin-left:.5rem"><button aria-pressed=${mode === 'exceptions'} onClick=${() => setUi({ ...ui, mode: 'exceptions' })} style="font-family:var(--font-ui);padding:.22rem .6rem" title="Hide rows pre-assessed as NO GAP">Only flagged</button><button aria-pressed=${mode === 'walk'} onClick=${() => setUi({ ...ui, mode: 'walk' })} style="font-family:var(--font-ui);padding:.22rem .6rem">All rows</button></div>
    </div>
    <div class="ws-grid">
      <${TreePanel} tree=${tree} selectedId=${node.id} onSelect=${leaveCheck} session=${session} entityFilter=${entityFilter} collapsed=${collapsed} toggle=${toggleNode} index=${index} />
      <div style="min-width:0">
        <div class="card l3head"><div class="card-body" style="display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:center">
          <div><div class="eyebrow">${crumbsNode.map(c => c.id + ' ' + c.name).join(' › ') || stream}</div><h2 style="font-family:var(--font-serif);font-weight:500;font-size:1.3rem;margin:.15rem 0"><span class="pid mono muted" style="font-size:.85rem">${node.id}</span> ${node.name}</h2>
            <div class="muted small">${acts.length} activities${entityFilter ? '' : ` × ${entities.length} entities`} · pre-assessed by Ops as: ${opsSummary || '–'}${stats.outOfScope ? ` · ${stats.outOfScope} out of scope` : ''}</div>
            <div style="max-width:22rem;margin-top:.4rem"><${MiniBar} segments=${[{ key: 'DONE', value: stats.assessed }, { key: 'OPEN', value: stats.total - stats.assessed }]} pct=${`${stats.assessed}/${stats.total} assessed · ${stats.openGaps} open gaps`} /></div></div>
          <div style="display:flex;flex-direction:column;gap:.4rem;align-items:flex-end"><div class="sg-row" style="margin:0"><div class="yn"><button aria-pressed=${panel === 'none'} onClick=${() => choosePanel('none')} style="font-family:var(--font-ui);padding:.22rem .5rem">Table</button><button aria-pressed=${panel === 'swim'} onClick=${() => choosePanel('swim')} style="font-family:var(--font-ui);padding:.22rem .5rem">Flow board</button></div><${Button} variant="outline" size="sm" icon="share" onClick=${() => onPresent({ stream, entityFilter, l3: node.id })}>Present</${Button}><${Button} variant="primary" size="sm" disabled=${!stats.opsNoGap} onClick=${bulk} title="Marks every row the Ops team pre-assessed as NO GAP as confirmed fit – you can undo">Accept all "no gap" pre-assessments (${stats.opsNoGap})</${Button}></div><span class="muted small">${mode === 'exceptions' ? `${hidden} "no gap" row${hidden === 1 ? '' : 's'} hidden` : 'all rows shown'} · <a href="#" onClick=${e => { e.preventDefault(); setUi({ ...ui, mode: mode === 'exceptions' ? 'walk' : 'exceptions' }); }}>${mode === 'exceptions' ? 'show all rows' : 'show only flagged rows'}</a></span></div>
        </div></div>
        ${panel === 'swim' && html`<div class="card" style="margin-bottom:.75rem"><div class="card-body"><div class="sg-row" style="margin:0 0 .4rem">${entities.map(e => html`<${Chip} key=${e.code} active=${(ui.swimEntity || expandedEntity) === e.code} onClick=${() => setUi({ ...ui, swimEntity: e.code })}>${e.displayName || e.name}</${Chip}>`)}</div><${FlowBoard} session=${session} entityCode=${entities.some(e => e.code === ui.swimEntity) ? ui.swimEntity : expandedEntity} node=${node} activities=${acts} updateSession=${updateSession} toast=${toast} onAsk=${onAsk} onOpenRow=${pid => { setUi({ ...ui, mode: 'walk', expanded: pid, expandedEntity: entities.some(e => e.code === ui.swimEntity) ? ui.swimEntity : expandedEntity, selected: pid }); }} /></div></div>`}
        <table class="wtable sticky">
          <thead><tr><th style="width:30%">Activity</th>${entities.map(e => html`<th class="ent" key=${e.code}>${e.displayName || e.name}<small>${e.hasCode ? e.code : ''}</small></th>`)}</tr></thead>
          <tbody>
            ${rows.map(p => html`<tr class="act" key=${p.id} aria-selected=${p.id === selected} onClick=${() => setUi({ ...ui, selected: p.id })}>
              <td onClick=${e => { e.stopPropagation(); open(p.id, expandedEntity); }}><div class="pid">${p.id}</div><div class="aname">${p.name}</div><div class="ctx">To-Be: ${laneTags(p.toBe?.le, p.toBe?.gbs, false)}${p.toBe?.system && html` <span>· ${p.toBe.system}</span>`}</div></td>
              ${entities.map(e => html`<${EntityCell} key=${e.code} a=${session.assessments[keyOf(e, p)]} process=${p} open=${expanded === p.id && expandedEntity === e.code} onOpen=${() => open(p.id, e.code)} updateSession=${updateSession} onFit=${() => updateSession(s => confirmFit(s, keyOf(e, p), p))} onGap=${() => { updateSession(s => { const a = s.assessments[keyOf(e, p)]; if (!a.workshop.gapType) { const g = GAP_TYPES_WITH_DEVIATION.has(a.asIs.gap) ? a.asIs.gap : GAP.HARMONIZATION; applyChange(s, a.key, 'workshop.gapType', g); } if (a.workshop.status === WORKSHOP_STATUS.NOT_ASSESSED) applyChange(s, a.key, 'workshop.status', WORKSHOP_STATUS.GAP_CONFIRMED); }); setUi({ ...ui, expanded: p.id, expandedEntity: e.code, selected: p.id }); }} />`)}
            </tr>${expanded === p.id && session.assessments[assessmentKey(expandedEntity, p.id)] && html`<tr class="expand" key=${p.id + ':x'}><td colspan=${entities.length + 1}>
              ${entities.length > 1 && html`<div class="tabs" style="margin:0 1rem;padding-top:.4rem">${entities.map(e => html`<button class="tab" key=${e.code} aria-selected=${e.code === expandedEntity} onClick=${() => setUi({ ...ui, expandedEntity: e.code })}>${e.displayName || e.name}</button>`)}</div>`}
              <${ExpandedCell} session=${session} a=${session.assessments[assessmentKey(expandedEntity, p.id)]} process=${p} updateSession=${updateSession} picks=${picks} participants=${session.participants} prevKey=${prevKeyFor(p, expandedEntity)} toast=${toast} commentRef=${commentRef} onAsk=${onAsk} />
            </td></tr>`}`)}
            ${!rows.length && html`<tr><td colspan=${entities.length + 1}><div class="empty" style="border:0;padding:1.5rem"><h3>All ${acts.length} activities are Ops NO GAP and confirmed</h3><p>Nothing left to discuss in ${node.id}. Switch to "Walk all" to see every row.</p></div></td></tr>`}
          </tbody>
        </table>
        <div class="muted small" style="margin-top:.6rem">Click a cell to open it. Keys: <span class="mono">↑ ↓</span> row · <span class="mono">C</span> confirm as fit · <span class="mono">Enter</span> comment · <span class="mono">1–5</span> status (${STATUS_KEYS.map((s, i) => `${i + 1} ${WORKSHOP_STATUS_LABEL[s]}`).join(', ')}) · <span class="mono">Esc</span> close</div>
      </div>
    </div>
  </div>`;
}

/** Session control for the KPI strip: pick / start / end the active session and show the pace. */
function SessionBar({ session, updateSession, toast }) {
  const [, tickN] = useState(0);
  useEffect(() => { const t = setInterval(() => tickN(n => n + 1), 30000); return () => clearInterval(t); }, []);
  const pace = sessionPace(session);
  const ws = pace?.session;
  const label = (s) => `${fmtDateShort(s.date)} ${s.start || ''}${s.end ? '–' + s.end : ''} · ${s.stream}`;
  return html`<div class="sessionbar">
    <select class="select sm" style="width:auto" value=${session.activeSessionId || ''} onChange=${e => updateSession(s => { s.activeSessionId = e.target.value || null; })} title="Active session – every change is tagged with it"><option value="">No active session</option>${session.sessions.map(s => html`<option value=${s.id} key=${s.id}>${label(s)}</option>`)}</select>
    ${ws && !pace.running && html`<${Button} variant="primary" size="sm" onClick=${() => updateSession(s => { const x = s.sessions.find(y => y.id === ws.id); x.startedAt = new Date().toISOString(); x.endedAt = null; })}>Start</${Button}>`}
    ${ws && pace.running && html`<span class="pace" title="elapsed / planned minutes · activities left · required pace"><b class="num">${pace.elapsed}${pace.planned !== null ? `/${pace.planned}` : ''}</b> min · <b class="num">${pace.remaining}</b> left${pace.secPerActivity !== null ? html` · <b class="num">${pace.secPerActivity}</b> s/act` : ''}</span><${Button} variant="outline" size="sm" onClick=${() => { updateSession(s => { const x = s.sessions.find(y => y.id === ws.id); x.endedAt = new Date().toISOString(); }); toast('Session ended – download a JSON backup now', { actionLabel: 'Download backup', onAction: () => downloadSessionJson(session), ttl: 15000 }); }}>End</${Button}>`}
    ${!session.activeSessionId && html`<span class="muted small" title="Changes are stored without a session tag">no session tag</span>`}
  </div>`;
}
function fmtDateShort(d) { if (!d) return ''; const [, m, dd] = d.split('-'); return `${dd}.${m}.`; }
