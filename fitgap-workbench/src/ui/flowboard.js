// Process flow board (Splitfold pattern): lanes as rows with icon + name + step
// count, steps as numbered columns, step cards with a coloured top border by lane
// and a tag, hatched empty cells, hand-off markers, legend footer with keyboard
// hints, right detail panel for the selected activity. HTML/CSS grid, no library.

const BOARD_LANES = [['LOCAL', 'Local Accounting', 'local', 'home'], ['OTHER', 'Other party', 'coe', 'users'], ['GBS', 'GBS', 'gbs', 'globe']];
const CONTROL_RX = /approv|review|validat|reconcil|check|monitor|verif|control|confirm|audit/i;
const stepTag = (p) => CONTROL_RX.test(p.name || '') ? '◆ CONTROL' : '● CORE';

function FlowBoard({ session, entityCode, node, activities, updateSession, toast, readOnly, onOpenRow, large }) {
  const { steps, handoffs } = useMemo(() => swimlaneModel(session, entityCode, activities), [session.assessments, entityCode, activities]);
  const [sel, setSel] = useState(null);
  const selected = steps.find(s => s.p.id === sel) || null;
  const ent = session.entities[entityCode];
  const svgRef = useRef();
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e) => { if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return; if (!steps.length) return; const i = steps.findIndex(s => s.p.id === sel); if (e.key === 'ArrowRight' && e.shiftKey === false && e.altKey === false && document.activeElement?.closest('.board-wrap')) { e.preventDefault(); setSel(steps[Math.min(steps.length - 1, i + 1)].p.id); } if (e.key === 'ArrowLeft' && document.activeElement?.closest('.board-wrap')) { e.preventDefault(); setSel(steps[Math.max(0, i - 1)].p.id); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [steps, sel, readOnly]);
  const exportPng = () => { const b = svgRef.current?.querySelector('.swim .btn-text'); if (b) b.click(); };
  const laneCount = (k) => steps.filter(s => s.lanes.includes(k)).length;
  const cols = `11rem repeat(${Math.max(1, steps.length)}, ${large ? 12 : 9.5}rem)`;
  const card = (s, k, idx) => {
    const prev = steps[s.i - 1]; const handoff = prev && prev.lanes[0] && s.lanes[0] && prev.lanes[0] !== s.lanes[0] && k === s.lanes[0];
    const toBeLane = s.toBe[0]; const mismatch = s.differsToBe && toBeLane && toBeLane !== k;
    return html`<button class=${`stepcard${s.lanes.length > 1 ? ' split' : ''}${sel === s.p.id ? ' sel' : ''}`} style=${`--lane-color:var(--${BOARD_LANES.find(l => l[0] === k)[2]})`} onClick=${() => !readOnly && setSel(sel === s.p.id ? null : s.p.id)} onDblClick=${() => onOpenRow && onOpenRow(s.p.id)} title=${`${s.p.id} ${s.p.name}`}>
      <div class="tg">${stepTag(s.p)}${s.lanes.length > 1 ? ` · ${idx + 1}/${s.lanes.length}` : ''}</div>
      <div class="nm">${s.p.name}</div>
      <div class="meta"><${GapPill} value=${s.gap || (s.source === 'tobe' ? 'NOT_ASSESSED' : 'NOT_ASSESSED')} size="sm" />${s.source !== 'workshop' && html`<span class="src">${s.source === 'ops' ? 'Ops as-is' : 'To-Be'}</span>`}</div>
      ${handoff && html`<div class="handoff">↳ hand-off from ${BOARD_LANES.find(l => l[0] === prev.lanes[0])?.[1]}</div>`}
      ${mismatch && html`<div class="handoff" style="color:var(--flag)">⚑ To-Be: ${BOARD_LANES.find(l => l[0] === toBeLane)?.[1]}</div>`}
      ${s.differsOps && html`<div class="handoff" style="color:var(--accent)">● differs from Ops as-is</div>`}
    </button>`;
  };
  const a = selected?.a; const set = (path, v) => updateSession(s => applyChange(s, a.key, path, v));
  return html`<div class=${`board-wrap${selected && !readOnly ? ' with-detail' : ''}`} tabindex="0">
    <div>
      <div class="sg-row" style="justify-content:space-between;margin:0 0 .4rem"><span class="eyebrow">Process flow · ${ent?.displayName || entityCode} · ${node.id} ${node.name}</span><span class="sg-row" style="margin:0;gap:.6rem"><span class="muted small">${steps.length} steps · ${handoffs} hand-off${handoffs === 1 ? '' : 's'}</span>${!readOnly && html`<${Button} variant="text" size="sm" onClick=${exportPng}>PNG</${Button}>`}</span></div>
      <div class="board">
        <div class="board-grid" style=${`grid-template-columns:${cols}`}>
          <div class="board-h lane-h"><b>Lane</b><small>${handoffs} hand-offs</small></div>
          ${steps.map(s => html`<div class="board-h step-h" key=${'h' + s.p.id}>${String(s.i + 1).padStart(2, '0')}</div>`)}
          ${BOARD_LANES.map(([k, label, color, icon]) => html`<${Fragment} key=${k}>
            <div class="board-lane" style=${`--lane-color:var(--${color})`}><span class="lane-ico"><${Icon} name=${icon} size=${15} /></span><div><b>${label}</b><small>${laneCount(k)} step${laneCount(k) === 1 ? '' : 's'}</small></div></div>
            ${steps.map(s => s.lanes.includes(k) ? html`<div class="board-cell" key=${s.p.id + k}>${card(s, k, s.lanes.indexOf(k))}</div>` : html`<div class="board-cell hatch" key=${s.p.id + k}></div>`)}
          </${Fragment}>`)}
        </div>
      </div>
      <div class="board-legend">${BOARD_LANES.map(([k, label, color]) => html`<span key=${k}><i style=${`background:var(--${color})`}></i>${label}</span>`)}<span>● CORE / ◆ CONTROL = activity type</span><span>↳ hand-off between lanes</span><span style="color:var(--flag)">⚑ placed in a different lane than To-Be</span><span>split card = performed in two lanes</span>${!readOnly && html`<span class="mono">← → select step · double-click = open row</span>`}</div>
      <div style="position:absolute;left:-9999px;top:0" ref=${svgRef} aria-hidden="true"><${Swimlane} session=${session} entityCode=${entityCode} node=${node} activities=${activities} /></div>
    </div>
    ${selected && !readOnly && html`<aside class="board-detail">
      <div class="eyebrow">Selected activity</div>
      <div class="mono small muted">${a.processId}</div><h3 style="margin:.1rem 0 .4rem">${selected.p.name}</h3>
      ${selected.p.description && html`<p class="small muted">${selected.p.description}</p>`}
      <dl class="kv"><dt>To-Be</dt><dd>${selected.toBe.map(l => html`<${Tag} kind=${l} key=${l} />`)}${!selected.toBe.length && '–'} ${selected.p.toBe?.system && html`<span class="muted small">· ${selected.p.toBe.system}</span>`}</dd><dt>Ops as-is</dt><dd>${selected.ops.map(l => html`<${Tag} kind=${l} key=${l} />`)}${!selected.ops.length && '–'}</dd><dt>Workshop</dt><dd>${selected.source === 'workshop' ? selected.lanes.map(l => html`<${Tag} kind=${l} key=${l} />`) : html`<span class="muted">not yet assessed</span>`}</dd></dl>
      <div class="fgrid" style="grid-template-columns:1fr;margin-top:.6rem">
        <${Field} label="Who performs it today?"><div class="sg-row" style="margin:0;gap:.5rem"><span class="small">Local</span><${YN} size="sm" value=${a.fitGap.local} onChange=${v => set('fitGap.local', v)} name="Local" /><span class="small">GBS</span><${YN} size="sm" value=${a.fitGap.gbs} onChange=${v => set('fitGap.gbs', v)} name="GBS" /><span class="small">Other</span><${YN} size="sm" value=${a.fitGap.other} onChange=${v => set('fitGap.other', v)} name="Other" /></div></${Field}>
        <${Field} label="Gap type"><select class="select sm" value=${a.workshop.gapType || ''} onChange=${e => set('workshop.gapType', e.target.value || null)}><option value="">${a.asIs.gap ? `(Ops: ${GAP_LABEL[a.asIs.gap]})` : '– choose –'}</option>${['NO_GAP', 'HARMONIZATION', 'STANDARDIZATION', 'BOTH', 'NA'].map(g => html`<option value=${g}>${GAP_LABEL[g]}</option>`)}</select></${Field}>
        <${Field} label="Why?"><${TextInput} class="sm" value=${a.workshop.rationale} onCommit=${v => set('workshop.rationale', v)} placeholder="Short reason" /></${Field}>
        <${Field} label="Status"><select class="select sm" value=${a.workshop.status} onChange=${e => set('workshop.status', e.target.value)}><option value="NOT_ASSESSED">Not assessed</option>${Object.keys(WORKSHOP_STATUS_LABEL).filter(k => k !== 'NOT_ASSESSED').map(k => html`<option value=${k}>${WORKSHOP_STATUS_LABEL[k]}</option>`)}</select></${Field}>
      </div>
      <div class="sg-row" style="margin-top:.6rem">${a.workshop.status !== WORKSHOP_STATUS.CONFIRMED_FIT && html`<${Button} variant="primary" size="sm" onClick=${() => { updateSession(s => confirmFit(s, a.key, selected.p)); toast('Confirmed as fit'); }}>✓ Fit</${Button}>`}<${Button} variant="outline" size="sm" onClick=${() => onOpenRow && onOpenRow(a.processId)}>Open full form</${Button}><${IconButton} icon="x" label="Close" onClick=${() => setSel(null)} /></div>
      ${!completeness(a).complete && !a.scope.outOfScope && html`<div class="missing" style="margin-top:.6rem"><b>Missing:</b> ${completeness(a).missing.join(' · ')}</div>`}
    </aside>`}
  </div>`;
}
