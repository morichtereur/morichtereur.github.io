// Process-flow images: extraction hook for the import queue, viewer with
// zoom / pan / fullscreen, manual reassignment of images to process nodes.

async function extractFlowsForImport(buffer, wb, parsed, processes) {
  if (!parsed.flowSheets?.length) return [];
  const zip = await JSZip.loadAsync(buffer);
  const grids = Object.fromEntries(parsed.flowSheets.map(n => [n, sheetToGrid(wb.Sheets[n], XLSX)]));
  const stream = Object.keys(parsed.summary.streams)[0] || null;
  return extractFlows(zip, parsed.flowSheets, grids, processes, { stream, fileName: parsed.fileName });
}

/** Flow for a node: the node itself or the nearest ancestor with an image. */
function flowForNode(session, nodeId) {
  let cur = session.processes[nodeId];
  while (cur) { const f = session.flows.find(x => x.nodeId === cur.id); if (f) return f; cur = session.processes[cur.parentId]; }
  return null;
}
function flowsByNode(session) { const m = {}; for (const f of session.flows) if (f.nodeId) m[f.nodeId] = f; return m; }

function FlowViewer({ session, node, updateSession, toast, compact }) {
  const flow = flowForNode(session, node.id);
  const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 }); const drag = useRef(null); const dlg = useRef();
  const [assign, setAssign] = useState(false);
  const candidates = session.flows.filter(f => !f.nodeId || f.nodeId === node.id || (session.processes[f.nodeId]?.stream === node.stream));
  const nodes = Object.values(session.processes).filter(p => p.level >= 1 && p.level <= 3 && p.stream === node.stream).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const onWheel = (e) => { e.preventDefault(); setZoom(z => Math.min(6, Math.max(0.3, z * (e.deltaY < 0 ? 1.15 : 0.87)))); };
  const onDown = (e) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; };
  const onMove = (e) => { if (drag.current) setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); };
  const onUp = () => { drag.current = null; };
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const img = (h) => flow ? html`<div class="flow-stage" style=${`height:${h}`} onWheel=${onWheel} onMouseDown=${onDown} onMouseMove=${onMove} onMouseUp=${onUp} onMouseLeave=${onUp}><img src=${flow.dataUrl} alt=${flow.label || 'process flow'} draggable="false" style=${`transform:translate(${pan.x}px,${pan.y}px) scale(${zoom});transform-origin:center`} /></div>` : null;
  const reassignUi = html`<div class="sg-row" style="margin:.4rem 0 0">
    <select class="select sm" style="width:auto" onChange=${e => { const id = e.target.value; if (!id) return; updateSession(s => { const f = s.flows.find(x => x.id === id); if (f) f.nodeId = node.id; }); toast('Flow image assigned'); setAssign(false); }}><option value="">Assign an image to ${node.id}…</option>${candidates.map(f => html`<option value=${f.id} key=${f.id}>${f.file} · ${f.sheet} row ${f.row}${f.label ? ' · ' + f.label : ''}${f.nodeId ? ' → ' + f.nodeId : ' (unassigned)'}</option>`)}</select>
    ${flow && html`<select class="select sm" style="width:auto" value=${flow.nodeId || ''} onChange=${e => { updateSession(s => { const f = s.flows.find(x => x.id === flow.id); if (f) f.nodeId = e.target.value || null; }); }}><option value="">– unassign –</option>${nodes.map(p => html`<option value=${p.id} key=${p.id}>${p.id} ${p.name}</option>`)}</select>`}
  </div>`;
  return html`<div class="flow">
    <div class="sg-row" style="justify-content:space-between;margin:0 0 .4rem"><span class="eyebrow">Process flow · ${flow ? `${flow.label || flow.sheet}${flow.nodeId !== node.id ? ` (from ${flow.nodeId})` : ''}` : 'no image'}</span>
      <span class="sg-row" style="margin:0;gap:.2rem">${flow && html`<${IconButton} icon="search" label="Reset zoom" onClick=${reset} /><${IconButton} icon="share" label="Fullscreen" onClick=${() => dlg.current?.showModal()} />`}<${Button} variant="text" size="sm" onClick=${() => setAssign(!assign)}>${flow ? 'Reassign' : 'Assign image'}</${Button}></span></div>
    ${flow ? img(compact ? '16rem' : '24rem') : html`<div class="empty" style="padding:1.2rem"><p style="margin:0">No flow image mapped to ${node.id}. ${session.flows.length ? `${session.flows.filter(f => !f.nodeId).length} unassigned image(s) available.` : 'Flow sheets are read on import ("Process Flows_*").'}</p></div>`}
    ${assign && reassignUi}
    ${flow && html`<dialog ref=${dlg} class="flow-full" onClick=${e => e.target === dlg.current && dlg.current.close()}><div class="dlg-body" style="padding:.75rem"><div class="sg-row" style="justify-content:space-between;margin:0 0 .4rem"><b>${node.id} ${node.name}</b><${IconButton} icon="x" label="Close" onClick=${() => dlg.current.close()} /></div>${img('80vh')}<div class="muted small">Wheel = zoom · drag = pan · Esc = close</div></div></dialog>`}
  </div>`;
}
