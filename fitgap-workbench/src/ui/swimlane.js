// Entity swimlane: lanes Local Accounting | Other | GBS, L4 activities as
// numbered step columns, placed where the workshop result says they are
// performed (fallback Ops as-is, then To-Be). Rendered as SVG, exportable as PNG.

const LANES = [['LOCAL', 'Local Accounting'], ['OTHER', 'Other'], ['GBS', 'GBS']];
function placement(a, p) {
  const tb = p?.toBe || {};
  let lanes, source;
  if (fitGapComplete(a)) { lanes = [a.fitGap.local && 'LOCAL', a.fitGap.other && 'OTHER', a.fitGap.gbs && 'GBS'].filter(Boolean); source = 'workshop'; }
  else if (a.asIs.le !== null || a.asIs.gbs !== null) { lanes = [a.asIs.le === true && 'LOCAL', a.asIs.gbs === true && 'GBS'].filter(Boolean); source = 'ops'; }
  else { lanes = [tb.le === true && 'LOCAL', tb.gbs === true && 'GBS'].filter(Boolean); source = 'tobe'; }
  const toBe = [tb.le === true && 'LOCAL', tb.gbs === true && 'GBS'].filter(Boolean);
  const ops = [a.asIs.le === true && 'LOCAL', a.asIs.gbs === true && 'GBS'].filter(Boolean);
  return { lanes, source, toBe, ops, differsToBe: toBe.length > 0 && lanes.length > 0 && toBe.join() !== lanes.join(), differsOps: source === 'workshop' && ops.length > 0 && ops.join() !== lanes.join() };
}

function swimlaneModel(session, entityCode, activities) {
  const steps = activities.map((p, i) => { const a = session.assessments[assessmentKey(entityCode, p.id)]; if (!a || a.scope.outOfScope) return null; return { i, p, a, ...placement(a, p), gap: effectiveGap(a) }; }).filter(Boolean);
  let handoffs = 0; for (let i = 1; i < steps.length; i++) if (steps[i].lanes[0] && steps[i - 1].lanes[0] && steps[i].lanes[0] !== steps[i - 1].lanes[0]) handoffs++;
  return { steps, handoffs };
}

const GAP_COLOR_VAR = { NO_GAP: '--g-none', HARMONIZATION: '--g-harm', STANDARDIZATION: '--g-std', BOTH: '--g-both', NA: '--g-na', UNCLEAR: '--g-unclear' };
function cssVar(name, el) { return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim() || '#999'; }

function Swimlane({ session, entityCode, node, activities, large }) {
  const ref = useRef();
  const { steps, handoffs } = useMemo(() => swimlaneModel(session, entityCode, activities), [session.assessments, entityCode, activities]);
  const colW = large ? 150 : 118, rowH = large ? 86 : 70, laneLabel = large ? 150 : 120, headH = 30, pad = 8;
  const W = laneLabel + Math.max(1, steps.length) * colW + pad, H = headH + LANES.length * rowH + 26;
  const vars = useMemo(() => { const el = document.documentElement; const o = {}; for (const [k, v] of Object.entries(GAP_COLOR_VAR)) o[k] = cssVar(v, el); o.ink = cssVar('--ink', el); o.ink2 = cssVar('--ink-2', el); o.line = cssVar('--line', el); o.panel = cssVar('--panel', el); o.bg = cssVar('--bg', el); o.accent = cssVar('--accent', el); o.flag = cssVar('--flag', el); o.LOCAL = cssVar('--local', el); o.GBS = cssVar('--gbs', el); o.OTHER = cssVar('--coe', el); return o; }, [document.documentElement.getAttribute('data-theme')]);
  const laneY = (k) => headH + LANES.findIndex(l => l[0] === k) * rowH;
  const exportPng = () => {
    const svg = ref.current; const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image(); const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => { const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.fillStyle = vars.panel; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url); c.toBlob(b => downloadBlob(`${(session.entities[entityCode]?.displayName || entityCode).replace(/\W+/g, '_')}_${node.id.replace(/\W+/g, '_')}_swimlane.png`, b)); };
    img.src = url;
  };
  const ent = session.entities[entityCode];
  return html`<div class="swim">
    <div class="sg-row" style="justify-content:space-between;margin:0 0 .4rem"><span class="eyebrow">Entity swimlane · ${ent?.displayName || entityCode} · ${node.id}</span><span class="sg-row" style="margin:0"><span class="muted small">${handoffs} hand-off${handoffs === 1 ? '' : 's'} · responsibility view, not a BPMN replacement</span><${Button} variant="text" size="sm" onClick=${exportPng}>PNG</${Button}></span></div>
    <div style="overflow:auto"><svg ref=${ref} xmlns="http://www.w3.org/2000/svg" width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} style=${`font-family: 'Instrument Sans Variable', system-ui, sans-serif; font-size: ${large ? 12 : 10.5}px; display:block; min-width:${W}px`}>
      <rect x="0" y="0" width=${W} height=${H} fill=${vars.panel} />
      ${steps.map(s => html`<text key=${'h' + s.i} x=${laneLabel + s.i * colW + colW / 2} y=${headH - 10} text-anchor="middle" fill=${vars.ink2} font-family="IBM Plex Mono, monospace" font-size="10">${String(s.i + 1).padStart(2, '0')}</text>`)}
      ${LANES.map(([k, label], li) => html`<g key=${k}>
        <rect x="0" y=${headH + li * rowH} width=${W} height=${rowH} fill=${li % 2 ? vars.bg : 'transparent'} stroke=${vars.line} />
        <rect x="0" y=${headH + li * rowH} width="4" height=${rowH} fill=${vars[k]} />
        <text x="12" y=${headH + li * rowH + 20} fill=${vars.ink} font-weight="600">${label}</text>
        <text x="12" y=${headH + li * rowH + 36} fill=${vars.ink2} font-size="9.5">${steps.filter(s => s.lanes.includes(k)).length} steps</text>
      </g>`)}
      ${steps.map(s => { const x = laneLabel + s.i * colW + 6; const w = colW - 12; const color = vars[s.gap] || vars.line;
        return html`<g key=${s.p.id}>
          ${LANES.map(([k]) => !s.lanes.includes(k) ? html`<rect key=${k} x=${x} y=${laneY(k) + 6} width=${w} height=${rowH - 12} fill="none" stroke=${vars.line} stroke-dasharray="2 3" opacity=".6" />` : null)}
          ${s.lanes.map((k, idx) => html`<g key=${k}>
            <rect x=${x} y=${laneY(k) + 6} width=${w} height=${rowH - 12} rx="4" fill=${vars.panel} stroke=${vars.line} />
            <rect x=${x} y=${laneY(k) + 6} width=${w} height="3" fill=${color} />
            <text x=${x + 6} y=${laneY(k) + 22} fill=${vars.ink2} font-family="IBM Plex Mono, monospace" font-size="9">${s.p.id.replace(/^\w+\s/, '')}${s.lanes.length > 1 ? ` · ${idx + 1}/${s.lanes.length}` : ''}</text>
            <text x=${x + 6} y=${laneY(k) + 36} fill=${vars.ink}>${(s.p.name || '').slice(0, large ? 24 : 18)}${(s.p.name || '').length > (large ? 24 : 18) ? '…' : ''}</text>
            <text x=${x + 6} y=${laneY(k) + rowH - 14} fill=${color} font-size="8.5" font-weight="600">${(GAP_LABEL[s.gap] || (s.source === 'tobe' ? 'TO-BE' : s.source === 'ops' ? 'OPS AS-IS' : '')).slice(0, 16)}</text>
          </g>`)}
          ${s.differsToBe && s.toBe[0] && s.lanes[0] && s.toBe[0] !== s.lanes[0] && html`<line x1=${x + w - 10} y1=${laneY(s.toBe[0]) + rowH / 2} x2=${x + w - 10} y2=${laneY(s.lanes[0]) + (laneY(s.lanes[0]) > laneY(s.toBe[0]) ? 8 : rowH - 8)} stroke=${vars.flag} stroke-width="1.5" stroke-dasharray="3 2" marker-end="url(#arrow)" />`}
          ${s.differsOps && html`<circle cx=${x + w - 8} cy=${laneY(s.lanes[0]) + 12} r="3" fill=${vars.accent}><title>differs from Ops as-is</title></circle>`}
        </g>`; })}
      <defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill=${vars.flag} /></marker></defs>
      <text x="12" y=${H - 8} fill=${vars.ink2} font-size="9">Top border = gap type · dashed arrow = placed in a different lane than To-Be · dot = differs from Ops as-is · split card = performed in two lanes</text>
    </svg></div>
  </div>`;
}
